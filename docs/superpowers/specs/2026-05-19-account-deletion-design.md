# Account Deletion (Soft) — Design Spec

**Date:** 2026-05-19
**Status:** Approved (brainstorming)
**Mapped SRS:** REQ-PROF-06 (new)

---

## 1. Overview

Allow a user to delete their own account from Settings. "Delete" is soft: the profile row is marked inactive, data is preserved unchanged, and peers continue to see the user's name, history, balances, and group memberships exactly as before. The deleted user can no longer sign in; reactivation requires support.

**Confirmation:** two-step bottom-sheet flow ending in typed-email confirmation — the final "Delete my account" button stays disabled until the typed string exactly matches the user's email (trimmed, lowercased).

---

## 2. User decisions (confirmed)

| Topic | Decision |
|-------|----------|
| Peer visibility post-delete | A — peers see no change. Name, balances, group memberships, history all preserved unchanged. |
| Confirmation strictness | B — two-step: warning sheet → typed-email-to-confirm sheet. No re-auth, no password (Google OAuth has no password). |
| Reactivation | A — no self-service. Sign-in attempt by a deactivated user produces an immediate sign-out + alert: "Account deactivated. Contact support via WhatsApp." |

---

## 3. Database changes

Append to `cost-share-app/supabase/schema.sql`:

```sql
-- ============================================
-- ACCOUNT DEACTIVATION (soft delete)
-- ============================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
    ON profiles(is_active) WHERE is_active = FALSE;
```

**No other schema changes.** `group_members`, `expenses`, `expense_splits`, `settlements` are untouched. The deleted user's `group_members.is_active` stays `TRUE` so they continue to appear in active member lists and friend lists — that is the explicit consequence of decision A.

**RLS:** existing policies on `profiles` already allow each user to read/update their own row. No new policy needed. We do not block reads on `is_active=false` because peers must continue to see the deleted user's name and avatar.

---

## 4. Postgres RPC

Append to the same `schema.sql` block:

```sql
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles
        SET is_active = FALSE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = auth.uid()
          AND is_active = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
```

**Properties:**
- `SECURITY DEFINER` so it can write to `profiles` regardless of column-level RLS.
- `auth.uid()` constrains the write to the caller's own row — no caller can deactivate another user.
- `AND is_active = TRUE` makes the function idempotent: a second call by an already-deactivated user is a silent no-op (returns void, no rows affected, no error).
- No `RAISE EXCEPTION` on "not found" — the function is fire-and-forget from the caller's perspective; the mobile-side guard handles the deactivated case on next sign-in.

---

## 5. Mobile sign-in guard

**File:** `cost-share-app/apps/mobile/lib/auth.ts`

Add:

```typescript
export type ProfileStatus = 'active' | 'deactivated' | 'missing';

/**
 * Verifies the signed-in user's profile is active.
 * Side effect: on 'deactivated', signs the user out before returning.
 * Returns 'missing' if no profile row exists yet (signup-in-progress).
 */
export async function assertProfileActive(): Promise<ProfileStatus>;
```

**Wiring** — `cost-share-app/apps/mobile/App.tsx`:

In the existing `supabase.auth.onAuthStateChange` callback (or initial session bootstrap), after a successful `SIGNED_IN` / `INITIAL_SESSION` event, call `assertProfileActive()`. If the return is `'deactivated'`, show `Alert.alert(t('deleteAccount.deactivatedTitle'), t('deleteAccount.deactivatedMessage'))`. No navigation — the sign-out already triggered by `assertProfileActive` causes the navigator to flip back to the Login stack via the existing session-driven nav logic.

`'missing'` is treated as `'active'` for guard purposes — it means the profile-creation trigger hasn't run yet, which is normal during first login. Other guards (existing trigger on `auth.users`) handle that.

---

## 6. Mobile service

**File:** `cost-share-app/apps/mobile/services/account.service.ts` (new)

```typescript
export interface DeleteAccountResult {
    ok: boolean;
    error?: string;  // i18n key, e.g. 'deleteAccount.deleteFailed'
}

/**
 * Calls delete_my_account RPC, then signs out.
 * If RPC fails, does NOT sign out — caller can retry or escalate.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult>;
```

**Behavior:**
1. Call `supabase.rpc('delete_my_account')`.
2. If the RPC returned an error, return `{ ok: false, error: 'deleteAccount.deleteFailed' }`. Do not sign out.
3. On success, call `supabase.auth.signOut()`. Errors from sign-out are logged but do not flip `ok` to false (the soft-delete already happened).
4. Return `{ ok: true }`.

---

## 7. UI flow

### 7.1 Entry point

Add a new row at the end of the Settings → **Account** section, below "Log out":

```typescript
<SettingsRow
    iconName="trash-outline"
    label={t('settings.deleteAccount')}
    variant="danger"
    onPress={() => setShowDeleteWarning(true)}
/>
```

Both rows in the Account section use `variant="danger"`. Order: Log out, then Delete account.

### 7.2 Sheet A — `DeleteAccountWarningSheet`

**File:** `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx`

Bottom sheet (same pattern as `LegalSheet`). Content (top to bottom):
- Grabber handle.
- Title (red, bold): `t('deleteAccount.warningTitle')` — "Delete account?"
- Bullet list (4 items, plain text rows with a small dot or warning icon):
  - `t('deleteAccount.warningBullet1')` — "You will no longer be able to sign in."
  - `t('deleteAccount.warningBullet2')` — "Your name and history remain visible to friends you shared groups with."
  - `t('deleteAccount.warningBullet3')` — "Open balances stay open — settle them first if you don't want them to remain."
  - `t('deleteAccount.warningBullet4')` — "This cannot be undone. Contact support via WhatsApp to restore."
- Two side-by-side buttons at the bottom:
  - `t('common.cancel')` — gray, outlined, closes sheet.
  - `t('deleteAccount.continueBtn')` — solid red, closes this sheet and opens Sheet B.

Component props:
```typescript
interface Props {
    visible: boolean;
    onClose: () => void;
    onContinue: () => void;
}
```

### 7.3 Sheet B — `DeleteAccountConfirmSheet`

**File:** `cost-share-app/apps/mobile/components/settings/DeleteAccountConfirmSheet.tsx`

Bottom sheet. Content:
- Grabber handle.
- Title: `t('deleteAccount.confirmTitle')` — "Type your email to confirm".
- Subtitle line, gray: `t('deleteAccount.typeEmailHint')` — "To confirm deletion, type:" followed by the user's email shown selectable but not editable.
- A single `TextInput` field. `autoCapitalize="none"`, `autoCorrect={false}`, `keyboardType="email-address"`, placeholder = `t('profile.email')`.
- A solid red "Delete my account" button. **Disabled** until `typedEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()`. While disabled, button shows reduced opacity and is non-interactive.
- A small "Cancel" link below.

Component props:
```typescript
interface Props {
    visible: boolean;
    expectedEmail: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;  // Parent calls deleteMyAccount; sheet shows loading state while awaiting.
}
```

Internal state:
- `typed: string` — bound to the text field.
- `submitting: boolean` — disables the field + button while the parent's `onConfirm` is in flight.

### 7.4 SettingsScreen integration

In `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`:

- Add two `useState<boolean>` for `showDeleteWarning` and `showDeleteConfirm`.
- Add the new Settings row (above).
- Render both sheets.
- `handleConfirmDelete`: calls `deleteMyAccount()`. On `{ ok: true }`, the sign-out already happened — the navigator will flip back to Login automatically; show `Toast.show({ type: 'success', text1: t('deleteAccount.deletedToast') })`. On `{ ok: false }`, show error toast, keep sheet open.

---

## 8. New components

| Component | Purpose |
|-----------|---------|
| `DeleteAccountWarningSheet` | Warning sheet listing consequences + Continue |
| `DeleteAccountConfirmSheet` | Email-typed confirmation + final delete button |

Both follow the existing `LegalSheet` / `LanguageSheet` pattern (Modal + Pressable backdrop + inner Pressable content).

---

## 9. i18n keys (en + he)

### Add to `settings`:

```
settings.deleteAccount  →  "Delete account"  /  "מחק חשבון"
```

### New top-level namespace `deleteAccount`:

| Key | English | Hebrew |
|-----|---------|--------|
| `warningTitle` | "Delete account?" | "למחוק את החשבון?" |
| `warningBullet1` | "You will no longer be able to sign in." | "לא תוכל להתחבר יותר." |
| `warningBullet2` | "Your name and history remain visible to friends you shared groups with." | "השם וההיסטוריה שלך ימשיכו להופיע לחברים בקבוצות המשותפות." |
| `warningBullet3` | "Open balances stay open — settle them first if you don't want them to remain." | "יתרות פתוחות יישארו פתוחות — סלוק אותן קודם אם אתה לא רוצה שיישארו." |
| `warningBullet4` | "This cannot be undone. Contact support via WhatsApp to restore." | "פעולה זו אינה הפיכה. פנה לתמיכה דרך WhatsApp כדי לשחזר." |
| `continueBtn` | "Continue" | "המשך" |
| `confirmTitle` | "Type your email to confirm" | "כתוב את האימייל שלך לאישור" |
| `typeEmailHint` | "To confirm deletion, type:" | "כדי לאשר את המחיקה, הקלד:" |
| `deleteBtn` | "Delete my account" | "מחק את החשבון" |
| `deletedToast` | "Account deleted" | "החשבון נמחק" |
| `deleteFailed` | "Could not delete account. Please try again." | "מחיקת החשבון נכשלה. נסה שוב." |
| `deactivatedTitle` | "Account deactivated" | "החשבון לא פעיל" |
| `deactivatedMessage` | "This account has been deleted. Contact support via WhatsApp to restore it." | "החשבון הזה נמחק. פנה לתמיכה דרך WhatsApp כדי לשחזר." |

---

## 10. SRS

Add to section 3.1 (Profile):

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-PROF-06 | ⬜ | User can delete their own account | RPC `delete_my_account` sets `profiles.is_active=false` + `deleted_at=NOW()`; mobile signs out; subsequent sign-in is rejected with the deactivated alert; peers continue to see the user's data unchanged |

Changelog row:

```
| 2026-05-19 | Add REQ-PROF-06 — account self-deletion (soft, type-to-confirm) |
```

---

## 11. Error handling

| Scenario | Behavior |
|----------|----------|
| RPC returns error | Toast error, sheet stays open, user remains signed in |
| `signOut()` fails after successful RPC | Profile is already deactivated; show toast; the next `assertProfileActive` will catch it and sign them out |
| Typed email doesn't match | Delete button stays disabled; no error UI — the disabled state is the feedback |
| User backgrounds the app mid-confirmation | Sheet stays open on resume; no auto-confirmation |
| Deactivated user with a live access token tries to write | Their JWT is valid until expiry (~1h). They are signed out client-side immediately and cannot reach the app. Worst case: they could call the API directly in that window — accepted risk for v1. Future hardening: an RLS policy that blocks writes when `is_active=false`, but that contradicts decision A's "peers see no change" guarantee only if other-user reads check `is_active`, which they will not. |

---

## 12. Testing

| Layer | Coverage |
|-------|----------|
| Server (manual via Supabase SQL Editor) | RPC sets is_active=false; second call is no-op; can't deactivate another user (function only touches `auth.uid()`) |
| Mobile unit — `account.service.ts` | RPC success → returns `{ ok: true }` and calls `signOut`. RPC error → returns `{ ok: false, error }` and does NOT call `signOut`. |
| Mobile unit — `lib/auth.ts assertProfileActive` | Profile `is_active=true` → returns `'active'`, no sign-out. `is_active=false` → calls `signOut` + returns `'deactivated'`. No profile row → returns `'missing'`. |
| Mobile component — `DeleteAccountConfirmSheet` | Delete button disabled when typed ≠ email; enabled when typed === email (case-insensitive, trimmed); calls `onConfirm` on press. |
| Mobile component — `DeleteAccountWarningSheet` | Renders title + 4 bullets; Cancel calls `onClose`; Continue calls `onContinue`. |
| Mobile component — `SettingsScreen` | Pressing "Delete account" opens warning sheet; Continue closes warning + opens confirm; successful confirm shows toast. |

---

## 13. Out of scope (v1)

- Email-based reactivation flow
- 30-day cooling period with auto-purge
- Hard delete (actually deleting rows)
- GDPR data export ("download my data") — separate feature
- Admin dashboard to reactivate deleted accounts (manual SQL update for now)
- Deleting deactivated users' avatars from Storage

---

## 14. Implementation phases (recommended)

| Phase | Scope |
|-------|-------|
| **1** | Schema + RPC + apply to Supabase |
| **2** | `account.service.ts`, `assertProfileActive` in `lib/auth.ts`, hook into App.tsx auth listener |
| **3** | i18n keys, `DeleteAccountWarningSheet`, `DeleteAccountConfirmSheet` |
| **4** | Wire into SettingsScreen, manual smoke test |
| **5** | SRS update |

---

*Spec self-reviewed: no placeholders, internally consistent with the existing dashboard plan, scope limited to one cohesive feature.*
