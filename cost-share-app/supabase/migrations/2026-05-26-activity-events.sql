-- 2026-05-26 — Activity events table, triggers, backfill.
--
-- Source spec: docs/superpowers/specs/2026-05-26-activity-events-design.md
-- Plan: docs/superpowers/plans/2026-05-26-activity-events.md
--
-- Apply order (per docs/SSOT/SUPABASE_ENVIRONMENTS.md):
--   1. dev   (drxfbicunusmipdgbgdk)  — automatic in the executing-plans flow.
--   2. prod  (jfqxjjjbpxbwwvoygahu)  — only after explicit user approval.
--
-- All DDL, RPCs, triggers, and backfill run in a single transaction. If any
-- step fails the entire migration aborts. Backfill must come AFTER trigger
-- creation so re-emits go through the unique constraint without duplicating.

BEGIN;

-- ============================================================================
-- 1. group_members.added_by — who added this user (NULL if self-join / founder)
-- ============================================================================
ALTER TABLE group_members
    ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. profiles.activity_last_seen_at — per-user "I've seen up to" watermark.
--    NOT NULL DEFAULT NOW() means every existing user starts caught up; no
--    historic-flood badge after migration.
-- ============================================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS activity_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================================
-- 3. activity_events — denormalized per-recipient event log.
--    One source row (e.g. one expense) fans out to N event rows (one per
--    active group member). UNIQUE(user_id, kind, ref_id) makes triggers and
--    backfill idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN (
        'expense_added',
        'settlement_added',
        'message_posted',
        'friend_request_received',
        'group_added',
        'group_member_joined',
        'group_removed'
    )),
    group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
    ref_id          UUID NOT NULL,
    actor_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, kind, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_created
    ON activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_kind_created
    ON activity_events (user_id, kind, created_at DESC);

-- RLS: clients read their own events; only SECURITY DEFINER triggers write.
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own activity events" ON activity_events;
CREATE POLICY "Users read own activity events"
    ON activity_events FOR SELECT
    USING (user_id = auth.uid());

-- ============================================================================
-- 4. Realtime publication — append activity_events without touching the rest.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'activity_events'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events';
    END IF;
END $$;

-- ============================================================================
-- 5. RPCs — mark seen, count unread.
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_activity_seen() RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
        UPDATE profiles SET activity_last_seen_at = NOW() WHERE id = auth.uid();
    $$;

CREATE OR REPLACE FUNCTION get_activity_unread_count() RETURNS integer
    LANGUAGE sql
    SECURITY DEFINER STABLE
    SET search_path = public
    AS $$
        -- `actor_user_id <> auth.uid()` filters out:
        --   * events the user themselves originated (own expense/settlement/etc.)
        --   * events with NULL actor (own leave, invite-link self-join)
        -- because NULL <> uuid evaluates to NULL (falsy in WHERE).
        SELECT COUNT(*)::integer
        FROM activity_events ae
        JOIN profiles p ON p.id = ae.user_id
        WHERE ae.user_id = auth.uid()
          AND ae.created_at > p.activity_last_seen_at
          AND ae.actor_user_id <> auth.uid();
    $$;

REVOKE EXECUTE ON FUNCTION mark_activity_seen() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_activity_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_activity_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_unread_count() TO authenticated;

-- ============================================================================
-- 6. Triggers — fan out source-row writes into activity_events.
-- ============================================================================

CREATE OR REPLACE FUNCTION emit_expense_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.is_deleted = false)
           OR (TG_OP = 'UPDATE' AND OLD.is_deleted = true AND NEW.is_deleted = false) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'expense_added',
                NEW.group_id,
                NEW.id,
                NEW.created_by,
                jsonb_build_object(
                    'description', NEW.description,
                    'amount', NEW.amount,
                    'currency', NEW.currency,
                    'expense_date', NEW.expense_date
                ),
                NEW.created_at
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id AND gm.is_active = true
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
            DELETE FROM activity_events WHERE kind = 'expense_added' AND ref_id = NEW.id;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_expense_activity_events ON expenses;
CREATE TRIGGER trg_expense_activity_events
    AFTER INSERT OR UPDATE OF is_deleted ON expenses
    FOR EACH ROW EXECUTE FUNCTION emit_expense_activity_events();

CREATE OR REPLACE FUNCTION emit_settlement_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.deleted_at IS NULL)
           OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'settlement_added',
                NEW.group_id,
                NEW.id,
                NEW.created_by,
                jsonb_build_object(
                    'from_user_id',     NEW.from_user_id,
                    'to_user_id',       NEW.to_user_id,
                    'amount',           NEW.amount,
                    'currency',         NEW.currency,
                    'settlement_date',  NEW.settlement_date
                ),
                NEW.created_at
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id AND gm.is_active = true
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            DELETE FROM activity_events WHERE kind = 'settlement_added' AND ref_id = NEW.id;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_settlement_activity_events ON settlements;
CREATE TRIGGER trg_settlement_activity_events
    AFTER INSERT OR UPDATE OF deleted_at ON settlements
    FOR EACH ROW EXECUTE FUNCTION emit_settlement_activity_events();

CREATE OR REPLACE FUNCTION emit_message_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.is_deleted = false)
           OR (TG_OP = 'UPDATE' AND OLD.is_deleted = true AND NEW.is_deleted = false) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'message_posted',
                NEW.group_id,
                NEW.id,
                NEW.user_id,
                jsonb_build_object('body', LEFT(NEW.body, 200)),
                NEW.created_at
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id AND gm.is_active = true
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
            DELETE FROM activity_events WHERE kind = 'message_posted' AND ref_id = NEW.id;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_message_activity_events ON group_messages;
CREATE TRIGGER trg_message_activity_events
    AFTER INSERT OR UPDATE OF is_deleted ON group_messages
    FOR EACH ROW EXECUTE FUNCTION emit_message_activity_events();

CREATE OR REPLACE FUNCTION emit_friend_request_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.to_user_id,
                'friend_request_received',
                NULL,
                NEW.id,
                NEW.from_user_id,
                jsonb_build_object('status', NEW.status, 'responded_at', NEW.responded_at),
                NEW.created_at
            )
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
            -- Update recipient's existing row in place (does not bump created_at).
            UPDATE activity_events
            SET metadata = jsonb_build_object('status', NEW.status, 'responded_at', NEW.responded_at)
            WHERE kind = 'friend_request_received' AND ref_id = NEW.id;

            -- Emit a sender-side row on acceptance so the sender sees
            -- "You and X are now friends" in their feed. created_at is
            -- set to responded_at so the event sorts at the acceptance moment.
            IF NEW.status = 'accepted' THEN
                INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
                VALUES (
                    NEW.from_user_id,
                    'friend_request_received',
                    NULL,
                    NEW.id,
                    NEW.to_user_id,
                    jsonb_build_object('status', NEW.status, 'responded_at', NEW.responded_at),
                    COALESCE(NEW.responded_at, NOW())
                )
                ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_friend_request_activity_events ON friend_requests;
CREATE TRIGGER trg_friend_request_activity_events
    AFTER INSERT OR UPDATE OF status ON friend_requests
    FOR EACH ROW EXECUTE FUNCTION emit_friend_request_activity_events();

CREATE OR REPLACE FUNCTION emit_group_membership_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_group_created_by UUID;
        v_is_join          BOOLEAN := false;
        v_is_leave         BOOLEAN := false;
        v_is_rejoin        BOOLEAN := false;
    BEGIN
        IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
            v_is_join := true;
        ELSIF TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true THEN
            v_is_join := true;
            v_is_rejoin := true;
        ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
            v_is_leave := true;
        END IF;

        IF v_is_join THEN
            SELECT created_by INTO v_group_created_by FROM groups WHERE id = NEW.group_id;

            -- Founder's own initial INSERT: emit nothing.
            IF TG_OP = 'INSERT' AND NEW.user_id = v_group_created_by THEN
                RETURN NEW;
            END IF;

            IF v_is_rejoin THEN
                -- Clear prior rows so UNIQUE(user_id, kind, ref_id) doesn't suppress new events.
                DELETE FROM activity_events
                WHERE ref_id = NEW.id
                  AND kind IN ('group_added', 'group_member_joined', 'group_removed');
            END IF;

            -- One row for the new member.
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.user_id,
                'group_added',
                NEW.group_id,
                NEW.id,
                NEW.added_by,
                jsonb_build_object('joined_at', NEW.joined_at),
                COALESCE(NEW.joined_at, NOW())
            )
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;

            -- One row per OTHER active member.
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'group_member_joined',
                NEW.group_id,
                NEW.id,
                NEW.user_id,
                jsonb_build_object('new_member_user_id', NEW.user_id, 'joined_at', NEW.joined_at),
                COALESCE(NEW.joined_at, NOW())
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id
              AND gm.is_active = true
              AND gm.user_id <> NEW.user_id
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF v_is_leave THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.user_id,
                'group_removed',
                NEW.group_id,
                NEW.id,
                NULL,
                jsonb_build_object('left_at', NEW.left_at),
                COALESCE(NEW.left_at, NOW())
            )
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_group_membership_activity_events ON group_members;
CREATE TRIGGER trg_group_membership_activity_events
    AFTER INSERT OR UPDATE OF is_active ON group_members
    FOR EACH ROW EXECUTE FUNCTION emit_group_membership_activity_events();

-- ============================================================================
-- 7. Backfill — 12-month window. Triggers above are already in place, but
--    these statements bypass them (direct INSERTs) so we control exact shape.
--    ON CONFLICT keeps everything idempotent.
-- ============================================================================

-- 7a. Expenses → expense_added.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'expense_added', e.group_id, e.id, e.created_by,
    jsonb_build_object(
        'description', e.description,
        'amount',      e.amount,
        'currency',    e.currency,
        'expense_date', e.expense_date
    ),
    e.created_at
FROM expenses e
JOIN group_members gm ON gm.group_id = e.group_id AND gm.is_active = true
WHERE e.is_deleted = false
  AND e.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7b. Settlements → settlement_added.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'settlement_added', s.group_id, s.id, s.created_by,
    jsonb_build_object(
        'from_user_id',     s.from_user_id,
        'to_user_id',       s.to_user_id,
        'amount',           s.amount,
        'currency',         s.currency,
        'settlement_date',  s.settlement_date
    ),
    s.created_at
FROM settlements s
JOIN group_members gm ON gm.group_id = s.group_id AND gm.is_active = true
WHERE s.deleted_at IS NULL
  AND s.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7c. Messages → message_posted.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'message_posted', m.group_id, m.id, m.user_id,
    jsonb_build_object('body', LEFT(m.body, 200)),
    m.created_at
FROM group_messages m
JOIN group_members gm ON gm.group_id = m.group_id AND gm.is_active = true
WHERE m.is_deleted = false
  AND m.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7d. Friend requests → friend_request_received.
--    Recipient row: one per request.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    fr.to_user_id, 'friend_request_received', NULL, fr.id, fr.from_user_id,
    jsonb_build_object('status', fr.status, 'responded_at', fr.responded_at),
    fr.created_at
FROM friend_requests fr
WHERE fr.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

--    Sender row: emit for already-accepted requests so the sender sees
--    "You and X are now friends" in their feed.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    fr.from_user_id, 'friend_request_received', NULL, fr.id, fr.to_user_id,
    jsonb_build_object('status', fr.status, 'responded_at', fr.responded_at),
    COALESCE(fr.responded_at, fr.created_at)
FROM friend_requests fr
WHERE fr.status = 'accepted'
  AND fr.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7e. Group joins (currently active, non-founder, joined within window).
--     Emit group_added for the joiner.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'group_added', gm.group_id, gm.id, gm.added_by,
    jsonb_build_object('joined_at', gm.joined_at),
    COALESCE(gm.joined_at, now())
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.is_active = true
  AND gm.user_id <> g.created_by
  AND gm.joined_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

--     Emit group_member_joined for every OTHER currently-active member.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    other.user_id, 'group_member_joined', gm.group_id, gm.id, gm.user_id,
    jsonb_build_object('new_member_user_id', gm.user_id, 'joined_at', gm.joined_at),
    COALESCE(gm.joined_at, now())
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
JOIN group_members other
    ON other.group_id = gm.group_id
   AND other.is_active = true
   AND other.user_id <> gm.user_id
WHERE gm.is_active = true
  AND gm.user_id <> g.created_by
  AND gm.joined_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7f. Group removals — left_at within window.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'group_removed', gm.group_id, gm.id, NULL,
    jsonb_build_object('left_at', gm.left_at),
    COALESCE(gm.left_at, now())
FROM group_members gm
WHERE gm.is_active = false
  AND gm.left_at IS NOT NULL
  AND gm.left_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

COMMIT;
