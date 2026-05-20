# Archive Mechanism — Plan

Status: planning · Owner: Avi · Last updated: 2026-05-20

The current "archive" in the app is actually a soft-delete (`groups.is_active=false`) hidden behind a misleading filter label. This document redefines archive from scratch as a **per-user visibility concept**, separates it cleanly from deletion, and replaces the existing "delete group" UX with archive-only behavior (delete still exists but is repositioned).

---

## 1. Product description (in user's words)

> There are two types of archive:
>
> **1. Auto-archive (UI-only, not in server).**
> A group is auto-archived when there are **no balances** and **no actions** in the last **two months**. Every action counts (not only actions related to me). The user cannot manually remove a group from auto-archive — the only way out is for any action to happen in the group, which automatically unarchives it.
>
> **2. Manual archive (per-user, stored).**
> The user can send a group to archive from group settings, but only if they have no balance they are involved in. It applies only to that user. While a group is in their manual archive, if another user performs an action related to them (the archived user), the group automatically returns from archive. The user can also manually unarchive — but only for groups they manually archived; auto-archived groups can only exit via activity.
>
> In the user's view there is a list of all groups except those in archive. There is a filter to show archived groups too; when enabled, all groups appear.
>
> `groups.is_active` is **not relevant to archive anymore**. It is only the indicator of whether a group is deleted. The option to manually archive lives in group settings, alongside a delete option (which sets `is_active=false`, hiding the group from everyone). Deletion is allowed in any state regardless of balances.
>
> Profile stats show "groups with balances" (active) and "groups without balances" (inactive), counting **all groups including archived ones**. Tapping either stat opens the groups list with the appropriate balance filter and with the archive view turned on.

---

## 2. Goals & non-goals

**In scope**
- Two distinct archive mechanisms: auto (UI-only, group-wide) and manual (DB-stored, per-user).
- Manual archive button in group settings, conditional on user having zero balance in the group.
- Manual unarchive button in group settings, visible only for manually-archived groups.
- Auto-unarchive of manual archive when a balance-affecting action involves the user.
- Auto-unarchive of auto archive when any qualifying action happens in the group.
- A single archive filter in the groups list that reveals both auto- and manually-archived groups together.
- A delete button in group settings that sets `groups.is_active=false`, unconditional.
- Profile stats include archived groups in the counts; tapping a stat opens groups list with `balanceState` filter applied **and** the archive view enabled.

**Out of scope (this iteration)**
- Differentiating in the list UI between auto- and manually-archived groups (a single "archived" pill is enough).
- Push/in-app notifications when a manually-archived group auto-unarchives.
- Cross-device sync of the archive filter toggle state.
- Bulk archive operations.
- Archive of friends, expenses, settlements, or any object other than groups.
- A trash / restore UX for deleted groups (`is_active=false` stays terminal).

---

## 3. Glossary

- **Auto-archive (Type 1)**: A computed UI-only state. The group is "auto-archived" for **all** users equally when balance + activity conditions are met. Never written to the DB.
- **Manual archive (Type 2)**: A per-user DB row stating "this user has hidden this group." Persists until removed.
- **Archive view**: The state of the groups list filter where archived groups are shown. Default: off.
- **Qualifying action**: An action that counts for the auto-archive timer and for manual auto-unarchive. Defined in §5.
- **Involving action**: A qualifying action whose participants include a specific user. Used for manual auto-unarchive.
- **Delete**: `groups.is_active=false`. Terminal; the group disappears for everyone, no archive filter reveals it.

---

## 4. Archive conditions

### 4.1 Auto-archive (Type 1)

A group is **auto-archived for all users** when **both** of the following are true at read time:

- **No balances**: For every active member, `ABS(net balance) < 0.01` in every currency the group uses. (Same condition currently used by `get-user-dashboard.sql` for "closed groups".)
- **No qualifying action in the last 2 months**: `groups.last_activity_at < NOW() - INTERVAL '2 months'`.

A new column `groups.last_activity_at` (see §6.2) is maintained by trigger and stores the latest qualifying-action timestamp for the group. The auto-archive check is therefore a single column comparison, not a MAX across three tables.

### 4.2 Manual archive (Type 2)

A group is **manually archived for user U** when there is a row `(user_id=U, group_id=G)` in a new `group_user_archive` table (see §6).

A user may manually archive a group **only if** their net balance in that group is zero across all currencies (`ABS(net) < 0.01` for every currency). Enforced both client-side (button hidden/disabled with reason) and server-side (RPC rejects).

A user may **always** manually unarchive a group they previously manually archived — no conditions.

### 4.3 Combined display rule

When listing groups for user U, a group is **hidden** if:
- It is manually archived for U (row exists in `group_user_archive`), **OR**
- It is auto-archived (group-wide condition in §4.1), **AND** U has no involving action in the group within the auto-archive window.

Wait — auto-archive in §4.1 is group-wide, so this last clause does not apply to Type 1. Type 1 hides the group from everyone uniformly. Re-stated:

A group is **hidden from U's default list** if either:
1. The group is auto-archived (Type 1, group-wide), OR
2. There is a `group_user_archive` row for U + this group (Type 2).

The archive view (filter on) shows groups that match either condition. A group can be in both states at once; that's fine — same pill, still one item in the archived list.

---

## 5. Qualifying actions

A **qualifying action** is any of the following events in a group:

| Event | Table / column | Counts as qualifying? | Counts as "involving" user U? |
|---|---|---|---|
| Expense created | `expenses` insert | Yes | U is `paid_by` OR U has a row in `expense_splits` for this expense |
| Expense edited | `expenses.updated_at` change | Yes | Same as create |
| Expense deleted (soft) | `expenses.is_deleted=true` | Yes | Same as create |
| Settlement created | `settlements` insert | Yes | U is `from_user_id` OR `to_user_id` |
| Settlement edited | `settlements.updated_at` change | Yes | Same as create |
| Settlement deleted (soft) | `settlements.deleted_at` set | Yes | Same as create |
| Chat message posted | `group_messages` insert | Yes | U is the message author |
| Group renamed / image changed | `groups.name`, `groups.image_url` | **No** | n/a |
| Group type / currency changed | `groups.group_type`, `groups.default_currency` | **No** | n/a |
| Member added / removed / left | `group_members` insert / update | **No** | n/a |

**Latest qualifying action timestamp for a group** is stored in `groups.last_activity_at`. It is updated by triggers (§11 step 2) on insert/update of `expenses`, `settlements`, and `group_messages`. For deletes (soft-delete), the trigger fires on the `UPDATE` that sets `is_deleted=true` / `deleted_at=NOW()`, so deletes count as activity. Backfill on migration with `MAX` over the three source tables (§10).

**Involving action** is not stored — it is implicit in the cascade-clear trigger (§11 step 2). When a qualifying action involves user U, the trigger removes U's `group_user_archive` row in the same transaction. No separate "last involving action" timestamp is needed.

---

## 6. Schema changes

### 6.1 New table

```sql
CREATE TABLE group_user_archive (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, group_id)
);

CREATE INDEX idx_group_user_archive_user ON group_user_archive(user_id);
```

**RLS**: A row is readable/writable only by `auth.uid() = user_id`. Inserts/deletes restricted to that user. No admin override needed.

### 6.2 Column added to `groups`

```sql
ALTER TABLE groups ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX idx_groups_last_activity_at ON groups(last_activity_at);
```

Maintained by trigger — see §11 step 2. Backfilled on migration from `MAX(expenses.updated_at, settlements.updated_at, group_messages.created_at)` per group; for groups with no activity yet, falls back to `groups.created_at`.

`groups.is_active` keeps its current semantics, but its meaning is **renamed in our heads** to "not deleted". No data migration needed; existing `is_active=false` rows are treated as deleted (terminal — no UI to restore them).

All other tables unchanged.

### 6.3 RPCs

Two new RPCs:

```sql
-- Throws 'has_balance' if user has nonzero net in the group.
CREATE FUNCTION archive_group(p_group_id UUID) RETURNS VOID …

-- Always succeeds for groups the user previously archived.
CREATE FUNCTION unarchive_group(p_group_id UUID) RETURNS VOID …
```

Both use `auth.uid()` as `user_id`. `archive_group` recomputes the user's net balance from `expenses`/`expense_splits`/`settlements` and rejects if `ABS(net) >= 0.01` in any currency.

### 6.4 Updates to existing RPCs

`get-user-dashboard.sql`:
- **No change** to `activeGroupsCount` / `closedGroupsCount` computation — per the spec, stats include archived groups, and the existing logic already counts every group the user is in. The labels in the mobile app are now "groups with balances" / "groups without balances" (already updated in the i18n diff on the branch).

`get_groups_with_members` (or whatever powers the groups list — to verify in implementation):
- Add a left-join to `group_user_archive` so each row returns `isArchivedByMe: boolean`.
- Add a derived `isAutoArchived: boolean` computed per §4.1.
- The client filters using both columns; the RPC does not filter — it returns everything, and the mobile app decides what to show based on the archive view toggle.

---

## 7. UI changes

### 7.1 Group settings (`EditGroupScreen.tsx`)

The "Danger Zone" section ([lines 296-316](cost-share-app/apps/mobile/screens/groups/EditGroupScreen.tsx#L296)) becomes a **two-button section**:

1. **Archive / Unarchive toggle** (primary, neutral color):
   - When the group is **not** in this user's manual archive: shows "העבר לארכיון" / "Move to archive".
     - Enabled only if the user's net balance in the group is zero in every currency.
     - Disabled with reason text ("יש לך יתרה פתוחה בקבוצה — סלק חובות לפני העברה לארכיון") otherwise.
   - When the group **is** in this user's manual archive: shows "החזר מארכיון" / "Restore from archive".
     - Always enabled. No confirmation dialog — the action is fully reversible.

2. **Delete** (destructive, kept):
   - Unchanged behavior: opens confirm dialog → calls `deleteGroup()` → `groups.is_active=false`.
   - Always enabled regardless of balances or archive state.
   - Copy clarified: title "מחק קבוצה לכולם" / "Delete group for everyone" so the difference from archive is obvious.

The button currently labeled `t('groups.deleteGroup')` should not be removed; we just **add the archive button above it**.

### 7.2 Groups list (`GroupsListScreen.tsx` + `FiltersSheet.tsx`)

Replace the existing `includeArchived` toggle (which is wrong — it currently exposes deleted groups).

- **Remove**: the `includeArchived` switch in `FiltersSheet.tsx` ([lines 200-210](cost-share-app/apps/mobile/components/FiltersSheet.tsx#L200)). It was tied to `groups.is_active` and should no longer be shown — deleted groups must never appear.
- **Add**: a new toggle `showArchived` in `FiltersSheet.tsx`. Default off. Label: "הצג קבוצות בארכיון" / "Show archived groups".
- **Add**: an "archived" pill / badge on `GroupCard` for any group hidden by the archive view but currently visible (because the toggle is on). The pill is the same for Type 1 and Type 2.
- **Filter logic** in `passesFilters` ([GroupsListScreen.tsx:55-70](cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx#L55)):
  ```ts
  const isArchived = group.isAutoArchived || group.isArchivedByMe;
  if (!filters.showArchived && isArchived) return false;
  ```
- The existing `balanceState` filter (`all` / `owe` / `owed` / `unsettled` / `settled`) stays as-is and combines with the archive filter (AND).

### 7.3 Profile stats (`ProfileScreen.tsx`)

The current diff on the branch already passes a `balanceState` param when tapping each stat tile. Extend it so both also turn on the archive view:

```ts
onPress={() =>
    navigation.navigate('Groups', {
        screen: 'GroupsList',
        params: { balanceState: 'unsettled', showArchived: true },
    })
}
```

Same for the closed/settled tile with `balanceState: 'settled'`. `GroupsListScreen` reads both params on mount and applies them to its filter state (mirror the existing `incomingBalanceState` effect introduced in the diff).

### 7.4 Archived group card style

Mirror the visual treatment used in `SettleUpListScreen.tsx` for non-involved debt rows ([lines 195-246](cost-share-app/apps/mobile/screens/balances/SettleUpListScreen.tsx#L195)), so the "muted / not-relevant" pattern is consistent across the app.

When a group card is rendered with `isArchived = isAutoArchived || isArchivedByMe`:

| Element | Default card | Archived card |
|---|---|---|
| Container background | `bg-white` | `bg-slate-50` |
| Container border | `border-gray-100` (solid) | `border-gray-300 border-dashed` |
| Group name color | `text-gray-900` | `text-gray-600` |
| Secondary text (balance, members count) | normal | `text-gray-500` |
| Badge | none | small uppercase pill, `text-gray-500`, ~10px font, label `groups.archivedBadge` ("ארכיון" / "ARCHIVED") |

Cards remain tappable — the user can still open an archived group's detail screen. The styling is a hint, not a disable.

### 7.5 Empty states & copy

- Groups list with `showArchived=false` and 0 results: existing empty state stays.
- Groups list with `showArchived=true` and 0 archived rows: small inline note "אין קבוצות בארכיון" instead of empty state.
- One badge style for both Type 1 and Type 2 — no UI distinction.

---

## 8. Client-side data shape

`GroupWithMembers` in `@cost-share/shared` gains two computed fields:

```ts
interface GroupWithMembers {
    // …existing fields…
    isArchivedByMe: boolean;   // from group_user_archive row
    isAutoArchived: boolean;   // computed: §4.1 conditions
}
```

`isAutoArchived` is computed server-side in the groups-fetch RPC to keep clients consistent (no client-side date math drift). Recomputed every fetch; nothing cached. If users keep the list open for hours and a group crosses the 2-month threshold, the next pull-to-refresh re-classifies it.

---

## 9. Behavioral edge cases

| Scenario | Behavior |
|---|---|
| User archives manually, then someone adds an expense that involves them | A Postgres trigger on `expenses` / `expense_splits` / `settlements` inserts deletes any matching `group_user_archive` rows for users involved in the new event. The next fetch returns the group with `isArchivedByMe=false`. See §11 for the trigger spec. |
| User archives manually, then someone sends a chat message | Chat messages are qualifying actions but **do not unarchive** Type 2 — they are not involving actions for any specific user (other than the author). The archive stays. |
| Group is auto-archived (group-wide), and a user is also manually archived for it | Both flags true. The group is hidden by the default filter. Toggle on → group shown with one archive pill. Manual unarchive still works (removes Type 2). The group remains hidden if Type 1 still applies. |
| User has balance in currency A = 0 but in currency B = nonzero | Manual archive blocked. The check is per-currency net. |
| User left the group (`group_members.is_active=false`) | They still see history. They can manually archive (already settled, no balance). Future activity in the group doesn't unarchive them, since they're no longer in `expense_splits`. Acceptable. |
| Group is deleted (`groups.is_active=false`) while user has it manually archived | The group disappears for everyone, archive view included. The `group_user_archive` row is orphaned but harmless; will be cascade-deleted if `groups` row is hard-deleted. Since deletion is soft, leave the orphan row alone. |
| Auto-archive flips mid-session | Only re-evaluated on fetch. UI doesn't proactively move a group between sections within a single mounted screen. |

---

## 10. Migration

- **Backfill `groups.last_activity_at`** in the same migration that adds the column:
  ```sql
  UPDATE groups g
  SET last_activity_at = COALESCE(
      (SELECT MAX(t) FROM (
          SELECT MAX(updated_at) AS t FROM expenses WHERE group_id = g.id
          UNION ALL
          SELECT MAX(updated_at) FROM settlements WHERE group_id = g.id
          UNION ALL
          SELECT MAX(created_at) FROM group_messages WHERE group_id = g.id
      ) s),
      g.created_at
  );
  ```
- `groups.is_active=false` rows stay treated as "deleted" — they were always hidden by `fetchGroups()` ([groups.service.ts:102-103](cost-share-app/apps/mobile/services/groups.service.ts#L102)). The old "include archived" filter exposed them; that filter is being removed, so they revert to fully hidden.
- The `group_user_archive` table starts empty. No prior data to backfill — manual archive is a new concept.

---

## 11. Implementation order

1. **Schema**: create `group_user_archive`, RLS, `archive_group` / `unarchive_group` RPCs, migration file under `supabase/migrations/`.
2. **Activity triggers**. Two trigger functions, both attached AFTER INSERT/UPDATE on the same source tables:

   **2a. `bump_group_last_activity()`** — updates `groups.last_activity_at = NOW()` for the affected `group_id`. Fires on:
   - `expenses` insert/update (covers create, edit, and soft-delete since `is_deleted=true` is an UPDATE)
   - `settlements` insert/update (covers soft-delete since `deleted_at=NOW()` is an UPDATE)
   - `group_messages` insert (chat messages are not editable in current schema)

   **2b. `clear_group_user_archive_on_activity()`** — deletes `group_user_archive` rows for involved users. Fires on:
   - `expenses` insert/update → delete row for `(paid_by, group_id)`
   - `expense_splits` insert/update → delete row for `(user_id, expense.group_id)` (join on `expense_id`)
   - `settlements` insert/update → delete rows for `(from_user_id, group_id)` and `(to_user_id, group_id)`
   - `group_messages` → **no action**. Chat messages bump `last_activity_at` but do not auto-unarchive (§9).

   Both functions are centralized and cannot be bypassed by future writers that forget to call them.
3. **Server**: update the RPC that powers `fetchGroups()` to include `isArchivedByMe` and `isAutoArchived` columns.
4. **Shared types**: extend `GroupWithMembers` with the two new flags.
5. **Mobile — groups service**: add `archiveGroup(groupId)` / `unarchiveGroup(groupId)` calls.
6. **Mobile — EditGroupScreen**: add archive/unarchive button above delete; gate by balance.
7. **Mobile — FiltersSheet**: remove old `includeArchived`, add new `showArchived`. Update copy.
8. **Mobile — GroupsListScreen**: replace filter logic per §7.2, read `showArchived` from route params (mirror existing `balanceState` param handling).
9. **Mobile — GroupCard**: apply muted / dashed style + archived badge per §7.4.
10. **Mobile — ProfileScreen**: pass `showArchived: true` from both stat tiles.
11. **i18n**: add new keys for archive button, archive reasons, archived badge, "no archived groups" empty state, delete-button new title.
12. **Manual QA** per §12.

---

## 12. Test plan

- Manual archive happy path: settled group → archive → disappears from list → toggle on → appears with pill → unarchive → reappears in default list.
- Manual archive blocked: group with open balance → archive button disabled with reason.
- Auto-unarchive (involving expense): manually archive a settled group, have another member add an expense splitting with the archived user → archived user opens app → group reappears in default list.
- Auto-unarchive (involving settlement): same as above with a settlement to/from the archived user.
- No-unarchive (chat message): manually archive, have another member send a chat message → archive view still applies, group does not reappear.
- Auto-archive (Type 1): take a fully settled group with no expenses/settlements/messages in 2+ months → opens app → group is hidden by default, appears in archive view with pill.
- Auto-archive exit: trigger any qualifying action in an auto-archived group → next fetch → group reappears in default list for all users.
- Combined state: group is both auto-archived and manually archived for U → hidden by default → archive view shows it with one pill → unarchive manually → still hidden (Type 1 still applies) → trigger a qualifying action → reappears.
- Delete: from settings → confirms → `is_active=false` → group gone for everyone, including archive view.
- Profile stat tap: tap "groups without balances" → groups list opens with `balanceState=settled` AND `showArchived=true`.
- Existing deleted groups (`is_active=false` from before this change): never appear, even with archive view on.
- RLS: user A cannot see or modify user B's `group_user_archive` rows.

---

## 13. Notes

- The `bump_group_last_activity` trigger writes to `groups` on every expense/settlement/message event. This is a single indexed update by primary key — negligible overhead, and it eliminates a MAX-over-three-tables on every list fetch. Net win.
- If we later need richer audit history (who did what when), the same trigger pattern can be extended to insert into a dedicated activity log table. Out of scope here.
