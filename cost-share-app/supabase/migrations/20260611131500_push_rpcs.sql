-- Push notifications: client-facing RPCs. SECURITY DEFINER, scoped to auth.uid().

CREATE OR REPLACE FUNCTION register_device_token(
    p_token       TEXT,
    p_platform    TEXT,
    p_device_id   TEXT DEFAULT NULL,
    p_app_version TEXT DEFAULT NULL
) RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_user UUID := auth.uid();
    BEGIN
        IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
        IF p_platform NOT IN ('ios','android') THEN RAISE EXCEPTION 'bad_platform'; END IF;

        INSERT INTO device_tokens (user_id, token, platform, device_id, app_version, last_seen_at)
        VALUES (v_user, p_token, p_platform, p_device_id, p_app_version, NOW())
        ON CONFLICT (token) DO UPDATE SET
            user_id         = v_user,            -- re-bind if the device switched accounts
            platform        = EXCLUDED.platform,
            device_id       = EXCLUDED.device_id,
            app_version     = EXCLUDED.app_version,
            last_seen_at    = NOW(),
            disabled_at     = NULL,
            disabled_reason = NULL;
    END;
    $$;

CREATE OR REPLACE FUNCTION unregister_device_token(p_token TEXT) RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_user UUID := auth.uid();
    BEGIN
        IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
        UPDATE device_tokens
           SET disabled_at = NOW(), disabled_reason = 'user_logout'
         WHERE token = p_token AND user_id = v_user;
    END;
    $$;

CREATE OR REPLACE FUNCTION update_notification_preferences(p_prefs JSONB) RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_user UUID := auth.uid();
    BEGIN
        IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

        INSERT INTO notification_preferences AS np (
            user_id, push_enabled, expenses_push, settlements_push,
            messages_push, friends_push, groups_push, updated_at
        ) VALUES (
            v_user,
            COALESCE((p_prefs->>'push_enabled')::boolean, TRUE),
            COALESCE((p_prefs->>'expenses_push')::boolean, TRUE),
            COALESCE((p_prefs->>'settlements_push')::boolean, TRUE),
            COALESCE((p_prefs->>'messages_push')::boolean, TRUE),
            COALESCE((p_prefs->>'friends_push')::boolean, TRUE),
            COALESCE((p_prefs->>'groups_push')::boolean, TRUE),
            NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            push_enabled     = COALESCE((p_prefs->>'push_enabled')::boolean, np.push_enabled),
            expenses_push    = COALESCE((p_prefs->>'expenses_push')::boolean, np.expenses_push),
            settlements_push = COALESCE((p_prefs->>'settlements_push')::boolean, np.settlements_push),
            messages_push    = COALESCE((p_prefs->>'messages_push')::boolean, np.messages_push),
            friends_push     = COALESCE((p_prefs->>'friends_push')::boolean, np.friends_push),
            groups_push      = COALESCE((p_prefs->>'groups_push')::boolean, np.groups_push),
            updated_at       = NOW();
    END;
    $$;

REVOKE EXECUTE ON FUNCTION register_device_token(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION unregister_device_token(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_notification_preferences(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_device_token(TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_device_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_notification_preferences(JSONB) TO authenticated;
