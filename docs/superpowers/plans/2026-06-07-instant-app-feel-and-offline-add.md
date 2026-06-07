# Instant App Feel + Offline Add-Expense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app feel "always loaded" by persisting the React Query cache, migrating Groups + Group Detail off the imperative-fetch pattern, replacing blank `ActivityIndicator` screens with skeletons, trusting realtime for freshness, and adding offline-capable expense creation with manual sync control.

**Architecture:** Five layers stacked on the existing React Query + Supabase stack (the per-feature Zustand slices for groups/expenses/messages are removed as part of this work): (1) cache persistence to AsyncStorage via `persistQueryClient` with an `(appVersion|schemaVersion)` buster — user isolation enforced by `wipePersistedCache()` on both sign-in and sign-out, (2) imperative `fetchGroups`/`fetchExpenses`/`fetchMessages` migrated to `useQuery` hooks with realtime handlers writing through `queryClient.setQueryData`, (3) skeleton components replacing the four full-screen `ActivityIndicator` blocks, (4) `staleTime: Infinity` + `refetchOnMount: false` for realtime-backed queries plus snapshot-refetch on `SUBSCRIBED`, (5) an offline-capable `useAddExpenseMutation` with optimistic insert, `networkMode: 'online'` (paused-when-offline mutations persisted to disk), per-row sync icon, a chain-follow-up registry that handles edit/delete races against in-flight creates, and a zombie-sweep safety net for orphan optimistic rows. Realtime handlers become idempotent (upsert by id, never blind-append). `createExpense` is refactored to throw on failure (no nullable returns) so `onError` fires correctly. Sentry captures invariant violations only; lifecycle events ride along as breadcrumbs.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, `@tanstack/react-query` v5, Supabase JS v2.105, Zustand, `@sentry/react-native`, `@react-native-async-storage/async-storage` (already installed), `@react-native-community/netinfo` (new), `@tanstack/react-query-persist-client` (new), `@tanstack/query-async-storage-persister` (new). Test runner: Jest with `jest-expo` preset.

**Spec:** [`docs/superpowers/specs/2026-06-07-instant-app-feel-and-offline-add-design.md`](../specs/2026-06-07-instant-app-feel-and-offline-add-design.md).

**Working directory for all paths below:** `cost-share-app/apps/mobile/` (relative to the repo root). All `git` commands assume execution from the repo root.

---

## File structure

### New files

```
cost-share-app/apps/mobile/
├── lib/
│   ├── persistQueryClient.ts          # Persister setup, allowlist, buster, restoreClient()
│   ├── networkStatus.ts               # NetInfo → onlineManager wiring; useNetworkStatus()
│   ├── zombieSweep.ts                 # sweepZombiePendingRows() + trigger registration
│   ├── pendingExpense.ts              # pending_<uuid> id helpers, mutationKey helpers, type guards
│   ├── pendingFollowUps.ts            # register/take chained edit/delete for in-flight creates (E4/E5)
│   └── sentryTags.ts                  # Tag taxonomy constants (cache.persist, sweep.zombie, etc.)
├── hooks/
│   ├── queries/
│   │   ├── useGroupsQuery.ts          # useQuery wrapping fetchGroups
│   │   ├── useGroupExpensesQuery.ts   # useQuery wrapping fetchExpenses(groupId)
│   │   └── useGroupMessagesQuery.ts   # useQuery wrapping fetchMessages(groupId)
│   └── mutations/
│       └── useAddExpenseMutation.ts   # Optimistic insert, pause-on-offline, edit/delete helpers
├── components/
│   ├── skeletons/
│   │   ├── GroupsListSkeleton.tsx
│   │   ├── GroupDetailSkeleton.tsx
│   │   └── AppGateSkeleton.tsx
│   └── PendingSyncIcon.tsx            # 5 states per spec
└── __tests__/
    ├── lib/
    │   ├── persistQueryClient.test.ts
    │   ├── networkStatus.test.ts
    │   ├── zombieSweep.test.ts
    │   ├── pendingExpense.test.ts
    │   └── pendingFollowUps.test.ts
    └── hooks/
        ├── useGroupsQuery.test.ts
        ├── useAddExpenseMutation.test.ts
        └── useAppRealtimeIdempotency.test.ts
```

### Modified files

```
cost-share-app/apps/mobile/
├── package.json                                # +3 deps
├── lib/queryClient.ts                          # Defaults: refetchOnMount: false, etc.
├── lib/authSessionLifecycle.ts                 # wipePersistedCache on sign-out
├── lib/acceptSessionIfAllowed.ts               # wipePersistedCache on fresh sign-in
├── services/expenses.service.ts                # createExpense throws on failure (Promise<Expense>, not nullable)
├── store/*                                     # Delete groups, expenses, groupMessages slices entirely
├── App.tsx                                     # Replace ActivityIndicator → AppGateSkeleton; gate on restoreClient()
├── components/AuthenticatedAppGate.tsx         # Replace ActivityIndicator → AppGateSkeleton
├── screens/groups/GroupsListScreen.tsx         # useGroupsQuery; GroupsListSkeleton
├── screens/groups/GroupDetailScreen.tsx        # useGroupExpensesQuery; useGroupMessagesQuery; GroupDetailSkeleton; delete-while-pending branch
├── screens/expenses/AddExpenseScreen.tsx       # Pending-id branch: hydrate form from queued mutation variables; edit branches into resolvePendingEditAction
├── hooks/useAppRealtime.ts                     # setQueryData (not Zustand) for groups; idempotent; Sentry
├── hooks/useGroupExpensesRealtime.ts           # Idempotent; snapshot-refetch on SUBSCRIBED; Sentry
├── hooks/useGroupMessagesRealtime.ts           # Same
├── hooks/useGroupSettlementsRealtime.ts        # Snapshot-refetch on SUBSCRIBED
└── hooks/queries/keys.ts                       # Add groupExpenses, groupMessages, balanceSummary keys
```

### Phases at a glance

| Phase | What it delivers |
|---|---|
| A. Foundation | Deps, query keys, persister, network status, App.tsx gates on rehydrate. After A: nothing visible to the user yet but the plumbing is in place. |
| B. Groups list migration | `useGroupsQuery`, realtime handlers updated, GroupsListScreen migrated. After B: reopens show last-known groups list instantly. |
| C. Group detail migration | `useGroupExpensesQuery`, `useGroupMessagesQuery`, per-group realtime hooks updated. After C: entering a group is instant. |
| D. Config + skeletons | Default `refetchOnMount: false`, per-query `staleTime: Infinity`, 3 skeleton components replace 4 spinners. After D: no white-screen spinners on visited paths. |
| E. Offline add-expense | `useAddExpenseMutation`, `PendingSyncIcon`, edit/delete-while-pending, zombie sweep. After E: the offline-add feature works end-to-end. |
| F. Sentry hardening + manual verification | Tagged Sentry captures wired through, lifecycle breadcrumbs, manual smoke test plan. |

---

## Phase A — Foundation

### Task A1: Install dependencies and add query keys

**Files:**
- Modify: `cost-share-app/apps/mobile/package.json`
- Modify: `cost-share-app/apps/mobile/hooks/queries/keys.ts`

- [ ] **Step 1: Install deps from `cost-share-app/apps/mobile/`**

```bash
cd cost-share-app/apps/mobile
npx expo install @react-native-community/netinfo
npm install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister
```

`expo install` is mandatory for NetInfo because it needs an Expo-managed native module version match.

- [ ] **Step 2: Add new query keys**

Open `hooks/queries/keys.ts` and add the four new keys to the existing object. Final file:

```ts
export const queryKeys = {
    dashboard: ['dashboard'] as const,
    groups: ['groups'] as const,
    activity: ['activity'] as const,
    activityFeed: () => ['activity', 'feed'] as const,
    activityUnreadCount: ['activity', 'unread-count'] as const,
    groupUsers: (groupId: string) => ['groupUsers', groupId] as const,
    groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
    groupExpenses: (groupId: string) => ['groupExpenses', groupId] as const,
    groupMessages: (groupId: string) => ['groupMessages', groupId] as const,
    balanceSummary: ['balanceSummary'] as const,
    friends: ['friends'] as const,
    friendRequestsIncoming: ['friend-requests', 'incoming'] as const,
    friendRequestsOutgoing: ['friend-requests', 'outgoing'] as const,
    userSearch: (query: string) => ['user-search', query] as const,
    inviteLink: (kind: 'friend' | 'group', id?: string) =>
        id ? (['invite-link', kind, id] as const) : (['invite-link', kind] as const),
    groupPairwiseDebts: (groupId: string) => ['groupPairwiseDebts', groupId] as const,
    groupSettlements: (groupId: string) => ['groupSettlements', groupId] as const,
    groupContributions: (groupId: string) => ['group-contributions', groupId] as const,
    groupSimplifiedDebtsByCurrency: (groupId: string) =>
        ['group-simplified-debts-by-currency', groupId] as const,
    legalDocument: (slug: 'terms' | 'privacy', locale: 'en' | 'he') =>
        ['legal-document', slug, locale] as const,
    adminPlatformMetrics: ['admin', 'platform-metrics'] as const,
    adminSentryIssues: (params: {
        environment: 'dev' | 'prod';
        status: 'unresolved' | 'all';
        timeRange: '24h' | '7d' | '30d';
    }) =>
        ['adminSentryIssues', params.environment, params.status, params.timeRange] as const,
    adminSentryIssueDetail: (issueId: string) =>
        ['adminSentryIssueDetail', issueId] as const,
    adminSentryIssueEvents: (issueId: string) =>
        ['adminSentryIssueEvents', issueId] as const,
    exchangeRates: (base: string, symbolsKey: string) =>
        ['exchangeRates', base, symbolsKey] as const,
};
```

- [ ] **Step 3: Type-check**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
```

Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add cost-share-app/apps/mobile/package.json cost-share-app/apps/mobile/hooks/queries/keys.ts
git commit -m "chore(mobile): add persist-client, netinfo deps; extend queryKeys

Adds the dependencies and three new query keys needed by the persistence
+ offline-add work that follows. No behavior change yet."
```

---

### Task A2: Sentry tag taxonomy

**Files:**
- Create: `cost-share-app/apps/mobile/lib/sentryTags.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/sentryTags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/sentryTags.test.ts`:

```ts
import { SENTRY_TAGS } from '../../lib/sentryTags';

describe('SENTRY_TAGS', () => {
    it('exposes the documented tag set', () => {
        expect(SENTRY_TAGS).toEqual({
            CACHE_PERSIST: 'cache.persist',
            CACHE_REHYDRATE: 'cache.rehydrate',
            MUTATION_OFFLINE_ADD: 'mutation.offline_add',
            REALTIME_ECHO: 'realtime.echo',
            SWEEP_ZOMBIE: 'sweep.zombie',
            NETWORK_TRANSITION: 'network.transition',
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd cost-share-app/apps/mobile
npx jest __tests__/lib/sentryTags.test.ts
```

Expected: FAIL with "Cannot find module '../../lib/sentryTags'".

- [ ] **Step 3: Create the module**

Create `lib/sentryTags.ts`:

```ts
export const SENTRY_TAGS = {
    CACHE_PERSIST: 'cache.persist',
    CACHE_REHYDRATE: 'cache.rehydrate',
    MUTATION_OFFLINE_ADD: 'mutation.offline_add',
    REALTIME_ECHO: 'realtime.echo',
    SWEEP_ZOMBIE: 'sweep.zombie',
    NETWORK_TRANSITION: 'network.transition',
} as const;

export type SentryTag = (typeof SENTRY_TAGS)[keyof typeof SENTRY_TAGS];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/sentryTags.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/sentryTags.ts cost-share-app/apps/mobile/__tests__/lib/sentryTags.test.ts
git commit -m "feat(mobile): add Sentry tag taxonomy for cache+offline work

Defines the six tags used by persistence, realtime, mutation,
and zombie-sweep code so the Sentry dashboard stays filterable."
```

---

### Task A3: Pending-expense id helpers

**Files:**
- Create: `cost-share-app/apps/mobile/lib/pendingExpense.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/pendingExpense.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/pendingExpense.test.ts`:

```ts
import {
    PENDING_ID_PREFIX,
    createPendingExpenseId,
    isPendingExpenseId,
    addExpenseMutationKey,
} from '../../lib/pendingExpense';

describe('pendingExpense', () => {
    it('prefix is the documented sentinel', () => {
        expect(PENDING_ID_PREFIX).toBe('pending_');
    });

    it('createPendingExpenseId returns a prefixed uuid', () => {
        const id = createPendingExpenseId();
        expect(id.startsWith(PENDING_ID_PREFIX)).toBe(true);
        // uuid v4 minus prefix is 36 chars: 8-4-4-4-12 with dashes.
        expect(id.length - PENDING_ID_PREFIX.length).toBe(36);
    });

    it('isPendingExpenseId distinguishes pending from server ids', () => {
        expect(isPendingExpenseId('pending_a-b-c')).toBe(true);
        expect(isPendingExpenseId('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
        expect(isPendingExpenseId(undefined)).toBe(false);
        expect(isPendingExpenseId(null)).toBe(false);
    });

    it('addExpenseMutationKey is stable per pending id', () => {
        expect(addExpenseMutationKey('pending_abc')).toEqual(['addExpense', 'pending_abc']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/pendingExpense.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

Create `lib/pendingExpense.ts`. We use `expo-crypto`'s `randomUUID` because it's already a dependency and works on web + native.

```ts
import * as Crypto from 'expo-crypto';

export const PENDING_ID_PREFIX = 'pending_' as const;

export function createPendingExpenseId(): string {
    return `${PENDING_ID_PREFIX}${Crypto.randomUUID()}`;
}

export function isPendingExpenseId(id: string | null | undefined): id is string {
    return typeof id === 'string' && id.startsWith(PENDING_ID_PREFIX);
}

export function addExpenseMutationKey(pendingId: string): readonly ['addExpense', string] {
    return ['addExpense', pendingId] as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/pendingExpense.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/pendingExpense.ts cost-share-app/apps/mobile/__tests__/lib/pendingExpense.test.ts
git commit -m "feat(mobile): pending-expense id + mutationKey helpers

Centralises the pending_<uuid> sentinel format and the mutationKey
shape so callers in the optimistic-insert path don't drift."
```

---

### Task A4: Network status wiring

**Files:**
- Create: `cost-share-app/apps/mobile/lib/networkStatus.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/networkStatus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/networkStatus.test.ts`:

```ts
import { onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { wireNetworkStatusToOnlineManager } from '../../lib/networkStatus';

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn() },
}));

describe('wireNetworkStatusToOnlineManager', () => {
    beforeEach(() => {
        (NetInfo.addEventListener as jest.Mock).mockReset();
        onlineManager.setOnline(true);
    });

    it('subscribes to NetInfo and toggles onlineManager on state change', () => {
        let handler: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void = () => {};
        (NetInfo.addEventListener as jest.Mock).mockImplementation((cb) => {
            handler = cb;
            return jest.fn();
        });
        const setOnlineSpy = jest.spyOn(onlineManager, 'setOnline');

        wireNetworkStatusToOnlineManager();

        handler({ isConnected: false, isInternetReachable: false });
        expect(setOnlineSpy).toHaveBeenLastCalledWith(false);

        handler({ isConnected: true, isInternetReachable: true });
        expect(setOnlineSpy).toHaveBeenLastCalledWith(true);

        handler({ isConnected: true, isInternetReachable: null });
        // Unknown reachability should default to optimistic-online.
        expect(setOnlineSpy).toHaveBeenLastCalledWith(true);
    });

    it('returns the NetInfo unsubscribe function', () => {
        const unsub = jest.fn();
        (NetInfo.addEventListener as jest.Mock).mockReturnValue(unsub);

        const result = wireNetworkStatusToOnlineManager();
        expect(result).toBe(unsub);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/networkStatus.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `lib/networkStatus.ts`:

```ts
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { SENTRY_TAGS } from './sentryTags';

function netInfoStateIsOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
    if (state.isConnected === false) return false;
    // null reachability = unknown; trust the device's connected flag.
    if (state.isInternetReachable === false) return false;
    return true;
}

export function wireNetworkStatusToOnlineManager(): () => void {
    return NetInfo.addEventListener((state) => {
        const online = netInfoStateIsOnline(state);
        try {
            onlineManager.setOnline(online);
            Sentry.addBreadcrumb({
                category: SENTRY_TAGS.NETWORK_TRANSITION,
                level: 'info',
                message: online ? 'network: online' : 'network: offline',
                data: {
                    isConnected: state.isConnected,
                    isInternetReachable: state.isInternetReachable,
                },
            });
        } catch (err) {
            Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.NETWORK_TRANSITION } });
        }
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/networkStatus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/lib/networkStatus.ts cost-share-app/apps/mobile/__tests__/lib/networkStatus.test.ts
git commit -m "feat(mobile): wire NetInfo to React Query onlineManager

Listens to network state changes and flips onlineManager so paused
mutations can resume automatically when the device comes back online.
Logs transitions as Sentry breadcrumbs."
```

---

### Task A5: Persist-query-client setup

**Files:**
- Create: `cost-share-app/apps/mobile/lib/persistQueryClient.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/persistQueryClient.test.ts`

The persister has two responsibilities: (1) decide what gets persisted via an allowlist of query keys + an allowlist for mutations, (2) compute a `buster` from `(appVersion, schemaVersion)` so app upgrades and schema bumps invalidate stale shapes. User isolation is enforced separately by calling `wipePersistedCache()` on both sign-in and sign-out (Task A7). Persistence is launched from `App.tsx` via `restoreClient()`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/persistQueryClient.test.ts`:

```ts
import {
    PERSIST_ALLOWLIST_PREFIXES,
    PERSIST_SCHEMA_VERSION,
    computePersistBuster,
    shouldDehydrateQueryFactory,
    shouldDehydrateMutationFactory,
} from '../../lib/persistQueryClient';

describe('persistQueryClient helpers', () => {
    it('PERSIST_SCHEMA_VERSION is a non-empty string', () => {
        expect(typeof PERSIST_SCHEMA_VERSION).toBe('string');
        expect(PERSIST_SCHEMA_VERSION.length).toBeGreaterThan(0);
    });

    it('allowlist contains every documented prefix', () => {
        expect(PERSIST_ALLOWLIST_PREFIXES).toEqual(
            expect.arrayContaining([
                'groups',
                'groupExpenses',
                'groupMessages',
                'groupMembers',
                'groupUsers',
                'groupSettlements',
                'groupPairwiseDebts',
                'group-simplified-debts-by-currency',
                'group-contributions',
                'balanceSummary',
                'dashboard',
                'activity',
                'friends',
                'friend-requests',
            ]),
        );
    });

    it('shouldDehydrateQuery accepts allowlisted keys with status=success', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(fn({ queryKey: ['groups'], state: { status: 'success' } } as any)).toBe(true);
        expect(fn({ queryKey: ['groupExpenses', 'g1'], state: { status: 'success' } } as any)).toBe(true);
    });

    it('shouldDehydrateQuery rejects unknown keys', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(fn({ queryKey: ['legal-document', 'terms', 'en'], state: { status: 'success' } } as any)).toBe(false);
        expect(fn({ queryKey: ['adminSentryIssues'], state: { status: 'success' } } as any)).toBe(false);
    });

    it('shouldDehydrateQuery rejects pending/error states', () => {
        const fn = shouldDehydrateQueryFactory();
        expect(fn({ queryKey: ['groups'], state: { status: 'pending' } } as any)).toBe(false);
        expect(fn({ queryKey: ['groups'], state: { status: 'error' } } as any)).toBe(false);
    });

    it('shouldDehydrateMutation accepts paused addExpense mutations', () => {
        const fn = shouldDehydrateMutationFactory();
        expect(fn({ options: { mutationKey: ['addExpense', 'pending_x'] }, state: { isPaused: true } } as any)).toBe(true);
    });

    it('shouldDehydrateMutation rejects other mutations', () => {
        const fn = shouldDehydrateMutationFactory();
        expect(fn({ options: { mutationKey: ['deleteGroup', 'g1'] }, state: { isPaused: true } } as any)).toBe(false);
        expect(fn({ options: { mutationKey: undefined }, state: { isPaused: true } } as any)).toBe(false);
    });

    it('computePersistBuster combines app version and schema version (NOT userId)', () => {
        const a = computePersistBuster({ appVersion: '1.2.3' });
        const b = computePersistBuster({ appVersion: '1.2.4' });
        expect(a).not.toEqual(b);
        // Same inputs → same buster.
        expect(a).toEqual(computePersistBuster({ appVersion: '1.2.3' }));
    });

    it('computePersistBuster does not depend on userId — user isolation is enforced by wipePersistedCache on sign-in / sign-out', () => {
        const a = computePersistBuster({ appVersion: '1.2.3' });
        const b = computePersistBuster({ appVersion: '1.2.3' });
        expect(a).toEqual(b);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/persistQueryClient.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `lib/persistQueryClient.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
    persistQueryClient,
    type Persister,
} from '@tanstack/react-query-persist-client';
import * as Application from 'expo-application';
import * as Sentry from '@sentry/react-native';
import { queryClient } from './queryClient';
import { SENTRY_TAGS } from './sentryTags';

export const PERSIST_SCHEMA_VERSION = 'v1';
export const PERSIST_STORAGE_KEY = 'rq-cache.v1';
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const PERSIST_ALLOWLIST_PREFIXES = [
    'groups',
    'groupExpenses',
    'groupMessages',
    'groupMembers',
    'groupUsers',
    'groupSettlements',
    'groupPairwiseDebts',
    'group-simplified-debts-by-currency',
    'group-contributions',
    'balanceSummary',
    'dashboard',
    'activity',
    'friends',
    'friend-requests',
] as const;

const ALLOWLIST = new Set<string>(PERSIST_ALLOWLIST_PREFIXES as readonly string[]);

export function shouldDehydrateQueryFactory() {
    return (query: { queryKey: readonly unknown[]; state: { status: string } }) => {
        if (query.state.status !== 'success') return false;
        const head = query.queryKey[0];
        return typeof head === 'string' && ALLOWLIST.has(head);
    };
}

export function shouldDehydrateMutationFactory() {
    return (mutation: { options: { mutationKey?: readonly unknown[] }; state: { isPaused: boolean } }) => {
        const key = mutation.options.mutationKey;
        if (!key || key.length === 0) return false;
        return key[0] === 'addExpense';
    };
}

export function computePersistBuster(input: { appVersion: string }): string {
    // userId is intentionally NOT part of the buster. User isolation is
    // enforced by calling wipePersistedCache() on both sign-in and sign-out
    // (see Task A7). Keeping the buster session-independent means returning
    // users get an instant restore on every reopen.
    return `${input.appVersion}|${PERSIST_SCHEMA_VERSION}`;
}

let activePersister: Persister | null = null;
let activeUnsubscribe: (() => void) | null = null;

export async function restoreClient(): Promise<void> {
    try {
        const appVersion = Application.nativeApplicationVersion ?? '0.0.0';
        const buster = computePersistBuster({ appVersion });

        activePersister = createAsyncStoragePersister({
            storage: AsyncStorage,
            key: PERSIST_STORAGE_KEY,
            throttleTime: 1000,
        });

        const [unsubscribe, restorePromise] = persistQueryClient({
            queryClient,
            persister: activePersister,
            maxAge: PERSIST_MAX_AGE_MS,
            buster,
            dehydrateOptions: {
                shouldDehydrateQuery: shouldDehydrateQueryFactory(),
                shouldDehydrateMutation: shouldDehydrateMutationFactory(),
            },
        });

        activeUnsubscribe = unsubscribe;
        await restorePromise;

        Sentry.addBreadcrumb({
            category: SENTRY_TAGS.CACHE_REHYDRATE,
            level: 'info',
            message: 'cache restored',
            data: { buster },
        });
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.CACHE_REHYDRATE } });
        // Swallow: a failed rehydrate is recoverable — queries refetch on first use.
    }
}

export async function wipePersistedCache(): Promise<void> {
    try {
        activeUnsubscribe?.();
        activeUnsubscribe = null;
        activePersister = null;
        await AsyncStorage.removeItem(PERSIST_STORAGE_KEY);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.CACHE_PERSIST } });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/persistQueryClient.test.ts
```

Expected: PASS (the test only exercises the pure helpers, not `restoreClient` which needs a runtime).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/lib/persistQueryClient.ts cost-share-app/apps/mobile/__tests__/lib/persistQueryClient.test.ts
git commit -m "feat(mobile): React Query cache persister with allowlist + buster

Persists allowlisted query keys + paused addExpense mutations to
AsyncStorage. Buster keys on (appVersion|schemaVersion) so an app or
schema upgrade wipes the cache cleanly. User isolation is enforced
separately by wipePersistedCache() on sign-in and sign-out (Task A7)."
```

---

### Task A6: Boot-time rehydrate gate in App.tsx

**Files:**
- Modify: `cost-share-app/apps/mobile/App.tsx`

The current `App.tsx` already gates render on an `isReady` flag set after async init. We add `restoreClient` to the init sequence and `wireNetworkStatusToOnlineManager` once on mount. We will not yet replace the `ActivityIndicator` (that happens in Task D4) — keep the fallback identical so the diff is small.

- [ ] **Step 1: Read the current init block**

`App.tsx:126-216` — the `useEffect` that calls `init()`. Locate:

```tsx
try {
    configureNativeGoogleSignIn();
    await initializeLanguage();
    const preDone = await hasCompletedPreLoginOnboarding();
    if (mounted) setPreOnboardingDone(preDone);
```

- [ ] **Step 2: Add imports at the top of App.tsx**

Add after the existing `lib/` imports (around line 29):

```tsx
import { restoreClient } from './lib/persistQueryClient';
import { wireNetworkStatusToOnlineManager } from './lib/networkStatus';
```

- [ ] **Step 3: Add the rehydrate call inside `init`**

Add an `await restoreClient()` early in `init()` — anywhere before screens that depend on the cache can mount. Since `userId` is not part of the buster (see A5), we can rehydrate immediately without waiting for session hydration. Putting it right after the `hydrateAuthSession()` call is fine; putting it earlier is also fine. Modify the section starting at `const hydratedSession = await hydrateAuthSession();`:

```tsx
const hydratedSession = await hydrateAuthSession();
if (!mounted) return;

await restoreClient();

if (hydratedSession) {
    await acceptSession(hydratedSession, 'hydration');
} else {
    store.setSession(null);
}
```

- [ ] **Step 4: Wire NetInfo once at App mount**

Add a new `useEffect` near the other top-level effects, before the existing `AppState` listener effect:

```tsx
useEffect(() => {
    const unsubscribe = wireNetworkStatusToOnlineManager();
    return () => unsubscribe();
}, []);
```

- [ ] **Step 5: Run the existing test suite to catch regressions**

```bash
cd cost-share-app/apps/mobile
npx jest
```

Expected: existing tests still pass. New behavior is exercised manually in Phase F.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/App.tsx
git commit -m "feat(mobile): rehydrate React Query cache on app boot

Awaits restoreClient() inside the existing init() before the
session-accept step, and wires NetInfo → onlineManager once on mount.
Loading fallback unchanged for now; skeleton swap comes later."
```

---

### Task A7: Wipe persisted cache on sign-in and sign-out

User isolation for the persisted cache is enforced by wiping on both transitions (since `userId` is intentionally out of the buster — see A5). Sign-out wipes prevent leaking the previous user's cache to the next one. Sign-in wipes prevent any anon-time data from leaking into the signed-in session and cover the rare case of switching accounts without an explicit sign-out.

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/authSessionLifecycle.ts`
- Modify: `cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts`

- [ ] **Step 1: Locate the sign-out / clearStaleAuthSession path**

```bash
grep -n "clearStaleAuthSession" cost-share-app/apps/mobile/lib/authSessionLifecycle.ts
grep -rn "supabase.auth.signOut" cost-share-app/apps/mobile/services cost-share-app/apps/mobile/lib | head
```

All sign-out paths should call `wipePersistedCache()`. The codebase routes every sign-out through `clearStaleAuthSession`, so one edit there covers them all.

- [ ] **Step 2: Add wipe to clearStaleAuthSession**

Open `lib/authSessionLifecycle.ts`. At the top of the file, add:

```ts
import { wipePersistedCache } from './persistQueryClient';
```

In the body of `clearStaleAuthSession`, after `await supabase.auth.signOut({ scope: 'local' })`, add:

```ts
await wipePersistedCache();
```

- [ ] **Step 3: Add wipe on fresh sign-in inside acceptSessionIfAllowed**

Open `lib/acceptSessionIfAllowed.ts`. At the top of the file, add:

```ts
import { wipePersistedCache } from './persistQueryClient';
```

Right before the final `setSession(nextSession);` line (the success path), add:

```ts
if (mode === 'fresh') {
    await wipePersistedCache();
}
setSession(nextSession);
```

The `mode === 'fresh'` guard means we only wipe on a real sign-in event (OAuth callback or SIGNED_IN). On `mode === 'hydration'` (cold boot restoring a previously-issued session) we keep the cache that was just rehydrated at boot — that's the instant-load path.

- [ ] **Step 4: Verify no other direct supabase.auth.signOut() calls**

If the grep from Step 1 shows any direct `supabase.auth.signOut()` outside `clearStaleAuthSession`, add `await wipePersistedCache()` after each.

- [ ] **Step 5: Run tests**

```bash
cd cost-share-app/apps/mobile
npx jest
```

Expected: existing auth lifecycle tests still pass (they may need a mock for `wipePersistedCache`).

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/lib/authSessionLifecycle.ts \
        cost-share-app/apps/mobile/lib/acceptSessionIfAllowed.ts
git commit -m "fix(mobile): wipe persisted RQ cache on sign-in and sign-out

User isolation for the persisted cache is enforced by wiping on both
transitions (userId is intentionally out of the buster). Sign-out wipe
prevents leaking the previous user's cache; sign-in wipe covers the
rare account-switch-without-signout case and any anon-time writes."
```

---

## Phase B — Groups list migration

### Task B1: `useGroupsQuery` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/queries/useGroupsQuery.ts`
- Test: `cost-share-app/apps/mobile/__tests__/hooks/useGroupsQuery.test.ts`

The hook is thin: it wraps `fetchGroups` from `services/groups.service.ts`. The realtime layer (Task B2) keeps it fresh, so `staleTime: Infinity` + `refetchOnMount: false` is correct.

- [ ] **Step 1: Open `services/groups.service.ts` and confirm `fetchGroups` signature**

```bash
grep -n "^export.*fetchGroups\|^export function fetchGroups" cost-share-app/apps/mobile/services/groups.service.ts
```

Expected: `fetchGroups(): Promise<GroupWithMembers[]>` (it currently also writes to Zustand as a side-effect). For Phase B we wrap it as-is; the Zustand side-effect remains until Task B5 removes it.

- [ ] **Step 2: Write the failing test**

Create `__tests__/hooks/useGroupsQuery.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import { fetchGroups } from '../../services/groups.service';

jest.mock('../../services/groups.service', () => ({
    fetchGroups: jest.fn(),
}));

function wrapper(client: QueryClient) {
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children);
}

describe('useGroupsQuery', () => {
    it('returns data from fetchGroups', async () => {
        (fetchGroups as jest.Mock).mockResolvedValue([{ id: 'g1', name: 'Trip' }]);
        const client = new QueryClient();

        const { result } = renderHook(() => useGroupsQuery(), { wrapper: wrapper(client) });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual([{ id: 'g1', name: 'Trip' }]);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest __tests__/hooks/useGroupsQuery.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hook**

Create `hooks/queries/useGroupsQuery.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchGroups } from '../../services/groups.service';
import { queryKeys } from './keys';

export function useGroupsQuery() {
    return useQuery({
        queryKey: queryKeys.groups,
        queryFn: () => fetchGroups(),
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest __tests__/hooks/useGroupsQuery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/queries/useGroupsQuery.ts cost-share-app/apps/mobile/__tests__/hooks/useGroupsQuery.test.ts
git commit -m "feat(mobile): add useGroupsQuery wrapping fetchGroups

Realtime-backed: staleTime: Infinity, refetchOnMount: false. Sets up
the persistence + stale-while-revalidate behavior we want from the
groups list screen."
```

---

### Task B2: Make groups realtime handlers idempotent + write to cache

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useAppRealtime.ts`
- Test: `cost-share-app/apps/mobile/__tests__/hooks/useAppRealtimeIdempotency.test.ts`

The current `handleGroupsEvent` mutates Zustand. We change it to mutate the React Query cache (`queryClient.setQueryData(queryKeys.groups, …)`), make the handler upsert-by-id, and capture errors to Sentry instead of `console.error`. Zustand still receives the update during Phase B for backwards compat; Task B5 removes the Zustand half.

- [ ] **Step 1: Write the failing idempotency test**

Create `__tests__/hooks/useAppRealtimeIdempotency.test.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/keys';
import { applyGroupsRealtimeEventToCache } from '../../hooks/useAppRealtime';

describe('applyGroupsRealtimeEventToCache (idempotent upsert)', () => {
    function setup(seed: any[]) {
        const client = new QueryClient();
        client.setQueryData(queryKeys.groups, seed);
        return client;
    }

    it('UPDATE replaces an existing row by id, preserving local-only fields', () => {
        const client = setup([
            { id: 'g1', name: 'Old', members: [{ id: 'u1' }], isArchivedByMe: true, isAutoArchived: false },
        ]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: { id: 'g1', name: 'New', is_active: true, currency: 'USD', owner_id: 'u1', created_at: '2026-01-01' },
        } as any);
        const next = client.getQueryData<any[]>(queryKeys.groups);
        expect(next?.find((g) => g.id === 'g1').name).toBe('New');
        expect(next?.find((g) => g.id === 'g1').members).toEqual([{ id: 'u1' }]);
        expect(next?.find((g) => g.id === 'g1').isArchivedByMe).toBe(true);
    });

    it('applying the same UPDATE twice produces the same cache (idempotent)', () => {
        const client = setup([{ id: 'g1', name: 'Old', members: [] }]);
        const event = {
            eventType: 'UPDATE' as const,
            new: { id: 'g1', name: 'New', is_active: true, currency: 'USD', owner_id: 'u1', created_at: '2026-01-01' },
        };
        applyGroupsRealtimeEventToCache(client, event as any);
        const after1 = client.getQueryData<any[]>(queryKeys.groups);
        applyGroupsRealtimeEventToCache(client, event as any);
        const after2 = client.getQueryData<any[]>(queryKeys.groups);
        expect(after2).toEqual(after1);
    });

    it('DELETE removes by id and is idempotent', () => {
        const client = setup([{ id: 'g1' }, { id: 'g2' }]);
        applyGroupsRealtimeEventToCache(client, { eventType: 'DELETE', old: { id: 'g1' } } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g2' }]);
        applyGroupsRealtimeEventToCache(client, { eventType: 'DELETE', old: { id: 'g1' } } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g2' }]);
    });

    it('UPDATE with is_active=false removes the row', () => {
        const client = setup([{ id: 'g1' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: { id: 'g1', is_active: false },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([]);
    });

    it('UPDATE for an unknown id is a no-op (membership listener handles inserts)', () => {
        const client = setup([{ id: 'g1' }]);
        applyGroupsRealtimeEventToCache(client, {
            eventType: 'UPDATE',
            new: { id: 'g-unknown', is_active: true },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groups)).toEqual([{ id: 'g1' }]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/hooks/useAppRealtimeIdempotency.test.ts
```

Expected: FAIL — `applyGroupsRealtimeEventToCache` not exported.

- [ ] **Step 3: Extract the pure handler in `useAppRealtime.ts`**

Add `applyGroupsRealtimeEventToCache` as an exported pure function alongside `handleGroupsEvent`. Imports at the top of the file (add to existing imports):

```ts
import * as Sentry from '@sentry/react-native';
import { SENTRY_TAGS } from '../lib/sentryTags';
```

Add this new exported function near the existing handlers:

```ts
export function applyGroupsRealtimeEventToCache(
    client: typeof queryClient,
    payload: RealtimePayload,
): void {
    if (payload.eventType === 'DELETE' && payload.old) {
        const oldId = payload.old.id as string | undefined;
        if (!oldId) return;
        client.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) =>
            (prev ?? []).filter((g) => g.id !== oldId),
        );
        return;
    }

    if (payload.eventType === 'UPDATE' && payload.new) {
        const id = payload.new.id as string | undefined;
        if (!id) return;
        const isActive = payload.new.is_active !== false;

        client.setQueryData<GroupWithMembers[]>(queryKeys.groups, (prev) => {
            const list = prev ?? [];
            const existing = list.find((g) => g.id === id);

            if (!isActive) {
                return list.filter((g) => g.id !== id);
            }
            if (!existing) {
                // Membership listener will refetch with members joined.
                return list;
            }

            const base = groupFromRow(payload.new!);
            const merged: GroupWithMembers = {
                ...base,
                members: existing.members,
                isArchivedByMe: existing.isArchivedByMe,
                isAutoArchived: existing.isAutoArchived,
            };
            return list.map((g) => (g.id === id ? merged : g));
        });
    }
    // INSERT ignored — membership listener performs full refetch via queryClient.invalidateQueries.
}
```

- [ ] **Step 4: Switch the existing `handleGroupsEvent` to delegate to the new pure function and keep the Zustand mirror temporarily**

Replace `handleGroupsEvent` body with:

```ts
function handleGroupsEvent(payload: RealtimePayload): void {
    try {
        applyGroupsRealtimeEventToCache(queryClient, payload);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
        return;
    }

    // Mirror to Zustand for transitional consumers; removed in Task B5 once
    // all readers migrate to useGroupsQuery.
    const store = useAppStore.getState();
    if (payload.eventType === 'DELETE' && payload.old) {
        const oldId = payload.old.id as string | undefined;
        if (oldId) store.removeGroup(oldId);
        return;
    }
    if (payload.eventType === 'UPDATE' && payload.new) {
        const id = payload.new.id as string | undefined;
        if (!id) return;
        if (payload.new.is_active === false) {
            store.removeGroup(id);
            return;
        }
        const existing = store.groups.find((g) => g.id === id);
        if (!existing) return;
        const base = groupFromRow(payload.new);
        const merged: GroupWithMembers = {
            ...base,
            members: existing.members,
            isArchivedByMe: existing.isArchivedByMe,
            isAutoArchived: existing.isAutoArchived,
        };
        store.updateGroup(merged);
    }
}
```

- [ ] **Step 5: Replace existing `console.error` calls in this file with Sentry captures**

For each of the six `console.error('app realtime: …', err)` sites (groups, memberships, friendships, friend_requests, archive, activity_events), replace with:

```ts
Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
```

(Keep the surrounding `try { … } catch (err) { … }` structure.)

- [ ] **Step 6: Run tests**

```bash
cd cost-share-app/apps/mobile
npx jest __tests__/hooks/useAppRealtimeIdempotency.test.ts
npx jest
```

Expected: new test passes; existing tests still pass.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useAppRealtime.ts cost-share-app/apps/mobile/__tests__/hooks/useAppRealtimeIdempotency.test.ts
git commit -m "feat(mobile): groups realtime writes through React Query cache

Adds applyGroupsRealtimeEventToCache (pure, idempotent, upsert-by-id)
and routes the handler through it. Zustand mirror retained for
transitional readers until Phase B5 sweep. All realtime errors now
captured to Sentry with the realtime.echo tag."
```

---

### Task B3: Audit Zustand `groups` consumers

**Files:**
- Read-only audit; produces a list embedded in the next task's commit.

- [ ] **Step 1: Enumerate readers**

```bash
cd cost-share-app/apps/mobile
grep -rn "useAppStore.*\.groups\b\|state\.groups\b\|store\.groups\b" --include="*.ts" --include="*.tsx" \
  | grep -v "^store/\|^__tests__/" \
  | tee /tmp/groups-readers.txt
```

- [ ] **Step 2: Eyeball the list**

For each match, decide: does this site read groups *data* (migrate to `useGroupsQuery()`), or does it write groups data (leave alone for now — see Task B5)?

- [ ] **Step 3: Save the list as `docs/superpowers/plans/2026-06-07-groups-consumer-audit.md`** for traceability

Use the saved list to drive Tasks B4 and B5.

(No commit — this is an audit. The saved file is committed alongside the migration in B4.)

---

### Task B4: Migrate GroupsListScreen to `useGroupsQuery` and replace the spinner

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx`
- Modify: any other reader sites the audit (B3) flagged

The screen currently uses an imperative `fetchGroups()` + `useLoading()` and reads from `useAppStore`. We replace both. We do not yet introduce the skeleton — that lands in Task D2. For now keep the existing `<LoadingIndicator />` fallback so the diff stays small.

- [ ] **Step 1: Read the current screen — focus on lines around the loading branch**

Files of interest:
- `screens/groups/GroupsListScreen.tsx:100` — `await fetchGroups()`
- `screens/groups/GroupsListScreen.tsx:187-189` — the empty-while-loading branch

- [ ] **Step 2: Replace `useLoading` + imperative fetch with `useGroupsQuery`**

At the top of `GroupsListScreen.tsx`:

```tsx
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from '../../hooks/queries/keys';
```

Inside the component body, replace the imperative pattern. Find the existing `const { isLoading, startLoading, stopLoading } = useLoading();` and the `loadAll` callback. Replace with:

```tsx
const groupsQuery = useGroupsQuery();
const groups = groupsQuery.data ?? [];
const isLoading = groupsQuery.isLoading;
const loadError = groupsQuery.isError;

const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    void fetchBalanceSummary();
    void prefetchActivityFeed();
}, []);
```

Remove the `useEffect(() => { startLoading(); void loadAll().finally(stopLoading); }, []);` block — the query hook handles initial fetch automatically.

Wire pull-to-refresh to `handleRefresh` wherever the screen currently calls `loadAll`.

- [ ] **Step 3: Update auditor-flagged consumers**

For each other site from B3 that reads groups from `useAppStore`, replace with `useGroupsQuery()` (component sites) or `queryClient.getQueryData(queryKeys.groups)` (non-React sites). Remove the Zustand selectors at those sites.

- [ ] **Step 4: Type-check**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
```

- [ ] **Step 5: Run tests**

```bash
npx jest
```

Expected: passes.

- [ ] **Step 6: Manual smoke**

In a dev build with realtime enabled:
1. Open the app — confirm groups list renders.
2. Pull to refresh — confirm `invalidateQueries` triggers a refetch (you'll see network activity in the dev tools).
3. Background the app and reopen — confirm groups list rehydrates from disk and is on screen before any network call completes.

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx \
        docs/superpowers/plans/2026-06-07-groups-consumer-audit.md
# add any other modified consumer files
git commit -m "refactor(mobile): GroupsListScreen reads from useGroupsQuery

Removes the imperative fetchGroups() + useLoading() pattern. Pull-to-refresh
now invalidates the cache so realtime + RQ machinery do the actual fetch.
Other Zustand consumers migrated per the audit committed alongside."
```

---

### Task B5: Delete the Zustand groups slice entirely

**Files:**
- Modify: `cost-share-app/apps/mobile/store/*` (delete the `groups` slice fields and reducers)
- Modify: `cost-share-app/apps/mobile/hooks/useAppRealtime.ts`
- Modify: `cost-share-app/apps/mobile/services/groups.service.ts`
- Modify: any other file the TypeScript compiler flags

Once every consumer reads from React Query, the Zustand mirror is dead weight. We delete the slice from the store and let `tsc` find every remaining write — that's the guaranteed-complete way to surface them. Membership-listener-driven refetches now invalidate the RQ cache instead.

- [ ] **Step 1: Verify the audit is clean**

Re-run the audit:

```bash
cd cost-share-app/apps/mobile
grep -rn "useAppStore.*\.groups\b\|state\.groups\b\|store\.groups\b" --include="*.ts" --include="*.tsx" \
  | grep -v "^store/\|^__tests__/"
```

Expected: no remaining production-code readers. Stop here if any remain — fix in B4 first.

- [ ] **Step 2: Drop the Zustand mirror in `handleGroupsEvent`**

In `useAppRealtime.ts`, remove the transitional Zustand block introduced in Task B2 Step 4. The handler body is now just:

```ts
function handleGroupsEvent(payload: RealtimePayload): void {
    try {
        applyGroupsRealtimeEventToCache(queryClient, payload);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
    }
}
```

- [ ] **Step 3: Replace `fetchGroups()` membership-listener calls with `invalidateQueries`**

In `useAppRealtime.ts`, `handleMembershipEvent` currently calls `void fetchGroups(); void fetchBalanceSummary();`. Replace with:

```ts
void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
void queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
```

Apply the same swap in `snapshotRefetch` (top of the file): replace `void fetchGroups();` and `void fetchBalanceSummary();` with `invalidateQueries` for the two keys.

- [ ] **Step 4: Delete the `groups` slice from the Zustand store**

```bash
grep -n "groups:\|setGroups\|addGroup\|updateGroup\|removeGroup" cost-share-app/apps/mobile/store/*.ts
```

Delete the `groups` field from the state type, the initial state, and any setters (`setGroups`, `addGroup`, `updateGroup`, `removeGroup`). Run:

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
```

Expected: a list of TypeScript errors at every dead write site. This is the audit — every error is a place that was writing to a slice no one read.

- [ ] **Step 5: Fix every TypeScript error by deleting the dead write**

For each error, open the file and delete the line(s) calling the removed setter. Most are in `services/groups.service.ts` (in `fetchGroups`, archive helpers, etc.) and `hooks/useAppRealtime.ts` (in the membership listener). Some service functions also *read* from the store (`useAppStore.getState().groups.find(...)`); replace those reads with `queryClient.getQueryData(queryKeys.groups)`.

Re-run `npx tsc --noEmit` until it's clean.

- [ ] **Step 6: Same treatment for `fetchBalanceSummary` if it writes to Zustand**

Confirm with `grep -n "fetchBalanceSummary\|setBalanceSummary\|balanceSummary:" cost-share-app/apps/mobile/services/users.service.ts cost-share-app/apps/mobile/store/*.ts`. If it writes to Zustand for `balanceSummary`, convert the consumer screen to a query and delete the slice in the same pass (out of scope detail — if non-trivial, log as follow-up; otherwise convert in this task).

- [ ] **Step 7: Run tests**

```bash
cd cost-share-app/apps/mobile
npx jest
npx tsc --noEmit
```

- [ ] **Step 8: Manual smoke**

1. Add a group via the UI — confirm it appears in the list (membership-listener invalidates → refetch → render).
2. Have another user add you to a group (or simulate via SQL in dev) — confirm it appears via realtime.

- [ ] **Step 9: Commit**

```bash
git add cost-share-app/apps/mobile/store \
        cost-share-app/apps/mobile/hooks/useAppRealtime.ts \
        cost-share-app/apps/mobile/services/groups.service.ts \
        cost-share-app/apps/mobile/services/users.service.ts
# add any other files the tsc audit touched
git commit -m "refactor(mobile): delete Zustand groups slice; realtime writes only to RQ

The 'groups' slice and every setter on it is removed from the store.
TypeScript compiler audit surfaces every dead write — each one deleted
in this pass. Membership realtime invalidates RQ keys directly."
```

---

## Phase C — Group detail migration

### Task C1: `useGroupExpensesQuery` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/queries/useGroupExpensesQuery.ts`

- [ ] **Step 1: Confirm `fetchExpenses` signature**

```bash
grep -n "^export.*fetchExpenses" cost-share-app/apps/mobile/services/expenses.service.ts
```

Expected: `fetchExpenses(groupId: string): Promise<Expense[]>`. Today it also writes to Zustand (`groupFeedCache`); we wrap it as-is for Phase C and remove the side-effect in Task C5.

- [ ] **Step 2: Create the hook**

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchExpenses } from '../../services/expenses.service';
import { queryKeys } from './keys';

export function useGroupExpensesQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupExpenses(groupId),
        queryFn: () => fetchExpenses(groupId),
        enabled: Boolean(groupId),
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
}
```

- [ ] **Step 3: Type-check + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/queries/useGroupExpensesQuery.ts
git commit -m "feat(mobile): useGroupExpensesQuery wrapping fetchExpenses"
```

---

### Task C2: `useGroupMessagesQuery` hook

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/queries/useGroupMessagesQuery.ts`

- [ ] **Step 1: Confirm signature**

```bash
grep -n "^export.*fetchMessages" cost-share-app/apps/mobile/services/messages.service.ts
```

- [ ] **Step 2: Create the hook (same shape as C1)**

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchMessages } from '../../services/messages.service';
import { queryKeys } from './keys';

export function useGroupMessagesQuery(groupId: string) {
    return useQuery({
        queryKey: queryKeys.groupMessages(groupId),
        queryFn: () => fetchMessages(groupId),
        enabled: Boolean(groupId),
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/queries/useGroupMessagesQuery.ts
git commit -m "feat(mobile): useGroupMessagesQuery wrapping fetchMessages"
```

---

### Task C3: Per-group realtime hooks — idempotent + snapshot-refetch on SUBSCRIBED

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts`
- Modify: `cost-share-app/apps/mobile/hooks/useGroupMessagesRealtime.ts`
- Modify: `cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts`
- Test: extend `__tests__/hooks/useAppRealtimeIdempotency.test.ts` (or add a sibling file)

For each per-group realtime hook:
1. Refactor the INSERT/UPDATE/DELETE branches into a pure `applyExpensesRealtimeEventToCache` / `applyMessagesRealtimeEventToCache` function that takes the QueryClient + payload (mirrors B2).
2. Make INSERT upsert-by-id: if the row is already in cache, no-op.
3. On `SUBSCRIBED` (in the `.subscribe(status => ...)` callback), call `queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(groupId) })` (and the matching key in each hook).
4. Replace `console.error` with `Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } })`.

- [ ] **Step 1: Read each file first to understand current shape**

```bash
cat cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts
cat cost-share-app/apps/mobile/hooks/useGroupMessagesRealtime.ts
cat cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts
```

- [ ] **Step 2: Write the idempotency test for expenses**

Add to `__tests__/hooks/useAppRealtimeIdempotency.test.ts` (or new file `__tests__/hooks/useGroupExpensesRealtime.test.ts`):

```ts
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/keys';
import { applyExpensesRealtimeEventToCache } from '../../hooks/useGroupExpensesRealtime';

describe('applyExpensesRealtimeEventToCache (idempotent upsert)', () => {
    const groupId = 'g1';
    function setup(seed: any[]) {
        const client = new QueryClient();
        client.setQueryData(queryKeys.groupExpenses(groupId), seed);
        return client;
    }

    it('INSERT for a row already in cache is a no-op', () => {
        const client = setup([{ id: 'e1', amount: 10 }]);
        applyExpensesRealtimeEventToCache(client, groupId, {
            eventType: 'INSERT',
            new: { id: 'e1', amount: 10 },
        } as any);
        expect(client.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'e1', amount: 10 }]);
    });

    it('INSERT for a new row appends', () => {
        const client = setup([{ id: 'e1' }]);
        applyExpensesRealtimeEventToCache(client, groupId, {
            eventType: 'INSERT',
            new: { id: 'e2', amount: 20 },
        } as any);
        const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId));
        expect(list?.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('DELETE removes and is idempotent', () => {
        const client = setup([{ id: 'e1' }, { id: 'e2' }]);
        applyExpensesRealtimeEventToCache(client, groupId, { eventType: 'DELETE', old: { id: 'e1' } } as any);
        applyExpensesRealtimeEventToCache(client, groupId, { eventType: 'DELETE', old: { id: 'e1' } } as any);
        expect(client.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'e2' }]);
    });

    it('UPDATE replaces by id', () => {
        const client = setup([{ id: 'e1', amount: 10 }, { id: 'e2', amount: 20 }]);
        applyExpensesRealtimeEventToCache(client, groupId, {
            eventType: 'UPDATE',
            new: { id: 'e1', amount: 15 },
        } as any);
        expect(client.getQueryData<any[]>(queryKeys.groupExpenses(groupId))).toEqual([
            { id: 'e1', amount: 15 },
            { id: 'e2', amount: 20 },
        ]);
    });
});
```

- [ ] **Step 3: Run to confirm fails**

```bash
npx jest __tests__/hooks/useAppRealtimeIdempotency.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Refactor `useGroupExpensesRealtime.ts` to export the pure handler**

At the top of the file add:

```ts
import * as Sentry from '@sentry/react-native';
import { SENTRY_TAGS } from '../lib/sentryTags';
import { queryKeys } from './queries/keys';
import { queryClient } from '../lib/queryClient';
```

Add the exported pure function. Reuse the project's existing expense row type — replace `Expense` below with whatever the codebase calls it (`grep -n "type Expense\|interface Expense" cost-share-app/apps/mobile/services/expenses.service.ts`):

```ts
type RealtimePayload = {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
};

export function applyExpensesRealtimeEventToCache(
    client: typeof queryClient,
    groupId: string,
    payload: RealtimePayload,
): void {
    const key = queryKeys.groupExpenses(groupId);
    client.setQueryData<any[]>(key, (prev) => {
        const list = prev ?? [];
        if (payload.eventType === 'DELETE' && payload.old) {
            const id = payload.old.id as string | undefined;
            return id ? list.filter((e) => e.id !== id) : list;
        }
        if (payload.eventType === 'INSERT' && payload.new) {
            const id = payload.new.id as string | undefined;
            if (!id) return list;
            return list.some((e) => e.id === id) ? list : [...list, payload.new];
        }
        if (payload.eventType === 'UPDATE' && payload.new) {
            const id = payload.new.id as string | undefined;
            if (!id) return list;
            return list.map((e) => (e.id === id ? { ...e, ...payload.new } : e));
        }
        return list;
    });
}
```

Inside the hook itself, change the channel handler to delegate to the new function, capture errors to Sentry, and add the snapshot-on-SUBSCRIBED invalidation. Pattern (adapt to existing structure):

```ts
.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(groupId) });
    }
});
```

And wrap the existing handler invocation:

```ts
(payload: RealtimePayload) => {
    try {
        applyExpensesRealtimeEventToCache(queryClient, groupId, payload);
    } catch (err) {
        Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.REALTIME_ECHO } });
    }
}
```

- [ ] **Step 5: Repeat the same refactor for messages and settlements**

Same pattern, different keys (`queryKeys.groupMessages(groupId)` / `queryKeys.groupSettlements(groupId)`).

For settlements specifically: the existing realtime hook may already use React Query (`useSettlementQueries` is RQ-based). If so, only add the SUBSCRIBED snapshot-refetch via `invalidateQueries` and Sentry capture; the cache write path doesn't need refactoring.

- [ ] **Step 6: Run tests**

```bash
cd cost-share-app/apps/mobile
npx jest __tests__/hooks/useAppRealtimeIdempotency.test.ts
npx jest
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/useGroupExpensesRealtime.ts \
        cost-share-app/apps/mobile/hooks/useGroupMessagesRealtime.ts \
        cost-share-app/apps/mobile/hooks/useGroupSettlementsRealtime.ts \
        cost-share-app/apps/mobile/__tests__/hooks/useAppRealtimeIdempotency.test.ts
git commit -m "feat(mobile): per-group realtime is idempotent + snapshot-refetches on SUBSCRIBED

Expenses, messages, and settlements realtime hooks now write through
queryClient.setQueryData with upsert-by-id semantics. On (re)subscribe
each hook invalidates its query so a disconnect/reconnect cycle never
leaves the cache stale. Errors captured to Sentry under realtime.echo."
```

---

### Task C4: Migrate GroupDetailScreen to React Query

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx`

The screen currently uses `useLoading` + imperative `fetchExpenses` + the `groupFeedCache` shim, plus `useGroupUsersQuery` (already RQ). Replace the imperative paths with the new hooks; leave the existing `<LoadingIndicator />` fallback in place (skeleton swap is Task D3).

- [ ] **Step 1: Read GroupDetailScreen to map the existing state**

Key lines:
- `GroupDetailScreen.tsx:137` — `const { isLoading, startLoading, stopLoading } = useLoading();`
- `GroupDetailScreen.tsx:284` — `tasks.push(fetchExpenses(groupId));`
- `GroupDetailScreen.tsx:636` — `if (isLoading && !displayGroup) return <LoadingIndicator />;`

- [ ] **Step 2: Swap to query hooks**

Imports:

```tsx
import { useGroupExpensesQuery } from '../../hooks/queries/useGroupExpensesQuery';
import { useGroupMessagesQuery } from '../../hooks/queries/useGroupMessagesQuery';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from '../../hooks/queries/keys';
```

Replace `useLoading` with:

```tsx
const expensesQuery = useGroupExpensesQuery(groupId);
const messagesQuery = useGroupMessagesQuery(groupId);
const expenses = expensesQuery.data ?? [];
const messages = messagesQuery.data ?? [];
const isLoading = expensesQuery.isLoading || messagesQuery.isLoading;
```

In `loadAll` (or whichever callback drives manual refresh), replace `tasks.push(fetchExpenses(groupId));` and the messages-equivalent with:

```tsx
tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(groupId) }));
tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.groupMessages(groupId) }));
```

- [ ] **Step 3: Audit other reads of `groupFeedCache`**

```bash
grep -rn "groupFeedCache\|isGroupExpensesHydrated\|isGroupMessagesHydrated" cost-share-app/apps/mobile --include="*.ts" --include="*.tsx"
```

If these helpers are only used by `prefetchGroupDetail`, leave them in place — Task C5 removes them.

- [ ] **Step 4: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 5: Manual smoke**

1. Open a group — confirm header, expenses, messages render.
2. Pull to refresh — confirm `invalidateQueries` fires.
3. Background and reopen the group — confirm content renders from the persisted cache before any network call resolves.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx
git commit -m "refactor(mobile): GroupDetailScreen reads from useGroupExpensesQuery + useGroupMessagesQuery

Drops the imperative fetchExpenses/fetchMessages + useLoading pattern.
Pull-to-refresh now invalidates the RQ cache; realtime + persistence
do the heavy lifting underneath."
```

---

### Task C5: Delete expenses/messages Zustand slices and decommission groupFeedCache

**Files:**
- Modify: `cost-share-app/apps/mobile/store/*` (delete `expenses` and `groupMessages` slices)
- Modify: `cost-share-app/apps/mobile/services/expenses.service.ts`
- Modify: `cost-share-app/apps/mobile/services/messages.service.ts`
- Modify: `cost-share-app/apps/mobile/hooks/queries/prefetchGroupDetail.ts`
- Modify: any other file the TypeScript compiler flags
- Delete (if unused): `cost-share-app/apps/mobile/lib/groupFeedCache.ts`

- [ ] **Step 1: Confirm no other consumers of groupFeedCache**

```bash
grep -rn "groupFeedCache\|isGroupExpensesHydrated\|isGroupMessagesHydrated\|hasStoreGroupMembers" cost-share-app/apps/mobile --include="*.ts" --include="*.tsx"
```

Expected: only `prefetchGroupDetail.ts` references it after C4.

- [ ] **Step 2: Delete the `expenses` and `groupMessages` slices from the store**

```bash
grep -n "expenses:\|groupMessages:\|setExpenses\|addExpense\|updateExpense\|removeExpense\|setGroupMessages\|upsertGroupMessage\|removeGroupMessage" cost-share-app/apps/mobile/store/*.ts
```

Delete those fields, the initial state values, and the setters. Run:

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
```

Expected: a list of TypeScript errors at every dead write/read site across `services/expenses.service.ts`, `services/messages.service.ts`, possibly screens, and tests. This is the audit.

- [ ] **Step 3: Fix every TypeScript error**

For each error, delete the dead write line (e.g., `useAppStore.getState().addExpense(...)`). For any reads (e.g., `useAppStore.getState().expenses.find(...)` in `updateExpense` to fetch splits), replace with `queryClient.getQueryData(queryKeys.groupExpenses(groupId))`. Re-run `npx tsc --noEmit` until clean.

The result: `fetchExpenses`, `fetchMessages`, `createExpense`, `updateExpense`, `deleteExpense`, and message ops are all pure functions — they hit the network and return values; the cache layer is RQ alone.

- [ ] **Step 4: Rewrite `prefetchGroupDetail` against RQ keys**

Replace the body with `queryClient.prefetchQuery` calls keyed by the new query keys:

```ts
import { fetchExpenses } from '../../services/expenses.service';
import { fetchMessages } from '../../services/messages.service';
import { fetchGroupUsers } from '../../services/users.service';
import { fetchSettlements } from '../../services/settlements.service';
import { getGroupMembers } from '../../services/groups.service';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from './keys';

export function prefetchGroupDetail(groupId: string): void {
    if (!groupId) return;

    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupExpenses(groupId),
        queryFn: () => fetchExpenses(groupId),
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupMessages(groupId),
        queryFn: () => fetchMessages(groupId),
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupMembers(groupId),
        queryFn: () => getGroupMembers(groupId),
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupUsers(groupId),
        queryFn: () => fetchGroupUsers(groupId),
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupSettlements(groupId),
        queryFn: () => fetchSettlements(groupId),
    });
}
```

- [ ] **Step 5: Delete `lib/groupFeedCache.ts` if no remaining references**

```bash
git rm cost-share-app/apps/mobile/lib/groupFeedCache.ts
```

Only if grep from Step 1 is empty.

- [ ] **Step 6: Run tests + type-check**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/store \
        cost-share-app/apps/mobile/services/expenses.service.ts \
        cost-share-app/apps/mobile/services/messages.service.ts \
        cost-share-app/apps/mobile/hooks/queries/prefetchGroupDetail.ts
# also stage the deletion if applicable, plus any other files the tsc audit touched
git commit -m "refactor(mobile): delete Zustand expenses/messages slices; retire groupFeedCache

Removes the expenses and groupMessages slices from the store entirely.
TypeScript compiler audit surfaces every dead write — each one deleted
in this pass. prefetchGroupDetail now warms the RQ cache directly via
prefetchQuery for every group-detail key."
```

---

## Phase D — Config + skeletons

### Task D1: queryClient defaults

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/queryClient.ts`

- [ ] **Step 1: Replace `lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Realtime is the freshness source for the queries we care about.
            // Per-query overrides set staleTime to Infinity for those keys (see
            // useGroupsQuery/useGroupExpensesQuery/useGroupMessagesQuery). For
            // non-realtime queries the default is a small staleTime so they
            // don't refetch on every screen mount but still revalidate quickly.
            staleTime: 60_000,
            gcTime: 24 * 60 * 60_000,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
            retry: 1,
        },
        mutations: {
            retry: 0, // useAddExpenseMutation owns its retry policy.
        },
    },
});
```

- [ ] **Step 2: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

Some existing queries may rely on the old `refetchOnMount: true` default. If a test or screen breaks because of this, override per-query (`refetchOnMount: 'always'`) at the offending hook, not in the global defaults.

- [ ] **Step 3: Commit**

```bash
git add cost-share-app/apps/mobile/lib/queryClient.ts
git commit -m "feat(mobile): trust-realtime defaults on queryClient

refetchOnMount and refetchOnWindowFocus off by default; refetchOnReconnect
left on so a disconnected device immediately catches up when networking
returns. gcTime extended to 24h to keep cached screens warm across
backgrounding."
```

---

### Task D2: `GroupsListSkeleton`

**Files:**
- Create: `cost-share-app/apps/mobile/components/skeletons/GroupsListSkeleton.tsx`
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx`

- [ ] **Step 1: Create the skeleton**

Match the existing skeleton style — plain gray `View` boxes shaped like the real content. Reference existing skeletons in `screens/profile/ProfileScreen.tsx` and `components/ActivityItemSkeleton.tsx` for the color palette.

Create `components/skeletons/GroupsListSkeleton.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

function Row() {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: SKELETON_BG }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ height: 14, width: '60%', borderRadius: 4, backgroundColor: SKELETON_BG }} />
                <View style={{ height: 10, width: '40%', borderRadius: 4, backgroundColor: SKELETON_BG, marginTop: 8 }} />
            </View>
            <View style={{ width: 64, height: 14, borderRadius: 4, backgroundColor: SKELETON_BG }} />
        </View>
    );
}

export function GroupsListSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
                <View style={{ height: 24, width: 140, borderRadius: 6, backgroundColor: SKELETON_BG }} />
            </View>
            {Array.from({ length: 6 }).map((_, idx) => (
                <Row key={idx} />
            ))}
        </View>
    );
}
```

- [ ] **Step 2: Swap it into GroupsListScreen**

In `screens/groups/GroupsListScreen.tsx`, import and replace the empty-while-loading branch. The condition should be: cache is empty AND we're loading (i.e., truly first time, no cached content).

```tsx
import { GroupsListSkeleton } from '../../components/skeletons/GroupsListSkeleton';

// …

if (isLoading && groups.length === 0) {
    return <GroupsListSkeleton />;
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 4: Manual smoke**

1. Wipe the app's persisted cache (sign out + back in, or kill app + clear storage in dev).
2. Open app — confirm `GroupsListSkeleton` is shown briefly, then real groups render.
3. Close app, reopen — confirm groups render immediately *without* the skeleton (persisted cache hit).

- [ ] **Step 5: Commit**

```bash
git add cost-share-app/apps/mobile/components/skeletons/GroupsListSkeleton.tsx \
        cost-share-app/apps/mobile/screens/groups/GroupsListScreen.tsx
git commit -m "feat(mobile): GroupsListSkeleton replaces blank spinner on first load

Only renders when cache is empty AND query is loading — i.e., the rare
truly-empty state. Returning users see the persisted list immediately
with no skeleton at all."
```

---

### Task D3: `GroupDetailSkeleton`

**Files:**
- Create: `cost-share-app/apps/mobile/components/skeletons/GroupDetailSkeleton.tsx`
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx`

- [ ] **Step 1: Create the skeleton**

Create `components/skeletons/GroupDetailSkeleton.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

function ExpenseRow() {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SKELETON_BG }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ height: 12, width: '50%', borderRadius: 4, backgroundColor: SKELETON_BG }} />
                <View style={{ height: 10, width: '30%', borderRadius: 4, backgroundColor: SKELETON_BG, marginTop: 6 }} />
            </View>
            <View style={{ width: 56, height: 14, borderRadius: 4, backgroundColor: SKELETON_BG }} />
        </View>
    );
}

export function GroupDetailSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12 }}>
                <View style={{ height: 22, width: '60%', borderRadius: 6, backgroundColor: SKELETON_BG }} />
                <View style={{ height: 14, width: '40%', borderRadius: 4, backgroundColor: SKELETON_BG, marginTop: 8 }} />
            </View>
            {Array.from({ length: 7 }).map((_, idx) => (
                <ExpenseRow key={idx} />
            ))}
        </View>
    );
}
```

- [ ] **Step 2: Swap it into GroupDetailScreen**

Find the `if (isLoading && !displayGroup) return <LoadingIndicator />;` block (around line 636 pre-refactor; the condition may have shifted). Replace with:

```tsx
if (isLoading && expenses.length === 0 && !displayGroup) {
    return <GroupDetailSkeleton />;
}
```

Add the import.

- [ ] **Step 3: Smoke + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest

git add cost-share-app/apps/mobile/components/skeletons/GroupDetailSkeleton.tsx \
        cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx
git commit -m "feat(mobile): GroupDetailSkeleton replaces blank spinner on first group open"
```

---

### Task D4: `AppGateSkeleton`

**Files:**
- Create: `cost-share-app/apps/mobile/components/skeletons/AppGateSkeleton.tsx`
- Modify: `cost-share-app/apps/mobile/App.tsx`
- Modify: `cost-share-app/apps/mobile/components/AuthenticatedAppGate.tsx`

- [ ] **Step 1: Create the skeleton**

```tsx
import React from 'react';
import { View } from 'react-native';

const SKELETON_BG = '#E5E7EB';

export function AppGateSkeleton() {
    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 64 }}>
                    <View style={{ height: 28, width: '50%', borderRadius: 6, backgroundColor: SKELETON_BG }} />
                </View>
                <View style={{ padding: 16, gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                        <View
                            key={idx}
                            style={{ height: 60, borderRadius: 8, backgroundColor: SKELETON_BG }}
                        />
                    ))}
                </View>
            </View>
            <View style={{ height: 64, backgroundColor: SKELETON_BG, borderTopWidth: 1, borderTopColor: '#F3F4F6' }} />
        </View>
    );
}
```

- [ ] **Step 2: Swap into App.tsx**

Replace the `!isReady` fallback (around `App.tsx:227-239`):

```tsx
import { AppGateSkeleton } from './components/skeletons/AppGateSkeleton';

// in render:
if (!isReady) {
    return (
        <SafeAreaProvider>
            <RtlLayoutProvider>
                <WebFrame>
                    <AppGateSkeleton />
                </WebFrame>
            </RtlLayoutProvider>
        </SafeAreaProvider>
    );
}
```

Also replace the inner `preOnboardingDone === null` branch's `ActivityIndicator` with `<AppGateSkeleton />`.

- [ ] **Step 3: Swap into AuthenticatedAppGate**

Open `components/AuthenticatedAppGate.tsx`. Find the `gate === 'loading'` branch (around line 59-65). Replace with:

```tsx
import { AppGateSkeleton } from './skeletons/AppGateSkeleton';

// …

if (gate === 'loading') {
    return <AppGateSkeleton />;
}
```

- [ ] **Step 4: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 5: Manual smoke**

1. Cold start the app with a logged-in user — first frames show `AppGateSkeleton`, then real screens render.
2. Compare to before: no flash of white-with-spinner.

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/components/skeletons/AppGateSkeleton.tsx \
        cost-share-app/apps/mobile/App.tsx \
        cost-share-app/apps/mobile/components/AuthenticatedAppGate.tsx
git commit -m "feat(mobile): AppGateSkeleton replaces white-screen spinner on boot

Replaces the three full-screen ActivityIndicator blocks in App.tsx
(unready + pre-onboarding-resolving) and AuthenticatedAppGate (gate=loading)
with a shaped skeleton."
```

---

## Phase E — Offline add-expense

### Task E1: `PendingSyncIcon` component

**Files:**
- Create: `cost-share-app/apps/mobile/components/PendingSyncIcon.tsx`

The icon is a 5-state visual. We use existing icon resources where possible. Check `grep -rn "react-native-vector-icons\|@expo/vector-icons" cost-share-app/apps/mobile --include="*.ts" --include="*.tsx" | head -3` for the project's icon library. Use `Ionicons` (typical Expo default) and adjust the import if a different library is in use.

- [ ] **Step 1: Confirm the icon library**

```bash
grep -rn "from '@expo/vector-icons'" cost-share-app/apps/mobile --include="*.tsx" | head -3
```

If `@expo/vector-icons` is in use, proceed. Otherwise substitute the project's preferred library in the imports below.

- [ ] **Step 2: Create the component**

```tsx
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type PendingSyncState =
    | 'offline-waiting'
    | 'online-queued'
    | 'syncing'
    | 'synced-transient'
    | 'failed';

interface Props {
    state: PendingSyncState;
    onPress?: () => void;
    accessibilityLabel?: string;
}

const COLORS: Record<PendingSyncState, string> = {
    'offline-waiting': '#9CA3AF',
    'online-queued': '#9CA3AF',
    'syncing': '#6B7280',
    'synced-transient': '#10B981',
    'failed': '#DC2626',
};

const ICONS: Record<PendingSyncState, keyof typeof Ionicons.glyphMap> = {
    'offline-waiting': 'cloud-offline-outline',
    'online-queued': 'cloud-upload-outline',
    'syncing': 'sync',
    'synced-transient': 'checkmark-circle',
    'failed': 'alert-circle',
};

export function PendingSyncIcon({ state, onPress, accessibilityLabel }: Props) {
    const tappable = state === 'online-queued' || state === 'failed' || (state === 'offline-waiting' && onPress != null);

    const inner =
        state === 'syncing' ? (
            <ActivityIndicator size="small" color={COLORS[state]} />
        ) : (
            <Ionicons name={ICONS[state]} size={18} color={COLORS[state]} />
        );

    if (!tappable || !onPress) {
        return <View accessibilityLabel={accessibilityLabel}>{inner}</View>;
    }

    return (
        <Pressable
            onPress={onPress}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={8}
        >
            {inner}
        </Pressable>
    );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
git add cost-share-app/apps/mobile/components/PendingSyncIcon.tsx
git commit -m "feat(mobile): PendingSyncIcon component with 5 states

Visual indicator next to a pending expense row. States: offline-waiting,
online-queued, syncing, synced-transient, failed."
```

---

### Task E2: `useAddExpenseMutation` hook — happy path

**Files:**
- Create: `cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts`
- Test: `cost-share-app/apps/mobile/__tests__/hooks/useAddExpenseMutation.test.ts`

This task delivers the optimistic insert + `onSuccess` swap. Pause-on-offline, edit, delete are subsequent tasks.

- [ ] **Step 1: Refactor `createExpense` to throw on failure (not return null)**

The current `services/expenses.service.ts:114` signature is `createExpense(dto): Promise<Expense | null>` — it swallows errors and returns null. That doesn't compose with React Query's mutation lifecycle: a null return looks like success, so `onSuccess` runs, `onError` doesn't, and the optimistic row vanishes silently with no Sentry capture and no failed-state UI.

Change the signature to `Promise<Expense>` and propagate Supabase errors. Verify the existing call sites first:

```bash
grep -rn "createExpense(" cost-share-app/apps/mobile --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```

Expected: one caller (`screens/expenses/AddExpenseScreen.tsx`), which this task replaces anyway. So changing the signature is safe.

Edit `services/expenses.service.ts:createExpense`:
- Remove the null return path; instead `throw` Supabase's error (or wrap it: `throw new Error(error.message)`).
- Update the return type to `Promise<Expense>`.
- Update any tests that asserted on the null path to expect a throw.

Commit this refactor as part of E2.

- [ ] **Step 2: Confirm `createExpense` signature post-refactor**

```bash
grep -n "^export.*createExpense\|^export function createExpense" cost-share-app/apps/mobile/services/expenses.service.ts
```

Expected: `Promise<Expense>` (not nullable).

- [ ] **Step 3: Write the failing test**

Create `__tests__/hooks/useAddExpenseMutation.test.ts`:

```ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAddExpenseMutation } from '../../hooks/mutations/useAddExpenseMutation';
import { queryKeys } from '../../hooks/queries/keys';
import { createExpense } from '../../services/expenses.service';
import { isPendingExpenseId } from '../../lib/pendingExpense';

jest.mock('../../services/expenses.service', () => ({
    createExpense: jest.fn(),
}));

function wrap(client: QueryClient) {
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children);
}

describe('useAddExpenseMutation', () => {
    const groupId = 'g1';
    const payload = { amount: 10, description: 'coffee', currency: 'USD' };

    beforeEach(() => {
        (createExpense as jest.Mock).mockReset();
    });

    it('inserts a pending_<uuid> row optimistically on mutate', async () => {
        (createExpense as jest.Mock).mockImplementation(() => new Promise(() => {}));
        const client = new QueryClient();
        client.setQueryData(queryKeys.groupExpenses(groupId), []);
        const { result } = renderHook(() => useAddExpenseMutation(groupId), { wrapper: wrap(client) });

        act(() => {
            result.current.mutate(payload);
        });

        await waitFor(() => {
            const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId));
            expect(list).toHaveLength(1);
            expect(isPendingExpenseId(list?.[0].id)).toBe(true);
            expect(list?.[0].amount).toBe(10);
        });
    });

    it('on success, replaces the pending row with the canonical server row', async () => {
        const serverRow = { id: 'srv-1', amount: 10, description: 'coffee', currency: 'USD' };
        (createExpense as jest.Mock).mockResolvedValue(serverRow);
        const client = new QueryClient();
        client.setQueryData(queryKeys.groupExpenses(groupId), []);
        const { result } = renderHook(() => useAddExpenseMutation(groupId), { wrapper: wrap(client) });

        act(() => {
            result.current.mutate(payload);
        });

        await waitFor(() => {
            const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId));
            expect(list).toEqual([serverRow]);
        });
    });

    it('on success, is a no-op if a realtime echo already added the server row', async () => {
        const serverRow = { id: 'srv-2', amount: 10 };
        (createExpense as jest.Mock).mockResolvedValue(serverRow);
        const client = new QueryClient();
        client.setQueryData(queryKeys.groupExpenses(groupId), []);
        const { result } = renderHook(() => useAddExpenseMutation(groupId), { wrapper: wrap(client) });

        act(() => {
            result.current.mutate(payload);
        });

        // Simulate realtime echo arriving between optimistic insert and onSuccess.
        await waitFor(() => {
            const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId));
            expect(list).toHaveLength(1);
        });
        client.setQueryData(queryKeys.groupExpenses(groupId), (prev: any[] | undefined) => [
            ...(prev ?? []).filter((e) => !e.id.startsWith('pending_')),
            serverRow,
        ]);

        await waitFor(() => {
            const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId));
            expect(list).toEqual([serverRow]);
        });
    });
});
```

- [ ] **Step 4: Run to fail**

```bash
npx jest __tests__/hooks/useAddExpenseMutation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Create the pending-follow-up registry**

Create `lib/pendingFollowUps.ts`. This is the side-channel E4 (edit-while-pending) and E5 (delete-while-pending) use to chain a follow-up mutation onto an in-flight create — see decision-4 in the spec. The registry is a process-lifetime Map keyed by pendingId; values describe what to do *after* the create resolves with a server id.

```ts
import type { UpdateExpenseDto } from '../services/expenses.service';

export type PendingFollowUp =
    | { kind: 'edit'; payload: UpdateExpenseDto }
    | { kind: 'delete' };

const followUps = new Map<string, PendingFollowUp>();

export function registerPendingFollowUp(pendingId: string, followUp: PendingFollowUp): void {
    followUps.set(pendingId, followUp);
}

export function takePendingFollowUp(pendingId: string): PendingFollowUp | null {
    const value = followUps.get(pendingId) ?? null;
    if (value) followUps.delete(pendingId);
    return value;
}

export function hasPendingFollowUp(pendingId: string): boolean {
    return followUps.has(pendingId);
}
```

Test (`__tests__/lib/pendingFollowUps.test.ts`) is straightforward — verify register/take semantics and that `take` is one-shot.

- [ ] **Step 6: Implement the hook**

Create `hooks/mutations/useAddExpenseMutation.ts`. Three implementation notes:
- `pendingId` is wrapped in `useRef(...).current` so it's stable across re-renders. Without this, the hook generates a fresh UUID on every render and the `mutationKey` would drift; downstream `useIsMutating({ mutationKey: ['addExpense', expense.id] })` lookups in `GroupDetailScreen` would only ever match the most-recent render's key.
- `networkMode: 'online'` (not `'offlineFirst'`). With `'online'`, React Query checks `onlineManager` before firing — when offline the mutation pauses *without* attempting the network call, so the E7 retry policy never burns through 2s + 8s + 32s of failed-network attempts before pausing. The UX is "queue instantly, fire when online" which is what the optimistic-add flow wants.
- `onSuccess` drains the pending-follow-up registry. If E4 or E5 registered a follow-up while the create was in-flight, we fire `updateExpense`/`deleteExpense` against the freshly-returned server id. The follow-up runs as a fire-and-forget; its own Sentry capture happens inside the chained call.

```ts
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { createExpense, updateExpense, deleteExpense } from '../../services/expenses.service';
import { queryKeys } from '../queries/keys';
import {
    addExpenseMutationKey,
    createPendingExpenseId,
    isPendingExpenseId,
} from '../../lib/pendingExpense';
import { takePendingFollowUp } from '../../lib/pendingFollowUps';
import { SENTRY_TAGS } from '../../lib/sentryTags';

export interface AddExpenseVariables {
    amount: number;
    description: string;
    currency: string;
    // Other fields from the existing AddExpenseScreen payload are pass-through.
    [key: string]: unknown;
}

interface MutationContext {
    pendingId: string;
}

export function useAddExpenseMutation(groupId: string) {
    const client = useQueryClient();
    // Stable for the lifetime of the hook mount; each new AddExpenseScreen mount
    // generates a fresh pendingId (which is exactly what edit-while-pending in E4
    // relies on when it cancels + re-enqueues).
    const pendingId = useRef(createPendingExpenseId()).current;
    const key = queryKeys.groupExpenses(groupId);

    return useMutation<unknown, Error, AddExpenseVariables, MutationContext>({
        mutationKey: addExpenseMutationKey(pendingId),
        networkMode: 'online',
        mutationFn: async (variables) => {
            return createExpense({ ...variables, groupId });
        },
        onMutate: async (variables) => {
            await client.cancelQueries({ queryKey: key });
            client.setQueryData<any[]>(key, (prev) => {
                const list = prev ?? [];
                const optimistic = {
                    id: pendingId,
                    ...variables,
                    groupId,
                    pendingFailed: false,
                };
                return [...list, optimistic];
            });
            return { pendingId };
        },
        onSuccess: (serverRow, _vars, ctx) => {
            const incoming = serverRow as { id?: string } | undefined;
            try {
                client.setQueryData<any[]>(key, (prev) => {
                    const list = (prev ?? []).filter((e) => e.id !== ctx?.pendingId);
                    if (!incoming?.id) return list;
                    if (list.some((e) => e.id === incoming.id)) return list;
                    return [...list, incoming];
                });
            } catch (err) {
                Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD } });
            }

            // Drain any follow-up registered by E4/E5 while the create was in-flight.
            // E4 (edit) registered an UpdateExpenseDto; E5 (delete) registered { kind: 'delete' }.
            // Fire-and-forget: each chained call has its own Sentry capture on failure.
            if (incoming?.id && ctx?.pendingId) {
                const followUp = takePendingFollowUp(ctx.pendingId);
                if (followUp?.kind === 'edit') {
                    void updateExpense(incoming.id, followUp.payload).catch((err) => {
                        Sentry.captureException(err, {
                            tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                            extra: { followUp: 'edit', serverId: incoming.id },
                        });
                    });
                } else if (followUp?.kind === 'delete') {
                    void deleteExpense(incoming.id).catch((err) => {
                        Sentry.captureException(err, {
                            tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                            extra: { followUp: 'delete', serverId: incoming.id },
                        });
                    });
                }
            }
        },
        onError: (err, _vars, ctx) => {
            client.setQueryData<any[]>(key, (prev) =>
                (prev ?? []).map((e) =>
                    e.id === ctx?.pendingId ? { ...e, pendingFailed: true } : e,
                ),
            );
            Sentry.captureException(err, {
                tags: { tag: SENTRY_TAGS.MUTATION_OFFLINE_ADD },
                level: 'warning',
            });
        },
    });
}

export function getPendingExpenseFromCache(
    client: ReturnType<typeof useQueryClient>,
    groupId: string,
    pendingId: string,
) {
    if (!isPendingExpenseId(pendingId)) return null;
    const list = client.getQueryData<any[]>(queryKeys.groupExpenses(groupId)) ?? [];
    return list.find((e) => e.id === pendingId) ?? null;
}
```

- [ ] **Step 7: Run test to pass**

```bash
npx jest __tests__/hooks/useAddExpenseMutation.test.ts __tests__/lib/pendingFollowUps.test.ts
```

Expected: PASS.

- [ ] **Step 8: Type-check + commit**

```bash
npx tsc --noEmit

git add cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts \
        cost-share-app/apps/mobile/lib/pendingFollowUps.ts \
        cost-share-app/apps/mobile/__tests__/hooks/useAddExpenseMutation.test.ts \
        cost-share-app/apps/mobile/__tests__/lib/pendingFollowUps.test.ts \
        cost-share-app/apps/mobile/services/expenses.service.ts
git commit -m "feat(mobile): useAddExpenseMutation with optimistic insert + swap + follow-up drain

Inserts pending_<uuid> row on mutate, swaps for the server row on
success. Idempotent against realtime echoes (no-op if the server row
already landed in the cache). networkMode: online — mutation pauses
cleanly when offline without burning the retry budget. onSuccess drains
the pending-follow-up registry so E4/E5 can chain an edit/delete that
raced an in-flight create. createExpense refactored to throw (not
return null) so onError fires correctly on failure."
```

---

### Task E3: AddExpenseScreen — wire the mutation, render the icon, pending edit-mode

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx` (render `PendingSyncIcon` on each expense row whose id is `pending_*`)

This task has three parts: (1) call `useAddExpenseMutation` from the form's onSubmit, (2) render `PendingSyncIcon` on pending rows in the group detail list, (3) handle the "id starts with `pending_`" branch in `AddExpenseScreen` edit mode.

- [ ] **Step 1: Wire the mutation in `AddExpenseScreen.tsx` add mode**

Open `screens/expenses/AddExpenseScreen.tsx`. Find the `handleSubmit` block (around line 532 onward, where `if (isLoading) return;` is gated). Replace the current create path with:

```tsx
import { useAddExpenseMutation, getPendingExpenseFromCache } from '../../hooks/mutations/useAddExpenseMutation';
import { useQueryClient } from '@tanstack/react-query';
import { isPendingExpenseId } from '../../lib/pendingExpense';

// inside the component body:
const queryClient = useQueryClient();
const addExpense = useAddExpenseMutation(groupId);

const handleSubmit = useCallback(() => {
    if (!isEditMode) {
        addExpense.mutate({ amount, description, currency, /* …rest of form payload */ });
        navigation.goBack();
        return;
    }
    // existing edit-mode path stays for now; pending-edit branch lands below.
}, [/* deps */]);
```

The existing "spin the save button" UX should now hinge on `addExpense.isPending` for the add path. Replace `isLoading` references in the save button binding with `isLoading || addExpense.isPending`.

- [ ] **Step 2: Pending edit-mode — hydrate from queued mutation variables**

In the edit-mode init (the `useEffect` that fetches the expense by id), add a branch at the top:

```tsx
useEffect(() => {
    if (!isEditMode) return;
    if (isPendingExpenseId(routeExpenseId)) {
        const cached = getPendingExpenseFromCache(queryClient, groupId, routeExpenseId);
        if (cached) {
            setAmount(String(cached.amount));
            setDescription(cached.description);
            setCurrency(cached.currency);
            // Hydrate other fields from cached.
            return;
        }
    }
    // existing server-fetch path stays here
}, [isEditMode, routeExpenseId, groupId, queryClient]);
```

Make sure no `expenseLoading` spinner is shown when in pending-edit mode (the data is local).

- [ ] **Step 3: Render `PendingSyncIcon` in the expense list**

In `screens/groups/GroupDetailScreen.tsx`, wherever each expense row renders the amount, add the icon for pending rows. Pseudo-diff:

```tsx
import { PendingSyncIcon, type PendingSyncState } from '../../components/PendingSyncIcon';
import { useNetworkStatus } from '../../lib/networkStatus';
import { isPendingExpenseId } from '../../lib/pendingExpense';
import { useIsMutating } from '@tanstack/react-query';

// inside the list row render function:
const isPending = isPendingExpenseId(expense.id);
const inflight = useIsMutating({ mutationKey: ['addExpense', expense.id] }) > 0;
const online = useNetworkStatus().online;
const state: PendingSyncState = !isPending
    ? 'synced-transient' // not rendered for non-pending
    : expense.pendingFailed
        ? 'failed'
        : inflight
            ? 'syncing'
            : online
                ? 'online-queued'
                : 'offline-waiting';

// render somewhere in the row, e.g., next to the amount:
{isPending && (
    <PendingSyncIcon
        state={state}
        accessibilityLabel="expense not yet synced"
        onPress={state === 'online-queued' ? () => queryClient.resumePausedMutations() : undefined}
    />
)}
```

Add a `useNetworkStatus()` hook to `lib/networkStatus.ts`:

```ts
import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

export function useNetworkStatus() {
    const [online, setOnline] = useState(onlineManager.isOnline());
    useEffect(() => onlineManager.subscribe((next) => setOnline(next)), []);
    return { online };
}
```

(Commit this addition with E3 — small enough not to need its own task.)

- [ ] **Step 4: Failed-state action sheet**

When `state === 'failed'`, tapping the icon should open the platform action sheet with three options: Retry, Edit, Delete. Use React Native's `ActionSheetIOS` on iOS and the existing `WebAlertHost` or `react-native-modal-action-sheet` pattern on Android/web (check the codebase for an existing wrapper before installing anything).

Retry calls `queryClient.resumePausedMutations()` and then a `mutation.retry()`-equivalent: cancel + re-enqueue. Edit navigates to `AddExpenseScreen` with the pending id. Delete is implemented in Task E5.

- [ ] **Step 5: Manual smoke**

1. Online: add an expense. Confirm it appears with `PendingSyncIcon` showing "syncing" briefly, then disappears as the server row arrives.
2. Toggle airplane mode. Add an expense. Confirm icon shows "offline-waiting." Tap — toast "you're offline."
3. Toggle airplane mode off. Confirm auto-sync runs; icon goes through "syncing" → disappears.
4. Pending edit: tap a `pending_*` row. Confirm `AddExpenseScreen` hydrates without fetching. Save edits. Confirm the row updates in place.

- [ ] **Step 6: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 7: Commit**

```bash
git add cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx \
        cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx \
        cost-share-app/apps/mobile/lib/networkStatus.ts
git commit -m "feat(mobile): wire offline add-expense end-to-end through AddExpenseScreen

- AddExpenseScreen.submit uses useAddExpenseMutation (optimistic insert).
- Edit mode with a pending_<uuid> id hydrates from cache, no server fetch.
- GroupDetailScreen renders PendingSyncIcon on pending rows with the
  correct of-the-moment state (offline-waiting/online-queued/syncing/failed).
- Manual sync, edit-while-pending, and delete-while-pending land in later tasks."
```

---

### Task E4: Edit-while-pending — branch on mutation state (paused vs in-flight)

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx`
- Modify: `cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts`

Editing a pending row has two cases depending on the in-queue mutation's state. The right behavior in each case is different:

| Mutation state | What we do | Why |
|---|---|---|
| Paused (offline, hasn't fired) | Cancel + re-enqueue with new payload | No HTTP in flight; safe to drop and replace. Latest user intent wins. |
| Pending (in-flight HTTP) | Let the create finish, register a follow-up `{ kind: 'edit', payload }` so `onSuccess` fires `updateExpense(serverId, payload)` | Can't safely abort mid-call — the server may have already accepted. Chaining is race-proof. |
| Error (failed previous attempt, `pendingFailed: true`) | Cancel + re-enqueue | Same as paused — no in-flight HTTP to worry about. |

We expose two helpers from the mutation module: `cancelPendingAddExpense` (for the paused/error cases) and `resolvePendingEditAction(client, pendingId)` which returns `'cancel-and-reenqueue' | 'chain-follow-up'` so the screen knows what to do.

- [ ] **Step 1: Add helpers to the mutation module**

In `hooks/mutations/useAddExpenseMutation.ts`, export:

```ts
import { type QueryClient } from '@tanstack/react-query';
import { registerPendingFollowUp, type PendingFollowUp } from '../../lib/pendingFollowUps';
import type { UpdateExpenseDto } from '../../services/expenses.service';

export type PendingEditAction = 'cancel-and-reenqueue' | 'chain-follow-up' | 'no-pending-mutation';

export function resolvePendingEditAction(
    client: QueryClient,
    pendingId: string,
): PendingEditAction {
    const mutations = client.getMutationCache().findAll({ mutationKey: addExpenseMutationKey(pendingId) });
    if (mutations.length === 0) return 'no-pending-mutation';
    // Take the most recent — there should only be one but be defensive.
    const m = mutations[mutations.length - 1];
    if (m.state.isPaused) return 'cancel-and-reenqueue';
    if (m.state.status === 'pending') return 'chain-follow-up'; // in-flight
    // status === 'error' (auto-retries exhausted, sitting in failed state) — treat like paused.
    return 'cancel-and-reenqueue';
}

export function cancelPendingAddExpense(
    client: QueryClient,
    groupId: string,
    pendingId: string,
): void {
    client.getMutationCache().findAll({ mutationKey: addExpenseMutationKey(pendingId) }).forEach((m) => {
        m.destroy();
    });
    client.setQueryData<any[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).filter((e) => e.id !== pendingId),
    );
}

export function chainEditFollowUp(
    client: QueryClient,
    groupId: string,
    pendingId: string,
    payload: UpdateExpenseDto,
): void {
    // Update the optimistic row in place so the user sees their edit immediately.
    client.setQueryData<any[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).map((e) => (e.id === pendingId ? { ...e, ...payload } : e)),
    );
    // When the in-flight create resolves with a server id, useAddExpenseMutation.onSuccess
    // will read this and fire updateExpense(serverId, payload).
    registerPendingFollowUp(pendingId, { kind: 'edit', payload } satisfies PendingFollowUp);
}
```

- [ ] **Step 2: Wire the edit-save path in AddExpenseScreen**

In `AddExpenseScreen.tsx`, in `handleSubmit` for edit mode, branch on the resolved action:

```tsx
import {
    cancelPendingAddExpense,
    chainEditFollowUp,
    resolvePendingEditAction,
} from '../../hooks/mutations/useAddExpenseMutation';

// inside handleSubmit:
if (isEditMode && isPendingExpenseId(routeExpenseId)) {
    const payload = { amount, description, currency, /* …rest */ };
    const action = resolvePendingEditAction(queryClient, routeExpenseId);

    if (action === 'chain-follow-up') {
        chainEditFollowUp(queryClient, groupId, routeExpenseId, payload);
        navigation.goBack();
        return;
    }

    // paused / error / no-pending-mutation → cancel + re-enqueue.
    cancelPendingAddExpense(queryClient, groupId, routeExpenseId);
    addExpense.mutate(payload);
    navigation.goBack();
    return;
}
// existing online edit path (server-backed) stays for non-pending ids.
```

Note: in the cancel-and-reenqueue path the new mutation gets a new pendingId (the hook generates one per mount). That's intentional — semantically it's a new attempt.

- [ ] **Step 3: Test both branches**

Extend `__tests__/hooks/useAddExpenseMutation.test.ts`:

```ts
import {
    cancelPendingAddExpense,
    chainEditFollowUp,
    resolvePendingEditAction,
} from '../../hooks/mutations/useAddExpenseMutation';
import { takePendingFollowUp } from '../../lib/pendingFollowUps';

it('cancelPendingAddExpense removes the pending row and destroys the mutation', () => {
    const client = new QueryClient();
    const pendingId = 'pending_e3';
    client.setQueryData(queryKeys.groupExpenses(groupId), [
        { id: pendingId, amount: 5 },
        { id: 'srv-other', amount: 8 },
    ]);
    client.getMutationCache().build(client, {
        mutationKey: ['addExpense', pendingId],
        mutationFn: async () => 'noop',
    });
    expect(client.getMutationCache().findAll({ mutationKey: ['addExpense', pendingId] })).toHaveLength(1);

    cancelPendingAddExpense(client, groupId, pendingId);

    expect(client.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'srv-other', amount: 8 }]);
    expect(client.getMutationCache().findAll({ mutationKey: ['addExpense', pendingId] })).toHaveLength(0);
});

it('resolvePendingEditAction returns chain-follow-up when mutation is in-flight', () => {
    const client = new QueryClient();
    const pendingId = 'pending_inflight';
    // Build + execute a mutation with a never-resolving fn so it sits in pending state.
    const m = client.getMutationCache().build(client, {
        mutationKey: ['addExpense', pendingId],
        mutationFn: () => new Promise(() => {}),
    });
    void m.execute({} as any);
    expect(resolvePendingEditAction(client, pendingId)).toBe('chain-follow-up');
});

it('chainEditFollowUp updates the optimistic row and registers the follow-up', () => {
    const client = new QueryClient();
    const pendingId = 'pending_chain';
    client.setQueryData(queryKeys.groupExpenses(groupId), [
        { id: pendingId, amount: 5, description: 'old' },
    ]);

    chainEditFollowUp(client, groupId, pendingId, { amount: 15, description: 'new' } as any);

    expect(client.getQueryData<any[]>(queryKeys.groupExpenses(groupId))).toEqual([
        { id: pendingId, amount: 15, description: 'new' },
    ]);
    expect(takePendingFollowUp(pendingId)).toEqual({ kind: 'edit', payload: { amount: 15, description: 'new' } });
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/hooks/useAddExpenseMutation.test.ts
```

Expected: PASS (both old and new tests).

- [ ] **Step 5: Manual smoke**

1. Add an expense offline. Open it, edit the amount, save. Confirm the row updates in place and only one mutation is queued.
2. Toggle online. Confirm the latest payload syncs, not the original (paused-then-cancel-and-reenqueue path).
3. Online: add an expense, immediately tap the row before the syncing spinner clears, edit, save. Confirm the row updates in place; in Supabase logs you should see an INSERT followed by an UPDATE on the same row (chain-follow-up path).

- [ ] **Step 6: Commit**

```bash
git add cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts \
        cost-share-app/apps/mobile/screens/expenses/AddExpenseScreen.tsx \
        cost-share-app/apps/mobile/__tests__/hooks/useAddExpenseMutation.test.ts
git commit -m "feat(mobile): edit-while-pending — cancel-and-reenqueue or chain follow-up

Resolves the mutation state at edit-save time. Paused/error → cancel
the queued mutation and re-enqueue with the new payload. In-flight →
register an edit follow-up; useAddExpenseMutation.onSuccess will fire
updateExpense(serverId, newPayload) once the create resolves. Both
paths converge to the latest user intent without racing the server."
```

---

### Task E5: Delete-while-pending — cancel or chain delete follow-up

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx`
- Modify: `cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts`

Like E4, delete-while-pending has two cases:

| Mutation state | What we do |
|---|---|
| Paused / error / no live mutation | `cancelPendingAddExpense` — drop the row locally, never hits the server |
| In-flight | Register a `{ kind: 'delete' }` follow-up; `onSuccess` will fire `deleteExpense(serverId)` once the create resolves |

The list already supports swipe-to-delete (search for `deleteExpense` usage). We branch on the id + mutation state.

- [ ] **Step 1: Add `chainDeleteFollowUp` helper to the mutation module**

In `hooks/mutations/useAddExpenseMutation.ts` (alongside the E4 helpers), export:

```ts
export function chainDeleteFollowUp(
    client: QueryClient,
    groupId: string,
    pendingId: string,
): void {
    // Drop the optimistic row immediately so the user sees the delete.
    client.setQueryData<any[]>(queryKeys.groupExpenses(groupId), (prev) =>
        (prev ?? []).filter((e) => e.id !== pendingId),
    );
    // When the in-flight create resolves with a server id, useAddExpenseMutation.onSuccess
    // will read this and fire deleteExpense(serverId).
    registerPendingFollowUp(pendingId, { kind: 'delete' } satisfies PendingFollowUp);
}
```

- [ ] **Step 2: Find the existing delete path in GroupDetailScreen**

```bash
grep -n "deleteExpense\|onDelete\b" cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx
```

- [ ] **Step 3: Branch in the delete handler**

Wherever `deleteExpense(expense.id)` is invoked, add:

```tsx
import {
    cancelPendingAddExpense,
    chainDeleteFollowUp,
    resolvePendingEditAction,
} from '../../hooks/mutations/useAddExpenseMutation';
import { isPendingExpenseId } from '../../lib/pendingExpense';

// inside handler:
if (isPendingExpenseId(expense.id)) {
    const action = resolvePendingEditAction(queryClient, expense.id);
    if (action === 'chain-follow-up') {
        chainDeleteFollowUp(queryClient, groupId, expense.id);
    } else {
        cancelPendingAddExpense(queryClient, groupId, expense.id);
    }
    return;
}
// existing server delete path
```

- [ ] **Step 4: Test the in-flight branch**

Extend the mutation test:

```ts
import { chainDeleteFollowUp } from '../../hooks/mutations/useAddExpenseMutation';

it('chainDeleteFollowUp drops the optimistic row and registers the follow-up', () => {
    const client = new QueryClient();
    const pendingId = 'pending_chain_del';
    client.setQueryData(queryKeys.groupExpenses(groupId), [
        { id: pendingId, amount: 5 },
        { id: 'srv-keep', amount: 8 },
    ]);

    chainDeleteFollowUp(client, groupId, pendingId);

    expect(client.getQueryData<any[]>(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'srv-keep', amount: 8 }]);
    expect(takePendingFollowUp(pendingId)).toEqual({ kind: 'delete' });
});
```

- [ ] **Step 5: Manual smoke**

1. Add expense offline. Swipe to delete on the pending row. Confirm the row disappears and no network call fires.
2. Go online. Confirm nothing syncs — the mutation was cancelled.
3. Online: add an expense, immediately swipe-delete before the syncing spinner clears. Confirm the row disappears; in Supabase logs you should see an INSERT followed by a DELETE on the same row.

- [ ] **Step 6: Type-check + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts \
        cost-share-app/apps/mobile/screens/groups/GroupDetailScreen.tsx \
        cost-share-app/apps/mobile/__tests__/hooks/useAddExpenseMutation.test.ts
git commit -m "feat(mobile): delete-while-pending — cancel locally or chain follow-up

Mirrors E4's pattern. Paused/error → destroy the queued mutation and
drop the row. In-flight → drop the row immediately and register a
delete follow-up; onSuccess will fire deleteExpense(serverId) once the
create resolves. Net effect: no ghost rows from a race between the
user's delete and the in-flight create."
```

---

### Task E6: Zombie sweep

**Files:**
- Create: `cost-share-app/apps/mobile/lib/zombieSweep.ts`
- Test: `cost-share-app/apps/mobile/__tests__/lib/zombieSweep.test.ts`
- Modify: `cost-share-app/apps/mobile/App.tsx` (register the foreground trigger)
- Modify: `cost-share-app/apps/mobile/hooks/useAppRealtime.ts` (register the post-snapshot trigger)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/zombieSweep.test.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/keys';
import { sweepZombiePendingRows } from '../../lib/zombieSweep';

describe('sweepZombiePendingRows', () => {
    const groupId = 'g1';
    function client() {
        return new QueryClient();
    }

    it('removes a pending row with no matching mutation in the queue', () => {
        const c = client();
        c.setQueryData(queryKeys.groupExpenses(groupId), [
            { id: 'pending_orphan', amount: 1 },
            { id: 'srv-1', amount: 2 },
        ]);
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'srv-1', amount: 2 }]);
        expect(removed).toEqual([{ groupId, pendingId: 'pending_orphan' }]);
    });

    it('keeps a pending row that has a live mutation', () => {
        const c = client();
        c.setQueryData(queryKeys.groupExpenses(groupId), [{ id: 'pending_live', amount: 1 }]);
        c.getMutationCache().build(c, {
            mutationKey: ['addExpense', 'pending_live'],
            mutationFn: async () => 'noop',
        });
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([{ id: 'pending_live' }]);
        expect(removed).toEqual([]);
    });

    it('handles multiple groups independently', () => {
        const c = client();
        c.setQueryData(queryKeys.groupExpenses('g1'), [{ id: 'pending_a' }]);
        c.setQueryData(queryKeys.groupExpenses('g2'), [{ id: 'pending_b' }]);
        // Only pending_a has a live mutation.
        c.getMutationCache().build(c, {
            mutationKey: ['addExpense', 'pending_a'],
            mutationFn: async () => 'noop',
        });
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses('g1'))).toEqual([{ id: 'pending_a' }]);
        expect(c.getQueryData(queryKeys.groupExpenses('g2'))).toEqual([]);
        expect(removed).toEqual([{ groupId: 'g2', pendingId: 'pending_b' }]);
    });
});
```

- [ ] **Step 2: Run to fail**

```bash
npx jest __tests__/lib/zombieSweep.test.ts
```

- [ ] **Step 3: Implement the sweep**

Create `lib/zombieSweep.ts`:

```ts
import { type QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { onlineManager } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries/keys';
import { isPendingExpenseId } from './pendingExpense';
import { SENTRY_TAGS } from './sentryTags';

interface ZombieRecord {
    groupId: string;
    pendingId: string;
}

export function sweepZombiePendingRows(client: QueryClient): ZombieRecord[] {
    const removed: ZombieRecord[] = [];
    // Iterate every cached groupExpenses query.
    const queries = client.getQueryCache().findAll({ queryKey: ['groupExpenses'] });
    for (const q of queries) {
        const data = q.state.data as any[] | undefined;
        if (!data) continue;
        const groupId = q.queryKey[1] as string | undefined;
        if (!groupId) continue;
        const liveKeys = new Set(
            client
                .getMutationCache()
                .findAll({ mutationKey: ['addExpense'] })
                .map((m) => m.options.mutationKey?.[1])
                .filter(Boolean) as string[],
        );
        const next = data.filter((e) => {
            if (!isPendingExpenseId(e.id)) return true;
            if (liveKeys.has(e.id)) return true;
            removed.push({ groupId, pendingId: e.id });
            return false;
        });
        if (next.length !== data.length) {
            client.setQueryData(queryKeys.groupExpenses(groupId), next);
        }
    }

    for (const record of removed) {
        Sentry.captureMessage('zombie pending row removed', {
            level: 'warning',
            tags: { tag: SENTRY_TAGS.SWEEP_ZOMBIE },
            extra: record,
        });
    }
    return removed;
}

export function sweepIfOnline(client: QueryClient): void {
    if (!onlineManager.isOnline()) return;
    sweepZombiePendingRows(client);
}
```

- [ ] **Step 4: Run test to pass**

```bash
npx jest __tests__/lib/zombieSweep.test.ts
```

- [ ] **Step 5: Wire triggers**

(a) **Post-snapshot trigger in `useAppRealtime.ts`** — at the end of `snapshotRefetch()`, after the existing invalidations, add:

```ts
import { sweepIfOnline } from '../lib/zombieSweep';
// …
sweepIfOnline(queryClient);
```

(b) **Mutation-drain trigger** — in `useAddExpenseMutation.ts` `onSuccess`, after the swap, add:

```ts
import { sweepIfOnline } from '../../lib/zombieSweep';
// at the end of onSuccess:
sweepIfOnline(client);
```

(c) **Foreground trigger** — extend the existing `AppState` listener in `App.tsx` (the one that already calls `guardSession()` on active):

```tsx
import { sweepIfOnline } from './lib/zombieSweep';
import { queryClient } from './lib/queryClient';
// …
useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
            void guardSession();
            sweepIfOnline(queryClient);
        }
    });
    return () => sub.remove();
}, [guardSession]);
```

- [ ] **Step 6: Manual smoke (zombie scenario)**

To force a zombie: in dev, add an expense offline, then artificially drop the mutation from the cache via the React Query devtools (or by killing the app *after* the server has accepted the row but *before* `onSuccess` runs — easier said than done; if you can't reproduce manually, trust the unit test).

- [ ] **Step 7: Type-check + tests**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
npx jest
```

- [ ] **Step 8: Commit**

```bash
git add cost-share-app/apps/mobile/lib/zombieSweep.ts \
        cost-share-app/apps/mobile/__tests__/lib/zombieSweep.test.ts \
        cost-share-app/apps/mobile/App.tsx \
        cost-share-app/apps/mobile/hooks/useAppRealtime.ts \
        cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts
git commit -m "feat(mobile): zombie-sweep safety net for orphan pending_<uuid> rows

Removes any pending_<uuid> expense in the cache that has no live
mutation in the queue. Triggers: snapshot-refetch success, mutation
drain, app foreground while online. Each removal fires a Sentry
warning with breadcrumb context so we can investigate the upstream
cause."
```

---

### Task E7: Manual-retry policy + failure state UI

**Files:**
- Modify: `cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts`

Add an explicit retry policy: up to 3 auto-retries with exponential backoff for transient errors, no retry on 4xx (except 408/429). On exhaustion, `pendingFailed: true` is set (already done in E2's `onError`) and the row stays — the user retries manually via the `failed` icon.

- [ ] **Step 1: Add retry option**

Modify `useAddExpenseMutation` to include:

```ts
retry: (failureCount, error: any) => {
    if (failureCount >= 3) return false;
    const status = error?.status ?? error?.response?.status;
    if (typeof status === 'number') {
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
        }
    }
    return true;
},
retryDelay: (attemptIndex) => Math.min(2000 * 4 ** attemptIndex, 30_000),
```

- [ ] **Step 2: Type-check + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
git add cost-share-app/apps/mobile/hooks/mutations/useAddExpenseMutation.ts
git commit -m "feat(mobile): add-expense retry policy — 3 attempts, exp backoff, 4xx is permanent

Auto-retries transient errors up to 3 times (2s/8s/32s capped at 30s).
4xx errors (except 408/429) are permanent, so we fail fast and surface
the failed state for manual retry via PendingSyncIcon."
```

---

## Phase F — Hardening + verification

### Task F1: Sentry capture in persister write/read paths

**Files:**
- Modify: `cost-share-app/apps/mobile/lib/persistQueryClient.ts`

The `createAsyncStoragePersister` is configured already; it swallows errors internally. We add explicit captures around `restoreClient` (done in A5) and around the persister's write callback. The persister exposes a `persistClient` option in v5 — instead of relying on internal error handling we add a wrapper that intercepts:

- [ ] **Step 1: Wrap the persister's `persistClient` to capture errors**

In `lib/persistQueryClient.ts`, replace the bare `createAsyncStoragePersister(...)` call with:

```ts
const rawPersister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: PERSIST_STORAGE_KEY,
    throttleTime: 1000,
});

activePersister = {
    persistClient: async (client) => {
        try {
            await rawPersister.persistClient(client);
        } catch (err) {
            Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.CACHE_PERSIST } });
        }
    },
    restoreClient: async () => {
        try {
            return await rawPersister.restoreClient();
        } catch (err) {
            Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.CACHE_REHYDRATE } });
            return undefined;
        }
    },
    removeClient: async () => {
        try {
            await rawPersister.removeClient();
        } catch (err) {
            Sentry.captureException(err, { tags: { tag: SENTRY_TAGS.CACHE_PERSIST } });
        }
    },
};
```

(Adjust the surrounding code so the `persistQueryClient` call uses `activePersister`.)

- [ ] **Step 2: Type-check + commit**

```bash
cd cost-share-app/apps/mobile
npx tsc --noEmit
git add cost-share-app/apps/mobile/lib/persistQueryClient.ts
git commit -m "feat(mobile): capture persister read/write errors to Sentry

Wraps the AsyncStorage-backed persister to send any persistClient /
restoreClient / removeClient failure to Sentry under cache.persist or
cache.rehydrate. Production never silently loses cache writes."
```

---

### Task F2: Manual end-to-end verification plan

**Files:**
- None modified; this task is the test plan a human runs against a dev build.

- [ ] **Step 1: Cold-start with cache rehydrate**

1. Sign in. Open at least three groups. Add an expense in one of them online.
2. Force-quit the app.
3. Reopen. Time the gap between tap and first usable screen. Expected: groups list renders from disk in <500ms with no white spinner; the previously-opened groups also render their detail from cache when tapped, before any network call resolves.

- [ ] **Step 2: Reopen while offline**

1. Quit the app. Toggle airplane mode on.
2. Reopen. Expected: groups list, group detail, expenses all render from disk; no spinner; no errors.
3. Toggle airplane mode off. Expected: realtime channels resubscribe; snapshot refetch reconciles; any new data appears silently.

- [ ] **Step 3: Offline add-expense end-to-end**

1. Airplane mode on. Add an expense in a group.
2. Expected: row appears immediately with `PendingSyncIcon` in `offline-waiting` state.
3. Tap the icon — toast "you're offline."
4. Tap the row to edit. Confirm form hydrates without spinner. Change the amount. Save. Confirm row updates in place.
5. Swipe to delete on a different pending expense. Confirm it disappears.
6. Airplane mode off. Watch the icon transition: `online-queued` → `syncing` (briefly) → disappear.
7. Confirm the expense is on the server (open from another device, or check the database).

- [ ] **Step 4: Forced failure path**

1. In dev, point `EXPO_PUBLIC_SUPABASE_URL` at a dead host to force createExpense to fail with a network error.
2. Add an expense online. Expected: 3 retries with backoff; after ~32s the icon turns `failed`.
3. Restore the URL. Tap the failed icon → action sheet. Tap Retry. Expected: another mutation attempt fires.

- [ ] **Step 5: Sentry signal review**

1. Open the dev Sentry project. Confirm no spurious errors during the normal flows (offline, reopen, etc.).
2. After Step 4's induced failure, confirm a `mutation.offline_add` warning event appears with breadcrumbs showing the network transitions and retry attempts.

- [ ] **Step 6: Document the verification**

Append a short verification log to the spec or to a follow-up note. No commit needed unless the log is checked in.

- [ ] **Step 7: Final cleanup commit (if any miscellaneous fixes surfaced)**

```bash
# only if anything changed during verification:
git add -p
git commit -m "fix(mobile): verification-pass adjustments to <area>"
```

---

## Self-review checklist (done before handing off)

1. **Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Persistence layer | A5, A6, A7, F1 |
| Trust-realtime config | D1 + per-query overrides in B1, C1, C2 |
| Skeletons | D2, D3, D4 |
| Move groups/expenses/messages to RQ | B1, B4, C1, C2, C4, C5 |
| Realtime handlers idempotent + setQueryData | B2, B5, C3 |
| Per-group snapshot-refetch on SUBSCRIBED | C3 |
| Offline add (optimistic insert + swap) | E2 |
| Edit while pending | E4 |
| Delete while pending | E5 |
| Per-row sync icon, 5 states | E1, E3 |
| Manual sync (tap to resume) | E3 |
| Mutation persistence to AsyncStorage | A5 (`shouldDehydrateMutation`) |
| Pause-on-offline + resume on online | A4 + E2 (`networkMode: 'online'`) |
| Chain follow-up for edit/delete vs in-flight create | E2 (registry + drain in onSuccess), E4 (edit), E5 (delete) |
| createExpense throws on failure | E2 Step 1 |
| Zustand slices (groups/expenses/groupMessages) fully deleted | B5, C5 |
| Zombie sweep | E6 |
| Retry policy (3x, exp backoff, 4xx permanent) | E7 |
| Sentry tag taxonomy | A2 |
| Sentry capture: persist/rehydrate failures | A5, F1 |
| Sentry capture: realtime errors | B2, C3 |
| Sentry capture: mutation cleanup failure | E2 |
| Sentry capture: chain-follow-up failure | E2 (onSuccess drain) |
| Sentry capture: zombie removal | E6 |
| Sentry breadcrumbs: network transitions | A4 |
| Cache busting (app+schema only — userId NOT in buster) | A5 |
| Wipe on sign-in + sign-out (user isolation) | A7 |
| Allowlist | A5 |
| AddExpenseScreen pending-id hydrate path | E3 |

2. **Placeholders:** none. All steps include actual code and exact commands.

3. **Type consistency:**

- `pending_<uuid>` format and `addExpenseMutationKey` shape are defined in A3 and consumed verbatim in E2, E4, E5, E6.
- `SENTRY_TAGS` constants defined in A2 and referenced verbatim in A4, A5, B2, C3, E2, E6, F1.
- `applyGroupsRealtimeEventToCache` / `applyExpensesRealtimeEventToCache` signatures defined in B2 and C3 and consumed in their respective hook bodies.
- `sweepIfOnline` defined in E6 and consumed in App.tsx, useAppRealtime, useAddExpenseMutation — all three sites use the same signature.
- `PendingFollowUp` type defined in E2 Step 5 and consumed by `chainEditFollowUp` (E4) + `chainDeleteFollowUp` (E5) + `useAddExpenseMutation.onSuccess` drain (E2 Step 6).
- `resolvePendingEditAction` defined in E4 Step 1 and consumed by AddExpenseScreen edit handler (E4 Step 2) and GroupDetailScreen delete handler (E5 Step 3).

4. **Scope check:** five layers, one cohesive plan. Each phase produces a working state and a clean commit history. Phase boundaries are natural review checkpoints if executing via subagent-driven development.
