-- Idempotent: per-group balance summary for the groups list (BalanceChip + filters).
-- Mirrors get_group_pairwise_debts so chip + Settle Up agree per currency.
-- Apply: supabase db query --linked -f supabase/get-user-balance-summary.sql

CREATE OR REPLACE FUNCTION get_user_balance_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_summary JSONB;
    v_by_group JSONB;
BEGIN
    WITH user_groups AS (
        SELECT gm.group_id
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id
          AND gm.is_active = TRUE
          AND g.is_active = TRUE
    ),
    expense_debts AS (
        SELECT e.group_id, es.user_id AS debtor, e.paid_by AS creditor, e.currency,
               SUM(es.amount) AS amount
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.group_id IN (SELECT group_id FROM user_groups)
          AND e.is_deleted = FALSE
          AND es.user_id <> e.paid_by
        GROUP BY e.group_id, es.user_id, e.paid_by, e.currency
    ),
    settlement_debts AS (
        SELECT s.group_id, s.from_user_id AS debtor, s.to_user_id AS creditor, s.currency,
               SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id IN (SELECT group_id FROM user_groups)
          AND s.deleted_at IS NULL
        GROUP BY s.group_id, s.from_user_id, s.to_user_id, s.currency
    ),
    pair_combos AS (
        SELECT group_id, debtor, creditor, currency FROM expense_debts
        UNION SELECT group_id, creditor, debtor, currency FROM expense_debts
        UNION SELECT group_id, debtor, creditor, currency FROM settlement_debts
        UNION SELECT group_id, creditor, debtor, currency FROM settlement_debts
    ),
    directed_net AS (
        SELECT pc.group_id, pc.debtor, pc.creditor, pc.currency,
            COALESCE((SELECT ed.amount FROM expense_debts ed
                      WHERE ed.group_id = pc.group_id
                        AND ed.debtor = pc.debtor
                        AND ed.creditor = pc.creditor
                        AND ed.currency = pc.currency), 0)
          - COALESCE((SELECT sd.amount FROM settlement_debts sd
                      WHERE sd.group_id = pc.group_id
                        AND sd.debtor = pc.debtor
                        AND sd.creditor = pc.creditor
                        AND sd.currency = pc.currency), 0)
            AS gross
        FROM pair_combos pc
    ),
    pair_net AS (
        SELECT dn.group_id,
               LEAST(dn.debtor, dn.creditor) AS u_lo,
               GREATEST(dn.debtor, dn.creditor) AS u_hi,
               dn.currency,
               SUM(CASE WHEN dn.debtor < dn.creditor THEN dn.gross ELSE -dn.gross END) AS lo_to_hi
        FROM directed_net dn
        GROUP BY dn.group_id,
                 LEAST(dn.debtor, dn.creditor),
                 GREATEST(dn.debtor, dn.creditor),
                 dn.currency
    ),
    user_pairwise AS (
        SELECT pn.group_id, pn.currency,
            -- net_user > 0 → user is owed; < 0 → user owes
            CASE WHEN pn.u_hi = p_user_id THEN pn.lo_to_hi ELSE -pn.lo_to_hi END AS net_user
        FROM pair_net pn
        WHERE ABS(pn.lo_to_hi) >= 0.01
          AND (pn.u_lo = p_user_id OR pn.u_hi = p_user_id)
    ),
    per_currency AS (
        SELECT currency,
            SUM(CASE WHEN net_user > 0 THEN net_user ELSE 0 END) AS owed,
            SUM(CASE WHEN net_user < 0 THEN -net_user ELSE 0 END) AS owe
        FROM user_pairwise
        GROUP BY currency
        HAVING SUM(CASE WHEN net_user > 0 THEN net_user ELSE 0 END) >= 0.01
            OR SUM(CASE WHEN net_user < 0 THEN -net_user ELSE 0 END) >= 0.01
    ),
    -- One row per group: the largest-magnitude currency dominates the chip.
    by_group_picked AS (
        SELECT DISTINCT ON (group_id)
            group_id, currency, net_user
        FROM user_pairwise
        ORDER BY group_id, ABS(net_user) DESC
    )
    SELECT
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'currency', currency,
                    'owed', ROUND(owed::numeric, 2),
                    'owe', ROUND(owe::numeric, 2),
                    'net', ROUND((owed - owe)::numeric, 2)
                )
                ORDER BY currency
            ) FROM per_currency),
            '[]'::jsonb
        ),
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'groupId', group_id,
                    'currency', currency,
                    'net', ROUND(net_user::numeric, 2)
                )
                ORDER BY ABS(net_user) DESC
            ) FROM by_group_picked),
            '[]'::jsonb
        )
    INTO v_summary, v_by_group;

    RETURN jsonb_build_object('summary', v_summary, 'byGroup', v_by_group);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_balance_summary(UUID) TO authenticated;
