# SSOT — Single Source of Truth (Kupa)

**Product:** Shared expense / cost-splitting app (Splitwise-like).  
**Monorepo:** `cost-share-app/` (mobile, web, shared, Supabase).  
**Language:** English only in this folder.

---

## How agents should use this (token-efficient)

1. **Start here** — pick the row that matches your task.
2. **Read only linked sections** — do not load all SSOT files.
3. **Drill down** — `.cursor/rules/` and code paths on demand.

| If you are… | Read first | Then (only if needed) |
|-------------|------------|------------------------|
| Adding/changing product behavior | [SRS.md](./SRS.md) → `REQ-*` | [CODE QUALITY.md](./CODE%20QUALITY.md) |
| Fixing UI / mobile screen | [CODE QUALITY.md](./CODE%20QUALITY.md) § Mobile | `MASTER-RULES.mdc`, `frontend.mdc` |
| Data / queries / RLS | [CODE QUALITY.md](./CODE%20QUALITY.md) § Auth & RLS | `supabase/schema.sql`, `apps/mobile/services/` |
| Types / DTOs / balance math | `packages/shared/` | [SRS.md](./SRS.md) glossary |
| Database model (reference) | [DATABASE_ARCHITECTURE.md](../../DATABASE_ARCHITECTURE.md) | `supabase/schema.sql` |
| Pre-merge checklist | `AI-CHECKLIST.md` | — |

---

## SSOT documents (authority order)

| Priority | File | Owns |
|----------|------|------|
| 1 | [SRS.md](./SRS.md) | **What** — features, rules (`REQ-*`) |
| 2 | [CODE QUALITY.md](./CODE QUALITY.md) | **How** — Supabase-only architecture |
| 3 | [DATABASE_ARCHITECTURE.md](../../DATABASE_ARCHITECTURE.md) | **Data model** (reference; schema file is canonical for apply) |

**Conflict resolution:** SRS wins for product; CODE QUALITY wins for structure. Canonical SQL: `cost-share-app/supabase/schema.sql`.

---

## Repo map (quick)

```
kupa/
├── docs/SSOT/
├── DATABASE_ARCHITECTURE.md
└── cost-share-app/
    ├── apps/mobile/       Expo — primary client → Supabase
    ├── apps/web/          Next.js — Supabase auth
    ├── packages/shared/   types, mappers, calculations
    └── supabase/
        ├── schema.sql
        └── .env.example   (service role — seed/verify only)
```

---

## Agent workflow

1. Map work to `REQ-*` in SRS.
2. `UI → services/ → Supabase` (never `fetch` to a custom API).
3. Types from `@cost-share/shared`.
4. If RLS blocks a mutation, fix policies in `schema.sql` (do not add a server).

`Mapped to SRS: [REQ-…]. Refactor logged: [Yes/No/NA].`

---

*Last updated: 2026-05-19 (Supabase-only)*
