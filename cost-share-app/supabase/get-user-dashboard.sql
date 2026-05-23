-- Idempotent: profile dashboard RPC.
-- Totals, byCurrency, active/closed counts, AND friend balances all derive
-- from the same pairwise-debt logic as get_group_pairwise_debts so the profile
-- summary matches the Settle Up screen exactly.
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
    v_active_count INT;
    v_closed_count INT;
BEGIN
    SELECT COALESCE(default_currency, 'ILS') INTO v_default_currency FROM profiles WHERE id = p_user_id;
    IF v_default_currency IS NULL THEN v_default_currency := 'ILS'; END IF;

    -- Single pairwise-debt computation feeds totals, stats, and friends.
    WITH user_groups AS (
        SELECT gm.group_id
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
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
        UNION
        SELECT group_id, creditor, debtor, currency FROM expense_debts
        UNION
        SELECT group_id, debtor, creditor, currency FROM settlement_debts
        UNION
        SELECT group_id, creditor, debtor, currency FROM settlement_debts
    ),
    directed_net AS (
        SELECT
            pc.group_id, pc.debtor, pc.creditor, pc.currency,
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
        SELECT
            dn.group_id,
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
        SELECT
            pn.group_id,
            pn.currency,
            CASE WHEN pn.lo_to_hi > 0 THEN pn.u_lo ELSE pn.u_hi END AS from_user_id,
            CASE WHEN pn.lo_to_hi > 0 THEN pn.u_hi ELSE pn.u_lo END AS to_user_id,
            ABS(pn.lo_to_hi) AS amount,
            CASE WHEN pn.u_lo = p_user_id THEN pn.u_hi ELSE pn.u_lo END AS friend_id,
            -- net_toward_user > 0 → friend owes user; < 0 → user owes friend
            CASE WHEN pn.u_lo = p_user_id THEN -pn.lo_to_hi ELSE pn.lo_to_hi END AS net_toward_user
        FROM pair_net pn
        WHERE ABS(pn.lo_to_hi) >= 0.01
          AND (pn.u_lo = p_user_id OR pn.u_hi = p_user_id)
    ),
    per_currency AS (
        SELECT currency,
            SUM(CASE WHEN from_user_id = p_user_id THEN amount ELSE 0 END) AS owed,
            SUM(CASE WHEN to_user_id   = p_user_id THEN amount ELSE 0 END) AS owed_to_user
        FROM user_pairwise
        GROUP BY currency
    ),
    by_currency_agg AS (
        SELECT
            COALESCE(jsonb_agg(jsonb_build_object(
                'currency', currency,
                'owed', ROUND(owed::numeric, 2),
                'owedToUser', ROUND(owed_to_user::numeric, 2)
            )), '[]'::jsonb) AS by_currency_json,
            COUNT(*) AS currency_count
        FROM per_currency
    ),
    counts AS (
        SELECT
            (SELECT COUNT(DISTINCT group_id) FROM user_pairwise) AS active_count,
            (SELECT COUNT(*) FROM user_groups)
              - (SELECT COUNT(DISTINCT group_id) FROM user_pairwise) AS closed_count
    ),
    friend_by_currency AS (
        SELECT friend_id, currency,
            SUM(net_toward_user) AS net_toward_user,
            ARRAY_AGG(DISTINCT group_id) AS group_ids
        FROM user_pairwise
        GROUP BY friend_id, currency
        HAVING ABS(SUM(net_toward_user)) >= 0.01
    ),
    friends_merged AS (
        SELECT fbc.friend_id,
            jsonb_agg(
                jsonb_build_object(
                    'currency', fbc.currency,
                    'netBalance', ROUND(fbc.net_toward_user::numeric, 2)
                )
                ORDER BY fbc.currency
            ) AS by_currency,
            (
                SELECT ARRAY_AGG(DISTINCT gid ORDER BY gid)
                FROM friend_by_currency f2, unnest(f2.group_ids) AS gid
                WHERE f2.friend_id = fbc.friend_id
            ) AS shared_group_ids
        FROM friend_by_currency fbc
        GROUP BY fbc.friend_id
    ),
    friends_agg AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'userId', fm.friend_id,
            'name', p.name,
            'avatarUrl', p.avatar_url,
            'isActive', p.is_active,
            'byCurrency', fm.by_currency,
            'sharedGroupIds', fm.shared_group_ids
        ) ORDER BY p.name), '[]'::jsonb) AS friends_json
        FROM friends_merged fm JOIN profiles p ON p.id = fm.friend_id
    )
    SELECT
        b.by_currency_json,
        b.currency_count,
        c.active_count,
        c.closed_count,
        f.friends_json
    INTO v_by_currency, v_currency_count, v_active_count, v_closed_count, v_friends
    FROM by_currency_agg b, counts c, friends_agg f;

    IF v_currency_count = 1 THEN
        SELECT
            (elem->>'owed')::numeric,
            (elem->>'owedToUser')::numeric
        INTO v_total_owed, v_total_owed_to_user
        FROM jsonb_array_elements(v_by_currency) elem
        LIMIT 1;
    ELSIF v_currency_count = 0 THEN
        v_total_owed := 0;
        v_total_owed_to_user := 0;
    ELSE
        v_total_owed := NULL;
        v_total_owed_to_user := NULL;
    END IF;

    v_stats := jsonb_build_object(
        'closedGroupsCount', COALESCE(v_closed_count, 0),
        'activeGroupsCount', COALESCE(v_active_count, 0)
    );

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
