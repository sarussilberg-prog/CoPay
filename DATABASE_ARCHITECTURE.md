# Database Architecture - Splitwise-like Expense Sharing App

**Technology:** PostgreSQL with Supabase  
**Last Updated:** 2026-05-25  
**Status:** Implemented — Supabase-only (no NestJS API)  
**Environments:** [`docs/SSOT/SUPABASE_ENVIRONMENTS.md`](docs/SSOT/SUPABASE_ENVIRONMENTS.md) — `dev` branch → dev project, `main` → production  
**Canonical schema (apply this):** [`cost-share-app/supabase/schema.sql`](cost-share-app/supabase/schema.sql)  
**In-place RLS patch:** [`cost-share-app/supabase/fix-rls-group-members-recursion.sql`](cost-share-app/supabase/fix-rls-group-members-recursion.sql)

> This document is a **reference**. When it disagrees with `schema.sql`, the SQL file wins.

---

## Table of Contents
1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Core Tables](#core-tables)
4. [Database Views](#database-views)
5. [SQL Schema](#sql-schema)
6. [Key Design Decisions](#key-design-decisions)
7. [Implementation Guide](#implementation-guide)
8. [Common Queries](#common-queries)

---

## Overview

This database architecture supports a Splitwise-like expense sharing application with the following capabilities:

- **User Management**: Integrated with Supabase Auth (Google, Apple, Phone)
- **Group Management**: Create and manage expense-sharing groups
- **Expense Tracking**: Record expenses with flexible splitting
- **Settlement Tracking**: Record debt payments between users
- **Balance Calculation**: Calculate who owes whom (computed on-the-fly)

### Core Principles
- **Simplicity**: Clean, normalized design without over-engineering
- **Scalability**: Designed to handle growth without major refactoring
- **Data Integrity**: Foreign keys, constraints, and soft deletes
- **Supabase Integration**: Leverages Supabase Auth for authentication

---

## Entity Relationship Diagram

```
┌─────────────────┐
│  auth.users     │ (Supabase managed)
│  (Supabase)     │
└────────┬────────┘
         │
         │ 1:1
         │
┌────────▼────────┐
│   profiles      │
│─────────────────│
│ id (PK, FK)     │
│ name            │
│ avatar_url      │
│ phone           │
│ default_currency│
│ language        │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼────────┐         ┌─────────────────┐
│    groups       │◄────────┤  group_members  │
│─────────────────│  N:M    │─────────────────│
│ id (PK)         │         │ id (PK)         │
│ name            │         │ group_id (FK)   │
│ description     │         │ user_id (FK)    │
│ image_url       │         │ joined_at       │
│ group_type      │         │ left_at         │
│ default_currency│         │ is_active       │
│ created_by (FK) │         └─────────────────┘
│ is_active       │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼────────┐         ┌─────────────────┐
│   expenses      │◄────────┤ expense_splits  │
│─────────────────│  1:N    │─────────────────│
│ id (PK)         │         │ id (PK)         │
│ group_id (FK)   │         │ expense_id (FK) │
│ description     │         │ user_id (FK)    │
│ amount          │         │ amount          │
│ currency        │         │ created_at      │
│ category        │         └─────────────────┘
│ expense_date    │
│ receipt_url     │
│ paid_by (FK)    │
│ created_by (FK) │
│ is_deleted      │
│ created_at      │
│ updated_at      │
└─────────────────┘

┌─────────────────┐
│  settlements    │
│─────────────────│
│ id (PK)         │
│ group_id (FK)   │
│ from_user_id(FK)│
│ to_user_id (FK) │
│ amount          │
│ currency        │
│ settlement_date │
│ payment_method  │
│ created_by (FK) │
│ created_at      │
└─────────────────┘
```

---

## Core Tables

### 1. profiles

Stores user profile information. Integrates with Supabase Auth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, REFERENCES auth.users(id) | User ID from Supabase Auth |
| name | VARCHAR(100) | NOT NULL | Display name |
| email | VARCHAR(255) | | User email (synced from auth.users) |
| avatar_url | TEXT | | Profile picture URL |
| phone | VARCHAR(20) | | Phone number (for display) |
| default_currency | VARCHAR(3) | DEFAULT 'USD' | Preferred currency |
| language | VARCHAR(5) | DEFAULT 'en' | Preferred language (en, he) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Profile creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`

**Notes:**
- `id` references Supabase's `auth.users` table
- Email, password, and authentication handled by Supabase
- Profile created automatically on first login via trigger

---

### 2. groups

Represents expense-sharing groups (trips, roommates, etc.)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique group identifier |
| name | VARCHAR(100) | NOT NULL | Group name |
| description | TEXT | | Optional description |
| image_url | TEXT | | Group image URL |
| group_type | VARCHAR(50) | DEFAULT 'general' | Category: 'trip', 'home', 'couple', 'other' |
| default_currency | VARCHAR(3) | DEFAULT 'USD' | Default currency for group |
| created_by | UUID | NOT NULL, REFERENCES profiles(id) | Creator user ID |
| is_active | BOOLEAN | DEFAULT TRUE | Soft delete flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `created_by`
- Index on `is_active`

**Notes:**
- `is_active = FALSE` for soft-deleted groups
- `created_by` identifies the group creator

---

### 3. group_members

Junction table for many-to-many relationship between users and groups.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique membership ID |
| group_id | UUID | NOT NULL, REFERENCES groups(id) ON DELETE CASCADE | Group reference |
| user_id | UUID | NOT NULL, REFERENCES profiles(id) ON DELETE CASCADE | User reference |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() | When user joined |
| left_at | TIMESTAMPTZ | | When user left (NULL if active) |
| is_active | BOOLEAN | DEFAULT TRUE | Current membership status |

**Constraints:**
- UNIQUE(group_id, user_id) - Prevents duplicate memberships

**Indexes:**
- Primary key on `id`
- Index on `group_id`
- Index on `user_id`
- Composite index on `(group_id, is_active)`

**Notes:**
- `is_active = FALSE` when user leaves group
- `left_at` timestamp records when they left
- Historical data preserved for audit trail

---

### 4. expenses

Core table for tracking expenses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique expense ID |
| group_id | UUID | NOT NULL, REFERENCES groups(id) ON DELETE CASCADE | Group reference |
| description | VARCHAR(255) | NOT NULL | Expense description |
| amount | DECIMAL(12,2) | NOT NULL, CHECK (amount > 0) | Total expense amount |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | Currency code |
| category | VARCHAR(50) | | Category (food, transport, etc.) |
| expense_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | When expense occurred |
| receipt_url | TEXT | | Receipt image URL |
| paid_by | UUID | NOT NULL, REFERENCES profiles(id) | Who paid the expense |
| created_by | UUID | NOT NULL, REFERENCES profiles(id) | Who recorded the expense |
| is_deleted | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `group_id`
- Index on `paid_by`
- Index on `created_by`
- Index on `expense_date`
- Index on `category`
- Composite index on `(group_id, is_deleted)`

**Notes:**
- `DECIMAL(12,2)` ensures precise monetary calculations
- `paid_by` is the single person who paid
- `created_by` may differ from `paid_by` (someone else can record)
- `is_deleted = TRUE` for soft-deleted expenses

---

### 5. expense_splits

Defines how an expense is split among participants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique split ID |
| expense_id | UUID | NOT NULL, REFERENCES expenses(id) ON DELETE CASCADE | Expense reference |
| user_id | UUID | NOT NULL, REFERENCES profiles(id) | Who owes this amount |
| amount | DECIMAL(12,2) | NOT NULL, CHECK (amount >= 0) | Amount owed by this user |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Constraints:**
- UNIQUE(expense_id, user_id) - Each user appears once per expense

**Indexes:**
- Primary key on `id`
- Index on `expense_id`
- Index on `user_id`

**Notes:**
- Sum of all `amount` for an expense must equal `expenses.amount`
- The person who paid (`paid_by`) is also included in splits
- For equal split: divide total by number of participants
- For unequal split: specify exact amounts

**Example:**
```
Expense: $100 dinner, User A paid, split equally among A, B, C
- expense_splits: (expense_id=1, user_id=A, amount=33.33)
- expense_splits: (expense_id=1, user_id=B, amount=33.33)
- expense_splits: (expense_id=1, user_id=C, amount=33.34)
```

---

### 6. settlements

Records debt payments between users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique settlement ID |
| group_id | UUID | NOT NULL, REFERENCES groups(id) ON DELETE CASCADE | Group reference |
| from_user_id | UUID | NOT NULL, REFERENCES profiles(id) | Who is paying |
| to_user_id | UUID | NOT NULL, REFERENCES profiles(id) | Who receives payment |
| amount | DECIMAL(12,2) | NOT NULL, CHECK (amount > 0) | Payment amount |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | Currency code |
| settlement_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | When payment occurred |
| payment_method | VARCHAR(50) | | Method: 'cash', 'bank_transfer', etc. |
| created_by | UUID | NOT NULL, REFERENCES profiles(id) | Who recorded this |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- Primary key on `id`
- Index on `group_id`
- Index on `from_user_id`
- Index on `to_user_id`
- Index on `settlement_date`

**Notes:**
- Settlements are NOT expenses - they're debt payments
- Reduces the balance between two users
- Immutable once created (no updates, only new settlements)

**Example:**
```
User B owes User A $50, B pays A:
- from_user_id=B, to_user_id=A, amount=50
This reduces B's debt to A by $50
```

---

## Database Views

Views are virtual tables that simplify complex queries. They're calculated on-the-fly.

### 1. user_balances_view

Calculates net balances between users in each group.

```sql
CREATE VIEW user_balances_view AS
SELECT 
    e.group_id,
    es.user_id,
    e.currency,
    -- What user paid
    COALESCE(SUM(CASE WHEN e.paid_by = es.user_id THEN e.amount ELSE 0 END), 0) AS total_paid,
    -- What user owes
    COALESCE(SUM(es.amount), 0) AS total_owed,
    -- Settlements paid by user
    COALESCE((SELECT SUM(s.amount) FROM settlements s 
              WHERE s.from_user_id = es.user_id 
              AND s.group_id = e.group_id 
              AND s.currency = e.currency), 0) AS total_settled_paid,
    -- Settlements received by user
    COALESCE((SELECT SUM(s.amount) FROM settlements s 
              WHERE s.to_user_id = es.user_id 
              AND s.group_id = e.group_id 
              AND s.currency = e.currency), 0) AS total_settled_received,
    -- Net balance (positive = owed to user, negative = user owes)
    (COALESCE(SUM(CASE WHEN e.paid_by = es.user_id THEN e.amount ELSE 0 END), 0) 
     - COALESCE(SUM(es.amount), 0)
     + COALESCE((SELECT SUM(s.amount) FROM settlements s 
                 WHERE s.to_user_id = es.user_id 
                 AND s.group_id = e.group_id 
                 AND s.currency = e.currency), 0)
     - COALESCE((SELECT SUM(s.amount) FROM settlements s 
                 WHERE s.from_user_id = es.user_id 
                 AND s.group_id = e.group_id 
                 AND s.currency = e.currency), 0)) AS net_balance
FROM expenses e
JOIN expense_splits es ON e.id = es.expense_id
WHERE e.is_deleted = FALSE
GROUP BY e.group_id, es.user_id, e.currency;
```

**Usage:**
```sql
-- Get user's balance in a specific group
SELECT * FROM user_balances_view 
WHERE group_id = 'xxx' AND user_id = 'yyy';

-- Get all users with positive balance (owed money)
SELECT * FROM user_balances_view 
WHERE net_balance > 0;
```

---

### 2. group_summary_view

Provides summary statistics for each group.

```sql
CREATE VIEW group_summary_view AS
SELECT 
    g.id AS group_id,
    g.name,
    g.group_type,
    g.default_currency,
    COUNT(DISTINCT gm.user_id) AS member_count,
    COUNT(DISTINCT e.id) AS expense_count,
    COALESCE(SUM(e.amount), 0) AS total_spent,
    MAX(e.expense_date) AS last_expense_date,
    g.created_at,
    g.updated_at
FROM groups g
LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.is_active = TRUE
LEFT JOIN expenses e ON g.id = e.group_id AND e.is_deleted = FALSE
WHERE g.is_active = TRUE
GROUP BY g.id, g.name, g.group_type, g.default_currency, g.created_at, g.updated_at;
```

**Usage:**
```sql
-- Get summary for all active groups
SELECT * FROM group_summary_view;

-- Get groups with recent activity
SELECT * FROM group_summary_view 
WHERE last_expense_date > CURRENT_DATE - INTERVAL '30 days';
```

---

### 3. user_expenses_view

Shows all expenses for a user with payment and split details.

```sql
CREATE VIEW user_expenses_view AS
SELECT 
    e.id AS expense_id,
    e.group_id,
    g.name AS group_name,
    e.description,
    e.amount AS total_amount,
    e.currency,
    e.category,
    e.expense_date,
    e.paid_by,
    p_payer.name AS payer_name,
    es.user_id,
    p_user.name AS user_name,
    es.amount AS user_owed_amount,
    CASE WHEN e.paid_by = es.user_id THEN TRUE ELSE FALSE END AS user_paid,
    e.created_at
FROM expenses e
JOIN groups g ON e.group_id = g.id
JOIN expense_splits es ON e.id = es.expense_id
JOIN profiles p_payer ON e.paid_by = p_payer.id
JOIN profiles p_user ON es.user_id = p_user.id
WHERE e.is_deleted = FALSE;
```

**Usage:**
```sql
-- Get all expenses for a specific user
SELECT * FROM user_expenses_view 
WHERE user_id = 'xxx' 
ORDER BY expense_date DESC;

-- Get expenses where user paid
SELECT * FROM user_expenses_view 
WHERE user_id = 'xxx' AND user_paid = TRUE;
```

---

### 4. recent_activity_view

Combined feed of expenses and settlements for activity tracking.

```sql
CREATE VIEW recent_activity_view AS
-- Expenses
SELECT 
    e.id,
    'expense' AS activity_type,
    e.group_id,
    e.description,
    e.amount,
    e.currency,
    e.created_by AS user_id,
    p.name AS user_name,
    e.expense_date AS activity_date,
    e.created_at
FROM expenses e
JOIN profiles p ON e.created_by = p.id
WHERE e.is_deleted = FALSE

UNION ALL

-- Settlements
SELECT 
    s.id,
    'settlement' AS activity_type,
    s.group_id,
    CONCAT(p_from.name, ' paid ', p_to.name) AS description,
    s.amount,
    s.currency,
    s.from_user_id AS user_id,
    p_from.name AS user_name,
    s.settlement_date AS activity_date,
    s.created_at
FROM settlements s
JOIN profiles p_from ON s.from_user_id = p_from.id
JOIN profiles p_to ON s.to_user_id = p_to.id

ORDER BY created_at DESC;
```

**Usage:**
```sql
-- Get recent activity for a group
SELECT * FROM recent_activity_view 
WHERE group_id = 'xxx' 
ORDER BY created_at DESC 
LIMIT 20;

-- Get user's recent activity across all groups
SELECT * FROM recent_activity_view 
WHERE user_id = 'xxx' 
ORDER BY created_at DESC;
```

---

## SQL Schema

Complete SQL schema for creating all tables, indexes, and views.

```sql
-- ============================================
-- TABLES
-- ============================================

-- 1. PROFILES
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(20),
    default_currency VARCHAR(3) DEFAULT 'USD',
    language VARCHAR(5) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. GROUPS
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    group_type VARCHAR(50) DEFAULT 'general',
    default_currency VARCHAR(3) DEFAULT 'USD',
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_is_active ON groups(is_active);

-- 3. GROUP_MEMBERS
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_active ON group_members(group_id, is_active);

-- 4. EXPENSES
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    category VARCHAR(50),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_url TEXT,
    paid_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_active ON expenses(group_id, is_deleted);

-- 5. EXPENSE_SPLITS
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(expense_id, user_id)
);

CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);

-- 6. SETTLEMENTS
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (from_user_id != to_user_id)
);

CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX idx_settlements_to_user ON settlements(to_user_id);
CREATE INDEX idx_settlements_date ON settlements(settlement_date);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

-- Trigger-only: block RPC exposure of the SECURITY DEFINER function.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- VIEWS
-- ============================================

-- (Views defined in previous section)
-- Add them here in implementation

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- ⚠️ Inline subqueries on `group_members` cause infinite recursion (Postgres 42P17),
-- which PostgREST surfaces as HTTP 500. Use SECURITY DEFINER helper functions
-- so RLS does not re-trigger on `group_members` lookups.

CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = check_group_id
          AND user_id = auth.uid()
          AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.is_group_creator(check_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.groups
        WHERE id = check_group_id AND created_by = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_creator(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_group_member(uuid)  TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_group_creator(uuid) TO anon, authenticated;

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements     ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"      ON profiles FOR UPDATE USING (auth.uid() = id);

-- Groups
CREATE POLICY "Users can view their groups"           ON groups FOR SELECT USING (public.is_group_member(id));
CREATE POLICY "Users can create groups"               ON groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Group creators can update their groups" ON groups FOR UPDATE USING (auth.uid() = created_by);

-- Group Members (note: `user_id = auth.uid()` short-circuit avoids the helper for self-rows)
CREATE POLICY "Users can view group members" ON group_members
    FOR SELECT USING (user_id = auth.uid() OR public.is_group_member(group_id));
CREATE POLICY "Users can insert group members" ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR public.is_group_creator(group_id)
        OR public.is_group_member(group_id)
    );
CREATE POLICY "Users can update group members" ON group_members
    FOR UPDATE USING (public.is_group_member(group_id));

-- Expenses
CREATE POLICY "Users can view group expenses"           ON expenses FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Users can create expenses in their groups" ON expenses FOR INSERT WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Users can update group expenses"         ON expenses FOR UPDATE USING (public.is_group_member(group_id));

-- Expense Splits (gated by parent expense's group)
CREATE POLICY "Users can view expense splits in their groups" ON expense_splits
    FOR SELECT USING (expense_id IN (SELECT e.id FROM expenses e WHERE public.is_group_member(e.group_id)));
CREATE POLICY "Users can insert expense splits" ON expense_splits
    FOR INSERT WITH CHECK (expense_id IN (SELECT e.id FROM expenses e WHERE public.is_group_member(e.group_id)));
CREATE POLICY "Users can delete expense splits" ON expense_splits
    FOR DELETE USING (expense_id IN (SELECT e.id FROM expenses e WHERE public.is_group_member(e.group_id)));

-- Settlements
CREATE POLICY "Users can view settlements in their groups"   ON settlements FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Users can create settlements in their groups" ON settlements FOR INSERT WITH CHECK (public.is_group_member(group_id));
```

---

## Key Design Decisions

### 1. Supabase Auth Integration
- **Decision**: Use Supabase's built-in authentication
- **Rationale**: Handles OAuth (Google, Apple), phone auth, email verification
- **Implementation**: `profiles.id` references `auth.users(id)`
- **Benefit**: No password management, secure by default

### 2. Single Payer Per Expense
- **Decision**: One person pays per expense (stored in `expenses.paid_by`)
- **Rationale**: Simplifies 95% of use cases
- **Alternative Considered**: Multiple payers (rejected for complexity)
- **Future**: Can add multi-payer support if needed

### 3. No Cached Balances Table
- **Decision**: Calculate balances on-the-fly from expenses and settlements
- **Rationale**: Eliminates data duplication and sync issues
- **Performance**: Adequate for MVP, can add materialized view later
- **Benefit**: Always accurate, no stale data

### 4. Soft Deletes
- **Decision**: Use `is_active` and `is_deleted` flags instead of hard deletes
- **Rationale**: Preserve financial history and audit trail
- **Implementation**: Filter queries with `WHERE is_deleted = FALSE`
- **Benefit**: Can restore accidentally deleted data

### 5. DECIMAL for Money
- **Decision**: Use `DECIMAL(12,2)` for all monetary amounts
- **Rationale**: Precise calculations, no floating-point errors
- **Alternative Considered**: FLOAT (rejected - causes rounding errors)
- **Format**: 12 digits total, 2 after decimal (max: 9,999,999,999.99)

### 6. Expense Splits Include Payer
- **Decision**: Person who paid is also in `expense_splits`
- **Rationale**: Simplifies balance calculations
- **Example**: If A paid $100 split 3 ways, A owes $33.33 to themselves
- **Benefit**: Consistent data model

### 7. Settlements Are Separate
- **Decision**: Settlements are NOT expenses
- **Rationale**: Different semantics (debt payment vs shared cost)
- **Benefit**: Clear separation of concerns
- **Query**: Balance = (paid - owed + received_settlements - paid_settlements)

---

## Implementation Guide

### Phase 1: Setup Supabase Project
1. Create Supabase project
2. Enable authentication providers (Google, Apple, Phone)
3. Run SQL schema to create tables
4. Enable Row Level Security (RLS) policies
5. Test authentication flow

### Phase 2: Create Tables
```sql
-- Run the SQL schema from the previous section
-- Order matters due to foreign key dependencies:
1. profiles (depends on auth.users)
2. groups (depends on profiles)
3. group_members (depends on groups, profiles)
4. expenses (depends on groups, profiles)
5. expense_splits (depends on expenses, profiles)
6. settlements (depends on groups, profiles)
```

### Phase 3: Create Views
```sql
-- Create the 4 views defined earlier
-- Views can be created in any order
```

### Phase 4: Test Data
```sql
-- Insert test data to verify schema
-- Example test scenario:
1. Create 3 test users
2. Create a group with all 3 users
3. Add an expense paid by user 1, split equally
4. Add a settlement from user 2 to user 1
5. Query user_balances_view to verify calculations
```

### Phase 5: Application Integration
1. Install Supabase client in your app
2. Implement authentication flow
3. Create TypeScript types matching database schema
4. Implement CRUD operations for each table
5. Use views for complex queries

---

## Common Queries

### Get User's Groups
```sql
SELECT g.* 
FROM groups g
JOIN group_members gm ON g.id = gm.group_id
WHERE gm.user_id = 'user-id' 
  AND gm.is_active = TRUE 
  AND g.is_active = TRUE;
```

### Get Group Expenses
```sql
SELECT e.*, p.name AS payer_name
FROM expenses e
JOIN profiles p ON e.paid_by = p.id
WHERE e.group_id = 'group-id' 
  AND e.is_deleted = FALSE
ORDER BY e.expense_date DESC;
```

### Calculate User Balance in Group
```sql
SELECT 
    user_id,
    net_balance
FROM user_balances_view
WHERE group_id = 'group-id' 
  AND user_id = 'user-id';
```

### Get Who Owes Whom in Group
```sql
-- This requires application logic to simplify debts
-- Basic query shows all pairwise balances:
SELECT 
    e.paid_by AS creditor,
    es.user_id AS debtor,
    SUM(es.amount) AS amount_owed
FROM expenses e
JOIN expense_splits es ON e.id = es.expense_id
WHERE e.group_id = 'group-id'
  AND e.is_deleted = FALSE
  AND e.paid_by != es.user_id
GROUP BY e.paid_by, es.user_id
HAVING SUM(es.amount) > 0;
```

### Add Expense with Equal Split
```sql
-- 1. Insert expense
INSERT INTO expenses (group_id, description, amount, currency, paid_by, created_by)
VALUES ('group-id', 'Dinner', 100.00, 'USD', 'user-a-id', 'user-a-id')
RETURNING id;

-- 2. Insert splits (for 3 people: A, B, C)
INSERT INTO expense_splits (expense_id, user_id, amount) VALUES
    ('expense-id', 'user-a-id', 33.33),
    ('expense-id', 'user-b-id', 33.33),
    ('expense-id', 'user-c-id', 33.34);
```

### Record Settlement
```sql
INSERT INTO settlements (
    group_id, 
    from_user_id, 
    to_user_id, 
    amount, 
    currency, 
    payment_method,
    created_by
)
VALUES (
    'group-id',
    'user-b-id',  -- who is paying
    'user-a-id',  -- who receives
    50.00,
    'USD',
    'bank_transfer',
    'user-b-id'
);
```

---

## Summary

This database architecture provides:

✅ **Clean Design**: 6 core tables, normalized structure  
✅ **Supabase Integration**: Leverages built-in auth  
✅ **Scalability**: Designed for growth without major refactoring  
✅ **Data Integrity**: Foreign keys, constraints, soft deletes  
✅ **Flexibility**: Supports equal and unequal expense splits  
✅ **Performance**: Indexed for common queries  
✅ **Security**: Row Level Security (RLS) policies  
✅ **Maintainability**: Views simplify complex queries  

**Ready for MVP implementation!**

---

## Next Steps

1. **Create Supabase Project**: Set up database and auth
2. **Run SQL Schema**: Create tables, indexes, triggers, views
3. **Test with Sample Data**: Verify all relationships work
4. **Update TypeScript Types**: Match database schema in `packages/shared`
5. **Implement Services**: Create CRUD operations in backend
6. **Build UI**: Connect frontend to database via Supabase client

---

**Questions or need clarification? Refer to this document or ask for specific implementation examples.**
