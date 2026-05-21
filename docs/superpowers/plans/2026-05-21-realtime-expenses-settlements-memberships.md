# Realtime: Expenses, Settlements & Group Memberships — Implementation Plan

**Date:** 2026-05-21
**Status:** Draft

**Goal:** Today, only `group_messages` updates live inside a group. Extend live updates so that:

1. **Inside a group:** new / edited / deleted **expenses** and **settlements** appear in realtime (same UX as messages today).
2. **On the groups list:** when the current user is **added to a new group**, that group appears live without needing a refresh. When they're removed, it disappears live.

This is mobile-only — the web app has no group screens.

---

## Current State (as of 2026-05-21)

- **Realtime publication:** Only `public.group_messages` is published to `supabase_realtime`. `expenses`, `settlements`, `group_members` are **not** published.
- **Existing realtime hook (the template):** [`cost-share-app/apps/mobile/hooks/useGroupMessagesRealtime.ts`](../../../cost-share-app/apps/mobile/hooks/useGroupMessagesRealtime.ts) — one channel per group (`group_messages:<groupId>`), filtered server-side with `filter: 'group_id=eq.<id>'`, listens to `*`, dispatches to Zustand on INSERT/UPDATE/DELETE, handles soft-delete (`isDeleted`) by removing.
- **Group detail screen:** [`screens/groups/GroupDetailScreen.tsx:176`](../../../cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx) calls `useGroupMessagesRealtime(groupId)`. Data sources on the screen:
  - Expenses → Zustand (`addExpense`, `updateExpense`, `removeExpense` already exist in `store/index.ts:109-118`).
  - Settlements + pairwise debts → React Query (`['groupSettlements', groupId]`, `['groupPairwiseDebts', groupId]` in `hooks/queries/keys.ts`).
  - Balances → Zustand (`setBalanceSummary` rewrites the whole map — no per-group setter).
- **Groups list screen:** [`screens/groups/GroupsListScreen.tsx`](../../../cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx) — pull-only, refetches on navigation. Has `addGroup`, `updateGroup`, `removeGroup` Zustand actions ready.
- **Current user accessor:** `useAppStore().currentUser.id` (set from session in `store/index.ts:66`).

---

## Architecture Decisions

1. **Mirror the messages-realtime pattern.** One channel per resource per group, server-side filtered by `group_id`. Keeps payloads tiny and lets RLS gate access.
2. **Refetch on event, don't trust the payload.** The realtime INSERT payload for `expenses` doesn't include `expense_splits` (separate table), and `group_members` events don't include the joined `groups` row. On every event, refetch the single canonical row via the existing service layer, then upsert into Zustand. Idempotent, correct, and cheap (single-row by id).
3. **Soft deletes are UPDATEs, not DELETEs.** `expenses.is_deleted = true` and `settlements.deleted_at IS NOT NULL` arrive as UPDATE events. Translate them to `removeExpense` / cache-evict, same as the messages hook already does for `isDeleted`.
4. **Derived data is invalidated, not pushed.** Balances and pairwise-debts derive from expenses + settlements. After any event in either, invalidate `['groupSettlements', groupId]` and `['groupPairwiseDebts', groupId]`, then refetch the group's balance (debounced).
5. **Membership channel is per-user, not per-group.** When a user is added to a new group, they don't yet have a subscription to that group. Filter on the user: `user_id=eq.<currentUserId>` on `group_members`.

---

## Work Breakdown

### 1. DB migration

New migration under `cost-share-app/apps/server/supabase/migrations/` (confirm path against existing migration files):

```sql
-- Publish the three tables to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
```

**Verify SELECT RLS policies** for the subscriber:

- `expenses`: group members can SELECT rows where `group_id` is one of their groups.
- `settlements`: same.
- `group_members`: the current user can SELECT their own membership rows (`user_id = auth.uid()`).

Realtime applies RLS to each subscriber on each event. Without correct SELECT policies, the subscription silently delivers nothing. Add policies if missing.

### 2. New hooks (mobile)

#### `hooks/useGroupExpensesRealtime.ts`

- Channel: `group_expenses:<groupId>`
- Filter: `group_id=eq.<groupId>`, event `*`
- On INSERT or UPDATE:
  - If `is_deleted === true` → `removeExpense(new.id)`.
  - Otherwise → refetch the single expense (with splits) via the existing service, then `addExpense` / `updateExpense`.
- On DELETE → `removeExpense(old.id)`.
- After any event:
  - Invalidate `['groupSettlements', groupId]` and `['groupPairwiseDebts', groupId]` (pairwise debts depend on expenses too).
  - Debounced `fetchBalanceSummary()` for the group (500 ms).
- Cleanup on unmount: `channel.unsubscribe()` + `supabase.removeChannel()` — same as messages hook.

#### `hooks/useGroupSettlementsRealtime.ts`

- Channel: `group_settlements:<groupId>`
- Filter: `group_id=eq.<groupId>`, event `*`
- On any event:
  - Invalidate `['groupSettlements', groupId]` and `['groupPairwiseDebts', groupId]`.
  - Debounced `fetchBalanceSummary()` for the group.
- No Zustand writes — settlements are React Query-owned.
- Handles soft-delete (`deleted_at`) automatically via the refetch on invalidate.

#### `hooks/useUserGroupMembershipsRealtime.ts`

- Channel: `user_group_memberships:<currentUserId>`
- Filter: `user_id=eq.<currentUserId>`, event `*`
- On INSERT:
  - Fetch the group row via existing service (`getGroupById` or equivalent).
  - Fetch the group's balance (re-call `fetchBalanceSummary` and merge via `setBalanceSummary`).
  - `addGroup(group)`.
- On UPDATE where `is_active === false` or `left_at !== null` → `removeGroup(group_id)`.
- On DELETE → `removeGroup(old.group_id)`.
- Cleanup on unmount.

### 3. Wiring

- `GroupDetailScreen.tsx:176` — add `useGroupExpensesRealtime(groupId)` and `useGroupSettlementsRealtime(groupId)` immediately after the existing `useGroupMessagesRealtime(groupId)` call.
- `GroupsListScreen.tsx` — add `useUserGroupMembershipsRealtime(currentUserId)` near the top of the component (after the existing data hooks).

### 4. Edge cases

- **Unmount cleanup** — same `channel.unsubscribe()` + `supabase.removeChannel()` pattern as messages.
- **Group switch race** — when `groupId` changes, the `useEffect` cleanup must run before the new channel opens. Standard `useEffect` with `[groupId]` dep handles this if cleanup is correct.
- **Burst debounce** — many expenses arriving in 2 seconds should not trigger many balance refetches. Debounce `fetchBalanceSummary` per group (500 ms).
- **Self-echo** — when the local user creates an expense, the realtime event arrives after the local mutation already updated state. The upsert-by-id pattern is idempotent, so no extra dedupe logic is needed.
- **RLS** — without correct SELECT policies, subscriptions silently deliver nothing. Verify in an integration smoke test (two users, two devices, one group).
- **Re-render storms** — `setBalanceSummary` rewrites the whole map; every balance-subscribed component re-renders on each event. The debounce mitigates the common case. Consider adding a per-group balance setter as a small refactor alongside this work if `setBalanceSummary` proves hot.

---

## Performance

**Initial screen load: unaffected.** All subscriptions are set up in `useEffect`, which fires after the first render. They don't block fetching expenses, settlements, messages, or the group list. Opening a Supabase channel reuses the existing websocket — no new connection. Three channels on the detail screen vs. one today is a negligible difference; the existing pattern is the proof.

**Steady-state cost is bounded:**

- One single-row refetch per expense INSERT/UPDATE (needed because realtime payloads don't include `expense_splits`). For typical group usage (a handful of events per hour) this is invisible.
- React Query invalidations trigger background refetches. RQ's default state during background refetch is `isFetching`, not `isLoading` — the existing list stays on screen, no skeleton flash. Audit settlement components to ensure they key off `isLoading`, not `isFetching`, before merging.
- Balance refetch is debounced (500 ms per group) so a burst of expenses doesn't fan out into many balance recalculations.

**When this could be felt:**

- **Bulk import** (e.g. 20 expenses in 2 seconds) → 20 single-row refetches. Network-bound but non-blocking; the UI keeps rendering. If this becomes a real workflow, switch to subscribing to `expense_splits` and assembling client-side. Don't pre-optimize.
- **Bad network** → the new expense appears a beat later. Doesn't block anything else on screen.

**Memory / battery:** three open channels vs. one, sharing one websocket. Negligible.

**Render hotspot to watch:** `setBalanceSummary` rewriting the whole balance map per event. The debounce contains it; a per-group balance setter is the next mitigation if needed.

---

## Testing Checklist

- [ ] Two devices, same group: A creates an expense → B sees it within ~1s, no refresh.
- [ ] Same for edit and delete (soft delete).
- [ ] Same for settlements (create + delete).
- [ ] Balances and pairwise debts update on the other device after each expense/settlement change.
- [ ] A adds B to a new group from group settings → B's groups list shows the new group live, with correct balance.
- [ ] A removes B from a group → group disappears from B's list live.
- [ ] Background → foreground: subscriptions still deliver events after briefly backgrounding the app.
- [ ] Switching between groups quickly does not leak channels (check `supabase.getChannels()` count returns to expected baseline).
- [ ] No `isLoading` spinner flashes on settlement list during background refetch.

---

## Out of Scope

- **Live reordering of the group list by `last_activity_at`** — would require subscribing to `groups` UPDATE for each of the user's groups. Separate, larger change.
- **Web client** — no group screens exist yet.
- **Realtime for `expense_splits` edits** — covered transitively by the parent-expense refetch.
- **Typing indicators, presence, read receipts** — different feature.

---

## Files Touched (summary)

| File | Change |
| --- | --- |
| `cost-share-app/apps/server/supabase/migrations/<new>.sql` | Add three tables to `supabase_realtime`; verify/add SELECT RLS policies. |
| `cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts` | New hook. |
| `cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts` | New hook. |
| `cost-share-app/apps/mobile/hooks/useUserGroupMembershipsRealtime.ts` | New hook. |
| `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx` | Add two hook calls next to existing `useGroupMessagesRealtime`. |
| `cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx` | Add membership hook call. |
