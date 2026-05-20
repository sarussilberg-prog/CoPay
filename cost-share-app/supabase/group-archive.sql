-- =============================================================================
-- Per-user archive mechanism + group-wide auto-archive support.
--
-- Implements docs/archive-mechanism-plan.md:
--   * group_user_archive table (Type 2 — manual, per-user)
--   * groups.last_activity_at column + maintenance trigger
--     (powers Type 1 — auto-archive, group-wide, UI-only)
--   * archive_group / unarchive_group RPCs
--   * cascade-clear trigger that removes a user's manual archive row
--     whenever they're involved in a new qualifying action.
--
-- Idempotent: safe to re-run.
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
    ),
    members AS (
        SELECT gm.group_id, gm.user_id
        FROM group_members gm
        WHERE gm.is_active = TRUE
          AND gm.group_id IN (SELECT id FROM my_groups)
    ),
    paid AS (
        SELECT e.group_id, e.paid_by AS user_id, e.currency, SUM(e.amount) AS amount
        FROM expenses e
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT id FROM my_groups)
        GROUP BY e.group_id, e.paid_by, e.currency
    ),
    owed AS (
        SELECT e.group_id, es.user_id, e.currency, SUM(es.amount) AS amount
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.is_deleted = FALSE AND e.group_id IN (SELECT id FROM my_groups)
        GROUP BY e.group_id, es.user_id, e.currency
    ),
    settled_in AS (
        SELECT s.group_id, s.to_user_id AS user_id, s.currency, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.deleted_at IS NULL AND s.group_id IN (SELECT id FROM my_groups)
        GROUP BY s.group_id, s.to_user_id, s.currency
    ),
    settled_out AS (
        SELECT s.group_id, s.from_user_id AS user_id, s.currency, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.deleted_at IS NULL AND s.group_id IN (SELECT id FROM my_groups)
        GROUP BY s.group_id, s.from_user_id, s.currency
    ),
    currency_keys AS (
        SELECT group_id, user_id, currency FROM paid
        UNION SELECT group_id, user_id, currency FROM owed
        UNION SELECT group_id, user_id, currency FROM settled_in
        UNION SELECT group_id, user_id, currency FROM settled_out
    ),
    member_balances AS (
        SELECT ck.group_id, ck.user_id, ck.currency,
            COALESCE(p.amount, 0) - COALESCE(o.amount, 0)
              + COALESCE(si.amount, 0) - COALESCE(so.amount, 0) AS net
        FROM currency_keys ck
        LEFT JOIN paid p USING (group_id, user_id, currency)
        LEFT JOIN owed o USING (group_id, user_id, currency)
        LEFT JOIN settled_in si USING (group_id, user_id, currency)
        LEFT JOIN settled_out so USING (group_id, user_id, currency)
        WHERE EXISTS (
            SELECT 1 FROM members m
            WHERE m.group_id = ck.group_id AND m.user_id = ck.user_id
        )
    ),
    group_no_balance AS (
        SELECT mg.id AS group_id,
            NOT EXISTS (
                SELECT 1 FROM member_balances mb
                WHERE mb.group_id = mg.id AND ABS(mb.net) >= 0.01
            ) AS all_settled
        FROM my_groups mg
    )
    SELECT
        mg.id,
        EXISTS (
            SELECT 1 FROM group_user_archive gua
            WHERE gua.user_id = v_user_id AND gua.group_id = mg.id
        ) AS is_archived_by_me,
        (
            mg.last_activity_at < (NOW() - INTERVAL '2 months')
            AND COALESCE(gnb.all_settled, TRUE)
        ) AS is_auto_archived
    FROM my_groups mg
    LEFT JOIN group_no_balance gnb ON gnb.group_id = mg.id;
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
