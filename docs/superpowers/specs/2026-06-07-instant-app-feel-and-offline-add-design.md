# Instant app feel + offline add-expense — design

## Problem

The app feels slow and old next to other apps on the user's phone. Concretely:

- Every screen mount shows a blank white screen with a centered `ActivityIndicator` before content appears.
- Re-opening the app starts from zero — the previous state is lost on every cold start.
- Post-login navigation has visible loading delays.
- The Groups screen (the main authenticated screen) bypasses React Query entirely and uses an imperative `fetchGroups()` + manual loading flag.

The user wants the app to feel "always loaded" — content visible the moment a screen opens, refreshed quietly in the background — and wants to add expenses while offline.

## Goals

- **Instant cold start.** First frame after launch shows the user's last-known groups, group detail, expenses, balances — no white spinner screen on any path the user has visited before.
- **No blank loading states on revisited screens.** Tab switches and group navigation render from cache; refreshes happen underneath.
- **Offline add-expense.** User can add an expense while offline. It appears in the list immediately with a clear "saved on device" indicator, is editable and deletable while pending, and syncs automatically when the network returns. The user can also manually trigger a sync from a per-row icon.
- **Error visibility.** Failures in the new mechanism (persistence, mutation, realtime, sweep) report to Sentry with tagged categories. Normal lifecycle events ride along as breadcrumbs so errors are debuggable.

## Non-goals

- Edit or delete of *server-synced* expenses while offline. Requires conflict handling; deferred to a future spec.
- Offline create/edit/delete for messages, settlements, group metadata, friend operations. Deferred.
- Visual polish unrelated to load behavior (custom transitions, haptics, shimmer animations). Deferred — gets more leverage *after* the data feels instant.
- Migration to MMKV. Considered, deferred. AsyncStorage is sufficient for current data sizes; revisit if rehydrate cost becomes user-visible.

## User-facing behavior

### Cold start

1. **Frame 1 (instant).** AsyncStorage rehydrates into the React Query cache before any screen renders. Groups list, last-opened group's expenses/messages/members/balances render from disk.
2. **Background (~200ms–1s).** Supabase realtime channels subscribe. On `SUBSCRIBED`, snapshot refetches reconcile anything that changed while the app was closed.
3. **Background (ongoing).** Realtime pushes deltas. The cache updates and re-persists within ~1s, ready for the next cold start.

### Re-entering a group

Tap a group → group detail renders from cache (header, expenses, messages, members, balances). Per-group realtime channel subscribes; snapshot refetch reconciles; any deltas swap in.

### Add expense while offline

1. User taps Save. The expense appears in the list immediately with a temp id `pending_<uuid>` and a per-row sync icon.
2. The `useMutation` enters a paused state because NetInfo reports offline; the paused mutation is written to AsyncStorage.
3. Per-row sync icon shows **offline-waiting** (muted cloud with slash). Tap reveals: "you're offline — will sync when connected."
4. While pending, the user can:
   - **Edit** — opens the existing AddExpense screen in edit mode; on save, the queued mutation is cancelled and re-enqueued with new variables.
   - **Delete** — cancels the queued mutation and removes the optimistic row.
   - **Manually sync** — if online, tap the icon to force `resumePausedMutations()`. If offline, icon explains why nothing happened.
5. When the network returns, mutations replay in FIFO order. On success, the temp row is replaced by the canonical server row and the badge + icon disappear.
6. If a mutation exhausts its auto-retries (e.g., server rejected for validation, or group was deleted), the icon becomes the **failed** state. Tap opens an action sheet: Retry / Edit / Delete.

### Sync icon states (per pending expense row)

| State | Glyph | Tappable | Tap behavior |
|---|---|---|---|
| Offline waiting | muted cloud with slash | No | Toast: "you're offline" |
| Online queued | muted upload cloud | Yes | Calls `resumePausedMutations()` |
| Syncing | inline spinner | No | — |
| Synced (transient) | brief checkmark | No | Icon disappears |
| Failed | red error glyph | Yes | Action sheet: Retry / Edit / Delete |

## Architecture: the five layers

### Layer 1 — Persistence

Wrap the existing `queryClient` with `persistQueryClient` from `@tanstack/react-query-persist-client`, backed by `@tanstack/query-async-storage-persister` over `@react-native-async-storage/async-storage`.

- The persister mirrors the React Query cache to AsyncStorage on a debounce (~1s).
- On cold start, hydration runs before `App` renders any screen content — gated through `PersistQueryClientProvider` (or a manual `restoreClient` followed by `setIsReady(true)`).
- The persister also persists pending mutations (`dehydrateOptions.shouldDehydrateMutation`) so an offline-added expense survives an app kill.
- A `buster` key tied to `(app version, schema version, user id)` triggers a full wipe + refetch on mismatch.
- A `maxAge` (e.g., 7 days) prunes stale entries.

### Layer 2 — Migrate groups + group detail into React Query

The Groups list and group detail data currently use imperative service calls (`fetchGroups`, `fetchExpenses`, `fetchMessages`) that write to Zustand and bypass React Query. They are converted to `useQuery` hooks:

- `useGroupsQuery()` — wraps `fetchGroups`.
- `useGroupExpensesQuery(groupId)` — wraps `fetchExpenses(groupId)`.
- `useGroupMessagesQuery(groupId)` — wraps `fetchMessages(groupId)`.

Realtime handlers in `useAppRealtime.ts` and per-group hooks (`useGroupExpensesRealtime`, `useGroupMessagesRealtime`, `useGroupSettlementsRealtime`) are updated to write into the query cache via `queryClient.setQueryData(...)` instead of `useAppStore.getState().updateGroup(...)`. **Every realtime handler becomes upsert-style and idempotent** — applying the same event twice is a no-op.

All consumers that previously read groups data from `useAppStore` are migrated to read from the new query hooks in a single sweep. Zustand keeps only pure UI state (current user, session, language, in-progress modals).

### Layer 3 — Skeletons replace blank spinners

Three new skeleton components match the existing skeleton style (plain gray `View` boxes shaped like the real content):

- `GroupsListSkeleton` — header silhouette + list-row silhouettes + FAB silhouette.
- `GroupDetailSkeleton` — group header silhouette + expense-row silhouettes + composer silhouette.
- `AppGateSkeleton` — bottom tab bar silhouette + content area silhouette.

These replace the four full-screen `<ActivityIndicator/>` blocks:

- `App.tsx` boot fallback (the `!isReady` branch).
- `AuthenticatedAppGate.tsx` resolving state.
- `GroupsListScreen.tsx` empty-while-loading branch.
- `GroupDetailScreen.tsx` `isLoading && !displayGroup` branch.

Skeletons render only when the cache is truly empty for a given query (i.e., very first launch, or a never-visited group). Otherwise cached content shows immediately and there is no skeleton at all.

### Layer 4 — Trust realtime for freshness

For every query backed by a realtime channel:

- `staleTime: Infinity` — realtime is the source of freshness; we never auto-refetch on a timer.
- `refetchOnMount: false` — opening a screen reads from cache.
- `refetchOnWindowFocus: false` — focus doesn't refetch (realtime channel resubscribe handles this).
- `placeholderData: keepPreviousData` for list queries — pulls and paginations never blank the list.

Per-group realtime hooks (`useGroupExpensesRealtime`, `useGroupMessagesRealtime`, `useGroupSettlementsRealtime`) must do a **snapshot refetch on `SUBSCRIBED`**, matching the pattern already in `useAppRealtime.ts:236-238`. This closes the gap between "screen mounted" and "channel ready."

For queries *not* under realtime (exchange rates, legal documents, static profile metadata), keep an explicit long `staleTime` per query — there is no realtime channel to invalidate them.

### Layer 5 — Offline add-expense

A new `useAddExpenseMutation()` hook drives the offline-capable add path. Per Reading A: edit/delete is supported only while the expense is still pending (has a `pending_*` id).

**Pending row lifecycle:**

1. `onMutate`: insert the optimistic row into the expenses query cache with id `pending_<uuid>`. Record a `mutationKey: ['addExpense', pendingId]` so it can be found, cancelled, or modified.
2. NetInfo offline → mutation pauses; persister writes the paused mutation to AsyncStorage.
3. NetInfo online → `resumePausedMutations()` fires either automatically (via `onlineManager` wiring) or manually (via the sync icon tap).
4. `onSuccess(serverRow)`:
   - Remove the `pending_*` row from the expenses cache.
   - Insert `serverRow` into the expenses cache (idempotent — if it's already there from a realtime echo, no-op).
   - Clear the mutation from the queue.
5. `onError`:
   - Auto-retry with backoff (3 attempts) unless the error is permanent (4xx validation, 404 group).
   - On exhaustion or permanent error: mark the pending row as `failed: true` (extra cache flag, not a server field); sync icon switches to failed state.

**Edit-while-pending:** opening `AddExpenseScreen` with an id starting with `pending_` does **not** fetch from the server. Instead, the form hydrates from the queued mutation's `variables` (looked up via `queryClient.getMutationCache().findAll({ mutationKey: ['addExpense', pendingId] })`). On save, the existing mutation is cancelled and removed; a new one is enqueued with new variables; the optimistic row updates in place.

**Delete-while-pending:** cancel and remove the queued mutation; remove the optimistic row from the cache. Nothing hits the server.

**Manual sync (per-row icon):** see "User-facing behavior" → "Sync icon states."

**Dedup (mutation owns the swap + zombie sweep):**

- Primary mechanism: `onSuccess(serverRow)` removes the temp row and inserts the canonical server row. Realtime handlers are idempotent so an echoing INSERT for the server id is a no-op when the row is already present.
- Safety net: a `sweepZombiePendingRows()` function runs on three triggers:
  1. After every snapshot refetch completes.
  2. After every successful mutation drain.
  3. On app foreground while online.
  
  It finds any `pending_*` row in the expenses cache with no corresponding live mutation in the queue and removes it. Every removal fires a Sentry warning with breadcrumb context (the row's id, when it was created, whether the queue ever held a mutation for it) — these are signal that something upstream broke.

## File-by-file changes

### New files

| File | Purpose |
|---|---|
| `lib/persistQueryClient.ts` | Persister setup: AsyncStorage backend, allowlist `dehydrateOptions.shouldDehydrateQuery`, `shouldDehydrateMutation`, buster key, maxAge. Exports `restoreClient()` for boot. |
| `lib/networkStatus.ts` | Wires `@react-native-community/netinfo` to React Query's `onlineManager` and Zustand. Exposes `useNetworkStatus()`. |
| `lib/zombieSweep.ts` | Implements `sweepZombiePendingRows()` and the trigger registrations. Sentry warning on every removal. |
| `hooks/queries/useGroupsQuery.ts` | `useQuery` wrapping `fetchGroups`. Replaces imperative path. |
| `hooks/queries/useGroupExpensesQuery.ts` | `useQuery` wrapping `fetchExpenses(groupId)`. |
| `hooks/queries/useGroupMessagesQuery.ts` | `useQuery` wrapping `fetchMessages(groupId)`. |
| `hooks/mutations/useAddExpenseMutation.ts` | The mutation hook with optimistic insert, pause-on-offline, persisted variables, edit-cancel-and-replace, delete-cancel, mutation cleanup in `onSuccess`. |
| `components/skeletons/GroupsListSkeleton.tsx` | Skeleton for the groups list. |
| `components/skeletons/GroupDetailSkeleton.tsx` | Skeleton for the group detail screen. |
| `components/skeletons/AppGateSkeleton.tsx` | Skeleton for `AuthenticatedAppGate` and `App.tsx` boot. |
| `components/PendingSyncIcon.tsx` | Per-row icon with 5 states, tap handler. |

### Modified files

| File | Change |
|---|---|
| `lib/queryClient.ts` | Add default options: `refetchOnMount: false`, `refetchOnWindowFocus: false`, `placeholderData: keepPreviousData` for list queries (per-query override). Wire to persister. |
| `App.tsx` | Replace boot `ActivityIndicator` with `AppGateSkeleton`. Gate initial render on `restoreClient()` completion. |
| `components/AuthenticatedAppGate.tsx` | Replace gate-loading `ActivityIndicator` with `AppGateSkeleton`. |
| `screens/groups/GroupsListScreen.tsx` | Remove imperative `fetchGroups`/`useLoading`. Replace with `useGroupsQuery()`. Replace blank `LoadingIndicator` with `GroupsListSkeleton`. |
| `screens/groups/GroupDetailScreen.tsx` | Same migration. Replace blank `LoadingIndicator` with `GroupDetailSkeleton`. |
| `screens/expenses/AddExpenseScreen.tsx` | If route param id starts with `pending_`, hydrate form from queued mutation variables instead of `expenseLoading`. On save in pending-edit mode, cancel-and-replace the queued mutation. |
| `hooks/useAppRealtime.ts` | Migrate group handlers from `useAppStore` writes to `queryClient.setQueryData`. Make all handlers idempotent (upsert by id; never blindly append). Upgrade `console.error` sites to `Sentry.captureException` with tagged context. |
| `hooks/useGroupExpensesRealtime.ts`, `useGroupMessagesRealtime.ts`, `useGroupSettlementsRealtime.ts` | Add snapshot refetch on `SUBSCRIBED` (matches app-level pattern). Make handlers idempotent. Sentry on error. |
| `lib/sentry.ts` (or equivalent) | Define the tag taxonomy constants used by the new code. |

### Files left alone

- Existing per-screen query hooks already using React Query: `useDashboardQuery`, `useGroupMembersQuery`, `useGroupUsersQuery`, `useGroupBalancesQueries`, `useFriendsQueries`, `useSettlementQueries`, `useActivityUnreadCount`, `useExchangeRatesQuery`, `useLegalDocument`. These get a per-query `staleTime: Infinity` review and `placeholderData: keepPreviousData` where they're list-shaped, but no structural change.
- `Zustand` slices unrelated to server data: session, language, pending deactivation notice, etc.
- Service layer (`services/groups.service.ts`, `services/expenses.service.ts`, etc.) — query hooks wrap these as-is. No API or Supabase changes.

## Contracts

### Persistence allowlist

Only these query keys are persisted:

- `groups`
- `groupExpenses(groupId)` (all groupIds)
- `groupMessages(groupId)`
- `groupMembers(groupId)`
- `groupUsers(groupId)`
- `groupSettlements(groupId)`
- `groupBalances(groupId)`
- `balanceSummary`
- `dashboard`
- `activity`
- `activityUnreadCount`
- `friends`
- `friendRequestsIncoming` / `friendRequestsOutgoing`

Excluded (never persisted): legal documents, admin platform metrics, admin Sentry queries, exchange rates (small, cheap to refetch).

### Cache busting

Buster key composed as `${appVersion}:${schemaVersion}:${userId}`. Any mismatch on hydrate → full wipe + refetch.

- `appVersion`: the running app's version string.
- `schemaVersion`: a constant in code, bumped when query shapes change.
- `userId`: prevents cross-account leakage on a shared device.

On `signOut`, the persister is wiped explicitly (do not wait for next launch).

### Mutation contract

- `mutationKey: ['addExpense', pendingId]`.
- `pendingId` format: `pending_<uuidv4>`.
- `variables` shape includes the full add-expense payload so the form can rehydrate.
- Auto-retry: up to 3 attempts with exponential backoff (e.g., 2s, 8s, 30s). On permanent errors (HTTP 4xx other than 401/408/429), no retry.
- Persistence: paused mutations are dehydrated to AsyncStorage and resumed on next launch.

### Realtime contract

- **Idempotency:** every INSERT/UPDATE handler must check the cache by id before writing; never blindly append.
- **Snapshot refetch on SUBSCRIBED:** every realtime hook does a one-shot reconcile when its channel (re)subscribes.
- **Cache writes only:** handlers no longer write to Zustand for server data; they write through `queryClient.setQueryData`.

### Zombie sweep contract

`sweepZombiePendingRows()`:

- Inputs: the current expenses cache for each open group, the mutation cache.
- Action: for each row with id starting with `pending_`, if no mutation in the queue has `mutationKey: ['addExpense', <thatId>]`, remove the row and fire `Sentry.captureMessage('zombie pending row removed', { level: 'warning', tags: { tag: 'sweep.zombie' }, extra: { ... } })`.
- Triggers: snapshot-refetch success, mutation queue drain, app foreground while online.
- Never runs while offline.

### Sentry contract

**Fire to Sentry (invariant violations):**

| Event | Tag | Level |
|---|---|---|
| Persister write failed | `cache.persist` | error |
| Persister rehydrate failed (deserialization error) | `cache.rehydrate` | error |
| Mutation `onSuccess` cleanup failed | `mutation.offline_add` | error |
| Zombie pending row removed | `sweep.zombie` | warning |
| Realtime handler threw | `realtime.echo` | error |
| Mutation exhausted auto-retries and entered failed state | `mutation.offline_add` | warning |

**Breadcrumbs only (lifecycle context):**

- Network online ↔ offline transitions (`network.transition`).
- Mutation enqueued / paused / resumed / succeeded / failed.
- Persister wrote N bytes / rehydrated N queries.
- Cache buster mismatch → wipe (expected on app upgrade).
- Realtime channel SUBSCRIBED / CLOSED / TIMED_OUT.

**Do not fire:**

- User is offline (expected state).
- Server-side validation rejection of an add-expense (it's user-correctable).
- 401 from session expiry (handled by auth refresh layer).

## Open items deferred to the implementation plan

These are intentional. They are too small to need architectural agreement and are best decided when writing the code:

- Exact retry/backoff numbers (current proposal: 3 attempts, 2s/8s/30s).
- Visual treatment of the sync icon glyphs (subject to UI iteration).
- Empty-state UX on a never-visited group while offline (proposal: skeleton briefly, then a clear "you're offline and haven't loaded this group yet" message with a reconnect CTA).
- Exact list of Zustand consumers that move to React Query in the groups migration (will be enumerated in the plan).
- Whether the per-group snapshot-refetch on SUBSCRIBED should invalidate or `setQueryData` from a fresh fetch (functional equivalence; pick during implementation).

## Risks

- **AsyncStorage size cap on Android (~6MB default).** Mitigated by the allowlist + `maxAge`. If a heavy user pushes the limit, the next step is MMKV (out of scope here).
- **Reconnect race.** Mutation replay and realtime snapshot-refetch fire concurrently when the network returns. The mutation-owns-the-swap pattern + idempotent handlers handle the correctness; users see no flicker because the optimistic row is already on screen.
- **Edit-pending in `AddExpenseScreen`.** The form was written assuming a server-fetched expense. Wiring the alternate "hydrate from queued mutation variables" path requires care to avoid leaking state between modes.
- **Realtime handlers must become idempotent.** A regression here (e.g., a blind `cache.append`) reintroduces the duplicate-row bug. The implementation plan should include explicit tests for "apply the same event twice" on every handler touched.
- **Zustand drift during migration.** Moving every reader of `useAppStore(s => s.groups)` to `useGroupsQuery()` in a single sweep is correct but invasive. If we miss a site, Zustand silently goes stale — visible as a screen that shows old data.

## Out of scope

- Offline edit/delete of synced expenses.
- Offline operations on messages, settlements, group metadata, friends, friend requests.
- MMKV migration.
- Visual polish (transitions, haptics, shimmer).
- An app-level "you have N pending across groups" indicator.
