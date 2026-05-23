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
