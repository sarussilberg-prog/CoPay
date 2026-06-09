# App Store — iOS release runbook (CoPay / Kupay)

Operational guide for shipping `com.kupay.mobile` (display name **CoPay**) to **TestFlight**, then App Store review. Covers Sign in with Apple, the EAS iOS pipeline, credentials, Universal Links, and on-device smoke tests.

> Production Supabase project: `jfqxjjjbpxbwwvoygahu` (kupa.pro). Dev: `drxfbicunusmipdgbgdk`.
> Mobile root: `cost-share-app/apps/mobile`.
> EAS project: `@saussilberg/kupay` (`eb2614a0-ce69-402b-9cbb-668108a9ef27`), owner `saussilberg`.
> Apple ID for builds/submit: `sarussilberg@gmail.com`.
> See also `docs/PLAY_STORE_ANDROID.md` and `cost-share-app/docs/SSOT/SUPABASE_ENVIRONMENTS.md`.

---

## 0. Pre-flight — blockers that get the app rejected if skipped

### 0.1 Sign in with Apple (App Store Guideline 4.8) — MANDATORY

The app offers Google sign-in. Apple **requires** a privacy-preserving login alternative whenever a third-party social login is offered. We satisfy this with **native Sign in with Apple**.

Implemented in:
- `services/auth.service.ts → signInWithApple()` (native `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', ... })`).
- `components/auth/LoginAppleButton.tsx` (official Apple button, iOS-only) wired into `screens/auth/LoginScreen.tsx`.
- `app.json`: `ios.usesAppleSignIn: true` + `expo-apple-authentication` plugin.

It will only actually authenticate once §1.3 (Supabase provider) and §1.4 (Apple capability) are done. **Verify Apple sign-in on a real device (TestFlight) before submitting for review** — reviewers test it specifically.

### 0.2 `legal_documents` published in production

Same requirement as Android — privacy/terms URLs resolve only if published rows exist in production Supabase. See `docs/PLAY_STORE_ANDROID.md` §0.1. Apple's App Privacy section + the privacy URL both depend on this.

### 0.3 In-app account deletion

Apple (Guideline 5.1.1(v)) requires in-app account deletion for apps with account creation. Already implemented (`SettingsScreen` → `account.service.ts → deleteMyAccount()`). Smoke-test in §7.

---

## 1. Prerequisites & one-time setup

| # | Item | Where |
|---|------|-------|
| 1 | Apple Developer Program membership ($99/yr, active) | https://developer.apple.com |
| 2 | App `com.kupay.mobile` created in App Store Connect ("CoPay") | https://appstoreconnect.apple.com |
| 3 | Expo account with access to `@saussilberg/kupay` | https://expo.dev |
| 4 | EAS CLI logged in as `saussilberg` (`eas whoami`) | local terminal |

### 1.1 app.json (already committed)

```jsonc
"ios": {
  "bundleIdentifier": "com.kupay.mobile",
  "usesAppleSignIn": true,            // adds the Sign in with Apple entitlement
  "associatedDomains": ["applinks:kupa.pro"]
},
"plugins": [ ..., "expo-apple-authentication" ]
```

### 1.2 Dependency (already committed)

`expo-apple-authentication` (`~8.0.8`, SDK-54-matched). Added via `npx expo install expo-apple-authentication`.

### 1.3 Supabase — enable the Apple provider

Dashboard → **Authentication → Providers → Apple** (do this on **prod** `jfqxjjjbpxbwwvoygahu`, and on dev `drxfbicunusmipdgbgdk` for local testing):

- Toggle the provider **ON**.
- **Authorized Client IDs**: add `com.kupay.mobile`.
- Native iOS sign-in validates the identity token against the bundle ID — **no Services ID / Secret Key is required** (those are only for the web OAuth flow, which we do not use on iOS).

### 1.4 Apple Developer — Sign in with Apple capability

The capability must be enabled on App ID `com.kupay.mobile`. With EAS **managed credentials** this is registered automatically during the first build (§2). If the build does not enable it, do it manually: Apple Developer → **Certificates, Identifiers & Profiles → Identifiers → com.kupay.mobile → Sign In with Apple → Enable**, then re-run the build so EAS regenerates the provisioning profile.

---

## 2. iOS credentials + build (first time is interactive)

iOS signing credentials have **never** been generated on the `@saussilberg/kupay` account. The first build MUST run **interactively in a real terminal** — EAS performs an Apple Developer login + 2FA and then auto-generates the Distribution Certificate + Provisioning Profile (including Sign in with Apple + associated domains). An agent cannot complete the 2FA from a non-interactive shell.

```bash
cd cost-share-app/apps/mobile
eas whoami                     # must print: saussilberg
eas build -p ios --profile production
# Complete Apple login (sarussilberg@gmail.com) + 2FA when prompted.
```

After the first interactive build, credentials persist on EAS and later builds can run non-interactively.

> Env: production `EXPO_PUBLIC_*` vars are injected from the EAS "production" environment (synced via `bash scripts/eas-sync-secrets.sh .env.production`). The build log line "No environment variables with visibility Plain text/Sensitive found" is expected — the secret-visibility vars are still injected.

---

## 3. Submit to TestFlight

```bash
cd cost-share-app/apps/mobile
eas submit -p ios --profile production --latest
```

- `eas submit` auto-detects the App Store Connect app by bundle identifier. To avoid the interactive prompt you can pin the numeric app ID in `eas.json` under `submit.production.ios.ascAppId` — find it at **App Store Connect → your app → App Information → "Apple ID"** (a ~10-digit number).
- `eas.json` already has `submit.production.ios.appleId = sarussilberg@gmail.com`.
- After upload, TestFlight processes the build (a few minutes to ~an hour). Add yourself as an internal tester and install via the TestFlight app.

---

## 4. Universal Links (AASA) — Apple Team ID

`app.json` declares `applinks:kupa.pro`, but deep links resolve only once the AASA file served by the `invite-landing` Edge Function contains the Team ID.

1. After the first build, read the **Team ID**: Apple Developer → **Membership**, or `eas credentials -p ios` (printed with the provisioning profile).
2. Supabase Dashboard (`jfqxjjjbpxbwwvoygahu`) → **Edge Function Secrets** → set `KUPAY_IOS_TEAM_ID`.
3. Redeploy:
   ```bash
   npx supabase functions deploy invite-landing --project-ref jfqxjjjbpxbwwvoygahu
   ```
4. Verify:
   ```bash
   curl -sS https://kupa.pro/.well-known/apple-app-site-association | jq
   # expect appID "<TEAM_ID>.com.kupay.mobile" under applinks
   ```

---

## 5. App Store Connect listing — Phase 2 (before "Submit for Review")

Not required for TestFlight. Needed before submitting for review:

| Section | What goes there |
|---------|-----------------|
| **App Privacy** | Mirror the Android Data Safety answers (`docs/PLAY_STORE_ANDROID.md` §6): Name, Email, User ID, Photos (optional), App interactions — all "used for app functionality", not shared, not used for tracking. No crash/diagnostics today. |
| **Privacy Policy URL** | `https://kupa.pro/legal/privacy` |
| **Previews and Screenshots** | iPhone 6.5" (1290×2796 or 1242×2688) — at least 1, up to 10. (6.7"/6.9" set recommended.) |
| **Promotional Text / Description / Keywords** | Reuse the Hebrew copy from `docs/PLAY_STORE_ANDROID.md` §7, adapted for App Store. |
| **Support URL** | a reachable URL (e.g. `https://kupa.pro`) |
| **Sign-In Information** | Provide a demo account OR note that review can sign in with their own Apple ID / Google. Apple reviewers WILL use Sign in with Apple. |
| **Age Rating** | Complete the questionnaire (financial/utility, no objectionable content). |

---

## 6. Build & submit — script reference

From `cost-share-app/apps/mobile`:

```bash
eas build  -p ios --profile production      # interactive first time (2FA)
eas submit -p ios --profile production --latest
```

From the repo root, equivalents exist: `npm run mobile:eas:build:ios`, `npm run mobile:eas:submit:ios`.

---

## 7. On-device smoke test (TestFlight install)

1. **Cold start** — opens to login without crash.
2. **Apple sign-in** — tap the Apple button → system sheet → Face/Touch ID → returns authenticated. On the FIRST sign-in, confirm the display name is captured (not the email/relay address).
3. **Google sign-in** — sign out, then `המשך עם Google` → returns authenticated.
4. **Create group / add expense / balances / settle up** — core flow works.
5. **Hebrew RTL** — alignment, numerals, dates correct on a Hebrew-locale device.
6. **Account deletion** — Settings → delete account → sign-out → login screen returns.
7. **Universal Link** (after §4) — open `https://kupa.pro/i/<token>` from another app → opens CoPay, not Safari.
8. **Background → foreground** — session persists after ~5 min.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `eas build -p ios` fails: "Distribution Certificate is not validated / Credentials are not set up" | First iOS build run non-interactively | Re-run interactively in a real terminal so EAS can do Apple login + 2FA. |
| Apple sign-in errors "invalid_client" / "Unacceptable audience" | Supabase Apple provider not enabled, or bundle ID missing from **Authorized Client IDs** | §1.3 — enable provider, add `com.kupay.mobile`. |
| Apple button not visible | Running on Android/web (button is iOS-only by design), or build predates the `usesAppleSignIn` entitlement | Verify on an iOS build that includes the entitlement. |
| Apple user shows email/relay as their name | First-run name capture failed or was a re-auth (Apple returns the name only once) | Remove the app from the Apple ID (Settings → Sign in with Apple) to re-trigger the first-run name, or have the user set their name in-app. |
| Universal Link opens Safari | `KUPAY_IOS_TEAM_ID` unset or AASA stale | §4 — set the secret, redeploy `invite-landing`, reinstall the app. |
| `eas submit` can't find the app | bundle ID mismatch or app not yet created in App Store Connect | Confirm the ASC app exists for `com.kupay.mobile`; optionally pin `ascAppId` in `eas.json`. |

---

## 9. Status checklist

- [x] `expo-apple-authentication` + `usesAppleSignIn` entitlement (app.json)
- [x] `signInWithApple()` + iOS Apple button (code, unit-tested)
- [ ] Supabase Apple provider enabled (prod + dev) — §1.3
- [ ] First interactive iOS build (credentials generated) — §2
- [ ] TestFlight upload + on-device validation — §3, §7
- [ ] `KUPAY_IOS_TEAM_ID` set + `invite-landing` redeployed — §4
- [ ] Phase 2: App Privacy, screenshots, description, Submit for Review — §5
