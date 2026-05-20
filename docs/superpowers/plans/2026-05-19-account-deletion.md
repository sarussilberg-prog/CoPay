# Account Deletion (Soft) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user delete their own account via a two-step typed-email confirmation in Settings, soft-deactivating the profile (`is_active=false`, `deleted_at=NOW()`), preserving all peer-visible data, and rejecting any subsequent sign-in attempt.

**Architecture:** A Postgres RPC `delete_my_account()` (SECURITY DEFINER, constrained by `auth.uid()`) flips the profile flag. Mobile calls it via a thin `account.service.ts`, then signs out. A new `assertProfileActive()` helper in `lib/auth.ts` runs after every auth state change and signs out + alerts when the current user's profile is inactive. UI is two `Modal` bottom sheets that mirror the existing `LegalSheet` / `LanguageSheet` pattern.

**Tech Stack:** Supabase (Postgres + RLS + JS client), Expo SDK 54 mobile, NativeWind 4, Zustand, react-i18next, jest-expo.

---

## File map

| File | Responsibility |
|------|----------------|
| `cost-share-app/supabase/schema.sql` | Append `is_active` + `deleted_at` columns + `delete_my_account()` RPC |
| `cost-share-app/apps/mobile/lib/auth.ts` | Add `assertProfileActive(): Promise<ProfileStatus>` + `ProfileStatus` type |
| `cost-share-app/apps/mobile/services/account.service.ts` | `deleteMyAccount(): Promise<DeleteAccountResult>` — RPC + signOut |
| `cost-share-app/apps/mobile/App.tsx` | Call `assertProfileActive()` after session bootstrap & on every `SIGNED_IN` event |
| `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx` | Sheet A — warning + Continue |
| `cost-share-app/apps/mobile/components/settings/DeleteAccountConfirmSheet.tsx` | Sheet B — typed-email confirmation |
| `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx` | Add "Delete account" row in Account section + sheet wiring |
| `cost-share-app/apps/mobile/i18n/locales/en.json` + `he.json` | Add `settings.deleteAccount` + new `deleteAccount` namespace |
| `docs/SSOT/SRS.md` | Add REQ-PROF-06 |

---

## Phase 0 — Schema + RPC

### Task 0.1: Add `is_active`, `deleted_at`, and `delete_my_account()` to schema

**Files:** Modify `cost-share-app/supabase/schema.sql`.

- [ ] **Step 1: Append to the end of `schema.sql`**

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

- [ ] **Step 2: Tell the user to apply the new block to Supabase**

Tell the user: "Paste the new `ACCOUNT DEACTIVATION` block (~22 lines) from `cost-share-app/supabase/schema.sql` into the Supabase SQL Editor and run it. The `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION` guards make it safe to re-run."

Mobile tests use mocks, so downstream tasks are not blocked by the live apply.

- [ ] **Step 3: Local sanity check**

Re-read the appended block and confirm:
- `is_active BOOLEAN NOT NULL DEFAULT TRUE` — existing rows backfill to TRUE.
- `deleted_at TIMESTAMPTZ` (nullable) — NULL for existing rows.
- Partial index on `is_active=FALSE` (cheap; only catches deactivated rows).
- RPC uses `auth.uid()` (caller's id) + `is_active = TRUE` (idempotent).
- `GRANT EXECUTE ... TO authenticated`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/schema.sql
git commit -m "feat(db): add is_active/deleted_at + delete_my_account RPC for account deletion"
```

Stage only `schema.sql`.

---

## Phase 1 — Mobile core (auth guard + service + listener wiring)

### Task 1.1: `assertProfileActive` in `lib/auth.ts`

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/auth.ts`
- Create: `cost-share-app/apps/mobile/__tests__/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/lib/auth.test.ts`:

```typescript
const mockGetUser = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../lib/supabase', () => ({
    supabase: {
        auth: { getUser: (...a: any[]) => mockGetUser(...a), signOut: (...a: any[]) => mockSignOut(...a) },
        from: (...a: any[]) => mockFrom(...a),
    },
}));

import { assertProfileActive, getCurrentUserId } from '../../lib/auth';

beforeEach(() => {
    mockGetUser.mockReset();
    mockSignOut.mockClear();
    mockMaybeSingle.mockReset();
});

describe('assertProfileActive', () => {
    it('returns "active" and does not sign out when is_active=true', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: { is_active: true }, error: null });

        expect(await assertProfileActive()).toBe('active');
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('returns "deactivated" and signs out when is_active=false', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: { is_active: false }, error: null });

        expect(await assertProfileActive()).toBe('deactivated');
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('returns "missing" when no profile row exists', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        expect(await assertProfileActive()).toBe('missing');
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('returns "active" with no side effect when there is no signed-in user', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        expect(await assertProfileActive()).toBe('active');
        expect(mockFrom).not.toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled();
    });
});

describe('getCurrentUserId (unchanged, sanity)', () => {
    it('returns the signed-in user id', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        expect(await getCurrentUserId()).toBe('u1');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/lib/auth.test.ts`
Expected: FAIL (`assertProfileActive` is not exported).

- [ ] **Step 3: Add `assertProfileActive` to `lib/auth.ts`**

Open `cost-share-app/apps/mobile/lib/auth.ts`. The file currently contains:

```typescript
import { supabase } from './supabase';

/** Returns the signed-in Supabase user id, or null if not authenticated. */
export async function getCurrentUserId(): Promise<string | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
}
```

Append below `getCurrentUserId`:

```typescript
export type ProfileStatus = 'active' | 'deactivated' | 'missing';

/**
 * Verifies the signed-in user's profile is active.
 * - 'active'      : profile exists and is_active=true (or no user is signed in — caller decides what to do).
 * - 'deactivated' : profile exists and is_active=false. Side effect: signs the user out before returning.
 * - 'missing'     : signed in but no profile row yet (first-login race with the profile-creation trigger).
 */
export async function assertProfileActive(): Promise<ProfileStatus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'active';

    const { data, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error('assertProfileActive: profile lookup failed', error);
        return 'active'; // Fail-open: don't lock the user out on transient errors.
    }
    if (!data) return 'missing';
    if (data.is_active === false) {
        await supabase.auth.signOut();
        return 'deactivated';
    }
    return 'active';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/lib/auth.test.ts`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/auth.ts cost-share-app/apps/mobile/__tests__/lib/auth.test.ts
git commit -m "feat(mobile): add assertProfileActive auth guard with sign-out on deactivation"
```

Stage only those two files.

---

### Task 1.2: `account.service.ts` with `deleteMyAccount`

**Files:**
- Create: `cost-share-app/apps/mobile/services/account.service.ts`
- Create: `cost-share-app/apps/mobile/__tests__/services/account.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cost-share-app/apps/mobile/__tests__/services/account.service.test.ts`:

```typescript
const mockRpc = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: (...a: any[]) => mockRpc(...a), auth: { signOut: (...a: any[]) => mockSignOut(...a) } },
}));

import { deleteMyAccount } from '../../services/account.service';

beforeEach(() => {
    mockRpc.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
});

describe('deleteMyAccount', () => {
    it('calls RPC then signs out and returns ok on success', async () => {
        mockRpc.mockResolvedValue({ data: null, error: null });

        const result = await deleteMyAccount();

        expect(result).toEqual({ ok: true });
        expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
        expect(mockSignOut).toHaveBeenCalledTimes(1);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/services/account.service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `cost-share-app/apps/mobile/services/account.service.ts`:

```typescript
import { supabase } from '../lib/supabase';

export interface DeleteAccountResult {
    ok: boolean;
    error?: string; // i18n key
}

/**
 * Soft-delete the signed-in user's account.
 * On RPC success → also signs out. On RPC failure → leaves the session intact.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
        console.error('deleteMyAccount: RPC failed', rpcError);
        return { ok: false, error: 'deleteAccount.deleteFailed' };
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
        // The deactivation already succeeded. Log and proceed.
        console.warn('deleteMyAccount: signOut failed after deactivation', signOutError);
    }

    return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/services/account.service.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/account.service.ts cost-share-app/apps/mobile/__tests__/services/account.service.test.ts
git commit -m "feat(mobile): add deleteMyAccount service (RPC + signOut)"
```

Stage only those two files.

---

### Task 1.3: Wire `assertProfileActive` into `App.tsx`

**Files:**
- Modify: `cost-share-app/apps/mobile/App.tsx`
- Modify (already exists): `cost-share-app/apps/mobile/i18n/locales/en.json` + `he.json` (only if the `deactivatedTitle`/`deactivatedMessage` keys are NOT yet present — they are added in Task 2.1; this task uses them but doesn't define them, so do Task 2.1 first if running out of order).

> **Order matters:** Task 2.1 (i18n) must be applied before this task can deliver a working user-facing message. If running subagents in order 1.1 → 1.2 → 1.3 → 2.1, the alert text will display the raw keys until 2.1 lands. Acceptable for tests; do not commit the manual smoke step until 2.1 is in.

- [ ] **Step 1: Read the existing auth-listener block**

Open `cost-share-app/apps/mobile/App.tsx`. The relevant region is the `useEffect` starting around line 53 that does:

```typescript
useEffect(() => {
    let mounted = true;

    const init = async () => {
        try {
            await initializeLanguage();
            const { data } = await supabase.auth.getSession();
            if (mounted) setSession(data.session);
        } catch (e) {
            console.error('Init error:', e);
        } finally {
            if (mounted) setIsReady(true);
        }
    };

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
    });

    return () => {
        mounted = false;
        subscription.unsubscribe();
    };
}, []);
```

- [ ] **Step 2: Add the guard call after every session set**

Add imports at the top of `App.tsx` if not already present:

```typescript
import { Alert } from 'react-native';
import i18n from './i18n';
import { assertProfileActive } from './lib/auth';
```

Define a helper inside the same component, above the `useEffect`:

```typescript
const guardSession = useCallback(async () => {
    const status = await assertProfileActive();
    if (status === 'deactivated') {
        Alert.alert(
            i18n.t('deleteAccount.deactivatedTitle'),
            i18n.t('deleteAccount.deactivatedMessage'),
            [{ text: i18n.t('common.ok') }],
        );
    }
}, []);
```

Make sure `useCallback` is imported from `react` (it likely already is).

- [ ] **Step 3: Call the guard from `init` and from the listener**

Inside `init()`, after `if (mounted) setSession(data.session);`, add:

```typescript
        if (mounted && data.session) {
            void guardSession();
        }
```

Inside the `onAuthStateChange` callback, replace:

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
});
```

with:

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session);
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        void guardSession();
    }
});
```

(The previously-unused `_event` becomes `event`. The guard is fire-and-forget — if it discovers a deactivation it will sign out, which triggers another listener tick with `session=null`, and the existing navigator logic flips to the Login stack.)

- [ ] **Step 4: Sanity-run the mobile test suite**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npm test`
Expected: all suites pass. No new test file is added in this task — App.tsx integration is verified by manual smoke in Task 3.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/App.tsx
git commit -m "feat(mobile): guard auth state with assertProfileActive on every session set"
```

Stage only `App.tsx`.

---

## Phase 2 — UI

### Task 2.1: i18n keys (settings.deleteAccount + deleteAccount namespace)

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

- [ ] **Step 1: Add `settings.deleteAccount` to both locales**

In `en.json`, find the existing `settings` object. Add a new key at the end of that object:

```json
"deleteAccount": "Delete account"
```

(Place it after `"whatsappOpenFailed"` or wherever the existing block ends — make sure to add a comma after the previous key.)

In `he.json`, same place:

```json
"deleteAccount": "מחק חשבון"
```

- [ ] **Step 2: Add a new top-level `deleteAccount` namespace to both locales**

In `en.json`, after the existing `legal` block (and before the closing `}`), add a comma to the previous block's closing brace and then:

```json
"deleteAccount": {
    "warningTitle": "Delete account?",
    "warningBullet1": "You will no longer be able to sign in.",
    "warningBullet2": "Your name and history remain visible to friends you shared groups with.",
    "warningBullet3": "Open balances stay open — settle them first if you don't want them to remain.",
    "warningBullet4": "This cannot be undone. Contact support via WhatsApp to restore.",
    "continueBtn": "Continue",
    "confirmTitle": "Type your email to confirm",
    "typeEmailHint": "To confirm deletion, type:",
    "deleteBtn": "Delete my account",
    "deletedToast": "Account deleted",
    "deleteFailed": "Could not delete account. Please try again.",
    "deactivatedTitle": "Account deactivated",
    "deactivatedMessage": "This account has been deleted. Contact support via WhatsApp to restore it."
}
```

In `he.json`, mirror with Hebrew:

```json
"deleteAccount": {
    "warningTitle": "למחוק את החשבון?",
    "warningBullet1": "לא תוכל להתחבר יותר.",
    "warningBullet2": "השם וההיסטוריה שלך ימשיכו להופיע לחברים בקבוצות המשותפות.",
    "warningBullet3": "יתרות פתוחות יישארו פתוחות — סלוק אותן קודם אם אתה לא רוצה שיישארו.",
    "warningBullet4": "פעולה זו אינה הפיכה. פנה לתמיכה דרך WhatsApp כדי לשחזר.",
    "continueBtn": "המשך",
    "confirmTitle": "כתוב את האימייל שלך לאישור",
    "typeEmailHint": "כדי לאשר את המחיקה, הקלד:",
    "deleteBtn": "מחק את החשבון",
    "deletedToast": "החשבון נמחק",
    "deleteFailed": "מחיקת החשבון נכשלה. נסה שוב.",
    "deactivatedTitle": "החשבון לא פעיל",
    "deactivatedMessage": "החשבון הזה נמחק. פנה לתמיכה דרך WhatsApp כדי לשחזר."
}
```

- [ ] **Step 2.5: Validate both files parse + EN/HE keys match**

```bash
cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && node -e "
const en = JSON.parse(require('fs').readFileSync('i18n/locales/en.json', 'utf8'));
const he = JSON.parse(require('fs').readFileSync('i18n/locales/he.json', 'utf8'));
if (en.settings.deleteAccount === undefined || he.settings.deleteAccount === undefined) throw new Error('missing settings.deleteAccount');
if (!en.deleteAccount || !he.deleteAccount) throw new Error('missing deleteAccount namespace');
const a = Object.keys(en.deleteAccount).sort();
const b = Object.keys(he.deleteAccount).sort();
if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('en:', a); console.log('he:', b); throw new Error('mismatch'); }
console.log('deleteAccount keys:', a.length);
"
```

Expected: `deleteAccount keys: 13`.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): add deleteAccount i18n keys + settings.deleteAccount"
```

Stage only those two files.

---

### Task 2.2: `DeleteAccountWarningSheet` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountWarningSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DeleteAccountWarningSheet } from '../../../components/settings/DeleteAccountWarningSheet';

describe('DeleteAccountWarningSheet', () => {
    it('renders title + 4 bullets when visible', () => {
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={() => {}} onContinue={() => {}} />,
        );
        expect(getByText('deleteAccount.warningTitle')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet1')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet2')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet3')).toBeTruthy();
        expect(getByText('deleteAccount.warningBullet4')).toBeTruthy();
    });

    it('does not render content when hidden', () => {
        const { queryByText } = render(
            <DeleteAccountWarningSheet visible={false} onClose={() => {}} onContinue={() => {}} />,
        );
        expect(queryByText('deleteAccount.warningTitle')).toBeNull();
    });

    it('Cancel triggers onClose', () => {
        const onClose = jest.fn();
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={onClose} onContinue={() => {}} />,
        );
        fireEvent.press(getByText('common.cancel'));
        expect(onClose).toHaveBeenCalled();
    });

    it('Continue triggers onContinue', () => {
        const onContinue = jest.fn();
        const { getByText } = render(
            <DeleteAccountWarningSheet visible onClose={() => {}} onContinue={onContinue} />,
        );
        fireEvent.press(getByText('deleteAccount.continueBtn'));
        expect(onContinue).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run (fail)**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/components/settings/DeleteAccountWarningSheet.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx`:

```typescript
import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    visible: boolean;
    onClose: () => void;
    onContinue: () => void;
}

const BULLET_KEYS = [
    'deleteAccount.warningBullet1',
    'deleteAccount.warningBullet2',
    'deleteAccount.warningBullet3',
    'deleteAccount.warningBullet4',
];

export function DeleteAccountWarningSheet({ visible, onClose, onContinue }: Props) {
    const { t } = useTranslation();
    if (!visible) return null;
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
                    <ScrollView className="px-5">
                        {BULLET_KEYS.map((key) => (
                            <View key={key} className="flex-row items-start mb-3">
                                <AppIcon name="alert-circle-outline" size={18} color={colors.error} />
                                <Text className="flex-1 ms-2 text-base text-gray-700 leading-6">
                                    {t(key)}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                    <View className="flex-row gap-3 px-5 my-5">
                        <TouchableOpacity
                            onPress={onClose}
                            className="flex-1 bg-gray-100 rounded-xl py-4"
                        >
                            <Text className="text-center font-semibold text-gray-700">{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onContinue}
                            className="flex-1 bg-red-500 rounded-xl py-4"
                        >
                            <Text className="text-center font-semibold text-white">{t('deleteAccount.continueBtn')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
```

- [ ] **Step 4: Run (pass)**

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/settings/DeleteAccountWarningSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountWarningSheet.test.tsx
git commit -m "feat(mobile): add DeleteAccountWarningSheet"
```

Stage only those two files.

---

### Task 2.3: `DeleteAccountConfirmSheet` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/settings/DeleteAccountConfirmSheet.tsx`
- Create: `cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountConfirmSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DeleteAccountConfirmSheet } from '../../../components/settings/DeleteAccountConfirmSheet';

describe('DeleteAccountConfirmSheet', () => {
    it('renders title + email hint when visible', () => {
        const { getByText } = render(
            <DeleteAccountConfirmSheet
                visible
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={async () => {}}
            />,
        );
        expect(getByText('deleteAccount.confirmTitle')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
    });

    it('Delete button is disabled until typed email matches (case-insensitive, trimmed)', async () => {
        const onConfirm = jest.fn().mockResolvedValue(undefined);
        const { getByPlaceholderText, getByTestId } = render(
            <DeleteAccountConfirmSheet
                visible
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={onConfirm}
            />,
        );

        const input = getByPlaceholderText('profile.email');

        // initially disabled — pressing does nothing
        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        expect(onConfirm).not.toHaveBeenCalled();

        // wrong text
        fireEvent.changeText(input, 'wrong');
        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        expect(onConfirm).not.toHaveBeenCalled();

        // correct (uppercased, with whitespace) → enables
        fireEvent.changeText(input, '  A@X.COM  ');
        fireEvent.press(getByTestId('delete-account-confirm-btn'));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('does not render when hidden', () => {
        const { queryByText } = render(
            <DeleteAccountConfirmSheet
                visible={false}
                expectedEmail="a@x.com"
                onClose={() => {}}
                onConfirm={async () => {}}
            />,
        );
        expect(queryByText('deleteAccount.confirmTitle')).toBeNull();
    });
});
```

- [ ] **Step 2: Run (fail)**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/components/settings/DeleteAccountConfirmSheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `cost-share-app/apps/mobile/components/settings/DeleteAccountConfirmSheet.tsx`:

```typescript
import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Pressable,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    expectedEmail: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

function normalize(s: string): string {
    return s.trim().toLowerCase();
}

export function DeleteAccountConfirmSheet({ visible, expectedEmail, onClose, onConfirm }: Props) {
    const { t } = useTranslation();
    const [typed, setTyped] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!visible) return null;

    const isMatch = normalize(typed) === normalize(expectedEmail);
    const canSubmit = isMatch && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setTyped('');
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <Pressable className="flex-1 bg-black/40" onPress={handleClose}>
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-xl font-bold text-gray-900 px-5 mt-2 mb-1">
                        {t('deleteAccount.confirmTitle')}
                    </Text>
                    <Text className="text-sm text-gray-500 px-5 mb-1">
                        {t('deleteAccount.typeEmailHint')}
                    </Text>
                    <Text selectable className="text-sm font-medium text-gray-800 px-5 mb-3">
                        {expectedEmail}
                    </Text>
                    <TextInput
                        value={typed}
                        onChangeText={setTyped}
                        placeholder={t('profile.email')}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        editable={!submitting}
                        className="mx-5 mb-4 px-3 py-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900"
                    />
                    <TouchableOpacity
                        testID="delete-account-confirm-btn"
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        className={`mx-5 mb-3 rounded-xl py-4 ${canSubmit ? 'bg-red-500' : 'bg-red-200'}`}
                    >
                        {submitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-center font-semibold text-white">
                                {t('deleteAccount.deleteBtn')}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClose} disabled={submitting} className="mx-5 mb-6">
                        <Text className="text-center text-sm text-gray-500">{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
```

- [ ] **Step 4: Run (pass)**

Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/settings/DeleteAccountConfirmSheet.tsx cost-share-app/apps/mobile/__tests__/components/settings/DeleteAccountConfirmSheet.test.tsx
git commit -m "feat(mobile): add DeleteAccountConfirmSheet with typed-email gate"
```

Stage only those two files.

---

### Task 2.4: Wire delete-account flow into `SettingsScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`
- Modify: `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx`

- [ ] **Step 1: Extend the SettingsScreen test**

Open `cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx`. Add a mock for `account.service` near the other `jest.mock` calls:

```typescript
jest.mock('../../../services/account.service', () => ({
    deleteMyAccount: jest.fn().mockResolvedValue({ ok: true }),
}));
```

Then add two new test cases inside the existing `describe('SettingsScreen (grouped, no notifications)')`:

```typescript
    it('renders Delete account row in Account section', () => {
        const { getByText } = render(<SettingsScreen />);
        expect(getByText('settings.deleteAccount')).toBeTruthy();
    });

    it('opens the warning sheet when Delete account is pressed', () => {
        const { getByText } = render(<SettingsScreen />);
        fireEvent.press(getByText('settings.deleteAccount'));
        expect(getByText('deleteAccount.warningTitle')).toBeTruthy();
    });
```

You will need `useAppStore.setState` to also include `currentUser` so the sheets have an email to display. Update the existing `beforeEach`:

```typescript
useAppStore.setState({
    language: 'en',
    currentUser: { id: 'u1', email: 'a@x.com', name: 'Alice', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
});
```

(If `currentUser` was already set in the existing `beforeEach`, leave it.)

- [ ] **Step 2: Run test (fail on the new cases)**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/screens/profile/SettingsScreen.test.tsx`
Expected: the two new tests fail (the row doesn't exist yet).

- [ ] **Step 3: Wire the flow into SettingsScreen**

Open `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`. Add imports near the top:

```typescript
import Toast from 'react-native-toast-message';
import { deleteMyAccount } from '../../services/account.service';
import { DeleteAccountWarningSheet } from '../../components/settings/DeleteAccountWarningSheet';
import { DeleteAccountConfirmSheet } from '../../components/settings/DeleteAccountConfirmSheet';
```

Inside `SettingsScreen`, after the existing `useState` declarations for `showLogout`/`showLanguage`/`showTerms`/`showPrivacy`, add:

```typescript
const [showDeleteWarning, setShowDeleteWarning] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const currentUser = useAppStore((s) => s.currentUser);
```

(If `useAppStore` for `currentUser` is already destructured at the top of the component, reuse that — do not duplicate the hook call.)

Add the handler beside the existing `handleLogout`:

```typescript
const handleDeleteConfirm = useCallback(async () => {
    const result = await deleteMyAccount();
    if (result.ok) {
        setShowDeleteConfirm(false);
        Toast.show({ type: 'success', text1: t('deleteAccount.deletedToast') });
        // Sign-out from the service flips the session; navigator returns to Login.
    } else {
        Toast.show({
            type: 'error',
            text1: t(result.error ?? 'deleteAccount.deleteFailed'),
        });
    }
}, [t]);
```

Add the new Settings row immediately below the existing Logout row in the Account section:

```typescript
<SettingsSection title={t('settings.account')}>
    <SettingsRow
        iconName="log-out-outline"
        label={t('settings.logout')}
        variant="danger"
        onPress={() => setShowLogout(true)}
    />
    <SettingsRow
        iconName="trash-outline"
        label={t('settings.deleteAccount')}
        variant="danger"
        onPress={() => setShowDeleteWarning(true)}
    />
</SettingsSection>
```

Render the two new sheets near the existing `LegalSheet` / `LanguageSheet` block:

```typescript
<DeleteAccountWarningSheet
    visible={showDeleteWarning}
    onClose={() => setShowDeleteWarning(false)}
    onContinue={() => {
        setShowDeleteWarning(false);
        setShowDeleteConfirm(true);
    }}
/>

<DeleteAccountConfirmSheet
    visible={showDeleteConfirm}
    expectedEmail={currentUser?.email ?? ''}
    onClose={() => setShowDeleteConfirm(false)}
    onConfirm={handleDeleteConfirm}
/>
```

- [ ] **Step 4: Run tests (pass)**

Run: `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npx jest __tests__/screens/profile/SettingsScreen.test.tsx`
Expected: 6 passing (the original 4 plus the 2 new).

- [ ] **Step 5: Manual smoke**

Run the Expo dev client. Sign in. Settings → scroll to Account → tap **Delete account**.
1. Warning sheet appears with 4 bullets. Tap **Cancel** → closes; tap again → reopen; tap **Continue** → confirm sheet opens.
2. Confirm sheet: button is disabled. Type the wrong email → still disabled. Type your real email (any case, surrounding spaces) → button enables, color goes from light red to solid red.
3. Tap **Delete my account** → spinner briefly, then the app flips back to the Login screen. A success toast appears.
4. Try to sign in again with the same Google account → after sign-in, an Alert "Account deactivated" appears and you are signed out automatically. The Login screen is shown.

If step 4 fails (no alert, you stay signed in) → check that the Supabase migration from Task 0.1 was actually applied. If `is_active` doesn't exist in `profiles`, the guard reads `data.is_active === undefined` which is treated as `true` (not strictly equal to `false`).

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx cost-share-app/apps/mobile/__tests__/screens/profile/SettingsScreen.test.tsx
git commit -m "feat(mobile): wire Delete account flow into SettingsScreen"
```

Stage only those two files.

---

## Phase 3 — Wrap up

### Task 3.1: Full test + tsc sweep

- [ ] **Step 1:** `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/apps/mobile && npm test` — all suites green.
- [ ] **Step 2:** `cd /Users/navesarussi/srussilberg/kupa/cost-share-app/packages/shared && npx tsc --noEmit` — no output.
- [ ] **Step 3:** Fix any regression at root cause. Do not `.skip`.

### Task 3.2: SRS update (REQ-PROF-06)

**Files:** Modify `docs/SSOT/SRS.md`.

- [ ] **Step 1:** Append to section 3.1 (Profile), immediately after `REQ-PROF-05`:

```markdown
| REQ-PROF-06 | ✅ | User can delete their own account | RPC `delete_my_account` sets `profiles.is_active=false` + `deleted_at=NOW()`; mobile signs out; subsequent sign-in is rejected with the deactivated alert; peers continue to see the user's data unchanged |
```

- [ ] **Step 2:** Append a changelog row:

```markdown
| 2026-05-19 | Add REQ-PROF-06 — account self-deletion (soft, type-to-confirm) |
```

- [ ] **Step 3:** Commit:

```bash
git add docs/SSOT/SRS.md
git commit -m "docs(srs): add REQ-PROF-06 for account self-deletion"
```

Stage only `docs/SSOT/SRS.md`.

---

## Self-review

- **Spec coverage:**
  - Spec §3 (DB) → Task 0.1.
  - Spec §4 (RPC) → Task 0.1 (same SQL block).
  - Spec §5 (sign-in guard) → Tasks 1.1 + 1.3.
  - Spec §6 (mobile service) → Task 1.2.
  - Spec §7 (UI flow) → Tasks 2.2 + 2.3 + 2.4.
  - Spec §8 (new components) → Tasks 2.2 + 2.3.
  - Spec §9 (i18n) → Task 2.1.
  - Spec §10 (SRS) → Task 3.2.
  - Spec §11 (error handling) → covered inline by the service test (RPC fail → no signOut) and the manual smoke checklist.
  - Spec §12 (testing) → component + service tests across Phase 1–2.
- **Placeholders:** none — every code/SQL/test step contains the exact content.
- **Type consistency:** `ProfileStatus` ∈ `{'active','deactivated','missing'}` (Task 1.1). `DeleteAccountResult` shape `{ ok, error? }` (Task 1.2). `expectedEmail`/`onClose`/`onConfirm` (Task 2.3). `onClose`/`onContinue` (Task 2.2). All match downstream callers in Task 2.4.
