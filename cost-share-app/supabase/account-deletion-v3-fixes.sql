-- account-deletion-v3-fixes.sql
-- Idempotent follow-up to account-deletion-v2.sql:
--   * Backfill PII scrub for v1 soft-deletes (email/name still present)
--   * Backfill re-signup block + auth ban for v1 deletions
--   * Block adding inactive users to group_members (RLS)
--   * restore_deleted_account() — support-only account restoration RPC
-- Safe to run multiple times. Run in Supabase SQL Editor (service role).

-- v2 prerequisite: name must be nullable before PII backfill sets name = NULL
ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;

-- ============================================
-- BACKFILL: scrub PII on already-inactive profiles (v1 deletions)
-- ============================================
UPDATE profiles
    SET name = NULL,
        email = NULL,
        avatar_url = NULL,
        phone = NULL,
        updated_at = NOW()
WHERE is_active = FALSE
  AND (name IS NOT NULL OR email IS NOT NULL OR avatar_url IS NOT NULL OR phone IS NOT NULL);

-- ============================================
-- BACKFILL: re-signup block + auth ban for v1 deletions missing v2 side-effects
-- ============================================
INSERT INTO deleted_account_emails (email_hash)
SELECT encode(extensions.digest(lower(trim(u.email)), 'sha256'), 'hex')
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_active = FALSE
  AND u.email IS NOT NULL
ON CONFLICT (email_hash) DO NOTHING;

UPDATE auth.users u
    SET banned_until = 'infinity'::timestamptz
FROM profiles p
WHERE p.id = u.id
  AND p.is_active = FALSE
  AND (u.banned_until IS NULL OR u.banned_until < NOW());

-- ============================================
-- RLS: cannot add inactive users as group members
-- ============================================
DROP POLICY IF EXISTS "Users can insert group members" ON group_members;
CREATE POLICY "Users can insert group members" ON group_members
    FOR INSERT
    WITH CHECK (
        public.is_caller_active()
        AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = user_id AND p.is_active = TRUE)
        AND (
            auth.uid() = user_id
            OR public.is_group_creator(group_id)
            OR public.is_group_member(group_id)
        )
    );

-- ============================================
-- restore_deleted_account() — support-only restoration
-- Re-activates the SAME user_id so friendships, groups, expenses stay intact.
-- Callable only by service_role (Supabase SQL Editor / admin tooling).
-- ============================================
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
