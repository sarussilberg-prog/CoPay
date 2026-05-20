-- Invitations & Sharing — schema, backfill, trigger, helper.
-- See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md
-- Idempotent: safe to re-run.

BEGIN;

-- ------------------------------------------------------------
-- Helper: generate_invite_token
-- ------------------------------------------------------------
-- Returns a 10-char URL-safe slug. Uses pgcrypto for randomness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION generate_invite_token() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    v_len      INT  := length(v_alphabet);  -- 64
    v_token    TEXT := '';
    v_byte     INT;
    i          INT;
BEGIN
    FOR i IN 1..10 LOOP
        v_byte := get_byte(gen_random_bytes(1), 0);
        v_token := v_token || substr(v_alphabet, (v_byte % v_len) + 1, 1);
    END LOOP;
    RETURN v_token;
END;
$$;

-- ------------------------------------------------------------
-- profiles.invite_token
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Backfill existing rows
UPDATE profiles SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

-- Enforce constraints
ALTER TABLE profiles ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_invite_token_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_invite_token_unique UNIQUE (invite_token);

-- Default on insert via trigger (column-level DEFAULT can't call a VOLATILE func with the SECURITY guard we want)
CREATE OR REPLACE FUNCTION default_profile_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_profile_invite_token ON profiles;
CREATE TRIGGER trg_default_profile_invite_token
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION default_profile_invite_token();

-- ------------------------------------------------------------
-- groups.invite_token
-- ------------------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT;

UPDATE groups SET invite_token = generate_invite_token() WHERE invite_token IS NULL;

ALTER TABLE groups ALTER COLUMN invite_token SET NOT NULL;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_invite_token_unique;
ALTER TABLE groups ADD CONSTRAINT groups_invite_token_unique UNIQUE (invite_token);

CREATE OR REPLACE FUNCTION default_group_invite_token() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invite_token IS NULL THEN
        NEW.invite_token := generate_invite_token();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_group_invite_token ON groups;
CREATE TRIGGER trg_default_group_invite_token
    BEFORE INSERT ON groups
    FOR EACH ROW EXECUTE FUNCTION default_group_invite_token();

COMMIT;
