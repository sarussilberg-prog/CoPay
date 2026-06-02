# Block deleted users from signing in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deleted user cannot obtain or use an authenticated app session, even after the OAuth flow or with stranded refresh tokens.

**Architecture:** Two layered changes. (1) DB: `delete_my_account()` revokes the user's `auth.sessions` and `auth.refresh_tokens` in addition to setting `banned_until` + `is_active=false`; a one-time idempotent backfill cleans up rows stranded by past deletions. (2) App: extract `acceptSessionIfAllowed` out of `App.tsx` into its own module, add a `mode: 'fresh' | 'hydration'` parameter, and fail-closed on `'unknown'` status only for fresh sign-ins (the hydration path keeps current offline-tolerant behavior).

**Tech Stack:** PostgreSQL/Supabase SQL migrations, Supabase CLI migration system (`supabase/migrations/<YYYYMMDDhhmmss>_*.sql` auto-applied by `.github/workflows/deploy-staging.yml` and `deploy-production.yml`), TypeScript + Jest for mobile tests, Supabase MCP (`mcp__supabase__apply_migration`, `mcp__supabase__execute_sql`) against the dev project `drxfbicunusmipdgbgdk`.

**Spec:** `docs/superpowers/specs/2026-06-02-block-deleted-user-signin-design.md`

---

## File Structure

| Path | Change | Responsibility |
|------|--------|----------------|
| `cost-share-app/supabase/__tests__/delete_my_account.test.sql` | Create | DO-block + ROLLBACK regression: deleting an account revokes sessions and refresh tokens. |
| `cost-share-app/supabase/migrations/<YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql` | Create | Migration: redefine `delete_my_account()` to revoke sessions/refresh tokens; one-time backfill for users already inactive. |
| `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts` | Create | Extracted session-gate logic with `mode: 'fresh' \| 'hydration'`. Fresh-mode `'unknown'` ⇒ reject. |
| `cost-share-app/apps/mobile/__tests__/lib/acceptSessionIfAllowed.test.ts` | Create | Jest tests covering all four (mode × status) combinations that materially differ. |
| `cost-share-app/apps/mobile/App.tsx` | Modify | Delegate to the extracted module; pass `'hydration'` from cold-start hydration and `'fresh'` from the `'SIGNED_IN'` event. |

The DB and App changes are independent and can be implemented in any order, but the plan below is written top-down (DB first) so the same engineer can keep context.

---

## Task 1: DB regression test (currently failing)

**Files:**
- Create: `cost-share-app/supabase/__tests__/delete_my_account.test.sql`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/supabase/__tests__/delete_my_account.test.sql` with the following exact content:

```sql
-- ============================================================================
-- Regression test: delete_my_account() must revoke the user's auth sessions
-- and refresh tokens (so the deleted user cannot stay signed in or refresh).
-- Run via Supabase MCP (mcp__supabase__execute_sql) against the dev project
-- drxfbicunusmipdgbgdk. The transaction ROLLBACKs at the end.
-- ============================================================================

BEGIN;
SET LOCAL session_replication_role = replica;

DO $outer$
DECLARE
    v_user        CONSTANT UUID := '00000000-0000-0000-0000-0000000de100';
    v_email       CONSTANT TEXT := 'del-test@test.local';
    v_session_id  CONSTANT UUID := '00000000-0000-0000-0000-0000000de200';
    v_sessions    INT;
    v_tokens      INT;
    v_banned      TIMESTAMPTZ;
    v_active      BOOLEAN;
BEGIN
    -- ---- seed user + active session + refresh token ---------------------
    INSERT INTO auth.users (id, email) VALUES (v_user, v_email);

    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token)
        VALUES (v_user, v_email, 'DeleteMe', 'USD', 'en', TRUE, 'tt_dm_test');

    INSERT INTO auth.sessions (id, user_id) VALUES (v_session_id, v_user);
    INSERT INTO auth.refresh_tokens (user_id, session_id, token, revoked)
        VALUES (v_user::text, v_session_id, 'rt_test_token_dm', FALSE);

    -- ---- call delete_my_account() as the user --------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, TRUE);
    PERFORM public.delete_my_account();

    -- ---- assertions ----------------------------------------------------
    SELECT is_active INTO v_active FROM public.profiles WHERE id = v_user;
    IF v_active IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Case A failed: profiles.is_active should be FALSE, got %', v_active;
    END IF;

    SELECT banned_until INTO v_banned FROM auth.users WHERE id = v_user;
    IF v_banned IS NULL OR v_banned < NOW() THEN
        RAISE EXCEPTION 'Case B failed: auth.users.banned_until should be future/infinity, got %', v_banned;
    END IF;

    SELECT COUNT(*) INTO v_sessions FROM auth.sessions WHERE user_id = v_user;
    IF v_sessions <> 0 THEN
        RAISE EXCEPTION 'Case C failed: expected 0 sessions after delete, got %', v_sessions;
    END IF;

    SELECT COUNT(*) INTO v_tokens FROM auth.refresh_tokens WHERE user_id = v_user::text;
    IF v_tokens <> 0 THEN
        RAISE EXCEPTION 'Case D failed: expected 0 refresh tokens after delete, got %', v_tokens;
    END IF;

    RAISE NOTICE 'delete_my_account.test.sql — all cases passed';
END;
$outer$;

ROLLBACK;
```

- [ ] **Step 2: Run test to verify it FAILS**

Run the test via Supabase MCP against dev:

```
mcp__supabase__execute_sql query=<contents of delete_my_account.test.sql>
```

Expected: the DO-block raises `Case C failed: expected 0 sessions after delete, got 1` (or `Case D failed: ... refresh tokens ...`). This proves the current `delete_my_account()` does not revoke sessions/tokens.

If the test passes already, stop and investigate — the migration in Task 2 may have been applied out-of-band.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/__tests__/delete_my_account.test.sql
git commit -m "test: add failing regression for delete_my_account session revoke"
```

---

## Task 2: DB migration — revoke sessions + refresh tokens on delete, backfill

**Files:**
- Create: `cost-share-app/supabase/migrations/<YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql`

- [ ] **Step 1: Create the migration file with the project convention**

From `cost-share-app/`, run:

```bash
cd cost-share-app && supabase migration new revoke_sessions_on_delete
```

This creates an empty file named `cost-share-app/supabase/migrations/<YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql`. (If the CLI is not available locally, manually create a file with that name using a current UTC timestamp matching the `YYYYMMDDhhmmss` pattern of the other files in that directory.)

- [ ] **Step 2: Fill in the migration**

Replace the empty file's contents with:

```sql
-- <YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql
-- Extend delete_my_account() to revoke the user's existing auth sessions and
-- refresh tokens (so the deleted user cannot keep using or refreshing them).
-- Also runs a one-time idempotent backfill that revokes any rows currently
-- stranded for users where profiles.is_active = FALSE.
-- Safe to re-run.

-- ============================================
-- delete_my_account() — replaces account-deletion-v2.sql definition
-- Identical to the previous body PLUS two DELETEs against auth.sessions
-- and auth.refresh_tokens for the caller.
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
    v_hash := encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex');

    BEGIN
        v_balance := get_user_balance_summary(v_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_balance := jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
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
        SET banned_until = 'infinity'::timestamptz
        WHERE id = v_user_id;

    -- Revoke active sessions and refresh tokens so the deleted user cannot
    -- keep an existing session alive or mint new access tokens via refresh.
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
    DELETE FROM auth.sessions       WHERE user_id = v_user_id;

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

-- ============================================
-- One-time backfill: revoke stranded sessions / refresh tokens for users
-- already soft-deleted (profiles.is_active = FALSE). Idempotent.
-- ============================================
DELETE FROM auth.refresh_tokens
WHERE user_id IN (
    SELECT id::text FROM public.profiles WHERE is_active = FALSE
);

DELETE FROM auth.sessions
WHERE user_id IN (
    SELECT id FROM public.profiles WHERE is_active = FALSE
);
```

- [ ] **Step 3: Run the regression test from Task 1 against dev — verify it now PASSES**

Run via `mcp__supabase__execute_sql` with the same SQL as Task 1 Step 2. Expected: the DO-block raises `NOTICE: delete_my_account.test.sql — all cases passed` (no exception).

If anything other than the success notice appears, stop and inspect.

- [ ] **Step 4: Commit the migration**

```bash
git add cost-share-app/supabase/migrations/<YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql
git commit -m "feat(db): revoke auth sessions + refresh tokens on account delete"
```

---

## Task 3: Apply migration to dev DB and verify backfill

**Files:** none (DB-side action)

- [ ] **Step 1: Apply the migration to dev**

Use Supabase MCP:

```
mcp__supabase__apply_migration name="revoke_sessions_on_delete" query=<contents of the migration file from Task 2>
```

Expected: success. (The CI will auto-apply on `dev` push as well; this step exercises it manually so the same engineer can verify backfill output.)

- [ ] **Step 2: Verify backfill cleared stranded sessions for already-deleted users**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT u.email, u.banned_until,
       (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id) AS sessions_count,
       (SELECT count(*) FROM auth.refresh_tokens t WHERE t.user_id = u.id::text) AS refresh_tokens_count
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE p.is_active = FALSE;
```

Expected: every deleted user row reports `sessions_count = 0` AND `refresh_tokens_count = 0`. Specifically, the existing `navesarussi@gmail.com` row (which had 3 sessions + 3 refresh tokens before this change) should now report zeros.

If any row still has non-zero counts, stop — the backfill DELETE did not match (likely a `user_id` column type mismatch). Inspect the schema and adjust before continuing.

---

## Task 4: App — extract `acceptSessionIfAllowed` into its own module (no behavior change)

**Files:**
- Create: `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts`
- Modify: `cost-share-app/apps/mobile/App.tsx`

- [ ] **Step 1: Create the extracted module (current behavior preserved)**

Create `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts` with this exact content:

```ts
import type { Session } from '@supabase/supabase-js';
import { assertProfileActiveWithTimeout } from './auth';
import { clearStaleAuthSession } from './authSessionLifecycle';
import { signalDeactivatedAccount } from './signalDeactivatedAccount';
import { hydrateCurrentUserProfile } from '../services/users.service';

export type SessionAcceptMode = 'fresh' | 'hydration';

export interface AcceptSessionDeps {
    setSession: (session: Session | null) => void;
    setPendingDeactivationNotice: (value: boolean) => void;
}

/**
 * Verify a session is allowed before committing it to the app store.
 *
 * - mode = 'fresh': the session just came in from an OAuth callback or
 *   `onAuthStateChange` SIGNED_IN event. The user has not yet been let into
 *   the app, so we fail-CLOSED — anything other than 'active' rejects.
 * - mode = 'hydration': we're reloading a previously-issued session on app
 *   cold-start. The session was already validated when issued, so we
 *   fail-OPEN on 'unknown' (offline / RPC failure) to avoid booting
 *   returning users who just opened the app on a flaky network.
 */
export async function acceptSessionIfAllowed(
    nextSession: Session | null,
    mode: SessionAcceptMode,
    deps: AcceptSessionDeps,
): Promise<void> {
    const { setSession, setPendingDeactivationNotice } = deps;

    if (!nextSession) {
        setSession(null);
        return;
    }

    const status = await assertProfileActiveWithTimeout();

    if (status === 'deactivated') {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    const hydration = await hydrateCurrentUserProfile(nextSession.user.id);
    if (hydration === 'deactivated') {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    setSession(nextSession);
}
```

Note: this preserves the *current* behavior exactly. The fresh-vs-hydration distinction is added by parameter only; the new `'unknown'` fail-closed branch is added in Task 6. We do this as two steps so the extraction is a pure refactor and the behavior change is its own diff.

- [ ] **Step 2: Replace the inline definition in `App.tsx`**

Open `cost-share-app/apps/mobile/App.tsx`. Add this import alongside the others near the top (sorted to match existing style):

```ts
import { acceptSessionIfAllowed as acceptSessionIfAllowedImpl } from './lib/acceptSessionIfAllowed';
```

Replace the existing `rejectDeactivatedSession` + `acceptSessionIfAllowed` `useCallback` block (currently around lines 67–95) with:

```ts
  const acceptSessionIfAllowed = useCallback(
    (nextSession: Session | null, mode: 'fresh' | 'hydration') =>
      acceptSessionIfAllowedImpl(nextSession, mode, {
        setSession,
        setPendingDeactivationNotice,
      }),
    [setSession, setPendingDeactivationNotice],
  );

  const rejectDeactivatedSession = useCallback(async () => {
    void signalDeactivatedAccount(setPendingDeactivationNotice);
    await clearStaleAuthSession();
    setSession(null);
  }, [setPendingDeactivationNotice, setSession]);
```

(`rejectDeactivatedSession` is still needed because `processOAuthCallbackUrl` and `guardSession` call it directly.)

Update the two call-sites of `acceptSessionIfAllowed` lower in the file to pass an explicit mode:

- The boot-time hydration call (around line 155): `await acceptSessionIfAllowed(hydratedSession, 'hydration');`
- The `onAuthStateChange` SIGNED_IN call (around line 172): `void acceptSessionIfAllowed(nextSession, 'fresh');`

Update the `useCallback` dependency lists and the outer `useEffect` dependency list as TypeScript / ESLint require (the only change is that `acceptSessionIfAllowed` is now stable in its references to `setSession` and `setPendingDeactivationNotice`).

- [ ] **Step 3: Run the existing unit tests to confirm no regression**

```bash
cd cost-share-app/apps/mobile && npm test -- --testPathPattern '__tests__/lib/auth.test.ts'
```

Expected: PASS (these existing tests do not touch `acceptSessionIfAllowed`; they just confirm the imports it depends on still type-check and resolve).

- [ ] **Step 4: Type-check the whole mobile app**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts cost-share-app/apps/mobile/App.tsx
git commit -m "refactor(mobile): extract acceptSessionIfAllowed; add mode parameter"
```

---

## Task 5: App — write failing tests for `acceptSessionIfAllowed`

**Files:**
- Create: `cost-share-app/apps/mobile/__tests__/lib/acceptSessionIfAllowed.test.ts`

- [ ] **Step 1: Write the test file**

Create `cost-share-app/apps/mobile/__tests__/lib/acceptSessionIfAllowed.test.ts` with this exact content:

```ts
import { acceptSessionIfAllowed } from '../../lib/acceptSessionIfAllowed';
import type { Session } from '@supabase/supabase-js';

const mockAssertProfileActive = jest.fn();
const mockHydrateProfile = jest.fn();
const mockClearStaleAuthSession = jest.fn().mockResolvedValue(undefined);
const mockSignalDeactivated = jest.fn().mockResolvedValue(undefined);

jest.mock('../../lib/auth', () => ({
    assertProfileActiveWithTimeout: (...args: unknown[]) => mockAssertProfileActive(...args),
}));

jest.mock('../../lib/authSessionLifecycle', () => ({
    clearStaleAuthSession: (...args: unknown[]) => mockClearStaleAuthSession(...args),
}));

jest.mock('../../lib/signalDeactivatedAccount', () => ({
    signalDeactivatedAccount: (...args: unknown[]) => mockSignalDeactivated(...args),
}));

jest.mock('../../services/users.service', () => ({
    hydrateCurrentUserProfile: (...args: unknown[]) => mockHydrateProfile(...args),
}));

const fakeSession = { user: { id: 'u1' } } as unknown as Session;

function makeDeps() {
    return {
        setSession: jest.fn(),
        setPendingDeactivationNotice: jest.fn(),
    };
}

describe('acceptSessionIfAllowed', () => {
    beforeEach(() => {
        mockAssertProfileActive.mockReset();
        mockHydrateProfile.mockReset();
        mockClearStaleAuthSession.mockClear();
        mockSignalDeactivated.mockClear();
    });

    it('rejects a null session by calling setSession(null)', async () => {
        const deps = makeDeps();
        await acceptSessionIfAllowed(null, 'fresh', deps);
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(mockAssertProfileActive).not.toHaveBeenCalled();
    });

    it('accepts a session when status is active (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('active');
        mockHydrateProfile.mockResolvedValue('active');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(deps.setSession).toHaveBeenCalledWith(fakeSession);
        expect(mockSignalDeactivated).not.toHaveBeenCalled();
    });

    it('rejects a session when status is deactivated (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('deactivated');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalledWith(deps.setPendingDeactivationNotice);
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(deps.setSession).not.toHaveBeenCalledWith(fakeSession);
    });

    it('rejects a session when status is unknown AND mode is fresh (fail-closed)', async () => {
        mockAssertProfileActive.mockResolvedValue('unknown');
        mockHydrateProfile.mockResolvedValue('unknown');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalledWith(deps.setPendingDeactivationNotice);
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
        expect(deps.setSession).not.toHaveBeenCalledWith(fakeSession);
    });

    it('accepts a session when status is unknown AND mode is hydration (fail-open)', async () => {
        mockAssertProfileActive.mockResolvedValue('unknown');
        mockHydrateProfile.mockResolvedValue('unknown');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'hydration', deps);
        expect(deps.setSession).toHaveBeenCalledWith(fakeSession);
        expect(mockSignalDeactivated).not.toHaveBeenCalled();
    });

    it('rejects a session when hydration returns deactivated (fresh)', async () => {
        mockAssertProfileActive.mockResolvedValue('active');
        mockHydrateProfile.mockResolvedValue('deactivated');
        const deps = makeDeps();
        await acceptSessionIfAllowed(fakeSession, 'fresh', deps);
        expect(mockSignalDeactivated).toHaveBeenCalled();
        expect(deps.setSession).toHaveBeenCalledWith(null);
    });
});
```

- [ ] **Step 2: Run the test to verify the new fail-closed case FAILS**

```bash
cd cost-share-app/apps/mobile && npm test -- --testPathPattern '__tests__/lib/acceptSessionIfAllowed.test.ts'
```

Expected: the test `rejects a session when status is unknown AND mode is fresh (fail-closed)` FAILS (the current implementation calls `setSession(fakeSession)` instead of `setSession(null)`). All other tests should PASS. This proves the test is wired correctly and the only thing missing is the new behavior.

If any other test fails, fix the test wiring before continuing.

- [ ] **Step 3: Commit the failing test**

```bash
git add cost-share-app/apps/mobile/__tests__/lib/acceptSessionIfAllowed.test.ts
git commit -m "test(mobile): add failing fresh+unknown fail-closed test for session gate"
```

---

## Task 6: App — implement fresh-mode fail-closed behavior

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts`

- [ ] **Step 1: Add the new branch**

In `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts`, replace the body of `acceptSessionIfAllowed` to add the fresh-mode `'unknown'` rejection between the existing `'deactivated'` check and the `hydrateCurrentUserProfile` call:

```ts
export async function acceptSessionIfAllowed(
    nextSession: Session | null,
    mode: SessionAcceptMode,
    deps: AcceptSessionDeps,
): Promise<void> {
    const { setSession, setPendingDeactivationNotice } = deps;

    if (!nextSession) {
        setSession(null);
        return;
    }

    const status = await assertProfileActiveWithTimeout();

    if (status === 'deactivated' || (status === 'unknown' && mode === 'fresh')) {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    const hydration = await hydrateCurrentUserProfile(nextSession.user.id);
    if (hydration === 'deactivated') {
        void signalDeactivatedAccount(setPendingDeactivationNotice);
        await clearStaleAuthSession();
        setSession(null);
        return;
    }

    setSession(nextSession);
}
```

- [ ] **Step 2: Run the tests — all should PASS**

```bash
cd cost-share-app/apps/mobile && npm test -- --testPathPattern '__tests__/lib/acceptSessionIfAllowed.test.ts'
```

Expected: ALL six tests PASS.

- [ ] **Step 3: Run the existing auth tests to confirm no regression**

```bash
cd cost-share-app/apps/mobile && npm test -- --testPathPattern '__tests__/lib/auth.test.ts'
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts
git commit -m "feat(mobile): fail-closed on 'unknown' for fresh sign-in path"
```

---

## Task 7: Full test sweep + manual smoke + push

**Files:** none

- [ ] **Step 1: Run the full mobile test suite**

```bash
cd cost-share-app/apps/mobile && npm test
```

Expected: all tests PASS. If anything fails, stop and inspect — most likely the App.tsx refactor in Task 4 needs a hook dependency adjusted.

- [ ] **Step 2: Type-check the whole mobile workspace**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test on dev (manual, optional but recommended before push)**

If a dev mobile build is convenient: sign in with a Google account, delete the account from Profile → Delete Account, then try to sign in again with the same Google account. Expected: the "Account deactivated" notice dialog appears on `LoginScreen` and no app session is established. Confirm via MCP that the user's `auth.sessions` and `auth.refresh_tokens` counts are 0.

If a build is not convenient, skip — the DB test (Task 1) and the Jest test (Task 5/6) cover the regression.

- [ ] **Step 4: Push the branch and open a PR to `dev`**

```bash
git push -u origin general-fixes
gh pr create --base dev --title "Block deleted users from signing in" --body "$(cat <<'EOF'
## Summary
- delete_my_account() now revokes auth.sessions and auth.refresh_tokens for the caller
- Idempotent backfill clears stranded sessions/tokens for users already soft-deleted
- Mobile session gate fails CLOSED on 'unknown' for fresh sign-ins (hydration path unchanged)

Spec: docs/superpowers/specs/2026-06-02-block-deleted-user-signin-design.md

## Test plan
- [ ] CI's deploy-staging.yml auto-applies the migration to dev
- [ ] Run delete_my_account.test.sql via MCP against dev — passes
- [ ] Sign in → delete account → attempt sign-in → deactivated notice appears (no session)
- [ ] Existing deleted users on dev have zero auth.sessions / auth.refresh_tokens

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. After merge to `dev`, `deploy-staging.yml` applies the migration to dev DB automatically. After merging `dev` → `main`, `deploy-production.yml` applies it to production.

---

## Self-review summary

- **Spec coverage:** Every section of the spec maps to at least one task. DB extension → Task 2. DB backfill → Task 2 + verified in Task 3. App distinction fresh/hydration → Task 4 + Task 6. DB test → Task 1. Mobile test → Task 5. CI deployment → Task 7 PR body.
- **Type consistency:** `acceptSessionIfAllowed`, `SessionAcceptMode`, `AcceptSessionDeps`, `setSession`, `setPendingDeactivationNotice` are spelled identically in the module, in App.tsx replacement code, and in the test file.
- **Placeholder check:** the only `<YYYYMMDDhhmmss>` placeholder is the migration filename, which is intentional (generated by `supabase migration new`); the convention is explicit and matches the surrounding files.
