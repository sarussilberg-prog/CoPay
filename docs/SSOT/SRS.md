# Software Requirements Specification (SRS) — Kupa

**Status:** Living document (v0.1 — derived from current codebase).  
**Audience:** Humans and AI agents.  
**IDs:** Every requirement uses `REQ-<AREA>-<nn>` for traceability.

**Legend:** ✅ Implemented · 🟡 Partial · ⬜ Planned · ❌ Out of scope (MVP)

---

## 1. Product summary

Kupa helps groups of people track shared expenses, split costs fairly, see who owes whom, and record settlements (payments between members). Think Splitwise: groups, expenses, splits, balances, settle-up.

**Primary client:** React Native (Expo) mobile app.  
**Backend:** Supabase (Postgres + Auth + Storage); mobile/web use `@supabase/supabase-js` with RLS.  
**Auth:** Supabase Auth (Google on mobile/web).

---

## 2. Domain glossary

| Term | Meaning |
|------|---------|
| **Profile** | App user row (`profiles`), 1:1 with `auth.users` |
| **Group** | Shared ledger for a set of members |
| **Expense** | Money spent; one **payer** (`paid_by`); split via **expense_splits** |
| **Split** | Portion each member owes for an expense (sum = expense amount) |
| **Settlement** | Payment from member A to B (reduces debt; not an expense) |
| **Net balance** | `paid − owed + received_settlements − paid_settlements` per user in group |
| **Debt summary** | Simplified “A owes B $X” between pairs (server-calculated) |

Balance formula (authoritative): see `CalculationsService` and [DATABASE_ARCHITECTURE.md](../../DATABASE_ARCHITECTURE.md).

---

## 3. Functional requirements

### 3.1 Authentication & profile

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-AUTH-01 | ✅ | User can sign in with Google (Supabase) on mobile | Session established; API calls send `Authorization: Bearer <access_token>` |
| REQ-AUTH-02 | ✅ | Unauthenticated users cannot read/write group data | Supabase RLS denies access without valid session |
| REQ-AUTH-03 | ✅ | Profile created on first login | Row in `profiles` (trigger or equivalent) |
| REQ-PROF-01 | ✅ | User can view profile | Profile screen shows name, avatar, preferences |
| REQ-PROF-02 | ✅ | User can edit profile | Updates persist via API; fields per `UpdateProfileDto` |
| REQ-PROF-03 | ✅ | User can change app language (EN / HE) | i18n keys used; RTL layout for Hebrew |
| REQ-PROF-04 | ✅ | Profile dashboard | Hero balance card, stat tiles, friends list; data from `get_user_dashboard` RPC |
| REQ-PROF-05 | ✅ | Enhanced settings | Grouped sections, legal sheets, rate app, WhatsApp contact, version footer |
| REQ-PROF-06 | ✅ | User can delete their own account | RPC `delete_my_account` sets `profiles.is_active=false` + `deleted_at=NOW()`; mobile signs out; subsequent sign-in is rejected with the deactivated alert; peers continue to see the user's data unchanged |
| REQ-AUTH-04 | 🟡 | Web app auth parity with mobile | Web login/callback exists; feature depth TBD |

### 3.2 Groups

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-GRP-01 | ✅ | List groups for current user | Only groups where user is active member |
| REQ-GRP-02 | ✅ | Create group with name and members | Creator in `group_members`; `CreateGroupDto` |
| REQ-GRP-03 | ✅ | View group detail | Name, members, summary stats where implemented |
| REQ-GRP-04 | ✅ | Edit group metadata | Name, description, type, currency, image |
| REQ-GRP-05 | ✅ | Soft-delete / deactivate group | `is_active` respected in queries |
| REQ-GRP-06 | ✅ | Manage members (add / remove) | Active membership via `group_members` |
| REQ-GRP-07 | ✅ | Group summary endpoint | Member count, expense count, totals (`/groups/:id/summary`) |

### 3.3 Expenses

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-EXP-01 | ✅ | List expenses (all or by group) | Filter by `groupId`; exclude `is_deleted` |
| REQ-EXP-02 | ✅ | Create expense with splits | `CreateExpenseDto`; splits sum equals amount |
| REQ-EXP-03 | ✅ | View expense detail | Payer, splits, category, date |
| REQ-EXP-04 | ✅ | Edit expense | `UpdateExpenseDto`; splits updated atomically where implemented |
| REQ-EXP-05 | ✅ | Delete expense (soft) | `is_deleted = true`; hidden from lists |
| REQ-EXP-06 | ✅ | Expense categories | Values per `ExpenseCategory` in shared types |
| REQ-EXP-07 | ✅ | Split types in UI | Equal / custom amounts (mobile selectors) |
| REQ-EXP-08 | 🟡 | Receipt image upload | `receipt_url` field exists; full upload flow TBD |

### 3.4 Balances & settlements

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-BAL-01 | ✅ | Per-user balances in a group | `GET /groups/:id/balances` matches calculation service |
| REQ-BAL-02 | ✅ | Pairwise debt summary | `GET /groups/:id/debts` returns simplified owes |
| REQ-BAL-03 | ✅ | Balances screen (mobile) | Shows who owes whom in group context |
| REQ-SET-01 | ✅ | Record settlement (A pays B) | `CreateSettlementDto`; `from_user_id ≠ to_user_id` |
| REQ-SET-02 | ✅ | Settlement history | History between two users in group |
| REQ-SET-03 | ✅ | Settle-up flow (mobile) | Screen to create settlement from balances context |

### 3.5 Activity & navigation

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-ACT-01 | ✅ | Activity feed | Expenses + settlements chronologically (screen + data) |
| REQ-NAV-01 | ✅ | Tab navigation | Groups, Activity, Profile (stacks per feature area) |
| REQ-EXP-LIST | ✅ | Global / group expense lists | Expense list screens reachable from navigation |

### 3.6 Non-functional

| ID | Status | Requirement | Acceptance criteria |
|----|--------|-------------|---------------------|
| REQ-NFR-01 | ✅ | Monetary precision | `DECIMAL(12,2)` in DB; no float money in domain |
| REQ-NFR-02 | ✅ | i18n — no hardcoded UI strings | `t('key')` + `en.json` / `he.json` |
| REQ-NFR-03 | ✅ | Consistent domain types | `@cost-share/shared` types and mappers |
| REQ-NFR-04 | ✅ | Row Level Security (Supabase) | RLS enabled; mobile uses anon key + user JWT |
| REQ-NFR-05 | ⬜ | Offline support | Local queue + sync without screen refactor |
| REQ-NFR-06 | ⬜ | Push notifications | — |

---

## 4. Business rules (normative)

| Rule | Description |
|------|-------------|
| BR-01 | Each expense has exactly one payer (`paid_by`). |
| BR-02 | Sum of `expense_splits.amount` for an expense must equal `expenses.amount` (± rounding policy in service). |
| BR-03 | Payer is included in splits (simplifies balance math). |
| BR-04 | Settlements are not expenses; they only adjust balances between two users. |
| BR-05 | Deleted expenses (`is_deleted`) do not affect balances. |
| BR-06 | Only active group members (`group_members.is_active`) participate in new expenses (enforce in services). |
| BR-07 | Soft-deleted groups (`groups.is_active = false`) are hidden from default lists. |

---

## 5. Out of scope (MVP)

- Multi-currency conversion / FX rates
- In-app payment processing (Stripe, etc.)
- Expense approval workflows
- Guest users without auth
- Splitwise import

---

## 6. Traceability — code anchors

| Area | Primary locations |
|------|-------------------|
| Mobile UI | `cost-share-app/apps/mobile/screens/` |
| Data access | `cost-share-app/apps/mobile/services/` |
| Balance math | `packages/shared/src/calculations/` |
| Row mapping | `packages/shared/src/mappers/` |
| Types / DTOs | `packages/shared/src/types/index.ts` |
| DB schema + RLS | `cost-share-app/supabase/schema.sql` |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-05-19 | Add REQ-PROF-06 — account self-deletion (soft, type-to-confirm) |
| 2026-05-19 | Add REQ-PROF-04/05 for profile dashboard & settings redesign (direct-Supabase, no notifications) |
| 2026-05-19 | RLS recursion fix on `group_members` (SECURITY DEFINER helpers `is_group_member`, `is_group_creator`); patch in `cost-share-app/supabase/fix-rls-group-members-recursion.sql`. Docs/AI-CHECKLIST swept to remove API/backend wording. |
| 2026-05-19 | Supabase-only backend (NestJS removed) |
| 2026-05-19 | Initial SRS from codebase + DATABASE_ARCHITECTURE.md |
