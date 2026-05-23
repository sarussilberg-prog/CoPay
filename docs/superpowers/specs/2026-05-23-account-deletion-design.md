# Account Deletion — Design Spec

**Date:** 2026-05-23
**Status:** Draft for review
**Owner:** @navesarussi
**Scope:** Mobile + Supabase (no NestJS — architecture is Supabase-only per memory)

---

## 1. Goal

Deliver a production-grade account deletion flow that:

1. Works end-to-end without bugs and is covered by automated tests.
2. Prevents a deleted user from creating a new account without contacting support (`sarussilberg@gmail.com`).
3. Replaces the deleted user's identity with "Deleted user" everywhere it appears, and revokes access to their previous data.
4. Complies with GDPR Art. 17 & 30, Apple App Store §5.1.1(v), Google Play Data Safety, and Israeli Privacy Protection Law amendment 13 (effective 2025-08).

Out of scope: admin-initiated deletion, data export (GDPR Art. 20), inactive-account auto-deletion, public deletion-info webpage (deferred — required for Google Play by 2026-Q3).

---

## 2. Current state (as of 2026-05-23)

Existing implementation:

- `cost-share-app/apps/mobile/services/account.service.ts` — calls RPC `delete_my_account()` then `supabase.auth.signOut()` (no scope).
- `cost-share-app/supabase/schema.sql:619-648` — defines `is_active`, `deleted_at` on `profiles` plus `delete_my_account()` RPC that only sets `is_active=false` and `deleted_at=NOW()`.
- `cost-share-app/apps/mobile/lib/auth.ts` — `assertProfileActive()` runs at app boot / auth-state change; signs out and returns `'deactivated'` when `is_active=false`.
- `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` — Settings → Delete account → 2 sheets (`DeleteAccountWarningSheet`, `DeleteAccountConfirmSheet` that requires re-typing the email).
- i18n: `deleteAccount.*` keys exist in `en.json` / `he.json`. Current warning bullet refers users to WhatsApp — must change to support email.

Gaps:

| Gap | Risk |
|---|---|
| No PII anonymization — name, email, avatar, phone kept after deletion | GDPR violation |
| No re-signup block | Requirement #2 unmet |
| No "Deleted user" display fallback | Requirement #3 unmet |
| RLS does not check `is_active` on writes | Deleted user with valid access token can still mutate data for ~1 hour |
| `signOut()` called without `scope: 'global'` | Other devices stay signed in |
| `auth.users` row remains usable for OAuth re-login | A deleted user could re-authenticate via the same OAuth identity |
| No audit log | GDPR Art. 30 evidence missing |
| No open-balances pre-check | Users delete with open balances, leaving ghost debts |

---

## 3. Architecture decisions

| # | Decision | Why |
|---|---|---|
| D1 | Soft-delete with PII anonymization (vs hard-delete) | Hard delete would break FK constraints on expenses/settlements (`ON DELETE RESTRICT`); GDPR is satisfied by removing identifiable fields |
| D2 | Keep `auth.users` row, set `banned_until='2099-12-31'` | Hard-deleting `auth.users` cascades and breaks the audit trail; `banned_until` is the Supabase-native way to lock an account |
| D3 | Store SHA-256 hash of deleted emails, not plaintext | Minimum PII retained; sufficient for deterministic re-signup block; not reversible |
| D4 | Re-signup block enforced at DB trigger (auth.users INSERT) + app-side friendly error | Defense in depth: trigger catches even if app is bypassed; app catches it before user sees a raw error |
| D5 | `profiles.name` becomes `NULL`-able | Avoids sentinel values; display layer falls back to `t('common.deletedUser')` |
| D6 | Open-balances pre-check warns but allows override (option C from brainstorming) | Balanced UX — informs without trapping users |
| D7 | Display fallback centralized in `lib/userDisplay.ts` | Single source of truth; one place to update if display rules change |
| D8 | Server-side enforcement via `is_caller_active()` helper added to all write RLS policies | Token revocation (`signOut global`) addresses cookie sessions but not in-flight access tokens; RLS gates the data path |
| D9 | Audit row written to `account_deletions_audit` on every deletion | GDPR Art. 30; supports legitimate "I didn't ask for this" disputes |

---

## 4. Data model

### 4.1 Existing tables — changes

**`profiles`:**
```sql
ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;
-- is_active and deleted_at already exist via fix-profiles-account-deactivation.sql
```

### 4.2 New tables

**Required extension** — used by SHA-256 hashing:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**`deleted_account_emails`** — re-signup block list.

```sql
CREATE TABLE deleted_account_emails (
    email_hash TEXT PRIMARY KEY,           -- sha256(lower(trim(email)))
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No SELECT policy — readable only via SECURITY DEFINER functions.
-- Prevents leaking "is email X deleted?" probe.
ALTER TABLE deleted_account_emails ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies created → all RLS-bound roles get zero rows.
```

**`account_deletions_audit`** — GDPR Art. 30 record-keeping.

```sql
CREATE TABLE account_deletions_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,                 -- original profiles.id (kept for support lookup)
    email_hash TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL DEFAULT 'self_service',  -- 'self_service' | 'support_request' | 'compliance'
    open_balance_snapshot JSONB,           -- snapshot at time of deletion
    restored_at TIMESTAMPTZ,               -- set if support restores account
    notes TEXT
);
CREATE INDEX idx_account_deletions_audit_user ON account_deletions_audit(user_id);
CREATE INDEX idx_account_deletions_audit_deleted_at ON account_deletions_audit(deleted_at DESC);

ALTER TABLE account_deletions_audit ENABLE ROW LEVEL SECURITY;
-- No policies → only SECURITY DEFINER functions and service role can access.
```

**`storage_cleanup_queue`** — orphaned avatar file paths awaiting deletion from Storage.

```sql
CREATE TABLE storage_cleanup_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_path TEXT NOT NULL,             -- full path in profile-images bucket
    bucket TEXT NOT NULL DEFAULT 'profile-images',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    UNIQUE (bucket, object_path)
);
CREATE INDEX idx_storage_cleanup_queue_pending
    ON storage_cleanup_queue(requested_at)
    WHERE processed_at IS NULL;

ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
-- No policies → only SECURITY DEFINER functions and service role (edge function) can access.
```

### 4.3 New / updated functions

**`is_caller_active()`** — used by all write RLS policies.

```sql
CREATE OR REPLACE FUNCTION public.is_caller_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(
        (SELECT is_active FROM profiles WHERE id = auth.uid()),
        TRUE   -- fail-open: missing profile row (first-login race) does NOT block writes
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_caller_active() TO authenticated, anon;
```

**`delete_my_account()`** — full transactional replacement (extends existing RPC):

```sql
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id   UUID := auth.uid();
    v_email     TEXT;
    v_avatar    TEXT;
    v_hash      TEXT;
    v_balance   JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 1. Fetch email from auth.users (SECURITY DEFINER required)
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'auth_user_missing';
    END IF;
    v_hash := encode(digest(lower(trim(v_email)), 'sha256'), 'hex');

    -- 2. Snapshot open balances (best-effort, not blocking)
    BEGIN
        v_balance := get_user_balance_summary(v_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_balance := jsonb_build_object('error', SQLERRM);
    END;

    -- 3. Grab avatar path for storage cleanup
    SELECT avatar_url INTO v_avatar FROM profiles WHERE id = v_user_id;

    -- 4. Block re-signup
    INSERT INTO deleted_account_emails (email_hash)
        VALUES (v_hash)
        ON CONFLICT (email_hash) DO NOTHING;

    -- 5. Anonymize profile (PII removal)
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

    -- 6. Ban future logins
    UPDATE auth.users
        SET banned_until = TIMESTAMPTZ '2099-12-31 00:00:00+00'
        WHERE id = v_user_id;

    -- 7. Audit record
    INSERT INTO account_deletions_audit (user_id, email_hash, reason, open_balance_snapshot)
        VALUES (v_user_id, v_hash, 'self_service', v_balance);

    -- 8. Queue avatar for async deletion from Storage.
    -- This row is part of the same transaction (commits atomically with the
    -- deletion). The actual Storage delete happens asynchronously via an edge
    -- function that runs with service_role and consumes the queue.
    IF v_avatar IS NOT NULL THEN
        INSERT INTO storage_cleanup_queue (object_path)
            VALUES (v_avatar)
            ON CONFLICT (bucket, object_path) DO NOTHING;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
```

Notes on the storage cleanup queue: `storage_cleanup_queue` is a tiny new table; an edge function (deferred — can ship initially as a manual cleanup script) consumes it and calls `storage.from('profile-images').remove([path])` with service role. Listed as a separate workstream — see §10.

**Re-signup block trigger:**

```sql
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

CREATE TRIGGER block_deleted_email_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_email_not_deleted();
```

**`get_my_open_balances()`** — pre-deletion warning data.

```sql
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

The mobile layer interprets the JSONB output (existing format from `get_user_balance_summary`) to derive `hasOpenBalances`, `totalOwed`, `totalOwing`. If the user has no groups or no net balance entries, the helper returns `{ hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: user.default_currency }` and the warning sheet renders without the banner.

### 4.4 RLS updates

For each table below, add `AND public.is_caller_active()` to every `INSERT`, `UPDATE`, `DELETE` policy `WITH CHECK` / `USING` clause:

- `expenses`
- `expense_splits`
- `settlements`
- `group_members`
- `groups`
- `profiles` (UPDATE — blocks deleted users from un-deactivating themselves)
- `friend_requests`, `friendships` (if present)

SELECT policies are left unchanged — read-only access during the brief access-token window is acceptable, and changing them risks breaking display flows that legitimately need to render the deleted user's old context.

---

## 5. Deletion flow

### 5.1 Pre-deletion check

```
SettingsScreen → tap "Delete account"
  ↓
account.service.getMyOpenBalances()
  ↓
hasOpenBalances?
  ├─ no  → DeleteAccountWarningSheet (existing bullets only)
  └─ yes → DeleteAccountWarningSheet + red banner + "Settle now" CTA
              (CTA navigates to SettleUpListScreen; user can still tap "Continue")
```

### 5.2 Deletion sequence

```
User taps "Delete" in DeleteAccountConfirmSheet
  ↓
account.service.deleteMyAccount()
  ├─ supabase.rpc('delete_my_account')
  │     ↓ DB transaction (all-or-nothing)
  │       1. Fetch email from auth.users
  │       2. Snapshot open balances
  │       3. INSERT deleted_account_emails (hash)
  │       4. UPDATE profiles SET name=null, email=null, avatar=null, phone=null,
  │          is_active=false, deleted_at=now()
  │       5. UPDATE auth.users SET banned_until='2099-12-31'
  │       6. INSERT account_deletions_audit
  │       7. INSERT storage_cleanup_queue (avatar path)
  ├─ supabase.auth.signOut({ scope: 'global' })   ← revokes all device sessions
  ├─ queryClient.clear()
  ├─ clearGroupFeedHydration()
  └─ Toast success → onAuthStateChange routes to login
```

If RPC throws → no signOut, user stays logged in, Toast shows generic error with retry.

### 5.3 Re-signup attempt

```
User signs in with Google (deleted email)
  ↓
Supabase tries INSERT auth.users
  ↓
TRIGGER block_deleted_email_signup → RAISE 'email_was_deleted'
  ↓
supabase.auth.exchangeCodeForSession returns error containing 'email_was_deleted'
  ↓
mobile auth.service.handleAuthRedirectUrl
  ├─ detects substring 'email_was_deleted' in error.message
  ├─ returns { error: { code: 'account_deleted', ... } }
  └─ LoginScreen shows Alert:
       Title: t('deleteAccount.reSignupBlockedTitle')
       Body:  t('deleteAccount.reSignupBlocked', { email: getSupportEmail() })
       Buttons: [Close] [Open mail → openSupportContact()]
```

---

## 6. Mobile changes

### 6.1 New: `lib/userDisplay.ts`

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

### 6.2 Updated: `services/account.service.ts`

```ts
export interface OpenBalancesSummary {
  hasOpenBalances: boolean;
  totalOwed: number;     // sum of positive net (others owe me)
  totalOwing: number;    // sum of negative net (I owe others)
  currency: string;      // user's default currency
}

export async function getMyOpenBalances(): Promise<OpenBalancesSummary>;

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
        console.error('deleteMyAccount: RPC failed', rpcError);
        return { ok: false, error: 'deleteAccount.deleteFailed' };
    }
    await supabase.auth.signOut({ scope: 'global' });   // <-- changed
    return { ok: true };
}
```

### 6.3 Updated: `services/auth.service.ts`

`handleAuthRedirectUrl` returns a discriminated error so the login screen can show the account-deleted alert:

```ts
type AuthError = { code: 'account_deleted' | 'generic'; message: string };
export async function handleAuthRedirectUrl(url: string): Promise<{ error: AuthError | null }>;
```

If the underlying error message contains `'email_was_deleted'`, return `code: 'account_deleted'`.

**Breaking change**: callers of `handleAuthRedirectUrl` (currently `App.tsx` deep-link handler at line 74 and `signInWithGoogle` at line 147) receive a discriminated union instead of `Error | null`. Both call sites must update their narrowing to `error?.code === 'account_deleted'` for the new branch; existing string-based logging continues to work via `error.message`.

### 6.4 Updated: `lib/auth.ts`

When `assertProfileActive()` returns `'deactivated'`, the existing Alert in `App.tsx:87` is enhanced with an "Open mail" button (using `openSupportContact()`).

### 6.5 Updated: `screens/profile/SettingsScreen.tsx`

Before opening `DeleteAccountWarningSheet`, call `getMyOpenBalances()` and pass the result as a prop.

### 6.6 Updated: `components/settings/DeleteAccountWarningSheet.tsx`

Add prop `openBalances?: OpenBalancesSummary | null`. If present and `hasOpenBalances`, render a red banner above the bullets with a "Settle up now" CTA that navigates to `SettleUpListScreen` and closes the sheet.

### 6.7 Display layer migration

Every component that renders a profile name/avatar must route through `getDisplayName` / `getAvatarUrl`. Components to update (initial list — to be confirmed in the implementation plan):

- `components/dashboard/FriendBalanceRow.tsx`
- `components/dashboard/BalanceHeroCard.tsx`
- `components/SettlementRow.tsx`
- `components/FeedItemDetailSheet.tsx`
- `components/Avatar.tsx` (or equivalent) — placeholder when `is_active=false`
- Member picker / group members list components
- Any screen rendering payer/owner of an expense
- Notification recipients filter (skip push to `is_active=false` users)

Every Supabase query that selects from `profiles` must add `is_active` to the select clause. Implementation plan to grep for `profiles(` patterns and audit each call site.

### 6.8 i18n additions

```jsonc
"common": {
  "deletedUser": "Deleted user" / "משתמש שנמחק",
  "unknownUser": "Unknown user" / "משתמש לא ידוע",
  "openMail": "Open mail" / "פתח מייל"
},
"deleteAccount": {
  // existing keys retained; updated copy:
  "warningBullet4": "This action is irreversible. Contact us at {{email}} to restore."
                  / "פעולה זו אינה הפיכה. פנה אלינו ב-{{email}} לשחזור.",
  "deactivatedMessage": "This account was deleted. Contact {{email}} to restore."
                      / "החשבון הזה נמחק. פנה ל-{{email}} לשחזור.",
  // new keys:
  "openBalancesWarningTitle": "You have open balances",
  "openBalancesWarningBody": "Friends will see these owed against 'Deleted user'.",
  "openBalancesCta": "Settle up now",
  "reSignupBlockedTitle": "Account deleted",
  "reSignupBlocked": "This account was deleted. Contact {{email}} to restore it."
}
```

---

## 7. Server-side enforcement summary

Layered defense against a deleted user acting with a still-valid access token:

| Layer | Mechanism | Failure mode if bypassed |
|---|---|---|
| 1. App | `assertProfileActive` on launch + AppState change | Catches normal flow |
| 2. Session | `signOut({ scope: 'global' })` revokes all refresh tokens | Access token still valid up to ~1h |
| 3. RLS | `is_caller_active()` in all write policies | All mutations rejected |
| 4. Re-login | `auth.users.banned_until` = 2099 | No new token issued |
| 5. Re-signup | DB trigger on `auth.users INSERT` | New account creation rejected |

---

## 8. Compliance mapping

| Requirement | How we satisfy it |
|---|---|
| GDPR Art. 17 (erasure) | PII (name/email/avatar/phone) nullified; email retained only as one-way hash |
| GDPR Art. 30 (records) | `account_deletions_audit` table |
| GDPR Art. 7(3) (withdraw consent) | Account deletion is self-service, no friction beyond email re-typing confirmation |
| Apple App Store §5.1.1(v) | In-app deletion accessible in Settings → Account → Delete account |
| Google Play Data Safety | Deletion is in-app + audit; public deletion-info page deferred (§10) |
| Israeli Privacy Protection Law Am. 13 (2025-08) | Same controls as GDPR satisfy this |

---

## 9. Testing strategy

**DB tests** (manual SQL scripts in `cost-share-app/supabase/__tests__/` — pgTAP not currently in repo):

1. `delete_my_account` is transactional — simulate failure at each step, verify rollback.
2. `check_email_not_deleted` trigger — INSERT into `auth.users` with hashed-deleted email → exception raised.
3. `is_caller_active()` returns FALSE for deleted profile, TRUE for active, TRUE for missing row.
4. `banned_until` blocks `auth.users` from issuing tokens (verify via supabase-js sign-in attempt).

**Mobile unit (Jest):**

- `account.service.deleteMyAccount` — RPC success → signs out with global scope; RPC failure → no signOut, returns error.
- `account.service.getMyOpenBalances` — parses RPC JSONB output correctly.
- `lib/userDisplay` — all three helpers across active/deleted/null users.
- `lib/auth.assertProfileActive` (existing test — verify enhanced Alert wiring).

**Mobile component (Jest + RTL):**

- `DeleteAccountWarningSheet` with `openBalances` prop → renders banner + CTA; without → renders bullets only.
- `DeleteAccountConfirmSheet` (existing test) — verify untouched.
- `FriendBalanceRow` / `SettlementRow` / `FeedItemDetailSheet` — render deleted user as "משתמש שנמחק" + placeholder avatar.
- `SettingsScreen` — fetches open balances before opening warning sheet.

**Pre-launch E2E (manual checklist):**

- Delete own account → log out → attempt sign-in → blocked with friendly Alert and working "Open mail" CTA.
- Have second account see deleted user in shared group → shows "משתמש שנמחק" and placeholder avatar.
- Open balance flow — create an open balance, then attempt deletion → see warning banner; tap "Settle now" → navigated to SettleUpListScreen; settle; return; deletion proceeds without warning.
- Existing logout, language change, currency change unchanged — regression check.

---

## 10. Workstreams (rollout order)

| # | Workstream | Description | Notes |
|---|---|---|---|
| 1 | DB migration | New SQL file `cost-share-app/supabase/account-deletion-v2.sql` — idempotent — covers all §4 changes | Single PR; tested against remote project on a branch first |
| 2 | Mobile services + helpers | `userDisplay.ts`, updated `account.service.ts`, updated `auth.service.ts`, updated `lib/auth.ts`, i18n keys | |
| 3 | Mobile Settings flow | Pre-check, updated sheets, login error handling | Depends on #2 |
| 4 | Display layer migration | Grep + convert all profile-name/avatar usages | Largest; can ship as its own PR after #3 |
| 5 | Audit of existing flow | Per user request — verify legacy paths still work end-to-end | Verification step, runs alongside QA |
| 6 | Storage cleanup edge function | Consumes `storage_cleanup_queue`, deletes orphaned avatars | Can ship as a manual script first; productionize later |
| 7 | Public deletion-info page | `kupa.pro/account-deletion` static page | Deferred — Google Play deadline 2026-Q3 |

---

## 11. Open questions / risks

- **Storage cleanup**: `storage.objects.remove` requires service role. The chosen pattern (queue + edge function) avoids embedding the service key. Until the edge function is built, an operator can drain the queue manually. Acceptable for v1.
- **`banned_until` semantics**: Supabase documents this as the canonical lock mechanism, but specific OAuth identity providers might still issue a new `auth.users` row if `identities` linkage breaks. Mitigated by the trigger in §4.3 — even an unexpected new row would be rejected if it shares the deleted email.
- **Restore via support**: Out of scope for v1, but the audit table + email hash provide enough to build a restore RPC (clear `deleted_account_emails` row, set `banned_until=null`, set `is_active=true`, restore name from audit notes). Spec for a separate ticket.
- **Concurrent deletion**: `delete_my_account` checks `is_active=TRUE` in the UPDATE — second call raises `profile_already_inactive`. Safe.
- **OAuth identity re-use**: If two providers (Google + Apple) link to the same email, deleting via one path blocks the email entirely; the user cannot use the other provider to "escape" the block. This is intentional.
