-- =============================================================================
-- 20260610120000_reconcile_prod_drift.sql
--
-- WHY THIS EXISTS
-- ---------------
-- The production project (jfqxjjjbpxbwwvoygahu) drifted from dev:
--   * invite-links.sql and settle-up-v1.sql were one-off files that were only
--     ever MCP-applied to dev and NEVER turned into migrations, so the prod
--     deploy pipeline never created them.
--   * Migrations 20260602135000_group_archive / 20260602140000_admin_platform_metrics
--     / 20260602163000_optimize_get_user_dashboard were recorded in prod's
--     migration history as "applied" by the old CI step `mark_local_applied`
--     (supabase-ci-db-push.sh) WITHOUT their SQL ever running. So their objects
--     (archive columns/funcs, admin metrics, optimized dashboard) are missing on
--     prod even though `supabase migration list` claims they are applied — and a
--     normal `db push` will SKIP them because the history says "done".
--
-- Verified absent on prod 2026-06-10: get_group_pairwise_debts, all invite
-- rotate/redeem funcs, profiles.invite_token, groups.invite_token, archive_group,
-- unarchive_group, group_is_auto_archived, admin_get_platform_metrics, and the
-- groups archive columns. The app calls all of these → group/friend invite links,
-- Settle Up, and group archive are broken in prod.
--
-- WHAT THIS DOES
-- --------------
-- Re-applies, in dependency order, the full DDL for every drifted feature. Every
-- statement is idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP ... IF EXISTS
-- + backfill before SET NOT NULL), so it is a safe no-op on dev (which already
-- has everything) and a clean install on prod. This migration is the source of
-- truth that closes the drift; pair it with the supabase-ci-db-push.sh fix that
-- removes the blanket mark_local_applied step.
--
-- Content is concatenated verbatim from the already-idempotent sources:
--   1. supabase/invite-links.sql            (BEGIN;/COMMIT; stripped — runs atomically)
--   2. supabase/settle-up-v1.sql
--   3. migrations/20260602135000_group_archive.sql
--   4. migrations/20260602140000_admin_platform_metrics.sql   (needs groups.last_activity_at → after #3)
--   5. migrations/20260602163000_optimize_get_user_dashboard.sql
-- =============================================================================


-- ======================= 1/5 : invite links (group + friend) =======================
-- source: supabase/invite-links.sql
-- Invitations & Sharing — schema, backfill, trigger, helper.
-- See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md
-- Idempotent: safe to re-run.


-- ------------------------------------------------------------
-- Helper: generate_invite_token
-- ------------------------------------------------------------
-- Returns a 10-char URL-safe slug. Uses pgcrypto for randomness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgcrypto's gen_random_bytes lives in the `extensions` schema on Supabase,
-- but the SECURITY DEFINER callers below pin search_path = public. Qualify
-- the call explicitly so the function resolves regardless of search_path.
CREATE OR REPLACE FUNCTION generate_invite_token() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    v_len      INT  := length(v_alphabet);  -- 64
    v_token    TEXT := '';
    v_byte     INT;
    i          INT;
BEGIN
    FOR i IN 1..10 LOOP
        v_byte := get_byte(extensions.gen_random_bytes(1), 0);
        v_token := v_token || substr(v_alphabet, (v_byte % v_len) + 1, 1);
    END LOOP;
    RETURN v_token;
END;
$$;

-- ------------------------------------------------------------
-- profiles.invite_token
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Backfill existing rows
UPDATE profiles SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

-- Enforce constraints
ALTER TABLE profiles ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_invite_token_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_invite_token_unique UNIQUE (invite_token);

-- Default on insert via trigger (column-level DEFAULT can't call a VOLATILE func with the SECURITY guard we want)
CREATE OR REPLACE FUNCTION default_profile_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_profile_invite_token ON profiles;
CREATE TRIGGER trg_default_profile_invite_token
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION default_profile_invite_token();

-- ------------------------------------------------------------
-- groups.invite_token
-- ------------------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT;

UPDATE groups SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

ALTER TABLE groups ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_invite_token_unique;
ALTER TABLE groups ADD CONSTRAINT groups_invite_token_unique UNIQUE (invite_token);

CREATE OR REPLACE FUNCTION default_group_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_group_invite_token ON groups;
CREATE TRIGGER trg_default_group_invite_token
    BEFORE INSERT ON groups
    FOR EACH ROW EXECUTE FUNCTION default_group_invite_token();



-- ============================================================
-- RPC: get_invite_preview(p_token TEXT) RETURNS JSON
-- Public read for the Edge Function. Does not echo back the token.
-- ============================================================
CREATE OR REPLACE FUNCTION get_invite_preview(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_profile RECORD;
    v_group RECORD;
    v_members JSON;
    v_count INT;
BEGIN
    -- Try friend invite first
    SELECT id, name, avatar_url INTO v_profile
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'kind', 'friend',
            'inviter', json_build_object(
                'id', v_profile.id,
                'name', v_profile.name,
                'avatar_url', v_profile.avatar_url
            )
        );
    END IF;

    -- Try group invite
    SELECT g.id, g.name, g.default_currency
    INTO v_group
    FROM groups g
    WHERE g.invite_token = p_token AND g.is_active = true
    LIMIT 1;

    IF FOUND THEN
        SELECT COUNT(*) INTO v_count
        FROM group_members gm
        WHERE gm.group_id = v_group.id AND gm.is_active = true;

        SELECT json_agg(member_data ORDER BY member_data->>'name')
        INTO v_members
        FROM (
            SELECT json_build_object(
                'id', p.id,
                'name', p.name,
                'avatar_url', p.avatar_url
            ) AS member_data
            FROM group_members gm
            JOIN profiles p ON p.id = gm.user_id
            WHERE gm.group_id = v_group.id AND gm.is_active = true
            LIMIT 6
        ) m;

        RETURN json_build_object(
            'kind', 'group',
            'group', json_build_object(
                'id', v_group.id,
                'name', v_group.name,
                'currency', v_group.default_currency,
                'member_count', v_count,
                'members', COALESCE(v_members, '[]'::json)
            )
        );
    END IF;

    RETURN json_build_object('kind', 'invalid');
END;
$$;

-- ============================================================
-- RPC: redeem_friend_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_friend_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_inviter_id UUID;
    v_inviter_name TEXT;
    v_a UUID;
    v_b UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_inviter_id, v_inviter_name
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;
    IF v_inviter_id = v_me THEN
        RAISE EXCEPTION 'cannot_self_invite';
    END IF;

    -- Canonical pair (smaller UUID first)
    IF v_me < v_inviter_id THEN
        v_a := v_me; v_b := v_inviter_id;
    ELSE
        v_a := v_inviter_id; v_b := v_me;
    END IF;

    INSERT INTO friendships (user_a_id, user_b_id, source)
    VALUES (v_a, v_b, 'request')
    ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

    -- Clear any friend_blocks in either direction
    DELETE FROM friend_blocks
    WHERE (user_id = v_me AND blocked_user_id = v_inviter_id)
       OR (user_id = v_inviter_id AND blocked_user_id = v_me);

    RETURN json_build_object(
        'friend_id', v_inviter_id,
        'friend_name', v_inviter_name
    );
END;
$$;

-- ============================================================
-- RPC: redeem_group_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_group_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_group_id UUID;
    v_group_name TEXT;
    v_already BOOLEAN;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_group_id, v_group_name
    FROM groups WHERE invite_token = p_token AND is_active = true LIMIT 1;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_group_id AND user_id = v_me AND is_active = true
    ) INTO v_already;

    IF v_already THEN
        RETURN json_build_object(
            'group_id', v_group_id,
            'group_name', v_group_name,
            'already_member', true
        );
    END IF;

    -- Reactivate a previous row if it exists, else insert
    UPDATE group_members SET is_active = true, left_at = NULL, joined_at = now()
    WHERE group_id = v_group_id AND user_id = v_me;

    IF NOT FOUND THEN
        INSERT INTO group_members (group_id, user_id, is_active)
        VALUES (v_group_id, v_me, true);
    END IF;

    -- The existing on_group_member_insert_auto_friend trigger handles friendships.

    RETURN json_build_object(
        'group_id', v_group_id,
        'group_name', v_group_name,
        'already_member', false
    );
END;
$$;

-- ============================================================
-- RPC: rotate_friend_invite() RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_friend_invite() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    v_new := generate_invite_token();
    UPDATE profiles SET invite_token = v_new WHERE id = v_me;
    RETURN v_new;
END;
$$;

-- ============================================================
-- RPC: rotate_group_invite(p_group_id UUID) RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_group_invite(p_group_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_member BOOLEAN;
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = v_me AND is_active = true
    ) INTO v_member;

    IF NOT v_member THEN
        RAISE EXCEPTION 'not_group_member';
    END IF;

    v_new := generate_invite_token();
    UPDATE groups SET invite_token = v_new WHERE id = p_group_id;
    RETURN v_new;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
-- Public read: get_invite_preview is callable by anon for the Edge Function.
GRANT EXECUTE ON FUNCTION get_invite_preview(TEXT) TO anon, authenticated;

-- Authenticated only: revoke all (PUBLIC, anon, authenticated) first, then grant only to authenticated.
REVOKE EXECUTE ON FUNCTION redeem_friend_invite(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION redeem_group_invite(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rotate_friend_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rotate_group_invite(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION redeem_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_group_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_friend_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_group_invite(UUID) TO authenticated;


-- ======================= 2/5 : settle up (pairwise debts) =======================
-- source: supabase/settle-up-v1.sql
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

-- ======================= 3/5 : group archive =======================
-- source: migrations/20260602135000_group_archive.sql
-- =============================================================================
-- 20260602135000_group_archive.sql
-- Per-user archive mechanism + group-wide auto-archive support.
--
-- Migration copy of cost-share-app/supabase/group-archive.sql (the one-off file
-- was already MCP-applied to dev; this migration ensures the prod deploy
-- pipeline applies the same DDL before 20260602140000_admin_platform_metrics,
-- which depends on groups.last_activity_at and the group_user_archive table.
--
-- Implements docs/archive-mechanism-plan.md:
--   * group_user_archive table (Type 2 — manual, per-user)
--   * groups.last_activity_at column + maintenance trigger
--     (powers Type 1 — auto-archive, group-wide, UI-only)
--   * archive_group / unarchive_group RPCs
--   * cascade-clear trigger that removes a user's manual archive row
--     whenever they're involved in a new qualifying action.
--
-- Idempotent: safe to re-run. Every CREATE uses IF NOT EXISTS / CREATE OR
-- REPLACE; every DROP uses IF EXISTS. The backfill UPDATE is a no-op on
-- subsequent runs because the column already has the correct value.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. group_user_archive table (Type 2 — manual archive, per-user)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS group_user_archive (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_user_archive_user
    ON group_user_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_group_user_archive_group
    ON group_user_archive(group_id);

ALTER TABLE group_user_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own archive rows" ON group_user_archive;
CREATE POLICY "Users can view their own archive rows" ON group_user_archive
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own archive rows" ON group_user_archive;
CREATE POLICY "Users can insert their own archive rows" ON group_user_archive
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own archive rows" ON group_user_archive;
CREATE POLICY "Users can delete their own archive rows" ON group_user_archive
    FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. groups.last_activity_at (powers Type 1 — auto-archive)
-- ---------------------------------------------------------------------------

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_groups_last_activity_at
    ON groups(last_activity_at);

-- Backfill from the latest qualifying-action timestamp across the source
-- tables. Falls back to created_at when a group has no activity yet.
DO $$
BEGIN
    IF to_regclass('public.group_messages') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE groups g
            SET last_activity_at = COALESCE(
                (
                    SELECT MAX(t) FROM (
                        SELECT MAX(updated_at) AS t FROM expenses WHERE group_id = g.id
                        UNION ALL
                        SELECT MAX(updated_at) FROM settlements WHERE group_id = g.id
                        UNION ALL
                        SELECT MAX(created_at) FROM group_messages WHERE group_id = g.id
                    ) s
                ),
                g.created_at
            )
        $sql$;
    ELSE
        UPDATE groups g
        SET last_activity_at = COALESCE(
            (
                SELECT MAX(t) FROM (
                    SELECT MAX(updated_at) AS t FROM expenses WHERE group_id = g.id
                    UNION ALL
                    SELECT MAX(updated_at) FROM settlements WHERE group_id = g.id
                ) s
            ),
            g.created_at
        );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger: bump_group_last_activity()
--    Maintain groups.last_activity_at on every qualifying action.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bump_group_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id UUID;
BEGIN
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    IF v_group_id IS NOT NULL THEN
        UPDATE groups SET last_activity_at = NOW() WHERE id = v_group_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_group_last_activity_on_expenses ON expenses;
CREATE TRIGGER bump_group_last_activity_on_expenses
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION bump_group_last_activity();

DROP TRIGGER IF EXISTS bump_group_last_activity_on_settlements ON settlements;
CREATE TRIGGER bump_group_last_activity_on_settlements
    AFTER INSERT OR UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION bump_group_last_activity();

-- Only wire up the messages trigger when the table exists.
DO $$
BEGIN
    IF to_regclass('public.group_messages') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS bump_group_last_activity_on_messages ON group_messages';
        EXECUTE 'CREATE TRIGGER bump_group_last_activity_on_messages
            AFTER INSERT ON group_messages
            FOR EACH ROW EXECUTE FUNCTION bump_group_last_activity()';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger: clear_group_user_archive_on_activity()
--    Cascade-delete a user's manual archive row when they become involved
--    in a new qualifying action. Chat messages do NOT trigger this — they
--    bump last_activity_at but never auto-unarchive (§9 of the plan).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION clear_archive_for_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.paid_by IS NOT NULL THEN
        DELETE FROM group_user_archive
            WHERE user_id = NEW.paid_by AND group_id = NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION clear_archive_for_expense_split()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id UUID;
BEGIN
    SELECT group_id INTO v_group_id FROM expenses WHERE id = NEW.expense_id;
    IF v_group_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
        DELETE FROM group_user_archive
            WHERE user_id = NEW.user_id AND group_id = v_group_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION clear_archive_for_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM group_user_archive
        WHERE group_id = NEW.group_id
          AND user_id IN (NEW.from_user_id, NEW.to_user_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_archive_on_expense ON expenses;
CREATE TRIGGER clear_archive_on_expense
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION clear_archive_for_expense();

DROP TRIGGER IF EXISTS clear_archive_on_expense_split ON expense_splits;
CREATE TRIGGER clear_archive_on_expense_split
    AFTER INSERT OR UPDATE ON expense_splits
    FOR EACH ROW EXECUTE FUNCTION clear_archive_for_expense_split();

DROP TRIGGER IF EXISTS clear_archive_on_settlement ON settlements;
CREATE TRIGGER clear_archive_on_settlement
    AFTER INSERT OR UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION clear_archive_for_settlement();

-- ---------------------------------------------------------------------------
-- 5. RPCs: archive_group / unarchive_group
-- ---------------------------------------------------------------------------

-- archive_group: insert a row only if the caller's net is zero across all
-- currencies the group uses. Throws 'has_balance' otherwise.
CREATE OR REPLACE FUNCTION archive_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_open_balance BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    IF NOT public.is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'not_a_member';
    END IF;

    WITH
    paid AS (
        SELECT currency, SUM(amount) AS amount FROM expenses
         WHERE group_id = p_group_id AND paid_by = v_user_id AND is_deleted = FALSE
         GROUP BY currency
    ),
    owed AS (
        SELECT e.currency, SUM(es.amount) AS amount
          FROM expense_splits es
          JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = p_group_id
           AND es.user_id = v_user_id
           AND e.is_deleted = FALSE
         GROUP BY e.currency
    ),
    settled_in AS (
        SELECT currency, SUM(amount) AS amount FROM settlements
         WHERE group_id = p_group_id AND to_user_id = v_user_id AND deleted_at IS NULL
         GROUP BY currency
    ),
    settled_out AS (
        SELECT currency, SUM(amount) AS amount FROM settlements
         WHERE group_id = p_group_id AND from_user_id = v_user_id AND deleted_at IS NULL
         GROUP BY currency
    ),
    all_currencies AS (
        SELECT currency FROM paid
        UNION SELECT currency FROM owed
        UNION SELECT currency FROM settled_in
        UNION SELECT currency FROM settled_out
    ),
    per_currency AS (
        SELECT ac.currency,
            COALESCE(p.amount, 0) - COALESCE(o.amount, 0)
              + COALESCE(si.amount, 0) - COALESCE(so.amount, 0) AS net
        FROM all_currencies ac
        LEFT JOIN paid p USING (currency)
        LEFT JOIN owed o USING (currency)
        LEFT JOIN settled_in si USING (currency)
        LEFT JOIN settled_out so USING (currency)
    )
    SELECT EXISTS (SELECT 1 FROM per_currency WHERE ABS(net) >= 0.01)
    INTO v_open_balance;

    IF v_open_balance THEN
        RAISE EXCEPTION 'has_balance';
    END IF;

    INSERT INTO group_user_archive (user_id, group_id)
        VALUES (v_user_id, p_group_id)
    ON CONFLICT (user_id, group_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION unarchive_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    DELETE FROM group_user_archive
        WHERE user_id = v_user_id AND group_id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unarchive_group(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: get_user_groups_archive_state
--    Returns one row per active group the caller belongs to, with both
--    archive flags. Powers the groups list filter (§6.4 of the plan).
--
--    isAutoArchived (Type 1, group-wide) is true iff:
--        - last_activity_at older than 2 months
--        - every active member has net 0 in every currency the group uses
--
--    isArchivedByMe (Type 2, per-user) is true iff there's a row in
--    group_user_archive for (auth.uid(), group_id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_groups_archive_state()
RETURNS TABLE (
    group_id UUID,
    is_archived_by_me BOOLEAN,
    is_auto_archived BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH my_groups AS (
        SELECT g.id, g.last_activity_at
        FROM groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = v_user_id
          AND gm.is_active = TRUE
          AND g.is_active = TRUE
    )
    SELECT
        mg.id,
        EXISTS (
            SELECT 1 FROM group_user_archive gua
            WHERE gua.user_id = v_user_id AND gua.group_id = mg.id
        ) AS is_archived_by_me,
        public.group_is_auto_archived(mg.id) AS is_auto_archived
    FROM my_groups mg;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_groups_archive_state() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Lock down internal trigger functions and strip public/anon from RPCs.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.bump_group_last_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_archive_for_expense() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_archive_for_expense_split() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_archive_for_settlement() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.archive_group(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unarchive_group(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_groups_archive_state() FROM PUBLIC, anon;

-- ======================= 4/5 : admin platform metrics + group_is_auto_archived =======================
-- source: migrations/20260602140000_admin_platform_metrics.sql
-- 20260602140000_admin_platform_metrics.sql
-- Platform metrics for admin portal + shared auto-archive predicate.

CREATE OR REPLACE FUNCTION public.group_is_auto_archived(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH g AS (
        SELECT id, last_activity_at
        FROM groups
        WHERE id = p_group_id AND is_active = TRUE
    ),
    members AS (
        SELECT gm.user_id
        FROM group_members gm
        WHERE gm.group_id = p_group_id AND gm.is_active = TRUE
    ),
    paid AS (
        SELECT e.paid_by AS user_id, e.currency, SUM(e.amount) AS amount
        FROM expenses e
        WHERE e.group_id = p_group_id AND e.is_deleted = FALSE
        GROUP BY e.paid_by, e.currency
    ),
    owed AS (
        SELECT es.user_id, e.currency, SUM(es.amount) AS amount
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.group_id = p_group_id AND e.is_deleted = FALSE
        GROUP BY es.user_id, e.currency
    ),
    settled_in AS (
        SELECT s.to_user_id AS user_id, s.currency, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id = p_group_id AND s.deleted_at IS NULL
        GROUP BY s.to_user_id, s.currency
    ),
    settled_out AS (
        SELECT s.from_user_id AS user_id, s.currency, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id = p_group_id AND s.deleted_at IS NULL
        GROUP BY s.from_user_id, s.currency
    ),
    currency_keys AS (
        SELECT user_id, currency FROM paid
        UNION SELECT user_id, currency FROM owed
        UNION SELECT user_id, currency FROM settled_in
        UNION SELECT user_id, currency FROM settled_out
    ),
    member_balances AS (
        SELECT ck.user_id, ck.currency,
            COALESCE(p.amount, 0) - COALESCE(o.amount, 0)
              + COALESCE(si.amount, 0) - COALESCE(so.amount, 0) AS net
        FROM currency_keys ck
        LEFT JOIN paid p ON p.user_id = ck.user_id AND p.currency = ck.currency
        LEFT JOIN owed o ON o.user_id = ck.user_id AND o.currency = ck.currency
        LEFT JOIN settled_in si ON si.user_id = ck.user_id AND si.currency = ck.currency
        LEFT JOIN settled_out so ON so.user_id = ck.user_id AND so.currency = ck.currency
        WHERE EXISTS (SELECT 1 FROM members m WHERE m.user_id = ck.user_id)
    ),
    all_settled AS (
        SELECT NOT EXISTS (
            SELECT 1 FROM member_balances mb WHERE ABS(mb.net) >= 0.01
        ) AS v
    )
    SELECT EXISTS (
        SELECT 1 FROM g
        CROSS JOIN all_settled a
        WHERE g.last_activity_at < (NOW() - INTERVAL '2 months')
          AND COALESCE(a.v, TRUE)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.group_is_auto_archived(UUID) FROM PUBLIC;
-- Not granted to authenticated: only SECURITY DEFINER callers use it.

CREATE OR REPLACE FUNCTION public.admin_get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registered_users BIGINT;
    v_deleted_users    BIGINT;
    v_active_groups    BIGINT;
    v_archived_groups  BIGINT;
    v_deleted_groups   BIGINT;
    v_manual_archive_rows BIGINT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_registered_users FROM profiles WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_deleted_users FROM profiles WHERE is_active = FALSE;

    SELECT COUNT(*) INTO v_active_groups
    FROM groups g
    WHERE g.is_active = TRUE AND NOT public.group_is_auto_archived(g.id);

    SELECT COUNT(*) INTO v_archived_groups
    FROM groups g
    WHERE g.is_active = TRUE AND public.group_is_auto_archived(g.id);

    SELECT COUNT(*) INTO v_deleted_groups FROM groups WHERE is_active = FALSE;
    SELECT COUNT(*) INTO v_manual_archive_rows FROM group_user_archive;

    RETURN jsonb_build_object(
        'version', 1,
        'generatedAt', NOW(),
        'users', jsonb_build_object(
            'registered', v_registered_users,
            'deleted', v_deleted_users
        ),
        'groups', jsonb_build_object(
            'active', v_active_groups,
            'archived', v_archived_groups,
            'deleted', v_deleted_groups,
            'manualArchiveMemberships', v_manual_archive_rows
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_platform_metrics() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_get_platform_metrics() TO authenticated;

-- ======================= 5/5 : optimized get_user_dashboard =======================
-- source: migrations/20260602163000_optimize_get_user_dashboard.sql
-- Performance: replace correlated subqueries in directed_net / friends_merged
-- with hash-friendly joins. Semantics unchanged vs friend-balance-is-active.sql.
-- Apply to dev: supabase db query --linked -f supabase/migrations/20260602163000_optimize_get_user_dashboard.sql

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
            pc.group_id,
            pc.debtor,
            pc.creditor,
            pc.currency,
            COALESCE(ed.amount, 0) - COALESCE(sd.amount, 0) AS gross
        FROM pair_combos pc
        LEFT JOIN expense_debts ed
            ON ed.group_id = pc.group_id
            AND ed.debtor = pc.debtor
            AND ed.creditor = pc.creditor
            AND ed.currency = pc.currency
        LEFT JOIN settlement_debts sd
            ON sd.group_id = pc.group_id
            AND sd.debtor = pc.debtor
            AND sd.creditor = pc.creditor
            AND sd.currency = pc.currency
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
    friend_shared_groups AS (
        SELECT fbc.friend_id,
            ARRAY_AGG(DISTINCT gid ORDER BY gid) AS shared_group_ids
        FROM friend_by_currency fbc
        CROSS JOIN LATERAL unnest(fbc.group_ids) AS gid
        GROUP BY fbc.friend_id
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
            fsg.shared_group_ids
        FROM friend_by_currency fbc
        JOIN friend_shared_groups fsg ON fsg.friend_id = fbc.friend_id
        GROUP BY fbc.friend_id, fsg.shared_group_ids
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
