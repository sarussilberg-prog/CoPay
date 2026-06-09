# iOS App Store: Sign in with Apple + TestFlight (Phase 1)

**Date:** 2026-06-09
**Status:** Approved design — ready for implementation plan
**Owner:** navesarussi
**App:** CoPay (`com.kupay.mobile`), Expo SDK 55, `cost-share-app/apps/mobile`

## Goal

Get a signed iOS build of CoPay onto **TestFlight**, validated on a real device, as the
first step toward an App Store release. The hard prerequisite is that the app must offer a
privacy-preserving login alternative to Google — i.e. **Sign in with Apple** — or App
Store Review will reject it under Guideline 4.8.

Store-listing metadata and "submit for review" are **Phase 2** and out of scope here.

## Current state (verified 2026-06-09)

- Login screen offers **Google sign-in only** (`signInWithOAuth` → `exchangeCodeForSession`).
  No email/password, no Apple. This triggers App Store Guideline 4.8.
- `expo-apple-authentication` is **not** installed; Supabase **Apple provider is not configured**.
- iOS signing credentials are **not** set up on the `@saussilberg/kupay` EAS account; no iOS
  build has ever run there. The first iOS build must run **interactively** for Apple login + 2FA.
- App Store Connect record "CoPay v0" exists (version 1.0, "Prepare for Submission"); all
  metadata is empty.
- `app.json` declares `ios.associatedDomains: ["applinks:kupa.pro"]`, but `KUPAY_IOS_TEAM_ID`
  is unset on prod, so Universal Links won't resolve yet.
- Apple Developer Program membership is **active** (confirmed by user).
- Working branch: `claude/interesting-rosalind-56ed5a` (worktree), merged up to `origin/dev`
  (HEAD `b5a93da` = `main` + dev commits #40/#41/#42). Staying on this branch per user.

## Decisions

1. **Add native Sign in with Apple** (not email/magic-link). Canonical solution for 4.8,
   lowest rejection risk.
2. **Native flow**, not browser OAuth: `expo-apple-authentication` →
   `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`. iOS-only button.
3. **TestFlight first**, then Phase 2 (store metadata + submit).

## Design

### A. Sign in with Apple — code

**`app.json`**
- Add `"expo-apple-authentication"` to `plugins`.
- Add `"usesAppleSignIn": true` under `expo.ios` (adds the entitlement so EAS provisions it).

**`services/auth.service.ts` — new `signInWithApple()`**
- Generate a random `rawNonce`; pass `SHA256(rawNonce)` to `AppleAuthentication.signInAsync`
  with scopes `[FULL_NAME, EMAIL]`.
- Call `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })`.
- Reuse existing `toAuthError` / `account_deleted` handling and the post-sign-in
  `isAuthSessionAllowed()` check, mirroring `signInWithGoogle`.
- Treat user-cancel (`ERR_REQUEST_CANCELED`) as a silent no-op (no error toast).

**Name capture (first sign-in only)**
- Apple returns `fullName` only on the *first* authorization, in the native credential
  (not in the JWT). If present and the user's profile display name is empty, persist
  `givenName familyName` to the profile. Verify how profiles are created (DB trigger vs.
  client) during implementation and update display name client-side if needed.
- Handle Apple private-relay emails (`@privaterelay.appleid.com`) as valid.

**`screens/auth/LoginScreen.tsx`**
- Render the official `AppleAuthentication.AppleAuthenticationButton` (black, full-width)
  directly below the existing `LoginGoogleButton`, gated on `Platform.OS === 'ios'`.
- New `handleAppleSignIn` mirroring `handleSignIn`, reusing the same loading + deleted-account
  notice paths and Sentry `op` tag (`signInWithApple`).
- Android and web are unchanged (Google only).

**i18n + tests**
- Add `auth.signInWithApple` strings (en/he).
- Unit tests for `signInWithApple` (success, cancel, account_deleted) following the existing
  auth-service test pattern; mock `expo-apple-authentication`.

### B. Supabase + Apple Developer configuration

**Supabase** (prod project `jfqxjjjbpxbwwvoygahu`; also dev `drxfbicunusmipdgbgdk` for local testing)
- Enable the **Apple** auth provider.
- Add bundle ID `com.kupay.mobile` to **Authorized Client IDs**. Native token validation does
  **not** require the Services ID / secret key (those are only for the web OAuth flow).
- Can be done via the Supabase MCP or the dashboard (user's choice).

**Apple Developer**
- Enable the **Sign in with Apple** capability on App ID `com.kupay.mobile`. EAS managed
  credentials typically register this automatically during the first build; confirm in the
  Developer portal.

### C. iOS credentials → build → TestFlight

1. **First build (interactive, user-run):** `eas build -p ios --profile production` in a real
   terminal. Triggers Apple login (`sarussilberg@gmail.com`) + 2FA; EAS generates the
   Distribution Certificate + Provisioning Profile (incl. Sign in with Apple + associated
   domains). Credentials then persist for future non-interactive builds.
2. **Submit to TestFlight:** add `submit.production.ios.ascAppId` (numeric App Store Connect
   app ID) to `eas.json`, then `eas submit -p ios`.
3. **Validate on device:** install via TestFlight; verify both Google **and** Apple sign-in,
   plus first-time name capture.

### D. Universal Links / Team ID (same round, non-blocking)

After the build reveals the Apple **Team ID**, set `KUPAY_IOS_TEAM_ID` on prod and redeploy
the `invite-landing` Edge Function so the AASA file serves a valid `appID`, enabling
`applinks:kupa.pro` deep links on iOS.

### E. Documentation (SSOT)

Write `docs/APP_STORE_IOS.md` (mirroring `docs/PLAY_STORE_ANDROID.md`) documenting the iOS
credentials, Sign in with Apple setup, build, and TestFlight/submit flow. Per project
convention, reconcile changes against SSOT docs.

## Division of labor

**Claude:** all code in §A; `eas.json` `ascAppId`; Supabase provider via MCP (if approved);
`KUPAY_IOS_TEAM_ID` + Edge Function redeploy; `docs/APP_STORE_IOS.md`.

**User (interactive / account-bound):** run the first interactive `eas build` (2FA); confirm
the Sign in with Apple capability in Apple Developer if EAS prompts; install from TestFlight
and test on device.

## Risks / verification

- **Semantic merge risk:** the `origin/dev` merge deleted `lib/groupFeedCache.ts`; verified no
  dangling references remain. Run `jest` + TypeScript typecheck before handing off the build.
- **4.8 compliance:** the Apple button must be clearly visible and functional on iOS; reviewers
  check for it specifically.
- **Profile/display-name** behavior for Apple users must be verified on first sign-in (name only
  arrives once).
- Verification gates: `npm test` (jest) green, typecheck clean, and a successful interactive
  EAS iOS build reaching TestFlight with both sign-in methods working on device.

## Out of scope (Phase 2)

Screenshots, description, keywords, promotional text, App Privacy questionnaire, and "submit
for review" in App Store Connect.
