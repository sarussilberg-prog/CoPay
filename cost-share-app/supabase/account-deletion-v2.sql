-- account-deletion-v2.sql
-- Idempotent migration. Replaces the v1 soft-delete with full GDPR-compliant flow:
--   * PII anonymization on delete_my_account()
--   * deleted_account_emails (sha256 block list) + auth.users trigger
--   * account_deletions_audit (GDPR Art. 30)
--   * storage_cleanup_queue (orphaned avatars consumed by an edge function)
--   * is_caller_active() helper + write-policy guards
--   * profiles.name → NULL-able
-- Safe to run multiple times. Run in Supabase SQL Editor on the remote project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- NEW TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS deleted_account_emails (
    email_hash TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE deleted_account_emails ENABLE ROW LEVEL SECURITY;
-- No policies → only SECURITY DEFINER functions and service role can access.

CREATE TABLE IF NOT EXISTS account_deletions_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    email_hash TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL DEFAULT 'self_service',
    open_balance_snapshot JSONB,
    restored_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_account_deletions_audit_user
    ON account_deletions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletions_audit_deleted_at
    ON account_deletions_audit(deleted_at DESC);
ALTER TABLE account_deletions_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS storage_cleanup_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_path TEXT NOT NULL,
    bucket TEXT NOT NULL DEFAULT 'profile-images',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    UNIQUE (bucket, object_path)
);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_queue_pending
    ON storage_cleanup_queue(requested_at)
    WHERE processed_at IS NULL;
ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

-- ============================================
-- profiles: allow NULL name (display layer falls back to t('common.deletedUser'))
-- ============================================
ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;

-- ============================================
-- is_caller_active() — used by write RLS policies (Task A7)
-- Fail-open on missing row to preserve the first-login race behaviour that
-- existing assertProfileActive() relies on in lib/auth.ts.
-- ============================================
CREATE OR REPLACE FUNCTION public.is_caller_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(
        (SELECT is_active FROM profiles WHERE id = auth.uid()),
        TRUE
    );
$$;
REVOKE EXECUTE ON FUNCTION public.is_caller_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_caller_active() TO anon, authenticated;

-- ============================================
-- delete_my_account() — full transactional flow
-- Replaces the v1 stub. Anonymizes PII, hashes the email for re-signup
-- block, snapshots open balances into the audit row, bans auth.users
-- via banned_until, and queues the avatar for async storage cleanup.
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
    v_hash := encode(digest(lower(trim(v_email)), 'sha256'), 'hex');

    BEGIN
        v_balance := get_user_balance_summary(v_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_balance := jsonb_build_object('error', SQLERRM);
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
        SET banned_until = TIMESTAMPTZ '2099-12-31 00:00:00+00'
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

-- ============================================
-- check_email_not_deleted() — BEFORE INSERT ON auth.users
-- Defense-in-depth: even if the app skips its own check, this rejects
-- re-signups for emails whose hash is in deleted_account_emails.
-- ============================================
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
    v_hash := encode(digest(lower(trim(NEW.email)), 'sha256'), 'hex');
    IF EXISTS (SELECT 1 FROM deleted_account_emails WHERE email_hash = v_hash) THEN
        RAISE EXCEPTION 'email_was_deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_deleted_email_signup ON auth.users;
CREATE TRIGGER block_deleted_email_signup
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_email_not_deleted();
