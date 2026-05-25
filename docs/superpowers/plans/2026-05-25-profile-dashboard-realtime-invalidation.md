# Profile Dashboard Realtime Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Profile screen's balance/stats reflect expense, settlement, and group-membership changes that the device already receives via existing realtime subscriptions — without adding new websockets.

**Architecture:** The app already runs three screen-scoped Supabase realtime hooks (`useGroupExpensesRealtime`, `useGroupSettlementsRealtime`, `useUserGroupMembershipsRealtime`) that update per-group caches but never invalidate the dashboard query. This plan adds a single `queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })` call to each hook's event handler. When Profile is later mounted, TanStack Query sees the stale mark and refetches automatically — no work happens while Profile is closed. Out of scope: subscribing to expenses/settlements while sitting on Profile from another device (scenario B; can be added later as a Profile-mounted realtime hook).

**Tech Stack:** TypeScript, React Native (Expo), `@tanstack/react-query` v5, `@supabase/supabase-js` realtime channels.

---

## File Structure

Three files modified, no new files:

- `cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts` — add dashboard key to the existing `invalidateGroupDerivedCaches` helper. Fires on expense INSERT/UPDATE/DELETE in any group the user is currently viewing.
- `cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts` — add a dashboard invalidation alongside the existing group-key invalidations inside the handler. Fires on settlement INSERT/UPDATE/DELETE in any group the user is currently viewing (or in SettleUp screen).
- `cost-share-app/apps/mobile/hooks/useUserGroupMembershipsRealtime.ts` — add a dashboard invalidation (with imports for `queryClient` and `queryKeys`, which this file doesn't have yet) covering all event branches. Fires on group_members row changes for the current user; affects `activeGroupsCount` / `closedGroupsCount` shown on Profile.

No new tests are added: these realtime hooks have no existing unit tests (real Supabase channel mocking would dwarf the change). Verification is manual against the running app.

---

### Task 1: Add dashboard invalidation to `useGroupExpensesRealtime`

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts:29-43`

This hook is mounted inside `GroupDetailScreen` for the currently-open group. The existing helper `invalidateGroupDerivedCaches` already invalidates four per-group cache keys after every expense event; we add the dashboard key alongside them. Dashboard invalidation is cheap (just a stale mark) — the refetch only fires when Profile is mounted.

- [ ] **Step 1: Edit the helper**

Replace the body of `invalidateGroupDerivedCaches` so it also invalidates the dashboard key:

```ts
function invalidateGroupDerivedCaches(groupId: string): void {
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupSettlements(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupPairwiseDebts(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupContributions(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.groupSimplifiedDebtsByCurrency(groupId),
    });
    void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard,
    });
    scheduleBalanceRefetch(groupId);
}
```

The exact diff is one block inserted before `scheduleBalanceRefetch(groupId);`:

```ts
    void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard,
    });
```

- [ ] **Step 2: Typecheck**

Run from `cost-share-app/apps/mobile`:

```bash
npx tsc --noEmit
```

Expected: exit code 0, no output.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts
git commit -m "feat(mobile): invalidate dashboard on group expense realtime events"
```

---

### Task 2: Add dashboard invalidation to `useGroupSettlementsRealtime`

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts:45-63`

This hook is mounted in `GroupDetailScreen` and `SettleUpListScreen`. Its event handler currently invalidates four per-group keys and schedules a debounced balance refetch — we add the dashboard key in the same block.

- [ ] **Step 1: Edit the handler**

Inside the `.on('postgres_changes', ..., () => { try { ... } })` block, add the dashboard invalidation alongside the others. The full `try` body becomes:

```ts
() => {
    try {
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupSettlements(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupPairwiseDebts(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupContributions(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.groupSimplifiedDebtsByCurrency(groupId),
        });
        void queryClient.invalidateQueries({
            queryKey: queryKeys.dashboard,
        });
        scheduleBalanceRefetch(groupId);
    } catch (err) {
        console.error('settlements realtime payload error:', err);
    }
},
```

The exact diff is one block inserted before `scheduleBalanceRefetch(groupId);`:

```ts
        void queryClient.invalidateQueries({
            queryKey: queryKeys.dashboard,
        });
```

- [ ] **Step 2: Typecheck**

From `cost-share-app/apps/mobile`:

```bash
npx tsc --noEmit
```

Expected: exit code 0, no output.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts
git commit -m "feat(mobile): invalidate dashboard on group settlement realtime events"
```

---

### Task 3: Add dashboard invalidation to `useUserGroupMembershipsRealtime`

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useUserGroupMembershipsRealtime.ts:1-82`

This hook is mounted in `GroupsListScreen` while it's the focused tab. It currently has no `queryClient` or `queryKeys` import — those need to be added. The dashboard depends on which groups the user is in (active/closed counts, friends list), so we invalidate it once per event regardless of branch (INSERT, UPDATE-active, UPDATE-deactivated, DELETE).

- [ ] **Step 1: Add imports**

At the top of the file, add the two missing imports after the existing service imports:

```ts
import { queryClient } from '../lib/queryClient';
import { queryKeys } from './queries/keys';
```

Final import block at the top:

```ts
import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { fetchGroups } from '../services/groups.service';
import { fetchBalanceSummary } from '../services/users.service';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from './queries/keys';
```

- [ ] **Step 2: Invalidate at the top of the handler**

Inside the `.on('postgres_changes', ..., (payload) => { void (async () => { try { ... } })(); })` block, add the dashboard invalidation as the first statement in the `try`. This ensures every branch (DELETE / UPDATE-deactivated / INSERT / UPDATE-activated) triggers the invalidation:

```ts
try {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    const store = useAppStore.getState();

    if (payload.eventType === 'DELETE' && payload.old) {
        const groupId = payload.old.group_id as string | undefined;
        if (groupId) store.removeGroup(groupId);
        return;
    }

    if (
        payload.eventType === 'UPDATE' &&
        payload.new &&
        payload.new.is_active === false
    ) {
        const groupId = payload.new.group_id as string | undefined;
        if (groupId) store.removeGroup(groupId);
        return;
    }

    if (
        payload.eventType === 'INSERT' ||
        (payload.eventType === 'UPDATE' &&
            payload.new?.is_active === true)
    ) {
        await fetchGroups();
        void fetchBalanceSummary();
    }
} catch (err) {
    console.error(
        'memberships realtime payload error:',
        err,
    );
}
```

The exact diff is one line inserted as the first statement of the `try`:

```ts
            void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
```

- [ ] **Step 3: Typecheck**

From `cost-share-app/apps/mobile`:

```bash
npx tsc --noEmit
```

Expected: exit code 0, no output.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useUserGroupMembershipsRealtime.ts
git commit -m "feat(mobile): invalidate dashboard on group membership realtime events"
```

---

### Task 4: Manual end-to-end verification

**Files:**
- None modified.

No automated tests exist for these realtime hooks. Verify behavior against the running app with two clients (two devices, or one device + the Supabase SQL editor / web app acting as a second user).

- [ ] **Step 1: Start the mobile app**

From the repo root:

```bash
npm run dev:mobile
```

Sign in as user A on the device/simulator. Sign in as user B on a second device or via the web app — both users must share at least one group.

- [ ] **Step 2: Verify expense scenario**

On device A:
1. Open the Profile tab and note the displayed net balance and `activeGroupsCount`.
2. Navigate into a group's detail screen (shared with user B). This mounts `useGroupExpensesRealtime`.
3. On user B's client, add a new expense to that group split between A and B.
4. On device A, confirm the expense appears in the group's expense feed (proves the realtime event arrived).
5. Tap the Profile tab.

Expected: the balance hero card and stat tiles update to reflect the new expense within ~1 second of navigating to Profile (TanStack refetches the stale-marked query on mount).

- [ ] **Step 3: Verify settlement scenario**

On device A, still in a shared group:
1. Note the current balance on Profile.
2. Open the group detail screen.
3. On user B's client, settle up with user A (or have A→B / B→A settle some amount).
4. Confirm settlement appears in the group settlement list on device A.
5. Tap Profile.

Expected: net balance updates to reflect the new settlement.

- [ ] **Step 4: Verify membership scenario**

On device A:
1. Note `activeGroupsCount` / `closedGroupsCount` on Profile.
2. Open the Groups tab (mounts `useUserGroupMembershipsRealtime`).
3. On user B's client (or via SQL), add user A to a new group, or remove user A from an existing group.
4. Confirm the Groups list updates on device A.
5. Tap Profile.

Expected: the stat tile counts change to reflect the new membership state.

- [ ] **Step 5: Verify Profile alone does not over-fetch**

On device A, sit on Profile for ≥60 seconds without triggering any external event. The dashboard query should remain idle (no extra `get_user_dashboard` RPC calls in the network log) because no invalidation fires and the `staleTime` is 60s.

This is the "still want the app to run quickly" guardrail — confirm we did not accidentally introduce polling or a Profile-mounted subscription.

- [ ] **Step 6: No-commit task**

No code changed in this task. Do not create an empty commit.
