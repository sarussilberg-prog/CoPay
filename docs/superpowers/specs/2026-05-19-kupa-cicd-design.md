# CoPay CI/CD Design Spec

**Status:** Approved for implementation planning  
**Date:** 2026-05-19  
**Repo:** `sarussilberg-prog/CoPay-MVP-0.1`  
**Monorepo root:** `cost-share-app/`  
**Git root:** `CoPay-MVP-0.1/` (workflows live at `.github/workflows/`)

## Summary

Introduce tiered **CI** on pull requests and **CD** on merges:

- **Feature → `dev`:** path-scoped CI; merge deploys **staging**
- **`dev` → `main` PR:** full CI; merge deploys **production** (with approval gate)

**Web CD:** Vercel Git integration (option C).  
**Mobile / Supabase / API CD:** GitHub Actions with path filters and environment protection.

## Goals

1. Protect `main` strongly: full test + build suite must pass before merge; production deploy requires reviewer approval.
2. Protect `dev` strongly but lighter: path-scoped CI; single aggregate required check; auto staging deploy.
3. Bootstrap automated tests (currently zero) before branch protection goes live.
4. No false greens (stub mobile build, broken gate logic, wrong path prefixes).

## Non-goals (this phase)

- App Store / Play Store auto-submit (build artifacts only; submit remains manual).
- Full ESLint gate on all packages (gate when baseline is clean).
- Pact/OpenAPI contract testing (use Zod + supertest first).
- Production API deploy while server uses in-memory mock only.

---

## Branching model

| Branch | Purpose | Direct push | PR required | Approvals |
|--------|---------|-------------|-------------|-----------|
| `main` | Production-ready | No | Yes | 0 (solo) / 1 (team ≥ 2) |
| `dev` | Integration / staging | No | Yes | 0 |
| `feat/*` | Features | Yes (to branch) | Via PR to `dev` | — |

**Flow:** `feat/*` → PR → `dev` → PR → `main`

---

## Package manager

- **Canonical:** npm + `cost-share-app/package-lock.json`
- **Action:** Remove `packageManager: yarn@...` from root `package.json` to avoid Corepack confusion.
- **CI/CD install:** `working-directory: cost-share-app` → `npm ci`

---

## Phase 0 — Repo bootstrap (before workflows)

Must merge before enabling branch protection.

### Scripts (all workspaces)

| Package | `typecheck` | `lint` | `test` | `build` |
|---------|-------------|--------|--------|---------|
| `packages/shared` | `tsc --noEmit` | eslint (add) | vitest | `tsc` |
| `apps/server` | `tsc --noEmit` | eslint (add) | vitest + supertest | `tsc` |
| `apps/web` | `tsc --noEmit` | `next lint` | vitest + RTL | `next build` |
| `apps/mobile` | `tsc --noEmit` | eslint (add) | vitest (services) | **exclude from turbo `build` until real** |

Root scripts:

```json
"typecheck": "turbo run typecheck",
"test": "turbo run test",
"lint": "turbo run lint"
```

### Tests (minimum viable)

- **shared:** Zod schema / type tests
- **server:** `@nestjs/testing` + supertest per controller; assert `ApiResponse<T>` shapes
- **web:** middleware + auth callback route tests (mock Supabase)
- **mobile:** `auth.service`, `api.ts` env resolution (mocked); defer Detox

Rename “contract tests” to **API integration tests** in docs and scripts.

### Environment-driven URLs

- Replace hardcoded LAN IP in `apps/mobile/services/api.ts` with `EXPO_PUBLIC_API_URL`
- Document in `.env.example` for local, staging, production
- Web: `NEXT_PUBLIC_*` for Supabase; add `apps/web/.env.ci` placeholders for CI build

### Turbo

Add pipeline tasks: `typecheck`, `test` with appropriate `dependsOn`.

---

## CI — Workflows

All workflows:

- `defaults.run.working-directory: cost-share-app`
- Skip draft PRs: `if: github.event.pull_request.draft == false`
- Concurrency: `group: ci-${{ github.workflow }}-${{ github.event.pull_request.number }}`, `cancel-in-progress: true`
- Trigger types: `opened`, `synchronize`, `reopened`, `ready_for_review`
- Event: `pull_request` only (not `pull_request_target`)
- Permissions: `contents: read` (minimal)

### `ci-pr-dev.yml` — PRs to `dev`

**Path detection** (`dorny/paths-filter`), prefixes under `cost-share-app/`:

| Output | Paths |
|--------|-------|
| `shared` | `packages/shared/**` |
| `server` | `apps/server/**` |
| `web` | `apps/web/**` |
| `mobile` | `apps/mobile/**` |
| `root` | `package.json`, `package-lock.json`, `turbo.json`, `tsconfig*.json`, `.github/**` |

**Fan-out rule:** If `shared` or `root` → run all app jobs.

**Per-app jobs** (conditional): `typecheck`, `lint` (when exists), `test`, `build` (web + server only; not mobile stub).

**`gate` job (only required check on `dev`):**

- `needs:` all conditional jobs
- `if: always() && !cancelled()`
- Accept child `success` or `skipped`; fail on `failure` / `cancelled`
- Fail if `paths-filter` matched nothing and no substantive job ran (guard against filter bugs)

Job display name for branch protection: **`ci-dev / gate`**

### `ci-pr-main.yml` — PRs to `main`

No path filters. Required jobs:

| Job | Command / action |
|-----|------------------|
| install | `npm ci` |
| typecheck | `turbo run typecheck` |
| lint | `turbo run lint` |
| test | `turbo run test` (shared, server, web; mobile unit if stable) |
| build | `turbo run build --filter=!@cost-share/mobile` |
| audit | `npm audit --audit-level=high` — **non-blocking first 2 weeks**, then allowlist + required |

Optional later: Supabase RLS lint when `supabase/migrations` exists.

Prefer aggregating required checks into **`ci-main / gate`** on `main` too (easier renames), or require each job explicitly — document chosen names before enabling protection.

### `ci-push-main.yml` — Post-merge safety net

- Trigger: `push` to `main`
- Same suite as `ci-pr-main.yml`
- Catches merges that bypassed PR or admin bypass mistakes

### Soft signals (non-blocking)

| Workflow | Trigger paths | Behavior |
|----------|---------------|----------|
| `checkpoint-shared.yml` | `packages/shared/**` | One-time PR comment: update mobile service, server, web, i18n |
| `checkpoint-auth.yml` | `**/auth/**`, `**/supabase/**`, `middleware.ts` | Remind Supabase redirect URLs + `.env.example` |

---

## Branch protection (enable in Phase 2, after green CI)

### `main`

- Require pull request
- Require status checks: all `ci-pr-main` jobs **or** `ci-main / gate`
- Require branches up to date
- Block force push
- Approvals: **0** until second contributor; then **1** with “require approval on latest push”
- Do not allow bypass (when team is ready)

### `dev`

- Require pull request
- Require status checks: **`ci-dev / gate` only**
- No approval required
- Block force push

---

## CD — Architecture (Hybrid)

| Surface | Staging (`dev` merge) | Production (`main` merge) | Driver |
|---------|----------------------|---------------------------|--------|
| Web | Preview / staging URL | Production domain | **Vercel Git** |
| Mobile | EAS staging build + OTA | EAS production build | **GHA + EAS** |
| Supabase | Staging project migrations | Prod project migrations | **GHA + Supabase CLI** |
| API | Staging service (Phase 2+) | Prod service (Phase 3+) | **GHA + Railway** |

### Web — Vercel Git integration

- Connect repo; set **Root Directory:** `cost-share-app/apps/web`
- **Production Branch:** `main`
- **Preview:** PRs + deployments from `dev` (staging URL)
- Environment variables in Vercel dashboard:

| Variable | Preview / Staging | Production |
|----------|-------------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | staging project | prod project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | staging anon | prod anon |

No `vercel deploy` in GHA for web unless Vercel Git is unavailable.

### Mobile — EAS

Add `apps/mobile/eas.json`:

```json
{
  "build": {
    "staging": {
      "channel": "staging",
      "distribution": "internal"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  }
}
```

Per-profile env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_*`

| Event | Action |
|-------|--------|
| Merge `dev` | `eas build --profile staging --non-interactive` + `eas update --branch staging` |
| Merge `main` | `eas build --profile production --non-interactive` |
| Manual | `eas submit` (workflow_dispatch) |

### Supabase

- Two projects: **copay-staging**, **copay-prod**
- CD order: **migrations → API → clients**
- GHA secrets per GitHub Environment (`staging`, `production`)
- No service role in fork PR workflows

### API (NestJS) — phased

| Phase | Behavior |
|-------|----------|
| Now | Skip production API deploy |
| 2 | Dockerfile + Railway staging on `dev` merge |
| 3 | Railway prod on `main` merge + `GET /api/health` |

---

## CD — Workflows

Permissions: `contents: read`; deploy jobs use environment secrets.  
Do not run deploy on fork PRs (only `push` to `dev` / `main` in canonical repo).

### `deploy-staging.yml`

**Triggers:**

- `push` to `dev`
- `workflow_dispatch`

**Paths:** same as `ci-pr-dev` (skip deploy if only unrelated docs — optional)

**Jobs:**

1. `detect-changes` (paths-filter)
2. `supabase-staging` — if `supabase/migrations/**` or shared schema paths
3. `deploy-api-staging` — if server changed (Phase 2+)
4. `deploy-mobile-staging` — if mobile/shared changed → EAS
5. `gate-staging` — aggregate results (same skipped/success semantics as CI gate)

Web: **no GHA job** — Vercel deploys via Git push to `dev`.

### `deploy-production.yml`

**Triggers:**

- `push` to `main`
- `workflow_dispatch` with confirmation input for hotfixes

**GitHub Environment:** `production`

- Required reviewers: 1 (when team > 1; optional self for solo with status checks only)
- Jobs: `supabase-prod` → `deploy-api-prod` → `deploy-mobile-prod` → `gate-production`
- Web: Vercel production deploy via Git on `main`

Store submit: separate `workflow_dispatch` job `submit-stores`, not auto on merge.

---

## GitHub Environments

| Environment | Used by | Protection |
|-------------|---------|------------|
| `staging` | deploy-staging, optional integration tests | None |
| `production` | deploy-production | Required reviewers (≥1 when team grows) |

**Secrets (examples):**

- `EXPO_TOKEN`, `EAS_PROJECT_ID`
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_STAGING_REF`, `SUPABASE_PROD_REF`
- `RAILWAY_TOKEN` (Phase 2+)

Do not store in repo. Fork PRs never receive these.

---

## Security

- Use `pull_request`, not `pull_request_target`, for CI on external contributors
- `permissions: contents: read` default
- No production secrets on fork PRs
- Staging/prod Supabase keys only in GitHub Environments + Vercel/EAS dashboards
- `npm audit` phased with allowlist before blocking merges

---

## Implementation roadmap

| Phase | Deliverable | Merge gate |
|-------|-------------|------------|
| **0** | Tests, typecheck, npm lockfile, `EXPO_PUBLIC_API_URL`, turbo tasks, mobile excluded from build | Normal PR |
| **1** | `ci-pr-dev.yml`, `ci-pr-main.yml`, `ci-push-main.yml` | PR |
| **2** | Branch protection on `dev` + `main` | After green test PR |
| **3** | Vercel linked; Supabase staging project; `deploy-staging.yml` (Supabase + EAS) | PR |
| **4** | EAS staging on `dev`; env secrets configured | PR |
| **5** | `deploy-production.yml` + production environment approval | PR |
| **6** | API Docker + Railway staging/prod | PR |
| **7** | Audit required on main; RLS lint when DB exists | PR |

---

## Success criteria

- PR to `main` cannot merge unless full CI passes
- PR to `dev` cannot merge unless `ci-dev / gate` passes
- Merge to `dev` updates staging web (Vercel) and mobile (EAS) without manual steps
- Merge to `main` deploys production web and builds mobile prod artifact after approval
- No workflow uses wrong path prefix (`cost-share-app/` required)
- Gate jobs never pass when a triggered child failed or when filters silently match nothing

---

## References

- Manaurum CI patterns (path-filtered jobs, draft skip, soft checkpoints, no CD)
- Council review 2026-05-19 (gate logic, lockfile, audit phasing, bootstrap-first)

---

## Decisions log

| Decision | Choice |
|----------|--------|
| Branch flow | Feature → `dev` → `main` |
| Web CD | **C** — Vercel Git; GHA for rest |
| Dev CI scope | Path-filtered + aggregate `gate` |
| Main CI scope | Full monorepo |
| Mobile build in CI | `tsc` only until real EAS build |
| Audit | Soft → allowlist → required |
| Main approvals | 0 solo / 1 when team ≥ 2 |
| Store release | Manual `eas submit` |
