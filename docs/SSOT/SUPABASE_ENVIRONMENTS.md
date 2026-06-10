# Supabase environments (mandatory for all agents)

**Last updated:** 2026-05-25  
**Authority:** This file is SSOT for which Supabase project each git branch and deploy target must use.

---

## Two projects — never mix them

| Environment | Git branch | Supabase project name | Project ref | API URL |
|-------------|------------|----------------------|-------------|---------|
| **Development** | `dev` (and feature branches → `dev`) | Kupay - dev | `drxfbicunusmipdgbgdk` | `https://drxfbicunusmipdgbgdk.supabase.co` |
| **Production** | `main` | Kupay - production | `jfqxjjjbpxbwwvoygahu` | `https://jfqxjjjbpxbwwvoygahu.supabase.co` |

**Rule:** If your current git branch is `main`, you are on **production**. Any other branch used for integration is **development**.

---

## What each environment is for

### Development (`drxfbicunusmipdgbgdk`)

- Real user data from day-to-day development and testing
- `npm run seed` — **development only**
- Schema patches via `npm run supabase:fix` — **development only** (unless user explicitly asks for production)
- Local `.env` files must point here when working on `dev`
- Cursor MCP (`.mcp.json`) points here by default — **safe default for agents**

### Production (`jfqxjjjbpxbwwvoygahu`)

- **Clean database** — no test users, no seed data
- App Store / Play Store builds and **kupa.pro** web
- Schema changes: apply `supabase/schema.sql` + idempotent patches **only** with explicit user approval
- **Never** run seed, test accounts, or experimental SQL without user confirmation

---

## Credentials (where to put keys)

| Location | Environment | Variables |
|----------|-------------|-----------|
| `cost-share-app/apps/mobile/.env` | Dev (local) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` → **dev** project |
| `cost-share-app/apps/web/.env.local` | Dev (local) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → **dev** |
| `cost-share-app/supabase/.env` | Dev (scripts) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → **dev** |
| `cost-share-app/supabase/.env.production` | Prod (scripts, gitignored) | `SUPABASE_URL`, `SUPABASE_DB_PASSWORD`; optional `SUPABASE_SERVICE_ROLE_KEY` |
| `cost-share-app/apps/mobile/.env.production` | Prod (EAS, gitignored) | Same publishable keys as production API |
| Vercel → Production (branch `main`) | Prod | Dashboard env vars → **jfqxjjjbpxbwwvoygahu** keys |
| Vercel → Preview (`dev` PRs) | Dev | Dashboard env vars → **drxfbicunusmipdgbgdk** keys |
| EAS secrets — `production` profile | Prod | From production Supabase → API |
| EAS secrets — `development` / `preview` | Dev | From dev Supabase → API |

**Service role keys must never be committed.** Only anon/publishable keys may appear in build defaults (public by design).

---

## Deploy / CI mapping

| Vercel project | Branch | Supabase | URL |
|----------------|--------|----------|-----|
| **kupa-dev** | `dev` (Preview only; Ignored Build Step skips other branches) | `drxfbicunusmipdgbgdk` | `kupa-s1lb.vercel.app` |
| **kupa-prod** | `main` (Production only) | `jfqxjjjbpxbwwvoygahu` | `kupa.pro` |

Legacy single-project mapping (if ever merged back to one Vercel project):

| Target | Branch | Supabase |
|--------|--------|----------|
| Vercel Production | `main` | `jfqxjjjbpxbwwvoygahu` |
| Vercel Preview | `dev`, PRs | `drxfbicunusmipdgbgdk` |
| EAS `production` | release from `main` | `jfqxjjjbpxbwwvoygahu` |
| EAS `development` / `preview` | `dev` | `drxfbicunusmipdgbgdk` |
| GitHub Actions CI | PR → `dev` | No live DB required (tests mocked) |

Web build script (`apps/web/scripts/build-app-web.sh`) selects defaults from:

- **kupa-dev** project id → always `supabase-public.development.defaults`
- **kupa-prod** / `VERCEL_ENV=production` → `supabase-public.production.defaults`
- otherwise → `supabase-public.development.defaults`

---

## Agent safety checklist (read before every Supabase task)

1. Run `git branch --show-current` — confirm `main` vs not.
2. Confirm URL in env / MCP contains the correct **project ref** (see table above).
3. **Default MCP** = development (`drxfbicunusmipdgbgdk`). Do not switch MCP to production unless the user explicitly requests production DB work.
4. **Never** run `npm run seed` against production.
5. **Never** run `npm run supabase:fix` against production without `SUPABASE_ENV=production` and user approval.
6. Before `DELETE`, `TRUNCATE`, or account-deletion SQL: stop and ask if environment is correct.
7. When editing committed defaults, update the file that matches **production** vs **development**, not both with the same ref.

---

## One-time production bootstrap

After creating the empty production project:

1. Supabase Dashboard → **jfqxjjjbpxbwwvoygahu** → SQL Editor: run `cost-share-app/supabase/schema.sql` (or use bootstrap script below).
2. Run idempotent patches: `SUPABASE_ENV=production bash cost-share-app/scripts/supabase-apply-patches.sh` (requires confirmation).
3. Copy **anon / publishable** key from Project Settings → API into:
   - `cost-share-app/apps/web/supabase-public.production.defaults` (replace placeholder)
   - Vercel Production environment variables
   - EAS production secrets (`cd apps/mobile && bash scripts/eas-sync-secrets.sh .env.production`)
4. Configure Auth redirect URLs and OAuth providers on **both** projects (dev and prod).
5. `npm run supabase:verify` with `supabase/.env` pointing at production to confirm REST + RPC.

```bash
# From cost-share-app/, with production service role in supabase/.env.production (not committed):
SUPABASE_ENV=production bash scripts/supabase-bootstrap-production.sh
```

---

## CI — automatic migrations (GitHub Actions)

When migration files under `cost-share-app/supabase/migrations/` change:

| Branch | Workflow | Supabase project |
|--------|----------|------------------|
| `dev` | `.github/workflows/deploy-staging.yml` | `drxfbicunusmipdgbgdk` |
| `main` | `.github/workflows/deploy-production.yml` | `jfqxjjjbpxbwwvoygahu` |

Merging `dev` → `main` updates `main` and runs the production workflow (only if migration paths changed in that push).

### One-time GitHub setup

1. **Personal access token** — [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens) → create token with project access.
2. **Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Used for |
|--------|----------|
| `SUPABASE_ACCESS_TOKEN` | CLI auth (staging + production) |
| `SUPABASE_DEV_DB_PASSWORD` | Dev DB password (`deploy-staging.yml`) |
| `SUPABASE_PROD_DB_PASSWORD` | Prod DB password (`deploy-production.yml`) |

   DB password: Supabase Dashboard → Project → **Database** → connection string / reset password.

3. **Environment `production`** (Settings → Environments → New → name `production`):
   - Optional: required reviewers before prod migrations run.
   - Can store the same secrets at environment scope instead of repo scope.

### Migration file naming

CLI only applies files matching `<timestamp>_name.sql` (example: `20260526122059_add_expense_split_mode.sql`).

Create new migrations from `cost-share-app/`:

```bash
supabase migration new my_change_name
```

Do **not** use dated names like `2026-05-26-my-change.sql` — they are skipped by `supabase db push`.

### What CI does *not* run

- `npm run seed` — never on any environment in CI
- `npm run supabase:fix` (loose `.sql` patches under `supabase/`) — run manually when needed; not part of `db push`

Only files in `supabase/migrations/` are applied. Historical schema applied via MCP without a committed migration file is **not** replayed on production; add a matching migration file or bootstrap prod once.

### 2026-06-10 — production drift incident & reconciliation

Production (`jfqxjjjbpxbwwvoygahu`) had silently desynced: its migration history listed everything through `20260602163000` as applied, but several objects were missing (group archive, admin metrics, optimized `get_user_dashboard`), and the never-migrated one-off files `invite-links.sql` / `settle-up-v1.sql` had never run there at all. Net effect: group + friend invite links, Settle Up, and group archive were broken in prod.

Root cause: `scripts/supabase-ci-db-push.sh` had a `mark_local_applied` step that ran `migration repair --status applied` for **every** local migration before `db push`, marking migrations "applied" without executing their SQL. That step was removed on 2026-06-10.

Fix: `migrations/20260610120000_reconcile_prod_drift.sql` re-applies all drifted DDL idempotently (folds in `invite-links.sql` + `settle-up-v1.sql` + the bodies of `20260602135000/140000/163000`). It is a no-op on dev (already applied + verified there) and a clean install on prod via the next `dev → main` merge.

**Lesson:** trust actual objects, not `migration list`. Verify with `pg_proc` / `information_schema.columns`, not the history table. All migrations must be idempotent so `db push` is safe.

---

## CLI link helper

```bash
# Development (default)
SUPABASE_ENV=development bash cost-share-app/scripts/supabase-link.sh

# Production (explicit)
SUPABASE_ENV=production bash cost-share-app/scripts/supabase-link.sh
```

---

## Related files

- `.github/workflows/deploy-staging.yml` — migrations on push to `dev`
- `.github/workflows/deploy-production.yml` — migrations on push to `main`
- `cost-share-app/supabase/config.toml` — minimal CLI config for `db push`
- `.mcp.json` — MCP → dev only
- `cost-share-app/apps/web/supabase-public.{development,production}.defaults`
- `cost-share-app/scripts/supabase-env.sh` — prints active env from `SUPABASE_ENV` or git branch
- `cost-share-app/.cursor/rules/supabase-environments.mdc` — Cursor rule for agents
