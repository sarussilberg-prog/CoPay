-- Invitations & Sharing — schema, backfill, trigger, helper.
-- See docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md
-- Idempotent: safe to re-run.

BEGIN;

-- ------------------------------------------------------------
-- Helper: generate_invite_token
-- ------------------------------------------------------------
-- Returns a 10-char URL-safe slug. Uses pgcrypto for randomness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgcrypto's gen_random_bytes lives in the `extensions` schema on Supabase,
-- but the SECURITY DEFINER callers below pin search_path = public. Qualify
-- the call explicitly so the function resolves regardless of search_path.
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
        v_byte := get_byte(extensions.gen_random_bytes(1), 0);
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

BEGIN;

-- ============================================================
-- RPC: get_invite_preview(p_token TEXT) RETURNS JSON
-- Public read for the Edge Function. Does not echo back the token.
-- ============================================================
CREATE OR REPLACE FUNCTION get_invite_preview(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_profile RECORD;
    v_group RECORD;
    v_members JSON;
    v_count INT;
BEGIN
    -- Try friend invite first
    SELECT id, name, avatar_url INTO v_profile
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'kind', 'friend',
            'inviter', json_build_object(
                'id', v_profile.id,
                'name', v_profile.name,
                'avatar_url', v_profile.avatar_url
            )
        );
    END IF;

    -- Try group invite
    SELECT g.id, g.name, g.default_currency
    INTO v_group
    FROM groups g
    WHERE g.invite_token = p_token AND g.is_active = true
    LIMIT 1;

    IF FOUND THEN
        SELECT COUNT(*) INTO v_count
        FROM group_members gm
        WHERE gm.group_id = v_group.id AND gm.is_active = true;

        SELECT json_agg(member_data ORDER BY member_data->>'name')
        INTO v_members
        FROM (
            SELECT json_build_object(
                'id', p.id,
                'name', p.name,
                'avatar_url', p.avatar_url
            ) AS member_data
            FROM group_members gm
            JOIN profiles p ON p.id = gm.user_id
            WHERE gm.group_id = v_group.id AND gm.is_active = true
            LIMIT 6
        ) m;

        RETURN json_build_object(
            'kind', 'group',
            'group', json_build_object(
                'id', v_group.id,
                'name', v_group.name,
                'currency', v_group.default_currency,
                'member_count', v_count,
                'members', COALESCE(v_members, '[]'::json)
            )
        );
    END IF;

    RETURN json_build_object('kind', 'invalid');
END;
$$;

-- ============================================================
-- RPC: redeem_friend_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_friend_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_inviter_id UUID;
    v_inviter_name TEXT;
    v_a UUID;
    v_b UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_inviter_id, v_inviter_name
    FROM profiles WHERE invite_token = p_token LIMIT 1;

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;
    IF v_inviter_id = v_me THEN
        RAISE EXCEPTION 'cannot_self_invite';
    END IF;

    -- Canonical pair (smaller UUID first)
    IF v_me < v_inviter_id THEN
        v_a := v_me; v_b := v_inviter_id;
    ELSE
        v_a := v_inviter_id; v_b := v_me;
    END IF;

    INSERT INTO friendships (user_a_id, user_b_id, source)
    VALUES (v_a, v_b, 'request')
    ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

    -- Clear any friend_blocks in either direction
    DELETE FROM friend_blocks
    WHERE (user_id = v_me AND blocked_user_id = v_inviter_id)
       OR (user_id = v_inviter_id AND blocked_user_id = v_me);

    RETURN json_build_object(
        'friend_id', v_inviter_id,
        'friend_name', v_inviter_name
    );
END;
$$;

-- ============================================================
-- RPC: redeem_group_invite(p_token TEXT) RETURNS JSON
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_group_invite(p_token TEXT) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_group_id UUID;
    v_group_name TEXT;
    v_already BOOLEAN;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_group_id, v_group_name
    FROM groups WHERE invite_token = p_token AND is_active = true LIMIT 1;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'invite_not_found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_group_id AND user_id = v_me AND is_active = true
    ) INTO v_already;

    IF v_already THEN
        RETURN json_build_object(
            'group_id', v_group_id,
            'group_name', v_group_name,
            'already_member', true
        );
    END IF;

    -- Reactivate a previous row if it exists, else insert
    UPDATE group_members SET is_active = true, left_at = NULL, joined_at = now()
    WHERE group_id = v_group_id AND user_id = v_me;

    IF NOT FOUND THEN
        INSERT INTO group_members (group_id, user_id, is_active)
        VALUES (v_group_id, v_me, true);
    END IF;

    -- The existing on_group_member_insert_auto_friend trigger handles friendships.

    RETURN json_build_object(
        'group_id', v_group_id,
        'group_name', v_group_name,
        'already_member', false
    );
END;
$$;

-- ============================================================
-- RPC: rotate_friend_invite() RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_friend_invite() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    v_new := generate_invite_token();
    UPDATE profiles SET invite_token = v_new WHERE id = v_me;
    RETURN v_new;
END;
$$;

-- ============================================================
-- RPC: rotate_group_invite(p_group_id UUID) RETURNS TEXT
-- ============================================================
CREATE OR REPLACE FUNCTION rotate_group_invite(p_group_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me UUID := auth.uid();
    v_member BOOLEAN;
    v_new TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = v_me AND is_active = true
    ) INTO v_member;

    IF NOT v_member THEN
        RAISE EXCEPTION 'not_group_member';
    END IF;

    v_new := generate_invite_token();
    UPDATE groups SET invite_token = v_new WHERE id = p_group_id;
    RETURN v_new;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
-- Public read: get_invite_preview is callable by anon for the Edge Function.
GRANT EXECUTE ON FUNCTION get_invite_preview(TEXT) TO anon, authenticated;

-- Authenticated only: revoke all (PUBLIC, anon, authenticated) first, then grant only to authenticated.
REVOKE EXECUTE ON FUNCTION redeem_friend_invite(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION redeem_group_invite(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rotate_friend_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rotate_group_invite(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION redeem_friend_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_group_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_friend_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_group_invite(UUID) TO authenticated;

COMMIT;
