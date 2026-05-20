# Code Quality & Architecture — Kupa

**Status:** Living document (v0.2 — Supabase-only backend).  
**Pairs with:** [SRS.md](./SRS.md) (requirements), [README.md](./README.md) (routing).

---

## 1. Architecture snapshot

```
┌─────────────────────────────────────────────────────────────┐
│  apps/mobile (Expo RN)          apps/web (Next.js)        │
│  screens/ → services/ → supabase client (anon + user JWT) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Supabase                                                   │
│  Auth · Postgres · Storage · RLS                            │
│  Schema: cost-share-app/supabase/schema.sql                 │
└─────────────────────────────────────────────────────────────┘

        packages/shared — types, DTOs, mappers, calculations
```

**No NestJS API.** Business logic lives in `apps/mobile/services/` (and `packages/shared` for pure math).

---

## 2. Layer rules (enforced)

### 2.1 Mobile (`apps/mobile/`)

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| `screens/` | UI composition, navigation, local UI state | Direct `supabase.from()` calls, business rules |
| `services/` | All Supabase reads/writes, toasts, store updates | Render UI |
| `lib/supabase.ts` | Single Supabase client instance | Feature logic |
| `store/` | Global state | Screen-specific form state |
| `components/` | Reusable UI | Data access |

**Data flow (mandatory):** `UI → services/ → Supabase`

### 2.2 Shared (`packages/shared/`)

- Types, DTOs, row **mappers** (`mappers/`), pure **calculations** (`calculations/`).
- DB snake_case in Postgres; TypeScript camelCase in app types.

### 2.3 Web (`apps/web/`)

- Supabase SSR auth only (light shell). Same Supabase project as mobile.

### 2.4 Dev-only scripts

| Script | Env | Purpose |
|--------|-----|---------|
| `npm run seed` | `supabase/.env` (service role) | Sample data |
| `scripts/verify-supabase-schema.sh` | `supabase/.env` | Health check |

Never ship service role keys in the mobile app.

---

## 3. Critical implementation patterns

### 3.1 Auth & RLS

- Mobile uses `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- User JWT from `supabase.auth` is sent automatically on queries.
- **RLS** on all tables — policies in `supabase/schema.sql`. Re-apply SQL after policy changes.

### 3.2 Money & balances

```text
netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledPaid
```

- Pure functions: `packages/shared/src/calculations/`
- Data loading: `groups.service.ts` → `getGroupBalances`

### 3.3 Mobile UX stack

- NativeWind, i18n (EN/HE), RTL, Toast for errors, `useLoading()` for screen loading.

---

## 4. File & naming conventions

(Unchanged — see v0.1; services remain `kebab-case.service.ts`.)

---

## 5. Detailed rules (read on demand)

| Topic | Path |
|-------|------|
| Master quick reference | `cost-share-app/.cursor/rules/MASTER-RULES.mdc` |
| Pre-task checklist | `cost-share-app/.cursor/rules/AI-CHECKLIST.md` |
| i18n / RTL | `i18n.mdc`, `rtl.mdc` |

`api-contract.mdc` and `backend.mdc` are **deprecated** (NestJS removed).

---

## 6. Pending refactors

| Item | Notes |
|------|-------|
| [PENDING REFACTOR]: Move balance fetch to Supabase RPC/view | Optional server-side aggregation |
| [PENDING REFACTOR]: Storage RLS for `group-images` bucket | Document policies in schema or Supabase dashboard |
| [PENDING REFACTOR]: Prune stale superpowers plans referencing `apps/server` | Historical docs under `docs/superpowers/` |

---

## 7. Adding a feature (agent checklist)

1. **SRS:** `REQ-*` + acceptance criteria.
2. **RLS:** Update `supabase/schema.sql` if new table or policy needed.
3. **Types:** `packages/shared`.
4. **Mobile:** `services/*.service.ts` → screen(s) → i18n EN+HE.
5. **Tests:** mobile Jest for critical flows; shared unit tests for new pure math.

---

## 8. Changelog

| Date | Change |
|------|--------|
| 2026-05-19 | v0.2 — Removed NestJS; Supabase-only architecture |
| 2026-05-19 | v0.1 — Initial CODE QUALITY |
