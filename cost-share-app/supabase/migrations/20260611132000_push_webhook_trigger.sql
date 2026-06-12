-- Push notifications: fire send-push on each activity_events INSERT (the "webhook").
-- Secrets live in Vault under names 'send_push_url' and 'send_push_secret'
-- (set per-environment; see docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md).

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.push_send_on_activity_event() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, extensions
    AS $$
    DECLARE
        v_url    TEXT;
        v_secret TEXT;
    BEGIN
        SELECT decrypted_secret INTO v_url
          FROM vault.decrypted_secrets WHERE name = 'send_push_url' LIMIT 1;
        SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets WHERE name = 'send_push_secret' LIMIT 1;

        -- If unconfigured (e.g. local), no-op rather than failing the insert.
        IF v_url IS NULL OR v_secret IS NULL THEN
            RETURN NEW;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-webhook-secret', v_secret
            ),
            body    := jsonb_build_object('record', to_jsonb(NEW)),
            timeout_milliseconds := 5000
        );
        RETURN NEW;
    END;
    $$;

-- Only fire when the row could actually notify someone (skip self-events here too).
DROP TRIGGER IF EXISTS trg_push_send_on_activity_event ON activity_events;
CREATE TRIGGER trg_push_send_on_activity_event
    AFTER INSERT ON activity_events
    FOR EACH ROW
    WHEN (NEW.actor_user_id IS DISTINCT FROM NEW.user_id)
    EXECUTE FUNCTION app_private.push_send_on_activity_event();
