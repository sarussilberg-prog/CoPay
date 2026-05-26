# Activity Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-source activity feed with a single denormalized `activity_events` table (fan-out on write via Postgres triggers) and add a numeric Activity tab badge with a per-user watermark.

**Architecture:** One Postgres table `activity_events` is populated by `SECURITY DEFINER` triggers on `expenses`, `settlements`, `group_messages`, `friend_requests`, `group_members`. The mobile client reads the user's events directly (no joins) and uses a `profiles.activity_last_seen_at` watermark for the unread badge. A single realtime subscription on `activity_events` replaces three per-source invalidations.

**Tech Stack:** Postgres triggers · Supabase RLS · React Native (Expo 55) · React Query v5 · TypeScript · Jest.

**Source spec:** `docs/superpowers/specs/2026-05-26-activity-events-design.md`.

**Environment (per `cost-share-app/apps/mobile/AGENTS.md`):**
- Dev DB: `drxfbicunusmipdgbgdk` (current MCP target).
- Prod DB: `jfqxjjjbpxbwwvoygahu` — explicitly NOT touched by this plan.
- All `mcp__supabase__*` calls in this plan run against dev only.

---

## File Structure

**Create:**
- `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql` — single-transaction migration (DDL + RPCs + triggers + backfill).
- `cost-share-app/supabase/__tests__/activity_events.test.sql` — SQL regression test suite.
- `cost-share-app/apps/mobile/hooks/queries/useActivityUnreadCount.ts` — React Query hook around `get_activity_unread_count` RPC.

**Modify:**
- `cost-share-app/packages/shared/src/types/index.ts` — add `ActivityEvent` + `ActivityEventKind`; remove `RecentActivity`, `ActivityType`, `FriendRequestActivityStatus`.
- `cost-share-app/apps/mobile/services/activity.service.ts` — full rewrite (single table query, no aggregation).
- `cost-share-app/apps/mobile/services/groups.service.ts` — populate `added_by` at `createGroup` and `addGroupMember`.
- `cost-share-app/apps/mobile/hooks/queries/keys.ts` — add `activityUnreadCount` key; simplify `activityFeed` key (no group-id permutation).
- `cost-share-app/apps/mobile/hooks/queries/useActivityQuery.ts` — drop `groupIds` permutation; queryKey collapses to a single key.
- `cost-share-app/apps/mobile/hooks/useAppRealtime.ts` — remove three handlers (`expenses`, `settlements`, `group_messages` activity invalidations); add one (`activity_events` filtered by `user_id`).
- `cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx` — `mark_activity_seen` on focus, new tap behavior, switch from `RecentActivity` to `ActivityEvent`.
- `cost-share-app/apps/mobile/components/ActivityItem.tsx` — switch on `kind`; new actor/title/meta resolution.
- `cost-share-app/apps/mobile/components/ActivityItemCard.tsx` — variant selection on `kind`; remove `friendRequestStatus` branching (now stored in `metadata.status`).
- `cost-share-app/apps/mobile/lib/activityCardVariant.ts` — variants keyed by new kinds (`group_added`, `group_member_joined`, `group_removed` reuse member icons).
- `cost-share-app/apps/mobile/lib/activityFilters.ts` — map old chip values `'expense' | 'settlement' | 'message'` → new kinds; sort/search by `metadata.amount` / `metadata.currency`.
- `cost-share-app/apps/mobile/navigation/AppNavigator.tsx` — `tabBarBadge` on Activity tab.
- `cost-share-app/apps/mobile/i18n/locales/en.json` & `he.json` — strings for new kinds.
- `cost-share-app/apps/mobile/__tests__/components/ActivityItem.test.tsx` — convert fixtures to `ActivityEvent`.
- `cost-share-app/apps/mobile/__tests__/components/ActivityItemCard.test.tsx` — convert fixtures to `ActivityEvent`.
- `cost-share-app/apps/mobile/__tests__/screens/activity/ActivityFeedScreen.test.tsx` — update mocks for new service shape; add focus mark-seen assertion.
- `cost-share-app/apps/mobile/__tests__/lib/activityFilters.test.ts` — convert fixtures to `ActivityEvent`.
- `cost-share-app/apps/mobile/__tests__/lib/activityCardVariant.test.ts` — assert variants for all 7 kinds.

**Out of scope (do not touch):**
- `ActivityFiltersSheet` UI labels (mapping happens in `activityFilters.ts`).
- Push notifications, device tokens, preferences.
- `scripts/seed.ts` `added_by` (spec line 101: leave `NULL`).

---

## Task Sequencing Notes

- **Tasks 1–13 (DB)** run via the `mcp__supabase__*` tools against the dev project. Do NOT touch prod.
- **Tasks 14–15 (SQL tests)** depend on Tasks 1–13 having been applied.
- **Tasks 16–17 (app `added_by`)** depend on Task 5 (column exists).
- **Tasks 18–30 (client)** depend on Tasks 1–13 (schema exists) and SHOULD be committed before applying to prod.
- **Final task** runs `npm test` and `tsc` across `packages/shared` and `apps/mobile`.

---

### Task 1: Pre-flight row-count check

**Files:** none.

- [ ] **Step 1: Run the pre-flight query on the dev project**

Use:
```
mcp__supabase__execute_sql with project_id = "drxfbicunusmipdgbgdk" and:

SELECT
  (SELECT COUNT(*) FROM expenses WHERE is_deleted = false AND created_at > now() - interval '12 months') AS expenses_in_window,
  (SELECT COUNT(*) FROM settlements WHERE deleted_at IS NULL AND created_at > now() - interval '12 months') AS settlements_in_window,
  (SELECT COUNT(*) FROM group_messages WHERE is_deleted = false AND created_at > now() - interval '12 months') AS messages_in_window,
  (SELECT COUNT(*) FROM friend_requests WHERE created_at > now() - interval '12 months') AS friend_requests_in_window,
  (SELECT COUNT(*) FROM group_members WHERE is_active = true AND joined_at > now() - interval '12 months') AS recent_joins,
  (SELECT AVG(member_count)::int FROM (
    SELECT COUNT(*) AS member_count FROM group_members WHERE is_active = true GROUP BY group_id
  ) g) AS avg_active_group_size;
```

Expected: numbers come back. If `expenses_in_window * avg_active_group_size + messages_in_window * avg_active_group_size` exceeds ~100k, flag in the task summary that backfill may run long. Do NOT abort — just note it.

- [ ] **Step 2: Record the numbers in the task summary**

Note the counts in the agent's summary so the human reviewer sees expected backfill volume before applying.

---

### Task 2: Create migration shell file

**Files:**
- Create: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Write the file header and BEGIN/COMMIT skeleton**

```sql
-- 2026-05-26 — Activity events table, triggers, backfill.
--
-- Source spec: docs/superpowers/specs/2026-05-26-activity-events-design.md
-- Plan: docs/superpowers/plans/2026-05-26-activity-events.md
--
-- Apply order (per docs/SSOT/SUPABASE_ENVIRONMENTS.md):
--   1. dev   (drxfbicunusmipdgbgdk)  — automatic in the executing-plans flow.
--   2. prod  (jfqxjjjbpxbwwvoygahu)  — only after explicit user approval.
--
-- All DDL, RPCs, triggers, and backfill run in a single transaction. If any
-- step fails the entire migration aborts. Backfill must come AFTER trigger
-- creation so re-emits go through the unique constraint without duplicating.

BEGIN;

-- (Schema, RPCs, triggers, and backfill added in subsequent tasks.)

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): scaffold activity_events migration shell"
```

---

### Task 3: Add `group_members.added_by` column

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Add the column DDL before COMMIT**

Insert into the migration file (between `BEGIN;` and `COMMIT;`):

```sql
-- ============================================================================
-- 1. group_members.added_by — who added this user (NULL if self-join / founder)
-- ============================================================================
ALTER TABLE group_members
    ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): add group_members.added_by column"
```

---

### Task 4: Add `profiles.activity_last_seen_at` column

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Add the watermark column**

Append after the previous section, still inside the transaction:

```sql
-- ============================================================================
-- 2. profiles.activity_last_seen_at — per-user "I've seen up to" watermark.
--    NOT NULL DEFAULT NOW() means every existing user starts caught up; no
--    historic-flood badge after migration.
-- ============================================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS activity_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): add profiles.activity_last_seen_at watermark"
```

---

### Task 5: Create `activity_events` table + indexes + RLS

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the table DDL**

```sql
-- ============================================================================
-- 3. activity_events — denormalized per-recipient event log.
--    One source row (e.g. one expense) fans out to N event rows (one per
--    active group member). UNIQUE(user_id, kind, ref_id) makes triggers and
--    backfill idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_events (
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

CREATE INDEX IF NOT EXISTS idx_activity_events_user_created
    ON activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_kind_created
    ON activity_events (user_id, kind, created_at DESC);

-- RLS: clients read their own events; only SECURITY DEFINER triggers write.
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own activity events"
    ON activity_events FOR SELECT
    USING (user_id = auth.uid());

-- (No INSERT/UPDATE/DELETE policy → blocked for clients.)
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): create activity_events table with RLS"
```

---

### Task 6: Add `activity_events` to the realtime publication

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the publication-add block**

```sql
-- ============================================================================
-- 4. Realtime publication — append activity_events without touching the rest.
-- ============================================================================
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

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): publish activity_events on realtime"
```

---

### Task 7: Create `mark_activity_seen` and `get_activity_unread_count` RPCs

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the RPC definitions**

```sql
-- ============================================================================
-- 5. RPCs — mark seen, count unread.
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_activity_seen() RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
        UPDATE profiles SET activity_last_seen_at = NOW() WHERE id = auth.uid();
    $$;

CREATE OR REPLACE FUNCTION get_activity_unread_count() RETURNS integer
    LANGUAGE sql
    SECURITY DEFINER STABLE
    SET search_path = public
    AS $$
        SELECT COUNT(*)::integer
        FROM activity_events ae
        JOIN profiles p ON p.id = ae.user_id
        WHERE ae.user_id = auth.uid()
          AND ae.created_at > p.activity_last_seen_at
          AND ae.kind <> 'message_posted';
    $$;

GRANT EXECUTE ON FUNCTION mark_activity_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_unread_count() TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): add mark_activity_seen + get_activity_unread_count RPCs"
```

---

### Task 8: Expense activity-events trigger

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the expense trigger**

```sql
-- ============================================================================
-- 6. Triggers — fan out source-row writes into activity_events.
-- ============================================================================

CREATE OR REPLACE FUNCTION emit_expense_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.is_deleted = false)
           OR (TG_OP = 'UPDATE' AND OLD.is_deleted = true AND NEW.is_deleted = false) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'expense_added',
                NEW.group_id,
                NEW.id,
                NEW.created_by,
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
    END;
    $$;

DROP TRIGGER IF EXISTS trg_expense_activity_events ON expenses;
CREATE TRIGGER trg_expense_activity_events
    AFTER INSERT OR UPDATE OF is_deleted ON expenses
    FOR EACH ROW EXECUTE FUNCTION emit_expense_activity_events();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): trigger emit_expense_activity_events"
```

---

### Task 9: Settlement activity-events trigger

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the settlement trigger**

```sql
CREATE OR REPLACE FUNCTION emit_settlement_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.deleted_at IS NULL)
           OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'settlement_added',
                NEW.group_id,
                NEW.id,
                NEW.created_by,
                jsonb_build_object(
                    'from_user_id',     NEW.from_user_id,
                    'to_user_id',       NEW.to_user_id,
                    'amount',           NEW.amount,
                    'currency',         NEW.currency,
                    'settlement_date',  NEW.settlement_date
                ),
                NEW.created_at
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id AND gm.is_active = true
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            DELETE FROM activity_events WHERE kind = 'settlement_added' AND ref_id = NEW.id;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_settlement_activity_events ON settlements;
CREATE TRIGGER trg_settlement_activity_events
    AFTER INSERT OR UPDATE OF deleted_at ON settlements
    FOR EACH ROW EXECUTE FUNCTION emit_settlement_activity_events();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): trigger emit_settlement_activity_events"
```

---

### Task 10: Group-message activity-events trigger

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the message trigger**

```sql
CREATE OR REPLACE FUNCTION emit_message_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF (TG_OP = 'INSERT' AND NEW.is_deleted = false)
           OR (TG_OP = 'UPDATE' AND OLD.is_deleted = true AND NEW.is_deleted = false) THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'message_posted',
                NEW.group_id,
                NEW.id,
                NEW.user_id,
                jsonb_build_object('body', LEFT(NEW.body, 200)),
                NEW.created_at
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id AND gm.is_active = true
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
            DELETE FROM activity_events WHERE kind = 'message_posted' AND ref_id = NEW.id;
        END IF;
        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_message_activity_events ON group_messages;
CREATE TRIGGER trg_message_activity_events
    AFTER INSERT OR UPDATE OF is_deleted ON group_messages
    FOR EACH ROW EXECUTE FUNCTION emit_message_activity_events();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): trigger emit_message_activity_events"
```

---

### Task 11: Friend-request activity-events trigger

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

- [ ] **Step 1: Append the friend-request trigger**

Important: status changes UPDATE `metadata` on the existing row — they do NOT insert a new row and do NOT bump `created_at`. This prevents the recipient pinging their own badge when they accept/reject.

```sql
CREATE OR REPLACE FUNCTION emit_friend_request_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.to_user_id,
                'friend_request_received',
                NULL,
                NEW.id,
                NEW.from_user_id,
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
    END;
    $$;

DROP TRIGGER IF EXISTS trg_friend_request_activity_events ON friend_requests;
CREATE TRIGGER trg_friend_request_activity_events
    AFTER INSERT OR UPDATE OF status ON friend_requests
    FOR EACH ROW EXECUTE FUNCTION emit_friend_request_activity_events();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): trigger emit_friend_request_activity_events"
```

---

### Task 12: Group-membership activity-events trigger

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

This trigger handles `group_added`, `group_member_joined`, `group_removed`, and rejoin (`is_active` false → true). The founder row produces no event (detected via `groups.created_by = NEW.user_id` on INSERT).

- [ ] **Step 1: Append the membership trigger**

```sql
CREATE OR REPLACE FUNCTION emit_group_membership_activity_events() RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_group_created_by UUID;
        v_is_join          BOOLEAN := false;
        v_is_leave         BOOLEAN := false;
        v_is_rejoin        BOOLEAN := false;
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

            -- Founder's own initial INSERT: emit nothing.
            IF TG_OP = 'INSERT' AND NEW.user_id = v_group_created_by THEN
                RETURN NEW;
            END IF;

            IF v_is_rejoin THEN
                -- Clear prior rows so UNIQUE(user_id, kind, ref_id) doesn't suppress new events.
                DELETE FROM activity_events
                WHERE ref_id = NEW.id
                  AND kind IN ('group_added', 'group_member_joined', 'group_removed');
            END IF;

            -- One row for the new member.
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.user_id,
                'group_added',
                NEW.group_id,
                NEW.id,
                NEW.added_by,
                jsonb_build_object('joined_at', NEW.joined_at),
                COALESCE(NEW.joined_at, NOW())
            )
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;

            -- One row per OTHER active member.
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            SELECT
                gm.user_id,
                'group_member_joined',
                NEW.group_id,
                NEW.id,
                NEW.user_id,
                jsonb_build_object('new_member_user_id', NEW.user_id, 'joined_at', NEW.joined_at),
                COALESCE(NEW.joined_at, NOW())
            FROM group_members gm
            WHERE gm.group_id = NEW.group_id
              AND gm.is_active = true
              AND gm.user_id <> NEW.user_id
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        IF v_is_leave THEN
            INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
            VALUES (
                NEW.user_id,
                'group_removed',
                NEW.group_id,
                NEW.id,
                NULL,
                jsonb_build_object('left_at', NEW.left_at),
                COALESCE(NEW.left_at, NOW())
            )
            ON CONFLICT (user_id, kind, ref_id) DO NOTHING;
        END IF;

        RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_group_membership_activity_events ON group_members;
CREATE TRIGGER trg_group_membership_activity_events
    AFTER INSERT OR UPDATE OF is_active ON group_members
    FOR EACH ROW EXECUTE FUNCTION emit_group_membership_activity_events();
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): trigger emit_group_membership_activity_events"
```

---

### Task 13: Backfill 12 months of history

**Files:**
- Modify: `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql`

Backfill goes AFTER trigger creation so `ON CONFLICT` keeps things idempotent if someone re-runs the migration. Backfill does NOT reconstruct past joined-then-left events.

- [ ] **Step 1: Append the backfill block**

```sql
-- ============================================================================
-- 7. Backfill — 12-month window. Triggers above are already in place, but
--    these statements bypass them (direct INSERTs) so we control exact shape.
--    ON CONFLICT keeps everything idempotent.
-- ============================================================================

-- 7a. Expenses → expense_added.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'expense_added', e.group_id, e.id, e.created_by,
    jsonb_build_object(
        'description', e.description,
        'amount',      e.amount,
        'currency',    e.currency,
        'expense_date', e.expense_date
    ),
    e.created_at
FROM expenses e
JOIN group_members gm ON gm.group_id = e.group_id AND gm.is_active = true
WHERE e.is_deleted = false
  AND e.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7b. Settlements → settlement_added.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'settlement_added', s.group_id, s.id, s.created_by,
    jsonb_build_object(
        'from_user_id',     s.from_user_id,
        'to_user_id',       s.to_user_id,
        'amount',           s.amount,
        'currency',         s.currency,
        'settlement_date',  s.settlement_date
    ),
    s.created_at
FROM settlements s
JOIN group_members gm ON gm.group_id = s.group_id AND gm.is_active = true
WHERE s.deleted_at IS NULL
  AND s.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7c. Messages → message_posted.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'message_posted', m.group_id, m.id, m.user_id,
    jsonb_build_object('body', LEFT(m.body, 200)),
    m.created_at
FROM group_messages m
JOIN group_members gm ON gm.group_id = m.group_id AND gm.is_active = true
WHERE m.is_deleted = false
  AND m.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7d. Friend requests → friend_request_received (one row per request).
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    fr.to_user_id, 'friend_request_received', NULL, fr.id, fr.from_user_id,
    jsonb_build_object('status', fr.status, 'responded_at', fr.responded_at),
    fr.created_at
FROM friend_requests fr
WHERE fr.created_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7e. Group joins (currently active, non-founder, joined within window).
--     Emit group_added for the joiner.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'group_added', gm.group_id, gm.id, gm.added_by,
    jsonb_build_object('joined_at', gm.joined_at),
    COALESCE(gm.joined_at, now())
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.is_active = true
  AND gm.user_id <> g.created_by
  AND gm.joined_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

--     Emit group_member_joined for every OTHER currently-active member.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    other.user_id, 'group_member_joined', gm.group_id, gm.id, gm.user_id,
    jsonb_build_object('new_member_user_id', gm.user_id, 'joined_at', gm.joined_at),
    COALESCE(gm.joined_at, now())
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
JOIN group_members other
    ON other.group_id = gm.group_id
   AND other.is_active = true
   AND other.user_id <> gm.user_id
WHERE gm.is_active = true
  AND gm.user_id <> g.created_by
  AND gm.joined_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;

-- 7f. Group removals — left_at within window.
INSERT INTO activity_events (user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at)
SELECT
    gm.user_id, 'group_removed', gm.group_id, gm.id, NULL,
    jsonb_build_object('left_at', gm.left_at),
    COALESCE(gm.left_at, now())
FROM group_members gm
WHERE gm.is_active = false
  AND gm.left_at IS NOT NULL
  AND gm.left_at > now() - interval '12 months'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/supabase/migrations/2026-05-26-activity-events.sql
git commit -m "feat(db): backfill 12 months of activity_events"
```

---

### Task 14: Apply the migration to the dev project

**Files:** none.

- [ ] **Step 1: Read the migration file**

Read `cost-share-app/supabase/migrations/2026-05-26-activity-events.sql` and pass its full contents to:

```
mcp__supabase__apply_migration
  project_id: "drxfbicunusmipdgbgdk"
  name: "2026-05-26-activity-events"
  query: <full contents of the .sql file, WITHOUT the surrounding BEGIN;/COMMIT; — apply_migration wraps automatically>
```

If the tool errors because of duplicate BEGIN/COMMIT, strip the outer `BEGIN;` / `COMMIT;` lines and re-call.

Expected: success response with no rows-changed payload (DDL).

- [ ] **Step 2: Sanity-check via execute_sql**

```
mcp__supabase__execute_sql project_id="drxfbicunusmipdgbgdk":

SELECT kind, COUNT(*) FROM activity_events GROUP BY kind ORDER BY kind;
SELECT activity_last_seen_at IS NOT NULL AS has_watermark FROM profiles LIMIT 1;
SELECT column_name FROM information_schema.columns
  WHERE table_name='group_members' AND column_name='added_by';
SELECT tgname FROM pg_trigger
  WHERE tgname LIKE 'trg_%_activity_events' ORDER BY tgname;
```

Expected:
- `activity_events` exists and has rows for each kind that had source data.
- `has_watermark = true`.
- `added_by` row returned.
- Four trigger names listed.

- [ ] **Step 3: Record the post-migration counts in the task summary**

Record `kind, count` rows so the reviewer can see real backfill volume.

---

### Task 15: Write the SQL regression test suite

**Files:**
- Create: `cost-share-app/supabase/__tests__/activity_events.test.sql`

Mirror the structure of `get_group_pairwise_debts.test.sql` — single transaction, `session_replication_role = replica`, `ROLLBACK` at the end. Each assertion uses `RAISE EXCEPTION` on failure.

- [ ] **Step 1: Create the test file with header and test cases**

```sql
-- ============================================================================
-- SQL regression tests for the activity_events table + triggers + RPCs.
--
-- Run via Supabase MCP:
--   mcp__supabase__execute_sql with the full contents below against the dev
--   project (drxfbicunusmipdgbgdk). The transaction ROLLBACKs at the end so
--   no data persists.
--
-- Why session_replication_role = replica?
--   * profiles.id has a FK to auth.users(id).
--   * The handle_new_user trigger on auth.users would fire and fail on
--     synthetic users. `replica` disables triggers AND FK checks for the
--     transaction (Postgres treats FKs as system triggers). ROLLBACK
--     restores the normal role.
--
-- We CANNOT disable the activity-events triggers themselves — those are
-- under test. So we must seed minimal-but-valid rows in source tables.
-- ============================================================================

BEGIN;

SET LOCAL session_replication_role = replica;

-- Critical: re-enable our triggers explicitly (replica mode disables them).
ALTER TABLE expenses          ENABLE ALWAYS TRIGGER trg_expense_activity_events;
ALTER TABLE settlements       ENABLE ALWAYS TRIGGER trg_settlement_activity_events;
ALTER TABLE group_messages    ENABLE ALWAYS TRIGGER trg_message_activity_events;
ALTER TABLE friend_requests   ENABLE ALWAYS TRIGGER trg_friend_request_activity_events;
ALTER TABLE group_members     ENABLE ALWAYS TRIGGER trg_group_membership_activity_events;

DO $outer$
DECLARE
    v_group   CONSTANT UUID := '00000000-0000-0000-0000-00000000ae01';
    v_alice   CONSTANT UUID := '00000000-0000-0000-0000-00000000aea1';
    v_bob     CONSTANT UUID := '00000000-0000-0000-0000-00000000aeb1';
    v_carol   CONSTANT UUID := '00000000-0000-0000-0000-00000000aec1';
    v_dave    CONSTANT UUID := '00000000-0000-0000-0000-00000000aed1';
    v_exp     UUID;
    v_set     UUID;
    v_msg     UUID;
    v_fr      UUID;
    v_member  UUID;
    v_count   INT;
    v_before  TIMESTAMPTZ;
BEGIN
    -- ---- seed ----------------------------------------------------------
    INSERT INTO auth.users (id) VALUES (v_alice), (v_bob), (v_carol), (v_dave);
    INSERT INTO public.profiles (id, email, name, default_currency, language, is_active, invite_token)
    VALUES
        (v_alice, 'ae-alice@test.local', 'Alice', 'USD', 'en', TRUE, 'tt_ae_alice'),
        (v_bob,   'ae-bob@test.local',   'Bob',   'USD', 'en', TRUE, 'tt_ae_bob'),
        (v_carol, 'ae-carol@test.local', 'Carol', 'USD', 'en', TRUE, 'tt_ae_carol'),
        (v_dave,  'ae-dave@test.local',  'Dave',  'USD', 'en', TRUE, 'tt_ae_dave');
    INSERT INTO public.groups (id, name, default_currency, created_by, is_active, group_type, invite_token)
    VALUES (v_group, 'AE Test Group', 'USD', v_alice, TRUE, 'general', 'tt_ae_group');

    -- Founder row: triggers should emit NOTHING for Alice.
    INSERT INTO public.group_members (group_id, user_id, is_active, joined_at)
    VALUES (v_group, v_alice, TRUE, now())
    RETURNING id INTO v_member;

    -- ---- CASE 1: founder gets no group_added / group_member_joined ----
    SELECT COUNT(*) INTO v_count FROM activity_events WHERE group_id = v_group;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 1 failed: founder INSERT produced % rows', v_count;
    END IF;

    -- ---- CASE 2: adding Bob → 1 group_added (Bob) + 1 group_member_joined (Alice)
    INSERT INTO public.group_members (group_id, user_id, is_active, joined_at, added_by)
    VALUES (v_group, v_bob, TRUE, now(), v_alice);

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE group_id = v_group AND kind = 'group_added' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 2 failed: expected 1 group_added for Bob, got %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE group_id = v_group AND kind = 'group_member_joined' AND user_id = v_alice;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 2 failed: expected 1 group_member_joined for Alice, got %', v_count;
    END IF;

    -- ---- CASE 3: expense fan-out → 2 rows (Alice + Bob)
    INSERT INTO public.expenses (group_id, paid_by, amount, currency, description, expense_date, created_by, is_deleted)
    VALUES (v_group, v_alice, 30, 'USD', 'Lunch', CURRENT_DATE, v_alice, FALSE)
    RETURNING id INTO v_exp;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Case 3 failed: expected 2 expense_added rows, got %', v_count;
    END IF;

    -- ---- CASE 4: soft-delete expense → 0 rows remain
    UPDATE public.expenses SET is_deleted = true WHERE id = v_exp;
    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 4 failed: soft-deleted expense left % rows', v_count;
    END IF;

    -- ---- CASE 5: idempotency — re-running trigger via UPDATE that flips
    --             is_deleted back to false produces no duplicates.
    UPDATE public.expenses SET is_deleted = false WHERE id = v_exp;
    UPDATE public.expenses SET is_deleted = false WHERE id = v_exp; -- no-op
    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'expense_added' AND ref_id = v_exp;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Case 5 failed: idempotency broke, got % rows', v_count;
    END IF;

    -- ---- CASE 6: friend request → 1 row for recipient; status UPDATE
    --             mutates metadata in place without bumping created_at.
    INSERT INTO public.friend_requests (from_user_id, to_user_id, status)
    VALUES (v_carol, v_alice, 'pending')
    RETURNING id INTO v_fr;

    SELECT created_at INTO v_before FROM activity_events
    WHERE kind = 'friend_request_received' AND ref_id = v_fr AND user_id = v_alice;

    UPDATE public.friend_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = v_fr;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'friend_request_received' AND ref_id = v_fr;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 6 failed: friend request produced % rows', v_count;
    END IF;

    IF (SELECT metadata->>'status' FROM activity_events
        WHERE kind = 'friend_request_received' AND ref_id = v_fr) <> 'accepted' THEN
        RAISE EXCEPTION 'Case 6 failed: metadata.status was not updated';
    END IF;

    IF (SELECT created_at FROM activity_events
        WHERE kind = 'friend_request_received' AND ref_id = v_fr) <> v_before THEN
        RAISE EXCEPTION 'Case 6 failed: created_at was bumped on status update';
    END IF;

    -- ---- CASE 7: rejoin — Bob leaves, then rejoins; fresh rows appear,
    --             unique constraint does NOT suppress them.
    UPDATE public.group_members
    SET is_active = false, left_at = now()
    WHERE group_id = v_group AND user_id = v_bob;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_removed' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 7a failed: leave produced % group_removed rows', v_count;
    END IF;

    UPDATE public.group_members
    SET is_active = true, joined_at = now(), left_at = NULL
    WHERE group_id = v_group AND user_id = v_bob;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_removed' AND user_id = v_bob;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 7b failed: rejoin did not clear group_removed (% rows left)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM activity_events
    WHERE kind = 'group_added' AND user_id = v_bob;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Case 7c failed: rejoin produced % group_added rows', v_count;
    END IF;

    -- ---- CASE 8: get_activity_unread_count excludes message_posted ---
    INSERT INTO public.group_messages (group_id, user_id, body)
    VALUES (v_group, v_bob, 'hi');

    -- Force Alice as the caller by stubbing auth.uid().
    EXECUTE format($stub$
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS 'SELECT %L::uuid'
    $stub$, v_alice);

    -- Reset Alice's watermark to before the test seed so events count.
    UPDATE public.profiles SET activity_last_seen_at = 'epoch'::timestamptz WHERE id = v_alice;

    SELECT get_activity_unread_count() INTO v_count;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Case 8 failed: expected >0 unread for Alice';
    END IF;

    -- Should not count message_posted: total includes message - confirm
    -- that excluding messages drops the count.
    IF v_count >= (SELECT COUNT(*) FROM activity_events WHERE user_id = v_alice) THEN
        RAISE EXCEPTION 'Case 8 failed: unread count should be strictly less than total Alice rows';
    END IF;

    -- ---- CASE 9: mark_activity_seen clears the count ------------------
    PERFORM mark_activity_seen();
    SELECT get_activity_unread_count() INTO v_count;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Case 9 failed: unread count = % after mark_activity_seen', v_count;
    END IF;

    RAISE NOTICE 'All activity_events tests passed.';
END
$outer$;

ROLLBACK;
```

- [ ] **Step 2: Run the test file via MCP**

```
mcp__supabase__execute_sql project_id="drxfbicunusmipdgbgdk" with the full contents above.
```

Expected: a `NOTICE` containing "All activity_events tests passed." No error.

If any `RAISE EXCEPTION` fires, do NOT proceed. Identify the failing case, fix the trigger / migration, re-apply, re-test.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/supabase/__tests__/activity_events.test.sql
git commit -m "test(db): SQL regression tests for activity_events"
```

---

### Task 16: Populate `added_by` in `createGroup`

**Files:**
- Modify: `cost-share-app/apps/mobile/services/groups.service.ts`

The current code inserts rows `{ group_id, user_id }`. For non-founder rows, set `added_by = createdBy`. The founder row leaves `added_by` NULL.

- [ ] **Step 1: Locate the existing insert block (around `groups.service.ts:303`)**

Current:
```ts
const memberIds = new Set<string>([createdBy, ...activeMemberIds]);
const rows = Array.from(memberIds).map(userId => ({
    group_id: groupRow.id,
    user_id: userId,
}));
```

- [ ] **Step 2: Update to set `added_by` on non-founder rows**

```ts
const memberIds = new Set<string>([createdBy, ...activeMemberIds]);
const rows = Array.from(memberIds).map(userId => ({
    group_id: groupRow.id,
    user_id: userId,
    added_by: userId === createdBy ? null : createdBy,
}));
```

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/services/groups.service.ts
git commit -m "feat(mobile): populate group_members.added_by in createGroup"
```

---

### Task 17: Populate `added_by` in `addGroupMember`

**Files:**
- Modify: `cost-share-app/apps/mobile/services/groups.service.ts`

`addGroupMember` is the one-off add path used by the existing member-add UI. Per spec, `added_by = current user id`.

- [ ] **Step 1: Locate `addGroupMember` (around line 467)**

Current upsert:
```ts
.upsert(
    {
        group_id: groupId,
        user_id: userId,
        is_active: true,
        left_at: null,
        joined_at: new Date().toISOString(),
    },
    { onConflict: 'group_id,user_id' },
)
```

- [ ] **Step 2: Resolve current user id and include it in the upsert**

Add at the top of the function:
```ts
const addedBy = await getCurrentUserId();
```

Then update the upsert payload:
```ts
.upsert(
    {
        group_id: groupId,
        user_id: userId,
        is_active: true,
        left_at: null,
        joined_at: new Date().toISOString(),
        added_by: addedBy ?? null,
    },
    { onConflict: 'group_id,user_id' },
)
```

(`getCurrentUserId` is already imported in this file — verify, and add the import if not present.)

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/services/groups.service.ts
git commit -m "feat(mobile): populate group_members.added_by in addGroupMember"
```

> Note: `redeem_invite_link` RPC and `scripts/seed.ts` are intentionally NOT updated per spec lines 100–101.

---

### Task 18: Add `ActivityEvent` to shared types

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts`

Add the new type alongside the existing `RecentActivity`. We'll remove `RecentActivity` in the final cleanup task once all consumers are migrated, so they coexist briefly to keep TypeScript green between intermediate commits.

- [ ] **Step 1: Append the new types**

After the existing `RecentActivity` block in `packages/shared/src/types/index.ts`, add:

```ts
/**
 * ActivityEventKind — server-side enum mirror.
 * Source of truth: activity_events.kind CHECK constraint.
 */
export type ActivityEventKind =
    | 'expense_added'
    | 'settlement_added'
    | 'message_posted'
    | 'friend_request_received'
    | 'group_added'
    | 'group_member_joined'
    | 'group_removed';

/**
 * ActivityEvent — one row of the per-user activity feed.
 * Maps 1:1 to public.activity_events.
 */
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

- [ ] **Step 2: Rebuild shared package**

```bash
cd cost-share-app && npm run -w @cost-share/shared build
```

Expected: build succeeds, `packages/shared/dist/types/index.d.ts` now includes `ActivityEvent`.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts cost-share-app/packages/shared/dist/
git commit -m "feat(shared): add ActivityEvent type"
```

---

### Task 19: Add `activityUnreadCount` query key

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/queries/keys.ts`

Also simplify the `activityFeed` key — under the new model, the feed isn't permutated by group IDs (the server filters by user).

- [ ] **Step 1: Edit `keys.ts`**

Replace the existing `activity` + `activityFeed` block:

```ts
activity: ['activity'] as const,
activityFeed: (groupIds: string[]) => ['activity', groupIds.join(',')] as const,
```

with:

```ts
activity: ['activity'] as const,
activityFeed: () => ['activity', 'feed'] as const,
activityUnreadCount: ['activity', 'unread-count'] as const,
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/keys.ts
git commit -m "feat(mobile): add activityUnreadCount query key"
```

---

### Task 20: Create `useActivityUnreadCount` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/queries/useActivityUnreadCount.ts`

- [ ] **Step 1: Create the file**

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { queryKeys } from './keys';

const UNREAD_STALE_MS = 30_000;

async function fetchActivityUnreadCount(): Promise<number> {
    const { data, error } = await supabase.rpc('get_activity_unread_count');
    if (error) {
        console.error('Failed to fetch activity unread count:', error);
        return 0;
    }
    return typeof data === 'number' ? data : 0;
}

export function useActivityUnreadCount() {
    const currentUserId = useAppStore(s => s.currentUser?.id);
    return useQuery({
        queryKey: queryKeys.activityUnreadCount,
        queryFn: fetchActivityUnreadCount,
        enabled: Boolean(currentUserId),
        staleTime: UNREAD_STALE_MS,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/useActivityUnreadCount.ts
git commit -m "feat(mobile): useActivityUnreadCount hook"
```

---

### Task 21: Rewrite `activity.service.ts`

**Files:**
- Modify: `cost-share-app/apps/mobile/services/activity.service.ts`

Full rewrite — replace the 414-line aggregator with a single `activity_events` query. Map rows to `ActivityEvent` shape with `createdAt` as a `Date`.

- [ ] **Step 1: Replace the file contents**

```ts
/**
 * Activity feed — reads denormalized activity_events rows for the current
 * user. Triggers populate the table; this service only queries.
 */

import { ActivityEvent, ActivityEventKind } from '@cost-share/shared';
import { supabase } from '../lib/supabase';
import { getCurrentUserId } from '../lib/auth';

export const ACTIVITY_INITIAL_PAGE_SIZE = 15;
export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_INITIAL_SKELETON_COUNT = 6;

export interface ActivityPage {
    items: ActivityEvent[];
    nextCursor?: string;
}

export interface FetchRecentActivityOptions {
    limit?: number;
    before?: string;
}

interface ActivityEventRow {
    id: string;
    user_id: string;
    kind: ActivityEventKind;
    group_id: string | null;
    ref_id: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

function rowToEvent(row: ActivityEventRow): ActivityEvent {
    return {
        id: row.id,
        userId: row.user_id,
        kind: row.kind,
        groupId: row.group_id,
        refId: row.ref_id,
        actorUserId: row.actor_user_id,
        metadata: row.metadata ?? {},
        createdAt: new Date(row.created_at),
    };
}

export async function fetchRecentActivity(
    options: FetchRecentActivityOptions = {},
): Promise<ActivityPage> {
    const userId = await getCurrentUserId();
    if (!userId) return { items: [] };

    const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
    const fetchLimit = limit + 1;

    let query = supabase
        .from('activity_events')
        .select('id, user_id, kind, group_id, ref_id, actor_user_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

    if (options.before) {
        query = query.lt('created_at', options.before);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Failed to fetch activity events:', error);
        return { items: [] };
    }

    const rows = (data ?? []) as ActivityEventRow[];
    const events = rows.map(rowToEvent);
    const hasMore = events.length === fetchLimit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : undefined;

    return { items, nextCursor };
}
```

- [ ] **Step 2: Run TypeScript across mobile**

```bash
cd cost-share-app/apps/mobile && npx tsc --noEmit
```

Expected: existing consumers (`ActivityItem`, `ActivityFeedScreen`, etc.) now fail because they still expect `RecentActivity`. The errors will be cleaned up in the following tasks; record the count in the task summary but do NOT commit yet — keep this on a working tree until tasks 22+ land together.

- [ ] **Step 3: Commit (will leave the tree red until task 27)**

```bash
git add cost-share-app/apps/mobile/services/activity.service.ts
git commit -m "feat(mobile): rewrite activity.service for activity_events"
```

> This commit intentionally leaves the tree red — Tasks 22–28 finish the refactor in sequence. If you must split work across sessions, keep the in-flight branch local until Task 28.

---

### Task 22: Update `useActivityQuery`

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/queries/useActivityQuery.ts`

The hook no longer needs `groupIds`, group names, or user id passed in — the server scopes by `auth.uid()`.

- [ ] **Step 1: Replace the file**

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    fetchRecentActivity,
    ACTIVITY_INITIAL_PAGE_SIZE,
    ACTIVITY_PAGE_SIZE,
} from '../../services/activity.service';
import { queryClient } from '../../lib/queryClient';
import { useAppStore } from '../../store';
import { queryKeys } from './keys';

const ACTIVITY_STALE_MS = 60_000;

function buildActivityQueryOptions() {
    return {
        queryKey: queryKeys.activityFeed(),
        queryFn: ({ pageParam }: { pageParam?: string }) =>
            fetchRecentActivity({
                before: pageParam,
                limit: pageParam ? ACTIVITY_PAGE_SIZE : ACTIVITY_INITIAL_PAGE_SIZE,
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage: Awaited<ReturnType<typeof fetchRecentActivity>>) =>
            lastPage.nextCursor,
        staleTime: ACTIVITY_STALE_MS,
    };
}

export function useActivityQuery() {
    const currentUserId = useAppStore(state => state.currentUser?.id);
    return useInfiniteQuery({
        ...buildActivityQueryOptions(),
        enabled: Boolean(currentUserId),
    });
}

export function prefetchActivityFeed(): Promise<void> {
    const currentUserId = useAppStore.getState().currentUser?.id;
    if (!currentUserId) return Promise.resolve();
    const options = buildActivityQueryOptions();
    const existing = queryClient.getQueryState(options.queryKey);
    if (
        existing?.dataUpdatedAt &&
        Date.now() - existing.dataUpdatedAt < ACTIVITY_STALE_MS
    ) {
        return Promise.resolve();
    }
    return queryClient.prefetchInfiniteQuery(options);
}
```

- [ ] **Step 2: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/useActivityQuery.ts
git commit -m "refactor(mobile): simplify useActivityQuery for activity_events"
```

---

### Task 23: Update `activityCardVariant` for new kinds

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/activityCardVariant.ts`

Re-key the variant map from old `ActivityType` to new `ActivityEventKind`. Membership kinds (`group_added`, `group_member_joined`, `group_removed`) reuse the existing `GROUP_INVITE` / `MEMBER_JOINED` / `MEMBER_LEFT` visuals. `friend_request_received` keeps the same trio of variants (pending/accepted/rejected) but the status now comes from `metadata.status`.

- [ ] **Step 1: Read current file then rewrite the public exports**

Open `cost-share-app/apps/mobile/lib/activityCardVariant.ts`. Keep the variant CONSTANTS (EXPENSE, SETTLEMENT, MESSAGE, FRIEND_REQUEST, FRIEND_REQUEST_ACCEPTED, FRIEND_REQUEST_REJECTED, GROUP_INVITE, MEMBER_JOINED, MEMBER_LEFT). Replace the dispatch function `getActivityCardVariant` with:

```ts
import type { ActivityEventKind } from '@cost-share/shared';

export function getActivityCardVariant(
    kind: ActivityEventKind,
    friendRequestStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled',
): ActivityCardVariant {
    switch (kind) {
        case 'expense_added':
            return EXPENSE;
        case 'settlement_added':
            return SETTLEMENT;
        case 'message_posted':
            return MESSAGE;
        case 'friend_request_received':
            if (friendRequestStatus === 'accepted') return FRIEND_REQUEST_ACCEPTED;
            if (friendRequestStatus === 'rejected') return FRIEND_REQUEST_REJECTED;
            return FRIEND_REQUEST;
        case 'group_added':
            return GROUP_INVITE;
        case 'group_member_joined':
            return MEMBER_JOINED;
        case 'group_removed':
            return MEMBER_LEFT;
    }
}
```

Remove any old imports of `ActivityType` / `FriendRequestActivityStatus` from `@cost-share/shared`.

- [ ] **Step 2: Update the test file**

`cost-share-app/apps/mobile/__tests__/lib/activityCardVariant.test.ts` likely tests the old switch. Update assertions so each kind from `ActivityEventKind` returns the expected variant. Cover all 7 kinds + the 3 friend-request statuses.

- [ ] **Step 3: Run the test**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/activityCardVariant.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/lib/activityCardVariant.ts cost-share-app/apps/mobile/__tests__/lib/activityCardVariant.test.ts
git commit -m "refactor(mobile): activityCardVariant keys by ActivityEventKind"
```

---

### Task 24: Rewrite `ActivityItemCard` for new shape

**Files:**
- Modify: `cost-share-app/apps/mobile/components/ActivityItemCard.tsx`

Replace `RecentActivity` with `ActivityEvent`. Amount + currency come from `metadata` for expense/settlement; description is computed from metadata + actor profile.

- [ ] **Step 1: Replace the file**

```tsx
/**
 * ActivityItemCard — group-feed-style card with per-kind visual variants.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';
import type { ActivityEvent } from '@cost-share/shared';
import { Text } from './AppText';
import { FeedRowThumbnail } from './FeedRowThumbnail';
import { formatCurrencyAmount } from '../lib/currencyDisplay';
import {
    activityCardAmountClass,
    getActivityCardVariant,
} from '../lib/activityCardVariant';
import { useRtlLayout, rtlRowStyle } from '../hooks/useRtlLayout';

interface ResolveTitleArgs {
    actorName: string;
    groupName: string;
    newMemberName?: string;
}

export function resolveActivityTitle(
    event: ActivityEvent,
    args: ResolveTitleArgs,
    t: TFunction,
): string {
    const { actorName, groupName, newMemberName } = args;
    const meta = event.metadata ?? {};
    switch (event.kind) {
        case 'expense_added':
            return (meta.description as string | undefined) ?? '';
        case 'settlement_added':
            // Description is built by ActivityItem (it needs perspective + i18n)
            return (meta.description as string | undefined) ?? '';
        case 'message_posted':
            return (meta.body as string | undefined) ?? '';
        case 'friend_request_received': {
            const status = (meta.status as string | undefined) ?? 'pending';
            if (status === 'accepted') {
                return t('activity.notifications.friendRequestAccepted', { name: actorName });
            }
            if (status === 'rejected') {
                return t('activity.notifications.friendRequestRejected', { name: actorName });
            }
            return t('activity.notifications.friendRequest', { name: actorName });
        }
        case 'group_added':
            return t('activity.notifications.groupInvite', { name: actorName, group: groupName });
        case 'group_member_joined':
            return t('activity.notifications.memberJoined', {
                name: newMemberName ?? actorName,
                group: groupName,
            });
        case 'group_removed':
            return t('activity.notifications.memberLeft', {
                name: actorName || t('common.you'),
                group: groupName,
            });
    }
}

interface ActivityItemCardProps {
    event: ActivityEvent;
    friendRequestStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
    title: string;
    meta: string;
    groupName?: string;
    onPress?: () => void;
    testID?: string;
}

export function ActivityItemCard({
    event,
    friendRequestStatus,
    title,
    meta,
    groupName,
    onPress,
    testID,
}: ActivityItemCardProps) {
    const isRtl = useRtlLayout();
    const variant = getActivityCardVariant(event.kind, friendRequestStatus);
    const md = event.metadata ?? {};
    const amount = typeof md.amount === 'number' || typeof md.amount === 'string'
        ? Number(md.amount)
        : 0;
    const currency = typeof md.currency === 'string' ? md.currency : '';
    const showAmount = variant.showAmount && amount > 0 && Boolean(currency);
    const amountText = showAmount ? formatCurrencyAmount(amount, currency) : null;

    const rowStyle = {
        gap: 12,
        alignItems: 'center' as const,
        ...rtlRowStyle(isRtl),
    };

    const shellStyle = {
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        width: '100%' as const,
        backgroundColor: variant.backgroundColor,
        borderColor: variant.borderColor,
    };

    const body = (
        <View style={rowStyle}>
            <FeedRowThumbnail
                iconName={variant.iconName}
                iconColor={variant.iconColor}
                iconBgColor={variant.iconBgColor}
                testID="activity-card-thumbnail"
            />
            <View className="flex-1 min-w-0" style={{ gap: 3 }}>
                <Text
                    className="text-[15px] font-semibold text-gray-900 leading-5"
                    numberOfLines={variant.titleLines}
                >
                    {title}
                </Text>
                {groupName && variant.showGroupLine ? (
                    <Text
                        className="text-[12px] font-medium text-primary leading-4"
                        numberOfLines={1}
                    >
                        {groupName}
                    </Text>
                ) : null}
                <Text
                    className="text-[11px] text-gray-400 leading-4"
                    numberOfLines={1}
                >
                    {meta}
                </Text>
            </View>
            {amountText ? (
                <View
                    testID="activity-card-amount"
                    style={{ flexShrink: 0, maxWidth: 108, alignItems: 'flex-end' }}
                >
                    <Text
                        className={`text-[15px] font-bold ${activityCardAmountClass(variant.amountTone)}`}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.65}
                        style={{ textAlign: 'right' }}
                    >
                        {amountText}
                    </Text>
                </View>
            ) : null}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                testID={testID}
                style={shellStyle}
            >
                {body}
            </TouchableOpacity>
        );
    }

    return (
        <View testID={testID} style={shellStyle}>
            {body}
        </View>
    );
}
```

- [ ] **Step 2: Update the unit test**

`cost-share-app/apps/mobile/__tests__/components/ActivityItemCard.test.tsx`:
- Replace the `RecentActivity` fixture with `ActivityEvent`.
- Build representative events for each kind (`expense_added`, `settlement_added`, `message_posted`, `friend_request_received` × 3 statuses, `group_added`, `group_member_joined`, `group_removed`).
- Assert that amount + group line render when expected per the variant.

Example fixture:
```ts
import type { ActivityEvent } from '@cost-share/shared';

const baseEvent: ActivityEvent = {
    id: 'evt-1',
    userId: 'u-recipient',
    kind: 'expense_added',
    groupId: 'g-1',
    refId: 'src-1',
    actorUserId: 'u-actor',
    metadata: { description: 'Lunch', amount: 30, currency: 'USD', expense_date: '2026-05-26' },
    createdAt: new Date('2026-05-26T12:00:00Z'),
};
```

- [ ] **Step 3: Run the test**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/ActivityItemCard.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/components/ActivityItemCard.tsx cost-share-app/apps/mobile/__tests__/components/ActivityItemCard.test.tsx
git commit -m "refactor(mobile): ActivityItemCard switches on ActivityEvent.kind"
```

---

### Task 25: Rewrite `ActivityItem` (renderer for one row)

**Files:**
- Modify: `cost-share-app/apps/mobile/components/ActivityItem.tsx`

This component now needs more than just the event — it needs the actor profile (name + avatar) and group name. The screen-level component will supply both via props.

- [ ] **Step 1: Replace the file**

```tsx
/**
 * ActivityItem — one row in the activity feed.
 *
 * Receives the ActivityEvent plus pre-resolved actor profile and group name.
 * The screen-level component fetches profile/group lookups in batch and passes
 * them down so this component stays display-only.
 */

import React, { useMemo } from 'react';
import type { ActivityEvent, GroupMemberLite } from '@cost-share/shared';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import { ActivityItemCard, resolveActivityTitle } from './ActivityItemCard';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { getAvatarUrl, getDisplayName } from '../lib/userDisplay';

interface ActivityItemProps {
    event: ActivityEvent;
    actor?: GroupMemberLite;
    /** For settlements: profiles of from_user_id / to_user_id (in metadata). */
    counterpart?: GroupMemberLite;
    /** For group_member_joined: profile of the new member from metadata.new_member_user_id. */
    newMember?: GroupMemberLite;
    groupName?: string;
    currentUserId: string;
    onPress?: (event: ActivityEvent) => void;
}

export const ActivityItem = React.memo(function ActivityItem({
    event,
    actor,
    counterpart,
    newMember,
    groupName,
    currentUserId,
    onPress,
}: ActivityItemProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const pressable = Boolean(onPress) && event.kind !== 'group_removed';

    const timestamp = formatFeedDateTime(event.createdAt, language);
    const actorName = getDisplayName(actor ?? null, t);
    const newMemberName = newMember ? getDisplayName(newMember, t) : undefined;
    const friendRequestStatus = event.kind === 'friend_request_received'
        ? ((event.metadata?.status as string | undefined) ?? 'pending') as
            'pending' | 'accepted' | 'rejected' | 'cancelled'
        : undefined;

    // Build a settlement description (uses currentUserId for perspective).
    let titleOverride: string | undefined;
    if (event.kind === 'settlement_added') {
        const md = event.metadata ?? {};
        const fromId = md.from_user_id as string | undefined;
        const toId = md.to_user_id as string | undefined;
        const amount = Number(md.amount ?? 0);
        const currency = (md.currency as string | undefined) ?? '';
        const fromName = fromId === currentUserId
            ? t('common.you')
            : (fromId === actor?.userId ? actorName : getDisplayName(counterpart ?? null, t));
        const toName = toId === currentUserId
            ? t('common.you')
            : (toId === actor?.userId ? actorName : getDisplayName(counterpart ?? null, t));
        const amountText = `${currency} ${amount.toFixed(2)}`;
        if (fromId === currentUserId) {
            titleOverride = t('activity.youPaid', { name: toName, amount: amountText });
        } else if (toId === currentUserId) {
            titleOverride = t('activity.paidYou', { name: fromName, amount: amountText });
        } else {
            titleOverride = t('feed.settlement', { from: fromName, to: toName, amount: amountText });
        }
        if (groupName) {
            titleOverride = `${titleOverride} ${t('activity.inGroup', { group: groupName })}`;
        }
    }

    const title = titleOverride ?? resolveActivityTitle(
        event,
        { actorName, groupName: groupName ?? '', newMemberName },
        t,
    );

    const meta = useMemo(() => {
        switch (event.kind) {
            case 'settlement_added':
            case 'friend_request_received':
            case 'group_added':
            case 'group_member_joined':
            case 'group_removed':
                return timestamp;
            case 'expense_added':
            case 'message_posted':
            default:
                return `${actorName} · ${timestamp}`;
        }
    }, [event.kind, actorName, timestamp]);

    const avatar = (
        <MemberAvatar
            name={actorName}
            avatarUrl={getAvatarUrl(actor ?? null) ?? undefined}
            size="xs"
            testID="activity-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID={`activity-item-${event.id}`}>
            <ActivityItemCard
                event={event}
                friendRequestStatus={friendRequestStatus}
                title={title}
                meta={meta}
                groupName={groupName}
                onPress={pressable ? () => onPress?.(event) : undefined}
                testID={`activity-card-${event.id}`}
            />
        </FeedChatRow>
    );
});
```

- [ ] **Step 2: Update its unit test**

`cost-share-app/apps/mobile/__tests__/components/ActivityItem.test.tsx`:
- Replace `RecentActivity` fixtures with `ActivityEvent`.
- Pass `actor`, `currentUserId`, `groupName` props.
- Cover at minimum: `expense_added` (amount shown, actor on meta), `message_posted` (no amount), `friend_request_received` (no amount, status drives title), `group_added` / `group_member_joined` / `group_removed`.
- Assert `group_removed` has no onPress wiring.

- [ ] **Step 3: Run the test**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/components/ActivityItem.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/components/ActivityItem.tsx cost-share-app/apps/mobile/__tests__/components/ActivityItem.test.tsx
git commit -m "refactor(mobile): ActivityItem renders ActivityEvent"
```

---

### Task 26: Rewrite `activityFilters`

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/activityFilters.ts`

The filter sheet keeps its chip values `'expense' | 'settlement' | 'message'`. The filter function maps those to the new `kind` values internally. Search/sort use `metadata.amount` / `metadata.currency`.

- [ ] **Step 1: Replace the file**

```ts
/**
 * Client-side filter + sort for the cross-group activity feed.
 *
 * The filter UI chip values stay 'expense' | 'settlement' | 'message' so the
 * sheet doesn't change. We map them here to the new activity_events kinds.
 * Membership and friend-request events are always shown (never filtered out
 * by the type chip).
 */

import { ActivityEvent, ActivityEventKind, GroupType } from '@cost-share/shared';

export type ActivityTypeFilter = 'expense' | 'settlement' | 'message';
export type ActivitySortOption = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';

const TYPE_FILTER_TO_KINDS: Record<ActivityTypeFilter, readonly ActivityEventKind[]> = {
    expense: ['expense_added'],
    settlement: ['settlement_added'],
    message: ['message_posted'],
};

const ALWAYS_VISIBLE_KINDS: readonly ActivityEventKind[] = [
    'friend_request_received',
    'group_added',
    'group_member_joined',
    'group_removed',
];

export interface ActivityFilters {
    types: ActivityTypeFilter[];
    groupTypes: GroupType[];
    currencies: string[];
    groupIds: string[];
    onlyMine: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortBy: ActivitySortOption;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
    types: [],
    groupTypes: [],
    currencies: [],
    groupIds: [],
    onlyMine: false,
    sortBy: 'dateDesc',
};

export function isAnyActivityFilterActive(f: ActivityFilters): boolean {
    return (
        f.types.length > 0 ||
        f.groupTypes.length > 0 ||
        f.currencies.length > 0 ||
        f.groupIds.length > 0 ||
        f.onlyMine ||
        Boolean(f.dateFrom) ||
        Boolean(f.dateTo) ||
        f.sortBy !== 'dateDesc'
    );
}

function parseDateStart(isoDate: string): number | null {
    const ms = Date.parse(isoDate);
    return Number.isNaN(ms) ? null : ms;
}

function parseDateEndExclusive(isoDate: string): number | null {
    const ms = Date.parse(isoDate);
    return Number.isNaN(ms) ? null : ms + 24 * 3600 * 1000;
}

function amountOf(event: ActivityEvent): number {
    const v = (event.metadata as Record<string, unknown> | undefined)?.amount;
    return typeof v === 'number' ? v : Number(v ?? 0);
}

function currencyOf(event: ActivityEvent): string {
    const v = (event.metadata as Record<string, unknown> | undefined)?.currency;
    return typeof v === 'string' ? v : '';
}

export function filterAndSortActivities(
    items: ActivityEvent[],
    filters: ActivityFilters,
    currentUserId?: string | null,
    groupTypeById?: Record<string, GroupType>,
): ActivityEvent[] {
    let list = [...items];

    if (filters.types.length > 0) {
        const allowedKinds = new Set<ActivityEventKind>([
            ...filters.types.flatMap(t => TYPE_FILTER_TO_KINDS[t]),
            ...ALWAYS_VISIBLE_KINDS,
        ]);
        list = list.filter(item => allowedKinds.has(item.kind));
    }

    if (filters.currencies.length > 0) {
        list = list.filter(item => {
            // Only expense/settlement carry currency; everything else passes through.
            if (item.kind !== 'expense_added' && item.kind !== 'settlement_added') return true;
            return filters.currencies.includes(currencyOf(item));
        });
    }

    if (filters.groupIds.length > 0) {
        list = list.filter(item => item.groupId !== null && filters.groupIds.includes(item.groupId));
    }

    if (filters.groupTypes.length > 0 && groupTypeById) {
        list = list.filter(item => {
            if (item.groupId === null) return false;
            const groupType = groupTypeById[item.groupId];
            return groupType && filters.groupTypes.includes(groupType);
        });
    }

    if (filters.onlyMine && currentUserId) {
        list = list.filter(item => item.actorUserId === currentUserId);
    }

    const fromMs = filters.dateFrom ? parseDateStart(filters.dateFrom) : null;
    const toMs = filters.dateTo ? parseDateEndExclusive(filters.dateTo) : null;
    if (fromMs !== null || toMs !== null) {
        list = list.filter(item => {
            const t = item.createdAt.getTime();
            if (fromMs !== null && t < fromMs) return false;
            if (toMs !== null && t >= toMs) return false;
            return true;
        });
    }

    list.sort((a, b) => {
        switch (filters.sortBy) {
            case 'dateAsc':
                return a.createdAt.getTime() - b.createdAt.getTime();
            case 'amountDesc':
                return amountOf(b) - amountOf(a);
            case 'amountAsc':
                return amountOf(a) - amountOf(b);
            case 'dateDesc':
            default:
                return b.createdAt.getTime() - a.createdAt.getTime();
        }
    });

    return list;
}

export function matchesActivitySearch(
    item: ActivityEvent,
    searchQuery: string,
    groupNameById?: Record<string, string>,
): boolean {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const md = item.metadata ?? {};
    const groupName = item.groupId ? groupNameById?.[item.groupId] : undefined;
    const haystack = [
        md.description as string | undefined,
        md.body as string | undefined,
        currencyOf(item),
        String(amountOf(item)),
        groupName,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
}
```

- [ ] **Step 2: Update the unit test**

`cost-share-app/apps/mobile/__tests__/lib/activityFilters.test.ts`:
- Replace `RecentActivity` fixture builder with one for `ActivityEvent`.
- Update assertions:
  - Type-chip `'expense'` keeps `expense_added` rows AND all membership/friend-request rows.
  - Currency filter only excludes expense/settlement rows; message and membership rows survive.
  - `onlyMine` checks `actorUserId === currentUserId` (not the old `userId`).
  - Sort by amount uses `metadata.amount`.
  - `matchesActivitySearch` matches by group name when a `groupNameById` lookup is provided (e.g. searching "Trip" returns expenses whose `groupId` resolves to a group named "Trip 2026").

- [ ] **Step 3: Run the test**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/lib/activityFilters.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/lib/activityFilters.ts cost-share-app/apps/mobile/__tests__/lib/activityFilters.test.ts
git commit -m "refactor(mobile): activityFilters operates on ActivityEvent"
```

---

### Task 27: Rewrite `ActivityFeedScreen`

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx`

Changes:
1. Use `ActivityEvent` everywhere.
2. On focus → call `mark_activity_seen` then invalidate the unread-count query.
3. Tap behavior:
   - `friend_request_received` → Profile → Friends (unchanged).
   - `expense_added` → expense detail sheet (unchanged).
   - `settlement_added` → settlement detail sheet (unchanged).
   - `group_added` / `group_member_joined` → navigate to GroupDetail.
   - `group_removed` → not pressable (handled by the `pressable` flag in ActivityItem).
   - `message_posted` → navigate to GroupDetail (current behavior for groupId-bearing rows).
4. Resolve actor / counterpart / new-member / group-name lookups in batch from the `activities` array and pass into each row.

- [ ] **Step 1: Replace the file**

```tsx
/**
 * ActivityFeedScreen — cross-group feed driven by activity_events.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
    ActivityEvent,
    ExpenseWithDelta,
    GroupMemberLite,
    Settlement,
} from '@cost-share/shared';
import { useActivityQuery } from '../../hooks/queries/useActivityQuery';
import { ACTIVITY_INITIAL_SKELETON_COUNT } from '../../services/activity.service';
import {
    deleteExpense,
    getExpenseWithSplitsById,
} from '../../services/expenses.service';
import { getSettlementById } from '../../services/settlements.service';
import { decorateExpense } from '../../services/expense-delta';
import { fetchProfilesByUserIds } from '../../services/groups.service';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../hooks/queries/keys';
import { resolveAutoTextInputStyle, rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';
import { EmptyState } from '../../components/EmptyState';
import { ActivityItem } from '../../components/ActivityItem';
import { ActivityItemSkeleton } from '../../components/ActivityItemSkeleton';
import { AppIcon } from '../../components/AppIcon';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
import {
    ActivityFiltersSheet,
    DEFAULT_ACTIVITY_FILTERS,
    isAnyActivityFilterActive,
    type ActivityFilters,
} from '../../components/ActivityFiltersSheet';
import {
    filterAndSortActivities,
    matchesActivitySearch,
} from '../../lib/activityFilters';
import { useAppStore } from '../../store';
import { colors } from '../../theme';
import type { GroupDetailFocusFeedItem } from '../../lib/groupDetailFocus';

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

type FeedDetailItem =
    | { kind: 'expense'; expense: ExpenseWithDelta }
    | { kind: 'settlement'; settlement: Settlement };

export function ActivityFeedScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();
    const currentUser = useAppStore(s => s.currentUser);
    const groups = useAppStore(s => s.groups);

    const {
        data,
        isLoading,
        isFetchingNextPage,
        isError,
        fetchNextPage,
        hasNextPage,
        refetch,
        isStale,
    } = useActivityQuery();

    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [detailItem, setDetailItem] = useState<FeedDetailItem | null>(null);
    const [detailMembers, setDetailMembers] = useState<Record<string, GroupMemberLite>>({});
    const [pendingDelete, setPendingDelete] = useState(false);
    const [userRefreshing, setUserRefreshing] = useState(false);
    const [profileMap, setProfileMap] = useState<Record<string, GroupMemberLite>>({});
    const canLoadMoreRef = useRef(false);

    const activities: ActivityEvent[] = useMemo(
        () => data?.pages.flatMap(page => page.items) ?? [],
        [data],
    );

    // Resolve all unique profile IDs referenced by current page (actors,
    // settlement counterparts, group_member_joined.new_member_user_id).
    useEffect(() => {
        const ids = new Set<string>();
        for (const evt of activities) {
            if (evt.actorUserId) ids.add(evt.actorUserId);
            const md = (evt.metadata ?? {}) as Record<string, unknown>;
            if (typeof md.from_user_id === 'string') ids.add(md.from_user_id);
            if (typeof md.to_user_id === 'string') ids.add(md.to_user_id);
            if (typeof md.new_member_user_id === 'string') ids.add(md.new_member_user_id);
        }
        const missing = [...ids].filter(id => !profileMap[id]);
        if (missing.length === 0) return;
        void fetchProfilesByUserIds(missing).then(extra => {
            setProfileMap(prev => ({ ...prev, ...extra }));
        });
    }, [activities, profileMap]);

    const handleRefresh = useCallback(async () => {
        canLoadMoreRef.current = false;
        setUserRefreshing(true);
        try {
            await refetch();
        } finally {
            setUserRefreshing(false);
        }
    }, [refetch]);

    useFocusEffect(
        useCallback(() => {
            // Mark seen + invalidate badge count.
            void supabase.rpc('mark_activity_seen').then(() => {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.activityUnreadCount,
                });
            });
            if (isStale) void refetch();
        }, [refetch, isStale, queryClient]),
    );

    const handleLoadMore = useCallback(() => {
        if (!canLoadMoreRef.current || !hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const handleScrollBeginDrag = useCallback(() => {
        canLoadMoreRef.current = true;
    }, []);

    const availableCurrencies = useMemo(() => {
        const fromGroups = groups.map(g => g.defaultCurrency);
        const fromActivities = activities
            .map(a => (a.metadata as Record<string, unknown>)?.currency)
            .filter((c): c is string => typeof c === 'string' && c.length > 0);
        return unique([...fromGroups, ...fromActivities]).sort();
    }, [groups, activities]);

    const availableGroups = useMemo(
        () =>
            groups
                .map(g => ({ id: g.id, name: g.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [groups],
    );

    const groupTypeById = useMemo(
        () => Object.fromEntries(groups.map(g => [g.id, g.groupType])),
        [groups],
    );

    const groupNameById = useMemo(
        () => Object.fromEntries(groups.map(g => [g.id, g.name])),
        [groups],
    );

    const displayedActivities = useMemo(() => {
        const filtered = filterAndSortActivities(
            activities,
            filters,
            currentUser?.id,
            groupTypeById,
        );
        return filtered.filter(item =>
            matchesActivitySearch(item, searchQuery, groupNameById),
        );
    }, [activities, filters, searchQuery, currentUser?.id, groupTypeById, groupNameById]);

    const filterActive = isAnyActivityFilterActive(filters);
    const showInitialSkeleton = isLoading && activities.length === 0;

    const navigateToGroupWithFocus = useCallback(
        (groupId: string, focusFeedItem: GroupDetailFocusFeedItem) => {
            setDetailItem(null);
            navigation.navigate('Groups', {
                screen: 'GroupDetail',
                params: { groupId, focusFeedItem },
                merge: true,
            });
        },
        [navigation],
    );

    const detailOpenInGroup = useMemo(() => {
        if (!detailItem) return undefined;
        const groupId = detailItem.kind === 'expense'
            ? detailItem.expense.groupId
            : detailItem.settlement.groupId;
        const groupName = groupNameById[groupId];
        if (!groupName) return undefined;
        const focusFeedItem: GroupDetailFocusFeedItem = detailItem.kind === 'expense'
            ? { kind: 'expense', id: detailItem.expense.id }
            : { kind: 'settlement', id: detailItem.settlement.id };
        return {
            label: t('activity.openInGroup', { group: groupName }),
            onPress: () => navigateToGroupWithFocus(groupId, focusFeedItem),
        };
    }, [detailItem, groupNameById, navigateToGroupWithFocus, t]);

    const openExpenseDetail = useCallback(
        async (expenseId: string) => {
            const expense = await getExpenseWithSplitsById(expenseId);
            if (!expense) return;
            const decorated = decorateExpense(expense, currentUser?.id ?? '');
            const userIds = Array.from(
                new Set([
                    expense.paidBy,
                    expense.createdBy,
                    ...expense.splits.map(s => s.userId),
                ].filter(Boolean)),
            );
            const profiles = await fetchProfilesByUserIds(userIds);
            setDetailMembers(profiles);
            setDetailItem({ kind: 'expense', expense: decorated });
        },
        [currentUser?.id],
    );

    const openSettlementDetail = useCallback(async (settlementId: string) => {
        const settlement = await getSettlementById(settlementId);
        if (!settlement) return;
        const userIds = Array.from(
            new Set([
                settlement.fromUserId,
                settlement.toUserId,
                settlement.createdBy,
            ].filter(Boolean)),
        );
        const profiles = await fetchProfilesByUserIds(userIds);
        setDetailMembers(profiles);
        setDetailItem({ kind: 'settlement', settlement });
    }, []);

    const handleActivityPress = useCallback(
        (event: ActivityEvent) => {
            if (event.kind === 'friend_request_received') {
                navigation.navigate('Profile', { screen: 'Friends' });
                return;
            }
            if (event.kind === 'expense_added') {
                void openExpenseDetail(event.refId);
                return;
            }
            if (event.kind === 'settlement_added') {
                void openSettlementDetail(event.refId);
                return;
            }
            // group_added / group_member_joined / message_posted → navigate to group
            if (event.groupId) {
                navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: event.groupId },
                });
            }
        },
        [navigation, openExpenseDetail, openSettlementDetail],
    );

    const handleDetailEdit = useCallback(() => {
        if (!detailItem) return;
        if (detailItem.kind === 'expense') {
            const { id: expenseId, groupId } = detailItem.expense;
            setDetailItem(null);
            navigation.navigate('Groups', {
                screen: 'AddExpense',
                params: { expenseId, groupId },
            });
            return;
        }
        const { groupId, id } = detailItem.settlement;
        navigateToGroupWithFocus(groupId, { kind: 'settlement', id });
    }, [detailItem, navigateToGroupWithFocus]);

    const handleDetailDeleteRequest = useCallback(() => {
        if (!detailItem) return;
        if (detailItem.kind === 'settlement') {
            const { groupId, id } = detailItem.settlement;
            navigateToGroupWithFocus(groupId, { kind: 'settlement', id });
            return;
        }
        setPendingDelete(true);
    }, [detailItem, navigateToGroupWithFocus]);

    const handleConfirmDelete = useCallback(async () => {
        if (!detailItem || detailItem.kind !== 'expense') {
            setPendingDelete(false);
            return;
        }
        const ok = await deleteExpense(detailItem.expense.id);
        setPendingDelete(false);
        if (ok) {
            setDetailItem(null);
            void refetch();
        }
    }, [detailItem, refetch]);

    const renderActivity = useCallback(
        ({ item }: { item: ActivityEvent }) => {
            const actor = item.actorUserId ? profileMap[item.actorUserId] : undefined;
            const md = (item.metadata ?? {}) as Record<string, unknown>;
            let counterpart: GroupMemberLite | undefined;
            if (item.kind === 'settlement_added') {
                const otherId = typeof md.from_user_id === 'string' && md.from_user_id !== item.actorUserId
                    ? md.from_user_id
                    : typeof md.to_user_id === 'string'
                    ? md.to_user_id
                    : undefined;
                if (otherId) counterpart = profileMap[otherId];
            }
            const newMemberId = typeof md.new_member_user_id === 'string'
                ? md.new_member_user_id
                : undefined;
            const newMember = newMemberId ? profileMap[newMemberId] : undefined;
            const groupName = item.groupId ? groupNameById[item.groupId] : undefined;
            return (
                <ActivityItem
                    event={item}
                    actor={actor}
                    counterpart={counterpart}
                    newMember={newMember}
                    groupName={groupName}
                    currentUserId={currentUser?.id ?? ''}
                    onPress={handleActivityPress}
                />
            );
        },
        [handleActivityPress, groupNameById, profileMap, currentUser?.id],
    );

    const keyExtractor = useCallback((item: ActivityEvent) => item.id, []);

    const listEmptyComponent = useMemo(() => {
        if (showInitialSkeleton) {
            return (
                <View>
                    {Array.from({ length: ACTIVITY_INITIAL_SKELETON_COUNT }, (_, index) => (
                        <ActivityItemSkeleton key={`activity-skeleton-${index}`} />
                    ))}
                </View>
            );
        }
        if (isError) {
            return (
                <EmptyState
                    iconName="alert-circle-outline"
                    title={t('activity.loadError')}
                    message={t('common.networkError')}
                    actionTitle={t('common.retry')}
                    onAction={handleRefresh}
                />
            );
        }
        if (searchQuery.trim().length > 0) {
            return (
                <EmptyState
                    iconName="search-outline"
                    title={t('activity.noSearchResults')}
                    message={t('activity.noSearchResultsMessage')}
                />
            );
        }
        return (
            <EmptyState
                iconName="list-outline"
                title={t('activity.noActivity')}
                message={t('activity.noActivityMessage')}
            />
        );
    }, [showInitialSkeleton, isError, t, handleRefresh, searchQuery]);

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <View className="flex-row items-center px-4 py-2">
                <View className="flex-1 flex-row items-center rounded-full bg-gray-100 px-3 h-9">
                    <AppIcon name="search" size={18} color={colors.gray500} />
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('activity.searchPlaceholder')}
                        placeholderTextColor={colors.gray400}
                        className={[
                            'flex-1 text-sm text-gray-900 mx-2',
                            rtlTextClassName(isRtl),
                        ].filter(Boolean).join(' ')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        style={resolveAutoTextInputStyle(isRtl)}
                        testID="activity-search-input"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            accessibilityRole="button"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <AppIcon name="close-circle" size={18} color={colors.gray400} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    onPress={() => setFiltersOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('activity.filters.title')}
                    className="ml-2 h-9 w-9 items-center justify-center relative"
                    testID="activity-filter-btn"
                >
                    <AppIcon name="options-outline" size={22} color={colors.gray500} />
                    {filterActive && (
                        <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                    )}
                </TouchableOpacity>
            </View>

            <FlatList
                data={displayedActivities}
                keyExtractor={keyExtractor}
                renderItem={renderActivity}
                contentContainerClassName="px-3 pb-4"
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews
                refreshControl={
                    <RefreshControl
                        refreshing={userRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                onScrollBeginDrag={handleScrollBeginDrag}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <ActivityIndicator className="py-4" color={colors.primary} />
                    ) : null
                }
                ListEmptyComponent={listEmptyComponent}
            />

            <ActivityFiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableCurrencies={availableCurrencies}
                availableGroups={availableGroups}
                onChange={setFilters}
                onClose={() => setFiltersOpen(false)}
            />

            <FeedItemDetailSheet
                item={detailItem}
                memberMap={detailMembers}
                currentUserId={currentUser?.id ?? ''}
                onClose={() => setDetailItem(null)}
                onEdit={handleDetailEdit}
                onDelete={handleDetailDeleteRequest}
                onOpenInGroup={detailOpenInGroup?.onPress}
                openInGroupLabel={detailOpenInGroup?.label}
            />

            <ConfirmDialog
                visible={pendingDelete}
                title={t('expenses.deleteExpense')}
                message={t('expenses.deleteExpenseConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={() => { void handleConfirmDelete(); }}
                onCancel={() => setPendingDelete(false)}
                destructive
            />
        </SafeAreaView>
    );
}
```

- [ ] **Step 2: Update screen test**

`cost-share-app/apps/mobile/__tests__/screens/activity/ActivityFeedScreen.test.tsx`:
- Update `mockFetchRecentActivity` resolved values to return `ActivityEvent` arrays.
- Add a new test asserting `supabase.rpc('mark_activity_seen')` is called when the screen gains focus.
- Add a new test asserting the unread-count query is invalidated after focus.

- [ ] **Step 3: Run the test**

```bash
cd cost-share-app/apps/mobile && npx jest __tests__/screens/activity/ActivityFeedScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx cost-share-app/apps/mobile/__tests__/screens/activity/ActivityFeedScreen.test.tsx
git commit -m "feat(mobile): ActivityFeedScreen reads ActivityEvent + mark-seen on focus"
```

---

### Task 28: Wire the tab badge

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add the hook import**

Near other hook imports at the top of the file:
```ts
import { useActivityUnreadCount } from '../hooks/queries/useActivityUnreadCount';
```

- [ ] **Step 2: Use the hook inside the `MainTabs` component**

Inside the tab navigator component (search for `<Tab.Navigator>`), before the `return`:
```tsx
const { data: unreadCount = 0 } = useActivityUnreadCount();
```

- [ ] **Step 3: Set `tabBarBadge` on the Activity tab**

Update the existing Activity `<Tab.Screen>`:
```tsx
<Tab.Screen
    name="Activity"
    component={ActivityStack}
    listeners={tabPopToTopOnPress('ActivityFeed')}
    options={{
        tabBarLabel: t('tabs.activity'),
        tabBarIcon: tabBarIcon('time', 'time-outline'),
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
    }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/navigation/AppNavigator.tsx
git commit -m "feat(mobile): numeric Activity tab badge from unread-count RPC"
```

---

### Task 29: Update `useAppRealtime`

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useAppRealtime.ts`

- [ ] **Step 1: Remove the three legacy activity-feed handlers**

Delete the three `.on('postgres_changes', { table: 'expenses' | 'settlements' | 'group_messages' }, ...)` invocations that only call `invalidateActivityDebounced`. Keep the imports `invalidateActivityDebounced` and `queryKeys` for now — they're reused below.

- [ ] **Step 2: Add the `activity_events` subscription**

Insert this `.on(...)` chained to the channel, before `.subscribe(...)`:

```ts
.on(
    'postgres_changes' as never,
    {
        event: '*',
        schema: 'public',
        table: 'activity_events',
        filter: `user_id=eq.${userId}`,
    },
    () => {
        try {
            invalidateActivityDebounced();
            void queryClient.invalidateQueries({
                queryKey: queryKeys.activityUnreadCount,
            });
        } catch (err) {
            console.error('app realtime: activity_events payload error:', err);
        }
    },
)
```

- [ ] **Step 3: Update `snapshotRefetch` to also invalidate the badge**

Add to the existing `snapshotRefetch` function body:
```ts
void queryClient.invalidateQueries({ queryKey: queryKeys.activityUnreadCount });
```

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useAppRealtime.ts
git commit -m "refactor(mobile): subscribe to activity_events, drop 3 per-table activity handlers"
```

---

### Task 30: Add i18n strings for new kinds

**Files:**
- Modify: `cost-share-app/apps/mobile/i18n/locales/en.json`
- Modify: `cost-share-app/apps/mobile/i18n/locales/he.json`

The existing strings already cover `friendRequest`, `friendRequestAccepted`, `friendRequestRejected`, `groupInvite`, `memberJoined`, `memberLeft`. Verify and add anything missing.

- [ ] **Step 1: Inspect existing keys**

```bash
grep -n "memberJoined\|memberLeft\|groupInvite\|friendRequest" cost-share-app/apps/mobile/i18n/locales/en.json
grep -n "memberJoined\|memberLeft\|groupInvite\|friendRequest" cost-share-app/apps/mobile/i18n/locales/he.json
```

If all 6 keys exist in both files, skip to Step 3.

- [ ] **Step 2: Add any missing keys**

If missing under `activity.notifications`, add to both files. Example shape for English:
```json
"activity": {
    "notifications": {
        "friendRequest": "{{name}} sent you a friend request",
        "friendRequestAccepted": "You and {{name}} are now friends",
        "friendRequestRejected": "{{name}} declined your friend request",
        "groupInvite": "{{name}} added you to {{group}}",
        "memberJoined": "{{name}} joined {{group}}",
        "memberLeft": "You left {{group}}"
    }
}
```

Mirror in Hebrew (`he.json`).

- [ ] **Step 3: Commit (if anything changed)**

```bash
git add cost-share-app/apps/mobile/i18n/locales/en.json cost-share-app/apps/mobile/i18n/locales/he.json
git commit -m "feat(mobile): i18n strings for membership activity kinds"
```

If nothing changed, skip the commit and note in the task summary.

---

### Task 31: Remove `RecentActivity` and dead types from shared

**Files:**
- Modify: `cost-share-app/packages/shared/src/types/index.ts`

After all consumers are migrated to `ActivityEvent` (Tasks 22–27), strip the dead types.

- [ ] **Step 1: Confirm no remaining consumers**

```bash
grep -rn "RecentActivity\|FriendRequestActivityStatus\|^export type ActivityType " cost-share-app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "dist/"
```

Expected: only the definitions in `packages/shared/src/types/index.ts` itself.

If any consumer remains (test file, etc.), fix it before proceeding.

- [ ] **Step 2: Delete the obsolete types**

In `packages/shared/src/types/index.ts` remove the block:
```ts
export type ActivityType = ...;
export type FriendRequestActivityStatus = ...;
export interface RecentActivity { ... }
```

(Keep the `ActivityEvent` / `ActivityEventKind` definitions added in Task 18.)

- [ ] **Step 3: Rebuild shared**

```bash
cd cost-share-app && npm run -w @cost-share/shared build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/packages/shared/src/types/index.ts cost-share-app/packages/shared/dist/
git commit -m "refactor(shared): remove RecentActivity in favor of ActivityEvent"
```

---

### Task 32: Whole-app verification

**Files:** none.

- [ ] **Step 1: Type-check the mobile app and shared package**

```bash
cd cost-share-app && npm run -w @cost-share/shared build && (cd apps/mobile && npx tsc --noEmit)
```

Expected: zero errors. If errors mention `RecentActivity` / `activityType`, an earlier task missed a consumer — fix and re-commit (NEW commit, do not amend).

- [ ] **Step 2: Run the mobile Jest suite**

```bash
cd cost-share-app/apps/mobile && npx jest
```

Expected: all suites pass. Watch for:
- `__tests__/components/ActivityItem.test.tsx`
- `__tests__/components/ActivityItemCard.test.tsx`
- `__tests__/lib/activityFilters.test.ts`
- `__tests__/lib/activityCardVariant.test.ts`
- `__tests__/screens/activity/ActivityFeedScreen.test.tsx`

If any other test trips on missing `RecentActivity`, fix and create a NEW commit.

- [ ] **Step 3: Re-run the SQL regression suite on dev**

```
mcp__supabase__execute_sql project_id="drxfbicunusmipdgbgdk" with the full contents of cost-share-app/supabase/__tests__/activity_events.test.sql
```

Expected: `NOTICE: All activity_events tests passed.`

- [ ] **Step 4: Smoke check the activity_events table count**

```
mcp__supabase__execute_sql project_id="drxfbicunusmipdgbgdk":

SELECT kind, COUNT(*) FROM activity_events GROUP BY kind ORDER BY kind;
```

Expected: non-zero counts for kinds present in source data. Record in task summary for the human reviewer.

- [ ] **Step 5: Final commit (if any tidy-ups landed)**

If steps above produced no further changes, skip. Otherwise:

```bash
git add -A
git commit -m "test(mobile): post-migration tidy-ups for activity events"
```

---

## Out of Scope (do NOT touch in this plan)

- **Prod apply.** `mcp__supabase__apply_migration` against `jfqxjjjbpxbwwvoygahu` requires explicit human approval per `AGENTS.md`. The plan stops at dev.
- **Push notifications.** Spec § "Future" — `delivery`, `push_status`, FCM/APNs, device tokens, preferences, mutes.
- **Filter sheet UI changes.** Chip labels and layout unchanged. Internal mapping changes only.
- **Per-event read state.** Single per-user watermark only.
- **Visual redesign.** Variant tokens unchanged.
- **Filter for new kinds.** Membership / friend-request rows are always visible when no type chip is active.
- **`scripts/seed.ts` added_by** — left NULL per spec line 101.
- **`redeem_invite_link` RPC added_by** — left NULL per spec line 100.

## Risks & Mitigations

| Risk | Mitigation in plan |
|---|---|
| Backfill row count is enormous and locks tables | Task 1 measures up front; if numbers are big, surface in summary before applying. |
| Trigger error breaks a business write | Task 14 sanity-checks; Task 15 runs the regression suite; Task 32 re-runs it. |
| Realtime regression (no badge updates) | Task 29 adds the subscription; Task 32 manual-tests by reviewer post-execution. |
| `RecentActivity` half-migration leaves tree red | Tasks 22–27 land in sequence in one execution session; Task 32 verifies full tree. |
| Prod accidentally touched | Plan explicitly hard-codes `drxfbicunusmipdgbgdk`; prod application is out-of-scope and reviewer-driven. |
