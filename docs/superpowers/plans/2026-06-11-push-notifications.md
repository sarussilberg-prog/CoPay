# Push Notifications (iOS + Android) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver end-to-end push notifications for iOS + Android, 1:1 synced with the existing Activity feed (`activity_events`), with server-enforced per-category preferences and contextual permission priming.

**Architecture:** Every `activity_events` INSERT fires a `pg_net` trigger ("database webhook") that calls the `send-push` Edge Function. The function filters self-events, checks the recipient's `notification_preferences`, loads `device_tokens`, renders localized (he/en) copy, and sends via the Expo Push API, recording results in `push_deliveries`. The mobile app registers/unregisters Expo push tokens around auth, handles taps via the existing `pendingNavigation` store mechanism, syncs the app-icon badge to the unread count, and exposes a preferences screen.

**Tech Stack:** Postgres (Supabase migrations, pg_net, supabase_vault), Deno Edge Functions, Expo SDK 54 / React Native 0.81, `expo-notifications`, Expo Push Service (APNs + FCM), TanStack Query, Zustand, i18next.

**Design spec:** `docs/superpowers/specs/2026-06-11-push-notifications-design.md`

---

## Testing strategy (read first)

The repo has **two** test runners and **no** SQL test framework:
- **Jest** (`jest-expo`) for `apps/mobile` and `packages/shared` (alias `@cost-share/shared` → `packages/shared/src`). Run from `apps/mobile`: `npm test -- <path>`.
- **Deno test** for Edge Functions (local only, not in CI): `cd supabase/functions/send-push && deno test --allow-net --allow-env`.
- **No pgTAP / supabase test.** DB tasks are verified by applying the migration to the **dev** project and running a verification SQL query (shown per task). Never apply to production (`jfqxjjjbpxbwwvoygahu`); dev project is `drxfbicunusmipdgbgdk`.

So: pure logic (shared types, edge rendering/handler, mobile services) is TDD red→green. DB migrations use apply-then-verify. Native config and on-device behavior use a manual verification checklist (Phase 4).

**Branch/worktree:** This plan is implemented on a `dev` branch in an **isolated git worktree** (created at execution start via `superpowers:using-git-worktrees`). Integrate back to `main` at the very end (Phase 4, final task).

---

## File structure map

**Phase 1 — Backend (DB), `cost-share-app/supabase/migrations/`**
- `20260611130000_push_device_tokens.sql` — `pg_net` extension + `device_tokens` table, RLS, grants.
- `20260611130500_push_notification_preferences.sql` — `notification_preferences` table, RLS, grants, lazy-default helper.
- `20260611131000_push_deliveries.sql` — `push_status` enum + `push_deliveries` table, RLS.
- `20260611131500_push_rpcs.sql` — `register_device_token`, `unregister_device_token`, `update_notification_preferences`.
- `20260611132000_push_webhook_trigger.sql` — `app_private.push_send` fn (reads Vault) + trigger on `activity_events`.
- `docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md` — per-environment Vault secret + EAS credential runbook.

**Phase 2 — Edge Function + shared types**
- `cost-share-app/packages/shared/src/notifications/content.ts` — `PushPlatform`, `ActivityCategory`, `KIND_TO_CATEGORY`, `NotificationPreferences` types + mapping (pure, shared).
- `cost-share-app/packages/shared/src/notifications/index.ts` — barrel.
- `cost-share-app/packages/shared/src/index.ts` — add `export * from './notifications';`.
- `cost-share-app/packages/shared/__tests__/notifications.content.test.ts` — Jest tests for the mapping. *(see note in Task 2.1 for actual test location)*
- `cost-share-app/supabase/functions/send-push/index.ts` — thin entrypoint (`Deno.serve`).
- `cost-share-app/supabase/functions/send-push/handler.ts` — pure, testable handler.
- `cost-share-app/supabase/functions/send-push/render.ts` — he/en copy templates + currency formatting.
- `cost-share-app/supabase/functions/send-push/expo.ts` — Expo Push API client.
- `cost-share-app/supabase/functions/send-push/cors.ts` — CORS/json helpers (mirrors existing functions).
- `cost-share-app/supabase/functions/send-push/deno.json` — import map.
- `cost-share-app/supabase/functions/send-push/render.test.ts`, `handler.test.ts` — Deno tests.
- `cost-share-app/supabase/config.toml` — add `[functions.send-push] verify_jwt = false`.

**Phase 3 — Mobile, `cost-share-app/apps/mobile/`**
- `app.json` — `expo-notifications` plugin, `POST_NOTIFICATIONS`, iOS aps-environment, Android channel/`googleServicesFile`.
- `lib/pushNotifications.ts` — permissions, token fetch, notification handler, badge helpers.
- `services/pushTokens.service.ts` — `register`/`unregister` device token RPC wrappers.
- `services/notificationPreferences.service.ts` — fetch/update preferences.
- `hooks/queries/useNotificationPreferences.ts` — query + mutation hook.
- `lib/pushRegistrationLifecycle.ts` — wire register on sign-in / unregister on sign-out.
- `lib/pushTapRouting.ts` — map a notification `data` payload → `pendingNavigation`.
- `store/index.ts` — extend `pendingNavigation` union with notification targets.
- `navigation/usePendingNavigationFlush` (existing) — extend to handle new targets.
- `components/settings/SettingsToggleRow.tsx` — new toggle row (RN `Switch`).
- `screens/profile/NotificationSettingsScreen.tsx` — preferences screen.
- `components/notifications/EnableNotificationsBanner.tsx` — "off → open Settings" banner.
- `hooks/usePushPermissionPrompt.ts` — contextual soft-ask + cooldown.
- `navigation/AppNavigator.tsx` — register `NotificationSettings` route; add Settings entry.
- `i18n/locales/en.json`, `i18n/locales/he.json` — `notifications.*` UI strings.
- Jest tests under `apps/mobile/__tests__/` for routing + preferences shaping.

**Phase 4 — Credentials, rollout, integration**
- `cost-share-app/apps/mobile/eas.json` — build profiles (verify push entitlements).
- Manual EAS credential setup (APNs key, FCM v1) + on-device verification checklist.
- Merge `dev` → `main`.

---

## Phase 1 — Backend (database)

> All Phase-1 SQL files live in `cost-share-app/supabase/migrations/`. Apply with the project's
> normal flow. For local verification against dev, an implementer may run the file's SQL through
> the Supabase dev project and then the verification query. Follow the existing house style:
> `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `SECURITY DEFINER SET
> search_path = public`, `REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`.

### Task 1.1: `device_tokens` table + `pg_net` extension

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611130000_push_device_tokens.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Push notifications: per-device Expo push tokens.
-- See docs/superpowers/specs/2026-06-11-push-notifications-design.md

-- pg_net powers the activity_events -> send-push "database webhook" (Task 1.5).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS device_tokens (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token            TEXT NOT NULL UNIQUE,                -- Expo push token
    platform         TEXT NOT NULL CHECK (platform IN ('ios','android')),
    device_id        TEXT,
    app_version      TEXT,
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at      TIMESTAMPTZ,                         -- set on logout / invalid receipt
    disabled_reason  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user
    ON device_tokens(user_id) WHERE disabled_at IS NULL;

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own device tokens" ON device_tokens;
CREATE POLICY "Users read own device tokens" ON device_tokens
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own device tokens" ON device_tokens;
CREATE POLICY "Users insert own device tokens" ON device_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own device tokens" ON device_tokens;
CREATE POLICY "Users update own device tokens" ON device_tokens
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own device tokens" ON device_tokens;
CREATE POLICY "Users delete own device tokens" ON device_tokens
    FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply to the dev project**

Apply the migration via the repo's normal migration flow against the dev project
(`drxfbicunusmipdgbgdk`). Do **not** touch production.

- [ ] **Step 3: Verify**

Run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='device_tokens' ORDER BY column_name;
SELECT extname FROM pg_extension WHERE extname='pg_net';
```
Expected: 9 columns present; `pg_net` listed.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/migrations/20260611130000_push_device_tokens.sql
git commit -m "feat(push/db): device_tokens table + pg_net extension"
```

---

### Task 1.2: `notification_preferences` table

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611130500_push_notification_preferences.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Push notifications: per-user, per-category push toggles.
-- Missing row == all-on defaults (handled by COALESCE in send-push + RPC upsert).

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    push_enabled     BOOLEAN NOT NULL DEFAULT TRUE,   -- master switch
    expenses_push    BOOLEAN NOT NULL DEFAULT TRUE,
    settlements_push BOOLEAN NOT NULL DEFAULT TRUE,
    messages_push    BOOLEAN NOT NULL DEFAULT TRUE,
    friends_push     BOOLEAN NOT NULL DEFAULT TRUE,
    groups_push      BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification prefs" ON notification_preferences;
CREATE POLICY "Users read own notification prefs" ON notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notification prefs" ON notification_preferences;
CREATE POLICY "Users insert own notification prefs" ON notification_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notification prefs" ON notification_preferences;
CREATE POLICY "Users update own notification prefs" ON notification_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply to dev** (same flow as Task 1.1).

- [ ] **Step 3: Verify**

Run:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='notification_preferences' ORDER BY column_name;
```
Expected: `expenses_push, friends_push, groups_push, messages_push, push_enabled, settlements_push, updated_at, user_id`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/migrations/20260611130500_push_notification_preferences.sql
git commit -m "feat(push/db): notification_preferences table"
```

---

### Task 1.3: `push_deliveries` table + `push_status` enum

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611131000_push_deliveries.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Push notifications: one delivery row per activity_event (idempotency + retry + observability).

DO $$ BEGIN
    CREATE TYPE push_status AS ENUM ('pending','sent','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS push_deliveries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_event_id UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status            push_status NOT NULL DEFAULT 'pending',
    attempts          INT NOT NULL DEFAULT 0,
    expo_ticket_ids   TEXT[],
    last_error        TEXT,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (activity_event_id)
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_retry
    ON push_deliveries(status, created_at) WHERE status = 'failed';

-- No client access: only the Edge Function (service_role, bypasses RLS) writes here.
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply to dev.**

- [ ] **Step 3: Verify**

Run:
```sql
SELECT unnest(enum_range(NULL::push_status))::text AS status;
SELECT to_regclass('public.push_deliveries') IS NOT NULL AS table_exists;
```
Expected: 4 statuses (`pending, sent, failed, skipped`); `table_exists = true`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/migrations/20260611131000_push_deliveries.sql
git commit -m "feat(push/db): push_deliveries table + push_status enum"
```

---

### Task 1.4: Client RPCs

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611131500_push_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply to dev.**

- [ ] **Step 3: Verify**

Run (as the dev project; `auth.uid()` will be NULL in SQL console, so just assert the
functions exist and are granted):
```sql
SELECT proname FROM pg_proc
WHERE proname IN ('register_device_token','unregister_device_token','update_notification_preferences')
ORDER BY proname;
```
Expected: all three listed.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/migrations/20260611131500_push_rpcs.sql
git commit -m "feat(push/db): register/unregister token + update preferences RPCs"
```

---

### Task 1.5: Webhook trigger (`pg_net` + Vault)

This realizes the spec's "Database Webhook" as an explicit, version-controlled trigger so it is
reproducible across dev/prod via migrations. The function URL + shared secret are read from
**supabase_vault** (already installed), set once per environment (Task 1.6 runbook).

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611132000_push_webhook_trigger.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply to dev.** (The trigger no-ops until Vault secrets are set in Task 1.6, so
existing inserts keep working.)

- [ ] **Step 3: Verify**

Run:
```sql
SELECT tgname FROM pg_trigger WHERE tgname='trg_push_send_on_activity_event';
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app_private' AND proname='push_send_on_activity_event';
```
Expected: trigger + function both exist.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/migrations/20260611132000_push_webhook_trigger.sql
git commit -m "feat(push/db): pg_net webhook trigger on activity_events"
```

---

### Task 1.6: Per-environment setup runbook

**Files:**
- Create: `cost-share-app/docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md`

- [ ] **Step 1: Write the runbook** (no code execution; this documents the one-time, per-env steps)

````markdown
# Push Notifications — Per-Environment Setup

These steps are run **once per Supabase project** (dev `drxfbicunusmipdgbgdk`, prod
`jfqxjjjbpxbwwvoygahu`). They are intentionally NOT in migrations because they contain secrets.

## 1. Vault secrets (powers the activity_events → send-push trigger)

Generate a random shared secret and store both values in Vault:

```sql
-- Run in the target project's SQL editor. Replace <PROJECT_REF> and <RANDOM_SECRET>.
SELECT vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/send-push', 'send_push_url',  'send-push function URL');
SELECT vault.create_secret(
  '<RANDOM_SECRET>', 'send_push_secret', 'shared secret validated by send-push');
```
Generate `<RANDOM_SECRET>` with `openssl rand -hex 32`.

## 2. Edge Function secrets

Set the same secret as a function env var so `send-push` can validate the header:

```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<RANDOM_SECRET> --project-ref <PROJECT_REF>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

## 3. Deploy the function

```bash
supabase functions deploy send-push --project-ref <PROJECT_REF>
```

## 4. EAS push credentials (Phase 4)

- iOS: `eas credentials` → push key (APNs) under Apple Team `K3M6R85KA6`.
- Android: create a Firebase project for `com.copay.mobile`, upload the FCM v1 service account
  key to EAS (`eas credentials` → Android → FCM V1).
````

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md
git commit -m "docs(push): per-environment Vault + EAS setup runbook"
```

---

## Phase 2 — Edge Function (`send-push`) + shared types

> Deno cannot easily import the `@cost-share/shared` workspace package, so the **push copy
> templates live inside the Edge Function** (Deno). The shared package gets only pure TS types +
> the kind→category map, used by the mobile preferences screen. This duplication is intentional
> and small (documented in the spec).

### Task 2.1: Shared notification types + kind→category map

**Files:**
- Create: `cost-share-app/packages/shared/src/notifications/content.ts`
- Create: `cost-share-app/packages/shared/src/notifications/index.ts`
- Modify: `cost-share-app/packages/shared/src/index.ts` (add one export line)
- Test: `cost-share-app/apps/mobile/__tests__/shared/notifications.content.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
    KIND_TO_CATEGORY,
    CATEGORY_TO_PREF_KEY,
    DEFAULT_NOTIFICATION_PREFERENCES,
} from '@cost-share/shared/notifications';
import type { ActivityEventKind } from '@cost-share/shared';

describe('notification content mapping', () => {
    it('maps every activity kind to a category', () => {
        const kinds: ActivityEventKind[] = [
            'expense_added', 'settlement_added', 'message_posted',
            'friend_request_received', 'group_added', 'group_member_joined', 'group_removed',
        ];
        for (const k of kinds) {
            expect(KIND_TO_CATEGORY[k]).toBeDefined();
        }
        expect(KIND_TO_CATEGORY.expense_added).toBe('expenses');
        expect(KIND_TO_CATEGORY.settlement_added).toBe('settlements');
        expect(KIND_TO_CATEGORY.message_posted).toBe('messages');
        expect(KIND_TO_CATEGORY.friend_request_received).toBe('friends');
        expect(KIND_TO_CATEGORY.group_member_joined).toBe('groups');
    });

    it('maps every category to a preference key', () => {
        expect(CATEGORY_TO_PREF_KEY.expenses).toBe('expensesPush');
        expect(CATEGORY_TO_PREF_KEY.groups).toBe('groupsPush');
    });

    it('defaults all preferences to true', () => {
        expect(Object.values(DEFAULT_NOTIFICATION_PREFERENCES).every(Boolean)).toBe(true);
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/notifications.content.test.ts`
Expected: FAIL — cannot resolve `@cost-share/shared/notifications`.

- [ ] **Step 3: Implement `content.ts`**

```typescript
import type { ActivityEventKind } from '../types';

export type PushPlatform = 'ios' | 'android';

export type ActivityCategory = 'expenses' | 'settlements' | 'messages' | 'friends' | 'groups';

export interface NotificationPreferences {
    pushEnabled: boolean;
    expensesPush: boolean;
    settlementsPush: boolean;
    messagesPush: boolean;
    friendsPush: boolean;
    groupsPush: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    pushEnabled: true,
    expensesPush: true,
    settlementsPush: true,
    messagesPush: true,
    friendsPush: true,
    groupsPush: true,
};

export const KIND_TO_CATEGORY: Record<ActivityEventKind, ActivityCategory> = {
    expense_added: 'expenses',
    settlement_added: 'settlements',
    message_posted: 'messages',
    friend_request_received: 'friends',
    group_added: 'groups',
    group_member_joined: 'groups',
    group_removed: 'groups',
};

export const CATEGORY_TO_PREF_KEY: Record<ActivityCategory, keyof NotificationPreferences> = {
    expenses: 'expensesPush',
    settlements: 'settlementsPush',
    messages: 'messagesPush',
    friends: 'friendsPush',
    groups: 'groupsPush',
};
```

- [ ] **Step 4: Create the barrel `notifications/index.ts`**

```typescript
export * from './content';
```

- [ ] **Step 5: Export from the package barrel**

In `cost-share-app/packages/shared/src/index.ts`, add after the existing `export * from './calculations';` line:

```typescript
export * from './notifications';
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/shared/notifications.content.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/packages/shared/src/notifications cost-share-app/packages/shared/src/index.ts cost-share-app/apps/mobile/__tests__/shared/notifications.content.test.ts
git commit -m "feat(push/shared): notification category types + kind mapping"
```

---

### Task 2.2: Edge Function scaffold — `deno.json` + `cors.ts`

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/deno.json`
- Create: `cost-share-app/supabase/functions/send-push/cors.ts`

- [ ] **Step 1: Write `deno.json`** (mirrors existing functions)

```json
{
    "imports": {
        "supabase": "https://esm.sh/@supabase/supabase-js@2",
        "@std/assert": "jsr:@std/assert@1"
    }
}
```

- [ ] **Step 2: Write `cors.ts`** (copied from the house pattern in `admin-sentry-proxy/cors.ts`)

```typescript
export const CORS_HEADERS: HeadersInit = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey, x-webhook-secret',
    'Access-Control-Max-Age': '86400',
};

export function preflight(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return null;
}

export function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
}
```

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/functions/send-push/deno.json cost-share-app/supabase/functions/send-push/cors.ts
git commit -m "feat(push/edge): send-push scaffold (deno.json, cors)"
```

---

### Task 2.3: Copy rendering (`render.ts`) — TDD

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/render.ts`
- Test: `cost-share-app/supabase/functions/send-push/render.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assertEquals } from '@std/assert';
import { renderNotification, formatMoney } from './render.ts';

Deno.test('formatMoney uses symbol for known currency, code otherwise', () => {
    assertEquals(formatMoney(240, 'ILS'), '₪240');
    assertEquals(formatMoney('150.5', 'USD'), '$150.50');
    assertEquals(formatMoney(10, 'CHF'), '10 CHF');
});

Deno.test('expense_added renders he with group in title, no brackets', () => {
    const r = renderNotification('expense_added', 'he', {
        actorName: 'דנה', groupName: 'סופר וחברים', description: 'קניות', amount: 240, currency: 'ILS',
    });
    assertEquals(r.title, 'סופר וחברים');
    assertEquals(r.body, 'הוצאה חדשה מאת דנה · קניות · ₪240');
});

Deno.test('friend_request renders en', () => {
    const r = renderNotification('friend_request_received', 'en', { actorName: 'Dana', groupName: '' });
    assertEquals(r.title, 'New friend request');
    assertEquals(r.body, 'Dana wants to connect');
});

Deno.test('group_member_joined uses new member name', () => {
    const r = renderNotification('group_member_joined', 'he', {
        actorName: 'דנה', groupName: 'טיול', newMemberName: 'יוסי',
    });
    assertEquals(r.title, 'טיול');
    assertEquals(r.body, 'יוסי הצטרף לקבוצה');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-read render.test.ts`
Expected: FAIL — `render.ts` not found.

- [ ] **Step 3: Implement `render.ts`**

```typescript
export type Lang = 'he' | 'en';

export type ActivityKind =
    | 'expense_added' | 'settlement_added' | 'message_posted'
    | 'friend_request_received' | 'group_added' | 'group_member_joined' | 'group_removed';

export interface RenderParams {
    actorName: string;
    groupName: string;
    newMemberName?: string;
    description?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    body?: string | null;
}

export interface Rendered { title: string; body: string; }

const SYMBOLS: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };

export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
    const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
    const value = Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : '0';
    const code = (currency ?? '').toUpperCase();
    const sym = SYMBOLS[code];
    return sym ? `${sym}${value}` : `${value} ${code}`.trim();
}

function joinDot(parts: Array<string | null | undefined>): string {
    return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0).join(' · ');
}

export function renderNotification(kind: ActivityKind, lang: Lang, p: RenderParams): Rendered {
    const money = formatMoney(p.amount, p.currency);
    const he = lang === 'he';
    switch (kind) {
        case 'expense_added':
            return {
                title: p.groupName,
                body: he
                    ? joinDot([`הוצאה חדשה מאת ${p.actorName}`, p.description, money])
                    : joinDot([`New expense from ${p.actorName}`, p.description, money]),
            };
        case 'settlement_added':
            return {
                title: p.groupName,
                body: he
                    ? joinDot([`תשלום חדש מאת ${p.actorName}`, money])
                    : joinDot([`New payment from ${p.actorName}`, money]),
            };
        case 'message_posted':
            return { title: `${p.actorName} · ${p.groupName}`, body: (p.body ?? '').trim() };
        case 'friend_request_received':
            return he
                ? { title: 'בקשת חברות חדשה', body: `${p.actorName} רוצה להתחבר איתך` }
                : { title: 'New friend request', body: `${p.actorName} wants to connect` };
        case 'group_added':
            return he
                ? { title: 'צורפת לקבוצה', body: joinDot([`${p.actorName} צירף אותך`, p.groupName]) }
                : { title: 'You were added to a group', body: joinDot([`${p.actorName} added you`, p.groupName]) };
        case 'group_member_joined':
            return {
                title: p.groupName,
                body: he ? `${p.newMemberName ?? ''} הצטרף לקבוצה` : `${p.newMemberName ?? ''} joined the group`,
            };
        case 'group_removed':
            return he
                ? { title: p.groupName, body: 'הוסרת מהקבוצה' }
                : { title: p.groupName, body: 'You were removed from the group' };
    }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-read render.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/supabase/functions/send-push/render.ts cost-share-app/supabase/functions/send-push/render.test.ts
git commit -m "feat(push/edge): localized he/en notification copy renderer"
```

---

### Task 2.4: Expo Push client (`expo.ts`)

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/expo.ts`
- Test: `cost-share-app/supabase/functions/send-push/expo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assertEquals } from '@std/assert';
import { sendExpoPush, type ExpoMessage } from './expo.ts';

const msg: ExpoMessage = { to: 'ExponentPushToken[x]', title: 't', body: 'b', data: {}, sound: 'default' };

Deno.test('collects ticket ids and flags DeviceNotRegistered tokens', async () => {
    const fakeFetch = ((_url: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({
            data: [
                { status: 'ok', id: 'ticket-1' },
                { status: 'error', details: { error: 'DeviceNotRegistered' } },
            ],
        }), { status: 200 }))) as typeof fetch;

    const bad: ExpoMessage = { ...msg, to: 'ExponentPushToken[dead]' };
    const res = await sendExpoPush([msg, bad], fakeFetch);
    assertEquals(res.ticketIds, ['ticket-1']);
    assertEquals(res.invalidTokens, ['ExponentPushToken[dead]']);
});

Deno.test('empty message list short-circuits', async () => {
    const res = await sendExpoPush([], fetch);
    assertEquals(res, { ticketIds: [], invalidTokens: [] });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-net expo.test.ts`
Expected: FAIL — `expo.ts` not found.

- [ ] **Step 3: Implement `expo.ts`**

```typescript
export interface ExpoMessage {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
    badge?: number;
}

export interface ExpoSendResult {
    ticketIds: string[];
    invalidTokens: string[];
}

interface ExpoTicket {
    status: 'ok' | 'error';
    id?: string;
    details?: { error?: string };
}

export async function sendExpoPush(
    messages: ExpoMessage[],
    fetchFn: typeof fetch = fetch,
): Promise<ExpoSendResult> {
    if (messages.length === 0) return { ticketIds: [], invalidTokens: [] };

    const res = await fetchFn('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`expo_push_http_${res.status}`);

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const ticketIds: string[] = [];
    const invalidTokens: string[] = [];
    (json.data ?? []).forEach((ticket, i) => {
        if (ticket.status === 'ok' && ticket.id) {
            ticketIds.push(ticket.id);
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(messages[i].to);
        }
    });
    return { ticketIds, invalidTokens };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-net expo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/supabase/functions/send-push/expo.ts cost-share-app/supabase/functions/send-push/expo.test.ts
git commit -m "feat(push/edge): Expo Push API client"
```

---

### Task 2.5: Core handler (`handler.ts`) — TDD with injected deps

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/handler.ts`
- Test: `cost-share-app/supabase/functions/send-push/handler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assertEquals } from '@std/assert';
import { processActivityEvent, type ActivityRecord, type SendPushDeps } from './handler.ts';

function baseRecord(over: Partial<ActivityRecord> = {}): ActivityRecord {
    return {
        id: 'evt-1', user_id: 'u-recipient', kind: 'expense_added', group_id: 'g-1',
        ref_id: 'x-1', actor_user_id: 'u-actor', metadata: { description: 'Lunch', amount: 50, currency: 'ILS' },
        created_at: '2026-06-11T10:00:00Z', ...over,
    };
}

function fakeDeps(over: Partial<SendPushDeps> = {}): SendPushDeps & { sent: string[][] } {
    const sentTickets: string[][] = [];
    const deps: SendPushDeps & { sent: string[][] } = {
        sent: sentTickets,
        recordPending: () => Promise.resolve('new'),
        markSkipped: () => Promise.resolve(),
        markSent: (_id, tickets) => { sentTickets.push(tickets); return Promise.resolve(); },
        markFailed: () => Promise.resolve(),
        loadPreferences: () => Promise.resolve(null),
        loadActiveTokens: () => Promise.resolve([{ token: 'ExponentPushToken[a]' }]),
        resolveNames: () => Promise.resolve({ actorName: 'Dana', groupName: 'Trip' }),
        recipientLanguage: () => Promise.resolve('en'),
        unreadCount: () => Promise.resolve(3),
        disableToken: () => Promise.resolve(),
        sendExpo: () => Promise.resolve({ ticketIds: ['t-1'], invalidTokens: [] }),
        ...over,
    };
    return deps;
}

Deno.test('skips self events', async () => {
    const out = await processActivityEvent(baseRecord({ actor_user_id: 'u-recipient' }), fakeDeps());
    assertEquals(out, 'skipped_self');
});

Deno.test('skips when category preference is off', async () => {
    const deps = fakeDeps({
        loadPreferences: () => Promise.resolve({
            push_enabled: true, expenses_push: false, settlements_push: true,
            messages_push: true, friends_push: true, groups_push: true,
        }),
    });
    const out = await processActivityEvent(baseRecord(), deps);
    assertEquals(out, 'skipped_prefs');
});

Deno.test('skips when master switch is off', async () => {
    const deps = fakeDeps({
        loadPreferences: () => Promise.resolve({
            push_enabled: false, expenses_push: true, settlements_push: true,
            messages_push: true, friends_push: true, groups_push: true,
        }),
    });
    assertEquals(await processActivityEvent(baseRecord(), deps), 'skipped_prefs');
});

Deno.test('skips when no active tokens', async () => {
    const deps = fakeDeps({ loadActiveTokens: () => Promise.resolve([]) });
    assertEquals(await processActivityEvent(baseRecord(), deps), 'skipped_no_tokens');
});

Deno.test('sends and records tickets on happy path', async () => {
    const deps = fakeDeps();
    const out = await processActivityEvent(baseRecord(), deps);
    assertEquals(out, 'sent');
    assertEquals(deps.sent, [['t-1']]);
});

Deno.test('disables tokens flagged invalid by Expo', async () => {
    const disabled: string[] = [];
    const deps = fakeDeps({
        loadActiveTokens: () => Promise.resolve([{ token: 'ExponentPushToken[dead]' }]),
        sendExpo: () => Promise.resolve({ ticketIds: [], invalidTokens: ['ExponentPushToken[dead]'] }),
        disableToken: (t) => { disabled.push(t); return Promise.resolve(); },
    });
    await processActivityEvent(baseRecord(), deps);
    assertEquals(disabled, ['ExponentPushToken[dead]']);
});

Deno.test('returns duplicate when delivery already recorded', async () => {
    const deps = fakeDeps({ recordPending: () => Promise.resolve('duplicate') });
    assertEquals(await processActivityEvent(baseRecord(), deps), 'duplicate');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-read handler.test.ts`
Expected: FAIL — `handler.ts` not found.

- [ ] **Step 3: Implement `handler.ts`**

```typescript
import { renderNotification, type ActivityKind, type Lang } from './render.ts';
import type { ExpoMessage, ExpoSendResult } from './expo.ts';

export interface ActivityRecord {
    id: string;
    user_id: string;
    kind: ActivityKind;
    group_id: string | null;
    ref_id: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface PrefsRow {
    push_enabled: boolean;
    expenses_push: boolean;
    settlements_push: boolean;
    messages_push: boolean;
    friends_push: boolean;
    groups_push: boolean;
}

export interface ResolvedNames {
    actorName: string;
    groupName: string;
    newMemberName?: string;
}

export interface SendPushDeps {
    recordPending(eventId: string, recipientId: string): Promise<'new' | 'duplicate'>;
    markSkipped(eventId: string, reason: string): Promise<void>;
    markSent(eventId: string, ticketIds: string[]): Promise<void>;
    markFailed(eventId: string, error: string): Promise<void>;
    loadPreferences(userId: string): Promise<PrefsRow | null>;
    loadActiveTokens(userId: string): Promise<Array<{ token: string }>>;
    resolveNames(record: ActivityRecord): Promise<ResolvedNames>;
    recipientLanguage(userId: string): Promise<Lang>;
    unreadCount(userId: string): Promise<number>;
    disableToken(token: string, reason: string): Promise<void>;
    sendExpo(messages: ExpoMessage[]): Promise<ExpoSendResult>;
}

export type PushOutcome =
    | 'sent' | 'skipped_self' | 'skipped_prefs' | 'skipped_no_tokens' | 'duplicate' | 'failed';

const KIND_TO_PREF: Record<ActivityKind, keyof PrefsRow> = {
    expense_added: 'expenses_push',
    settlement_added: 'settlements_push',
    message_posted: 'messages_push',
    friend_request_received: 'friends_push',
    group_added: 'groups_push',
    group_member_joined: 'groups_push',
    group_removed: 'groups_push',
};

const DEFAULT_PREFS: PrefsRow = {
    push_enabled: true, expenses_push: true, settlements_push: true,
    messages_push: true, friends_push: true, groups_push: true,
};

export async function processActivityEvent(record: ActivityRecord, deps: SendPushDeps): Promise<PushOutcome> {
    // Defensive: the DB trigger already filters self-events, but never notify someone about their own action.
    if (record.actor_user_id && record.actor_user_id === record.user_id) {
        await deps.markSkipped(record.id, 'self');
        return 'skipped_self';
    }

    if ((await deps.recordPending(record.id, record.user_id)) === 'duplicate') {
        return 'duplicate';
    }

    const prefs = (await deps.loadPreferences(record.user_id)) ?? DEFAULT_PREFS;
    if (!prefs.push_enabled || !prefs[KIND_TO_PREF[record.kind]]) {
        await deps.markSkipped(record.id, 'prefs');
        return 'skipped_prefs';
    }

    const tokens = await deps.loadActiveTokens(record.user_id);
    if (tokens.length === 0) {
        await deps.markSkipped(record.id, 'no_tokens');
        return 'skipped_no_tokens';
    }

    const [names, lang, badge] = await Promise.all([
        deps.resolveNames(record),
        deps.recipientLanguage(record.user_id),
        deps.unreadCount(record.user_id),
    ]);

    const md = record.metadata ?? {};
    const rendered = renderNotification(record.kind, lang, {
        actorName: names.actorName,
        groupName: names.groupName,
        newMemberName: names.newMemberName,
        description: (md.description as string | undefined) ?? null,
        amount: (md.amount as number | string | undefined) ?? null,
        currency: (md.currency as string | undefined) ?? null,
        body: (md.body as string | undefined) ?? null,
    });

    const messages: ExpoMessage[] = tokens.map((t) => ({
        to: t.token,
        title: rendered.title,
        body: rendered.body,
        sound: 'default',
        badge,
        data: {
            kind: record.kind,
            groupId: record.group_id,
            refId: record.ref_id,
            activityEventId: record.id,
        },
    }));

    try {
        const result = await deps.sendExpo(messages);
        for (const bad of result.invalidTokens) {
            await deps.disableToken(bad, 'expo_invalid');
        }
        await deps.markSent(record.id, result.ticketIds);
        return 'sent';
    } catch (e) {
        await deps.markFailed(record.id, e instanceof Error ? e.message : String(e));
        return 'failed';
    }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd cost-share-app/supabase/functions/send-push && deno test --allow-read handler.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/supabase/functions/send-push/handler.ts cost-share-app/supabase/functions/send-push/handler.test.ts
git commit -m "feat(push/edge): core send-push handler (self-exclusion, prefs, send)"
```

---

### Task 2.6: Supabase-backed deps (`deps.ts`)

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/deps.ts`

> This wires the `SendPushDeps` interface to real Supabase queries with the **service role** key
> (bypasses RLS). No unit test — it is exercised end-to-end on-device in Phase 4. Keep the query
> shapes exactly as below.

- [ ] **Step 1: Implement `deps.ts`**

```typescript
import { createClient, type SupabaseClient } from 'supabase';
import type { ActivityRecord, ResolvedNames, PrefsRow, SendPushDeps } from './handler.ts';
import { sendExpoPush } from './expo.ts';

export function makeSupabaseDeps(opts: { url: string; serviceRole: string }): SendPushDeps {
    const sb: SupabaseClient = createClient(opts.url, opts.serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return {
        async recordPending(eventId, recipientId) {
            const { error } = await sb.from('push_deliveries').insert({
                activity_event_id: eventId, recipient_user_id: recipientId, status: 'pending', attempts: 0,
            });
            if (!error) return 'new';
            const { data } = await sb.from('push_deliveries')
                .select('status').eq('activity_event_id', eventId).maybeSingle();
            return data?.status === 'sent' ? 'duplicate' : 'new';
        },
        async markSkipped(eventId, reason) {
            await sb.from('push_deliveries')
                .update({ status: 'skipped', last_error: reason })
                .eq('activity_event_id', eventId);
        },
        async markSent(eventId, ticketIds) {
            await sb.from('push_deliveries')
                .update({ status: 'sent', expo_ticket_ids: ticketIds, sent_at: new Date().toISOString() })
                .eq('activity_event_id', eventId);
        },
        async markFailed(eventId, error) {
            await sb.rpc('increment_push_attempt', { p_event_id: eventId, p_error: error })
                .then(({ error: e }) => { if (e) console.error('markFailed', e); });
        },
        async loadPreferences(userId): Promise<PrefsRow | null> {
            const { data } = await sb.from('notification_preferences')
                .select('push_enabled, expenses_push, settlements_push, messages_push, friends_push, groups_push')
                .eq('user_id', userId).maybeSingle();
            return (data as PrefsRow | null) ?? null;
        },
        async loadActiveTokens(userId) {
            const { data } = await sb.from('device_tokens')
                .select('token').eq('user_id', userId).is('disabled_at', null);
            return (data ?? []) as Array<{ token: string }>;
        },
        async resolveNames(record: ActivityRecord): Promise<ResolvedNames> {
            const ids = new Set<string>();
            if (record.actor_user_id) ids.add(record.actor_user_id);
            const newMemberId = record.metadata?.new_member_user_id as string | undefined;
            if (newMemberId) ids.add(newMemberId);

            const names = new Map<string, string>();
            if (ids.size > 0) {
                const { data } = await sb.from('profiles').select('id, name').in('id', [...ids]);
                for (const row of data ?? []) names.set(row.id as string, (row.name as string) ?? '');
            }
            let groupName = '';
            if (record.group_id) {
                const { data } = await sb.from('groups').select('name').eq('id', record.group_id).maybeSingle();
                groupName = (data?.name as string) ?? '';
            }
            return {
                actorName: record.actor_user_id ? (names.get(record.actor_user_id) ?? '') : '',
                groupName,
                newMemberName: newMemberId ? names.get(newMemberId) : undefined,
            };
        },
        async recipientLanguage(userId) {
            const { data } = await sb.from('profiles').select('language').eq('id', userId).maybeSingle();
            return (data?.language as string) === 'he' ? 'he' : 'en';
        },
        async unreadCount(userId) {
            const { data: p } = await sb.from('profiles')
                .select('activity_last_seen_at').eq('id', userId).maybeSingle();
            const seen = (p?.activity_last_seen_at as string) ?? '1970-01-01T00:00:00Z';
            const { count } = await sb.from('activity_events')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId).gt('created_at', seen).neq('actor_user_id', userId);
            return count ?? 0;
        },
        async disableToken(token, reason) {
            await sb.from('device_tokens')
                .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
                .eq('token', token);
        },
        sendExpo(messages) {
            return sendExpoPush(messages);
        },
    };
}
```

- [ ] **Step 2: Add the `increment_push_attempt` helper migration**

Create `cost-share-app/supabase/migrations/20260611132500_push_increment_attempt.sql`:

```sql
-- Atomic failure bookkeeping for push_deliveries (called by send-push service role).
CREATE OR REPLACE FUNCTION increment_push_attempt(p_event_id UUID, p_error TEXT) RETURNS VOID
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
        UPDATE push_deliveries
           SET status = 'failed', attempts = attempts + 1, last_error = p_error
         WHERE activity_event_id = p_event_id;
    $$;

REVOKE EXECUTE ON FUNCTION increment_push_attempt(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_push_attempt(UUID, TEXT) TO service_role;
```

- [ ] **Step 3: Apply the migration to dev, then commit**

```bash
git add cost-share-app/supabase/functions/send-push/deps.ts cost-share-app/supabase/migrations/20260611132500_push_increment_attempt.sql
git commit -m "feat(push/edge): service-role data deps + failure bookkeeping"
```

---

### Task 2.7: Entrypoint (`index.ts`) + config

**Files:**
- Create: `cost-share-app/supabase/functions/send-push/index.ts`
- Modify: `cost-share-app/supabase/config.toml`

- [ ] **Step 1: Write `index.ts`**

```typescript
// Edge Function: send-push
// Invoked by the activity_events pg_net trigger. Validates a shared secret, then
// renders + sends an Expo push for the inserted activity_events row.
// See docs/superpowers/specs/2026-06-11-push-notifications-design.md

import { processActivityEvent, type ActivityRecord } from './handler.ts';
import { makeSupabaseDeps } from './deps.ts';
import { jsonResponse, preflight } from './cors.ts';

const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    if (req.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }
    if (!PUSH_WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== PUSH_WEBHOOK_SECRET) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    let record: ActivityRecord;
    try {
        const body = await req.json();
        record = body.record as ActivityRecord;
        if (!record?.id || !record.user_id || !record.kind) throw new Error('missing record');
    } catch {
        return jsonResponse({ ok: false, error: 'bad_request' }, 400);
    }

    try {
        const deps = makeSupabaseDeps({ url: SUPABASE_URL, serviceRole: SERVICE_ROLE });
        const outcome = await processActivityEvent(record, deps);
        return jsonResponse({ ok: true, outcome }, 200);
    } catch (e) {
        console.error('send-push failed', e);
        return jsonResponse({ ok: false, error: 'internal' }, 500);
    }
});
```

- [ ] **Step 2: Register the function in `config.toml`**

Append to `cost-share-app/supabase/config.toml`:

```toml
# send-push is invoked by the activity_events pg_net trigger (no JWT; validated via
# the x-webhook-secret header against the PUSH_WEBHOOK_SECRET function secret).
[functions.send-push]
verify_jwt = false
```

- [ ] **Step 3: Deploy to dev + smoke test**

```bash
cd cost-share-app
supabase functions deploy send-push --project-ref drxfbicunusmipdgbgdk
```
Then verify auth rejection:
```bash
curl -s -X POST "https://drxfbicunusmipdgbgdk.supabase.co/functions/v1/send-push" \
  -H 'Content-Type: application/json' -d '{"record":{"id":"x"}}'
```
Expected: HTTP 401 `{"ok":false,"error":"unauthorized"}`.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/supabase/functions/send-push/index.ts cost-share-app/supabase/config.toml
git commit -m "feat(push/edge): send-push entrypoint + config registration"
```

---

### Task 2.8 (optional fast-follow): receipts + retry via `pg_cron`

> **Optional for the first ship.** The send path already drops tokens that Expo rejects in the
> immediate ticket response (`handler.ts` → `disableToken`). This task adds the spec's asynchronous
> reliability layer: poll Expo *receipts* (which surface `DeviceNotRegistered` ~15 min later) and
> retry `failed` deliveries. Implement after the core feature works end-to-end.

**Files:**
- Create: `cost-share-app/supabase/migrations/20260611133000_push_retry_cron.sql`
- Create: `cost-share-app/supabase/functions/retry-push/{index.ts,deno.json}` (reuses `expo.ts` logic)

- [ ] **Step 1: Enable `pg_cron` + schedule a 15-minute job** that calls `retry-push` via `pg_net`,
  reusing the Vault secret (`send_push_secret`) and a `retry_push_url` secret:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
    'retry-push-every-15m', '*/15 * * * *',
    $$
    SELECT net.http_post(
        url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='retry_push_url'),
        headers := jsonb_build_object('Content-Type','application/json',
                       'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='send_push_secret')),
        body    := '{}'::jsonb
    );
    $$
);
```

- [ ] **Step 2: Implement `retry-push`** (Deno) to, on each invocation:
  1. Select `push_deliveries` with `status='sent'` and non-null `expo_ticket_ids` from the prior
     window; `POST https://exp.host/--/api/v2/push/getReceipts` with those ids; for any receipt with
     `details.error = 'DeviceNotRegistered'`, set the matching `device_tokens.disabled_at`.
  2. Select `push_deliveries` with `status='failed'` and `attempts < 3`; rebuild + resend via the
     same path as `send-push` (extract a shared `processActivityEvent`-style helper or re-query the
     `activity_events` row by `activity_event_id` and call the existing handler with fresh deps).
  Validate the `x-webhook-secret` header exactly like `send-push`.

- [ ] **Step 3: Register `[functions.retry-push] verify_jwt = false`** in `config.toml`, add the
  `retry_push_url` Vault secret to the runbook, deploy, and commit.

```bash
git add cost-share-app/supabase/migrations/20260611133000_push_retry_cron.sql cost-share-app/supabase/functions/retry-push cost-share-app/supabase/config.toml cost-share-app/docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md
git commit -m "feat(push/edge): retry-push receipts + retry cron (optional)"
```

---

## Phase 3 — Mobile app

> All paths in this phase are under `cost-share-app/apps/mobile/`. Run tests from that directory:
> `npm test -- <path>`. Native config (app.json) and device behavior are verified in Phase 4.

### Task 3.1: Install `expo-notifications` + configure `app.json`

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json` (via `expo install`)
- Modify: `cost-share-app/apps/mobile/app.json`

- [ ] **Step 1: Install the SDK-matched version**

```bash
cd cost-share-app/apps/mobile
npx expo install expo-notifications expo-constants
```
(Do not hand-pick a version; `expo install` selects versions compatible with Expo SDK 54.
`expo-constants` is used to read the EAS `projectId` for the push token; `expo-application` is
already a dependency.)

- [ ] **Step 2: Add the plugin to `app.json`**

In the `plugins` array, after `"expo-localization"`, insert:

```json
[
  "expo-notifications",
  {
    "icon": "./assets/android-icon-monochrome.png",
    "color": "#ffffff"
  }
],
```

- [ ] **Step 3: Add the Android notifications permission**

In `android.permissions`, add `"android.permission.POST_NOTIFICATIONS"`:

```json
"permissions": [
  "android.permission.INTERNET",
  "android.permission.CAMERA",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.VIBRATE",
  "android.permission.POST_NOTIFICATIONS"
],
```

- [ ] **Step 4: Add the iOS background mode for remote notifications**

In `ios.infoPlist`, add:

```json
"UIBackgroundModes": ["remote-notification"]
```

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/apps/mobile/package-lock.json cost-share-app/apps/mobile/app.json
git commit -m "feat(push/mobile): add expo-notifications plugin + permissions"
```

> Note: `googleServicesFile` (Android FCM) and the APNs entitlement are wired during EAS
> credential setup in Phase 4 — not needed for the JS to compile.

---

### Task 3.2: Tap-routing (pure) + store target extension — TDD

**Files:**
- Modify: `cost-share-app/apps/mobile/store/index.ts` (extend `pendingNavigation` union)
- Create: `cost-share-app/apps/mobile/lib/pushTapRouting.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/pushTapRouting.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { notificationDataToPendingNavigation } from '../../lib/pushTapRouting';

describe('notificationDataToPendingNavigation', () => {
    it('routes expense events to the group', () => {
        expect(notificationDataToPendingNavigation({ kind: 'expense_added', groupId: 'g1', refId: 'r1' }))
            .toEqual({ target: 'groupDetail', groupId: 'g1' });
    });
    it('routes settlement and message events to the group', () => {
        expect(notificationDataToPendingNavigation({ kind: 'settlement_added', groupId: 'g2', refId: 'r' }))
            .toEqual({ target: 'groupDetail', groupId: 'g2' });
        expect(notificationDataToPendingNavigation({ kind: 'message_posted', groupId: 'g3', refId: 'r' }))
            .toEqual({ target: 'groupDetail', groupId: 'g3' });
    });
    it('routes friend requests to the friends screen', () => {
        expect(notificationDataToPendingNavigation({ kind: 'friend_request_received', groupId: null, refId: 'r' }))
            .toEqual({ target: 'friends' });
    });
    it('routes group_removed to the groups list', () => {
        expect(notificationDataToPendingNavigation({ kind: 'group_removed', groupId: 'g9', refId: 'r' }))
            .toEqual({ target: 'groupsList' });
    });
    it('returns null for unknown / malformed payloads', () => {
        expect(notificationDataToPendingNavigation({})).toBeNull();
        expect(notificationDataToPendingNavigation({ kind: 'expense_added', groupId: null, refId: 'r' })).toBeNull();
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- __tests__/lib/pushTapRouting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Extend the store union**

In `cost-share-app/apps/mobile/store/index.ts`, change the `pendingNavigation` field type (and its setter type) to add the `groupsList` target:

```typescript
    pendingNavigation:
        | { target: 'friends' }
        | { target: 'groupDetail'; groupId: string }
        | { target: 'groupsList' }
        | null;
    setPendingNavigation: (
        nav: AppState['pendingNavigation'],
    ) => void;
```

- [ ] **Step 4: Implement `pushTapRouting.ts`**

```typescript
import type { useAppStore } from '../store';

type PendingNavigation = ReturnType<typeof useAppStore.getState>['pendingNavigation'];

export interface NotificationData {
    kind?: string;
    groupId?: string | null;
    refId?: string | null;
    activityEventId?: string | null;
}

export function notificationDataToPendingNavigation(data: NotificationData): PendingNavigation {
    const { kind, groupId } = data ?? {};
    switch (kind) {
        case 'expense_added':
        case 'settlement_added':
        case 'message_posted':
        case 'group_added':
        case 'group_member_joined':
            return groupId ? { target: 'groupDetail', groupId } : null;
        case 'friend_request_received':
            return { target: 'friends' };
        case 'group_removed':
            return { target: 'groupsList' };
        default:
            return null;
    }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test -- __tests__/lib/pushTapRouting.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/store/index.ts cost-share-app/apps/mobile/lib/pushTapRouting.ts cost-share-app/apps/mobile/__tests__/lib/pushTapRouting.test.ts
git commit -m "feat(push/mobile): notification tap → pendingNavigation routing"
```

---

### Task 3.3: Flush handler for the `groupsList` target

**Files:**
- Modify: the hook that flushes `pendingNavigation` (search: `usePendingNavigationFlush` —
  in `cost-share-app/apps/mobile/navigation/` or `hooks/`).

- [ ] **Step 1: Locate the flush handler**

Run: `cd cost-share-app/apps/mobile && grep -rn "pendingNavigation" navigation hooks`
Open the file that reads `pendingNavigation` and `switch`es / branches on `.target`.

- [ ] **Step 2: Add a `groupsList` branch**

Mirroring the existing `groupDetail` branch, add handling for the new target. Using the
established navigation API (tab `'Groups'` → stack screen `'GroupsList'`):

```typescript
        } else if (pending.target === 'groupsList') {
            navigation.navigate('Groups', { screen: 'GroupsList', merge: true });
            setPendingNavigation(null);
        }
```
(Match the exact `navigation` reference, reset call, and brace style already used by the
neighbouring `groupDetail`/`friends` branches in that file.)

- [ ] **Step 3: Verify it type-checks**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(push/mobile): handle groupsList pending navigation target"
```

---

### Task 3.4: Push token service (RPC wrappers) — TDD

**Files:**
- Create: `cost-share-app/apps/mobile/services/pushTokens.service.ts`
- Test: `cost-share-app/apps/mobile/__tests__/services/pushTokens.service.test.ts`

- [ ] **Step 1: Write the failing test** (mock the supabase client)

```typescript
import { registerPushToken, unregisterPushToken } from '../../services/pushTokens.service';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

describe('pushTokens.service', () => {
    beforeEach(() => jest.clearAllMocks());

    it('registers a token with platform + metadata', async () => {
        (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
        await registerPushToken({ token: 'ExponentPushToken[a]', platform: 'ios', deviceId: 'd1', appVersion: '1.2.3' });
        expect(supabase.rpc).toHaveBeenCalledWith('register_device_token', {
            p_token: 'ExponentPushToken[a]', p_platform: 'ios', p_device_id: 'd1', p_app_version: '1.2.3',
        });
    });

    it('swallows + logs RPC errors (never throws into auth flow)', async () => {
        (supabase.rpc as jest.Mock).mockResolvedValue({ error: new Error('boom') });
        await expect(registerPushToken({ token: 't', platform: 'android' })).resolves.toBeUndefined();
    });

    it('unregisters a token', async () => {
        (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
        await unregisterPushToken('ExponentPushToken[a]');
        expect(supabase.rpc).toHaveBeenCalledWith('unregister_device_token', { p_token: 'ExponentPushToken[a]' });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- __tests__/services/pushTokens.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pushTokens.service.ts`**

```typescript
import { supabase } from '../lib/supabase';
import type { PushPlatform } from '@cost-share/shared';

export interface RegisterTokenInput {
    token: string;
    platform: PushPlatform;
    deviceId?: string;
    appVersion?: string;
}

// Push registration must never break sign-in; errors are logged, not thrown.
export async function registerPushToken(input: RegisterTokenInput): Promise<void> {
    const { error } = await supabase.rpc('register_device_token', {
        p_token: input.token,
        p_platform: input.platform,
        p_device_id: input.deviceId ?? null,
        p_app_version: input.appVersion ?? null,
    });
    if (error) console.warn('registerPushToken failed', error);
}

export async function unregisterPushToken(token: string): Promise<void> {
    const { error } = await supabase.rpc('unregister_device_token', { p_token: token });
    if (error) console.warn('unregisterPushToken failed', error);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- __tests__/services/pushTokens.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/services/pushTokens.service.ts cost-share-app/apps/mobile/__tests__/services/pushTokens.service.test.ts
git commit -m "feat(push/mobile): device token register/unregister service"
```

---

### Task 3.5: `expo-notifications` wrapper (`lib/pushNotifications.ts`)

**Files:**
- Create: `cost-share-app/apps/mobile/lib/pushNotifications.ts`

> This is the only module that imports `expo-notifications`. It is thin glue (permissions,
> token fetch, handler config, badge); device-tested in Phase 4. No unit test.

- [ ] **Step 1: Implement `pushNotifications.ts`**

```typescript
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

// Foreground display: show a banner unless the caller suppresses it.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
    }),
});

export async function ensureAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
    });
}

export async function getPermissionStatus(): Promise<Notifications.PermissionStatus> {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
}

export async function requestPermission(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

// Returns the Expo push token, or null if permission is missing / fetch fails.
export async function fetchExpoPushToken(): Promise<string | null> {
    const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    try {
        await ensureAndroidChannel();
        const { data } = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined,
        );
        return data ?? null;
    } catch (e) {
        console.warn('fetchExpoPushToken failed', e);
        return null;
    }
}

export function currentPlatform(): 'ios' | 'android' | null {
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return null;
}

export function appVersion(): string | undefined {
    return Application.nativeApplicationVersion ?? undefined;
}

export async function setBadgeCount(count: number): Promise<void> {
    try {
        await Notifications.setBadgeCountAsync(Math.max(0, count));
    } catch {
        /* badge unsupported on some Android launchers — ignore */
    }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/lib/pushNotifications.ts
git commit -m "feat(push/mobile): expo-notifications wrapper (permissions, token, badge)"
```

---

### Task 3.6: Registration lifecycle (sign-in / sign-out)

**Files:**
- Create: `cost-share-app/apps/mobile/lib/pushRegistrationLifecycle.ts`
- Modify: `cost-share-app/apps/mobile/lib/authSessionLifecycle.ts` (call register/unregister)

- [ ] **Step 1: Implement `pushRegistrationLifecycle.ts`**

```typescript
import { fetchExpoPushToken, getPermissionStatus, currentPlatform, appVersion, setBadgeCount } from './pushNotifications';
import { registerPushToken, unregisterPushToken } from '../services/pushTokens.service';

let lastRegisteredToken: string | null = null;

// Called after sign-in (and on app start when already authenticated). Only registers if the
// OS permission is already granted — the contextual prompt (Task 3.9) handles asking.
export async function syncPushRegistrationOnSignIn(): Promise<void> {
    const platform = currentPlatform();
    if (!platform) return;
    if ((await getPermissionStatus()) !== 'granted') return;

    const token = await fetchExpoPushToken();
    if (!token) return;
    lastRegisteredToken = token;
    await registerPushToken({ token, platform, appVersion: appVersion() });
}

export async function clearPushRegistrationOnSignOut(): Promise<void> {
    await setBadgeCount(0);
    const token = lastRegisteredToken ?? (await fetchExpoPushToken());
    if (token) await unregisterPushToken(token);
    lastRegisteredToken = null;
}
```

- [ ] **Step 2: Wire into `authSessionLifecycle.ts`**

In the `onAuthStateChange` handler, call the lifecycle functions. After the `SIGNED_OUT` branch
runs (`useAppStore.getState().setSession(null);`), add a fire-and-forget cleanup; in the
`SIGNED_IN` branch, register after the session is accepted:

```typescript
    if (event === 'SIGNED_OUT') {
        useAppStore.getState().setSession(null);
        void clearPushRegistrationOnSignOut();
        return;
    }
    // ...
    if (event === 'SIGNED_IN') {
        setTimeout(() => {
            void acceptSession(nextSession, 'fresh');
            void syncPushRegistrationOnSignIn();
        }, 0);
        return;
    }
```
Add the import at the top of `authSessionLifecycle.ts`:
```typescript
import { syncPushRegistrationOnSignIn, clearPushRegistrationOnSignOut } from './pushRegistrationLifecycle';
```

- [ ] **Step 3: Cover the already-authenticated app-start case**

In `App.tsx`, where the app detects an existing session on boot (near the `currentUserId`
selector), trigger a one-time registration. Add an effect:
```typescript
    useEffect(() => {
        if (currentUserId) void syncPushRegistrationOnSignIn();
    }, [currentUserId]);
```
(Import `syncPushRegistrationOnSignIn` from `./lib/pushRegistrationLifecycle`.)

- [ ] **Step 4: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/lib/pushRegistrationLifecycle.ts cost-share-app/apps/mobile/lib/authSessionLifecycle.ts cost-share-app/apps/mobile/App.tsx
git commit -m "feat(push/mobile): register token on sign-in, clear on sign-out"
```

---

### Task 3.7: Notification listeners (foreground + tap) at the navigation root

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/usePushNotificationListeners.ts`
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` (call the hook inside `AppNavigator`)

- [ ] **Step 1: Implement `usePushNotificationListeners.ts`**

```typescript
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store';
import { notificationDataToPendingNavigation, type NotificationData } from '../lib/pushTapRouting';

function handleTap(data: NotificationData): void {
    const pending = notificationDataToPendingNavigation(data);
    if (pending) useAppStore.getState().setPendingNavigation(pending);
}

// Wired once at the navigation root. Tap handling reuses the existing pendingNavigation flush,
// so it works for both warm taps and cold starts.
export function usePushNotificationListeners(): void {
    useEffect(() => {
        // Cold start: app opened by tapping a notification.
        void Notifications.getLastNotificationResponseAsync().then((response) => {
            const data = response?.notification.request.content.data as NotificationData | undefined;
            if (data) handleTap(data);
        });

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            handleTap(response.notification.request.content.data as NotificationData);
        });
        return () => sub.remove();
    }, []);
}
```

- [ ] **Step 2: Call it inside `AppNavigator`**

In `AppNavigator.tsx`, inside the `AppNavigator()` component body (alongside the existing
`useInviteRedemption(); usePendingNavigationFlush();` calls), add:
```typescript
    usePushNotificationListeners();
```
and import it:
```typescript
import { usePushNotificationListeners } from '../hooks/usePushNotificationListeners';
```

- [ ] **Step 3: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/usePushNotificationListeners.ts cost-share-app/apps/mobile/navigation/AppNavigator.tsx
git commit -m "feat(push/mobile): foreground + tap notification listeners"
```

---

### Task 3.8: Badge sync with unread count

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useAppRealtime.ts` (set badge when activity changes)
- Modify: `cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx` (clear badge on focus)

- [ ] **Step 1: Update the badge when activity unread changes**

In `useAppRealtime.ts`, inside the existing `activity_events` realtime handler (the block that
calls `invalidateActivityDebounced()` and invalidates `activityUnreadCount`), also refresh the
OS badge from the freshly-fetched count:

```typescript
            void supabase.rpc('get_activity_unread_count').then(({ data }) => {
                void setBadgeCount(typeof data === 'number' ? data : 0);
            });
```
Import at the top: `import { setBadgeCount } from '../lib/pushNotifications';`

- [ ] **Step 2: Clear the badge when the Activity screen is focused**

In `ActivityFeedScreen.tsx`, in the same focus effect that calls `mark_activity_seen()`, also
clear the OS badge:
```typescript
        void setBadgeCount(0);
```
Import: `import { setBadgeCount } from '../../lib/pushNotifications';`

- [ ] **Step 3: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/useAppRealtime.ts cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx
git commit -m "feat(push/mobile): sync app-icon badge with unread activity count"
```

---

### Task 3.9: Preferences — service, hook, toggle row, screen, i18n

**Files:**
- Create: `cost-share-app/apps/mobile/services/notificationPreferences.service.ts`
- Create: `cost-share-app/apps/mobile/hooks/queries/useNotificationPreferences.ts`
- Create: `cost-share-app/apps/mobile/components/settings/SettingsToggleRow.tsx`
- Create: `cost-share-app/apps/mobile/screens/profile/NotificationSettingsScreen.tsx`
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` (add route + Settings entry handled in 3.10)
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`, `he.json`
- Test: `cost-share-app/apps/mobile/__tests__/services/notificationPreferences.service.test.ts`

- [ ] **Step 1: Write the failing service test**

```typescript
import { fetchNotificationPreferences, saveNotificationPreferences } from '../../services/notificationPreferences.service';
import { supabase } from '../../lib/supabase';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@cost-share/shared';

jest.mock('../../lib/supabase', () => ({
    supabase: { rpc: jest.fn(), from: jest.fn() },
}));

describe('notificationPreferences.service', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns defaults when no row exists', async () => {
        (supabase.from as jest.Mock).mockReturnValue({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        });
        const prefs = await fetchNotificationPreferences('u1');
        expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it('maps snake_case row to camelCase', async () => {
        (supabase.from as jest.Mock).mockReturnValue({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
                data: { push_enabled: true, expenses_push: false, settlements_push: true,
                    messages_push: false, friends_push: true, groups_push: true }, error: null }) }) }),
        });
        const prefs = await fetchNotificationPreferences('u1');
        expect(prefs.expensesPush).toBe(false);
        expect(prefs.messagesPush).toBe(false);
    });

    it('sends camelCase prefs as snake_case JSON to the RPC', async () => {
        (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
        await saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, messagesPush: false });
        expect(supabase.rpc).toHaveBeenCalledWith('update_notification_preferences', {
            p_prefs: expect.objectContaining({ messages_push: false, push_enabled: true }),
        });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- __tests__/services/notificationPreferences.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `notificationPreferences.service.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@cost-share/shared';

interface PrefsRow {
    push_enabled: boolean;
    expenses_push: boolean;
    settlements_push: boolean;
    messages_push: boolean;
    friends_push: boolean;
    groups_push: boolean;
}

function rowToPrefs(row: PrefsRow): NotificationPreferences {
    return {
        pushEnabled: row.push_enabled,
        expensesPush: row.expenses_push,
        settlementsPush: row.settlements_push,
        messagesPush: row.messages_push,
        friendsPush: row.friends_push,
        groupsPush: row.groups_push,
    };
}

export async function fetchNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await supabase
        .from('notification_preferences')
        .select('push_enabled, expenses_push, settlements_push, messages_push, friends_push, groups_push')
        .eq('user_id', userId)
        .maybeSingle();
    if (error || !data) return DEFAULT_NOTIFICATION_PREFERENCES;
    return rowToPrefs(data as PrefsRow);
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
    const { error } = await supabase.rpc('update_notification_preferences', {
        p_prefs: {
            push_enabled: prefs.pushEnabled,
            expenses_push: prefs.expensesPush,
            settlements_push: prefs.settlementsPush,
            messages_push: prefs.messagesPush,
            friends_push: prefs.friendsPush,
            groups_push: prefs.groupsPush,
        },
    });
    if (error) throw error;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- __tests__/services/notificationPreferences.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the query hook `useNotificationPreferences.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../../services/notificationPreferences.service';
import { useAppStore } from '../../store';
import type { NotificationPreferences } from '@cost-share/shared';

const KEY = ['notificationPreferences'] as const;

export function useNotificationPreferences() {
    const userId = useAppStore((s) => s.currentUser?.id);
    return useQuery({
        queryKey: KEY,
        queryFn: () => fetchNotificationPreferences(userId as string),
        enabled: Boolean(userId),
        staleTime: 60_000,
    });
}

export function useSaveNotificationPreferences() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (prefs: NotificationPreferences) => saveNotificationPreferences(prefs),
        onMutate: async (prefs) => {
            await qc.cancelQueries({ queryKey: KEY });
            const previous = qc.getQueryData<NotificationPreferences>(KEY);
            qc.setQueryData(KEY, prefs); // optimistic
            return { previous };
        },
        onError: (_e, _prefs, ctx) => {
            if (ctx?.previous) qc.setQueryData(KEY, ctx.previous); // rollback
        },
        onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); },
    });
}
```

- [ ] **Step 6: Implement `SettingsToggleRow.tsx`** (mirrors `SettingsRow`, uses RN `Switch`)

```typescript
import React from 'react';
import { View, Switch } from 'react-native';
import { Text } from '../AppText';
import { AppIcon, AppIconName } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    iconName: AppIconName;
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    testID?: string;
}

export function SettingsToggleRow({ iconName, label, value, onValueChange, disabled, testID }: Props) {
    return (
        <View
            className="flex-row items-center bg-white px-4 py-3.5 min-h-[52px]"
            style={disabled ? { opacity: 0.45 } : undefined}
        >
            <AppIcon name={iconName} size={22} color={colors.gray500} />
            <Text className="flex-1 ms-3 text-base text-gray-900">{label}</Text>
            <Switch
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
                testID={testID}
                trackColor={{ true: colors.primary, false: colors.gray300 }}
            />
        </View>
    );
}
```

- [ ] **Step 7: Add i18n strings**

In `i18n/locales/en.json`, add a `notifications` block:
```json
"notifications": {
  "title": "Notifications",
  "pushMaster": "Push notifications",
  "categoryExpenses": "Expenses",
  "categorySettlements": "Payments",
  "categoryMessages": "Group chat",
  "categoryFriends": "Friend requests",
  "categoryGroups": "Groups",
  "systemDisabled": "Notifications are turned off for this app",
  "openSettings": "Open settings",
  "primingTitle": "Stay in the loop",
  "primingBody": "Get notified when a friend adds an expense or pays you back.",
  "primingEnable": "Enable notifications",
  "primingLater": "Not now"
}
```
In `i18n/locales/he.json`, add the matching block:
```json
"notifications": {
  "title": "התראות",
  "pushMaster": "התראות פוש",
  "categoryExpenses": "הוצאות",
  "categorySettlements": "תשלומים",
  "categoryMessages": "הודעות צ'אט",
  "categoryFriends": "בקשות חברות",
  "categoryGroups": "קבוצות",
  "systemDisabled": "ההתראות כבויות עבור האפליקציה",
  "openSettings": "פתח הגדרות",
  "primingTitle": "אל תפספס כלום",
  "primingBody": "קבל עדכון כשחבר מוסיף הוצאה או משלם לך.",
  "primingEnable": "הפעל התראות",
  "primingLater": "לא עכשיו"
}
```

- [ ] **Step 8: Implement `NotificationSettingsScreen.tsx`**

```typescript
import React, { useCallback } from 'react';
import { ScrollView, View, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SettingsToggleRow } from '../../components/settings/SettingsToggleRow';
import { SettingsRow } from '../../components/settings/SettingsRow';
import { useNotificationPreferences, useSaveNotificationPreferences } from '../../hooks/queries/useNotificationPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@cost-share/shared';

export function NotificationSettingsScreen() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { data: prefs = DEFAULT_NOTIFICATION_PREFERENCES } = useNotificationPreferences();
    const save = useSaveNotificationPreferences();

    const patch = useCallback(
        (key: keyof NotificationPreferences, value: boolean) => {
            save.mutate({ ...prefs, [key]: value });
        },
        [prefs, save],
    );

    const masterOff = !prefs.pushEnabled;

    return (
        <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: insets.bottom }}>
            <View className="pt-4">
                <SettingsSection title={t('notifications.title')}>
                    <SettingsToggleRow
                        iconName="notifications-outline"
                        label={t('notifications.pushMaster')}
                        value={prefs.pushEnabled}
                        onValueChange={(v) => patch('pushEnabled', v)}
                        testID="pref-master"
                    />
                </SettingsSection>

                <SettingsSection title={t('notifications.title')}>
                    <SettingsToggleRow iconName="receipt-outline" label={t('notifications.categoryExpenses')}
                        value={prefs.expensesPush} disabled={masterOff} onValueChange={(v) => patch('expensesPush', v)} />
                    <SettingsToggleRow iconName="cash-outline" label={t('notifications.categorySettlements')}
                        value={prefs.settlementsPush} disabled={masterOff} onValueChange={(v) => patch('settlementsPush', v)} />
                    <SettingsToggleRow iconName="chatbubble-outline" label={t('notifications.categoryMessages')}
                        value={prefs.messagesPush} disabled={masterOff} onValueChange={(v) => patch('messagesPush', v)} />
                    <SettingsToggleRow iconName="person-add-outline" label={t('notifications.categoryFriends')}
                        value={prefs.friendsPush} disabled={masterOff} onValueChange={(v) => patch('friendsPush', v)} />
                    <SettingsToggleRow iconName="people-outline" label={t('notifications.categoryGroups')}
                        value={prefs.groupsPush} disabled={masterOff} onValueChange={(v) => patch('groupsPush', v)} />
                </SettingsSection>

                <SettingsSection title="">
                    <SettingsRow
                        iconName="settings-outline"
                        label={t('notifications.openSettings')}
                        variant="chevron"
                        onPress={() => { void Linking.openSettings(); }}
                    />
                </SettingsSection>
            </View>
        </ScrollView>
    );
}
```
(If any `AppIconName` above is not in the icon set, substitute the nearest existing name — verify
against `components/AppIcon.tsx`.)

- [ ] **Step 9: Type-check, run all new tests, commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit && npm test -- __tests__/services/notificationPreferences.service.test.ts
git add cost-share-app/apps/mobile/services/notificationPreferences.service.ts cost-share-app/apps/mobile/hooks/queries/useNotificationPreferences.ts cost-share-app/apps/mobile/components/settings/SettingsToggleRow.tsx cost-share-app/apps/mobile/screens/profile/NotificationSettingsScreen.tsx cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json cost-share-app/apps/mobile/__tests__/services/notificationPreferences.service.test.ts
git commit -m "feat(push/mobile): notification preferences screen + service"
```

---

### Task 3.10: Wire the preferences screen into navigation + Settings

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`
- Modify: `cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx`

- [ ] **Step 1: Register the route** in `ProfileStack` (so it pushes within the Profile tab):

```typescript
            <Stack.Screen
                name="NotificationSettings"
                component={NotificationSettingsScreen}
                options={{ title: t('notifications.title') }}
            />
```
Import: `import { NotificationSettingsScreen } from '../screens/profile/NotificationSettingsScreen';`

- [ ] **Step 2: Add a Settings entry** in `SettingsScreen.tsx`, inside the general
`SettingsSection`, mirroring the existing language/currency rows:

```typescript
                    <SettingsRow
                        iconName="notifications-outline"
                        label={t('notifications.title')}
                        variant="chevron"
                        onPress={() => navigation.navigate('NotificationSettings')}
                    />
```
(Confirm `navigation` is available in `SettingsScreen`; if it uses `useNavigation()`, add it.)

- [ ] **Step 3: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/navigation/AppNavigator.tsx cost-share-app/apps/mobile/screens/profile/SettingsScreen.tsx
git commit -m "feat(push/mobile): link notification settings from Settings"
```

---

### Task 3.11: Contextual permission priming + "enable in Settings" banner

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/usePushPermissionPrompt.ts`
- Create: `cost-share-app/apps/mobile/components/notifications/EnableNotificationsBanner.tsx`
- Modify: `cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx` (render the banner)

- [ ] **Step 1: Implement `usePushPermissionPrompt.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPermissionStatus, requestPermission } from '../lib/pushNotifications';
import { syncPushRegistrationOnSignIn } from '../lib/pushRegistrationLifecycle';

const COOLDOWN_KEY = 'push_priming_last_declined_at';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PushPromptState {
    status: 'unknown' | 'granted' | 'denied' | 'undetermined';
    showBanner: boolean;
    promptSoftAsk: () => Promise<void>;
    refresh: () => Promise<void>;
}

export function usePushPermissionPrompt(): PushPromptState {
    const [status, setStatus] = useState<PushPromptState['status']>('unknown');
    const [cooldownPassed, setCooldownPassed] = useState(false);

    const refresh = useCallback(async () => {
        const s = await getPermissionStatus();
        setStatus(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined');
        const last = Number((await AsyncStorage.getItem(COOLDOWN_KEY)) ?? 0);
        setCooldownPassed(Date.now() - last > COOLDOWN_MS);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const promptSoftAsk = useCallback(async () => {
        const granted = await requestPermission();
        if (granted) {
            await syncPushRegistrationOnSignIn();
        } else {
            await AsyncStorage.setItem(COOLDOWN_KEY, String(Date.now()));
        }
        await refresh();
    }, [refresh]);

    // Banner shows only when not granted AND the 7-day cooldown has elapsed.
    const showBanner = status !== 'granted' && status !== 'unknown' && cooldownPassed;

    return { status, showBanner, promptSoftAsk, refresh };
}
```

- [ ] **Step 2: Implement `EnableNotificationsBanner.tsx`**

```typescript
import React from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    mode: 'soft-ask' | 'open-settings';
    onEnable: () => void;
    onDismiss: () => void;
}

export function EnableNotificationsBanner({ mode, onEnable, onDismiss }: Props) {
    const { t } = useTranslation();
    const primary = mode === 'soft-ask' ? onEnable : () => { void Linking.openSettings(); };
    const label = mode === 'soft-ask' ? t('notifications.primingEnable') : t('notifications.openSettings');
    const body = mode === 'soft-ask' ? t('notifications.primingBody') : t('notifications.systemDisabled');

    return (
        <View className="mx-4 my-2 rounded-2xl bg-white p-4 flex-row items-center">
            <AppIcon name="notifications-outline" size={22} color={colors.primary} />
            <View className="flex-1 ms-3">
                <Text className="text-sm text-gray-900">{body}</Text>
                <TouchableOpacity onPress={primary} className="mt-1">
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>{label}</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onDismiss} testID="banner-dismiss">
                <AppIcon name="close" size={18} color={colors.gray400} />
            </TouchableOpacity>
        </View>
    );
}
```

- [ ] **Step 3: Render the banner at the top of the Activity feed**

In `ActivityFeedScreen.tsx`, use the hook and render the banner above the list. The soft-ask is
shown on first visit when status is `undetermined`; the open-settings variant when `denied`:
```typescript
    const { status, showBanner, promptSoftAsk } = usePushPermissionPrompt();
    const [dismissed, setDismissed] = useState(false);
    // ... inside the returned list header:
    {!dismissed && (status === 'undetermined' || showBanner) && (
        <EnableNotificationsBanner
            mode={status === 'undetermined' ? 'soft-ask' : 'open-settings'}
            onEnable={() => void promptSoftAsk()}
            onDismiss={() => setDismissed(true)}
        />
    )}
```
Imports:
```typescript
import { usePushPermissionPrompt } from '../../hooks/usePushPermissionPrompt';
import { EnableNotificationsBanner } from '../../components/notifications/EnableNotificationsBanner';
```

- [ ] **Step 4: Type-check + commit**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/usePushPermissionPrompt.ts cost-share-app/apps/mobile/components/notifications/EnableNotificationsBanner.tsx cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx
git commit -m "feat(push/mobile): contextual permission priming + enable banner"
```

---

## Phase 4 — Credentials, end-to-end verification, integration

> This phase needs real Apple/Firebase credentials and physical devices (push does **not** work in
> the iOS Simulator). It requires the PM/owner to authorize Apple + Firebase steps. The code from
> Phases 1–3 compiles and unit-tests pass without these — but no push is delivered until they are done.

### Task 4.1: EAS push credentials (iOS APNs + Android FCM)

**Files:**
- Modify (if needed): `cost-share-app/apps/mobile/eas.json`, `app.json` (`android.googleServicesFile`)

- [ ] **Step 1: iOS APNs key**

```bash
cd cost-share-app/apps/mobile
eas credentials
# → iOS → (production) → Push Notifications: set up a Push Key (APNs) under Apple Team K3M6R85KA6
```

- [ ] **Step 2: Android FCM v1**
  - In the Firebase console, create / select a project for package `com.copay.mobile`.
  - Download `google-services.json`; place it at `cost-share-app/apps/mobile/google-services.json`
    and reference it in `app.json`:
    ```json
    "android": { "googleServicesFile": "./google-services.json" }
    ```
  - Upload the FCM **V1 service account** JSON to EAS:
    ```bash
    eas credentials
    # → Android → (production) → Google Service Account → FCM V1 service account key
    ```

- [ ] **Step 3: Commit any config changes** (do NOT commit `google-services.json` if it is
git-ignored for secrets; confirm `.gitignore`).

```bash
git add cost-share-app/apps/mobile/app.json
git commit -m "chore(push): reference google-services.json for Android FCM"
```

---

### Task 4.2: Wire the backend secrets per environment (dev first)

- [ ] **Step 1:** Follow `docs/SSOT/PUSH_NOTIFICATIONS_SETUP.md` for the **dev** project
  (`drxfbicunusmipdgbgdk`): create the two Vault secrets, set `PUSH_WEBHOOK_SECRET`, deploy
  `send-push`.

- [ ] **Step 2: Verify the trigger reaches the function**

In the dev SQL editor, insert a synthetic activity row addressed to a user that has a device
token, with a *different* actor so the trigger fires:
```sql
-- replace the UUIDs with a real recipient (with a token) and a different actor
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata)
VALUES ('<RECIPIENT_UUID>', 'friend_request_received', NULL, gen_random_uuid(), '<ACTOR_UUID>', '{}'::jsonb);

SELECT status, last_error, sent_at FROM push_deliveries ORDER BY created_at DESC LIMIT 1;
```
Expected: a `push_deliveries` row appears with `status = 'sent'` (or `skipped`/`failed` with a
clear reason). Also check `supabase functions logs send-push`.

---

### Task 4.3: On-device end-to-end verification checklist

Build a dev/preview client for each platform and run the checklist on a **physical device**:
```bash
cd cost-share-app
npm run mobile:ios:device        # iOS device
npm run mobile:android           # Android device
```

- [ ] Fresh install → no permission prompt on first launch (priming, not cold-ask).
- [ ] Open Activity (or create/join a group) → soft-ask banner appears → tap Enable → OS dialog → grant.
- [ ] A token row exists in `device_tokens` for the signed-in user (verify in dev DB).
- [ ] From a *second* account, add an expense in a shared group → first device receives a push with
      the group in the title and `הוצאה חדשה מאת …` (or English per the recipient's language).
- [ ] Repeat for each kind: settlement, group chat message, friend request, group add, member joined, group removed.
- [ ] Tapping each notification opens the correct screen (group / friends / groups list).
- [ ] App-icon badge shows the unread count; opening Activity clears it to 0.
- [ ] In Notification settings, turn off "Group chat" → a new message produces **no** push, but still
      appears in the Activity feed.
- [ ] Turn off the master switch → no pushes of any kind.
- [ ] Sign out → the other account's new expense produces **no** push to the signed-out device.
- [ ] Deny permission once, wait (or clear the cooldown key) → the "open settings" banner appears and opens OS settings.
- [ ] Confirm you never receive a push for **your own** action.

- [ ] **Record results** in the PR description. Fix any failures by returning to the relevant
  Phase 1–3 task (use `superpowers:systematic-debugging` for non-obvious failures).

---

### Task 4.4: Finish the development branch

- [ ] **Step 1: Full check**

```bash
cd cost-share-app/apps/mobile && npm test && npx tsc --noEmit
cd ../supabase/functions/send-push && deno test --allow-net --allow-read --allow-env
```
Expected: all green.

- [ ] **Step 2: Integrate** using `superpowers:finishing-a-development-branch` — open a PR from
  `dev` (squash or merge per repo convention), or merge back to `main`, then remove the worktree.
  This returns the work to `main` as requested.

- [ ] **Step 3: Production rollout** (after merge): run the Phase-4.2 setup + `send-push` deploy +
  EAS production credentials against the **production** project (`jfqxjjjbpxbwwvoygahu`), then ship
  the store build.

---

## Self-review

- **Spec coverage:** all 7 kinds push (render.ts + KIND_TO_PREF), 1:1 via activity_events trigger
  (Task 1.5), Expo Push (Task 2.4), self-exclusion (trigger `WHEN` + handler), preferences screen +
  server enforcement (Tasks 1.4/2.5/3.9), permission priming + settings banner (Task 3.11), he/en
  copy without brackets (Task 2.3), badge sync (Task 3.8), multi-device (per-token send), logout
  (Task 3.6), foreground handler (Task 3.5). Non-goals (inbox, muting, quiet hours) correctly absent.
- **Type consistency:** `PrefsRow` columns and `KIND_TO_PREF` keys match the DB columns
  (Task 1.2); `NotificationPreferences` camelCase (shared) ↔ snake_case mapping (Task 3.9);
  `ActivityKind`/`KIND_TO_CATEGORY` cover the same 7 kinds everywhere; `data` payload shape
  (`kind/groupId/refId/activityEventId`) is identical in handler.ts and pushTapRouting.ts.
- **Open items the PM must authorize:** Apple APNs key, Firebase/FCM project, final Hebrew copy.

