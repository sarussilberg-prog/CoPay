-- Idempotent: per-group balance summary for the groups list (BalanceChip + filters)
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
        SELECT gm.group_id, g.default_currency
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id
          AND gm.is_active = TRUE
          AND g.is_active = TRUE
    ),
    user_paid AS (
        SELECT e.group_id, SUM(e.amount) AS amount
        FROM expenses e
        WHERE e.paid_by = p_user_id
          AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_owed AS (
        SELECT e.group_id, SUM(es.amount) AS amount
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE es.user_id = p_user_id
          AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_settled_received AS (
        SELECT group_id, SUM(amount) AS amount
        FROM settlements
        WHERE to_user_id = p_user_id
          AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    user_settled_paid AS (
        SELECT group_id, SUM(amount) AS amount
        FROM settlements
        WHERE from_user_id = p_user_id
          AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    per_group AS (
        SELECT
            ug.group_id,
            ug.default_currency AS currency,
            -- Net positive = user is owed money in this group.
            -- Expenses paid increase the credit; splits owed decrease it.
            -- A settlement received means the user collected on a credit (decrease net),
            -- a settlement paid means the user paid down a debt (increase net).
            COALESCE(up.amount, 0) - COALESCE(uo.amount, 0)
              - COALESCE(usr.amount, 0) + COALESCE(usp.amount, 0) AS net_balance
        FROM user_groups ug
        LEFT JOIN user_paid up ON up.group_id = ug.group_id
        LEFT JOIN user_owed uo ON uo.group_id = ug.group_id
        LEFT JOIN user_settled_received usr ON usr.group_id = ug.group_id
        LEFT JOIN user_settled_paid usp ON usp.group_id = ug.group_id
    ),
    per_currency AS (
        SELECT
            currency,
            SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END) AS owed,
            SUM(CASE WHEN net_balance < 0 THEN -net_balance ELSE 0 END) AS owe
        FROM per_group
        GROUP BY currency
        HAVING SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END) >= 0.01
            OR SUM(CASE WHEN net_balance < 0 THEN -net_balance ELSE 0 END) >= 0.01
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'currency', currency,
                        'owed', ROUND(owed::numeric, 2),
                        'owe', ROUND(owe::numeric, 2),
                        'net', ROUND((owed - owe)::numeric, 2)
                    )
                    ORDER BY currency
                )
                FROM per_currency
            ),
            '[]'::jsonb
        ),
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'groupId', group_id,
                        'currency', currency,
                        'net', ROUND(net_balance::numeric, 2)
                    )
                    ORDER BY ABS(net_balance) DESC
                )
                FROM per_group
                WHERE ABS(net_balance) >= 0.01
            ),
            '[]'::jsonb
        )
    INTO v_summary, v_by_group;

    RETURN jsonb_build_object('summary', v_summary, 'byGroup', v_by_group);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_balance_summary(UUID) TO authenticated;
