-- fix-digest-extensions-schema.sql
-- On Supabase hosted Postgres, pgcrypto lives in the `extensions` schema.
-- SECURITY DEFINER functions with search_path = public[, auth] cannot resolve
-- unqualified digest() — qualify as extensions.digest() (same pattern as invite-links.sql).

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

CREATE OR REPLACE FUNCTION public.check_email_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;
    v_hash := encode(extensions.digest(lower(trim(NEW.email)), 'sha256'), 'hex');
    IF EXISTS (SELECT 1 FROM deleted_account_emails WHERE email_hash = v_hash) THEN
        RAISE EXCEPTION 'email_was_deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION restore_deleted_account(
    p_user_id UUID,
    p_restored_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email     TEXT;
    v_meta_name TEXT;
    v_hash      TEXT;
BEGIN
    SELECT email, raw_user_meta_data->>'full_name'
    INTO v_email, v_meta_name
    FROM auth.users
    WHERE id = p_user_id;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'auth_user_not_found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = p_user_id AND is_active = FALSE
    ) THEN
        RAISE EXCEPTION 'profile_not_deleted';
    END IF;

    v_hash := encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex');

    DELETE FROM deleted_account_emails WHERE email_hash = v_hash;

    UPDATE auth.users
        SET banned_until = NULL
        WHERE id = p_user_id;

    UPDATE profiles
        SET is_active = TRUE,
            deleted_at = NULL,
            email = v_email,
            name = COALESCE(
                NULLIF(trim(p_restored_name), ''),
                NULLIF(trim(v_meta_name), ''),
                split_part(v_email, '@', 1)
            ),
            updated_at = NOW()
        WHERE id = p_user_id;

    UPDATE account_deletions_audit
        SET restored_at = NOW(),
            notes = COALESCE(p_notes, notes)
        WHERE id = (
            SELECT id
            FROM account_deletions_audit
            WHERE user_id = p_user_id
              AND restored_at IS NULL
            ORDER BY deleted_at DESC
            LIMIT 1
        );
END;
$$;

REVOKE ALL ON FUNCTION restore_deleted_account(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restore_deleted_account(UUID, TEXT, TEXT) TO service_role;
