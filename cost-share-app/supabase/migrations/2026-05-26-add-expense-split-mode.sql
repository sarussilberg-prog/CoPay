-- 2026-05-26 — Persist the chosen split mode on each expense row.
--
-- Background:
--   The mobile AddExpense edit-mode prefill previously guessed between
--   'percent' and 'amount' from per-member amounts. That guess is lossy
--   (e.g. a 3-way equal split and a 33.33/33.33/33.34 percent split
--   produce identical rows). Storing the mode explicitly removes the guess.
--
-- This migration is safe to apply on a live DB: ADD COLUMN ... NOT NULL
-- DEFAULT 'equal' assigns the default to every existing row in a single
-- statement, then the backfill below tightens the guess where it can.
--
-- Apply order (per docs/SSOT/SUPABASE_ENVIRONMENTS.md):
--   1. dev   (drxfbicunusmipdgbgdk)  — run automatically
--   2. prod  (jfqxjjjbpxbwwvoygahu)  — only with explicit user approval

BEGIN;

-- 1. Add the column with a safe default.
ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS split_mode TEXT NOT NULL
        DEFAULT 'equal'
        CHECK (split_mode IN ('equal', 'percent', 'amount'));

-- 2. Backfill existing rows by inferring the mode from stored splits.
--    Mirrors the spirit of inferUnequalModeFromSplits in
--    apps/mobile/lib/expenseSplitForm.ts:
--      - equal:   every split within 0.01 of total / n
--      - percent: every (amount / total * 100) is a clean 2-decimal value
--      - amount:  fallback
WITH agg AS (
    SELECT
        e.id           AS expense_id,
        e.amount       AS total,
        array_agg(s.amount ORDER BY s.user_id) AS split_amounts,
        count(*)       AS member_count
    FROM expenses e
    JOIN expense_splits s ON s.expense_id = e.id
    GROUP BY e.id, e.amount
)
UPDATE expenses e
SET split_mode = CASE
    -- equal: every split is within tolerance of total / member_count
    WHEN (
        SELECT bool_and(
            abs(amt - (agg.total / NULLIF(agg.member_count, 0))) <= 0.01
        )
        FROM unnest(agg.split_amounts) AS amt
    ) THEN 'equal'
    -- percent: every (amount / total * 100) has at most 2 decimal places
    WHEN agg.total > 0 AND (
        SELECT bool_and(
            abs(
                (amt / agg.total * 100)
                - round((amt / agg.total * 100)::numeric, 2)
            ) <= 0.01
        )
        FROM unnest(agg.split_amounts) AS amt
    ) THEN 'percent'
    ELSE 'amount'
END
FROM agg
WHERE e.id = agg.expense_id;

-- 3. Smoke check — record output in the PR description.
--    Expected: every row classified into one of the three modes.
SELECT split_mode, count(*) FROM expenses GROUP BY split_mode ORDER BY split_mode;

COMMIT;
