# Block deleted users from signing in — design

**Branch:** `general-fixes`
**Date:** 2026-06-02
**Status:** Approved — ready for implementation plan

## Problem

A user who has deleted their account can still establish an authenticated session. The existing deletion flow (`delete_my_account()` in `cost-share-app/supabase/account-deletion-v2.sql`) sets `auth.users.banned_until = 'infinity'` and `profiles.is_active = false`, and the app catches a few error strings on the OAuth path — yet:

- `delete_my_account()` never revokes the user's existing `auth.sessions` or `auth.refresh_tokens`. Verified on dev: the one existing deleted user (`navesarussi@gmail.com`) has `banned_until = infinity`, `is_active = false`, but **3 active sessions and 3 active refresh tokens**.
- `App.tsx::acceptSessionIfAllowed` treats `'unknown'` (i.e., the active-check RPC and the direct profile read both failed) as "let the session through" even on a *fresh* sign-in event. That's correct policy for hydrating a returning user offline, but it leaves a gap on the OAuth callback path.

Together these mean a deleted user can keep using stranded tokens, or slip through on a fresh sign-in when the deactivation check transiently fails.

## Goal

A deleted user must not be able to obtain or use an authenticated app session. On sign-in attempts, the existing "Account deactivated" notice dialog appears on `LoginScreen`; no app session is ever established.

Non-goal: changing the restore flow, the admin portal, or the deletion UX/state model. The user-id stays soft-deleted in `profiles` exactly as today so the existing admin restore (`restore_deleted_account()`) keeps working.

## Architecture & components

Two changes layered onto the existing deletion flow; no new components or services.

1. **DB layer.** Extend `public.delete_my_account()` to also revoke active sessions and refresh tokens. Add a one-time, idempotent backfill that revokes anything currently stranded for users where `profiles.is_active = false`. Ship as a new migration under `cost-share-app/supabase/migrations/`.
2. **App layer.** In `cost-share-app/apps/mobile/App.tsx::acceptSessionIfAllowed`, distinguish *fresh sign-in* from *session hydration*. On the fresh sign-in path, a `'unknown'` status from `assertProfileActiveWithTimeout()` must NOT result in the session being accepted — instead, reject and surface the deactivated notice. On the hydration path, keep current fail-open behavior so offline returning users aren't booted.

## Data flow

### Self-service delete (logged-in user → `delete_my_account()`)

Updated RPC, additions in **bold**:

1. `auth.uid()` check, email lookup, hash compute. *(Unchanged.)*
2. Snapshot open balances into `account_deletions_audit`. *(Unchanged.)*
3. Insert into `deleted_account_emails`. *(Unchanged.)*
4. Anonymize profile: `name/email/avatar_url/phone = NULL`, `is_active = false`, `deleted_at = NOW()`. *(Unchanged.)*
5. `auth.users.banned_until = 'infinity'`. *(Unchanged.)*
6. **`DELETE FROM auth.refresh_tokens WHERE user_id::uuid = v_user_id;`**
7. **`DELETE FROM auth.sessions WHERE user_id = v_user_id;`**
8. Insert audit row and queue avatar cleanup. *(Unchanged.)*

After the RPC returns, the existing `signOut()` continues to clear local state — no app-side change to the delete path is needed.

### Sign-in attempt by an already-deleted user

1. OAuth callback → `handleAuthRedirectUrl` → `supabase.auth.exchangeCodeForSession(code)`.
2. If Supabase honors `banned_until` on the exchange, the call errors, the error string matches `toAuthError`, the screen shows the notice. *(Unchanged.)*
3. If a session is nevertheless issued, `isAuthSessionAllowed()` reads the profile via `is_caller_active()` (and falls back to a direct read). With the backfill, `is_active = false` is reliable → returns `'deactivated'` → notice. *(Unchanged.)*
4. **New:** If `isAuthSessionAllowed()` returns `'unknown'` on the fresh-signin path (`processOAuthCallbackUrl` or `onAuthStateChange` event `'SIGNED_IN'`), treat it as a block. The hydration path (`hydrateAuthSession` on cold start) continues to fail-open.

### Backfill (one-time, runs on migration apply)

For each `profiles.id` where `is_active = false`:

```sql
DELETE FROM auth.refresh_tokens WHERE user_id::uuid IN (
    SELECT id FROM public.profiles WHERE is_active = false
);
DELETE FROM auth.sessions WHERE user_id IN (
    SELECT id FROM public.profiles WHERE is_active = false
);
```

Idempotent — re-running yields zero deletions.

## Error handling

- `DELETE FROM auth.sessions / auth.refresh_tokens` on a user with no rows is a no-op; the RPC remains transactional and rolls back atomically if any prior step fails (current behavior).
- The new app-side fail-closed branch fires only when both the RPC and the direct profile read fail on the fresh-signin path. Hydration of a returning user's session keeps current offline tolerance — no regression for users who launch the app on a flaky network.
- `restore_deleted_account()` continues to operate on the same `user_id`; after restore, the user signs in fresh through OAuth — they get newly issued sessions/tokens, so no special "re-add tokens" step is needed.

## Testing

- **DB integration test** in `cost-share-app/supabase/__tests__/` (DO-block + rollback pattern used by the other tests in that directory): create a fake auth user with sessions/refresh tokens, call `delete_my_account()` under that user's JWT, assert (a) `profiles.is_active = false`, (b) `auth.users.banned_until = 'infinity'`, (c) zero rows in `auth.sessions` and `auth.refresh_tokens` for that user.
- **Mobile unit test** in `cost-share-app/apps/mobile/__tests__/`: mock `assertProfileActiveWithTimeout` to return `'unknown'`, invoke `acceptSessionIfAllowed` simulating a fresh sign-in, assert (a) `setSession(null)` was called (not the live session), (b) `signalDeactivatedAccount` was invoked, (c) navigation lands back on `LoginScreen` (deactivation notice visible via store flag).

## Deployment

This project uses CI-driven migrations (see `docs/SSOT/SUPABASE_ENVIRONMENTS.md`). Only files under `cost-share-app/supabase/migrations/` are auto-applied; loose `.sql` files elsewhere are not.

1. From `cost-share-app/`, create the migration with the project convention:

   ```bash
   supabase migration new revoke_sessions_on_delete
   ```

   This produces `cost-share-app/supabase/migrations/<YYYYMMDDhhmmss>_revoke_sessions_on_delete.sql`. Fill it with the updated `CREATE OR REPLACE FUNCTION delete_my_account()` plus the one-time backfill `DELETE`s. The file must be idempotent (safe to re-run).
2. Open the PR on the `general-fixes` branch targeting `dev`. On merge, `.github/workflows/deploy-staging.yml` auto-applies the migration to the dev project (`drxfbicunusmipdgbgdk`). Smoke-test on dev: sign in → delete → attempt sign-in → confirm notice dialog and zero rows in `auth.sessions` / `auth.refresh_tokens` for that user.
3. Merge `dev` → `main`. `.github/workflows/deploy-production.yml` auto-applies the migration to production (`jfqxjjjbpxbwwvoygahu`). No manual SQL Editor step.
4. Client tightening in `App.tsx` ships alongside, riding the normal mobile release on `general-fixes` → `dev` → `main`.

## Out of scope

- Supabase Custom Access Token Hook (Approach B in brainstorming). Deferrable; revisit if the minimal fix proves insufficient.
- Hard-deleting `auth.users` rows. Conflicts with the existing admin restore flow.
- Changes to the admin portal restore UX.
