-- 20260602110734_revoke_sessions_on_delete.sql
-- Extend delete_my_account() to revoke the user's existing auth sessions and
-- refresh tokens (so the deleted user cannot keep using or refreshing them).
-- Also runs a one-time idempotent backfill that revokes any rows currently
-- stranded for users where profiles.is_active = FALSE.
-- Safe to re-run.

-- ============================================
-- delete_my_account() — replaces account-deletion-v2.sql definition
-- Identical to the previous body PLUS two DELETEs against auth.sessions
-- and auth.refresh_tokens for the caller.
-- ============================================
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_email    TEXT;
    v_avatar   TEXT;
    v_hash     TEXT;
    v_balance  JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'auth_user_missing';
    END IF;
    v_hash := encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex');

    BEGIN
        v_balance := get_user_balance_summary(v_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_balance := jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
    END;

    SELECT avatar_url INTO v_avatar FROM profiles WHERE id = v_user_id;

    INSERT INTO deleted_account_emails (email_hash)
        VALUES (v_hash)
        ON CONFLICT (email_hash) DO NOTHING;

    UPDATE profiles
        SET name = NULL,
            email = NULL,
            avatar_url = NULL,
            phone = NULL,
            is_active = FALSE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_user_id
          AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_already_inactive';
    END IF;

    UPDATE auth.users
        SET banned_until = 'infinity'::timestamptz
        WHERE id = v_user_id;

    -- Revoke active sessions and refresh tokens so the deleted user cannot
    -- keep an existing session alive or mint new access tokens via refresh.
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
    DELETE FROM auth.sessions       WHERE user_id = v_user_id;

    INSERT INTO account_deletions_audit (user_id, email_hash, reason, open_balance_snapshot)
        VALUES (v_user_id, v_hash, 'self_service', v_balance);

    IF v_avatar IS NOT NULL THEN
        INSERT INTO storage_cleanup_queue (object_path)
            VALUES (v_avatar)
            ON CONFLICT (bucket, object_path) DO NOTHING;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

-- ============================================
-- One-time backfill: revoke stranded sessions / refresh tokens for users
-- already soft-deleted (profiles.is_active = FALSE). Idempotent.
-- ============================================
DELETE FROM auth.refresh_tokens
WHERE user_id IN (
    SELECT id::text FROM public.profiles WHERE is_active = FALSE
);

DELETE FROM auth.sessions
WHERE user_id IN (
    SELECT id FROM public.profiles WHERE is_active = FALSE
);
