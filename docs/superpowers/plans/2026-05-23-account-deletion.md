# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the production-grade account-deletion flow defined in `docs/superpowers/specs/2026-05-23-account-deletion-design.md` — anonymized soft delete, re-signup block, server-side RLS enforcement, audit trail, and "Deleted user" display fallback.

**Architecture:** Single transactional `delete_my_account()` RPC mutates `profiles` (PII → NULL), inserts `deleted_account_emails` (sha256), inserts `account_deletions_audit`, and sets `auth.users.banned_until`. A `BEFORE INSERT` trigger on `auth.users` blocks re-signup. All write RLS policies gain `AND public.is_caller_active()`. The mobile app centralises display fallbacks in `lib/userDisplay.ts`, runs a pre-deletion open-balances check, and handles re-signup errors with a friendly Alert that opens `mailto:sarussilberg@gmail.com`.

**Tech Stack:** Supabase (Postgres 15 + RLS + pgcrypto), React Native / Expo (mobile), TypeScript, Jest + React Testing Library, react-i18next.

**Repo layout reminder:**
- All paths below are relative to repo root `/Users/navesarussi/srussilberg/kupa`.
- DB SQL lives under `cost-share-app/supabase/`.
- Mobile app under `cost-share-app/apps/mobile/`.
- Tests mirror source under `cost-share-app/apps/mobile/__tests__/`.

---

## Phase A — Database Migration

Output: a single idempotent SQL file `cost-share-app/supabase/account-deletion-v2.sql` that can be run repeatedly on the remote project, plus mirrored edits to `cost-share-app/supabase/schema.sql` so a fresh clone produces the same state.

### Task A1: Create the migration scaffold

**Files:**
- Create: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Create the file with header + extension**

Write this exact content to `cost-share-app/supabase/account-deletion-v2.sql`:

```sql
-- account-deletion-v2.sql
-- Idempotent migration. Replaces the v1 soft-delete with full GDPR-compliant flow:
--   * PII anonymization on delete_my_account()
--   * deleted_account_emails (sha256 block list) + auth.users trigger
--   * account_deletions_audit (GDPR Art. 30)
--   * storage_cleanup_queue (orphaned avatars consumed by an edge function)
--   * is_caller_active() helper + write-policy guards
--   * profiles.name → NULL-able
-- Safe to run multiple times. Run in Supabase SQL Editor on the remote project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): scaffold account-deletion v2 migration"
```

---

### Task A2: Add the three new tables

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the new tables**

Append to `cost-share-app/supabase/account-deletion-v2.sql`:

```sql

-- ============================================
-- NEW TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS deleted_account_emails (
    email_hash TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE deleted_account_emails ENABLE ROW LEVEL SECURITY;
-- No policies → only SECURITY DEFINER functions and service role can access.

CREATE TABLE IF NOT EXISTS account_deletions_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    email_hash TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL DEFAULT 'self_service',
    open_balance_snapshot JSONB,
    restored_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_account_deletions_audit_user
    ON account_deletions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletions_audit_deleted_at
    ON account_deletions_audit(deleted_at DESC);
ALTER TABLE account_deletions_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS storage_cleanup_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_path TEXT NOT NULL,
    bucket TEXT NOT NULL DEFAULT 'profile-images',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    UNIQUE (bucket, object_path)
);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_queue_pending
    ON storage_cleanup_queue(requested_at)
    WHERE processed_at IS NULL;
ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): add deleted_account_emails, audit, storage_cleanup_queue"
```

---

### Task A3: Make `profiles.name` NULL-able

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the ALTER**

Append:

```sql

-- ============================================
-- profiles: allow NULL name (display layer falls back to t('common.deletedUser'))
-- ============================================
ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): allow profiles.name NULL for deleted users"
```

---

### Task A4: Add `is_caller_active()` helper

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the function**

Append:

```sql

-- ============================================
-- is_caller_active() — used by write RLS policies (Task A7)
-- Fail-open on missing row to preserve the first-login race behaviour that
-- existing assertProfileActive() relies on in lib/auth.ts.
-- ============================================
CREATE OR REPLACE FUNCTION public.is_caller_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(
        (SELECT is_active FROM profiles WHERE id = auth.uid()),
        TRUE
    );
$$;
REVOKE EXECUTE ON FUNCTION public.is_caller_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_caller_active() TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): add is_caller_active() RLS helper"
```

---

### Task A5: Replace `delete_my_account()` with the transactional version

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the full RPC**

Append:

```sql

-- ============================================
-- delete_my_account() — full transactional flow
-- Replaces the v1 stub. Anonymizes PII, hashes the email for re-signup
-- block, snapshots open balances into the audit row, bans auth.users
-- via banned_until, and queues the avatar for async storage cleanup.
-- ============================================
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_email    TEXT;
    v_avatar   TEXT;
    v_hash     TEXT;
    v_balance  JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'auth_user_missing';
    END IF;
    v_hash := encode(digest(lower(trim(v_email)), 'sha256'), 'hex');

    BEGIN
        v_balance := get_user_balance_summary(v_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_balance := jsonb_build_object('error', SQLERRM);
    END;

    SELECT avatar_url INTO v_avatar FROM profiles WHERE id = v_user_id;

    INSERT INTO deleted_account_emails (email_hash)
        VALUES (v_hash)
        ON CONFLICT (email_hash) DO NOTHING;

    UPDATE profiles
        SET name = NULL,
            email = NULL,
            avatar_url = NULL,
            phone = NULL,
            is_active = FALSE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_user_id
          AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_already_inactive';
    END IF;

    UPDATE auth.users
        SET banned_until = TIMESTAMPTZ '2099-12-31 00:00:00+00'
        WHERE id = v_user_id;

    INSERT INTO account_deletions_audit (user_id, email_hash, reason, open_balance_snapshot)
        VALUES (v_user_id, v_hash, 'self_service', v_balance);

    IF v_avatar IS NOT NULL THEN
        INSERT INTO storage_cleanup_queue (object_path)
            VALUES (v_avatar)
            ON CONFLICT (bucket, object_path) DO NOTHING;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): replace delete_my_account() with full transactional flow"
```

---

### Task A6: Add re-signup trigger on `auth.users`

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the trigger function + trigger**

Append:

```sql

-- ============================================
-- check_email_not_deleted() — BEFORE INSERT ON auth.users
-- Defense-in-depth: even if the app skips its own check, this rejects
-- re-signups for emails whose hash is in deleted_account_emails.
-- ============================================
CREATE OR REPLACE FUNCTION public.check_email_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;
    v_hash := encode(digest(lower(trim(NEW.email)), 'sha256'), 'hex');
    IF EXISTS (SELECT 1 FROM deleted_account_emails WHERE email_hash = v_hash) THEN
        RAISE EXCEPTION 'email_was_deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_deleted_email_signup ON auth.users;
CREATE TRIGGER block_deleted_email_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_email_not_deleted();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): block re-signup with deleted email via auth.users trigger"
```

---

### Task A7: Add `get_my_open_balances()`

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the RPC**

Append:

```sql

-- ============================================
-- get_my_open_balances() — pre-deletion warning data
-- Thin wrapper around get_user_balance_summary using auth.uid().
-- ============================================
CREATE OR REPLACE FUNCTION get_my_open_balances()
RETURNS JSONB
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_user_balance_summary(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION get_my_open_balances() TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): add get_my_open_balances() RPC"
```

---

### Task A8: Add `is_caller_active()` to write RLS policies

For each existing write policy in `schema.sql`, append `AND public.is_caller_active()`. Policies are recreated with `DROP POLICY IF EXISTS ... CREATE POLICY ...` so the migration is idempotent.

**Files:**
- Modify: `cost-share-app/supabase/account-deletion-v2.sql`

- [ ] **Step 1: Append the RLS updates**

Append:

```sql

-- ============================================
-- RLS HARDENING: gate every write on is_caller_active()
-- Policy names match those in schema.sql so DROP+CREATE replaces them.
-- ============================================

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id AND public.is_caller_active())
    WITH CHECK (auth.uid() = id AND public.is_caller_active());

-- groups
DROP POLICY IF EXISTS "Users can create groups" ON groups;
CREATE POLICY "Users can create groups" ON groups
    FOR INSERT
    WITH CHECK (auth.uid() = created_by AND public.is_caller_active());

DROP POLICY IF EXISTS "Group members can update their groups" ON groups;
CREATE POLICY "Group members can update their groups" ON groups
    FOR UPDATE
    USING (public.is_group_member(id) AND public.is_caller_active());

-- group_members
DROP POLICY IF EXISTS "Users can insert group members" ON group_members;
CREATE POLICY "Users can insert group members" ON group_members
    FOR INSERT
    WITH CHECK (
        public.is_caller_active()
        AND (
            auth.uid() = user_id
            OR public.is_group_creator(group_id)
            OR public.is_group_member(group_id)
        )
    );

DROP POLICY IF EXISTS "Users can update group members" ON group_members;
CREATE POLICY "Users can update group members" ON group_members
    FOR UPDATE
    USING (public.is_group_member(group_id) AND public.is_caller_active());

-- expenses
DROP POLICY IF EXISTS "Users can create expenses in their groups" ON expenses;
CREATE POLICY "Users can create expenses in their groups" ON expenses
    FOR INSERT
    WITH CHECK (public.is_group_member(group_id) AND public.is_caller_active());

DROP POLICY IF EXISTS "Users can update group expenses" ON expenses;
CREATE POLICY "Users can update group expenses" ON expenses
    FOR UPDATE
    USING (public.is_group_member(group_id) AND public.is_caller_active());

-- expense_splits
DROP POLICY IF EXISTS "Users can insert expense splits" ON expense_splits;
CREATE POLICY "Users can insert expense splits" ON expense_splits
    FOR INSERT
    WITH CHECK (
        public.is_caller_active()
        AND expense_id IN (
            SELECT e.id FROM expenses e WHERE public.is_group_member(e.group_id)
        )
    );

DROP POLICY IF EXISTS "Users can delete expense splits" ON expense_splits;
CREATE POLICY "Users can delete expense splits" ON expense_splits
    FOR DELETE
    USING (
        public.is_caller_active()
        AND expense_id IN (
            SELECT e.id FROM expenses e WHERE public.is_group_member(e.group_id)
        )
    );

-- settlements
DROP POLICY IF EXISTS "Users can create settlements in their groups" ON settlements;
CREATE POLICY "Users can create settlements in their groups" ON settlements
    FOR INSERT
    WITH CHECK (public.is_group_member(group_id) AND public.is_caller_active());

DROP POLICY IF EXISTS "Group members can update settlements" ON settlements;
CREATE POLICY "Group members can update settlements" ON settlements
    FOR UPDATE
    USING (public.is_group_member(group_id) AND public.is_caller_active());

DROP POLICY IF EXISTS "Either party can delete settlement" ON settlements;
CREATE POLICY "Either party can delete settlement" ON settlements
    FOR DELETE
    USING (
        public.is_caller_active()
        AND public.is_group_member(group_id)
        AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    );
```

> **Note for friend_requests / friendships:** the spec mentions these as "if present". Before this commit, run `grep -n "friend_requests\|friendships" cost-share-app/supabase/schema.sql cost-share-app/supabase/friends-system.sql`. If those tables have write policies, repeat the same DROP/CREATE pattern with `AND public.is_caller_active()`. If none exist (e.g., friends are handled purely via SECURITY DEFINER RPCs), skip silently and note in the commit message.

- [ ] **Step 2: Inspect friends tables (decision step)**

Run:

```bash
grep -n "friend_requests\|friendships\|CREATE POLICY" cost-share-app/supabase/friends-system.sql
```

If any write policies exist on those tables, add equivalent `DROP POLICY IF EXISTS ... CREATE POLICY ... WITH CHECK (... AND public.is_caller_active())` blocks at the end of the section. If only SELECT or SECURITY DEFINER RPCs are used, skip.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/account-deletion-v2.sql
git commit -m "feat(db): gate all write RLS policies on is_caller_active()"
```

---

### Task A9: Mirror migration into `schema.sql` (canonical source)

The migration file is the deployment artifact; `schema.sql` is the canonical fresh-clone source. Keep them in sync.

**Files:**
- Modify: `cost-share-app/supabase/schema.sql`

- [ ] **Step 1: Read the current account-deactivation section**

Read lines 619–648 of `cost-share-app/supabase/schema.sql` — this is the v1 stub we are replacing.

- [ ] **Step 2: Replace the section**

Replace the entire block from line 619 (`-- ACCOUNT DEACTIVATION (soft delete)` comment header) through line 648 with the contents of `account-deletion-v2.sql` minus the file header line. Also: locate `CREATE TABLE profiles (` near line 20 and change `name VARCHAR(100) NOT NULL,` to `name VARCHAR(100),` (drop the NOT NULL).

Verification: `grep -c "delete_my_account" cost-share-app/supabase/schema.sql` should return `2` (one CREATE OR REPLACE + one GRANT EXECUTE).

- [ ] **Step 3: Verify schema.sql still parses (smoke)**

```bash
# If you have a local supabase stack, optional:
# psql -h localhost -p 54322 -U postgres -d postgres -f cost-share-app/supabase/schema.sql --dry-run
# Otherwise just visually inspect that the file is coherent.
wc -l cost-share-app/supabase/schema.sql
```

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/schema.sql
git commit -m "chore(db): mirror account-deletion v2 into schema.sql"
```

---

### Task A10: Apply migration to a Supabase branch + verify

This task uses the Supabase MCP server. The developer should have access to `mcp__supabase__create_branch`, `apply_migration`, `execute_sql`.

- [ ] **Step 1: Create a Supabase branch**

Use `mcp__supabase__create_branch` to create a branch named `account-deletion-v2`.

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `account_deletion_v2` and the full contents of `cost-share-app/supabase/account-deletion-v2.sql`.

- [ ] **Step 3: Smoke-test the new functions**

Use `mcp__supabase__execute_sql` to run:

```sql
-- Should return TRUE (no auth context → falls through COALESCE to TRUE)
SELECT public.is_caller_active();

-- Should list the new tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('deleted_account_emails', 'account_deletions_audit', 'storage_cleanup_queue');

-- Should list the new functions
SELECT proname FROM pg_proc
WHERE proname IN ('is_caller_active', 'check_email_not_deleted', 'delete_my_account', 'get_my_open_balances');

-- Should show the trigger
SELECT tgname FROM pg_trigger WHERE tgname = 'block_deleted_email_signup';
```

Expected: every check returns the expected row(s).

- [ ] **Step 4: Test the re-signup trigger**

```sql
-- Insert a fake deleted-email hash
INSERT INTO deleted_account_emails (email_hash)
    VALUES (encode(digest('test-block@example.com', 'sha256'), 'hex'));

-- Attempt to create a user with that email — should raise 'email_was_deleted'
SELECT auth.sign_up('test-block@example.com', 'irrelevant-password');
-- Note: if auth.sign_up is not available, equivalent test via supabase-js or via direct INSERT into auth.users.

-- Cleanup
DELETE FROM deleted_account_emails
    WHERE email_hash = encode(digest('test-block@example.com', 'sha256'), 'hex');
```

If the INSERT does not raise, **stop and debug** before proceeding.

- [ ] **Step 5: Merge the branch (after manual approval)**

Once smoke tests pass, ask the user before merging via `mcp__supabase__merge_branch`. Document the branch URL in a short comment on the next commit.

---

## Phase B — Mobile Helpers + i18n

### Task B1: Add i18n keys (English)

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`

- [ ] **Step 1: Add the new `common` keys**

In `en.json`, inside the `"common": { ... }` block (starts line 2), add:

```json
"deletedUser": "Deleted user",
"unknownUser": "Unknown user",
"openMail": "Open mail",
```

Place them after `"you": "You"` (currently the last entry) — remember to add a trailing comma to `"you": "You"` first.

- [ ] **Step 2: Update existing `deleteAccount` copy + add new keys**

In `en.json`, locate the `"deleteAccount": { ... }` block. Replace `warningBullet4` and `deactivatedMessage`, and add the new keys:

```json
"warningBullet4": "This action is irreversible. Contact us at {{email}} to restore.",
"deactivatedMessage": "This account was deleted. Contact {{email}} to restore.",
"openBalancesWarningTitle": "You have open balances",
"openBalancesWarningBody": "Friends will see these owed against 'Deleted user'.",
"openBalancesCta": "Settle up now",
"reSignupBlockedTitle": "Account deleted",
"reSignupBlocked": "This account was deleted. Contact {{email}} to restore it.",
```

- [ ] **Step 3: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/en.json','utf8'))"
```

Expected: no output (silent = valid).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json
git commit -m "i18n(en): add deletedUser/unknownUser + delete-account copy updates"
```

---

### Task B2: Add i18n keys (Hebrew)

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add the new `common` keys**

In `he.json`, inside the `"common": { ... }` block, after the existing `"you"` (or last) entry, add:

```json
"deletedUser": "משתמש שנמחק",
"unknownUser": "משתמש לא ידוע",
"openMail": "פתח מייל",
```

- [ ] **Step 2: Update existing `deleteAccount` copy + add new keys**

In `he.json`, locate the `"deleteAccount": { ... }` block (around line 625). Replace `warningBullet4` and `deactivatedMessage`, and add the new keys:

```json
"warningBullet4": "פעולה זו אינה הפיכה. פנה אלינו ב-{{email}} לשחזור.",
"deactivatedMessage": "החשבון הזה נמחק. פנה ל-{{email}} לשחזור.",
"openBalancesWarningTitle": "יש לך יתרות פתוחות",
"openBalancesWarningBody": "החברים יראו אותן רשומות מול 'משתמש שנמחק'.",
"openBalancesCta": "סלוק עכשיו",
"reSignupBlockedTitle": "החשבון נמחק",
"reSignupBlocked": "החשבון הזה נמחק. פנה ל-{{email}} כדי לשחזר.",
```

- [ ] **Step 3: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('cost-share-app/apps/mobile/i18n/locales/he.json','utf8'))"
```

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "i18n(he): add deletedUser/unknownUser + delete-account copy updates"
```

---

### Task B3: Create `lib/userDisplay.ts` (TDD)

**Files:**
- Create: `cost-share-app/apps/mobile/lib/userDisplay.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/userDisplay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/lib/userDisplay.test.ts`:

```ts
import { getAvatarUrl, getDisplayName, isDeleted } from '../../lib/userDisplay';

const t = (key: string) => key;

const active = { id: 'a', name: 'Alice', avatar_url: 'https://x/a.png', is_active: true };
const deleted = { id: 'd', name: null, avatar_url: null, is_active: false };
const nameless = { id: 'n', name: '   ', avatar_url: null, is_active: true };

describe('userDisplay', () => {
    describe('isDeleted', () => {
        it('returns true for is_active=false', () => expect(isDeleted(deleted)).toBe(true));
        it('returns false for is_active=true', () => expect(isDeleted(active)).toBe(false));
        it('returns false for null/undefined', () => {
            expect(isDeleted(null)).toBe(false);
            expect(isDeleted(undefined)).toBe(false);
        });
    });

    describe('getDisplayName', () => {
        it('returns the name for active users', () => {
            expect(getDisplayName(active, t as any)).toBe('Alice');
        });
        it('returns common.deletedUser for deleted users', () => {
            expect(getDisplayName(deleted, t as any)).toBe('common.deletedUser');
        });
        it('returns common.deletedUser for null user', () => {
            expect(getDisplayName(null, t as any)).toBe('common.deletedUser');
        });
        it('returns common.unknownUser for active user with blank name', () => {
            expect(getDisplayName(nameless, t as any)).toBe('common.unknownUser');
        });
    });

    describe('getAvatarUrl', () => {
        it('returns the avatar URL for active users', () => {
            expect(getAvatarUrl(active)).toBe('https://x/a.png');
        });
        it('returns null for deleted users', () => {
            expect(getAvatarUrl(deleted)).toBeNull();
        });
        it('returns null for null user', () => {
            expect(getAvatarUrl(null)).toBeNull();
        });
    });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/userDisplay.test.ts
```

Expected: FAIL with "Cannot find module '../../lib/userDisplay'".

- [ ] **Step 3: Implement the helper**

Create `cost-share-app/apps/mobile/lib/userDisplay.ts`:

```ts
import type { TFunction } from 'i18next';

export type UserLike = {
    id: string;
    name: string | null;
    avatar_url: string | null;
    is_active: boolean;
} | null | undefined;

export function isDeleted(user: UserLike): boolean {
    return Boolean(user && user.is_active === false);
}

export function getDisplayName(user: UserLike, t: TFunction): string {
    if (!user || user.is_active === false) return t('common.deletedUser');
    return user.name?.trim() || t('common.unknownUser');
}

export function getAvatarUrl(user: UserLike): string | null {
    if (!user || user.is_active === false) return null;
    return user.avatar_url;
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/userDisplay.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/userDisplay.ts cost-share-app/apps/mobile/__tests__/lib/userDisplay.test.ts
git commit -m "feat(mobile): add lib/userDisplay for deleted-user fallbacks"
```

---

## Phase C — Mobile Services

### Task C1: Extend `account.service.ts` with `getMyOpenBalances` + global signOut (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/services/account.service.ts`
- Modify: `cost-share-app/apps/mobile/__tests__/services/account.service.test.ts`

- [ ] **Step 1: Extend the test file**

Add to `cost-share-app/apps/mobile/__tests__/services/account.service.test.ts` (the file already mocks `supabase.rpc` and `signOut`). Replace the existing `deleteMyAccount` describe-block test for signOut to assert global scope, and add a new describe block for `getMyOpenBalances`. Final file should look like:

```ts
const mockRpc = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a), auth: { signOut: (...a: any[]) => mockSignOut(...a) } },
}));

import { deleteMyAccount, getMyOpenBalances } from '../../services/account.service';

beforeEach(() => {
    mockRpc.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
});

describe('deleteMyAccount', () => {
    it('calls RPC then signs out globally and returns ok on success', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
        expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
        expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
    });

    it('returns error and does NOT sign out when RPC fails', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: false, error: 'deleteAccount.deleteFailed' });
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('returns ok even when signOut throws (account already deactivated)', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });
        mockSignOut.mockResolvedValue({ error: { message: 'network' } });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
    });
});

describe('getMyOpenBalances', () => {
    it('returns hasOpenBalances=false when summary array is empty', async () => {
        mockRpc.mockResolvedValue({
            data: { summary: [], byGroup: [] },
            error: null,
        });

        const result = await getMyOpenBalances();

        expect(mockRpc).toHaveBeenCalledWith('get_my_open_balances');
        expect(result).toEqual({
            hasOpenBalances: false,
            totalOwed: 0,
            totalOwing: 0,
            currency: 'ILS',
        });
    });

    it('aggregates owed and owing across currencies and picks the largest as display currency', async () => {
        mockRpc.mockResolvedValue({
            data: {
                summary: [
                    { currency: 'ILS', owed: 100, owe: 20, net: 80 },
                    { currency: 'USD', owed: 50, owe: 5, net: 45 },
                ],
                byGroup: [],
            },
            error: null,
        });

        const result = await getMyOpenBalances();

        expect(result.hasOpenBalances).toBe(true);
        expect(result.totalOwed).toBe(150);
        expect(result.totalOwing).toBe(25);
        // Largest by abs(net) is ILS (80) so it wins display currency.
        expect(result.currency).toBe('ILS');
    });

    it('falls back to ILS currency on RPC error', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

        const result = await getMyOpenBalances();

        expect(result).toEqual({
            hasOpenBalances: false,
            totalOwed: 0,
            totalOwing: 0,
            currency: 'ILS',
        });
    });
});
```

- [ ] **Step 2: Run tests — expect deleteMyAccount tests fail and getMyOpenBalances missing**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/services/account.service.test.ts
```

Expected: `mockSignOut` assertion fails (wrong scope) and `getMyOpenBalances` is undefined.

- [ ] **Step 3: Update the service**

Replace `cost-share-app/apps/mobile/services/account.service.ts` with:

```ts
import { supabase } from '../lib/supabase';

export interface DeleteAccountResult {
    ok: boolean;
    error?: string; // i18n key
}

export interface OpenBalancesSummary {
    hasOpenBalances: boolean;
    totalOwed: number;
    totalOwing: number;
    currency: string;
}

interface SummaryRow {
    currency: string;
    owed: number;
    owe: number;
    net: number;
}

const FALLBACK_CURRENCY = 'ILS';

/**
 * Soft-delete the signed-in user's account.
 * On RPC success → also signs out from all devices. On RPC failure → leaves the session intact.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
        console.error('deleteMyAccount: RPC failed', rpcError);
        return { ok: false, error: 'deleteAccount.deleteFailed' };
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (signOutError) {
        console.warn('deleteMyAccount: signOut failed after deactivation', signOutError);
    }

    return { ok: true };
}

/**
 * Pre-deletion check: returns aggregate open-balance info for the signed-in user.
 * Returns hasOpenBalances=false on RPC error so the warning sheet renders without
 * the banner (the user can still proceed; we don't block them on a flaky network).
 */
export async function getMyOpenBalances(): Promise<OpenBalancesSummary> {
    const { data, error } = await supabase.rpc('get_my_open_balances');

    if (error || !data) {
        if (error) console.warn('getMyOpenBalances: RPC failed', error);
        return { hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: FALLBACK_CURRENCY };
    }

    const rows: SummaryRow[] = Array.isArray((data as any)?.summary) ? (data as any).summary : [];

    if (rows.length === 0) {
        return { hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: FALLBACK_CURRENCY };
    }

    let totalOwed = 0;
    let totalOwing = 0;
    let dominant: SummaryRow = rows[0];

    for (const row of rows) {
        totalOwed += Number(row.owed) || 0;
        totalOwing += Number(row.owe) || 0;
        if (Math.abs(Number(row.net) || 0) > Math.abs(Number(dominant.net) || 0)) {
            dominant = row;
        }
    }

    return {
        hasOpenBalances: true,
        totalOwed,
        totalOwing,
        currency: dominant.currency || FALLBACK_CURRENCY,
    };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/services/account.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/account.service.ts cost-share-app/apps/mobile/__tests__/services/account.service.test.ts
git commit -m "feat(mobile): add getMyOpenBalances; signOut globally on delete"
```

---

### Task C2: Discriminated error from `auth.service.handleAuthRedirectUrl` (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/services/auth.service.ts`
- Modify: `cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts`

- [ ] **Step 1: Read the existing test file**

Read `cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts` to learn its mock setup; reuse the same mocks for new tests.

- [ ] **Step 2: Add new tests**

Append the following describe block to `auth.service.test.ts`, **inside** the existing top-level `describe('auth.service', ...)` block (i.e., as a sibling of the existing `describe('handleAuthRedirectUrl', ...)`). The file already declares `mockExchangeCodeForSession` and resets it in `beforeEach` — we reuse it directly.

```ts
    describe('handleAuthRedirectUrl — discriminated errors', () => {
        it('returns code=account_deleted when underlying error mentions email_was_deleted', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'AuthApiError: email_was_deleted' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=abc');

            expect(error).not.toBeNull();
            expect(error!.code).toBe('account_deleted');
            expect(error!.message).toContain('email_was_deleted');
        });

        it('returns code=generic for any other error', async () => {
            mockExchangeCodeForSession.mockResolvedValue({
                error: { message: 'invalid_grant' },
            });

            const { error } = await handleAuthRedirectUrl('com.kupay.mobile://auth/callback?code=xyz');

            expect(error?.code).toBe('generic');
            expect(error?.message).toContain('invalid_grant');
        });
    });
```

- [ ] **Step 3: Run tests — expect failure**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/services/auth.service.test.ts
```

Expected: FAIL on `.code` access (function still returns `{ error: Error | null }`).

- [ ] **Step 4: Update `auth.service.ts` return type**

In `cost-share-app/apps/mobile/services/auth.service.ts`:

(a) Add new types near the top:

```ts
export type AuthErrorCode = 'account_deleted' | 'generic';

export interface AuthError {
    code: AuthErrorCode;
    message: string;
}

function toAuthError(err: unknown): AuthError {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    if (message.includes('email_was_deleted')) {
        return { code: 'account_deleted', message };
    }
    return { code: 'generic', message };
}
```

(b) Change the function signature of `handleAuthRedirectUrl` from `Promise<{ error: Error | null }>` to `Promise<{ error: AuthError | null }>` and wrap every `return { error: new Error(...) }` and `return { error }` with `toAuthError`. Concretely, replace the function body's return sites:

| Before | After |
|---|---|
| `return { error: new Error(errorCode) };` | `return { error: toAuthError(errorCode) };` |
| `return { error };` (after `exchangeCodeForSession`) | `return { error: error ? toAuthError(error) : null };` |
| `return { error };` (after `setSession`) | `return { error: error ? toAuthError(error) : null };` |
| `return { error: new Error(...) };` (fallback at function end) | `return { error: toAuthError(...) };` |

(c) Update `signInWithGoogle`'s return type identically — it currently returns `{ error: Error | null }`. Change to `Promise<{ error: AuthError | null }>` and wrap returns via `toAuthError` (or pass through results from `handleAuthRedirectUrl`).

- [ ] **Step 5: Run tests — expect pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/services/auth.service.test.ts
```

Expected: all tests PASS, including the two new ones.

- [ ] **Step 6: Fix any TypeScript callers broken by the signature change**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Likely affected files: `App.tsx` (deep-link handler reads `error.message`), `screens/auth/LoginScreen.tsx` (already accesses `error.message`). String access via `error.message` still works because the new `AuthError` retains a `message` field — no changes required for those call sites unless TS complains.

If `tsc` reports any error, fix the narrowing at that call site (e.g., `error?.code === 'account_deleted'`).

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/services/auth.service.ts cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts
git commit -m "feat(mobile): discriminated AuthError to detect deleted-account re-signup"
```

---

## Phase D — Settings Flow + Login Error Handling

### Task D1: Extend `DeleteAccountWarningSheet` with open-balances banner (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountWarningSheet.test.tsx`

- [ ] **Step 1: Read the existing test to learn the rendering helpers**

Read `cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountWarningSheet.test.tsx` to learn the test setup (likely uses `@testing-library/react-native` + `i18n` mocks).

- [ ] **Step 2: Add failing tests**

Append two new tests using the same render setup as the existing file:

```tsx
it('renders the open-balances banner when openBalances.hasOpenBalances=true', () => {
    const onClose = jest.fn();
    const onContinue = jest.fn();
    const onSettleUp = jest.fn();
    const { getByText, getByTestId } = render(
        <DeleteAccountWarningSheet
            visible
            openBalances={{ hasOpenBalances: true, totalOwed: 100, totalOwing: 30, currency: 'ILS' }}
            onClose={onClose}
            onContinue={onContinue}
            onSettleUp={onSettleUp}
        />,
    );

    expect(getByText('deleteAccount.openBalancesWarningTitle')).toBeTruthy();
    fireEvent.press(getByTestId('delete-account-settle-up-btn'));
    expect(onSettleUp).toHaveBeenCalledTimes(1);
});

it('omits the banner when openBalances.hasOpenBalances=false', () => {
    const { queryByText } = render(
        <DeleteAccountWarningSheet
            visible
            openBalances={{ hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: 'ILS' }}
            onClose={jest.fn()}
            onContinue={jest.fn()}
            onSettleUp={jest.fn()}
        />,
    );

    expect(queryByText('deleteAccount.openBalancesWarningTitle')).toBeNull();
});
```

(Use the same `render` import already used by the file and the same i18n mock that returns the key as the value.)

- [ ] **Step 3: Run tests — expect failure**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/settings/DeleteAccountWarningSheet.test.tsx
```

Expected: FAIL on the new props (`openBalances`, `onSettleUp`) not existing.

- [ ] **Step 4: Update the component**

Replace `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx` with:

```tsx
import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import type { OpenBalancesSummary } from '../../services/account.service';

interface Props {
    visible: boolean;
    onClose: () => void;
    onContinue: () => void;
    onSettleUp?: () => void;
    openBalances?: OpenBalancesSummary | null;
}

const BULLET_KEYS = [
    'deleteAccount.warningBullet1',
    'deleteAccount.warningBullet2',
    'deleteAccount.warningBullet3',
    'deleteAccount.warningBullet4',
];

export function DeleteAccountWarningSheet({
    visible,
    onClose,
    onContinue,
    onSettleUp,
    openBalances,
}: Props) {
    const { t } = useTranslation();
    if (!visible) return null;

    const showBalanceBanner = openBalances?.hasOpenBalances === true;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                    style={{ maxHeight: '85%' }}
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-xl font-bold text-red-600 px-5 mt-2 mb-3">
                        {t('deleteAccount.warningTitle')}
                    </Text>

                    {showBalanceBanner && (
                        <View
                            className="mx-5 mb-3 p-3 rounded-xl bg-red-50 border border-red-200"
                            testID="delete-account-balance-banner"
                        >
                            <Text className="text-sm font-semibold text-red-700 mb-1">
                                {t('deleteAccount.openBalancesWarningTitle')}
                            </Text>
                            <Text className="text-sm text-red-700 leading-5">
                                {t('deleteAccount.openBalancesWarningBody')}
                            </Text>
                            <TouchableOpacity
                                onPress={onSettleUp}
                                testID="delete-account-settle-up-btn"
                                className="mt-3 self-start px-3 py-2 rounded-lg bg-red-600"
                            >
                                <Text className="text-white text-sm font-semibold">
                                    {t('deleteAccount.openBalancesCta')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView className="px-5">
                        {BULLET_KEYS.map((key) => (
                            <View key={key} className="flex-row items-start mb-3">
                                <AppIcon name="alert-circle-outline" size={18} color={colors.error} />
                                <Text className="flex-1 ms-2 text-base text-gray-700 leading-6">
                                    {t(key, { email: 'sarussilberg@gmail.com' })}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                    <View className="flex-row gap-3 px-5 my-5">
                        <TouchableOpacity onPress={onClose} className="flex-1 bg-gray-100 rounded-xl py-4">
                            <Text className="text-center font-semibold text-gray-700">{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onContinue} className="flex-1 bg-red-500 rounded-xl py-4">
                            <Text className="text-center font-semibold text-white">{t('deleteAccount.continueBtn')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
```

> The hard-coded email `'sarussilberg@gmail.com'` is intentional — `warningBullet4` now uses interpolation, and we want the support email visible even before the user opens the support flow. If you prefer to import `getSupportEmail()` from `lib/openMailto.ts`, you may, but it adds a small import for marginal benefit.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/settings/DeleteAccountWarningSheet.test.tsx
```

Expected: PASS for all tests (existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountWarningSheet.test.tsx
git commit -m "feat(mobile): open-balances banner + settle-up CTA on delete warning sheet"
```

---

### Task D2: Wire SettingsScreen to pre-fetch balances + pass to sheet

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx`

- [ ] **Step 1: Add a test**

Append to `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx`:

```tsx
it('fetches open balances when delete-account row is tapped', async () => {
    const { getMyOpenBalances } = require('../../../services/account.service');
    getMyOpenBalances.mockResolvedValue({
        hasOpenBalances: true, totalOwed: 50, totalOwing: 0, currency: 'ILS',
    });

    const { getByText } = renderSettings();

    fireEvent.press(getByText('settings.deleteAccount'));

    await waitFor(() => expect(getMyOpenBalances).toHaveBeenCalledTimes(1));
});
```

Adjust the `require` path / `renderSettings` helper to match the existing test file's conventions. Also extend the existing `jest.mock('../../../services/account.service', ...)` to expose `getMyOpenBalances: jest.fn()`.

- [ ] **Step 2: Run — expect fail**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/profile/SettingsScreen.test.tsx
```

Expected: FAIL — `getMyOpenBalances` not called.

- [ ] **Step 3: Update `SettingsScreen.tsx`**

Modify `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`:

(a) Update imports — replace the existing `import { deleteMyAccount } from '../../services/account.service';` with:

```ts
import { deleteMyAccount, getMyOpenBalances, type OpenBalancesSummary } from '../../services/account.service';
import { useNavigation } from '@react-navigation/native';
```

(b) Inside the component (after the existing `useState` calls), add:

```ts
const navigation = useNavigation<any>();
const [openBalances, setOpenBalances] = useState<OpenBalancesSummary | null>(null);
```

(c) Replace the existing `onPress={() => setShowDeleteWarning(true)}` (around line 149) with:

```ts
onPress={async () => {
    const balances = await getMyOpenBalances();
    setOpenBalances(balances);
    setShowDeleteWarning(true);
}}
```

(d) Update the `<DeleteAccountWarningSheet ...>` JSX (around line 186) to:

```tsx
<DeleteAccountWarningSheet
    visible={showDeleteWarning}
    openBalances={openBalances}
    onClose={() => setShowDeleteWarning(false)}
    onContinue={() => {
        setShowDeleteWarning(false);
        setShowDeleteConfirm(true);
    }}
    onSettleUp={() => {
        setShowDeleteWarning(false);
        navigation.navigate('SettleUpList');
    }}
/>
```

> If the screen name `'SettleUpList'` differs in the navigator, look it up in `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`. The mobile app already has a Settle Up list screen — match its registered name.

- [ ] **Step 4: Run — expect pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/profile/SettingsScreen.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx
git commit -m "feat(mobile): pre-fetch open balances before showing delete warning"
```

---

### Task D3: Enhance `assertProfileActive` Alert with "Open mail" action

**Files:**
- Modify: `cost-share-app/apps/mobile/App.tsx`

- [ ] **Step 1: Read `App.tsx` lines 84–93**

Read the current Alert wiring for the `'deactivated'` case so the diff is precise.

- [ ] **Step 2: Replace the Alert**

In `cost-share-app/apps/mobile/App.tsx`, replace the existing `Alert.alert(...)` call inside `guardSession` (lines 86–92) with:

```ts
const { getSupportEmail, openSupportContact } = await import('./lib/openMailto');
const supportEmail = getSupportEmail();
Alert.alert(
    i18n.t('deleteAccount.deactivatedTitle'),
    i18n.t('deleteAccount.deactivatedMessage', { email: supportEmail }),
    [
        { text: i18n.t('common.close'), style: 'cancel' },
        {
            text: i18n.t('common.openMail'),
            onPress: () => { void openSupportContact(); },
        },
    ],
);
```

> If `App.tsx` already imports from `./lib/openMailto` at the top, hoist the dynamic import to a top-of-file static import for consistency.

- [ ] **Step 3: Smoke-run jest (no test added — manual verification on device)**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/authSessionLifecycle.test.ts
```

Expected: PASS (no regression in session lifecycle tests).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/App.tsx
git commit -m "feat(mobile): deactivated-account Alert gains Open mail action"
```

---

### Task D3b: Re-check `assertProfileActive` on AppState `active`

The spec (§7 Layer 1) requires the app to re-verify the profile when the user brings it to the foreground, so a remote deactivation is caught quickly without waiting for an explicit auth event.

**Files:**
- Modify: `cost-share-app/apps/mobile/App.tsx`

- [ ] **Step 1: Add an AppState listener inside the App component**

In `cost-share-app/apps/mobile/App.tsx`, add at the top of the file (if not already imported):

```ts
import { AppState, type AppStateStatus } from 'react-native';
```

Then add this `useEffect` inside the component (place it next to the existing `useEffect` block that registers `supabase.auth.onAuthStateChange`):

```ts
useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
            void guardSession();
        }
    });
    return () => sub.remove();
}, [guardSession]);
```

(`guardSession` is the existing `useCallback` at line ~84 — no signature change.)

- [ ] **Step 2: Run jest**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/authSessionLifecycle.test.ts
```

Expected: PASS (no regression).

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/App.tsx
git commit -m "feat(mobile): re-check profile-active state on AppState 'active'"
```

---

### Task D4: Handle `account_deleted` error code in `LoginScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/auth/LoginScreen.tsx`

- [ ] **Step 1: Update `handleSignIn`**

Replace the body of `handleSignIn` in `cost-share-app/apps/mobile/screens/auth/LoginScreen.tsx` (currently lines 43–62) with:

```ts
const handleSignIn = async () => {
    startLoading();
    try {
        const { error } = await signInWithGoogle();
        if (error) {
            if (error.code === 'account_deleted') {
                const { getSupportEmail, openSupportContact } = await import('../../lib/openMailto');
                Alert.alert(
                    t('deleteAccount.reSignupBlockedTitle'),
                    t('deleteAccount.reSignupBlocked', { email: getSupportEmail() }),
                    [
                        { text: t('common.close'), style: 'cancel' },
                        {
                            text: t('common.openMail'),
                            onPress: () => { void openSupportContact(); },
                        },
                    ],
                );
                return;
            }
            Toast.show({
                type: 'error',
                text1: t('auth.signInError'),
                text2: error.message,
            });
        }
    } catch (err) {
        Toast.show({ type: 'error', text1: t('auth.signInError') });
    } finally {
        stopLoading();
    }
};
```

- [ ] **Step 2: Run TS check**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/screens/auth/LoginScreen.tsx
git commit -m "feat(mobile): friendly re-signup-blocked Alert on LoginScreen"
```

---

## Phase E — Display Layer Migration

### Task E1: Audit profile-rendering call sites

Goal: produce a checklist of every component / service that needs updating to honour `is_active=false`. Output is saved as a checked-in note that future tasks tick off.

- [ ] **Step 1: Grep for direct profile-name reads**

```bash
grep -rn "\.name\b" cost-share-app/apps/mobile/components/ cost-share-app/apps/mobile/screens/ --include="*.tsx" | \
    grep -Ei "profile|user|member|friend|payer|owner" | \
    grep -v "__tests__" | \
    grep -v "languageCode\|currencyName" > /tmp/userdisplay-audit-names.txt
wc -l /tmp/userdisplay-audit-names.txt
```

- [ ] **Step 2: Grep for direct avatar reads**

```bash
grep -rn "avatar_url\|avatarUrl" cost-share-app/apps/mobile/components/ cost-share-app/apps/mobile/screens/ --include="*.tsx" | \
    grep -v "__tests__" > /tmp/userdisplay-audit-avatars.txt
wc -l /tmp/userdisplay-audit-avatars.txt
```

- [ ] **Step 3: Grep for profile selects without is_active**

```bash
grep -rn "from('profiles')\|select(.*profiles" cost-share-app/apps/mobile/services/ --include="*.ts" > /tmp/userdisplay-audit-selects.txt
wc -l /tmp/userdisplay-audit-selects.txt
```

- [ ] **Step 4: Build the call-site checklist**

For each file emitted in the three audit outputs, decide which of the following changes applies:

| Symptom | Fix |
|---|---|
| Component renders `user.name` directly | Replace with `getDisplayName(user, t)` |
| Component renders avatar from `user.avatar_url` | Replace with `getAvatarUrl(user)` (the existing Avatar component should already render placeholder when null) |
| Service `.select(...)` of profiles omits `is_active` | Add `is_active` to the select string |

Append the resolved checklist as `cost-share-app/apps/mobile/__tests__/audit-userdisplay.todo.md` (a simple Markdown checklist file). Use it as the working surface for Task E2.

- [ ] **Step 5: Commit the audit**

```bash
git add cost-share-app/apps/mobile/__tests__/audit-userdisplay.todo.md
git commit -m "chore(mobile): audit checklist for userDisplay migration"
```

---

### Task E2: Migrate profile services to select `is_active`

**Files:**
- Modify (one PR per file is fine; below is the typical change):
  - `cost-share-app/apps/mobile/services/users.service.ts`
  - `cost-share-app/apps/mobile/services/groups.service.ts`
  - `cost-share-app/apps/mobile/services/dashboard.service.ts`
  - `cost-share-app/apps/mobile/services/feed.service.ts`
  - any other file flagged by the audit in Task E1

- [ ] **Step 1: For each service file, add `is_active` to every profiles select**

Typical pattern — change:

```ts
.select('id, name, avatar_url')
```

to:

```ts
.select('id, name, avatar_url, is_active')
```

And for nested selects like:

```ts
profiles(id, name, avatar_url)
```

→

```ts
profiles(id, name, avatar_url, is_active)
```

- [ ] **Step 2: Update the in-memory User / Profile TypeScript types**

Locate the TS type for the profile (likely in `cost-share-app/apps/mobile/store/` or `cost-share-app/packages/shared/`). Add `is_active: boolean` to the type. If the type is shared across services, add it once at the source.

- [ ] **Step 3: Run TS check + test suite**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit && npx jest
```

Fix any narrowing errors that surface from the new field.

- [ ] **Step 4: Commit per logical group**

Commit in small chunks so individual services are reviewable:

```bash
git add cost-share-app/apps/mobile/services/users.service.ts
git commit -m "feat(mobile): select is_active when fetching profiles (users.service)"
# repeat per service file
```

---

### Task E3: Migrate components to `getDisplayName` / `getAvatarUrl`

Files: every component flagged in `audit-userdisplay.todo.md` from Task E1. Below is the precise pattern; apply to each component.

- [ ] **Step 1: For each component, add the import**

```ts
import { getDisplayName, getAvatarUrl } from '../lib/userDisplay';  // adjust relative path
```

(In tests, mock i18n's `t` to return the key — same as `userDisplay.test.ts`.)

- [ ] **Step 2: Replace direct reads**

Examples for the four components named in the spec:

**`components/dashboard/FriendBalanceRow.tsx`** — replace `friend.name` with `getDisplayName(friend, t)` and `friend.avatar_url` with `getAvatarUrl(friend)`.

**`components/dashboard/BalanceHeroCard.tsx`** — same pattern for any user-name field rendered.

**`components/SettlementRow.tsx`** — payer/payee names use `getDisplayName(party, t)`.

**`components/FeedItemDetailSheet.tsx`** — settlement parties, expense payer, members lists — all via the helpers.

- [ ] **Step 3: Verify component tests still pass**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/
```

Fix snapshots/assertions where the i18n key now appears instead of the literal name (tests previously asserting `'Alice'` may now need to assert `'common.deletedUser'` for the deleted-user case — but for active users the name still renders).

- [ ] **Step 4: Add one new test per component for the deleted case**

For each migrated component, append a test that renders it with `is_active=false` and asserts `'common.deletedUser'` appears (and the avatar is the placeholder). Pattern:

```tsx
it('shows "Deleted user" fallback when is_active=false', () => {
    const { getByText } = render(<FriendBalanceRow friend={{ id: 'x', name: 'OldName', avatar_url: 'http://x', is_active: false, /* required props */ }} />);
    expect(getByText('common.deletedUser')).toBeTruthy();
});
```

- [ ] **Step 5: Commit per component**

```bash
git add cost-share-app/apps/mobile/components/dashboard/FriendBalanceRow.tsx cost-share-app/apps/mobile/__tests__/components/dashboard/FriendBalanceRow.test.tsx
git commit -m "feat(mobile): FriendBalanceRow honors deleted-user fallback"
# repeat per component
```

---

### Task E4: Ensure Avatar component renders placeholder when src is null

**Files:**
- Inspect: `cost-share-app/apps/mobile/components/Avatar.tsx` (or whichever component is the project's avatar primitive).

- [ ] **Step 1: Read the existing Avatar component**

Locate via:

```bash
find cost-share-app/apps/mobile/components -iname "Avatar*"
```

- [ ] **Step 2: Confirm null-handling**

The component must:
- When `src` is null/undefined → render a neutral placeholder (e.g., grey circle with a `person-outline` icon).
- Not derive initials from the name (since for deleted users the name will be `null` and the fallback string is the same for everyone — initials are meaningless).

If the Avatar component currently derives initials from `name`, change the null-src branch to render an icon instead. Add a test:

```tsx
it('renders placeholder when src is null', () => {
    const { getByTestId } = render(<Avatar src={null} />);
    expect(getByTestId('avatar-placeholder')).toBeTruthy();
});
```

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/components/Avatar.tsx cost-share-app/apps/mobile/__tests__/components/Avatar.test.tsx
git commit -m "feat(mobile): Avatar shows neutral placeholder when src is null"
```

> If no Avatar primitive exists and avatars are inlined per component, skip this task and instead include placeholder JSX in each migrated component as part of Task E3.

---

### Task E5: Skip push notifications to deleted users

**Files:**
- Inspect: any edge function / service that sends push notifications.

- [ ] **Step 1: Locate notification dispatch**

```bash
grep -rn "expo.*push\|sendPush\|notifications" cost-share-app/supabase/ cost-share-app/apps/mobile/services/ --include="*.ts" --include="*.sql" | head -30
```

- [ ] **Step 2: Add an `is_active=true` filter to recipient queries**

If push tokens are stored in a table (e.g., `push_tokens` keyed by `user_id`) and dispatch joins on `profiles`, add the filter. If dispatch is done from an edge function, add the filter there.

- [ ] **Step 3: Commit**

```bash
git add <changed files>
git commit -m "feat(notifications): skip push to deleted users"
```

> If notifications are not yet wired (the repo's notifications plan may still be in design), document the requirement in the open PR description for the next person — no commit needed.

---

## Phase F — Verification & Audit of Existing Flow

### Task F1: Run the full mobile test suite

- [ ] **Step 1:**

```bash
cd cost-share-app/apps/mobile && npx jest
```

Expected: all tests pass.

- [ ] **Step 2:** Fix any regression. Commit fixes individually.

---

### Task F2: TypeScript build check

- [ ] **Step 1:**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Expected: 0 errors.

---

### Task F3: Manual E2E smoke (on a Supabase branch project)

These steps **must be done with two distinct Google accounts**, on a non-production Supabase project. Document the result on the PR.

- [ ] **Step 1: Account A — happy delete path**
  - Sign in as A on a fresh install.
  - Settings → Delete account → confirm with email.
  - Expect Toast "Account deleted" and routing back to LoginScreen.
  - Verify in Supabase Studio: `profiles.is_active=false`, `name=NULL`, `email=NULL`, `avatar_url=NULL`; `deleted_account_emails` has the hash; `account_deletions_audit` has a row.

- [ ] **Step 2: Account A — re-signup blocked**
  - From the LoginScreen, sign in again with the same Google account.
  - Expect: Alert "Account deleted" with [Close] [Open mail] buttons. Open mail launches the device's mail client to `sarussilberg@gmail.com`.

- [ ] **Step 3: Account B — sees Deleted user**
  - Sign in as B (a member of a group A was in).
  - In the group screen, A is rendered as "Deleted user" (or "משתמש שנמחק" in Hebrew) with the placeholder avatar.
  - The expense history A was part of still renders with their old amounts but under the "Deleted user" name.

- [ ] **Step 4: Account A — pre-deletion balance warning**
  - Restore A's account manually in Supabase Studio: `UPDATE profiles SET is_active=true, name='A' WHERE id=…; DELETE FROM deleted_account_emails WHERE email_hash=…; UPDATE auth.users SET banned_until=NULL WHERE id=…;` (or recreate).
  - Add an open balance with B.
  - Re-enter Settings → Delete account → expect the red banner with "Settle now" CTA. CTA opens `SettleUpListScreen`. Cancel the deletion. Confirm balance state unchanged.

- [ ] **Step 5: RLS enforcement smoke**
  - With Account A still signed in (token still valid) **immediately after** deletion (use Studio to set `is_active=false` directly to simulate), attempt to create an expense via the app. Expect: server returns RLS violation → app surfaces a generic error.

- [ ] **Step 6:** Document results in the PR description. Open new bugs for any unexpected behaviour.

---

## Phase G — Hand-off Items (deferred)

These items are explicitly out of scope for this PR but tracked so they don't fall off:

- **Storage cleanup edge function** — consumes `storage_cleanup_queue`, deletes from `profile-images` bucket using service role. Until built, an operator can drain the queue manually via Supabase Studio.
- **Public account-deletion info page** — `kupa.pro/account-deletion`. Required for Google Play Data Safety by 2026-Q3. Static page; should reference the in-app flow and the support email.
- **Realtime deactivation push** — listening to `postgres_changes` on the user's own profile row to sign them out immediately if `is_active` flips while a session is open. Low priority; useful only when admin-initiated deletion lands.
- **Account restore RPC** — out of v1 scope; the audit table + `deleted_account_emails` provide enough for a future `restore_account(p_user_id)` RPC that clears the block-list row, unsets `banned_until`, and flips `is_active=true`.

---

## Done Definition

This PR is "done" when:

1. `account-deletion-v2.sql` runs successfully on the remote Supabase branch.
2. All tasks A1–E5 are committed (E2/E3 may span several commits each).
3. `npx jest` and `npx tsc --noEmit` are green in `cost-share-app/apps/mobile`.
4. Phase F manual E2E checklist is completed and posted on the PR.
5. The user has reviewed and approved the PR. Only then merge the Supabase branch and the GitHub PR.
