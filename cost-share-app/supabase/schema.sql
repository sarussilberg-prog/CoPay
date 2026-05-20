-- Cost-Share App schema (Supabase)
-- Paste into Supabase SQL Editor. Mobile app uses anon key + user JWT (RLS enforced).

-- ============================================
-- CLEAN SLATE (dev convenience, comment out for prod)
-- ============================================
DROP TABLE IF EXISTS settlements CASCADE;
DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(20),
    default_currency VARCHAR(3) DEFAULT 'ILS',
    language VARCHAR(5) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    group_type VARCHAR(50) DEFAULT 'general',
    default_currency VARCHAR(3) DEFAULT 'ILS',
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_is_active ON groups(is_active);

CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(group_id, user_id)
);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_active ON group_members(group_id, is_active);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ILS',
    category VARCHAR(50),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_url TEXT,
    paid_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_active ON expenses(group_id, is_deleted);

CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(expense_id, user_id)
);
CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);

CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ILS',
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (from_user_id != to_user_id)
);
CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX idx_settlements_to_user ON settlements(to_user_id);
CREATE INDEX idx_settlements_date ON settlements(settlement_date);
CREATE INDEX idx_settlements_active ON settlements(group_id) WHERE deleted_at IS NULL;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settlements_updated_at BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

-- handle_new_user runs only via the on_auth_user_created trigger; block RPC exposure.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS helpers (SECURITY DEFINER — avoids infinite recursion on group_members)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_group_member(check_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members
        WHERE group_id = check_group_id
          AND user_id = auth.uid()
          AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.is_group_creator(check_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.groups
        WHERE id = check_group_id
          AND created_by = auth.uid()
    );
$$;

-- anon needs EXECUTE so RLS policies can evaluate (returns false when auth.uid() is null).
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_creator(uuid) TO anon, authenticated;

-- ============================================
-- ROW LEVEL SECURITY (mobile + web clients)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view their groups" ON groups
    FOR SELECT USING (public.is_group_member(id));
CREATE POLICY "Users can create groups" ON groups
    FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Group members can update their groups" ON groups
    FOR UPDATE USING (public.is_group_member(id));

CREATE POLICY "Users can view group members" ON group_members
    FOR SELECT USING (
        user_id = auth.uid() OR public.is_group_member(group_id)
    );
CREATE POLICY "Users can insert group members" ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR public.is_group_creator(group_id)
        OR public.is_group_member(group_id)
    );
CREATE POLICY "Users can update group members" ON group_members
    FOR UPDATE USING (public.is_group_member(group_id));

CREATE POLICY "Users can view group expenses" ON expenses
    FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Users can create expenses in their groups" ON expenses
    FOR INSERT WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Users can update group expenses" ON expenses
    FOR UPDATE USING (public.is_group_member(group_id));

CREATE POLICY "Users can view expense splits in their groups" ON expense_splits
    FOR SELECT USING (
        expense_id IN (
            SELECT e.id FROM expenses e
            WHERE public.is_group_member(e.group_id)
        )
    );
CREATE POLICY "Users can insert expense splits" ON expense_splits
    FOR INSERT WITH CHECK (
        expense_id IN (
            SELECT e.id FROM expenses e
            WHERE public.is_group_member(e.group_id)
        )
    );
CREATE POLICY "Users can delete expense splits" ON expense_splits
    FOR DELETE USING (
        expense_id IN (
            SELECT e.id FROM expenses e
            WHERE public.is_group_member(e.group_id)
        )
    );

CREATE POLICY "Users can view settlements in their groups" ON settlements
    FOR SELECT USING (public.is_group_member(group_id) AND deleted_at IS NULL);
CREATE POLICY "Users can create settlements in their groups" ON settlements
    FOR INSERT WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Group members can update settlements" ON settlements
    FOR UPDATE USING (public.is_group_member(group_id));
CREATE POLICY "Either party can delete settlement" ON settlements
    FOR DELETE USING (
        public.is_group_member(group_id)
        AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    );

-- ============================================
-- DASHBOARD RPC
-- ============================================

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

    -- Pairwise-debt aggregation (matches Settle Up screen).
    -- Drives both per-currency totals AND active/closed group counts.
    WITH user_groups AS (
        SELECT gm.group_id
        FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    expense_debts AS (
        SELECT e.group_id, es.user_id AS debtor, e.paid_by AS creditor, e.currency,
               SUM(es.amount) AS amount
        FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
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

    -- Headlines only when single-currency
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

    -- Stats: a group is "closed" when the user has no pairwise debts in it
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

-- ============================================
-- BALANCE SUMMARY RPC (groups list chips + filters)
-- ============================================

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
    by_group_picked AS (
        SELECT DISTINCT ON (group_id)
            group_id, currency, net_user
        FROM user_pairwise
        ORDER BY group_id, ABS(net_user) DESC
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
                        'net', ROUND(net_user::numeric, 2)
                    )
                    ORDER BY ABS(net_user) DESC
                )
                FROM by_group_picked
            ),
            '[]'::jsonb
        )
    INTO v_summary, v_by_group;

    RETURN jsonb_build_object('summary', v_summary, 'byGroup', v_by_group);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_balance_summary(UUID) TO authenticated;

-- ============================================
-- ACCOUNT DEACTIVATION (soft delete)
-- ============================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
    ON profiles(is_active) WHERE is_active = FALSE;

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles
        SET is_active = FALSE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = auth.uid()
          AND is_active = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
