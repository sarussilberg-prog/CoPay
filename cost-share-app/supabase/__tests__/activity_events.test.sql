-- ============================================================================
-- SQL regression tests for the activity_events table + triggers + RPCs.
--
-- Run via Supabase MCP:
--   mcp__supabase__execute_sql with the full contents below against the dev
--   project (drxfbicunusmipdgbgdk). The transaction ROLLBACKs at the end so
--   no data persists.
--
-- Why session_replication_role = replica?
--   * profiles.id has a FK to auth.users(id).
--   * The handle_new_user trigger on auth.users would fire and fail on
--     synthetic users. `replica` disables triggers AND FK checks for the
--     transaction (Postgres treats FKs as system triggers). ROLLBACK
--     restores the normal role.
--
-- We CANNOT disable the activity-events triggers themselves — those are
-- under test. So we must seed minimal-but-valid rows in source tables.
-- ============================================================================

BEGIN;

SET LOCAL session_replication_role = replica;

-- Critical: re-enable our triggers explicitly (replica mode disables them).
ALTER TABLE expenses          ENABLE ALWAYS TRIGGER trg_expense_activity_events;
ALTER TABLE settlements       ENABLE ALWAYS TRIGGER trg_settlement_activity_events;
ALTER TABLE group_messages    ENABLE ALWAYS TRIGGER trg_message_activity_events;
ALTER TABLE friend_requests   ENABLE ALWAYS TRIGGER trg_friend_request_activity_events;
ALTER TABLE group_members     ENABLE ALWAYS TRIGGER trg_group_membership_activity_events;

DO $outer$
DECLARE
    v_group   CONSTANT UUID := '00000000-0000-0000-0000-00000000ae01';
    v_alice   CONSTANT UUID := '00000000-0000-0000-0000-00000000aea1';
    v_bob     CONSTANT UUID := '00000000-0000-0000-0000-00000000aeb1';
    v_carol   CONSTANT UUID := '00000000-0000-0000-0000-00000000aec1';
    v_dave    CONSTANT UUID := '00000000-0000-0000-0000-00000000aed1';
    v_exp     UUID;
    v_fr      UUID;
    v_member  UUID;
    v_count   INT;
    v_total   INT;
    v_gap     INT;
    v_before  TIMESTAMPTZ;
    v_after   TIMESTAMPTZ;
    v_status  TEXT;
BEGIN
    -- ---- seed ----------------------------------------------------------
    INSERT INTO auth.users (id) VALUES (v_alice), (v_bob), (v_carol), (v_dave);
    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token)
    VALUES
        (v_alice, 'ae-alice@test.local', 'Alice', 'USD', 'en', TRUE, 'tt_ae_alice'),
        (v_bob,   'ae-bob@test.local',   'Bob',   'USD', 'en', TRUE, 'tt_ae_bob'),
        (v_carol, 'ae-carol@test.local', 'Carol', 'USD', 'en', TRUE, 'tt_ae_carol'),
        (v_dave,  'ae-dave@test.local',  'Dave',  'USD', 'en', TRUE, 'tt_ae_dave');
    INSERT INTO public.groups (id, name, default_currency, created_by, is_active, group_type, invite_token)
    VALUES (v_group, 'AE Test Group', 'USD', v_alice, TRUE, 'general', 'tt_ae_group');

    -- Founder row: triggers should emit NOTHING for Alice.
    INSERT INTO public.group_members (group_id, user_id, is_active, joined_at)
    VALUES (v_group, v_alice, TRUE, now())
    RETURNING id INTO v_member;

    -- ---- CASE 1: founder gets no group_added / group_member_joined ----
    SELECT COUNT(*) INTO v_count FROM activity_events WHERE group_id = v_group;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 1 failed: founder INSERT produced % rows', v_count;
    END IF;

    -- ---- CASE 2: adding Bob → 1 group_added (Bob) + 1 group_member_joined (Alice)
    INSERT INTO public.group_members (group_id, user_id, is_active, joined_at, added_by)
    VALUES (v_group, v_bob, TRUE, now(), v_alice);

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE group_id = v_group AND kind = 'group_added' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 2 failed: expected 1 group_added for Bob, got %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE group_id = v_group AND kind = 'group_member_joined' AND user_id = v_alice;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 2 failed: expected 1 group_member_joined for Alice, got %', v_count;
    END IF;

    -- ---- CASE 3: expense fan-out → 2 rows (Alice + Bob)
    INSERT INTO public.expenses (group_id, paid_by, amount, currency, description, expense_date, created_by, is_deleted)
    VALUES (v_group, v_alice, 30, 'USD', 'Lunch', CURRENT_DATE, v_alice, FALSE)
    RETURNING id INTO v_exp;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Case 3 failed: expected 2 expense_added rows, got %', v_count;
    END IF;

    -- ---- CASE 4: soft-delete expense → 0 rows remain
    UPDATE public.expenses SET is_deleted = true WHERE id = v_exp;
    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 4 failed: soft-deleted expense left % rows', v_count;
    END IF;

    -- ---- CASE 5: idempotency — re-running trigger via UPDATE that flips
    --             is_deleted back to false produces no duplicates.
    UPDATE public.expenses SET is_deleted = false WHERE id = v_exp;
    UPDATE public.expenses SET is_deleted = false WHERE id = v_exp; -- no-op
    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Case 5 failed: idempotency broke, got % rows', v_count;
    END IF;

    -- ---- CASE 6: friend request → 1 row for recipient; status UPDATE
    --             mutates metadata in place without bumping created_at.
    INSERT INTO public.friend_requests (from_user_id, to_user_id, status)
    VALUES (v_carol, v_alice, 'pending')
    RETURNING id INTO v_fr;

    SELECT created_at INTO v_before FROM activity_events
    WHERE kind = 'friend_request_received' AND ref_id = v_fr AND user_id = v_alice;

    UPDATE public.friend_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = v_fr;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'friend_request_received' AND ref_id = v_fr;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 6 failed: friend request produced % rows', v_count;
    END IF;

    SELECT metadata->>'status' INTO v_status FROM activity_events
        WHERE kind = 'friend_request_received' AND ref_id = v_fr;
    IF v_status IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'Case 6 failed: expected metadata.status=accepted, got %', v_status;
    END IF;

    SELECT created_at INTO v_after FROM activity_events
        WHERE kind = 'friend_request_received' AND ref_id = v_fr;
    IF v_after IS DISTINCT FROM v_before THEN
        RAISE EXCEPTION 'Case 6 failed: created_at bumped on status update (before=%, after=%)', v_before, v_after;
    END IF;

    -- ---- CASE 7: rejoin — Bob leaves, then rejoins; fresh rows appear,
    --             unique constraint does NOT suppress them.
    UPDATE public.group_members
    SET is_active = false, left_at = now()
    WHERE group_id = v_group AND user_id = v_bob;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_removed' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 7a failed: leave produced % group_removed rows', v_count;
    END IF;

    UPDATE public.group_members
    SET is_active = true, joined_at = now(), left_at = NULL
    WHERE group_id = v_group AND user_id = v_bob;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_removed' AND user_id = v_bob;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 7b failed: rejoin did not clear group_removed (% rows left)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_added' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 7c failed: rejoin produced % group_added rows', v_count;
    END IF;

    -- ---- CASE 8: get_activity_unread_count excludes message_posted ---
    INSERT INTO public.group_messages (group_id, user_id, body)
    VALUES (v_group, v_bob, 'hi');

    -- Force Alice as the caller for auth.uid(). The shipped auth.uid() reads
    -- current_setting('request.jwt.claim.sub'), so we inject a value there.
    -- (We can't CREATE OR REPLACE auth.uid() — the MCP role lacks permission
    -- on the auth schema.)
    PERFORM set_config('request.jwt.claim.sub', v_alice::text, true);

    -- Reset Alice's watermark to before the test seed so events count.
    UPDATE public.profiles SET activity_last_seen_at = 'epoch'::timestamptz WHERE id = v_alice;

    SELECT get_activity_unread_count() INTO v_count;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Case 8 failed: expected >0 unread for Alice, got 0';
    END IF;

    -- Should not count message_posted: total includes message - confirm
    -- that excluding messages drops the count.
    SELECT COUNT(*) INTO v_total FROM activity_events WHERE user_id = v_alice;
    IF v_count >= v_total THEN
        RAISE EXCEPTION 'Case 8 failed: unread (%) should be strictly less than total Alice rows (%)', v_count, v_total;
    END IF;

    -- ---- CASE 10: self-actor events are not counted as unread.
    -- Alice has an `expense_added` row where actor_user_id = Alice. That
    -- row must NOT count toward unread, so total - unread >= 1.
    v_gap := v_total - v_count;
    IF v_gap < 1 THEN
        RAISE EXCEPTION 'Case 10 failed: expected total - unread >= 1 (self-expense), got total=%, unread=%, gap=%',
            v_total, v_count, v_gap;
    END IF;

    -- ---- CASE 9: mark_activity_seen clears the count ------------------
    PERFORM mark_activity_seen();
    SELECT get_activity_unread_count() INTO v_count;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 9 failed: unread count = % after mark_activity_seen', v_count;
    END IF;

    -- ---- CASE 11: message_posted from another user counts as unread ---
    -- Reset Alice's watermark so all events are "new" again. Bob's message
    -- was inserted earlier with actor=Bob. Confirm it now contributes to
    -- the unread count (previously excluded by `kind <> 'message_posted'`).
    UPDATE public.profiles SET activity_last_seen_at = 'epoch'::timestamptz WHERE id = v_alice;
    SELECT get_activity_unread_count() INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Case 11 failed: expected message_posted to count toward unread, got %', v_count;
    END IF;

    RAISE NOTICE 'All activity_events tests passed.';
END
$outer$;

ROLLBACK;
