# Activity Events — Design Spec

Date: 2026-05-26
Branch: fix-expense-screen
Status: **brainstormed; pending implementation plan**

## Goal

Refactor the activity system around a denormalized `activity_events` table that becomes the single source of truth for "things the user might care about." This unblocks two immediate features:

1. **Membership events in the feed** — "added to a group", "X joined your group", "removed from a group" become activity rows.
2. **Numeric tab badge** — the bottom-tab Activity icon shows the unread count, excluding messages, cleared when the user opens the tab.

The table is shaped so a future push notification system can plug in on top without further data migration.

## Scope

**In scope.**
- New `activity_events` table populated by Postgres triggers on the source tables (`expenses`, `settlements`, `group_messages`, `friend_requests`, `group_members`).
- Backfill of `activity_events` from the last 12 months of existing data.
- `profiles.activity_last_seen_at` column to drive the tab badge.
- `group_members.added_by` column populated at all insert sites.
- `ActivityFeedScreen` rewritten to read from `activity_events` instead of multi-source aggregation.
- Tab badge: numeric unread count via `tabBarBadge` on the Activity tab. Excludes `message_posted`. Clears when user opens the Activity tab (sets `activity_last_seen_at = NOW()`).
- Three new event kinds surface in the feed: `group_added`, `group_member_joined`, `group_removed`.
- Realtime: app subscribes to `activity_events` (per user) and replaces the per-table activity invalidations.

**Explicitly out of scope.**
- Push notifications (delivery, FCM/APNs, device tokens, prefs, mutes). The table is designed so they can be added later additively.
- Per-event read state. For now, "read" is a single watermark per user (`activity_last_seen_at`).
- Visual redesign of activity rows.
- Filter sheet changes.
- Clustering ("3 people joined").
- Push/email/web channels.

## Locked decisions

| # | Topic | Decision |
|---|---|---|
| 1 | New activity types | `group_added`, `group_member_joined`, `group_removed`. (`message_posted`, `expense_added`, `settlement_added`, `friend_request_received` also in the table.) |
| 2 | Badge clear rule | When user focuses `ActivityFeedScreen` (RPC `mark_activity_seen`). |
| 3 | Read-state storage | Server-side: `profiles.activity_last_seen_at` watermark. |
| 4 | Refactor scope on screen | Only add new types and the badge. No visual redesign of rows or filters. |
| 5 | Badge style | Numeric count via `tabBarBadge`. |
| 6 | Tap behavior — membership | `group_added`/`group_member_joined` → group detail. `group_removed` → not tappable. Friend requests → Friends screen (preserves current). |
| 7 | Messages in badge | Excluded from count. Included in the feed. |
| 8 | Architecture | Denormalized `activity_events` table; fan-out on write via Postgres triggers. |
| 9 | Retro fan-out | None — joining a group does NOT backfill historical events for that group. |
| 10 | `group_members.added_by` | Add the column; populate at insert sites. |
| 11 | Rejoin | Re-emit `group_added` and `group_member_joined` when `is_active` flips false → true. |
| 12 | Backfill window | Last 12 months of source data. |
| 13 | Migration location | Single file in `supabase/migrations/`. |

## Architecture

**One table, fan-out on write.**

```
activity_events
├── id              uuid pk
├── user_id         uuid  -- recipient: who sees this row
├── kind            text  -- enum-like (CHECK constraint)
├── group_id        uuid null  -- null for friend_request_received
├── ref_id          uuid       -- id of source row
├── actor_user_id   uuid null  -- who did it
├── metadata        jsonb      -- display payload (per-kind shape)
├── created_at      timestamptz
└── UNIQUE (user_id, kind, ref_id)  -- idempotency
```

**One source row → N event rows.** A new expense in a 5-person group writes 5 `activity_events` rows (one per active member). Storage cost in exchange for trivially cheap reads.

**Write path: Postgres triggers.** Triggers on `expenses`, `settlements`, `group_messages`, `friend_requests`, `group_members` insert into `activity_events`. App code paths for those tables are unchanged. The `group_members` triggers also handle `added_by` propagation requirements at the insert sites (app-layer change).

**Read path.**
- **Feed**: `SELECT * FROM activity_events WHERE user_id = $me ORDER BY created_at DESC LIMIT 20` with cursor pagination on `created_at`. No joins — display data comes from `metadata` and a cached profile lookup.
- **Badge count**: RPC `get_activity_unread_count()` returns `COUNT(*)` of events newer than `activity_last_seen_at` excluding `message_posted`.

**Realtime.** Three current per-table activity-feed invalidations in `useAppRealtime` (`expenses`, `settlements`, `group_messages`) collapse into one filtered subscription to `activity_events` on `user_id=eq.$me`. Other subscriptions stay (they drive non-activity-feed UI).

**RLS.** `activity_events` is SELECT-only by `auth.uid()`. No client INSERT/UPDATE/DELETE — only `SECURITY DEFINER` trigger functions can write.

**Why this works as a push foundation.** A push system needs (a) a per-user list of pending events, (b) a read/delivered marker, (c) a stable kind + payload to format from. This table provides (a) and (c) directly; (b) becomes either a `delivered_at`/`read_at` column or a sibling table — additive, no breaking changes.

## Schema

All DDL goes into `supabase/migrations/2026-05-26-activity-events.sql` in a single transaction.

### 1. `group_members.added_by`

```sql
ALTER TABLE group_members
    ADD COLUMN added_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
```

App-side insert sites that must populate `added_by`:

- `createGroup` (`apps/mobile/services/groups.service.ts:308`) — `added_by = createdBy` for non-founder rows, `NULL` for the founder.
- `addGroupMember` (`apps/mobile/services/groups.service.ts:467`) — `added_by = (await getCurrentUserId())`.
- `redeem_invite_link` RPC (`supabase/invite-links.sql:250`) — leave `added_by` `NULL` (self-join).
- `scripts/seed.ts` — `NULL`.

### 2. `activity_events` table

```sql
CREATE TABLE activity_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN (
        'expense_added',
        'settlement_added',
        'message_posted',
        'friend_request_received',
        'group_added',
        'group_member_joined',
        'group_removed'
    )),
    group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
    ref_id          UUID NOT NULL,
    actor_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, kind, ref_id)
);

CREATE INDEX idx_activity_events_user_created
    ON activity_events (user_id, created_at DESC);

CREATE INDEX idx_activity_events_user_kind_created
    ON activity_events (user_id, kind, created_at DESC);
```

### 3. `profiles.activity_last_seen_at`

```sql
ALTER TABLE profiles
    ADD COLUMN activity_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

Every existing user starts caught up — no historic-flood badge.

### 4. RLS

```sql
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own activity events"
    ON activity_events FOR SELECT
    USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies → blocked for clients.
```

### 5. Realtime publication

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'activity_events'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events';
    END IF;
END $$;
```

No other publication changes. `expenses`, `settlements`, `group_messages`, `friend_requests`, `group_members`, `friendships`, `group_user_archive` stay published — they drive non-activity-feed UI.

## Per-kind event spec

| Kind | Fires when | Recipients (`user_id`) | `group_id` | `actor_user_id` | `metadata` |
|---|---|---|---|---|---|
| `expense_added` | INSERT on `expenses` where `is_deleted = false`; or UPDATE that un-deletes | All active members of `expenses.group_id` (including creator) | `expenses.group_id` | `expenses.created_by` | `{ description, amount, currency, expense_date }` |
| `settlement_added` | INSERT on `settlements` where `deleted_at IS NULL` | All active members of `settlements.group_id` | `settlements.group_id` | `settlements.created_by` | `{ from_user_id, to_user_id, amount, currency, settlement_date }` |
| `message_posted` | INSERT on `group_messages` where `is_deleted = false` | All active members of `group_messages.group_id` (including sender) | `group_messages.group_id` | `group_messages.user_id` | `{ body }` (LEFT 200 chars) |
| `friend_request_received` | INSERT on `friend_requests` | `friend_requests.to_user_id` only | NULL | `friend_requests.from_user_id` | `{ status, responded_at }` (status updated in place on response; `created_at` NOT bumped) |
| `group_added` | INSERT on `group_members` where `is_active = true` AND `user_id ≠ groups.created_by`; OR UPDATE where `is_active` flips false → true | The new member only | `group_members.group_id` | `group_members.added_by` | `{ joined_at }` |
| `group_member_joined` | Same triggering rows as `group_added` | All OTHER active members of the group | `group_members.group_id` | `group_members.user_id` (the new member) | `{ new_member_user_id, joined_at }` |
| `group_removed` | UPDATE on `group_members` where `is_active` flips true → false | `group_members.user_id` only | `group_members.group_id` | NULL | `{ left_at }` |

### Lifecycle behaviors

1. **Soft-delete cleanup.** When `expenses.is_deleted` flips to true, `settlements.deleted_at` is set, or `group_messages.is_deleted` flips to true, the corresponding `activity_events` rows are deleted by the trigger. No orphan rows that can't be tapped into.

2. **Friend request status updates.** Single event per request (`kind = friend_request_received`). On status change, the trigger updates `metadata.status` and `metadata.responded_at` on the existing row. Does NOT create a new row. Does NOT bump `created_at` (the recipient already saw it; their own response shouldn't ping their own badge).

3. **No retro fan-out.** Joining a group emits exactly ONE `group_added` event for that user. Historical `expense_added`/`settlement_added`/`message_posted` events for the group are NOT backfilled for new members. This is a behavior change from the current feed (which shows all history in any group you're in) and is intentional.

4. **Creator self-events.** The creator of an expense/message/settlement gets an event for their own action. Matches current feed behavior.

5. **Group founder.** When a group is created and the founder is inserted into `group_members`, the trigger emits neither `group_added` (they're the creator) nor `group_member_joined` (no other members yet). Detected via `groups.created_by = NEW.user_id`.

6. **Rejoin.** When a previously-left user is re-added (`is_active` flips false → true), the trigger first deletes any prior `group_added`/`group_member_joined`/`group_removed` rows for the same `ref_id` (the `group_members.id`), then inserts fresh — so the unique constraint doesn't suppress the new events.

7. **`group_member_joined` fan-out cost.** Adding a member to a 50-person group writes 49 event rows. Acceptable at this app's scale.

8. **No `expense_updated` / `expense_deleted` events.** Editing an expense doesn't ping anyone today; we preserve that. (Easy to add as new kinds later.)

## Triggers

All trigger functions are `SECURITY DEFINER`, `SET search_path = public`, write idempotently via `ON CONFLICT (user_id, kind, ref_id) DO NOTHING`. Full SQL lives in the migration file. Sketches below.

### `emit_expense_activity_events`

```sql
CREATE FUNCTION emit_expense_activity_events() RETURNS TRIGGER
SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.is_deleted = false)
       OR (TG_OP = 'UPDATE' AND OLD.is_deleted = true AND NEW.is_deleted = false) THEN
        INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
        SELECT
            gm.user_id, 'expense_added', NEW.group_id, NEW.id, NEW.created_by,
            jsonb_build_object(
                'description', NEW.description,
                'amount', NEW.amount,
                'currency', NEW.currency,
                'expense_date', NEW.expense_date
            ),
            NEW.created_at
        FROM group_members gm
        WHERE gm.group_id = NEW.group_id AND gm.is_active = true
        ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
        DELETE FROM activity_events WHERE kind = 'expense_added' AND ref_id = NEW.id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_activity_events
AFTER INSERT OR UPDATE OF is_deleted ON expenses
FOR EACH ROW EXECUTE FUNCTION emit_expense_activity_events();
```

### `emit_settlement_activity_events`

Same shape; `deleted_at IS NULL` as the live predicate; metadata contains `{ from_user_id, to_user_id, amount, currency, settlement_date }`. Soft delete = set `deleted_at`.

### `emit_message_activity_events`

Same shape; metadata is `jsonb_build_object('body', LEFT(NEW.body, 200))`. Recipients = all active members. Soft-delete = `is_deleted` flip.

### `emit_friend_request_activity_events`

```sql
CREATE FUNCTION emit_friend_request_activity_events() RETURNS TRIGGER
SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
        VALUES (
            NEW.to_user_id, 'friend_request_received', NULL, NEW.id, NEW.from_user_id,
            jsonb_build_object('status', NEW.status, 'responded_at', NEW.responded_at),
            NEW.created_at
        )
        ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE activity_events
        SET metadata = jsonb_build_object('status', NEW.status, 'responded_at', NEW.responded_at)
        WHERE kind = 'friend_request_received' AND ref_id = NEW.id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_friend_request_activity_events
AFTER INSERT OR UPDATE OF status ON friend_requests
FOR EACH ROW EXECUTE FUNCTION emit_friend_request_activity_events();
```

### `emit_group_membership_activity_events`

```sql
CREATE FUNCTION emit_group_membership_activity_events() RETURNS TRIGGER
SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_group_created_by UUID;
    v_is_join BOOLEAN := false;
    v_is_leave BOOLEAN := false;
    v_is_rejoin BOOLEAN := false;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
        v_is_join := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true THEN
        v_is_join := true;
        v_is_rejoin := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        v_is_leave := true;
    END IF;

    IF v_is_join THEN
        SELECT created_by INTO v_group_created_by FROM groups WHERE id = NEW.group_id;
        -- Founder row: emit nothing
        IF NEW.user_id = v_group_created_by AND TG_OP = 'INSERT' THEN
            RETURN NEW;
        END IF;

        IF v_is_rejoin THEN
            -- Clear prior rows for this ref_id so UNIQUE doesn't suppress new events
            DELETE FROM activity_events
            WHERE ref_id = NEW.id
              AND kind IN ('group_added', 'group_member_joined', 'group_removed');
        END IF;

        INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
        VALUES (
            NEW.user_id, 'group_added', NEW.group_id, NEW.id, NEW.added_by,
            jsonb_build_object('joined_at', NEW.joined_at),
            NEW.joined_at
        )
        ON CONFLICT (user_id, kind, ref_id) DO NOTHING;

        INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
        SELECT
            gm.user_id, 'group_member_joined', NEW.group_id, NEW.id, NEW.user_id,
            jsonb_build_object('new_member_user_id', NEW.user_id, 'joined_at', NEW.joined_at),
            NEW.joined_at
        FROM group_members gm
        WHERE gm.group_id = NEW.group_id AND gm.is_active = true AND gm.user_id <> NEW.user_id
        ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
    END IF;

    IF v_is_leave THEN
        INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
        VALUES (
            NEW.user_id, 'group_removed', NEW.group_id, NEW.id, NULL,
            jsonb_build_object('left_at', NEW.left_at),
            COALESCE(NEW.left_at, NOW())
        )
        ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
    END IF;

    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_group_membership_activity_events
AFTER INSERT OR UPDATE OF is_active ON group_members
FOR EACH ROW EXECUTE FUNCTION emit_group_membership_activity_events();
```

## Backfill

Runs in the same migration transaction, AFTER triggers are created. 12-month cutoff.

```sql
-- Expenses
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'expense_added', e.group_id, e.id, e.created_by,
    jsonb_build_object(
        'description', e.description,
        'amount', e.amount,
        'currency', e.currency,
        'expense_date', e.expense_date
    ),
    e.created_at
FROM expenses e
JOIN group_members gm ON gm.group_id = e.group_id AND gm.is_active = true
WHERE e.is_deleted = false
  AND e.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- Settlements (same shape, filter deleted_at IS NULL, fan out to active group members)
-- Messages (same shape, body truncated via LEFT(body, 200), filter is_deleted = false)
-- Friend requests (one row per request, recipient = to_user_id, status & responded_at in metadata)
-- Group membership history:
--   For each active group_members row where joined_at > now() - interval '12 months'
--     AND user_id != groups.created_by:
--     - emit group_added (recipient = the member)
--     - emit group_member_joined for each OTHER currently-active member of the same group
--   For each group_members row where is_active = false AND left_at > now() - interval '12 months':
--     - emit group_removed (recipient = the leaver)
-- Backfill does NOT attempt to reconstruct past "joined" events for members who later left.
```

Pre-flight (run before applying migration to know fan-out cost):

```sql
SELECT
  (SELECT COUNT(*) FROM expenses WHERE is_deleted=false AND created_at > now() - interval '12 months') AS expenses_in_window,
  (SELECT AVG(member_count)::int FROM (
       SELECT COUNT(*) AS member_count FROM group_members
       WHERE is_active=true GROUP BY group_id
  ) g) AS avg_active_group_size;
```

## RPCs

```sql
CREATE FUNCTION mark_activity_seen() RETURNS void
SECURITY DEFINER SET search_path = public AS $$
    UPDATE profiles SET activity_last_seen_at = NOW() WHERE id = auth.uid();
$$ LANGUAGE sql;

CREATE FUNCTION get_activity_unread_count() RETURNS integer
SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT COUNT(*)::integer
    FROM activity_events ae
    JOIN profiles p ON p.id = ae.user_id
    WHERE ae.user_id = auth.uid()
      AND ae.created_at > p.activity_last_seen_at
      AND ae.kind <> 'message_posted';
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION mark_activity_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_unread_count() TO authenticated;
```

## Client changes

### Shared types (`packages/shared`)

```ts
export type ActivityEventKind =
    | 'expense_added' | 'settlement_added' | 'message_posted'
    | 'friend_request_received' | 'group_added'
    | 'group_member_joined' | 'group_removed';

export interface ActivityEvent {
    id: string;
    userId: string;
    kind: ActivityEventKind;
    groupId: string | null;
    refId: string;
    actorUserId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
```

`RecentActivity` is removed once the screen is fully migrated; no parallel period.

### `apps/mobile/services/activity.service.ts` — rewrite

Replace the multi-source aggregation (~415 lines) with a single `activity_events` query plus profile lookups for display. Cursor pagination still on `created_at`.

```ts
export async function fetchRecentActivity(
    options: FetchRecentActivityOptions = {},
): Promise<ActivityPage> {
    const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
    let query = supabase
        .from('activity_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit + 1);
    if (options.before) query = query.lt('created_at', options.before);

    const { data, error } = await query;
    if (error) throw error;
    return paginate(data, limit);
}
```

Display data: profiles still fetched via `fetchProfilesByUserIds` using `actor_user_id` and metadata IDs. Currency formatting, group-name lookup, descriptions — all built in the renderer from `metadata`.

### `apps/mobile/components/ActivityItem.tsx`

Switch on `kind` (7 values). Each kind has its own visual treatment (icon, label, optional subtitle). Membership kinds get a person/people icon and a one-line summary. Tap behavior per the table above.

### Tab badge (`apps/mobile/navigation/AppNavigator.tsx`)

```tsx
const { data: unreadCount = 0 } = useActivityUnreadCount();

<Tab.Screen
    name="Activity"
    component={ActivityStack}
    options={{
        tabBarLabel: t('tabs.activity'),
        tabBarIcon: tabBarIcon('time', 'time-outline'),
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
    }}
/>
```

`useActivityUnreadCount` is a thin React Query hook around `supabase.rpc('get_activity_unread_count')` with `staleTime: 30_000`. Invalidated by the realtime subscription on `activity_events` and after `mark_activity_seen`.

### Mark-seen on focus (`ActivityFeedScreen.tsx`)

```tsx
useFocusEffect(
    useCallback(() => {
        void supabase.rpc('mark_activity_seen').then(() =>
            queryClient.invalidateQueries({ queryKey: queryKeys.activityUnreadCount })
        );
        void refetch();
    }, [refetch]),
);
```

### `apps/mobile/hooks/useAppRealtime.ts` — simpler

Today three handlers exist purely to invalidate the activity feed (`expenses`, `settlements`, `group_messages` → `invalidateActivityDebounced`). Remove those three handlers entirely.

The `friend_requests` handler stays — it invalidates the friends-list queries. Drop only its (indirect) role in keeping the activity feed live; that now comes from the new subscription.

`snapshotRefetch` still invalidates `queryKeys.activity` (defensive on reconnect) and now also invalidates `queryKeys.activityUnreadCount`.

Add one new subscription:

```ts
.on('postgres_changes',
    { event: '*', schema: 'public', table: 'activity_events', filter: `user_id=eq.${userId}` },
    () => {
        invalidateActivityDebounced();
        void queryClient.invalidateQueries({ queryKey: queryKeys.activityUnreadCount });
    },
)
```

The other subscriptions (`groups`, `group_members`, `friendships`, `friend_requests`, `group_user_archive`) stay — they drive non-activity-feed UI.

### Query keys (`apps/mobile/hooks/queries/keys.ts`)

Add `queryKeys.activityUnreadCount`. Reuse existing `queryKeys.activity`.

## Testing strategy

### SQL (`supabase/__tests__/`)

New file: `activity_events.test.sql`. Cover:

1. **Trigger fan-out correctness** — inserting an expense produces one row per active group member; row counts match.
2. **Founder row** — creating a group does NOT emit `group_added`/`group_member_joined`.
3. **Rejoin** — leave then re-add produces fresh `group_added` + `group_member_joined`; no stale rows remain.
4. **Soft delete cleanup** — flipping `expenses.is_deleted = true` deletes the corresponding `activity_events` rows.
5. **Friend request status update** — updating `friend_requests.status` updates `metadata.status` on the existing row; does NOT create a new row; does NOT bump `created_at`.
6. **Idempotency** — running the trigger function twice (or re-running backfill) does not duplicate rows.
7. **RLS** — user A cannot SELECT user B's events.
8. **`get_activity_unread_count`** — excludes `message_posted`; respects `activity_last_seen_at`; per-user scope.
9. **`mark_activity_seen`** — updates only the caller's `profiles.activity_last_seen_at`.

### TypeScript

- `services/activity.service.test.ts` — fetch returns mapped `ActivityEvent[]`; cursor pagination; empty state.
- `hooks/queries/useActivityQuery.test.ts` (if it exists) — invalidation triggers refetch.
- `components/ActivityItem.test.tsx` — each `kind` renders expected accessible label, icon, and tap target.
- `screens/activity/ActivityFeedScreen.test.tsx` — `mark_activity_seen` is invoked on focus; renders mixed-kind feed.
- Update `__tests__/lib/activityFilters.test.ts` to the new `ActivityEvent` shape (kind, metadata).
- Update `__tests__/components/ExpenseRow.test.tsx` if any assertions reference old `RecentActivity` shape.

## Rollout

Single migration, single client release. Recommended order:

1. **Pre-flight on prod data.** Run the count + avg group size query. Sanity check estimated row count (expected < 100k events for typical app size).
2. **Apply migration on `dev` env first** (`drxfbicunusmipdgbgdk`). Smoke-test app against dev.
3. **Apply on `main` env** (`jfqxjjjbpxbwwvoygahu`) just before shipping the client build.
4. **Client release** picks up the new `activity_events.ts` service, badge, and trimmed `useAppRealtime`.

### Risks

- **Backfill duration.** Single transaction means table locks during the backfill. At expected scale (< 100k events, < 1 minute) this is acceptable. If pre-flight shows much larger volume, split into a separate non-transactional backfill job and keep the schema migration small.
- **Trigger errors are loud.** A bug in a trigger will fail the underlying business write (expense create, settlement, etc.). Test exhaustively in `dev` before promoting.
- **Realtime subscription churn.** Removing four handlers and adding one shouldn't change reconnect behavior, but smoke-test that activity feed still refreshes after backgrounding.

## Future: push notifications

The table is shaped to be the inbox for a push system:

- `kind` + `metadata` are stable enough to render push titles/bodies (i18n templates keyed by `kind`).
- Adding push delivery state is additive: either columns on `activity_events` (`push_status`, `push_sent_at`, `push_attempts`) or a sibling `activity_event_deliveries` table.
- Adding per-event read tracking (richer than the watermark) is additive: an `activity_event_reads` table keyed by `(user_id, event_id)`. The watermark remains useful as a "mark all read" shortcut.
- Preferences and mutes (per-category, per-group) hook into the trigger functions — they consult `notification_preferences` / `notification_mutes` and skip inserts (or insert with a `skipped` flag). No schema change to `activity_events` required.

The prior `docs/superpowers/specs/2026-05-20-notifications-design.md` is purely paper; nothing was implemented. When push work begins, that doc should be revisited and aligned with the table shape established here.
