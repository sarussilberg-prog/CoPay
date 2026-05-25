# Tab Navigation Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish consistent tab navigation — tab memory on first press, pop-to-root on re-press, and clean stack reset on all cross-tab jumps.

**Architecture:** Centralized helpers in `navigation/` dispatch nested stack `state` via `CommonActions.navigate` for cross-tab entry; `createTabPopToTopListener` uses `StackActions.popToTop` with nested `target` for tab re-press. All cross-tab call sites migrate to helpers; in-tab `navigation.navigate` stays unchanged.

**Tech Stack:** React Navigation 7 (`@react-navigation/native` ^7, `@react-navigation/bottom-tabs` ^7, `@react-navigation/native-stack` ^7), Jest + `@testing-library/react-native`.

**SRS mapping:** REQ-PROF-04, REQ-GRP-01, REQ-GRP-03.

**Design spec:** [docs/superpowers/specs/2026-05-23-tab-navigation-reset-design.md](../specs/2026-05-23-tab-navigation-reset-design.md)

**Run all tests:** `cd cost-share-app/apps/mobile && npm test`

**Run navigation tests:** `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `navigation/types.ts` | Tab names, nested screen names, param types, `NavigationRoute` shape |
| `navigation/nestedStackDispatch.ts` | Low-level `resetNestedTabStack(navigation, tabName, routes)` |
| `navigation/tabNavigation.ts` | `createTabPopToTopListener(rootScreen)` for tab re-press |
| `navigation/groupsTabNavigation.ts` | `openGroupDetail`, `openGroupsList`, `openCreateGroup`, `openExpenseDetail` |
| `navigation/profileTabNavigation.ts` | `openFindFriends`, `openFriends` |
| `navigation/AppNavigator.tsx` | Replace `tabPopToTopOnPress` with `createTabPopToTopListener` |
| `__tests__/navigation/nestedStackDispatch.test.ts` | Dispatch payload tests |
| `__tests__/navigation/tabNavigation.test.ts` | Tab listener behavior |
| `__tests__/navigation/groupsTabNavigation.test.ts` | Groups helper payloads |
| `__tests__/navigation/profileTabNavigation.test.ts` | Profile helper payloads |

---

## Phase 1: Core dispatch utilities

### Task 1: Navigation types

**Files:**
- Create: `cost-share-app/apps/mobile/navigation/types.ts`

- [ ] **Step 1: Create types file**

```typescript
/** Root tab names */
export type RootTabName = 'Profile' | 'Activity' | 'Groups';

/** Groups stack screen names */
export type GroupsScreenName =
    | 'GroupsList'
    | 'GroupDetail'
    | 'CreateGroup'
    | 'EditGroup'
    | 'GroupMembers'
    | 'GroupNote'
    | 'ExpenseList'
    | 'AddExpense'
    | 'EditExpense'
    | 'ExpenseDetail'
    | 'Balances'
    | 'SettleUpList'
    | 'SettlementHistory';

/** Profile stack screen names */
export type ProfileScreenName =
    | 'ProfileMain'
    | 'EditProfile'
    | 'Settings'
    | 'Friends'
    | 'FindFriends';

export type GroupsListParams = {
    balanceState?: 'unsettled' | 'settled';
    showArchived?: boolean;
};

export type GroupDetailParams = { groupId: string };

export type CreateGroupParams = { initialMembers?: unknown[] };

export type ExpenseDetailParams = { expenseId: string; groupId: string };

export type NavigationRoute<
    Name extends string = string,
    Params extends object | undefined = undefined,
> = Params extends undefined
    ? { name: Name }
    : { name: Name; params: Params };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd cost-share-app/apps/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors referencing `navigation/types.ts`

---

### Task 2: Nested stack dispatch helper

**Files:**
- Create: `cost-share-app/apps/mobile/navigation/nestedStackDispatch.ts`
- Create: `cost-share-app/apps/mobile/__tests__/navigation/nestedStackDispatch.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { CommonActions } from '@react-navigation/native';
import { resetNestedTabStack } from '../../navigation/nestedStackDispatch';
import type { RootTabName } from '../../navigation/types';

describe('resetNestedTabStack', () => {
    it('dispatches navigate with nested state for a single root route', () => {
        const dispatch = jest.fn();
        const navigation = { dispatch } as any;

        resetNestedTabStack(navigation, 'Groups' as RootTabName, [
            { name: 'GroupsList' },
        ]);

        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [{ name: 'GroupsList' }],
                        index: 0,
                    },
                },
            }),
        );
    });

    it('dispatches nested state with index pointing at deepest route', () => {
        const dispatch = jest.fn();
        const navigation = { dispatch } as any;

        resetNestedTabStack(navigation, 'Groups' as RootTabName, [
            { name: 'GroupsList' },
            { name: 'GroupDetail', params: { groupId: 'g1' } },
        ]);

        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [
                            { name: 'GroupsList' },
                            { name: 'GroupDetail', params: { groupId: 'g1' } },
                        ],
                        index: 1,
                    },
                },
            }),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/nestedStackDispatch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```typescript
import { CommonActions, NavigationProp, ParamListBase } from '@react-navigation/native';
import type { NavigationRoute, RootTabName } from './types';

export function resetNestedTabStack(
    navigation: NavigationProp<ParamListBase>,
    tabName: RootTabName,
    routes: NavigationRoute[],
): void {
    navigation.dispatch(
        CommonActions.navigate({
            name: tabName,
            params: {
                state: {
                    routes,
                    index: routes.length - 1,
                },
            },
        }),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/nestedStackDispatch.test.ts`
Expected: PASS (2 tests)

---

### Task 3: Tab pop-to-top listener

**Files:**
- Create: `cost-share-app/apps/mobile/navigation/tabNavigation.ts`
- Create: `cost-share-app/apps/mobile/__tests__/navigation/tabNavigation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { StackActions } from '@react-navigation/native';
import { createTabPopToTopListener } from '../../navigation/tabNavigation';

function makeFixture({
    isFocused,
    focusedRouteName,
    stackKey,
}: {
    isFocused: boolean;
    focusedRouteName: string;
    stackKey?: string;
}) {
    const preventDefault = jest.fn();
    const dispatch = jest.fn();
    const navigation = {
        isFocused: () => isFocused,
        dispatch,
    };
    const route = {
        name: 'Groups',
        state: stackKey ? { key: stackKey, routes: [{ name: 'GroupsList' }, { name: focusedRouteName }] } : undefined,
    };
    const listener = createTabPopToTopListener('GroupsList');
    const handlers = listener({ navigation: navigation as any, route: route as any });
    return { handlers, preventDefault, dispatch, navigation, route };
}

describe('createTabPopToTopListener', () => {
    it('does nothing when tab is not focused (switching from another tab)', () => {
        const { handlers, preventDefault, dispatch } = makeFixture({
            isFocused: false,
            focusedRouteName: 'GroupDetail',
            stackKey: 'stack-1',
        });

        handlers.tabPress({ preventDefault });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('does nothing when already at root screen', () => {
        const { handlers, preventDefault, dispatch } = makeFixture({
            isFocused: true,
            focusedRouteName: 'GroupsList',
            stackKey: 'stack-1',
        });

        handlers.tabPress({ preventDefault });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('pops nested stack to top when tab is focused and not at root', () => {
        const { handlers, preventDefault, dispatch } = makeFixture({
            isFocused: true,
            focusedRouteName: 'GroupDetail',
            stackKey: 'stack-1',
        });

        handlers.tabPress({ preventDefault });

        expect(preventDefault).toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledWith({
            ...StackActions.popToTop(),
            target: 'stack-1',
        });
    });

    it('falls back to navigate root when nested stack key is missing', () => {
        const preventDefault = jest.fn();
        const dispatch = jest.fn();
        const navigation = { isFocused: () => true, dispatch, navigate: jest.fn() };
        const route = { name: 'Groups', state: undefined };
        const listener = createTabPopToTopListener('GroupsList');
        const handlers = listener({ navigation: navigation as any, route: route as any });

        handlers.tabPress({ preventDefault });

        expect(preventDefault).toHaveBeenCalled();
        expect(navigation.navigate).toHaveBeenCalledWith('Groups', { screen: 'GroupsList' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/tabNavigation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement listener**

```typescript
import { StackActions } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, type ParamListBase, type RouteProp } from '@react-navigation/native';

export function createTabPopToTopListener(initialScreen: string) {
    return ({
        navigation,
        route,
    }: {
        navigation: BottomTabNavigationProp<ParamListBase>;
        route: RouteProp<ParamListBase>;
    }) => ({
        tabPress: (e: { preventDefault: () => void }) => {
            if (!navigation.isFocused()) return;

            const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? initialScreen;
            if (focusedRouteName === initialScreen) return;

            e.preventDefault();

            const stackKey = route.state?.key;
            if (stackKey) {
                navigation.dispatch({
                    ...StackActions.popToTop(),
                    target: stackKey,
                });
                return;
            }

            navigation.navigate(route.name, { screen: initialScreen });
        },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/tabNavigation.test.ts`
Expected: PASS (4 tests)

---

## Phase 2: Tab-specific cross-tab helpers

### Task 4: Groups tab navigation helpers

**Files:**
- Create: `cost-share-app/apps/mobile/navigation/groupsTabNavigation.ts`
- Create: `cost-share-app/apps/mobile/__tests__/navigation/groupsTabNavigation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { CommonActions } from '@react-navigation/native';
import {
    openCreateGroup,
    openExpenseDetail,
    openGroupDetail,
    openGroupsList,
} from '../../navigation/groupsTabNavigation';

const dispatch = jest.fn();
const navigation = { dispatch } as any;

beforeEach(() => dispatch.mockClear());

describe('groupsTabNavigation', () => {
    it('openGroupDetail resets to GroupsList + GroupDetail', () => {
        openGroupDetail(navigation, 'g1');
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [
                            { name: 'GroupsList' },
                            { name: 'GroupDetail', params: { groupId: 'g1' } },
                        ],
                        index: 1,
                    },
                },
            }),
        );
    });

    it('openGroupsList resets to filtered GroupsList root', () => {
        openGroupsList(navigation, { balanceState: 'unsettled', showArchived: true });
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [{
                            name: 'GroupsList',
                            params: { balanceState: 'unsettled', showArchived: true },
                        }],
                        index: 0,
                    },
                },
            }),
        );
    });

    it('openCreateGroup resets to GroupsList + CreateGroup', () => {
        const friend = { id: 'u2', name: 'Bob' };
        openCreateGroup(navigation, { initialMembers: [friend] });
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [
                            { name: 'GroupsList' },
                            { name: 'CreateGroup', params: { initialMembers: [friend] } },
                        ],
                        index: 1,
                    },
                },
            }),
        );
    });

    it('openExpenseDetail resets to GroupsList + GroupDetail + ExpenseDetail', () => {
        openExpenseDetail(navigation, { expenseId: 'e1', groupId: 'g1' });
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Groups',
                params: {
                    state: {
                        routes: [
                            { name: 'GroupsList' },
                            { name: 'GroupDetail', params: { groupId: 'g1' } },
                            { name: 'ExpenseDetail', params: { expenseId: 'e1', groupId: 'g1' } },
                        ],
                        index: 2,
                    },
                },
            }),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/groupsTabNavigation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement helpers**

```typescript
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import { resetNestedTabStack } from './nestedStackDispatch';
import type {
    CreateGroupParams,
    ExpenseDetailParams,
    GroupsListParams,
} from './types';

export function openGroupDetail(
    navigation: NavigationProp<ParamListBase>,
    groupId: string,
): void {
    resetNestedTabStack(navigation, 'Groups', [
        { name: 'GroupsList' },
        { name: 'GroupDetail', params: { groupId } },
    ]);
}

export function openGroupsList(
    navigation: NavigationProp<ParamListBase>,
    params: GroupsListParams,
): void {
    resetNestedTabStack(navigation, 'Groups', [
        { name: 'GroupsList', params },
    ]);
}

export function openCreateGroup(
    navigation: NavigationProp<ParamListBase>,
    params: CreateGroupParams,
): void {
    resetNestedTabStack(navigation, 'Groups', [
        { name: 'GroupsList' },
        { name: 'CreateGroup', params },
    ]);
}

export function openExpenseDetail(
    navigation: NavigationProp<ParamListBase>,
    params: ExpenseDetailParams,
): void {
    resetNestedTabStack(navigation, 'Groups', [
        { name: 'GroupsList' },
        { name: 'GroupDetail', params: { groupId: params.groupId } },
        { name: 'ExpenseDetail', params },
    ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/groupsTabNavigation.test.ts`
Expected: PASS (4 tests)

---

### Task 5: Profile tab navigation helpers

**Files:**
- Create: `cost-share-app/apps/mobile/navigation/profileTabNavigation.ts`
- Create: `cost-share-app/apps/mobile/__tests__/navigation/profileTabNavigation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { CommonActions } from '@react-navigation/native';
import { openFindFriends, openFriends } from '../../navigation/profileTabNavigation';

const dispatch = jest.fn();
const navigation = { dispatch } as any;

beforeEach(() => dispatch.mockClear());

describe('profileTabNavigation', () => {
    it('openFindFriends resets to ProfileMain + FindFriends', () => {
        openFindFriends(navigation);
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Profile',
                params: {
                    state: {
                        routes: [
                            { name: 'ProfileMain' },
                            { name: 'FindFriends' },
                        ],
                        index: 1,
                    },
                },
            }),
        );
    });

    it('openFriends resets to ProfileMain + Friends', () => {
        openFriends(navigation);
        expect(dispatch).toHaveBeenCalledWith(
            CommonActions.navigate({
                name: 'Profile',
                params: {
                    state: {
                        routes: [
                            { name: 'ProfileMain' },
                            { name: 'Friends' },
                        ],
                        index: 1,
                    },
                },
            }),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/profileTabNavigation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement helpers**

```typescript
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import { resetNestedTabStack } from './nestedStackDispatch';

export function openFindFriends(navigation: NavigationProp<ParamListBase>): void {
    resetNestedTabStack(navigation, 'Profile', [
        { name: 'ProfileMain' },
        { name: 'FindFriends' },
    ]);
}

export function openFriends(navigation: NavigationProp<ParamListBase>): void {
    resetNestedTabStack(navigation, 'Profile', [
        { name: 'ProfileMain' },
        { name: 'Friends' },
    ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/profileTabNavigation.test.ts`
Expected: PASS (2 tests)

---

## Phase 3: Wire AppNavigator

### Task 6: Replace tab listeners in AppNavigator

**Files:**
- Modify: `cost-share-app/apps/mobile/navigation/AppNavigator.tsx`

- [ ] **Step 1: Remove old `tabPopToTopOnPress` function (lines 88–107)**

- [ ] **Step 2: Add import**

```typescript
import { createTabPopToTopListener } from './tabNavigation';
```

- [ ] **Step 3: Replace listeners on all three Tab.Screen entries**

```typescript
<Tab.Screen
    name="Profile"
    component={ProfileStack}
    listeners={createTabPopToTopListener('ProfileMain')}
    ...
/>
<Tab.Screen
    name="Activity"
    component={ActivityStack}
    listeners={createTabPopToTopListener('ActivityFeed')}
    ...
/>
<Tab.Screen
    name="Groups"
    component={GroupsStack}
    listeners={createTabPopToTopListener('GroupsList')}
    ...
/>
```

- [ ] **Step 4: Run full test suite**

Run: `cd cost-share-app/apps/mobile && npm test`
Expected: all tests PASS (no regressions)

---

## Phase 4: Migrate call sites

### Task 7: ProfileScreen cross-tab navigation

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/ProfileScreen.tsx`

- [ ] **Step 1: Add import**

```typescript
import { openGroupDetail, openGroupsList } from '../../navigation/groupsTabNavigation';
```

- [ ] **Step 2: Replace `handleSelectGroup`**

```typescript
const handleSelectGroup = useCallback((groupId: string) => {
    setSelectedFriend(null);
    openGroupDetail(navigation, groupId);
}, [navigation]);
```

- [ ] **Step 3: Replace stat tile onPress handlers**

```typescript
onPress={() =>
    openGroupsList(navigation, { balanceState: 'unsettled', showArchived: true })
}
// ...
onPress={() =>
    openGroupsList(navigation, { balanceState: 'settled', showArchived: true })
}
```

- [ ] **Step 4: Run ProfileScreen tests**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/screens/profile/ProfileScreen.test.tsx`
Expected: PASS

---

### Task 8: FriendsScreen cross-tab navigation

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/profile/FriendsScreen.tsx`

- [ ] **Step 1: Add import and replace `handleCreateGroupWith`**

```typescript
import { openCreateGroup } from '../../navigation/groupsTabNavigation';

const handleCreateGroupWith = useCallback(
    (friend: User) => {
        setActionsFor(null);
        openCreateGroup(navigation, { initialMembers: [friend] });
    },
    [navigation],
);
```

- [ ] **Step 2: Run any FriendsScreen tests if present, else full suite**

Run: `cd cost-share-app/apps/mobile && npm test`
Expected: PASS

---

### Task 9: ActivityFeedScreen cross-tab navigation

**Files:**
- Modify: `cost-share-app/apps/mobile/screens/activity/ActivityFeedScreen.tsx`

- [ ] **Step 1: Add import**

```typescript
import { openExpenseDetail, openGroupDetail } from '../../navigation/groupsTabNavigation';
```

- [ ] **Step 2: Replace `handleActivityPress`**

```typescript
const handleActivityPress = useCallback(
    (activity: RecentActivity) => {
        if (activity.activityType === 'expense') {
            openExpenseDetail(navigation, {
                expenseId: activity.id,
                groupId: activity.groupId,
            });
            return;
        }
        if (
            activity.activityType === 'message' ||
            activity.activityType === 'settlement'
        ) {
            openGroupDetail(navigation, activity.groupId);
        }
    },
    [navigation],
);
```

- [ ] **Step 3: Run full test suite**

Run: `cd cost-share-app/apps/mobile && npm test`
Expected: PASS

---

### Task 10: Deep links and AddMembersSheet

**Files:**
- Modify: `cost-share-app/apps/mobile/services/deepLinks.service.ts`
- Modify: `cost-share-app/apps/mobile/components/AddMembersSheet.tsx`

- [ ] **Step 1: Update deepLinks.service.ts imports and calls**

```typescript
import { openGroupDetail } from '../navigation/groupsTabNavigation';
import { openFriends } from '../navigation/profileTabNavigation';

// friend branch:
openFriends(navigation);

// group branch:
openGroupDetail(navigation, payload.group_id);
```

- [ ] **Step 2: Update AddMembersSheet.tsx**

```typescript
import { openFindFriends } from '../navigation/profileTabNavigation';

// replace navigate call:
openFindFriends(navigation);
```

- [ ] **Step 3: Run deep link tests if present**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/services/deepLinks.service.test.ts 2>/dev/null || npm test`
Expected: PASS

---

## Phase 5: Verification & manual QA

### Task 11: Full regression + manual checklist

- [ ] **Step 1: Run full test suite**

Run: `cd cost-share-app/apps/mobile && npm test`
Expected: all tests PASS

- [ ] **Step 2: Run navigation test folder**

Run: `cd cost-share-app/apps/mobile && npm test -- __tests__/navigation/`
Expected: PASS (12 tests total across 4 files)

- [ ] **Step 3: Manual QA checklist**

| # | Steps | Expected |
|---|-------|----------|
| 1 | Profile → tap friend → select group | Groups tab opens at GroupDetail; back → GroupsList |
| 2 | After step 1 → Profile tab → Groups tab (1st press) | GroupDetail visible |
| 3 | Groups tab (2nd press) | GroupsList (root) |
| 4 | Groups → GroupDetail → ExpenseDetail → Profile tab → Profile friend → different group | Stack is [GroupsList, GroupDetail] only; no ExpenseDetail in back stack |
| 5 | Profile → active groups stat tile | GroupsList with unsettled filter |
| 6 | Activity → tap expense | Groups tab at ExpenseDetail; back → GroupDetail → GroupsList |
| 7 | Group → AddMembers → Find friends | Profile tab at FindFriends; back → ProfileMain |

---

## Spec coverage self-review

| Spec requirement | Plan task |
|------------------|-----------|
| Tab memory (B) — first press preserves stack | Task 3, 6 — listener no-op when `!isFocused()` |
| Tab re-press → root | Task 3, 6 — `StackActions.popToTop` |
| Cross-tab Groups reset shapes | Tasks 4, 7, 8, 9, 10 |
| Cross-tab Profile reset shapes | Task 5, 10 |
| All 3 tabs get fixed listeners | Task 6 |
| Unit tests for helpers + listener | Tasks 2, 3, 4, 5 |
| Screen/deep link migration | Tasks 7–10 |
| Manual success criteria | Task 11 |

No placeholder gaps found.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-tab-navigation-reset.md`.

Design spec saved to `docs/superpowers/specs/2026-05-23-tab-navigation-reset-design.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach do you want?
