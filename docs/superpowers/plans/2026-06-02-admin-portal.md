# Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land an in-app admin portal that lets `sarussilberg@gmail.com` (and any future admin) list soft-deleted accounts and restore them, gated by a single DB-enforced boolean.

**Architecture:** New `profiles.is_admin` column drives a `SECURITY DEFINER` helper `is_app_admin()`. Two new admin RPCs (`admin_list_deleted_accounts`, `admin_restore_deleted_account`) gate every call through `is_app_admin()`. Mobile mirrors the flag onto `User.isAdmin`, conditionally renders a Settings entry, and routes through a new `AdminPortal` hub screen with a `AdminDeletedUsers` list screen.

**Tech Stack:**
- DB: Postgres on Supabase (dev project `drxfbicunusmipdgbgdk`), idempotent migration files under `cost-share-app/supabase/migrations/`
- Shared: TypeScript types + mappers in `packages/shared/src/`
- Mobile: React Native (Expo SDK 55) + react-navigation native stack + i18next + Jest + react-native-testing-library

**Spec:** `docs/superpowers/specs/2026-06-02-admin-portal-design.md`

**Working branch:** `dev` (per project memory — no worktrees, no feature branches)

---

## File Map

**Created:**
- `cost-share-app/supabase/migrations/20260602100000_admin_portal_v1.sql` — column + helper + RPCs + seed (idempotent)
- `cost-share-app/supabase/__tests__/admin_portal.test.sql` — DO-block regression (BEGIN…ROLLBACK)
- `cost-share-app/apps/mobile/services/admin.service.ts` — `listDeletedAccounts`, `restoreDeletedAccount`
- `cost-share-app/apps/mobile/__tests__/services/admin.service.test.ts`
- `cost-share-app/apps/mobile/screens/admin/AdminPortalScreen.tsx` — hub
- `cost-share-app/apps/mobile/screens/admin/AdminDeletedUsersScreen.tsx` — list + restore
- `cost-share-app/apps/mobile/__tests__/screens/admin/AdminDeletedUsersScreen.test.tsx`
- `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.admin.test.tsx` — admin-row visibility

**Modified:**
- `cost-share-app/supabase/schema.sql` — append admin block to SSOT mirror
- `cost-share-app/packages/shared/src/types/index.ts` — `User.isAdmin`
- `cost-share-app/packages/shared/src/mappers/index.ts` — map `is_admin`
- `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` — conditional admin row
- `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` — 2 new stack screens
- `cost-share-app/apps/mobile/i18n/locales/he.json`, `cost-share-app/apps/mobile/i18n/locales/en.json`

`users.service.ts`'s `hydrateCurrentUserProfile` already does `select('*')` so it picks up `is_admin` automatically once the column exists — no change needed there.

---

## Task 1: DB migration — column, helper, RPCs, seed

**Files:**
- Create: `cost-share-app/supabase/migrations/20260602100000_admin_portal_v1.sql`
- Modify: `cost-share-app/supabase/schema.sql` (append)

- [ ] **Step 1: Create the migration file**

Write the file with this exact content:

```sql
-- 20260602100000_admin_portal_v1.sql
-- Admin portal v1: profiles.is_admin flag + is_app_admin() helper + 2 admin RPCs.
-- Idempotent. Safe to re-run.

-- ============================================
-- profiles.is_admin
-- ============================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
    ON profiles(is_admin) WHERE is_admin = TRUE;

-- ============================================
-- Seed: bootstrap the single app admin
-- ============================================
UPDATE profiles
    SET is_admin = TRUE
    WHERE id = (
        SELECT id FROM auth.users WHERE lower(email) = 'sarussilberg@gmail.com'
    )
    AND is_admin = FALSE;

-- ============================================
-- is_app_admin() — used by every admin RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN FALSE
        ELSE COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), FALSE)
    END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- ============================================
-- admin_list_deleted_accounts()
-- Latest audit row per user where restored_at IS NULL, with the original email
-- pulled from auth.users (profiles.email is scrubbed on delete).
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_list_deleted_accounts()
RETURNS TABLE (
    user_id               UUID,
    email                 TEXT,
    deleted_at            TIMESTAMPTZ,
    reason                TEXT,
    open_balance_snapshot JSONB,
    notes                 TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH latest AS (
        SELECT DISTINCT ON (a.user_id)
            a.user_id, a.deleted_at, a.reason, a.open_balance_snapshot, a.notes, a.restored_at
        FROM account_deletions_audit a
        ORDER BY a.user_id, a.deleted_at DESC
    )
    SELECT
        l.user_id,
        u.email::TEXT,
        l.deleted_at,
        l.reason,
        l.open_balance_snapshot,
        l.notes
    FROM latest l
    JOIN auth.users u ON u.id = l.user_id
    WHERE l.restored_at IS NULL
    ORDER BY l.deleted_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_deleted_accounts() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_deleted_accounts() TO authenticated;

-- ============================================
-- admin_restore_deleted_account(p_user_id UUID)
-- Thin wrapper around the existing restore_deleted_account, stamping
-- 'restored_by_admin:<auth.uid()>' into the audit notes.
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_restore_deleted_account(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_admin UUID := auth.uid();
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    PERFORM public.restore_deleted_account(
        p_user_id,
        NULL,
        'restored_by_admin:' || v_admin::text
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_restore_deleted_account(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_restore_deleted_account(UUID) TO authenticated;
```

- [ ] **Step 2: Append the same block to `cost-share-app/supabase/schema.sql`**

Append at the end of the file (after the last existing section), prefixed with a clear header comment:

```sql
-- ============================================
-- ADMIN PORTAL v1 (also lives in migrations/20260602100000_admin_portal_v1.sql)
-- ============================================
-- … paste the exact same SQL body from Step 1 here …
```

The schema.sql block is the SSOT mirror for fresh-DB rebuilds; the migration file is what Supabase actually applies on push.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/migrations/20260602100000_admin_portal_v1.sql \
        cost-share-app/supabase/schema.sql
git commit -m "Add admin portal v1 DB: is_admin column, helper, RPCs, seed."
```

---

## Task 2: DB regression test (DO-block, BEGIN…ROLLBACK)

**Files:**
- Create: `cost-share-app/supabase/__tests__/admin_portal.test.sql`

- [ ] **Step 1: Write the test file**

Mirror the style of `cost-share-app/supabase/__tests__/activity_events.test.sql`. Full content:

```sql
-- ============================================================================
-- Regression tests for admin portal v1.
-- Run via Supabase MCP (mcp__supabase__execute_sql) against the dev project
-- drxfbicunusmipdgbgdk. The transaction ROLLBACKs at the end.
-- ============================================================================

BEGIN;
SET LOCAL session_replication_role = replica;

DO $outer$
DECLARE
    v_admin  CONSTANT UUID := '00000000-0000-0000-0000-0000000ad000';
    v_alice  CONSTANT UUID := '00000000-0000-0000-0000-0000000ad001';
    v_bob    CONSTANT UUID := '00000000-0000-0000-0000-0000000ad002';
    v_rows   INT;
    v_notes  TEXT;
    v_email  TEXT;
    v_caught BOOLEAN;
BEGIN
    -- ---- seed users ----------------------------------------------------
    INSERT INTO auth.users (id, email) VALUES
        (v_admin, 'ap-admin@test.local'),
        (v_alice, 'ap-alice@test.local'),
        (v_bob,   'ap-bob@test.local');

    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, is_admin, invite_token) VALUES
        (v_admin, 'ap-admin@test.local', 'Admin', 'USD', 'en', TRUE, TRUE,  'tt_ap_admin'),
        (v_alice, 'ap-alice@test.local', 'Alice', 'USD', 'en', TRUE, FALSE, 'tt_ap_alice'),
        (v_bob,   'ap-bob@test.local',   'Bob',   'USD', 'en', TRUE, FALSE, 'tt_ap_bob');

    -- Simulate two soft-deletions: Alice (currently deleted), Bob (deleted then restored).
    UPDATE profiles SET is_active = FALSE, deleted_at = NOW(), email = NULL, name = NULL
        WHERE id IN (v_alice, v_bob);

    INSERT INTO account_deletions_audit (user_id, email_hash, reason)
        VALUES (v_alice, 'hash_alice', 'self_service'),
               (v_bob,   'hash_bob',   'self_service');

    -- Bob is already restored (older audit row remains, restored_at set).
    UPDATE account_deletions_audit SET restored_at = NOW() WHERE user_id = v_bob;
    UPDATE profiles SET is_active = TRUE, email = 'ap-bob@test.local', name = 'Bob' WHERE id = v_bob;

    -- ---- CASE 1: is_app_admin() ---------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Case 1a failed: is_app_admin() should return TRUE for admin';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice::text)::text, TRUE);
    IF public.is_app_admin() THEN
        RAISE EXCEPTION 'Case 1b failed: is_app_admin() should return FALSE for non-admin';
    END IF;

    -- ---- CASE 2: admin_list_deleted_accounts() ------------------------
    -- 2a: non-admin gets not_authorized
    v_caught := FALSE;
    BEGIN
        PERFORM public.admin_list_deleted_accounts();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'not_authorized' THEN v_caught := TRUE; END IF;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Case 2a failed: non-admin should get not_authorized';
    END IF;

    -- 2b: admin sees Alice (deleted, not restored) but not Bob (restored)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    SELECT COUNT(*) INTO v_rows FROM public.admin_list_deleted_accounts();
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'Case 2b failed: expected 1 row, got %', v_rows;
    END IF;
    SELECT email INTO v_email FROM public.admin_list_deleted_accounts() LIMIT 1;
    IF v_email <> 'ap-alice@test.local' THEN
        RAISE EXCEPTION 'Case 2c failed: expected ap-alice@test.local, got %', v_email;
    END IF;

    -- ---- CASE 3: admin_restore_deleted_account(uuid) ------------------
    -- 3a: non-admin → not_authorized
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice::text)::text, TRUE);
    v_caught := FALSE;
    BEGIN
        PERFORM public.admin_restore_deleted_account(v_alice);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'not_authorized' THEN v_caught := TRUE; END IF;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Case 3a failed: non-admin should get not_authorized';
    END IF;

    -- 3b: admin restores Alice; notes contain restored_by_admin:<admin uuid>
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    PERFORM public.admin_restore_deleted_account(v_alice);

    SELECT notes INTO v_notes FROM account_deletions_audit
        WHERE user_id = v_alice ORDER BY deleted_at DESC LIMIT 1;
    IF v_notes IS NULL OR position('restored_by_admin:' || v_admin::text IN v_notes) = 0 THEN
        RAISE EXCEPTION 'Case 3b failed: notes missing restored_by_admin marker, got %', v_notes;
    END IF;

    -- 3c: list now returns 0 rows for the admin
    SELECT COUNT(*) INTO v_rows FROM public.admin_list_deleted_accounts();
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'Case 3c failed: after restore expected 0 rows, got %', v_rows;
    END IF;

    RAISE NOTICE 'admin_portal.test.sql — all cases passed';
END;
$outer$;

ROLLBACK;
```

- [ ] **Step 2: Run the test via Supabase MCP**

Tool: `mcp__supabase__execute_sql`
Project: `drxfbicunusmipdgbgdk` (dev)
SQL: paste the full file contents.

Expected: query completes with `NOTICE: admin_portal.test.sql — all cases passed`. Any `EXCEPTION` means a regression — fix and re-run.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/__tests__/admin_portal.test.sql
git commit -m "Add admin_portal regression test (DO-block, rollback)."
```

---

## Task 3: Apply migration to dev DB

This pushes Task 1's migration to the dev project so the rest of the work has a real backend to talk to.

- [ ] **Step 1: Apply via Supabase MCP**

Tool: `mcp__supabase__execute_sql`
Project: `drxfbicunusmipdgbgdk`
SQL: paste the entire body of `cost-share-app/supabase/migrations/20260602100000_admin_portal_v1.sql`.

Expected: each `ALTER TABLE` / `CREATE INDEX` / `CREATE OR REPLACE FUNCTION` / `UPDATE` / `REVOKE` / `GRANT` reports success.

(Alternative: from `cost-share-app/`, run `supabase db push` if you have CLI auth configured. The migration is idempotent so either path is safe.)

- [ ] **Step 2: Verify the seed worked**

Tool: `mcp__supabase__execute_sql`
Project: `drxfbicunusmipdgbgdk`
SQL:

```sql
SELECT p.id, u.email, p.is_admin
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = TRUE;
```

Expected: exactly one row, `email = sarussilberg@gmail.com`, `is_admin = TRUE`. If zero rows: the auth user doesn't exist yet — the admin must sign up first, then re-run the seed.

- [ ] **Step 3: No commit** (DB-only change; the migration file was already committed in Task 1).

---

## Task 4: Shared type — `User.isAdmin`

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts:22-34`
- Modify: `cost-share-app/packages/shared/src/mappers/index.ts:20-35`

- [ ] **Step 1: Add `isAdmin` to the `User` interface**

In `packages/shared/src/types/index.ts`, in the `User` interface (currently lines 22–34), add the field right after `isActive`:

```ts
isActive: boolean;  // Soft-delete flag — false means the user has deleted their account
isAdmin: boolean;   // App-admin flag (gates admin portal entry in Settings)
createdAt: Date;
updatedAt: Date;
```

- [ ] **Step 2: Map `is_admin` in `profileFromRow`**

In `packages/shared/src/mappers/index.ts`, inside `profileFromRow` (currently lines 20–35), add the field right after `isActive`:

```ts
isActive: r.is_active === undefined ? true : (r.is_active as boolean),
isAdmin: r.is_admin === true,
createdAt: toDate(r.created_at),
```

The defensive `=== true` default to `false` matters: any call site that select-projects without `is_admin` will treat the user as non-admin.

- [ ] **Step 3: Typecheck**

From repo root:

```bash
cd cost-share-app && pnpm -F @cost-share/shared build
```

Expected: clean build, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts \
        cost-share-app/packages/shared/src/mappers/index.ts
git commit -m "Add User.isAdmin (shared types + mapper)."
```

---

## Task 5: Admin service — tests first, then implementation

**Files:**
- Test: `cost-share-app/apps/mobile/__tests__/services/admin.service.test.ts`
- Create: `cost-share-app/apps/mobile/services/admin.service.ts`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/services/admin.service.test.ts`:

```ts
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));

import { listDeletedAccounts, restoreDeletedAccount } from '../../services/admin.service';

beforeEach(() => {
    mockRpc.mockReset();
});

describe('listDeletedAccounts', () => {
    it('returns mapped rows on success', async () => {
        mockRpc.mockResolvedValue({
            data: [
                {
                    user_id: 'u1',
                    email: 'a@test.local',
                    deleted_at: '2026-06-01T10:00:00Z',
                    reason: 'self_service',
                    open_balance_snapshot: { summary: [] },
                    notes: null,
                },
            ],
            error: null,
        });

        const result = await listDeletedAccounts();

        expect(mockRpc).toHaveBeenCalledWith('admin_list_deleted_accounts');
        expect(result).toEqual([
            {
                userId: 'u1',
                email: 'a@test.local',
                deletedAt: new Date('2026-06-01T10:00:00Z'),
                reason: 'self_service',
                openBalanceSnapshot: { summary: [] },
                notes: null,
            },
        ]);
    });

    it('returns empty array on RPC error', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        const result = await listDeletedAccounts();
        expect(result).toEqual([]);
    });
});

describe('restoreDeletedAccount', () => {
    it('returns ok on success', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });
        const result = await restoreDeletedAccount('u1');
        expect(mockRpc).toHaveBeenCalledWith('admin_restore_deleted_account', { p_user_id: 'u1' });
        expect(result).toEqual({ ok: true });
    });

    it('maps not_authorized error to i18n key', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
        const result = await restoreDeletedAccount('u1');
        expect(result).toEqual({ ok: false, error: 'admin.errors.notAuthorized' });
    });

    it('maps generic error to a generic i18n key', async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
        const result = await restoreDeletedAccount('u1');
        expect(result).toEqual({ ok: false, error: 'admin.deletedUsers.restoreError' });
    });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/services/admin.service.test.ts
```

Expected: FAIL (`Cannot find module '../../services/admin.service'`).

- [ ] **Step 3: Implement the service**

Create `cost-share-app/apps/mobile/services/admin.service.ts`:

```ts
/**
 * Admin Service — admin-only RPCs (gated by is_app_admin() on the DB).
 */
import { supabase } from '../lib/supabase';

export interface DeletedAccount {
    userId: string;
    email: string;
    deletedAt: Date;
    reason: string;
    openBalanceSnapshot: unknown;
    notes: string | null;
}

export interface RestoreResult {
    ok: boolean;
    error?: string; // i18n key
}

type Row = {
    user_id: string;
    email: string;
    deleted_at: string;
    reason: string;
    open_balance_snapshot: unknown;
    notes: string | null;
};

export async function listDeletedAccounts(): Promise<DeletedAccount[]> {
    const { data, error } = await supabase.rpc('admin_list_deleted_accounts');
    if (error || !data) {
        if (error) console.warn('listDeletedAccounts: RPC failed', error);
        return [];
    }
    return (data as Row[]).map((r) => ({
        userId: r.user_id,
        email: r.email,
        deletedAt: new Date(r.deleted_at),
        reason: r.reason,
        openBalanceSnapshot: r.open_balance_snapshot,
        notes: r.notes,
    }));
}

export async function restoreDeletedAccount(userId: string): Promise<RestoreResult> {
    const { error } = await supabase.rpc('admin_restore_deleted_account', { p_user_id: userId });
    if (!error) return { ok: true };

    console.warn('restoreDeletedAccount: RPC failed', error);
    if (error.message === 'not_authorized') {
        return { ok: false, error: 'admin.errors.notAuthorized' };
    }
    return { ok: false, error: 'admin.deletedUsers.restoreError' };
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/services/admin.service.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/admin.service.ts \
        cost-share-app/apps/mobile/__tests__/services/admin.service.test.ts
git commit -m "Add admin service (list + restore deleted accounts)."
```

---

## Task 6: i18n strings

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`

- [ ] **Step 1: Locate the right insertion point in each JSON**

Both files use a flat object with namespaced keys (`settings.*`, `profile.*`, etc.). Add a new top-level `admin` object **and** an `adminPortal` key under the existing `settings` object.

- [ ] **Step 2: Add Hebrew strings**

In `cost-share-app/apps/mobile/i18n/locales/he.json`, under the existing `"settings"` object, add a key:

```json
"adminPortal": "פורטל מנהלים"
```

…then add a new top-level `"admin"` object (place it alphabetically next to `"settings"` or wherever convenient):

```json
"admin": {
    "portal": {
        "title": "פורטל מנהלים",
        "sectionLabel": "כלי ניהול",
        "deletedUsersRow": "משתמשים שנמחקו"
    },
    "deletedUsers": {
        "title": "משתמשים שנמחקו",
        "empty": "אין משתמשים שנמחקו כרגע",
        "deletedAtRelative": "נמחק {{when}}",
        "restoreCta": "שחזר",
        "confirmTitle": "לשחזר את {{email}}?",
        "confirmMessage": "המשתמש יוכל להתחבר מחדש ויראה את כל הקבוצות, החברים וההוצאות שלו.",
        "restoreSuccess": "המשתמש שוחזר",
        "restoreError": "השחזור נכשל. נסה שוב."
    },
    "errors": {
        "notAuthorized": "אין לך הרשאה לפעולה הזו"
    }
}
```

- [ ] **Step 3: Add English strings**

In `cost-share-app/apps/mobile/i18n/locales/en.json`, mirror the structure:

Under `"settings"`:
```json
"adminPortal": "Admin Portal"
```

And the new top-level `"admin"` object:

```json
"admin": {
    "portal": {
        "title": "Admin Portal",
        "sectionLabel": "Tools",
        "deletedUsersRow": "Deleted users"
    },
    "deletedUsers": {
        "title": "Deleted users",
        "empty": "No deleted users at the moment",
        "deletedAtRelative": "Deleted {{when}}",
        "restoreCta": "Restore",
        "confirmTitle": "Restore {{email}}?",
        "confirmMessage": "The user will be able to sign in again and recover all their groups, friends and expenses.",
        "restoreSuccess": "User restored",
        "restoreError": "Restore failed. Please try again."
    },
    "errors": {
        "notAuthorized": "You don't have permission for this action"
    }
}
```

- [ ] **Step 4: Verify JSON validity**

```bash
cd cost-share-app/apps/mobile && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/he.json'))" \
  && node -e "JSON.parse(require('fs').readFileSync('i18n/locales/en.json'))"
```

Expected: no output (both files parse successfully).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/he.json \
        cost-share-app/apps/mobile/i18n/locales/en.json
git commit -m "Add i18n strings for admin portal (he, en)."
```

---

## Task 7: AdminPortalScreen (hub) and AdminDeletedUsersScreen (list + restore)

**Files:**
- Create: `cost-share-app/apps/mobile/screens/admin/AdminPortalScreen.tsx`
- Create: `cost-share-app/apps/mobile/screens/admin/AdminDeletedUsersScreen.tsx`
- Test: `cost-share-app/apps/mobile/__tests__/screens/admin/AdminDeletedUsersScreen.test.tsx`
- Modify: `cost-share-app/apps/mobile/components/ConfirmDialog.tsx` (add `confirmTestID?: string`)

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/screens/admin/AdminDeletedUsersScreen.test.tsx`:

```tsx
const mockListDeletedAccounts = jest.fn();
const mockRestoreDeletedAccount = jest.fn();
jest.mock('../../../services/admin.service', () => ({
    listDeletedAccounts: (...a: any[]) => mockListDeletedAccounts(...a),
    restoreDeletedAccount: (...a: any[]) => mockRestoreDeletedAccount(...a),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AdminDeletedUsersScreen } from '../../../screens/admin/AdminDeletedUsersScreen';

beforeEach(() => {
    mockListDeletedAccounts.mockReset();
    mockRestoreDeletedAccount.mockReset();
});

const sampleRow = {
    userId: 'u1',
    email: 'a@test.local',
    deletedAt: new Date('2026-06-01T10:00:00Z'),
    reason: 'self_service',
    openBalanceSnapshot: null,
    notes: null,
};

describe('AdminDeletedUsersScreen', () => {
    it('renders the list when RPC returns rows', async () => {
        mockListDeletedAccounts.mockResolvedValue([sampleRow]);
        render(<AdminDeletedUsersScreen />);
        await waitFor(() => expect(screen.getByText('a@test.local')).toBeTruthy());
    });

    it('shows the empty state when RPC returns no rows', async () => {
        mockListDeletedAccounts.mockResolvedValue([]);
        render(<AdminDeletedUsersScreen />);
        await waitFor(() =>
            expect(screen.getByText(/no deleted users|אין משתמשים/i)).toBeTruthy()
        );
    });

    it('calls restore RPC and refreshes the list on confirm', async () => {
        mockListDeletedAccounts
            .mockResolvedValueOnce([sampleRow])
            .mockResolvedValueOnce([]);
        mockRestoreDeletedAccount.mockResolvedValue({ ok: true });

        render(<AdminDeletedUsersScreen />);
        await waitFor(() => screen.getByText('a@test.local'));

        fireEvent.press(screen.getByTestId('admin-restore-u1'));
        fireEvent.press(screen.getByTestId('admin-restore-confirm'));

        await waitFor(() => expect(mockRestoreDeletedAccount).toHaveBeenCalledWith('u1'));
        await waitFor(() => expect(mockListDeletedAccounts).toHaveBeenCalledTimes(2));
    });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/screens/admin/AdminDeletedUsersScreen.test.tsx
```

Expected: FAIL (`Cannot find module '../../../screens/admin/AdminDeletedUsersScreen'`).

- [ ] **Step 3: Extend `ConfirmDialog` with an optional `confirmTestID` prop**

In `cost-share-app/apps/mobile/components/ConfirmDialog.tsx`:

```tsx
interface ConfirmDialogProps {
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    destructive?: boolean;
    confirmTestID?: string;   // ← add
}
```

And pass it to the confirm button:

```tsx
<TouchableOpacity
    onPress={onConfirm}
    testID={confirmTestID}                     // ← add
    className={`flex-1 rounded-lg p-4 ${destructive ? 'bg-red-500' : 'bg-blue-500'}`}
>
```

Existing call sites stay green (the prop is optional).

- [ ] **Step 4: Create `AdminDeletedUsersScreen.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../../components/AppText';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { listDeletedAccounts, restoreDeletedAccount, type DeletedAccount } from '../../services/admin.service';

export function AdminDeletedUsersScreen() {
    const { t } = useTranslation();
    const [rows, setRows] = useState<DeletedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pending, setPending] = useState<DeletedAccount | null>(null);

    const load = useCallback(async () => {
        const next = await listDeletedAccounts();
        setRows(next);
    }, []);

    useEffect(() => {
        (async () => {
            await load();
            setLoading(false);
        })();
    }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await load(); } finally { setRefreshing(false); }
    }, [load]);

    const onConfirmRestore = useCallback(async () => {
        if (!pending) return;
        const target = pending;
        setPending(null);
        const result = await restoreDeletedAccount(target.userId);
        if (result.ok) {
            Toast.show({ type: 'success', text1: t('admin.deletedUsers.restoreSuccess') });
            await load();
        } else {
            Toast.show({ type: 'error', text1: t(result.error ?? 'admin.deletedUsers.restoreError') });
        }
    }, [pending, t, load]);

    if (!loading && rows.length === 0) {
        return (
            <View className="flex-1 items-center justify-center bg-slate-50 px-8">
                <Text className="text-gray-500 text-center">{t('admin.deletedUsers.empty')}</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={rows}
                keyExtractor={(r) => r.userId}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ paddingVertical: 12 }}
                renderItem={({ item }) => (
                    <View className="flex-row items-center bg-white px-4 py-3 mx-3 mb-2 rounded-xl">
                        <View className="flex-1">
                            <Text className="text-base text-gray-900">{item.email}</Text>
                            <Text className="text-xs text-gray-500 mt-0.5">
                                {t('admin.deletedUsers.deletedAtRelative', {
                                    when: item.deletedAt.toLocaleDateString(),
                                })}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setPending(item)}
                            testID={`admin-restore-${item.userId}`}
                            className="bg-primary px-4 py-2 rounded-lg"
                        >
                            <Text className="text-white font-medium">{t('admin.deletedUsers.restoreCta')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            />
            <ConfirmDialog
                visible={pending !== null}
                title={t('admin.deletedUsers.confirmTitle', { email: pending?.email ?? '' })}
                message={t('admin.deletedUsers.confirmMessage')}
                confirmText={t('admin.deletedUsers.restoreCta')}
                cancelText={t('common.cancel')}
                onConfirm={onConfirmRestore}
                onCancel={() => setPending(null)}
                confirmTestID="admin-restore-confirm"
            />
        </View>
    );
}
```

- [ ] **Step 5: Create `AdminPortalScreen.tsx` (hub)**

```tsx
import React from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SettingsRow } from '../../components/settings/SettingsRow';

export function AdminPortalScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <SettingsSection title={t('admin.portal.sectionLabel')}>
                <SettingsRow
                    iconName="trash-outline"
                    label={t('admin.portal.deletedUsersRow')}
                    variant="chevron"
                    onPress={() => navigation.navigate('AdminDeletedUsers')}
                    testID="admin-portal-deleted-users"
                />
            </SettingsSection>
        </ScrollView>
    );
}
```

- [ ] **Step 6: Run the test — verify it passes**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/screens/admin/AdminDeletedUsersScreen.test.tsx
```

Expected: PASS (all 3 tests).

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/screens/admin/ \
        cost-share-app/apps/mobile/__tests__/screens/admin/ \
        cost-share-app/apps/mobile/components/ConfirmDialog.tsx
git commit -m "Add AdminPortalScreen + AdminDeletedUsersScreen with restore flow."
```

---

## Task 8: Wire routes + conditional Settings row

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx:51-67, 233-247`
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Test: `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.admin.test.tsx`

- [ ] **Step 1: Write the failing visibility test**

Create `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.admin.test.tsx`:

```tsx
jest.mock('../../../store', () => {
    const state: any = {
        language: 'he',
        currentUser: null,
        setLanguage: jest.fn(),
        setCurrentUser: jest.fn(),
    };
    const useAppStore = (selector: any) => selector(state);
    (useAppStore as any).getState = () => state;
    (useAppStore as any).__setUser = (u: any) => { state.currentUser = u; };
    return { useAppStore };
});

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../../../services/account.service', () => ({
    deleteMyAccount: jest.fn(),
    getMyOpenBalances: jest.fn().mockResolvedValue(null),
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SettingsScreen } from '../../../screens/profile/SettingsScreen';
import { useAppStore } from '../../../store';

const baseUser = {
    id: 'u1', name: 'Sar', email: 'sar@test.local', inviteToken: 'tok',
    defaultCurrency: 'ILS', language: 'he', isActive: true, isAdmin: false,
    createdAt: new Date(), updatedAt: new Date(),
};

describe('SettingsScreen admin row', () => {
    it('hides the admin row when currentUser.isAdmin is false', () => {
        (useAppStore as any).__setUser({ ...baseUser, isAdmin: false });
        render(<SettingsScreen />);
        expect(screen.queryByTestId('settings-admin-portal')).toBeNull();
    });

    it('shows the admin row when currentUser.isAdmin is true', () => {
        (useAppStore as any).__setUser({ ...baseUser, isAdmin: true });
        render(<SettingsScreen />);
        expect(screen.getByTestId('settings-admin-portal')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/screens/profile/SettingsScreen.admin.test.tsx
```

Expected: FAIL (the row doesn't exist yet → `getByTestId('settings-admin-portal')` throws on the second test).

- [ ] **Step 3: Add the conditional row to `SettingsScreen.tsx`**

In `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`, inside the JSX returned by `SettingsScreen`, **directly after** the `<SettingsSection title={t('settings.general')}>` block (before the support section), insert:

```tsx
{currentUser?.isAdmin ? (
    <SettingsSection title={t('settings.adminPortal')}>
        <SettingsRow
            iconName="shield-checkmark-outline"
            label={t('settings.adminPortal')}
            variant="chevron"
            onPress={() => navigation.navigate('AdminPortal')}
            testID="settings-admin-portal"
        />
    </SettingsSection>
) : null}
```

`shield-checkmark-outline` is an Ionicon already in the AppIcon set. If `AppIconName` doesn't accept it, fall back to `'lock-closed-outline'`.

- [ ] **Step 4: Register the two routes in `AppNavigator.tsx`**

In `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`:

(a) Add the imports near the other screen imports (around line 65):

```tsx
import { AdminPortalScreen } from '../screens/admin/AdminPortalScreen';
import { AdminDeletedUsersScreen } from '../screens/admin/AdminDeletedUsersScreen';
```

(b) Inside the profile stack, **directly after** the existing `<Stack.Screen name="Settings" ... />` block (around line 233–237), add:

```tsx
<Stack.Screen
    name="AdminPortal"
    component={AdminPortalScreen}
    options={{ title: t('admin.portal.title') }}
/>
<Stack.Screen
    name="AdminDeletedUsers"
    component={AdminDeletedUsersScreen}
    options={{ title: t('admin.deletedUsers.title') }}
/>
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/screens/profile/SettingsScreen.admin.test.tsx
```

Expected: PASS (both tests).

- [ ] **Step 6: Run the broader Settings test suite to catch regressions**

```bash
cd cost-share-app/apps/mobile && pnpm jest __tests__/screens/profile
```

Expected: all PASS. If existing Settings tests break because they mock `useAppStore` differently and now expect `currentUser?.isAdmin` to be defined — extend their mocks to include `isAdmin: false`.

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx \
        cost-share-app/apps/mobile/navigation/AppNavigator.tsx \
        cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.admin.test.tsx
git commit -m "Wire admin portal: conditional Settings row + 2 stack routes."
```

---

## Task 9: Full mobile test suite + manual smoke

- [ ] **Step 1: Run the full mobile test suite**

```bash
cd cost-share-app/apps/mobile && pnpm test
```

Expected: all PASS. If a previously-green test breaks because its `useAppStore` mock now needs `isAdmin: false`, extend the mock — don't lower the new assertion.

- [ ] **Step 2: Run the shared package build & typecheck**

```bash
cd cost-share-app && pnpm -F @cost-share/shared build && pnpm -F mobile typecheck
```

Expected: clean.

- [ ] **Step 3: Manual smoke (Expo dev client or web)**

Start the dev client (`pnpm -F mobile start`) and verify each of the following manually:

  - Log in as `sarussilberg@gmail.com` → Settings → "פורטל מנהלים" row appears → tap → AdminPortal hub → tap "משתמשים שנמחקו" → list renders (may be empty on dev — that's fine).
  - Log in as any **other** user → Settings → row does **not** appear.
  - With a test account: delete the test account from its Settings, switch back to the admin, refresh the list, restore the test account, verify the test user can sign in again and their data is intact.

Document any issue found and fix before pushing.

- [ ] **Step 4: Push to `dev`**

```bash
git push origin dev
```

Expected: push succeeds. Supabase migration CI will re-apply the (idempotent) migration on the dev project — should be a no-op because Task 3 already applied it.

---

## Spec-coverage self-check (already done while writing)

| Spec section | Covered by |
|---|---|
| `profiles.is_admin` column + index + seed | Task 1 |
| `is_app_admin()` helper | Task 1 |
| `admin_list_deleted_accounts()` RPC | Task 1 |
| `admin_restore_deleted_account()` RPC | Task 1 |
| DB tests | Task 2 |
| Apply migration to dev | Task 3 |
| `User.isAdmin` shared type + mapper | Task 4 |
| Profile-select call sites pick up `is_admin` | `hydrateCurrentUserProfile` already uses `select('*')` (verified pre-plan), so it auto-picks up the new column after Task 1 lands. No code change needed. |
| `admin.service.ts` | Task 5 |
| `admin.service` tests | Task 5 |
| i18n he + en | Task 6 |
| `AdminPortalScreen` | Task 7 |
| `AdminDeletedUsersScreen` + restore flow | Task 7 |
| `SettingsScreen` conditional row + test | Task 8 |
| Navigation routes | Task 8 |
| Manual smoke | Task 9 |

## Out of scope (per spec)

- Granting/revoking admin from UI
- Role tiers, multi-admin grants audit
- Pagination/search/filter on deleted users
- Hard-delete from admin portal
- Prod DB migration (separate work when dev → main merges)
