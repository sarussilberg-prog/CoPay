-- ============================================================================
-- Regression test: delete_my_account() must revoke the user's auth sessions
-- and refresh tokens (so the deleted user cannot stay signed in or refresh).
-- Run via Supabase MCP (mcp__supabase__execute_sql) against the dev project
-- drxfbicunusmipdgbgdk. The transaction ROLLBACKs at the end.
-- ============================================================================

BEGIN;
SET LOCAL session_replication_role = replica;

DO $outer$
DECLARE
    v_user        CONSTANT UUID := '00000000-0000-0000-0000-0000000de100';
    v_email       CONSTANT TEXT := 'del-test@test.local';
    v_session_id  CONSTANT UUID := '00000000-0000-0000-0000-0000000de200';
    v_sessions    INT;
    v_tokens      INT;
    v_banned      TIMESTAMPTZ;
    v_active      BOOLEAN;
BEGIN
    -- ---- seed user + active session + refresh token ---------------------
    INSERT INTO auth.users (id, email) VALUES (v_user, v_email);

    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token)
        VALUES (v_user, v_email, 'DeleteMe', 'USD', 'en', TRUE, 'tt_dm_test');

    INSERT INTO auth.sessions (id, user_id) VALUES (v_session_id, v_user);
    INSERT INTO auth.refresh_tokens (user_id, session_id, token, revoked)
        VALUES (v_user::text, v_session_id, 'rt_test_token_dm', FALSE);

    -- ---- call delete_my_account() as the user --------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, TRUE);
    PERFORM public.delete_my_account();

    -- ---- assertions ----------------------------------------------------
    SELECT is_active INTO v_active FROM public.profiles WHERE id = v_user;
    IF v_active IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Case A failed: profiles.is_active should be FALSE, got %', v_active;
    END IF;

    SELECT banned_until INTO v_banned FROM auth.users WHERE id = v_user;
    IF v_banned IS NULL OR v_banned < NOW() THEN
        RAISE EXCEPTION 'Case B failed: auth.users.banned_until should be future/infinity, got %', v_banned;
    END IF;

    SELECT COUNT(*) INTO v_sessions FROM auth.sessions WHERE user_id = v_user;
    IF v_sessions <> 0 THEN
        RAISE EXCEPTION 'Case C failed: expected 0 sessions after delete, got %', v_sessions;
    END IF;

    SELECT COUNT(*) INTO v_tokens FROM auth.refresh_tokens WHERE user_id = v_user::text;
    IF v_tokens <> 0 THEN
        RAISE EXCEPTION 'Case D failed: expected 0 refresh tokens after delete, got %', v_tokens;
    END IF;

    RAISE NOTICE 'delete_my_account.test.sql — all cases passed';
END;
$outer$;

ROLLBACK;
