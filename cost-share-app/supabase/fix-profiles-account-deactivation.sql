-- Account deactivation columns + RPC (idempotent). Required by assertProfileActive / delete_my_account.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
    ON profiles(is_active) WHERE is_active = FALSE;

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles
        SET is_active = FALSE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = auth.uid()
          AND is_active = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
