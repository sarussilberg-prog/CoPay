-- Idempotent: profile dashboard RPC (fixes REST 404 on /rpc/get_user_dashboard)
-- Apply: supabase db query --linked -f supabase/get-user-dashboard.sql

CREATE OR REPLACE FUNCTION get_user_dashboard(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_default_currency TEXT;
    v_by_currency JSONB;
    v_total_owed NUMERIC;
    v_total_owed_to_user NUMERIC;
    v_friends JSONB;
    v_stats JSONB;
    v_currency_count INT;
BEGIN
    SELECT COALESCE(default_currency, 'ILS') INTO v_default_currency FROM profiles WHERE id = p_user_id;
    IF v_default_currency IS NULL THEN v_default_currency := 'ILS'; END IF;

    WITH user_groups AS (
        SELECT gm.group_id, g.default_currency
        FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    user_paid AS (
        SELECT e.group_id, SUM(e.amount) AS amount FROM expenses e
        WHERE e.paid_by = p_user_id AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_owed AS (
        SELECT e.group_id, SUM(es.amount) AS amount
        FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
        WHERE es.user_id = p_user_id AND e.is_deleted = FALSE
          AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id
    ),
    user_settled_received AS (
        SELECT group_id, SUM(amount) AS amount FROM settlements
        WHERE to_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    user_settled_paid AS (
        SELECT group_id, SUM(amount) AS amount FROM settlements
        WHERE from_user_id = p_user_id AND group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id
    ),
    per_group AS (
        SELECT
            ug.group_id, ug.default_currency AS currency,
            COALESCE(up.amount, 0) - COALESCE(uo.amount, 0)
              + COALESCE(usr.amount, 0) - COALESCE(usp.amount, 0) AS net_balance
        FROM user_groups ug
        LEFT JOIN user_paid up ON up.group_id = ug.group_id
        LEFT JOIN user_owed uo ON uo.group_id = ug.group_id
        LEFT JOIN user_settled_received usr ON usr.group_id = ug.group_id
        LEFT JOIN user_settled_paid usp ON usp.group_id = ug.group_id
    ),
    per_currency AS (
        SELECT currency,
            SUM(CASE WHEN net_balance < 0 THEN -net_balance ELSE 0 END) AS owed,
            SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END) AS owed_to_user
        FROM per_group GROUP BY currency
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'currency', currency,
            'owed', ROUND(owed::numeric, 2),
            'owedToUser', ROUND(owed_to_user::numeric, 2)
        )), '[]'::jsonb),
        COUNT(*)
    INTO v_by_currency, v_currency_count
    FROM per_currency;

    IF v_currency_count = 1 THEN
        SELECT
            (elem->>'owed')::numeric,
            (elem->>'owedToUser')::numeric
        INTO v_total_owed, v_total_owed_to_user
        FROM jsonb_array_elements(v_by_currency) elem
        LIMIT 1;
    ELSE
        v_total_owed := NULL;
        v_total_owed_to_user := NULL;
    END IF;

    WITH user_groups AS (
        SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    gma AS (
        SELECT gm.group_id, gm.user_id FROM group_members gm
        WHERE gm.is_active = TRUE AND gm.group_id IN (SELECT group_id FROM user_groups)
    ),
    mp AS (
        SELECT e.group_id, e.paid_by AS user_id, SUM(e.amount) AS amount
        FROM expenses e
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id, e.paid_by
    ),
    mo AS (
        SELECT e.group_id, es.user_id, SUM(es.amount) AS amount
        FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups)
        GROUP BY e.group_id, es.user_id
    ),
    msr AS (
        SELECT group_id, to_user_id AS user_id, SUM(amount) AS amount
        FROM settlements
        WHERE group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id, to_user_id
    ),
    msp AS (
        SELECT group_id, from_user_id AS user_id, SUM(amount) AS amount
        FROM settlements
        WHERE group_id IN (SELECT group_id FROM user_groups)
        GROUP BY group_id, from_user_id
    ),
    member_bal AS (
        SELECT gma.group_id, gma.user_id,
            COALESCE(mp.amount, 0) - COALESCE(mo.amount, 0)
              + COALESCE(msr.amount, 0) - COALESCE(msp.amount, 0) AS net
        FROM gma
        LEFT JOIN mp ON mp.group_id = gma.group_id AND mp.user_id = gma.user_id
        LEFT JOIN mo ON mo.group_id = gma.group_id AND mo.user_id = gma.user_id
        LEFT JOIN msr ON msr.group_id = gma.group_id AND msr.user_id = gma.user_id
        LEFT JOIN msp ON msp.group_id = gma.group_id AND msp.user_id = gma.user_id
    ),
    group_status AS (
        SELECT group_id, BOOL_AND(ABS(net) < 0.01) AS is_closed FROM member_bal GROUP BY group_id
    )
    SELECT jsonb_build_object(
        'closedGroupsCount', COALESCE(COUNT(*) FILTER (WHERE is_closed), 0),
        'activeGroupsCount', COALESCE(COUNT(*) FILTER (WHERE NOT is_closed), 0)
    ) INTO v_stats FROM group_status;

    WITH user_groups_in_default AS (
        SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE
          AND g.is_active = TRUE AND g.default_currency = v_default_currency
    ),
    gma AS (
        SELECT gm.group_id, gm.user_id FROM group_members gm
        WHERE gm.is_active = TRUE AND gm.group_id IN (SELECT group_id FROM user_groups_in_default)
    ),
    mp AS (
        SELECT e.group_id, e.paid_by AS user_id, SUM(e.amount) AS amount
        FROM expenses e
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups_in_default)
        GROUP BY e.group_id, e.paid_by
    ),
    mo AS (
        SELECT e.group_id, es.user_id, SUM(es.amount) AS amount
        FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups_in_default)
        GROUP BY e.group_id, es.user_id
    ),
    msr AS (
        SELECT group_id, to_user_id AS user_id, SUM(amount) AS amount
        FROM settlements
        WHERE group_id IN (SELECT group_id FROM user_groups_in_default)
        GROUP BY group_id, to_user_id
    ),
    msp AS (
        SELECT group_id, from_user_id AS user_id, SUM(amount) AS amount
        FROM settlements
        WHERE group_id IN (SELECT group_id FROM user_groups_in_default)
        GROUP BY group_id, from_user_id
    ),
    member_bal AS (
        SELECT gma.group_id, gma.user_id,
            COALESCE(mp.amount, 0) - COALESCE(mo.amount, 0)
              + COALESCE(msr.amount, 0) - COALESCE(msp.amount, 0) AS net
        FROM gma
        LEFT JOIN mp ON mp.group_id = gma.group_id AND mp.user_id = gma.user_id
        LEFT JOIN mo ON mo.group_id = gma.group_id AND mo.user_id = gma.user_id
        LEFT JOIN msr ON msr.group_id = gma.group_id AND msr.user_id = gma.user_id
        LEFT JOIN msp ON msp.group_id = gma.group_id AND msp.user_id = gma.user_id
    ),
    co_members AS (
        SELECT DISTINCT gm.user_id FROM group_members gm
        WHERE gm.group_id IN (SELECT group_id FROM user_groups_in_default)
          AND gm.is_active = TRUE AND gm.user_id <> p_user_id
    ),
    pair_per_group AS (
        SELECT
            mb_friend.user_id AS friend_id,
            mb_friend.group_id,
            mb_friend.net AS friend_net,
            mb_user.net AS user_net
        FROM co_members cm
        JOIN member_bal mb_friend ON mb_friend.user_id = cm.user_id
        JOIN member_bal mb_user
            ON mb_user.group_id = mb_friend.group_id
           AND mb_user.user_id = p_user_id
    ),
    friend_totals AS (
        SELECT friend_id,
            SUM(LEAST(GREATEST(user_net, 0), GREATEST(-friend_net, 0)))
              - SUM(LEAST(GREATEST(-user_net, 0), GREATEST(friend_net, 0))) AS net_toward_user,
            ARRAY_AGG(DISTINCT group_id) AS shared_group_ids
        FROM pair_per_group
        GROUP BY friend_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', ft.friend_id,
        'name', p.name,
        'avatarUrl', p.avatar_url,
        'netBalance', ROUND(ft.net_toward_user::numeric, 2),
        'currency', v_default_currency,
        'sharedGroupIds', ft.shared_group_ids
    )), '[]'::jsonb) INTO v_friends
    FROM friend_totals ft JOIN profiles p ON p.id = ft.friend_id
    WHERE ABS(ft.net_toward_user) >= 0.01;

    RETURN jsonb_build_object(
        'balanceSummary', jsonb_build_object(
            'totalOwed', v_total_owed,
            'totalOwedToUser', v_total_owed_to_user,
            'defaultCurrency', v_default_currency,
            'byCurrency', v_by_currency
        ),
        'stats', v_stats,
        'friends', COALESCE(v_friends, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_dashboard(UUID) TO authenticated;
