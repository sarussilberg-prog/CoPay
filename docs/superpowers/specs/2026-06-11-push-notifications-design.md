# Push Notifications (iOS + Android) — Design Spec

Date: 2026-06-11
Branch: dev
Status: **brainstormed; pending implementation plan**

## Goal

Add comprehensive, end-to-end **push notifications** for iOS and Android that are
**1:1 synced with the in-app Activity screen**. Every row written to the existing
`activity_events` table (the source of truth the Activity feed already reads) becomes
exactly one push-notification decision for its recipient. Users can control which
categories push them, and never get pushed about their own actions.

## Relationship to prior designs

- **Supersedes the push portion of** `2026-05-20-notifications-design.md`. That spec
  designed a separate `notifications` table as the source of truth, but it was never
  implemented — the leaner `activity_events` feed (`2026-05-26-activity-events-design.md`)
  shipped instead, **without any push layer**. This spec adds the push layer on top of the
  *actually-implemented* `activity_events`, while reusing the prior design's house patterns
  (`device_tokens` schema, `register_device_token` RPC, `send-push` Edge Function, push-status
  tracking, permission priming, badge = unread count, shared i18n rendering).
- **Builds on** `2026-05-26-activity-events-design.md` (implemented): table
  `public.activity_events`, watermark `profiles.activity_last_seen_at`, RPCs
  `mark_activity_seen()` and `get_activity_unread_count()` (the latter already excludes
  `actor_user_id = auth.uid()`).

## Current state (verified against live DB)

- `public.activity_events` exists (~1,234 rows). Columns: `id, user_id, kind, group_id,
  ref_id, actor_user_id, metadata jsonb, created_at`. `UNIQUE (user_id, kind, ref_id)`.
  Trigger-driven fan-out inserts **one row per active group member, including the actor**.
- `kind` ∈ `expense_added, settlement_added, message_posted, friend_request_received,
  group_added, group_member_joined, group_removed`.
- `profiles.language` exists (varchar, default `'en'`) → per-user localization (he/en).
- **No** push infrastructure exists: no `expo-notifications` in the mobile app, no
  `device_tokens` table, no `notification_preferences`, no `send-push` Edge Function.
  Only Edge Functions today: `invite-landing`, `admin-sentry-proxy`.
- Mobile app: Expo 54, RN 0.81, React Navigation (native-stack + bottom-tabs, **not**
  expo-router). iOS bundle `com.copay.mobile` (Apple Team `K3M6R85KA6`), Android
  `com.copay.mobile`, EAS owner `saussilberg`. Deep links already configured for
  `https://kupa.pro/i/*` and `https://kupa.pro/g/*`.

---

## Locked decisions (from this brainstorm)

| # | Topic | Decision |
|---|---|---|
| 1 | Event scope | **All 7** `activity_events` kinds push. 1:1 with the Activity screen. |
| 2 | Delivery | **Expo Push Service** (single API over APNs + FCM). |
| 3 | Trigger | **Supabase Database Webhook** on `activity_events` INSERT → `send-push` Edge Function. |
| 4 | Source of truth | `activity_events` (no new feed table; no separate in-app inbox). |
| 5 | Self-events | Never push when `actor_user_id = recipient user_id`. |
| 6 | Preferences | **Full preferences screen**: master toggle + per-category push toggles, stored in `notification_preferences`, enforced **server-side before send**. Default: all on. |
| 7 | Categories | 5: expenses, settlements, messages, friends, groups (maps the 7 kinds). |
| 8 | Permission timing | **Contextual priming** — no first-launch prompt. Soft pre-ask at first meaningful moment; OS dialog only if accepted; dismissible "notifications off → open Settings" banner for declined users (re-engagement after cooldown). |
| 9 | Copy | Localized he/en per `profiles.language`. **No `«»`/bracket quotes** — group name in the title, middle-dot `·` separators in the body. |
| 10 | Badge | App-icon badge = `get_activity_unread_count()`. Cleared when Activity screen is opened (existing `mark_activity_seen()`). |
| 11 | Multi-device | All of a user's registered devices receive the push. |
| 12 | Foreground | When app is foregrounded on the relevant screen, suppress the system banner (rely on existing realtime + badge). Otherwise show a foreground banner. |

---

## Architecture (Approach A)

```
┌─ Mobile (Expo) ───────────────┐        ┌─ Supabase ──────────────────────────────┐
│ expo-notifications            │        │  source tables (expenses, settlements,   │
│  • permission priming         │        │   group_messages, friend_requests, ...)  │
│  • register/unregister token  │─upsert→│           │ existing fan-out triggers     │
│  • foreground + tap handlers  │        │           ▼                               │
│  • preferences screen         │─upsert→│  activity_events  (source of truth)       │
│  • badge ↔ unread sync        │        │  device_tokens (new)                      │
└─────────────▲─────────────────┘        │  notification_preferences (new)           │
              │                          │  push_deliveries (new, status/retry)      │
              │ Expo Push                │           │ INSERT                         │
              │ (APNs + FCM)             │           ▼ Database Webhook               │
              └──────────────────────────│  Edge Function: send-push (new)           │
                                         │   • skip self-event                        │
                                         │   • load device_tokens + preferences       │
                                         │   • resolve actor/group/member names        │
                                         │   • render he/en via shared content lib     │
                                         │   • Expo Push API → record push_deliveries   │
                                         │   • disable tokens flagged by receipts       │
                                         │  Edge Function: retry-push (cron, new)      │
                                         └──────────────────────────────────────────────┘
```

### Principles

1. **One source of truth.** `activity_events` already decides *who is notified about what*
   (fan-out + dedup via `UNIQUE(user_id, kind, ref_id)`). Push is derived from it, so push
   and the Activity screen can never drift.
2. **Async, off the critical path.** The webhook fires after commit; the user-facing write
   (add expense, etc.) is never blocked by push delivery.
3. **Server-enforced preferences and self-exclusion.** Filtering happens in `send-push`,
   not the client, so it holds regardless of client version.
4. **Same text, both places.** A shared i18n content library renders notification copy;
   the Activity screen and the push body draw from the same templates and the same
   `profiles.language`.

---

## Components

| Component | Layer | Responsibility | Depends on |
|---|---|---|---|
| `device_tokens` / `notification_preferences` / `push_deliveries` schemas + RLS | DB | Persistence | profiles |
| `register_device_token` / `unregister_device_token` / `update_notification_preferences` RPCs | DB | Client-facing writes | tables above |
| Database Webhook on `activity_events` INSERT | DB | Fire `send-push` async | activity_events |
| `send-push` Edge Function | Edge | Self-exclusion, prefs check, name resolution, render, Expo Push call, receipt handling | device_tokens, notification_preferences, profiles, groups, shared content lib |
| `retry-push` Edge Function (cron) | Edge | Retry `failed` deliveries (≤3 attempts / 24h) | push_deliveries |
| `@cost-share/shared` notification content | shared | i18n template rendering (Edge + Mobile) | shared i18n + currency utils |
| `notifications.service` (mobile) | Mobile | Permission flow, token register/unregister, handlers, badge | expo-notifications |
| Notification preferences screen | Mobile | Master + per-category toggles, OS-permission status | RPCs |
| Permission priming + "enable in Settings" banner | Mobile | Contextual ask + re-engagement | expo-notifications, Linking |

---

## Data model

Naming follows the prior notifications design's vocabulary (`device_tokens`,
`register_device_token`) for cross-doc consistency; none of these tables exist yet.

### `device_tokens`
```sql
CREATE TABLE device_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token            text NOT NULL UNIQUE,           -- Expo push token
  platform         text NOT NULL CHECK (platform IN ('ios','android')),
  device_id        text,
  app_version      text,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  disabled_at      timestamptz,                    -- set on logout or invalid receipt
  disabled_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE disabled_at IS NULL;
```
RLS: user manages own rows only; `send-push` reads via `service_role`.

### `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  user_id          uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  push_enabled     bool NOT NULL DEFAULT true,     -- master switch
  expenses_push    bool NOT NULL DEFAULT true,
  settlements_push bool NOT NULL DEFAULT true,
  messages_push    bool NOT NULL DEFAULT true,
  friends_push     bool NOT NULL DEFAULT true,
  groups_push      bool NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```
- Row created lazily (missing row ⇒ treat as all-true defaults).
- Only **push** toggles exist — in-app visibility is always-on via `activity_events`.
- RLS: SELECT/UPSERT own only.

Category mapping (kind → preference column):
| kind | category | column |
|---|---|---|
| `expense_added` | expenses | `expenses_push` |
| `settlement_added` | settlements | `settlements_push` |
| `message_posted` | messages | `messages_push` |
| `friend_request_received` | friends | `friends_push` |
| `group_added` / `group_member_joined` / `group_removed` | groups | `groups_push` |

### `push_deliveries`
```sql
CREATE TYPE push_status AS ENUM ('pending','sent','failed','skipped');

CREATE TABLE push_deliveries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_event_id uuid NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status            push_status NOT NULL DEFAULT 'pending',
  attempts          int NOT NULL DEFAULT 0,
  expo_ticket_ids   text[],
  last_error        text,
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_event_id)
);
CREATE INDEX idx_push_deliveries_retry ON push_deliveries(status, created_at)
  WHERE status = 'failed';
```
- One row per activity_event delivery attempt → idempotency for webhook retries + retry-push.
- `skipped` records self-events and preference/permission opt-outs (observability).
- RLS: no client access (Edge `service_role` only).

### Public RPCs
```
register_device_token(p_token text, p_platform text, p_device_id text, p_app_version text)
  → upsert by token; clears disabled_at; sets last_seen_at = now().
unregister_device_token(p_token text)
  → disabled_at = now(), disabled_reason = 'user_logout'.
update_notification_preferences(p_prefs jsonb)
  → upsert own row; validates booleans.
```

---

## Delivery flow (`send-push`)

Invoked by the Database Webhook with the inserted `activity_events` row.

1. **Idempotency.** Upsert a `push_deliveries` row for `activity_event_id`; if already
   `sent`, exit.
2. **Self-exclusion.** If `actor_user_id = user_id` → mark `skipped`, exit. (Fan-out
   includes the actor; we never notify someone about their own action.)
3. **Preferences.** Load recipient `notification_preferences`. If `push_enabled = false` or
   the kind's category column is `false` → `skipped`, exit.
4. **Tokens.** Load recipient `device_tokens WHERE disabled_at IS NULL`. None → `skipped`.
5. **Resolve display data** (single query set): actor name (`profiles` by
   `actor_user_id`), group name (`groups` by `group_id`), new-member name
   (`profiles` by `metadata.new_member_user_id` for `group_member_joined`). Amount/currency/
   description/body come from `metadata`.
6. **Render** title/body using the shared content library and recipient `profiles.language`.
7. **Send** one Expo Push message per token (with `data` payload for navigation, see below),
   store the returned ticket ids in `expo_ticket_ids`, set `status = sent`, `sent_at = now()`.
   Immediate ticket errors (e.g. `DeviceNotRegistered`) disable the offending token right away.

`retry-push` (cron, e.g. every 15 min) does two jobs:
- **Receipts.** Fetch Expo *receipts* for `sent` deliveries from the previous run (Expo
  recommends waiting ~15 min). On `DeviceNotRegistered` / invalid-token receipts, set the
  offending `device_tokens.disabled_at`.
- **Retry.** Re-attempt `failed` rows, ≤3 attempts within 24h, then give up.

**Data payload** sent with every push (drives tap navigation):
```json
{ "kind": "expense_added", "groupId": "...", "refId": "...", "activityEventId": "..." }
```

---

## Notification content (he / en)

Rendered by the shared content library, keyed by `kind`, localized by `profiles.language`.
Group name lives in the **title**; the body uses middle-dot `·` separators. **No bracket
quotes.** Amounts use the shared currency formatter (symbol when known: `₪ $ €`, else code).

| kind | he — title | he — body | en — title | en — body |
|---|---|---|---|---|
| expense_added | `{group}` | `הוצאה חדשה מאת {actor} · {description} · {amount}{cur}` | `{group}` | `New expense from {actor} · {description} · {amount}{cur}` |
| settlement_added | `{group}` | `תשלום חדש מאת {actor} · {amount}{cur}` | `{group}` | `New payment from {actor} · {amount}{cur}` |
| message_posted | `{actor} · {group}` | `{body}` | `{actor} · {group}` | `{body}` |
| friend_request_received | `בקשת חברות חדשה` | `{actor} רוצה להתחבר איתך` | `New friend request` | `{actor} wants to connect` |
| group_added | `צורפת לקבוצה` | `{actor} צירף אותך · {group}` | `You were added to a group` | `{actor} added you · {group}` |
| group_member_joined | `{group}` | `{newMember} הצטרף לקבוצה` | `{group}` | `{newMember} joined the group` |
| group_removed | `{group}` | `הוסרת מהקבוצה` | `{group}` | `You were removed from the group` |

Hebrew copy is intentionally **gender-neutral via noun-led phrasing** (no verb gender
agreement, since the app stores no gender). Final wording is the PM's to approve/adjust.

---

## Permission strategy (contextual priming)

No permission prompt on first launch. Instead:

1. **Soft pre-ask** at the first meaningful moment — when the user creates/joins their first
   group, or first opens the Activity screen. Our own UI: *"רוצה לדעת כשחבר מוסיף הוצאה או
   משלם? → הפעל התראות / לא עכשיו."* Only "הפעל" triggers the OS dialog. This protects the
   one-time OS prompt for likely-accepters.
2. **OS dialog** (`expo-notifications` permission request) fires only after the soft yes.
3. **Declined / disabled users** see a dismissible banner at the top of the Activity screen:
   *"התראות כבויות — הפעל בהגדרות"* that opens the OS app-settings via `Linking`. Re-shown
   after a **7-day cooldown** if still disabled (stored locally).

> Platform reality (documented for the PM): on **iOS** the OS permission dialog can be shown
> **only once, ever**. After a decline, re-prompting does nothing — the only path back is OS
> Settings, which is exactly what the banner opens. On **Android 13+** the
> `POST_NOTIFICATIONS` permission can be re-requested in some cases; the banner still routes
> to Settings as the reliable path.

Permission state is checked on every app foreground to keep the banner and the preferences
screen's "system permission" status accurate.

---

## Tap → navigation

`expo-notifications` response listener reads the `data` payload and navigates via the
navigation ref to the **same destinations as an Activity-feed tap**:

| kind | destination |
|---|---|
| expense_added | Group → expense detail (`refId`) |
| settlement_added | Group → settlement detail (`refId`) |
| message_posted | Group chat |
| friend_request_received | Friends / requests screen |
| group_added, group_member_joined, group_removed | Group detail (or Groups list if no access) |

If the app was cold-started by a tap, the payload is read from the initial notification
response and navigation runs after auth + navigator are ready.

---

## Badge sync

- App-icon badge value = `get_activity_unread_count()` for the signed-in user.
- Updated when a push is received (`setBadgeCountAsync`) and on every app foreground.
- Cleared when the Activity screen gains focus (existing `mark_activity_seen()` path) → set
  badge to 0.

---

## Preferences screen (UX)

A new section/screen reachable from Profile/Settings:
- **Master toggle:** "התראות פוש" (push_enabled).
- **Per-category toggles** (disabled/greyed when master is off): הוצאות, תשלומים, הודעות
  צ'אט, חברויות, קבוצות.
- **System-permission row:** if OS permission is not granted, show "התראות כבויות במכשיר"
  with a button to open Settings.
- Writes via `update_notification_preferences`; optimistic UI with rollback on error.

---

## Mobile lifecycle

- **On sign-in / app start (authenticated):** request/refresh Expo push token, call
  `register_device_token`. Re-register if the token changes.
- **On sign-out:** call `unregister_device_token` for the current token; clear badge.
- **Foreground handler:** `setNotificationHandler` — show banner unless the user is already
  on the screen the notification targets (decision #12).
- **Listeners:** received + response (tap) listeners wired at the navigation root.

## app.json / EAS prerequisites

- Add the `expo-notifications` config plugin (icon, color, iOS mode) to `app.json` plugins.
- iOS: APNs key configured via EAS credentials (Apple Team `K3M6R85KA6`); add the
  `aps-environment` entitlement; enable Push Notifications capability.
- Android: FCM v1 — create a Firebase project, add the service account / `google-services.json`
  to EAS, set the Android notification channel.
- A real device + dev/preview build is required to test (push does not work in the iOS
  Simulator).

---

## Non-goals (out of scope for v1)

- Web push, email, SMS channels.
- A separate in-app notification **inbox** (the Activity screen already is the history).
- Per-group muting, temporary mute, quiet hours (deferred — can be added later).
- Proactive debt reminders / scheduled nudges.
- Per-message granularity for chat beyond the `messages` category toggle.
- Rich media / images in notifications.

## Testing approach

- **DB:** unit-test fan-out is unchanged; test `send-push` self-exclusion and preference
  gating with seeded `activity_events` rows (one per kind) → assert `push_deliveries.status`.
- **Edge Function:** local invoke with sample webhook payloads per kind; assert rendered
  title/body for he and en; assert invalid-token receipt disables the token.
- **Mobile:** manual on a physical iOS + Android device — permission priming, receive each
  kind, tap-to-navigate, badge increments/clears, preferences gating, logout stops pushes.

## Implementation workflow

Per the PM's instruction: do the work on a **`dev` branch in an isolated worktree**, then
return to `main` and integrate at the end. The implementation plan (next step) will sequence:
schema/RPCs → webhook + `send-push` → shared content lib → mobile token + handlers →
preferences screen → permission priming → badge → EAS credentials/build → device testing.

## Open prerequisites (need PM/owner action)

1. Apple: confirm APNs key creation under Team `K3M6R85KA6` (or authorize me to document the
   exact EAS steps for you to run).
2. Firebase: create/confirm an FCM project for `com.copay.mobile` and provide credentials to
   EAS.
3. Final Hebrew copy sign-off (table above).
