# Known Issues & Technical Gaps

**Status:** Living backlog (pre-launch and ongoing).  
**Language:** English only.

Track **bugs**, **regressions**, and **gaps** that should be fixed (or explicitly accepted before release).

This is **not** the same as:

| File | Owns |
|------|------|
| [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) | Intentional **deferrals** (What / Why / Revisit-when) |
| [CODE QUALITY.md](./CODE%20QUALITY.md) §6 | Small **architecture refactors** (`[PENDING REFACTOR]`) |
| GitHub Issues / PRs | Execution, discussion, assignees |

When a spec defers a feature by choice, log it in **TECHNICAL_DEBT.md**. When something is broken or missing and should be fixed, log it here.

---

## How to use

1. **Add** a row under the right priority table (or create a subsection).
2. **Link** spec, PR, or file path when known.
3. **Update status** when work starts or ships; move done items to [Resolved](#resolved) with date + PR.
4. **Do not** duplicate TECHNICAL_DEBT deferrals here unless there is an active bug (e.g. deferred feature shipped broken).

### Fields (per item)

| Field | Values |
|-------|--------|
| **ID** | `KI-###` (increment) |
| **Priority** | P0 (launch blocker) · P1 (soon) · P2 (polish) |
| **Status** | `open` · `in_progress` · `accepted` · `resolved` |
| **Area** | `mobile` · `web` · `supabase` · `i18n` · `ci` · `infra` |
| **SRS** | `REQ-*` if product-related |

---

## P0 — Launch blockers

| ID | Status | Area | Issue | Notes / fix direction |
|----|--------|------|-------|------------------------|
| KI-001 | resolved | mobile | **Invite redemption blocked during post-login onboarding** | Fixed 2026-06-02: `useAuthenticatedInviteRedemption` in gate + `pendingNavigation` flushed in `AppNavigator`. |
| KI-002 | resolved | mobile | **`fetchGroups` failure skips post-login onboarding** | Fixed 2026-06-02: fetch errors route to `create` gate (`lib/authenticatedGateResolve.ts`). |

---

## P1 — Fix soon (post-launch acceptable only if tested)

| ID | Status | Area | Issue | Notes / fix direction |
|----|--------|------|-------|------------------------|
| KI-010 | open | mobile | **No automated tests for onboarding gate** | Coverage exists for `onboardingStorage`, `platformAlert`, `platformShare`; missing tests for `AuthenticatedAppGate`, `OnboardingPreAuthFlow`, `OnboardingCreateGroupScreen`, skip/create/error paths. |
| KI-011 | open | web | **Toast renders outside phone frame when authenticated** | In `App.tsx`, logged-in path places `Toast` outside `WebFrame`; logged-out path keeps it inside. Success/error toasts may span full browser width. |
| KI-012 | open | web | **`WebAlertHost` backdrop dismiss ignores Cancel** | Tapping outside modal calls `dismiss()` without `cancel` button `onPress`. Affects 3+ button alerts (e.g. receipt picker in `AddExpenseScreen`). File: `components/WebAlertHost.tsx`. |
| KI-013 | open | i18n | **Plural keys missing in `en.json`** | 16 `_many` / `_two` keys present in `he.json` but not `en` — risk of raw keys or wrong pluralization in English. |
| KI-014 | open | ci | **Jest worker does not exit cleanly** | `worker process has failed to exit gracefully` after full mobile test run; investigate open handles / `act` warnings (e.g. `LoginScreen` language change). |

---

## P2 — Polish / tech hygiene

| ID | Status | Area | Issue | Notes / fix direction |
|----|--------|------|-------|------------------------|
| KI-020 | open | i18n | **`settleUp.swap` only in `en.json`** | Key unused in code today; add to `he.json` or remove from `en.json`. |
| KI-021 | open | mobile | **Language change in Settings does not reload app** | First launch seeds RTL via `Updates.reloadAsync()`; `changeLanguage` from Settings/Login only calls `forceRTL`. Most UI uses `useRtlLayout`; some native RTL may lag until restart. File: `i18n/index.ts`. |
| KI-022 | open | docs | **Onboarding spec vs implementation: 3 vs 4 feature slides** | Spec `docs/superpowers/specs/2026-06-01-onboarding-flow-design.md` says 3 slides; app has 4. Align spec or product, not a runtime bug. |
| KI-023 | open | mobile | **`console.log` in `initializeLanguage`** | Noise in production builds; prefer dev-only logging. File: `i18n/index.ts`. |
| KI-024 | accepted | mobile | **No “replay onboarding” in Settings** | Documented as not v1 in onboarding spec. |

---

## Pre-launch manual QA (checklist)

Use alongside automated tests before store / production cutover:

- [ ] Invite link → sign up → post-login onboarding → lands in correct group
- [ ] New user, airplane mode on first open after login → onboarding gate behavior
- [ ] Web: share invite, export group HTML, multi-button alerts
- [ ] Web: Toast position inside phone frame
- [ ] Hebrew device first launch → RTL reload; language toggle in Settings
- [ ] Skip pre- and post-login onboarding → no infinite loops; empty groups UX OK
- [ ] EAS production env: `EXPO_PUBLIC_SUPABASE_URL` contains **production** ref (`jfqxjjjbpxbwwvoygahu`), not dev

---

## Resolved

| ID | Resolved | PR / notes |
|----|----------|------------|
| KI-001 | 2026-06-02 | `useAuthenticatedInviteRedemption`, `pendingNavigation` store, `usePendingNavigationFlush` |
| KI-002 | 2026-06-02 | `resolveAuthenticatedGateTarget` — `fetchFailed` → `create` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-02 | Initial backlog from pre-launch mobile audit (onboarding, web platform adapters). |
| 2026-06-02 | Resolved KI-001, KI-002 (authenticated gate + invite redemption). |
