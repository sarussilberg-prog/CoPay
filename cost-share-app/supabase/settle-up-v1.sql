-- Settle Up v1: extend settlements with audit + soft delete, broaden RLS to both parties,
-- and add the pairwise net debt RPC used by SettleUpListScreen.

ALTER TABLE settlements
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE settlements
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_settlements_active
    ON settlements(group_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_settlements_updated_at ON settlements;
CREATE TRIGGER update_settlements_updated_at BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: either party (payer or receiver) may UPDATE / DELETE; group members SELECT non-deleted only.
DROP POLICY IF EXISTS "Users can view settlements in their groups" ON settlements;
CREATE POLICY "Users can view settlements in their groups" ON settlements
    FOR SELECT USING (public.is_group_member(group_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Either party can update settlement" ON settlements;
CREATE POLICY "Either party can update settlement" ON settlements
    FOR UPDATE USING (
        public.is_group_member(group_id)
        AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    );

DROP POLICY IF EXISTS "Either party can delete settlement" ON settlements;
CREATE POLICY "Either party can delete settlement" ON settlements
    FOR DELETE USING (
        public.is_group_member(group_id)
        AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    );

-- get_group_pairwise_debts(group_id)
-- Returns one row per (from_user_id, to_user_id, currency) where amount > 0.
-- Directions are normalized so amount is always positive.
CREATE OR REPLACE FUNCTION public.get_group_pairwise_debts(p_group_id UUID)
RETURNS TABLE (
    from_user_id UUID,
    to_user_id UUID,
    currency VARCHAR,
    amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    IF NOT public.is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'not a member of group';
    END IF;

    RETURN QUERY
    WITH expense_debts AS (
        SELECT es.user_id AS debtor, e.paid_by AS creditor, e.currency, SUM(es.amount) AS amount
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.group_id = p_group_id
          AND e.is_deleted = FALSE
          AND es.user_id <> e.paid_by
        GROUP BY es.user_id, e.paid_by, e.currency
    ),
    settlement_debts AS (
        SELECT s.from_user_id AS debtor, s.to_user_id AS creditor, s.currency, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id = p_group_id
          AND s.deleted_at IS NULL
        GROUP BY s.from_user_id, s.to_user_id, s.currency
    ),
    pair_combos AS (
        SELECT debtor, creditor, currency FROM expense_debts
        UNION
        SELECT creditor, debtor, currency FROM expense_debts
        UNION
        SELECT debtor, creditor, currency FROM settlement_debts
        UNION
        SELECT creditor, debtor, currency FROM settlement_debts
    ),
    directed_net AS (
        SELECT
            pc.debtor,
            pc.creditor,
            pc.currency,
            COALESCE((SELECT ed.amount FROM expense_debts ed
                      WHERE ed.debtor = pc.debtor AND ed.creditor = pc.creditor AND ed.currency = pc.currency), 0)
            - COALESCE((SELECT sd.amount FROM settlement_debts sd
                      WHERE sd.debtor = pc.debtor AND sd.creditor = pc.creditor AND sd.currency = pc.currency), 0)
            AS gross
        FROM pair_combos pc
    ),
    pair_net AS (
        SELECT
            LEAST(d1.debtor, d1.creditor) AS u_lo,
            GREATEST(d1.debtor, d1.creditor) AS u_hi,
            d1.currency,
            SUM(CASE WHEN d1.debtor < d1.creditor THEN d1.gross ELSE -d1.gross END) AS lo_to_hi
        FROM directed_net d1
        GROUP BY LEAST(d1.debtor, d1.creditor), GREATEST(d1.debtor, d1.creditor), d1.currency
    )
    SELECT
        CASE WHEN pn.lo_to_hi > 0 THEN pn.u_lo ELSE pn.u_hi END AS from_user_id,
        CASE WHEN pn.lo_to_hi > 0 THEN pn.u_hi ELSE pn.u_lo END AS to_user_id,
        pn.currency,
        ROUND(ABS(pn.lo_to_hi)::numeric, 2) AS amount
    FROM pair_net pn
    WHERE ABS(pn.lo_to_hi) >= 0.01;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_group_pairwise_debts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_pairwise_debts(UUID) TO authenticated;
