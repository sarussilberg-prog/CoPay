-- ============================================================================
-- Regression tests for admin portal v1.
-- Run via Supabase MCP (mcp__supabase__execute_sql) against the dev project
-- drxfbicunusmipdgbgdk. The transaction ROLLBACKs at the end.
-- ============================================================================

BEGIN;
SET LOCAL session_replication_role = replica;

DO $outer$
DECLARE
    v_admin  CONSTANT UUID := '00000000-0000-0000-0000-0000000ad000';
    v_alice  CONSTANT UUID := '00000000-0000-0000-0000-0000000ad001';
    v_bob    CONSTANT UUID := '00000000-0000-0000-0000-0000000ad002';
    v_rows   INT;
    v_notes  TEXT;
    v_email  TEXT;
    v_caught BOOLEAN;
BEGIN
    -- ---- seed users ----------------------------------------------------
    INSERT INTO auth.users (id, email) VALUES
        (v_admin, 'ap-admin@test.local'),
        (v_alice, 'ap-alice@test.local'),
        (v_bob,   'ap-bob@test.local');

    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token) VALUES
        (v_admin, 'ap-admin@test.local', 'Admin', 'USD', 'en', TRUE, 'tt_ap_admin'),
        (v_alice, 'ap-alice@test.local', 'Alice', 'USD', 'en', TRUE, 'tt_ap_alice'),
        (v_bob,   'ap-bob@test.local',   'Bob',   'USD', 'en', TRUE, 'tt_ap_bob');

    -- Promote the admin (app_admins is RLS-locked; this only works because the test
    -- runs in session_replication_role = replica, which bypasses RLS).
    INSERT INTO public.app_admins (user_id) VALUES (v_admin);

    -- Simulate two soft-deletions: Alice (currently deleted), Bob (deleted then restored).
    UPDATE profiles SET is_active = FALSE, deleted_at = NOW(), email = NULL, name = NULL
        WHERE id IN (v_alice, v_bob);

    INSERT INTO account_deletions_audit (user_id, email_hash, reason)
        VALUES (v_alice, 'hash_alice', 'self_service'),
               (v_bob,   'hash_bob',   'self_service');

    -- Bob is already restored (older audit row remains, restored_at set).
    UPDATE account_deletions_audit SET restored_at = NOW() WHERE user_id = v_bob;
    UPDATE profiles SET is_active = TRUE, email = 'ap-bob@test.local', name = 'Bob' WHERE id = v_bob;

    -- ---- CASE 1: is_app_admin() ---------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Case 1a failed: is_app_admin() should return TRUE for admin';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice::text)::text, TRUE);
    IF public.is_app_admin() THEN
        RAISE EXCEPTION 'Case 1b failed: is_app_admin() should return FALSE for non-admin';
    END IF;

    -- ---- CASE 2: admin_list_deleted_accounts() ------------------------
    -- 2a: non-admin gets not_authorized
    v_caught := FALSE;
    BEGIN
        PERFORM public.admin_list_deleted_accounts();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'not_authorized' THEN v_caught := TRUE; END IF;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Case 2a failed: non-admin should get not_authorized';
    END IF;

    -- 2b: admin sees Alice (deleted, not restored) but not Bob (restored)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    SELECT COUNT(*) INTO v_rows FROM public.admin_list_deleted_accounts();
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'Case 2b failed: expected 1 row, got %', v_rows;
    END IF;
    SELECT email INTO v_email FROM public.admin_list_deleted_accounts() LIMIT 1;
    IF v_email <> 'ap-alice@test.local' THEN
        RAISE EXCEPTION 'Case 2c failed: expected ap-alice@test.local, got %', v_email;
    END IF;

    -- ---- CASE 3: admin_restore_deleted_account(uuid) ------------------
    -- 3a: non-admin → not_authorized
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice::text)::text, TRUE);
    v_caught := FALSE;
    BEGIN
        PERFORM public.admin_restore_deleted_account(v_alice);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'not_authorized' THEN v_caught := TRUE; END IF;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Case 3a failed: non-admin should get not_authorized';
    END IF;

    -- 3b: admin restores Alice; notes contain restored_by_admin:<admin uuid>
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, TRUE);
    PERFORM public.admin_restore_deleted_account(v_alice);

    SELECT notes INTO v_notes FROM account_deletions_audit
        WHERE user_id = v_alice ORDER BY deleted_at DESC LIMIT 1;
    IF v_notes IS NULL OR position('restored_by_admin:' || v_admin::text IN v_notes) = 0 THEN
        RAISE EXCEPTION 'Case 3b failed: notes missing restored_by_admin marker, got %', v_notes;
    END IF;

    -- 3c: list now returns 0 rows for the admin
    SELECT COUNT(*) INTO v_rows FROM public.admin_list_deleted_accounts();
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'Case 3c failed: after restore expected 0 rows, got %', v_rows;
    END IF;

    -- ---- CASE 4: app_admins is locked (no RLS policy) -----------------
    -- Re-enable RLS enforcement for this case by clearing replica role,
    -- then attempt a direct INSERT as a non-admin authenticated session.
    SET LOCAL session_replication_role = origin;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice::text)::text, TRUE);

    v_caught := FALSE;
    BEGIN
        INSERT INTO public.app_admins (user_id) VALUES (v_alice);
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Case 4 failed: non-admin INSERT into app_admins should be blocked by RLS';
    END IF;

    -- Restore replica role for clean ROLLBACK.
    RESET ROLE;
    SET LOCAL session_replication_role = replica;

    RAISE NOTICE 'admin_portal.test.sql — all cases passed';
END;
$outer$;

ROLLBACK;
