# Google Play — Android release runbook (Kupay)

Operational guide for shipping `com.kupay.mobile` to Google Play **Internal testing**, then closed/open testing, and eventually production. Covers the EAS pipeline, Supabase secrets, Data safety form answers, and on-device smoke tests.

> Production Supabase project: `jfqxjjjbpxbwwvoygahu` (kupa.pro).
> Mobile root: `cost-share-app/apps/mobile`.
> See also `cost-share-app/docs/SSOT/SUPABASE_ENVIRONMENTS.md`.

---

## 0. Pre-flight — blockers that will get the app rejected if skipped

Three things MUST be true before you upload the first `.aab`. If any is missing, Google rejects (or you fail your own Data Safety declaration).

### 0.1 `legal_documents` published in production

The privacy/terms URL works ONLY if rows exist in production Supabase (`jfqxjjjbpxbwwvoygahu`) with `is_published = true`.

```bash
# From repo root, against PRODUCTION project:
psql "$PRODUCTION_DB_URL" -f cost-share-app/supabase/seed-legal-documents.sql
psql "$PRODUCTION_DB_URL" -f cost-share-app/supabase/migrations/20260602120000_rebrand_legal_kupay.sql
```
Or run the SQL through Supabase Studio (SQL Editor) for the production project. Sanity check:
```sql
SELECT slug, locale, version, is_published, effective_date
FROM legal_documents
WHERE is_published = true;
-- expect 4 rows: (privacy,he) (privacy,en) (terms,he) (terms,en)
```
Then replace the `[Partnership Name]` placeholder in each row (Supabase Studio inline edit) with either your registered business entity or your personal name. **Google requires the policy to identify who operates the service.**

### 0.2 Android permissions — sensitive ones must be blocked

`app.json` now declares only the permissions Kupay actually uses (camera + image gallery + vibrate). `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, and the legacy `READ/WRITE_EXTERNAL_STORAGE` are explicitly **blocked**.

This change takes effect on the next `eas build` (EAS runs `expo prebuild` from scratch — the local `/android` folder is gitignored and irrelevant). Verify after the build:
- Download the `.aab` from EAS.
- `unzip -p <build>.aab base/manifest/AndroidManifest.xml | aapt2 dump xmltree --file -` (or just open in Android Studio APK Analyzer).
- Confirm there is **no** `RECORD_AUDIO` and **no** `SYSTEM_ALERT_WINDOW`.

If either appears, fail fast — do NOT submit until they are gone. Otherwise the Data Safety declaration in §6 (which truthfully says we do not record audio) contradicts the manifest and triggers a rejection.

### 0.3 In-app account deletion verified working

Internal Testing requires the same account-deletion flow as production. Already implemented in `screens/profile/SettingsScreen.tsx` via `services/account.service.ts → deleteMyAccount()` → RPC `delete_my_account`. Smoke-test on a real device (§8 step 7) before declaring the form complete.

---

## 1. Prerequisites (one-time)

| # | Item | Where |
|---|------|-------|
| 1 | Google Play Console developer account ($25 once) | https://play.google.com/console |
| 2 | App `com.kupay.mobile` created in Play Console (Internal testing track) | Play Console |
| 3 | Google Cloud project for OAuth Android client | https://console.cloud.google.com |
| 4 | Expo account with access to project `ecf771fd-38ce-480e-afc6-b443606f6cef` | https://expo.dev |
| 5 | Service account JSON for `eas submit` (Play Console → API access → Service accounts) | downloaded as `google-play-service-account.json` next to `eas.json` |

`google-play-service-account.json` is referenced by `eas.json` (`submit.production.android.serviceAccountKeyPath`). Keep it **out of git** (`.gitignore` already covers `*.json` keys; verify before first push).

---

## 2. Environment & secrets

### 2.1 Local `.env.production`

```bash
cd cost-share-app/apps/mobile
cp .env.production.example .env.production
# fill in EXPO_PUBLIC_SUPABASE_ANON_KEY from Supabase dashboard (production publishable key)
```

### 2.2 Sync to EAS

```bash
cd cost-share-app/apps/mobile
bash scripts/eas-sync-secrets.sh .env.production
```

### 2.3 Supabase production secrets

Required in `https://supabase.com/dashboard/project/jfqxjjjbpxbwwvoygahu/settings/functions` → **Edge Function Secrets**:

| Secret | Source | Used by |
|--------|--------|---------|
| `KUPA_ANDROID_RELEASE_SHA256` | Play Console → Setup → App signing → **App signing key** SHA-256 (uppercase hex with colons) | `invite-landing/.well-known/assetlinks.json` |
| `KUPA_ANDROID_DEBUG_SHA256` (optional) | EAS credentials → Android keystore SHA-256 (only if you want the in-house dev APK to verify App Links too) | same |
| `KUPA_IOS_TEAM_ID` | Apple Developer → Membership → Team ID | `invite-landing/.well-known/apple-app-site-association` |
| `KUPA_SUPPORT_EMAIL` (optional) | defaults to `sarussilberg@gmail.com` | `legal.ts` and `account-deletion` page |

After updating secrets, redeploy:
```bash
npx supabase functions deploy invite-landing --project-ref jfqxjjjbpxbwwvoygahu
```

---

## 3. Build & submit

### 3.1 First build (AAB)

```bash
cd cost-share-app/apps/mobile
npm run eas:build:android   # → eas build --platform android --profile production
```

EAS will:
- Generate / reuse the Android keystore on EAS servers.
- Upload an `.aab`.
- Auto-increment `versionCode` (configured via `appVersionSource: remote`).

Copy the `SHA-256` of the **EAS upload key** (printed at build start) — only relevant if you skip Play App Signing. If you are using Play App Signing (default and recommended), the only SHA-256 that matters for App Links is the **App signing key** SHA-256 from Play Console after the first upload.

### 3.2 Upload to Internal testing

Two options:

**Manual (first time, recommended):**
1. Download the `.aab` from the EAS build page.
2. Play Console → **Testing → Internal testing → Create new release** → upload the `.aab`.
3. Fill release notes, save, review, **Start rollout**.

**Automated (subsequent releases):**
```bash
cd cost-share-app/apps/mobile
npm run eas:submit:android   # uploads latest production build to track: internal
```
Requires `google-play-service-account.json` in place.

### 3.3 After first upload — wire SHA-256 to OAuth + App Links

1. Play Console → **Setup → App signing** → copy **SHA-1** and **SHA-256** of the *App signing key*.
2. Google Cloud Console → **APIs & Services → Credentials** → OAuth 2.0 Android client → add package `com.kupay.mobile` + the **SHA-1**.
3. Supabase Dashboard → **Authentication → Providers → Google** → Android section → add the same **SHA-1** (and Web Client ID if not already set).
4. Supabase Dashboard → **Edge Function Secrets** → set `KUPA_ANDROID_RELEASE_SHA256` to the **SHA-256** (uppercase, colon-separated). Then redeploy `invite-landing`.

---

## 4. Vercel deploy (required before submitting Privacy URL)

After merging the proxy `vercel.json` to `main`:
```bash
# Vercel auto-deploys on push to main; verify:
curl -sSI https://kupa.pro/.well-known/assetlinks.json | head -5
curl -sSI https://kupa.pro/legal/privacy | head -5
curl -sSI https://kupa.pro/account-deletion | head -5
```
All three must return `200` with `content-type: application/json` (assetlinks) or `text/html` (legal/deletion). **They must not return the SPA `/index.html`.**

Full body check:
```bash
curl -sS https://kupa.pro/.well-known/assetlinks.json | jq
curl -sS https://kupa.pro/legal/privacy | head -40
```

---

## 5. Play Console forms — required for Internal testing

| Section | What goes there |
|---------|-----------------|
| **App content → Privacy policy** | `https://kupa.pro/legal/privacy` |
| **App content → App access** | Choose "All functionality is available without special access" if testers can sign in with their own Google. Otherwise add a test Google account. |
| **App content → Ads** | No |
| **App content → Content rating** | Run the IARC questionnaire — Kupay is a productivity/utility app with no user-generated public content; rating typically ends up "Everyone". |
| **App content → Target audience** | 18+ (financial tool). |
| **App content → News app** | No. |
| **App content → Government app** | No. |
| **App content → Data safety** | See §6 below. |
| **Store listing → App name** | Kupay |
| **Store listing → Short description (≤80)** | (Hebrew) חלקו הוצאות עם חברים, שותפים ובני זוג — בלי לעשות חשבון. |
| **Store listing → Full description** | Draft — see §7. |
| **Store listing → Graphics** | Icon 512×512 PNG (no alpha, no rounded corners — Play adds them), Feature graphic 1024×500, at least 2 phone screenshots (1080×1920+). |
| **Internal testing → Testers** | Add Gmail addresses; share the opt-in URL with them. |

---

## 6. Data safety — draft answers

> Source of truth: code paths in `cost-share-app/apps/mobile` + Supabase tables. Re-verify before each major change.

**Data collection**: YES — collected by us (Kupay).

| Data type | Collected | Shared with 3rd parties | Optional | Purpose | Why |
|-----------|-----------|-------------------------|----------|---------|-----|
| **Name** | Yes | No | No (required for account) | App functionality, Account management | Sign-in & display name in groups |
| **Email address** | Yes | No | No | App functionality, Account management | Primary account identifier |
| **User IDs** | Yes | No | No | App functionality, Analytics (none today) | Supabase `auth.users.id` |
| **Photos** | Yes (optional avatar / group image) | No | Yes | App functionality | User-uploaded avatars |
| **App interactions** | Yes (expenses, groups, settlements user creates) | No | No | App functionality | Core product data |
| **Crash logs** | No (no Sentry / Crashlytics today) | — | — | — | — |
| **Diagnostics** | No | — | — | — | — |

**Security practices**:
- Data is encrypted in transit (HTTPS to Supabase) → **Yes**.
- Users can request data deletion → **Yes** (in-app, see `/account-deletion`).
- Data is encrypted at rest? → **Yes** (Supabase default).
- Follows Families Policy? → **No** (18+ target audience).
- Independent security review? → **No**.
- Committed to Play Families Policy? → **No**.

If you add Sentry, PostHog, or any analytics SDK later, this section MUST be updated **before** rolling out a build that contains it.

---

## 7. Store listing — full description draft (Hebrew)

```
Kupay — חלקו הוצאות בלי כאב ראש.

Kupay היא אפליקציה לחלוקת הוצאות לקבוצות: שותפים לדירה, חברים בטיול, זוגות, וקבוצות חברים. רשמו הוצאות, ראו מי חייב למי כמה, וסגרו חשבונות בקלות.

תכונות עיקריות:
• יצירת קבוצה והוספת חברים בקליק
• רישום הוצאה עם חלוקה שווה / לפי חלקים / לפי מטבע
• מסך יתרות שמראה תמיד כמה אתם חייבים או מקבלים
• זרימת "סגירת חשבון" שמציעה את ההעברות המינימליות
• תמיכה במספר מטבעות לכל קבוצה
• ממשק עברית מלא (RTL), כולל תאריכים בעברית

פרטיות:
• כניסה מאובטחת דרך Google
• אפשרות למחיקה מלאה של החשבון מתוך האפליקציה
• אנו לא מוכרים נתונים לצדדים שלישיים

תמיכה: sarussilberg@gmail.com
מדיניות פרטיות: https://kupa.pro/legal/privacy
```

(Short description, ≤80 chars: `חלקו הוצאות עם חברים, שותפים ובני זוג — בלי לעשות חשבון.`)

---

## 8. On-device smoke test (after Internal testing install)

Run on a real Android device after accepting the tester invite + installing from the Play link:

1. **Cold start** — app opens to login without crash.
2. **Google sign-in** — `המשך עם Google` → Google account picker → returns to app authenticated.
3. **Create group** — name + currency, add at least one member by name.
4. **Add expense** — equal split, verify it appears on Recent.
5. **Balances screen** — opens, shows correct amounts.
6. **Settle up** — select target, confirm, balances zero out.
7. **Settings → Privacy & Account → Delete account** — confirm dialog, sign-out follows, login screen returns.
8. **Hebrew RTL** — verify alignment, numerals, dates render correctly on a Hebrew-locale device.
9. **App Link** — paste `https://kupa.pro/i/<test-token>` into another app (e.g. WhatsApp), tap → opens Kupay directly (not browser). Requires Play App Signing SHA-256 to be wired in §3.3.
10. **Background → foreground** — leave app for 5 min, return — session persists.

If step 9 falls back to the browser, App Links verification has not propagated yet — re-check `KUPA_ANDROID_RELEASE_SHA256` matches Play App Signing **App signing key** SHA-256 (uppercase, colon-separated), then:
```bash
adb shell pm get-app-links com.kupay.mobile
# look for: kupa.pro: verified
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `curl https://kupa.pro/.well-known/assetlinks.json` returns the SPA HTML | Vercel rewrites not deployed, or order wrong (SPA catch-all is before specific rewrite) | Confirm `vercel.json` change is in `main`, redeploy. Specific routes MUST appear above the catch-all. |
| `assetlinks.json` returns `[]` empty target | `KUPA_ANDROID_RELEASE_SHA256` env var not set on production Supabase | Set secret, redeploy edge function. |
| Google sign-in shows "Developer error" | SHA-1 mismatch in Google Cloud OAuth Android client | Re-copy SHA-1 from Play App Signing (not upload key) into the OAuth client. |
| `eas submit` fails with "service account does not have permission" | Service account not invited to Play Console as admin/release manager | Play Console → Users and permissions → invite the SA email with Release manager role. |
| App Link opens browser instead of app | `autoVerify` blocked because `assetlinks.json` does not match the package signature | See step 9 of smoke test. |
| Build fails — `EXPO_PUBLIC_SUPABASE_URL` is empty | Production env was not synced | Re-run `bash scripts/eas-sync-secrets.sh .env.production`. |

---

## 10. After Internal testing — promoting to production

Not required for the first round. When ready:
1. Promote the same `.aab` from Internal → Closed → Open → Production tracks (no rebuild needed).
2. Run a lawyer pass on `legal_documents` (Supabase Studio → `legal_documents`) — set `effective_date`, `version`, mark `is_published = true`.
3. Replace the `[Partnership Name]` placeholder in seeded legal docs (production project) before public rollout.
4. Add a real `EXPO_PUBLIC_APP_STORE_URL` once iOS is live so the invite landing page shows it.
