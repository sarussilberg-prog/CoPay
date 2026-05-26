# Persist expense split_mode — design

**Date:** 2026-05-26
**Branch:** `fix-expense-screen`
**Status:** Draft, awaiting user review

## Goal

Persist the chosen split mode (`equal` | `percent` | `amount`) on the expense row in the database so that opening an existing expense in edit mode shows it the way the creator originally configured it — instead of inferring the mode from the resulting amounts.

## Why

The AddExpense edit-mode prefill currently calls `inferUnequalModeFromSplits` to guess between `percent` and `amount` from the stored per-member amounts. The inference is lossy:

- A 3-way `equal` split of $30 produces $10/$10/$10. So does a `percent` split of 33.33/33.33/33.34. So does an `amount` split of $10/$10/$10. The stored rows are identical; the original intent is gone.
- After a future schema change (currency rounding, new modes) the inference becomes more fragile.

Storing the mode explicitly removes the guess.

## Database changes

Add a `split_mode` column to `expenses` (one mode per expense, not per split row).

```sql
ALTER TABLE expenses
    ADD COLUMN split_mode TEXT NOT NULL
        DEFAULT 'equal'
        CHECK (split_mode IN ('equal', 'percent', 'amount'));
```

Notes:
- TEXT + CHECK constraint (consistent with how `category` is modelled in this schema; no new ENUM type).
- `NOT NULL` with `DEFAULT 'equal'` so the column is safe to add without a separate "fill nulls" step.
- No new index — the column isn't queried for filtering.

Also patch `cost-share-app/supabase/schema.sql` to reflect the new column on the `expenses` table so fresh project bootstraps stay in sync with migrations.

### Migration file

Path: `cost-share-app/supabase/migrations/2026-05-26-add-expense-split-mode.sql` (or equivalent path per the project's migration convention — confirm during execution).

The migration is structured in three steps so the backfill is observable and idempotent:

1. `ALTER TABLE expenses ADD COLUMN split_mode TEXT NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('equal', 'percent', 'amount'));`
2. **Inference backfill** — run a one-shot SQL block that updates existing rows. Pseudocode:
   ```sql
   WITH agg AS (
       SELECT
           e.id AS expense_id,
           e.amount AS total,
           array_agg(s.amount ORDER BY s.user_id) AS split_amounts,
           count(*) AS member_count
       FROM expenses e
       JOIN expense_splits s ON s.expense_id = e.id
       GROUP BY e.id, e.amount
   )
   UPDATE expenses e
   SET split_mode = CASE
       -- equal: every split is within tolerance of total/n
       WHEN (
           SELECT bool_and(abs(amt - (agg.total / agg.member_count)) <= 0.01)
           FROM unnest(agg.split_amounts) AS amt
       ) THEN 'equal'
       -- percent vs. amount: heuristic — if every split is a clean fraction of total
       -- (i.e. split / total has at most one decimal place when expressed as %),
       -- treat as percent; otherwise amount. SQL approximation:
       WHEN (
           SELECT bool_and(
               abs((amt / NULLIF(agg.total, 0) * 100)
                   - round(amt / NULLIF(agg.total, 0) * 100, 1)) <= 0.01
           )
           FROM unnest(agg.split_amounts) AS amt
       ) THEN 'percent'
       ELSE 'amount'
   END
   FROM agg
   WHERE e.id = agg.expense_id;
   ```
3. Smoke check: `SELECT split_mode, count(*) FROM expenses GROUP BY split_mode;` — record in the PR.

The backfill mirrors the spirit of `inferUnequalModeFromSplits` in `cost-share-app/apps/mobile/lib/expenseSplitForm.ts`. If matching the TS heuristic exactly proves too involved in SQL, fall back to a one-time Node script that calls the existing function and issues UPDATEs.

**Apply order:** dev project (`drxfbicunusmipdgbgdk`) first, validate, then prod (`jfqxjjjbpxbwwvoygahu`). Per `docs/SSOT/SUPABASE_ENVIRONMENTS.md`, prod schema changes require explicit user approval — don't apply automatically.

## Shared types

`cost-share-app/packages/shared/src/types/index.ts`:

```ts
export type ExpenseSplitMode = 'equal' | 'percent' | 'amount';

export interface Expense {
    // ... existing fields
    splitMode: ExpenseSplitMode;  // new, non-optional
}
```

`Expense` is consumed by `ExpenseWithSplits`, `ExpenseWithDelta`, and several DTO shapes — they inherit the field by extension and don't need to change.

DTO shapes for create/update (search `CreateExpenseDTO`, `UpdateExpenseDTO` — likely in the same file) get an optional `splitMode?: ExpenseSplitMode`. The service layer defaults to `'equal'` if omitted.

Mappers in `cost-share-app/packages/shared/src/mappers/`:
- `expenseFromRow` — read `row.split_mode` into `splitMode`.
- `expenseToRow` (if it exists) — write `splitMode` to `split_mode`.

## Service layer (mobile)

`cost-share-app/apps/mobile/services/expenses.service.ts`:

- `createExpense` — accept `splitMode` in the DTO and include it in the insert payload. Default to `'equal'` when omitted (defensive — UI will always pass it).
- `updateExpense` — pass `splitMode` through when the caller provides it. Existing edit-mode flow always re-sends the full split DTO, so we send the mode alongside.
- `getExpenseWithSplits` / `getExpenseWithSplitsById` — already select `*`, so `split_mode` comes back automatically; the new mapper picks it up.

## Mobile UI changes

`cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`:

### Create path
- Pass the current `splitMode` (already a state variable of type `UiSplitMode`) through to `createExpense`. UI mode → DB mode:
  - `'equal'` → `'equal'`
  - `'percent'` → `'percent'`
  - `'exact'` → `'amount'`
  Add a small adapter in `lib/expenseSplitForm.ts` (`uiToStoredSplitMode`).

### Edit path
The current useEffect (lines 192–215) does:
```ts
if (areSplitsEqual(splitAmounts)) setSplitMode('equal');
else { /* inferUnequalModeFromSplits → setSplitMode + setUnequalValues */ }
```

Change to:
```ts
const storedMode = storedSplitModeToUi(expense.splitMode); // 'equal' | 'percent' | 'exact'
setSplitMode(storedMode);
if (storedMode !== 'equal') {
    // Rebuild unequalValues from stored amounts in the chosen mode.
    setUnequalValues(buildUnequalValuesFromStored(storedMode, splits, expense.amount));
}
```

A small helper `buildUnequalValuesFromStored(mode, splits, total)` lives in `lib/expenseSplitForm.ts`:
- For `'amount'`: each member's `unequalValues[userId] = String(split.amount)`.
- For `'percent'`: `unequalValues[userId] = String((split.amount / total) * 100)` (rounded to a reasonable precision — match how the editor displays).

### Inference fallback (defensive)

Keep `inferUnequalModeFromSplits` in `lib/expenseSplitForm.ts`. If the prefill reads back `splitMode` and it's missing (shouldn't happen after the migration, but might during the transition for un-migrated dev rows), fall back to the current inference. Log a single console warning so we notice.

## Tests

Mobile (`cost-share-app/apps/mobile/__tests__/screens/expenses/AddExpenseScreen.test.tsx`):

- New test: editing an expense saved as `splitMode: 'percent'` with equal amounts pre-fills the editor in percent mode (not equal). This is the core regression the change exists to fix.
- New test: creating an expense in `percent` mode passes `splitMode: 'percent'` to `createExpense`.
- Existing tests should not need changes; update mock `getExpenseWithSplits` shape to include `splitMode` (default `'equal'`).

Shared (`cost-share-app/packages/shared/src/mappers` tests, if present): one round-trip case per mode.

DB: no automated test; the migration + smoke query result is recorded in the PR.

## Rollout

1. Land the shared-type + service-layer + UI changes behind a tolerant read (if `splitMode` missing, fall back to inference). This means the mobile app keeps working against a DB that hasn't been migrated yet.
2. Apply the migration to **dev** (`drxfbicunusmipdgbgdk`). Validate with the smoke query and by opening a few existing expenses.
3. Apply to **prod** (`jfqxjjjbpxbwwvoygahu`) after explicit user approval.
4. Remove the inference fallback path in a follow-up commit once both DBs have migrated.

## Non-goals

- No new UI to *display* the mode outside the editor (the existing `expenses.v2.summary.*` labels already cover that).
- No change to how splits are stored on `expense_splits` — amounts continue to be the authoritative numeric values.
- No new modes (e.g. shares/weights). The schema's `CHECK` constraint can be extended later without a breaking migration.

## Open questions

- Confirm the exact migrations directory in this repo — there's no `cost-share-app/supabase/migrations/` folder visible; loose `.sql` files live under `cost-share-app/supabase/`. The plan author should verify whether to add a numbered migration or a dated patch file matching the existing convention before executing.
- Confirm the percent precision the editor uses (1 decimal place? 2?) so `buildUnequalValuesFromStored` round-trips cleanly.
