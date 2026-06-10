# Pre-Build Audit & Prod-Drift Remediation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The P0 database steps touch the **production** Supabase project and MUST NOT run without the user's explicit go-ahead.

**Goal:** Make the production Supabase project (`jfqxjjjbpxbwwvoygahu`) and the iOS Universal-Links config match what the mobile app actually calls, so the upcoming Android + iOS EAS build ships working invite links, profile/friend sharing, Settle Up, and group archive.

**Verdict:** ❌ Not safe to ship as-is. The mobile binary will compile, but at runtime against **prod** several core features the user emphasized are broken because the prod DB is missing the functions/columns the app calls, and prod's migration history is **desynced** (rows marked "applied" for migrations that never executed). iOS Universal Links are also dead.

**Scope of verification:** Live prod (`jfqxjjjbpxbwwvoygahu`) and dev (`drxfbicunusmipdgbgdk`) queried directly via MCP; live AASA/assetlinks fetched from `kupa.pro`; 5 subsystem code audits.

---

## Evidence (verified live, 2026-06-10)

Prod = `jfqxjjjbpxbwwvoygahu` (matches `apps/mobile/.env.production` `EXPO_PUBLIC_SUPABASE_URL`). Dev = `drxfbicunusmipdgbgdk` (matches `.env`).

| Object | App caller | dev | **prod** | Source file |
|---|---|---|---|---|
| `rotate_group_invite`, `redeem_group_invite`, `generate_invite_token`, `get_invite_preview`, `default_group_invite_token` | `services/invite.service.ts`, `services/deepLinks.service.ts` | ✅ | ❌ | `supabase/invite-links.sql` (NOT a migration) |
| `groups.invite_token` column | invite mapper | ✅ | ❌ | `supabase/invite-links.sql` |
| `rotate_friend_invite`, `redeem_friend_invite`, `default_profile_invite_token` | friend-share flow | ✅ | ❌ | `supabase/invite-links.sql` |
| `profiles.invite_token` column | friend mapper | ✅ | ❌ | `supabase/invite-links.sql` |
| `get_group_pairwise_debts` | `services/settlements.service.ts:147` | ✅ | ❌ | `supabase/settle-up-v1.sql` (NOT a migration) |
| `archive_group`, `unarchive_group`, `group_is_auto_archived`, `get_user_groups_archive_state`, `bump_group_last_activity`, `clear_archive_for_*` | archive flow | ✅ | ❌ | `supabase/group-archive.sql` + migration `20260602135000_group_archive.sql` |
| `groups.archived_at` / `last_activity_at` + `group_user_archive` table | archive flow | ✅ | ❌ | same |
| `admin_get_platform_metrics` | admin portal | ✅ | ❌ | migration `20260602140000_admin_platform_metrics.sql` |
| `get_user_dashboard` | dashboard/home | ✅ (md5 e2f4bb3b, len 7041) | ⚠️ DIFFERENT (md5 7330ec12, len 7230) | migration `20260602163000_optimize_get_user_dashboard.sql` |
| RLS on core tables | — | ✅ | ✅ enabled, policies present | schema.sql |
| `is_group_member`/`is_group_creator` SECURITY DEFINER, `search_path=public` | RLS helpers | ✅ | ✅ | schema.sql |

**Migration-history desync (root cause):** `supabase-prod list_migrations` reports versions through `20260602163000` as applied — including `20260602135000_group_archive` and `20260602140000_admin_platform_metrics` — yet NONE of their objects exist on prod (verified: `groups` has no archive columns, `archive_group`/`admin_get_platform_metrics` absent). The history was baselined/repaired to "applied" without executing the SQL. **Consequence:** a normal `supabase db push` / dev→main CI deploy will SKIP these migrations, so merging will NOT fix prod.

`schema.sql` (the bootstrap source) itself contains 0 references to the invite functions, `invite_token`, `archive_group`, or `get_group_pairwise_debts` — so a fresh bootstrap never created them; they only ever reached dev via one-off MCP applies of the standalone `.sql` files.

---

## Findings by severity

### CRITICAL (block the emphasized features in prod)
1. **Invite links — group AND friend/profile sharing — entirely non-functional in prod.** All `rotate_*`/`redeem_*`/`generate_invite_token` RPCs and the `invite_token` columns are missing on prod. Generating a share link and redeeming a tapped link both fail.
2. **iOS Universal Links dead.** Live `https://kupa.pro/.well-known/apple-app-site-association` returns `appID: ".com.kupay.mobile"` — missing the Team-ID prefix because `KUPAY_IOS_TEAM_ID` is unset on the `invite-landing` Edge Function. Source: `supabase/functions/invite-landing/well-known.ts:18`. Every iOS tap on a `kupa.pro/i/*` or `/g/*` link opens Safari, not the app — so even after #1 is fixed, iOS deep links won't route into the app.
3. **Settle Up broken in prod.** `get_group_pairwise_debts` missing → the Settle Up / pairwise-balances screen returns empty/errors.

### HIGH
4. **Group archive broken in prod.** Archive table, `groups` archive columns, and all archive RPCs missing.
5. **Prod migration history lies** (see root cause). Must be reconciled or future deploys silently skip fixes.
6. **In-app version display will drift.** Login screen reads `version.json` (`screens/auth/LoginScreen.tsx:35`), but CI bumpers (`.github/workflows/bump-version-{dev,main}.yml`) update only `version.json`, never `app.json` `version`; `eas.json` uses `appVersionSource: "remote"`. The shown version, the store version, and the cache-buster (`expo-application.nativeApplicationVersion`) will diverge.
7. **Android partial-auth (Sign in with Apple) false-cancel risk.** `lib/openPartialAuthSession.android.ts` uses a 600ms grace after `TAB_HIDDEN`; on a slow/cold device the success deep link can arrive later, dropping a real login as "cancel." Widen `DISMISS_GRACE_MS` (~1200ms) or gate the cancel on whether a redirect navigation already started.

### MEDIUM
8. `get_user_dashboard` body differs prod-vs-dev (likely unoptimized on prod). Same drift class.
9. Android `assetlinks.json` serves 2 SHA-256 fingerprints; after the first production build, confirm the **Play App Signing** key fingerprint is one of them, or App Links auto-verify fails.

### LOW
10. CSV export: departed members render as raw UUIDs (`GroupDetailScreen.tsx:547` passes `memberLites` not the full `memberMap`); unknown expense category emits a raw i18n key (`lib/groupExportCsv.ts:141`); export failure shows a misleading `common.networkError` toast (`services/group-share.service.ts:95`). File integrity, Hebrew/UTF-8 BOM, permissions, and empty-state are all correct.
11. Untracked `cost-share-app/tsconfig.json` (`{"extends":"expo/tsconfig.base"}`) — harmless stray; recommend deleting.
12. Uncommitted partial-auth changes are correct but should be committed before the build so the native Kotlin change is reproducibly included.
13. `EXPO_PUBLIC_APP_STORE_URL=...idXXXXXXXX` placeholder in `.env.production` — fill before iOS submit.
14. No React-Navigation `linking` config; deep-link routing relies solely on `Linking.useURL()`. Works but fragile.

### Verified GOOD
- CSV export pipeline (UTF-8 BOM, RFC-4180 escaping, app-private cache + `expo-sharing`, no storage permission needed, empty states, i18n complete, 18/18 tests pass).
- Auth happy path: PKCE, env-driven Supabase client, session persistence/refresh, sign-out, account deletion, Apple iOS native + Android web-OAuth wiring; the uncommitted dismiss-listener change is correct (no double-resolve/leak).
- Balance math in `packages/shared` (integer cents, remainder distribution, `simplifyDebts` zero-sum guard).
- RLS enabled on all core tables; helpers use `is_group_member()` (no 42P17 recursion risk).
- Build config: Android release uses EAS-managed signing (no hardcoded `signingConfig`), permissions coherent with usage strings, Sentry upload disabled so the stale org won't fail the build, `associatedDomains`/`intentFilters` well-formed, no debug/localhost leaks.

---

## Remediation plan

### P0 — must do before the build is useful in prod

#### Task A: Reconcile prod DB to dev/intended state (PROD WRITE — needs explicit user OK)
**Recommended approach:** one new, later-timestamped, **idempotent** migration that folds in every missing piece, because the desynced history means re-pushing the existing migrations won't run them. All the source SQL is already idempotent (`invite-links.sql` 15, `settle-up-v1.sql` 8, `group-archive.sql` 21 `IF NOT EXISTS`/`CREATE OR REPLACE`/`DROP IF EXISTS` markers).

- [ ] **A1.** Create `cost-share-app/supabase/migrations/20260610HHMMSS_reconcile_prod_drift.sql` that concatenates, in dependency order: `invite-links.sql`, `settle-up-v1.sql`, the body of `group-archive.sql` (= migration `20260602135000`), `20260602140000_admin_platform_metrics.sql`, and the optimized `get_user_dashboard` from `20260602163000`. Confirm each block is idempotent; wrap any non-idempotent `CREATE TRIGGER` with `DROP TRIGGER IF EXISTS` (note: the activity-events trigger on `group_messages`/`friend_requests` needs `to_regclass` guards — those tables DO exist on prod, verified).
- [ ] **A2.** Smoke-test idempotency against **dev** first (dev already has everything, so this must be a clean no-op): apply via `supabase__apply_migration` on the dev project and confirm no errors.
- [ ] **A3.** Get explicit user approval to apply to prod.
- [ ] **A4.** Apply to prod via `supabase-prod__apply_migration`.
- [ ] **A5. Verify** with the exact query used in this audit; expect every count = 1 and `groups` to contain `archived_at`/`last_activity_at` + `invite_token`:
```sql
select
  (select count(*) from pg_proc where proname='get_group_pairwise_debts') as pairwise,
  (select count(*) from pg_proc where proname='rotate_group_invite') as rot_group,
  (select count(*) from pg_proc where proname='rotate_friend_invite') as rot_friend,
  (select count(*) from pg_proc where proname='redeem_group_invite') as red_group,
  (select count(*) from pg_proc where proname='redeem_friend_invite') as red_friend,
  (select count(*) from pg_proc where proname='archive_group') as archive,
  (select count(*) from pg_proc where proname='admin_get_platform_metrics') as admin_metrics,
  (select count(*) from information_schema.columns where table_name='groups' and column_name='invite_token') as g_invite_tok,
  (select count(*) from information_schema.columns where table_name='profiles' and column_name='invite_token') as p_invite_tok,
  (select count(*) from information_schema.columns where table_name='groups' and column_name='archived_at') as g_archived_at;
```
- [ ] **A6.** Reconcile the lying history so future deploys are trustworthy: either `supabase migration repair` the four 2026-06-02 versions to reflect reality, or document that prod is now driven by the reconciliation migration. Update `docs/SUPABASE_ENVIRONMENTS.md` / deploy notes.
- [ ] **A7. SSOT sweep** (per project rule): fold the now-missing standalone SQL into the migration story; update `schema.sql` if it is meant to be a faithful bootstrap (it currently lacks invites/settle-up/archive); reconcile `DATABASE_ARCHITECTURE.md`.

#### Task B: Fix iOS Universal Links (PROD config — needs OK)
- [ ] **B1.** Set `KUPAY_IOS_TEAM_ID` (Apple Developer Team ID) as a secret/env on the prod `invite-landing` Edge Function; confirm `KUPAY_ANDROID_RELEASE_SHA256` / `KUPAY_ANDROID_DEBUG_SHA256` are also set (assetlinks already serves 2 fingerprints, so they appear set).
- [ ] **B2.** Redeploy `invite-landing` (`supabase-prod__deploy_edge_function` or `supabase functions deploy invite-landing`).
- [ ] **B3. Verify:** `curl -s https://kupa.pro/.well-known/apple-app-site-association` → `appID` must be `<TEAMID>.com.kupay.mobile` (no leading dot).

### P1 — do with the build

- [ ] **C1.** Commit the uncommitted partial-auth changes (`lib/openPartialAuthSession.android.ts`, `modules/kupa-partial-auth-browser/src/index.ts`, `.../KupaPartialAuthBrowserModule.kt`) so the native change is reproducibly in the build.
- [ ] **C2.** Decide the version source of truth (Finding 6): simplest fix — change `LoginScreen.tsx` to read `expo-application` `nativeApplicationVersion` instead of `version.json`, OR extend the CI bumpers to also write `app.json` `version`. Confirm the EAS "remote" base version is `1.0.0` before the first build.
- [ ] **C3.** Widen `DISMISS_GRACE_MS` to ~1200ms (or gate on redirect-started) in `lib/openPartialAuthSession.android.ts` (Finding 7).

### P2 — post-build / nice-to-have
- [ ] **D1.** After the first prod build, confirm the Play App Signing SHA-256 (Play Console → App integrity) is one of the two fingerprints in `assetlinks.json` (Finding 9).
- [ ] **D2.** CSV export LOW fixes: pass `Object.values(memberMap)` to `exportGroupCsv`; guard unknown category; use a filesystem/sharing-specific error toast (Finding 10).
- [ ] **D3.** Delete stray `cost-share-app/tsconfig.json` (Finding 11).
- [ ] **D4.** Fill `EXPO_PUBLIC_APP_STORE_URL` before iOS submit (Finding 13).
- [ ] **D5.** Consider a React-Navigation `linking` config as a deep-link fallback (Finding 14).

---

## Open product-level question for the user
- Approve the **prod** DB reconciliation (Task A) and the `invite-landing` env+redeploy (Task B)? These are the only steps that change production and the only thing standing between the current binary and working links / sharing / Settle Up.
