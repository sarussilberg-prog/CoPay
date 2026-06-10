# iOS Sign in with Apple + TestFlight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Sign in with Apple to the CoPay mobile app (App Store Guideline 4.8) and produce a signed iOS build on TestFlight.

**Architecture:** Native Apple flow via `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', ... })`, mirroring the existing `signInWithGoogle` error/`account_deleted` handling. iOS-only UI. Name captured once (Apple returns it only on first authorization) into `profiles.name` via the existing `updateUser`.

**Tech Stack:** Expo SDK 54, React Native 0.81, `expo-apple-authentication`, `expo-crypto` (already installed), `@supabase/supabase-js` 2.105, Jest.

**Spec:** `docs/superpowers/specs/2026-06-09-ios-app-store-sign-in-with-apple-testflight-design.md`

**Working dir for all commands:** `cost-share-app/apps/mobile` unless noted.

---

### Task 1: Add dependency + native config

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json` (via `expo install`)
- Modify: `cost-share-app/apps/mobile/app.json`

- [ ] **Step 1: Install the library (pins SDK-54-correct version)**

Run (from `cost-share-app/apps/mobile`): `npx expo install expo-apple-authentication`
Expected: adds `expo-apple-authentication` to `dependencies`.

- [ ] **Step 2: Add the config plugin and entitlement in `app.json`**

In `expo.plugins`, add `"expo-apple-authentication"` (after `"@react-native-google-signin/google-signin"`).
In `expo.ios`, add `"usesAppleSignIn": true`:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.copay.mobile",
  "usesAppleSignIn": true,
  "associatedDomains": ["applinks:kupa.pro"],
```

- [ ] **Step 3: Verify config parses**

Run: `npx expo config --type public > /dev/null && echo OK`
Expected: `OK` (no schema error).

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/apps/mobile/package-lock.json cost-share-app/apps/mobile/app.json
git commit -m "feat(mobile): add expo-apple-authentication + usesAppleSignIn entitlement"
```

---

### Task 2: `signInWithApple()` in the auth service (TDD)

**Files:**
- Modify: `cost-share-app/apps/mobile/services/auth.service.ts`
- Test: `cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts`

- [ ] **Step 1: Add mocks + failing tests**

At the top of the test file, alongside the existing mocks, add:

```ts
const mockAppleSignInAsync = jest.fn();
const mockUpdateUser = jest.fn().mockResolvedValue(null);

jest.mock('expo-apple-authentication', () => ({
    signInAsync: (...args: unknown[]) => mockAppleSignInAsync(...args),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algo: string, value: string) => `hashed:${value}`),
    randomUUID: jest.fn(() => 'uuid-1234'),
}));

jest.mock('../../services/users.service', () => ({
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));
```

Add `signInWithApple` to the import from `../../services/auth.service`. Then add this describe block before `describe('signOut'`:

```ts
describe('signInWithApple', () => {
    beforeEach(() => {
        setPlatformOs('ios');
        mockSignInWithIdToken.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        });
    });

    it('exchanges the Apple identity token with the raw nonce', async () => {
        mockAppleSignInAsync.mockResolvedValue({
            identityToken: 'apple-id-token',
            fullName: null,
        });

        const result = await signInWithApple();

        expect(mockAppleSignInAsync).toHaveBeenCalledWith(
            expect.objectContaining({ nonce: 'hashed:uuid-1234' }),
        );
        expect(mockSignInWithIdToken).toHaveBeenCalledWith({
            provider: 'apple',
            token: 'apple-id-token',
            nonce: 'uuid-1234',
        });
        expect(result.error).toBeNull();
    });

    it('captures the full name on first sign-in', async () => {
        mockAppleSignInAsync.mockResolvedValue({
            identityToken: 'apple-id-token',
            fullName: { givenName: 'Dana', familyName: 'Cohen' },
        });

        await signInWithApple();

        expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { name: 'Dana Cohen' });
    });

    it('does not call updateUser when Apple returns no name', async () => {
        mockAppleSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null });

        await signInWithApple();

        expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('returns no error (silent) when the user cancels', async () => {
        mockAppleSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

        const result = await signInWithApple();

        expect(result.error).toBeNull();
        expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });

    it('returns account_deleted when the profile is deactivated', async () => {
        mockAppleSignInAsync.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null });
        mockIsAuthSessionAllowed.mockResolvedValueOnce(false);

        const result = await signInWithApple();

        expect(result.error?.code).toBe('account_deleted');
    });

    it('returns a generic error when there is no identity token', async () => {
        mockAppleSignInAsync.mockResolvedValue({ identityToken: null, fullName: null });

        const result = await signInWithApple();

        expect(result.error?.code).toBe('generic');
        expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx jest __tests__/services/auth.service.test.ts -t signInWithApple`
Expected: FAIL — `signInWithApple is not a function` / not exported.

- [ ] **Step 3: Implement `signInWithApple`**

Add imports near the top of `services/auth.service.ts`:

```ts
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { updateUser } from './users.service';
```

Add this function (e.g. after `signInWithGoogle`):

```ts
function isAppleCancel(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err
        && (err as { code?: string }).code === 'ERR_REQUEST_CANCELED';
}

export async function signInWithApple(): Promise<{ error: AuthError | null }> {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
        const rawNonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            rawNonce,
        );
        credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: hashedNonce,
        });

        if (!credential.identityToken) {
            return { error: toAuthError(new Error('No Apple identity token returned')) };
        }

        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
            nonce: rawNonce,
        });
        if (error) return { error: toAuthError(error) };

        const allowed = await isAuthSessionAllowed();
        if (!allowed) {
            return { error: { code: 'account_deleted', message: 'account deleted' } satisfies AuthError };
        }

        // Apple returns fullName only on the FIRST authorization; persist it so the
        // profile shows a real name instead of the email the DB trigger defaults to.
        const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
            .filter(Boolean)
            .join(' ')
            .trim();
        const userId = data.user?.id;
        if (fullName && userId) {
            try {
                await updateUser(userId, { name: fullName });
            } catch {
                // best-effort; never block sign-in on a name update
            }
        }

        return { error: null };
    } catch (err) {
        if (isAppleCancel(err)) return { error: null };
        return { error: toAuthError(err) };
    }
}
```

Note: do **not** import `expo-crypto`'s nonce inline elsewhere; `randomUUID` is sufficient entropy for the nonce.

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx jest __tests__/services/auth.service.test.ts`
Expected: PASS (existing + new `signInWithApple` cases).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/auth.service.ts cost-share-app/apps/mobile/__tests__/services/auth.service.test.ts
git commit -m "feat(mobile): native signInWithApple via Supabase signInWithIdToken"
```

---

### Task 3: Apple button on the login screen

**Files:**
- Create: `cost-share-app/apps/mobile/components/auth/LoginAppleButton.tsx`
- Modify: `cost-share-app/apps/mobile/screens/auth/LoginScreen.tsx`

- [ ] **Step 1: Create the iOS-only Apple button wrapper**

```tsx
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

type Props = {
    onPress: () => void;
    disabled?: boolean;
};

// Apple's HIG requires the official button; it self-localizes its label.
export function LoginAppleButton({ onPress, disabled = false }: Props) {
    if (Platform.OS !== 'ios') return null;
    return (
        <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={27}
            style={[styles.button, disabled && styles.disabled]}
            onPress={disabled ? () => {} : onPress}
        />
    );
}

const styles = StyleSheet.create({
    button: { height: 54, width: '100%' },
    disabled: { opacity: 0.7 },
});
```

- [ ] **Step 2: Wire it into `LoginScreen.tsx`**

Add imports:

```tsx
import { LoginAppleButton } from '../../components/auth/LoginAppleButton';
import { signInWithApple } from '../../services/auth.service';
```

Add a handler next to `handleSignIn`:

```tsx
const handleAppleSignIn = async () => {
    startLoading();
    try {
        const { error } = await signInWithApple();
        if (error) {
            if (error.code === 'account_deleted') {
                showDeletedAccountNotice();
                return;
            }
            handleError(error, {
                toast: { titleKey: 'auth.signInError', message: error.message },
                tags: { service: 'auth', op: 'signInWithApple' },
                extra: { errorCode: error.code },
            });
        }
    } catch (error) {
        handleError(error, {
            toast: { titleKey: 'auth.signInError' },
            tags: { service: 'auth', op: 'signInWithApple' },
        });
    } finally {
        stopLoading();
    }
};
```

In the button container (the `<View className="px-7 pb-2">` block), render the Apple button below the Google button with a small gap:

```tsx
<LoginGoogleButton
    title={t('auth.signInWithGoogle')}
    onPress={handleSignIn}
    loading={isLoading}
    disabled={isLoading}
/>
<View className="h-3" />
<LoginAppleButton onPress={handleAppleSignIn} disabled={isLoading} />
```

- [ ] **Step 3: Typecheck**

Run (from `cost-share-app/apps/mobile`): `npx tsc --noEmit`
Expected: no errors. (If the repo exposes a lint/typecheck script via turbo, run that too.)

- [ ] **Step 4: Run the mobile test suite**

Run: `npx jest`
Expected: PASS (no regressions; the LoginScreen render tests, if any, still pass — the Apple button returns null off-iOS).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/auth/LoginAppleButton.tsx cost-share-app/apps/mobile/screens/auth/LoginScreen.tsx
git commit -m "feat(mobile): show Sign in with Apple button on iOS login"
```

---

### Task 4: `eas.json` submit config + iOS SSOT doc

**Files:**
- Modify: `cost-share-app/apps/mobile/eas.json`
- Create: `docs/APP_STORE_IOS.md`

- [ ] **Step 1: Add `ascAppId` placeholder note to `eas.json`**

The numeric App Store Connect app ID is needed for `eas submit`. It is read from App Store Connect during the interactive submit; add it to `submit.production.ios` once known:

```json
"ios": {
  "appleId": "sarussilberg@gmail.com",
  "ascAppId": "<APP_STORE_CONNECT_NUMERIC_APP_ID>"
}
```

Leave a comment in the handoff (Task 5) to fill this from App Store Connect → App Information → "Apple ID".

- [ ] **Step 2: Write `docs/APP_STORE_IOS.md`**

Mirror `docs/PLAY_STORE_ANDROID.md`: document the EAS account (`@saussilberg/copay`), Apple ID (`sarussilberg@gmail.com`), Sign in with Apple setup (Supabase Apple provider + Authorized Client ID `com.copay.mobile`; Apple Developer capability), the first interactive build, `eas submit` to TestFlight, and the `COPAY_IOS_TEAM_ID` / AASA follow-up.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/eas.json docs/APP_STORE_IOS.md
git commit -m "docs(ios): App Store/TestFlight runbook + eas submit ascAppId"
```

---

### Task 5: Configuration + build handoff (mixed: Claude + user)

These are not code edits; track them explicitly.

- [ ] **Claude — enable Supabase Apple provider (prod `jfqxjjjbpxbwwvoygahu` + dev `drxfbicunusmipdgbgdk`)**

Enable the Apple provider and add `com.copay.mobile` to Authorized Client IDs (no secret key needed for native). Do via Supabase MCP or hand the user the exact dashboard path. **Confirm with the user before changing prod auth config.**

- [ ] **User — first interactive iOS build**

Run in a real terminal (NOT via Claude): `eas whoami` (must be `saussilberg`), then
`eas build -p ios --profile production`. Complete Apple login (`sarussilberg@gmail.com`) + 2FA so EAS generates the Distribution Certificate + Provisioning Profile (with Sign in with Apple + associated domains).

- [ ] **User — submit to TestFlight**

Fill `ascAppId` in `eas.json` (App Store Connect → App Information → Apple ID), then
`eas submit -p ios --profile production` (or `--latest`). Wait for TestFlight processing.

- [ ] **User — device validation**

Install via TestFlight; verify Google sign-in, Apple sign-in (incl. first-run name), and basic app flow.

- [ ] **Claude — Universal Links follow-up**

After the build, read the Apple **Team ID**, set `COPAY_IOS_TEAM_ID` on prod, and redeploy the `invite-landing` Edge Function. Verify the AASA at `https://kupa.pro/.well-known/apple-app-site-association` serves the correct `appID`.

---

## Self-Review

- **Spec coverage:** §A (code) → Tasks 1–3; §B (Supabase/Apple Dev) → Task 5; §C (credentials/build/TestFlight) → Task 5; §D (Team ID/AASA) → Task 5; §E (SSOT doc) → Task 4. Covered.
- **Type consistency:** `signInWithApple` returns `{ error: AuthError | null }` (matches `signInWithGoogle`); `updateUser(id, { name })` matches `users.service.ts:118`; `AuthError`/`toAuthError`/`isAuthSessionAllowed` already exist in `auth.service.ts`.
- **Placeholders:** `ascAppId` and `COPAY_IOS_TEAM_ID` are genuine runtime values obtained during Task 5, not unfilled plan content.
- **Verification gates:** jest green (Task 2/3), typecheck clean (Task 3), successful interactive build + device test (Task 5).
