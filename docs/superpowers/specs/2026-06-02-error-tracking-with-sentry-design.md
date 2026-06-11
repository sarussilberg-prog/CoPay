# Error tracking with Sentry — design

**Branch:** `feature/sentry-error-tracking` (off `dev`)
**Date:** 2026-06-02
**Status:** Awaiting user approval

## Problem

Errors that occur on real users' devices are invisible to the team. There is no crash reporter, no JS-error capture, no slow-request capture, and no remote breadcrumb trail. Diagnosis today depends on a user reporting the bug and the developer reproducing it on their own phone — which fails for environment-specific issues (specific OS version, locale, device model, network conditions).

The app already has Supabase, an admin portal scaffold (`AdminPortalScreen`, `AdminDeletedUsersScreen`, recent `is_app_admin()` RPC), and per-environment Supabase wiring driven by `.env` (dev project `drxfbicunusmipdgbgdk`, prod project `jfqxjjjbpxbwwvoygahu`). There is no existing error-tracking dependency to replace.

## Goal

Capture three classes of events from production user devices and surface them to admins:

1. **App crashes** — uncaught JS errors, unhandled promise rejections, React render errors, and native iOS/Android crashes.
2. **Caught exceptions with context** — errors swallowed by service-layer `try/catch` blocks (toasts shown, error otherwise hidden).
3. **Performance traces of API requests** — a sampled subset of HTTP requests captured with full timing, so the "slow request" view in Sentry can surface requests ≥ 2 s (and the 5xx / network-failure surface). HTTP failures and network errors that throw also flow through path 1 as exceptions.

Each captured event carries: user id + email + display name, app version + build, platform, OS version, device model, locale, timezone, network type, current screen, route params (sanitized), and the SDK's default breadcrumb buffer (last ~100 actions: navigation, fetch, console, touches, AsyncStorage).

Admins can review these events in two places:

- **Sentry dashboard** at sentry.io — full-featured, used by the developer for deep investigations.
- **In-app admin screen** — a new `AdminErrorsScreen` in the mobile app, accessible to anyone for whom `is_app_admin()` returns true, showing the same issues with drill-down to events. Backed by a Supabase Edge Function that proxies the Sentry REST API.

Non-goals:

- Session replay, profiling, CPU traces, or video recording of crashes — deferred.
- Real-time push alerts (Slack, push notifications) — deferred; Sentry's default email-on-new-issue rule is left on.
- A custom Supabase `app_errors` table — Sentry stores events; we do not mirror them locally.
- Native crash *symbolication beyond what EAS source maps provide* — Sentry's iOS/Android SDKs handle native crashes for managed/EAS builds out of the box.

## Architecture & components

Three layers; everything new lives behind feature-flag-style env vars (`EXPO_PUBLIC_SENTRY_DSN`), so an empty DSN cleanly disables the system.

### 1. Mobile SDK (Sentry React Native via Expo plugin)

- **Package:** `@sentry/react-native` (installed via `npx expo install`).
- **Expo config plugin** entry in `cost-share-app/apps/mobile/app.json`. Wires native SDKs, source-map upload at EAS-build time, and automatic release tagging.
- **Init** in `cost-share-app/apps/mobile/App.tsx`, before the root tree is rendered:
  - `dsn` from `process.env.EXPO_PUBLIC_SENTRY_DSN`
  - `environment` from `process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT` (`development` / `production`)
  - `enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN` — soft off when DSN missing
  - `sendDefaultPii: false` — we attach what we want, nothing else
  - `sampleRate: 1.0` — all errors
  - `tracesSampleRate: 0.2` — 20% of transactions sampled for performance tracing. Chosen to stay safely inside Sentry's free-tier performance quota (10k events/month) for a small user base; raise toward 1.0 if quota allows, lower if it doesn't. The 2-second "slow" threshold is applied as a dashboard view/filter, not a runtime capture rule.
  - `attachStacktrace: true`
  - `integrations: [Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: false })]`
- **Root navigator wiring:** the `NavigationContainer` calls `navigationIntegration.registerNavigationContainer(navigationRef)` in `onReady`. This gives every event a `current_route` tag and emits a breadcrumb on each route change.
- **App wrap:** `export default Sentry.wrap(App);`

### 2. Identity and per-request enrichment

- **`auth.service.ts`:** on successful login/sign-up call `Sentry.setUser({ id, email, username })` after the profile loads. On sign-out call `Sentry.setUser(null)`. Two call sites.
- **Service-layer enrichment:** in a fixed set of `try/catch` blocks where the error is currently swallowed (toast shown, then re-thrown or returned), add `Sentry.captureException(err, { tags: { service, op }, extra: { … } })` before the toast. The list of catch blocks is enumerated in the implementation plan; targets are the service files: `expenses.service.ts`, `groups.service.ts`, `friends.service.ts`, `auth.service.ts`, `account.service.ts`, `messages.service.ts`. Unhandled errors elsewhere reach Sentry via the global handler — these explicit calls exist only to attach the tags/extra we want.

### 3. In-app admin dashboard (Edge Function + screen)

- **Edge Function** `cost-share-app/supabase/functions/admin-sentry-proxy/index.ts`:
  - Reads the caller JWT, calls `is_app_admin()` via Supabase client; rejects with 403 if false.
  - Reads `SENTRY_API_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_DEV`, `SENTRY_PROJECT_PROD` from `Deno.env`.
  - Validates an action discriminator from the request body and dispatches to one of three Sentry REST endpoints:
    - `list_issues` → `GET /api/0/projects/{org}/{project}/issues/?environment={env}&query={query}&limit={n}`
    - `issue_events` → `GET /api/0/issues/{issue_id}/events/?limit=20`
    - `issue_detail` → `GET /api/0/issues/{issue_id}/`
  - Strips fields the client does not need (raw event payload trimmed to ~5 KB) and returns JSON.
  - CORS: limited to the mobile app's expected origin (or wildcard since the mobile app does not send `Origin`; matches the pattern of the existing `invite-landing` function).
- **Admin screen** `cost-share-app/apps/mobile/screens/admin/AdminErrorsScreen.tsx`:
  - Top filter row: environment (dev / prod), status (unresolved / all), time range (24h / 7d / 30d).
  - List of issues sorted by `last_seen` desc. Each row: severity icon (from issue `level`), title, file:line if available, occurrence count, affected-users count, "last seen X ago".
  - Tap row → `AdminErrorDetailScreen.tsx` showing issue header (full message, type, first/last seen, app versions affected, status) + list of last 20 events.
  - Tap event → `AdminErrorEventScreen.tsx` showing stack trace, breadcrumbs, tags, user, device context.
  - Pull-to-refresh on each level. No realtime subscription — Sentry's API is pull-only.
- **Navigation wiring:** new row in `AdminPortalScreen.tsx` ("Errors" with bug icon) navigating to `AdminErrorsScreen`. Three new stack routes added in the admin navigator (mirrors the pattern from the recent `AdminDeletedUsersScreen` work).
- **i18n:** Strings added under `admin.errors.*` keys in `cost-share-app/apps/mobile/i18n/locales/en.json` and `he.json`.

## Data flow

### Production error captured on a user's device

1. JS throws / promise rejects / native crashes / fetch returns slow or 5xx.
2. Sentry SDK captures with full context (breadcrumbs, tags, user, device); posts to Sentry SaaS (US region by default; EU available if chosen at org-creation time).
3. Sentry SaaS groups by fingerprint, dedupes against the existing issue, increments counters, persists.
4. (Optional) Sentry sends default "new issue" email to the developer.

### Admin views errors in the app

1. Admin opens `AdminErrorsScreen` (only visible to users for whom `is_app_admin()` returned true on portal load).
2. Screen calls `supabase.functions.invoke('admin-sentry-proxy', { body: { action: 'list_issues', environment, query, limit } })`.
3. Edge Function: extracts JWT, re-verifies `is_app_admin()`, picks the right project slug from env based on `environment` param, calls Sentry API with `Authorization: Bearer ${SENTRY_API_TOKEN}`.
4. Trimmed response returned; UI renders the list.
5. Drill-downs call the same Edge Function with different action discriminators.

### Source-map upload (build time, not runtime)

1. `eas build` runs.
2. Sentry Expo config plugin detects `SENTRY_AUTH_TOKEN` in the EAS environment.
3. After bundling, source maps are uploaded to Sentry tagged with the EAS build's `release` identifier.
4. At runtime, the SDK reports its current release; Sentry resolves stack traces against the matching source maps automatically.

## Error handling

- **Missing DSN at startup:** `enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN`. App boots normally; no Sentry calls fire; nothing is sent. Local dev without DSN works.
- **Network unavailable when an error is captured:** Sentry's SDK persists pending events to `AsyncStorage`-equivalent native storage and retries on next launch. No code from us.
- **Sentry SaaS rate-limiting or outage:** the SDK drops events after exceeding its in-memory buffer; user-facing UX is unaffected because all calls are fire-and-forget.
- **Admin Edge Function errors (Sentry API down, bad token, 429):** the function returns a structured `{ error, status }` JSON; the admin screen shows a "Failed to load — pull to retry" empty state. No crash, no infinite spinner.
- **Admin caller is not actually admin:** the Edge Function re-verifies `is_app_admin()` on every call, so even if a non-admin somehow constructed the screen, calls return 403. The UI itself is also conditionally rendered behind the same RPC, so this is defense in depth.
- **Breadcrumb / extra payload PII risk:** route params are sanitized in the navigation integration's `beforeBreadcrumb` hook — UUIDs and tokens are stripped before they enter Sentry. URL query strings in fetch breadcrumbs are stripped to the path only.

## Testing

- **Mobile unit test** `cost-share-app/apps/mobile/__tests__/lib/sentry.test.ts`: mock `@sentry/react-native`; assert (a) `init` is called with `enabled: false` when no DSN env var is set, (b) `setUser` is called on successful login and with `null` on sign-out, (c) `captureException` is called with the correct `tags.service` and `tags.op` from one representative service-layer catch block (e.g., `expenses.service.ts` `createExpense`).
- **Edge Function test** `cost-share-app/supabase/functions/admin-sentry-proxy/index.test.ts` (Deno test, following the pattern of existing function tests): mock `fetch` to Sentry; assert (a) non-admin JWT returns 403, (b) admin JWT with valid `list_issues` action hits the correct Sentry URL with the right token, (c) malformed action returns 400, (d) Sentry 5xx is translated to a 502 with a structured error body.
- **Admin screen test** `cost-share-app/apps/mobile/__tests__/screens/admin/AdminErrorsScreen.test.tsx`: mock `supabase.functions.invoke`; assert (a) the screen renders the issue list from a stubbed response, (b) tapping a row navigates to detail with the correct issue id, (c) filter changes re-invoke with the right params, (d) failed invoke shows the empty/retry state.
- **Manual verification (smoke test on dev):** add a temporary "throw test error" button in dev only, install a TestFlight/internal build pointed at the dev Sentry project, throw, then verify (a) the error appears in the Sentry dev project within ~30 s, (b) the same error appears in `AdminErrorsScreen` after pull-to-refresh, (c) user identity is attached, (d) source map resolved the stack to TS lines. Remove the test button before merge to `main`.

## Deployment

1. **Sentry account prerequisites (one-time, by user):**
   - Org created at sentry.io. Org slug captured.
   - Two projects created (`copay-mobile-dev`, `copay-mobile-prod`) under platform "React Native". Project slugs + DSNs captured.
   - One auth token created with scopes `org:read`, `project:read`, `project:write`, `project:admin`, `project:releases`, `event:read`, `event:write`. Token captured.

2. **Local config (committed):**
   - `.env.example` and `.env.production.example` gain `EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_SENTRY_ENVIRONMENT`.
   - `.gitignore` adds `.sentryclirc`.
   - `app.json` adds the `@sentry/react-native/expo` plugin entry.

3. **Local config (NOT committed):**
   - `.env` (dev DSN + `EXPO_PUBLIC_SENTRY_ENVIRONMENT=development`)
   - `.env.production` (prod DSN + `EXPO_PUBLIC_SENTRY_ENVIRONMENT=production`)

4. **EAS secret (run once by user):**

   ```bash
   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
   ```

   Source maps then upload automatically on every `eas build`.

5. **Supabase Edge Function secrets (run once by user):**

   ```bash
   supabase secrets set \
     SENTRY_API_TOKEN=<token> \
     SENTRY_ORG=<org-slug> \
     SENTRY_PROJECT_DEV=copay-mobile-dev \
     SENTRY_PROJECT_PROD=copay-mobile-prod
   ```

6. **Branch and PRs:**
   - Implementation happens on `feature/sentry-error-tracking` off `dev`.
   - PR targets `dev`. On merge, dev runtime picks up the new code + dev DSN; smoke-test in dev Sentry project.
   - Merge `dev` → `main` to promote. Prod EAS build uploads source maps via the existing EAS secret. Prod Edge Function picks up the same `SENTRY_API_TOKEN` (Supabase secrets are per-project, so prod uses its own copy — same value is fine; user can rotate independently later if desired).

7. **Privacy policy update (out of band, not blocking the merge):** add a line noting Sentry as a sub-processor for crash and performance data.

## Out of scope

- **Self-hosted error storage** (Supabase `app_errors` table, custom admin DB schema). Considered and rejected during brainstorming; Sentry's free tier covers the expected event volume.
- **Session Replay, Profiling, CPU traces.** Available as Sentry add-ons; deferred until there's a concrete need.
- **Real-time push or Slack alerts.** Sentry's default "new issue" email is left on; richer alerting is a v2 decision.
- **Source-map upload for dev (non-EAS) builds.** Local dev builds throw to the JS console and show in Metro; no need to symbolicate via Sentry.
- **Replacing existing toast UX.** Service-layer catch blocks keep their current user-facing behavior; `Sentry.captureException` is added alongside, not in place of, the toast.
- **Breadcrumbs from Zustand or React Query state changes.** Could be added later via custom integrations if useful for debugging; not in v1.
