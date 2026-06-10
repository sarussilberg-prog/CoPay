# Notifications System — Design Spec

Date: 2026-05-20
Branch: dev
Status: **brainstormed; pending implementation plan**

## Goal

Build an end-to-end mobile push + in-app notifications system for CoPay, so users:

1. Receive a high-quality push notification on iOS/Android when something relevant happens in a group they belong to (a friend added an expense, settled up, joined or left the group).
2. See a persistent inbox inside the app with the full notification history, even for events that arrived while the device was offline or the user was inside the app.
3. Control per-category which events generate a push, which generate an in-app entry, and can mute notifications from a specific group entirely.
4. Get an elegant in-app banner ("toast") instead of an OS notification when the app is in the foreground, with smooth motion, haptic feedback, and tap-to-navigate.

Web and email channels are out of scope; mobile only.

---

## Locked decisions (from brainstorming)

| # | Topic | Decision |
|---|---|---|
| 1 | Channels in scope | Mobile push + In-app inbox. No email, no web push, no SMS. |
| 2 | Pending-invite notifications | None — users join via link or direct add. No "you have a pending invite" event. |
| 3 | Categories | Three: **friendships** (member events), **expenses**, **transfers** (settlements). Each user controls push and in-app independently → 6 toggles. |
| 4 | Events covered | 9 event types: `member_joined`, `member_left`, `member_added_self`, `expense_added`, `expense_updated`, `expense_deleted`, `settlement_recorded`, `settlement_updated`, `settlement_deleted`. |
| 5 | Mute a specific group | Yes — boolean toggle per (user, group). Temporary mute (1h / 1d / 1w) deferred to tech debt. |
| 6 | Proactive debt reminders | Deferred to tech debt — reactive notifications first. |
| 7 | Quiet hours | Deferred to tech debt — OS-level Focus modes cover most users. |
| 8 | Dedup / batching | Per-recipient `dedup_key` prevents duplicate rows. Client-side grouping via iOS thread-id and Android channel — DB still stores one row per event. |
| 9 | App icon badge | Yes — equals unread count in `notifications` for the recipient. |
| 10 | Push content privacy | Full content (actor name, group name, amount, currency). OS-level "hide sensitive content" covers privacy-conscious users. App-level toggle deferred to tech debt. |
| 11 | Permission prompt timing | Soft pre-prompt after user joins their first group, then OS prompt if accepted. Re-prompt after 7-day cooldown if declined. |
| 12 | Architecture | DB triggers / RPCs create rows in `notifications` (single source of truth). Database Webhook fires `send-push` Edge Function async. Realtime subscription delivers in-app updates. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  USER ACTION (RPC: add_expense, record_settlement, ...)         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ INSERT/UPDATE/DELETE
                             ▼
                  ┌──────────────────────────┐
                  │ expenses / settlements / │
                  │ group_members            │
                  └──────────┬───────────────┘
                             │ called by RPC (or AFTER trigger fallback)
                             ▼
                  ┌──────────────────────────┐
                  │ SECURITY DEFINER fanout  │ ← notification_preferences
                  │ SQL function             │ ← notification_mutes
                  └──────────┬───────────────┘
                             │ INSERT N rows
                             ▼
                  ┌──────────────────────────┐
                  │   notifications table    │  single source of truth
                  └──────┬────────────┬──────┘
                         │            │
        ┌────────────────┘            └──────────────────┐
        │ Realtime (per-user)         Database Webhook   │
        ▼                             ▼                   │
┌──────────────────┐         ┌────────────────────────┐  │
│  Mobile client   │         │ Edge fn: send-push     │  │
│  - inbox        │         │ - reads device_tokens   │  │
│  - badge counter │         │ - renders title/body   │  │
│  - in-app toast  │         │ - POSTs Expo Push API  │  │
└──────────────────┘         │ - updates push_status  │  │
                              └───────────┬────────────┘  │
                                          ▼               │
                                 ┌──────────────────┐    │
                                 │  Expo Push API   │    │
                                 │  → APNs / FCM    │    │
                                 └────────┬─────────┘    │
                                          ▼               │
                                 ┌────────────────────────┘
                                 │ Device (foreground/bg/killed)
                                 └────────────────────────┘
```

### Design principles

1. **Single source of truth.** Every notification is a row in `notifications`. Inbox reads it. Push is built from it. Badge counts it. If the row exists, the user will see the notification — via push, Realtime, or the next app open.
2. **Atomic fanout.** Notification rows are inserted in the same transaction as the business event. If the RPC fails, no orphan notifications.
3. **Async push delivery.** The Database Webhook fires `send-push` *after* commit. The user-facing RPC returns quickly; push delivery is not on the critical path.
4. **At-least-once delivery.** Better to deliver a notification twice than to miss one. Idempotency is enforced via `dedup_key` (unique per recipient).
5. **Privacy-by-config.** Stored payload is structured (`event_type` + `params` JSONB). Rendering to display text happens via shared i18n templates used by both the Edge Function (for push body) and the mobile client (for inbox rows). Same source → same text.
6. **Isolation.** Each unit has one responsibility and an explicit interface (fanout SQL functions, the Edge Function, the shared content lib, the mobile service). All testable in isolation.

### Component map

| Component | Layer | Responsibility | Depends on |
|---|---|---|---|
| `notifications` / `device_tokens` / `notification_preferences` / `notification_mutes` schemas | DB | Persistence + RLS | — |
| `fanout_*` SQL functions | DB | Per-event recipient resolution and INSERT batch | prefs, mutes, business tables |
| RPCs wrapping business writes | DB | Atomic INSERT/UPDATE/DELETE + fanout call | fanout_* |
| `send-push` Edge Function | Edge | Token lookup, content render, Expo Push call, status update | notifications, device_tokens, shared content lib |
| `retry-push` Edge Function (cron) | Edge | Retry failed pushes (up to 3 attempts within 24h) | notifications |
| `@copay/shared/notifications/content` | shared/ | i18n template rendering (used by Edge + Mobile) | i18n locale data |
| `notifications.service` (mobile) | Mobile | Token registration, foreground handler, deep link extraction | expo-notifications |
| Inbox screen | Mobile | List view, mark-read, pagination, swipe-delete | Realtime hook |
| Settings section | Mobile | Preference toggles, OS permission status | RPCs |
| InAppToast component | Mobile | Foreground notification UI | notification listener |

---

## Database schema

### `device_tokens`

```sql
CREATE TABLE device_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token            text NOT NULL UNIQUE,
  platform         text NOT NULL CHECK (platform IN ('ios','android')),
  device_id        text,
  app_version      text,
  locale           text,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  disabled_at      timestamptz,
  disabled_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE disabled_at IS NULL;
```

RLS: SELECT/INSERT/UPDATE/DELETE own only. Edge Functions use `service_role`.

### `notifications`

```sql
CREATE TYPE notification_category AS ENUM ('friendships','expenses','transfers');

CREATE TYPE notification_event AS ENUM (
  'member_joined','member_left','member_added_self',
  'expense_added','expense_updated','expense_deleted',
  'settlement_recorded','settlement_updated','settlement_deleted'
);

CREATE TYPE push_status AS ENUM (
  'pending','sent','failed','skipped','unsubscribed'
);

CREATE TABLE notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  category           notification_category NOT NULL,
  event_type         notification_event NOT NULL,
  group_id           uuid REFERENCES groups(id) ON DELETE CASCADE,
  entity_type        text,
  entity_id          uuid,
  params             jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at            timestamptz,
  push_status        push_status NOT NULL DEFAULT 'pending',
  push_attempts      int NOT NULL DEFAULT 0,
  push_last_attempt  timestamptz,
  push_error         text,
  push_sent_at       timestamptz,
  dedup_key          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_inbox ON notifications(recipient_user_id, created_at DESC);
CREATE INDEX idx_notif_unread ON notifications(recipient_user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notif_push_queue ON notifications(push_status, created_at)
  WHERE push_status = 'pending';
CREATE UNIQUE INDEX uniq_notif_dedup ON notifications(recipient_user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
```

RLS:
- `SELECT`: only `recipient_user_id = auth.uid()`.
- `UPDATE`: only `recipient_user_id = auth.uid()`, and only the `read_at` column (enforced via column-list policy).
- `DELETE`: only `recipient_user_id = auth.uid()` — users may clear their own history.
- `INSERT`: only `service_role` and `SECURITY DEFINER` SQL functions.

### `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  user_id            uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  friendships_push   bool NOT NULL DEFAULT true,
  friendships_inapp  bool NOT NULL DEFAULT true,
  expenses_push      bool NOT NULL DEFAULT true,
  expenses_inapp     bool NOT NULL DEFAULT true,
  transfers_push     bool NOT NULL DEFAULT true,
  transfers_inapp    bool NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

Row created lazily on first read or via extension to existing `handle_new_user()` trigger. Default values mean "everything on" — explicit opt-out, not opt-in.

Semantics:
- `*_inapp = false` → no `notifications` row created at all (silently skipped in fanout).
- `*_push = false` → row created with `push_status = 'skipped'` (visible in inbox, no push sent).

RLS: SELECT/UPSERT own only.

### `notification_mutes`

```sql
CREATE TABLE notification_mutes (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  muted_until  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);
```

Mute is active when `muted_until IS NULL OR muted_until > now()`. v1 UI exposes only on/off (NULL or no row). Temporary mute deferred to tech debt.

RLS: SELECT/INSERT/DELETE own only.

### Public RPCs

```
register_device_token(p_token text, p_platform text, p_device_id text, p_app_version text, p_locale text)
  → upsert by token; sets last_seen_at = now(); clears disabled_at on re-registration.

unregister_device_token(p_token text)
  → sets disabled_at = now(), disabled_reason = 'user_logout'.

mark_notification_read(p_notification_id uuid)
  → sets read_at = now() if recipient_user_id = auth.uid().

mark_all_read()
  → sets read_at = now() on all unread for auth.uid().

update_notification_preferences(p_prefs jsonb)
  → upsert by user_id = auth.uid(), validates booleans.

toggle_group_mute(p_group_id uuid, p_muted bool)
  → INSERT or DELETE (user_id, group_id) row.
```

---

## Events and fanout

### Fanout strategy

Business RPCs wrap the underlying write *and* call the corresponding `fanout_*` function in the same transaction. This avoids the race condition where an `AFTER INSERT` trigger fires before related rows (e.g., `expense_splits`) are committed.

`AFTER INSERT`/`UPDATE`/`DELETE` triggers exist as a safety net for writes that bypass the RPCs (admin SQL, future automation), calling the same fanout functions with a best-effort `actor_user_id`.

### `fanout_expense_added` (illustrative)

```sql
CREATE OR REPLACE FUNCTION fanout_expense_added(p_expense_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_expense    expenses%ROWTYPE;
  v_actor_name text;
  v_group_name text;
  v_rec        record;
BEGIN
  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO v_actor_name FROM profiles WHERE id = p_actor;
  SELECT name INTO v_group_name FROM groups WHERE id = v_expense.group_id;

  FOR v_rec IN
    SELECT DISTINCT es.user_id AS recipient_id,
           COALESCE(np.expenses_inapp, true) AS inapp_on,
           COALESCE(np.expenses_push,  true) AS push_on,
           EXISTS(
             SELECT 1 FROM notification_mutes nm
             WHERE nm.user_id = es.user_id
               AND nm.group_id = v_expense.group_id
               AND (nm.muted_until IS NULL OR nm.muted_until > now())
           ) AS is_muted
    FROM expense_splits es
    LEFT JOIN notification_preferences np ON np.user_id = es.user_id
    WHERE es.expense_id = p_expense_id
      AND es.user_id != p_actor
  LOOP
    CONTINUE WHEN NOT v_rec.inapp_on OR v_rec.is_muted;

    INSERT INTO notifications (
      recipient_user_id, actor_user_id, category, event_type,
      group_id, entity_type, entity_id, params, push_status, dedup_key
    ) VALUES (
      v_rec.recipient_id, p_actor, 'expenses', 'expense_added',
      v_expense.group_id, 'expense', v_expense.id,
      jsonb_build_object(
        'actor_name',    v_actor_name,
        'group_name',    v_group_name,
        'expense_title', v_expense.title,
        'amount',        v_expense.amount,
        'currency',      v_expense.currency
      ),
      CASE WHEN v_rec.push_on THEN 'pending'::push_status ELSE 'skipped'::push_status END,
      'expense:' || v_expense.id || ':added'
    )
    ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING;
  END LOOP;
END $$;
```

### Event catalog

| Event | Triggered by | Recipients | Actor |
|---|---|---|---|
| `expense_added` | RPC `add_expense` | Members in split, except actor | Expense creator |
| `expense_updated` | RPC `update_expense` (only when amount / split / payer / title changed) | Union of old-split and new-split members, except actor | Updater |
| `expense_deleted` | RPC `delete_expense` | Old-split members, except actor | Deleter |
| `settlement_recorded` | RPC `record_settlement` | The other party (payer or payee, whichever isn't actor) | Settlement creator |
| `settlement_updated` | RPC `update_settlement` (only on amount / parties changed) | The other party | Updater |
| `settlement_deleted` | RPC `delete_settlement` | The other party | Deleter |
| `member_joined` | RPC `redeem_group_invite` / `add_group_member` | Other members of the group, except actor | Joiner (self-join) or adder (admin) |
| `member_added_self` | RPC `add_group_member` (direct add) | The newly-added user only | The adder |
| `member_left` | RPC `leave_group` / `remove_group_member` | Remaining members, except actor | Leaver or remover |

### Recipient-set safety

Fanout functions run as `SECURITY DEFINER` (bypass RLS during recipient resolution). To avoid inserting notifications for users who aren't actually in the group, recipients are *always* read from authoritative tables (`expense_splits`, `group_members`). The `ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING` guards against double-fire (e.g., RPC + trigger).

---

## Edge Functions

### `send-push` (`supabase/functions/send-push/index.ts`)

Triggered by Database Webhook on `notifications INSERT`.

Flow:
1. Parse webhook payload → notification row.
2. Early exit if `push_status != 'pending'` (already skipped or sent).
3. `SELECT * FROM device_tokens WHERE user_id = recipient_user_id AND disabled_at IS NULL`.
4. If no tokens → UPDATE `push_status = 'unsubscribed'`, return 200.
5. Resolve locale: `profiles.locale` → `device_tokens.locale` → `'en'`.
6. Render title + body via `@copay/shared/notifications/content`.
7. Compute current unread badge count for recipient.
8. POST batched payload to `https://exp.host/--/api/v2/push/send` with `Authorization: Bearer EXPO_ACCESS_TOKEN`.
9. Inspect response:
   - All tokens succeed → UPDATE `push_status='sent'`, `push_sent_at=now()`.
   - Some `DeviceNotRegistered` → disable those tokens; status reflects remaining outcomes.
   - All failed / network error → UPDATE `push_status='failed'`, `push_attempts++`, `push_error=<msg>`.
10. Always return 200 (errors handled internally; we drive retries from `retry-push`, not webhook retries).

Push payload per token:

```typescript
{
  to: token,
  title: renderedTitle,
  body:  renderedBody,
  data: {
    notification_id: row.id,
    event_type:      row.event_type,
    entity_type:     row.entity_type,
    entity_id:       row.entity_id,
    group_id:        row.group_id,
    deep_link:       buildDeepLink(row),
  },
  sound: 'default',
  badge: unreadCount,
  channelId: row.category,
  ...(platform === 'ios' && {
    threadId: `${row.category}:${row.group_id}`,
  }),
}
```

### `retry-push` (cron, every 5 min)

```
SELECT id FROM notifications
WHERE push_status = 'failed'
  AND push_attempts < 3
  AND created_at > now() - interval '24 hours'
  AND (push_last_attempt IS NULL OR push_last_attempt < now() - interval '5 minutes')
LIMIT 100
```

For each → re-run `send-push` core logic (shared module). After 3 attempts the row remains `failed`; the user still sees it in the inbox.

Scheduled via `pg_cron`:

```sql
SELECT cron.schedule(
  'retry-push',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/retry-push',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.retry_push_secret'))
     ); $$
);
```

### Secrets

| Secret | Location | Purpose |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | Edge Function secret | Auth for Expo Push API |
| `SERVICE_ROLE_KEY` | auto-injected | UPDATE notifications, READ device_tokens |
| Webhook secret | Webhook config | Auth that incoming request is from Supabase |

---

## Shared content rendering

File: `cost-share-app/packages/shared/src/notifications/content.ts`

The Edge Function and the mobile app both render notification text from the same module. This guarantees that the push body and the inbox row show identical text, and that fixing a template fixes both surfaces.

```typescript
export const notificationTemplates = {
  expense_added: {
    en: (p) => ({
      title: `${p.actor_name} added to "${p.group_name}"`,
      body:  `${p.expense_title} — ${formatMoney(p.amount, p.currency)}`,
    }),
    he: (p) => ({
      title: `${p.actor_name} הוסיף/ה ל"${p.group_name}"`,
      body:  `${p.expense_title} — ${formatMoney(p.amount, p.currency)}`,
    }),
  },
  // ... 9 events × 2 locales = 18 templates
};

export function renderNotification(
  event: NotificationEvent,
  params: NotificationParams,
  locale: 'en' | 'he' = 'en'
): { title: string; body: string } {
  const template = notificationTemplates[event]?.[locale]
                 ?? notificationTemplates[event].en;
  return template(params);
}
```

Locale resolution priority: `profiles.locale` → `device_tokens.locale` → `'en'`.

---

## Mobile client

### Dependencies

```
expo-notifications   — Push API, foreground handler, badge
expo-device          — Detect simulator vs real device
```

`app.json` additions:

```json
{
  "plugins": [
    ["expo-notifications", {
      "icon": "./assets/notification-icon.png",
      "color": "#<brand>",
      "defaultChannel": "default"
    }]
  ],
  "ios": {
    "infoPlist": { "UIBackgroundModes": ["remote-notification"] }
  }
}
```

### Token registration (`apps/mobile/services/notifications.service.ts`)

On app launch (after auth):
1. If `expo-device.isDevice === false` → skip (simulator).
2. Read current `Notifications.getPermissionsAsync()`.
3. If `granted` → fetch token via `getExpoPushTokenAsync({ projectId })` → call `register_device_token` RPC.
4. If `undetermined` → do nothing here; wait for soft-prompt trigger.
5. If `denied` → do nothing; Settings screen surfaces a CTA.

On locale change → re-register token (server uses `device_tokens.locale` to pick template language).

On logout → `unregister_device_token(currentToken)`.

### Soft permission prompt

Trigger: user joins their first group (groups_count transitions 0 → 1) AND permission state is `undetermined` AND no prior soft-prompt in the last 7 days (AsyncStorage key `last_softprompt_at`).

A branded modal explains the value and offers two actions:
- "כן, התראות" → call `requestPermissionsAsync()` → if granted, register token.
- "לא תודה" → store `last_softprompt_at = now()`.

Implemented as `apps/mobile/components/notifications/SoftPromptModal.tsx`, triggered from the post-join navigation guard.

### Foreground handler — InAppToast

```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,    // suppress OS banner in foreground
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

Notifications.addNotificationReceivedListener(notification => {
  showInAppToast(notification);
});
```

`apps/mobile/components/notifications/InAppToast.tsx`:

```
┌────────────────────────────────────────────────┐
│  [Avatar]  דנה הוסיפה הוצאה ל'דירה'           │
│            פיצה — ₪150              [ × ]      │
└────────────────────────────────────────────────┘
```

- Swipe-up → dismiss.
- Tap → mark read + navigate to entity.
- Auto-dismiss after 4s.
- Subtle haptic on appear (`Haptics.impactAsync(Light)`).
- Enter: slide-down + opacity, ~250ms spring (react-native-reanimated).
- Exit: slide-up.
- RTL-aware (avatar position flips in Hebrew).
- Safe-area aware (notch, dynamic island).
- Stacking: if ≥3 toasts arrive within 2s → collapse into a single "3 התראות חדשות" toast; expandable on tap.

Implementation built on top of the already-installed `react-native-toast-message` with a custom render. If stacking proves limiting, a tiny in-house queue can replace it.

### Background / killed tap

```typescript
Notifications.addNotificationResponseReceivedListener(response => {
  const { data } = response.notification.request.content;
  supabase.rpc('mark_notification_read', { p_notification_id: data.notification_id });
  navigateToEntity(data);
});
```

`expo-notifications` buffers the response until the listener is attached, so cold-start launches from a tapped notification are handled correctly.

### Realtime subscription (`apps/mobile/hooks/useNotifications.ts`)

```typescript
supabase
  .channel(`notifications:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `recipient_user_id=eq.${userId}`,
  }, payload => {
    queryClient.setQueryData(['notifications'], prev => [payload.new, ...prev]);
    incrementBadgeCount();
  })
  .subscribe();
```

Guarantees notifications appear in the inbox even if push delivery was slow or skipped.

### Deep link routing (`apps/mobile/services/notificationRouting.ts`)

```typescript
function navigateToEntity({ event_type, entity_type, entity_id, group_id }) {
  switch (event_type) {
    case 'expense_added':
    case 'expense_updated':
    case 'expense_deleted':
      navigation.navigate('GroupExpenseDetail', { groupId: group_id, expenseId: entity_id });
      break;
    case 'settlement_recorded':
    case 'settlement_updated':
    case 'settlement_deleted':
      navigation.navigate('GroupSettlements', { groupId: group_id });
      break;
    case 'member_joined':
    case 'member_left':
      navigation.navigate('GroupMembers', { groupId: group_id });
      break;
    case 'member_added_self':
      navigation.navigate('GroupHome', { groupId: group_id });
      break;
  }
}
```

Actual screen names are confirmed against the existing navigator during implementation.

### Inbox screen (`apps/mobile/screens/notifications/NotificationsInboxScreen.tsx`)

Entry point: new bell icon in the tab bar (or header, decided during implementation), with badge counter.

Layout:

```
┌──────────────────────────────────────────────┐
│  [<]   התראות               [סמן הכל כנקרא]  │
├──────────────────────────────────────────────┤
│                                              │
│  ● [Avatar] דנה הוסיפה הוצאה ל'דירה'        │
│             פיצה — ₪150        לפני 3 דק׳   │
│  ─────────────────────────────────────────  │
│  ● [Avatar] יוסי שילם לך ₪80                │
│             סיום חשבון ב'טיול'  לפני שעה   │
│  ─────────────────────────────────────────  │
│    [Avatar] רוני הצטרפ/ה ל'משפחה'           │
│                                  אתמול       │
│                                              │
└──────────────────────────────────────────────┘
```

- `●` indicator when `read_at IS NULL`.
- Swipe-left → DELETE row (RLS allows).
- Tap → `mark_notification_read` + navigate.
- FlatList with page size 30 + infinite scroll.
- Pull-to-refresh.
- Empty state: subtle illustration + "אין התראות חדשות".
- Error state: retry button.

### Settings — extend `apps/mobile/screens/profile/SettingsScreen.tsx`

New section:

```
התראות
─────────────────────────────
סטטוס הרשאות:  [פעיל]   [פתח הגדרות מערכת ⇗]

קבל התראות על:                    Push    באפליקציה
──────────────────────────────────────────────────
חברויות (הצטרפות, עזיבה)         [●○]      [●○]
הוצאות (הוספה, עדכון, מחיקה)     [●○]      [●○]
העברות (סיום חשבונות)            [●○]      [●○]
```

- If OS-level permission is denied, push toggles are visually dimmed and disabled, with a CTA to open system settings.
- Toggle change calls `update_notification_preferences` (optimistic UI).

### Mute group — `GroupSettingsScreen` (existing)

New row:

```
[🔕] השתק התראות מקבוצה זו     [○●]
```

Calls `toggle_group_mute(group_id, muted)`.

### Badge management

App icon badge always equals `count(*) WHERE recipient_user_id = self AND read_at IS NULL`.

Updates triggered on:
- App foreground (sync from server).
- Realtime INSERT (++).
- `mark_notification_read` (--).
- `mark_all_read` (set 0).
- Logout (set 0).

Implementation via `Notifications.setBadgeCountAsync(n)`.

### Android channels

Initialized on first launch in `notifications.service.ts`:

```typescript
if (Platform.OS === 'android') {
  for (const id of ['friendships','expenses','transfers']) {
    await Notifications.setNotificationChannelAsync(id, {
      name: t(`notifications.channels.${id}`),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}
```

Channels are first-class on Android — users can mute one independently from the OS settings, which complements our in-app toggles.

### iOS thread grouping

Each push includes `threadId: `${category}:${group_id}``. iOS auto-stacks pushes with the same thread-id in the notification center, keeping the lock screen clean during bursty events.

---

## Testing strategy

### DB layer — pgTAP (`supabase/tests/notifications/*.sql`)

For each of the 9 fanout functions:
- Correct recipients (split members / group members minus actor).
- `*_inapp = false` → 0 rows.
- `*_push = false` → row exists with `push_status = 'skipped'`.
- Active mute → 0 rows.
- Expired mute (`muted_until < now()`) → row created.
- Calling fanout twice → only one row (dedup_key constraint).
- `params` JSONB contains required keys.

RLS:
- User A cannot SELECT user B's notifications.
- User cannot UPDATE columns other than `read_at`.
- `service_role` can INSERT; `anon` cannot.
- Device tokens isolation per user.

### Edge Functions — Deno tests

`supabase/functions/send-push/index.test.ts` and `retry-push/index.test.ts`, with mocked `fetch`:
- Happy path: valid token → POST to Expo + UPDATE `push_status='sent'`.
- No tokens → `push_status='unsubscribed'`, no Expo call.
- `push_status='skipped'` on input → no Expo call, return 200.
- Expo returns `DeviceNotRegistered` → `device_tokens.disabled_at = now()`.
- Expo returns 5xx → `push_status='failed'`, `push_attempts++`.
- Batch of 3 tokens, 1 fails → success for 2, disabled for failed token.
- Locale fallback: profiles.locale null → device_tokens.locale → 'en'.
- Title / body match `renderNotification()` output (snapshot).

### Shared content lib

`packages/shared/src/notifications/content.test.ts`:
- For each of 9 events × 2 locales (18 cases) → `renderNotification()` output matches snapshot.

### Mobile — Jest + RNTL

Unit:
- `notificationRouting.test.ts` — per event_type → expected `navigation.navigate` call.
- `useNotifications.test.ts` — Realtime mock pushes payload → state updates, badge increments.
- `notifications.service.test.ts` — simulator skips registration; granted permission → RPC called with correct args.
- `softPrompt.test.ts` — show/skip logic across permission states and timing.

Components:
- `InAppToast.test.tsx` — render, tap callback, swipe-up dismiss, auto-dismiss timer, RTL layout (`I18nManager.isRTL = true`).
- `NotificationsInboxScreen.test.tsx` — empty state, list render, unread indicator, swipe-delete optimistic, mark-all-read.
- `NotificationSettings.test.tsx` — toggle persistence, OS-denied disables push toggles with explanation.

Integration (Jest with mocked Supabase):
- Foreground notification arrives → toast renders + badge updates.
- Background tap → navigation triggered + `mark_notification_read` called.

### E2E — Maestro (`apps/mobile/.maestro/notifications/`)

**Flow 1 — Onboarding + first push:**
1. Login → join group via deep link.
2. Soft-prompt appears.
3. Tap "כן" → system permission → grant.
4. Test harness triggers `expense_added` on the recipient.
5. Push banner appears.
6. Tap → land on expense detail.

**Flow 2 — Settings:**
1. Open Settings → Notifications.
2. Toggle off "Push - הוצאות".
3. Trigger `expense_added` → inbox row appears, no push banner.
4. Toggle on → trigger `expense_updated` → push banner.

**Flow 3 — Mute group:**
1. Open group → toggle mute.
2. Trigger event → no notification anywhere.
3. Unmute → trigger event → notification arrives.

### Coverage targets

| Layer | Target |
|---|---|
| DB fanout functions | 100% (every branch) |
| Edge Functions | 90%+ |
| Shared content lib | 100% snapshot coverage |
| Mobile services / hooks | 85%+ |
| Mobile UI components | 75%+ |
| E2E | 3 core flows green |

---

## Rollout phases

### Phase 1 — Foundation (~1 week)
- Schema migration: 4 tables + types + RLS.
- RPCs: `register_device_token`, `unregister_device_token`, `update_notification_preferences`, `toggle_group_mute`, `mark_notification_read`, `mark_all_read`.
- Mobile: `notifications.service` + token registration on launch.
- Mobile: SoftPromptModal triggered after first group join.
- One end-to-end event: `expense_added` (fanout function + `add_expense` RPC wrapper).
- `send-push` Edge Function (no retry job yet, no advanced batching).
- Database Webhook configured.
- Manual validation across two real devices.

### Phase 2 — Coverage (~1.5 weeks)
- All 9 fanout functions implemented.
- All business RPCs wrap underlying writes with fanout calls.
- Realtime subscription + InAppToast (foreground).
- Settings screen — 3 categories × 2 channels.
- Mute group toggle in GroupSettings.
- NotificationsInboxScreen complete (pagination, swipe-delete, mark-read flows, empty state).
- Deep link routing for every event_type.
- Android channels, iOS thread grouping.
- Badge management.
- pgTAP + Edge Function tests + shared snapshots + mobile unit tests landing alongside features.

### Phase 3 — Polish & Resilience (~1 week)
- `retry-push` Edge Function + `pg_cron` schedule.
- Stacked toasts when bursty.
- Animations and haptics finalized.
- Maestro E2E flows green.
- Performance pass: index validation, fanout query plans, N+1 audit.
- Feature flag `notifications_enabled` for staged rollout.

### Phase 4 — Beta → GA
- Enable for 10% of users.
- Monitor: `push_status='failed'` rate, `push_status='sent'` rate, event→push P95 latency.
- If green: roll to 100%.
- Tech-debt items revisited per their trigger conditions (see `docs/SSOT/TECHNICAL_DEBT.md`).

---

## Open implementation details

These are intentionally deferred from the spec to the implementation plan, because they depend on the exact state of existing code at implementation time:

1. **Existing RPCs vs new ones.** Some operations may already have RPC wrappers (`redeem_group_invite` does). The plan will inventory existing entry points and decide whether to extend them or introduce new wrappers.
2. **Navigator screen names.** `navigateToEntity()` uses placeholder names (`GroupExpenseDetail`, etc.). The plan will reconcile against the actual navigator.
3. **`profiles.locale` source.** If a `locale` column does not yet exist on `profiles`, the plan adds it with a default of `'en'` and updates from device locale on registration.
4. **Bell icon placement.** Tab bar vs. header is a UI decision; the plan will assess current navigation density.
5. **Brand color / notification icon asset.** Provided during implementation.

---

## References

- Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
- Supabase Database Webhooks: https://supabase.com/docs/guides/database/webhooks
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- `docs/SSOT/TECHNICAL_DEBT.md` — deferred items and revisit conditions.
- `docs/superpowers/specs/2026-05-20-invites-and-sharing-design.md` — link-based join model that drives `member_joined` events.
