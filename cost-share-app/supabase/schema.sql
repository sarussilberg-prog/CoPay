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
CREATE POLICY "Group creators can update their groups" ON groups
    FOR UPDATE USING (auth.uid() = created_by);

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
CREATE POLICY "Either party can update settlement" ON settlements
    FOR UPDATE USING (
        public.is_group_member(group_id)
        AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    );
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
BEGIN
    SELECT COALESCE(default_currency, 'ILS') INTO v_default_currency FROM profiles WHERE id = p_user_id;
    IF v_default_currency IS NULL THEN v_default_currency := 'ILS'; END IF;

    -- Per-currency totals for the user across their active groups
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

    -- Headlines only when single-currency (reuse v_by_currency — no duplicate balance scan)
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

    -- Stats: closed (all active members net=0) vs active
    WITH user_groups AS (
        SELECT gm.group_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = p_user_id AND gm.is_active = TRUE AND g.is_active = TRUE
    ),
    gma AS (
        SELECT gm.group_id, gm.user_id FROM group_members gm
        WHERE gm.is_active = TRUE AND gm.group_id IN (SELECT group_id FROM user_groups)
    ),
    mp AS (SELECT e.group_id, e.paid_by AS user_id, SUM(e.amount) AS amount FROM expenses e WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id, e.paid_by),
    mo AS (SELECT e.group_id, es.user_id, SUM(es.amount) AS amount FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT group_id FROM user_groups) GROUP BY e.group_id, es.user_id),
    msr AS (SELECT group_id, to_user_id AS user_id, SUM(amount) AS amount FROM settlements WHERE group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id, to_user_id),
    msp AS (SELECT group_id, from_user_id AS user_id, SUM(amount) AS amount FROM settlements WHERE group_id IN (SELECT group_id FROM user_groups) GROUP BY group_id, from_user_id),
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

    -- Friends (only groups in user's defaultCurrency) — join-based pair balances
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
            -- Per group: if user is owed and friend owes → allocate min as friend-owes-user
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
