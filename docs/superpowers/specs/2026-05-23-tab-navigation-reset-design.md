# Tab Navigation Reset — Design Spec

Date: 2026-05-23  
Branch: dev  
Status: **approved by user (brainstorming), pending implementation**

## Goal

Fix broken and unpredictable navigation when moving between tabs — especially Profile → Groups cross-tab jumps — by establishing a consistent, testable navigation infrastructure.

Users should experience:

1. **Tab memory (B):** First tap on a tab shows the last screen on that tab's stack; a second tap on the **same already-focused tab** pops to that tab's root.
2. **Clean cross-tab jumps (C + reset):** Navigating to another tab from Profile, Activity, deep links, or sheets switches tabs with a clear transition **and** resets the target tab's stack to a well-defined shape (no stale history).
3. **Predictable back behavior:** Back from a cross-tab destination always follows the freshly reset stack — never surfaces screens from a previous session.

---

## Locked decisions (from brainstorming)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Tab re-press behavior | **B — tab memory:** first press preserves stack; second press on focused tab → root |
| 2 | Cross-tab Groups transition | **C — switch tab** with built-in tab animation; mess was caused by stack pollution, not missing animation |
| 3 | Cross-tab stack on entry | **Full reset:** replace target tab stack with explicit routes for the current intent |
| 4 | Scope | All three tabs get fixed `popToTop` listeners; Groups + Profile get cross-tab reset helpers |
| 5 | Implementation approach | Centralized helpers + `CommonActions` / nested `state` (no global `navigationRef`, no root-stack refactor) |

---

## Problem analysis

### Current architecture

```
Tab.Navigator
├── Profile → ProfileStack (root: ProfileMain)
├── Activity → ActivityStack (root: ActivityFeed)
└── Groups → GroupsStack (root: GroupsList)
```

Cross-tab calls use bare `navigation.navigate('Groups', { screen, params })`, which **merges** onto existing nested stack history.

### `tabPopToTopOnPress` bugs

```typescript
// AppNavigator.tsx — current
if (!navigation.isFocused()) return;  // skips when switching FROM another tab
navigation.navigate(route.name, { screen: initialScreen }); // merge, not pop
```

This causes:

- Inverted double-tap behavior (first press ≠ stack top; second press ≠ root)
- Stale screens remaining under cross-tab destinations
- "Messy screens" when opening a group from Profile

---

## Architecture

```
navigation/
  types.ts                  — Param lists + stack route shapes
  tabNavigation.ts          — createTabPopToTopListener (all tabs)
  groupsTabNavigation.ts    — reset + navigate to Groups tab
  profileTabNavigation.ts   — reset + navigate to Profile tab
  AppNavigator.tsx          — wire listeners (minimal)
```

### Cross-tab reset mechanism

Use React Navigation 7 nested `state` on tab navigate — sets the child stack atomically:

```typescript
navigation.dispatch(
  CommonActions.navigate({
    name: 'Groups',
    params: {
      state: {
        routes: [
          { name: 'GroupsList' },
          { name: 'GroupDetail', params: { groupId } },
        ],
        index: 1,
      },
    },
  }),
);
```

### Tab re-press pop-to-top

When tab is already focused and nested route ≠ root:

```typescript
e.preventDefault();
navigation.dispatch({
  ...StackActions.popToTop(),
  target: route.state?.key, // nested stack navigator key
});
```

---

## Stack shapes (Groups tab)

| Entry point | Helper | Stack after reset |
|-------------|--------|-------------------|
| Profile → friend → group | `openGroupDetail(navigation, groupId)` | `[GroupsList, GroupDetail]` |
| Profile → active groups stat | `openGroupsList(navigation, { balanceState: 'unsettled', showArchived: true })` | `[GroupsList(params)]` |
| Profile → closed groups stat | `openGroupsList(navigation, { balanceState: 'settled', showArchived: true })` | `[GroupsList(params)]` |
| Friends → create group with friend | `openCreateGroup(navigation, { initialMembers })` | `[GroupsList, CreateGroup(params)]` |
| Activity → expense tap | `openExpenseDetail(navigation, { expenseId, groupId })` | `[GroupsList, GroupDetail, ExpenseDetail]` |
| Activity → message/settlement tap | `openGroupDetail(navigation, groupId)` | `[GroupsList, GroupDetail]` |
| Deep link → group invite | `openGroupDetail(navigation, groupId)` | `[GroupsList, GroupDetail]` |

**In-tab navigation unchanged:** `GroupsListScreen`, `GroupDetailScreen`, etc. continue using local `navigation.navigate()` within the same stack.

---

## Stack shapes (Profile tab)

| Entry point | Helper | Stack after reset |
|-------------|--------|-------------------|
| AddMembersSheet → Find friends | `openFindFriends(navigation)` | `[ProfileMain, FindFriends]` |
| Deep link → friend invite | `openFriends(navigation)` | `[ProfileMain, Friends]` |

---

## Call sites to migrate

### Groups helpers (7 call sites)

| File | Current | Replace with |
|------|---------|----------------|
| `ProfileScreen.tsx:60` | `navigate('Groups', { screen: 'GroupDetail', ... })` | `openGroupDetail` |
| `ProfileScreen.tsx:121-124` | `navigate('Groups', { screen: 'GroupsList', ... })` | `openGroupsList` |
| `ProfileScreen.tsx:133-136` | same | `openGroupsList` |
| `FriendsScreen.tsx:94-97` | `navigate('Groups', { screen: 'CreateGroup', ... })` | `openCreateGroup` |
| `ActivityFeedScreen.tsx:124-127` | `navigate('Groups', { screen: 'ExpenseDetail', ... })` | `openExpenseDetail` |
| `ActivityFeedScreen.tsx:134-137` | `navigate('Groups', { screen: 'GroupDetail', ... })` | `openGroupDetail` |
| `deepLinks.service.ts:95-98` | `navigate('Groups', { screen: 'GroupDetail', ... })` | `openGroupDetail` |

### Profile helpers (2 call sites)

| File | Current | Replace with |
|------|---------|----------------|
| `AddMembersSheet.tsx:107` | `navigate('Profile', { screen: 'FindFriends' })` | `openFindFriends` |
| `deepLinks.service.ts:76` | `navigate('Profile', { screen: 'Friends' })` | `openFriends` |

---

## Tab listener behavior (all tabs)

| Tab | Root screen | Listener |
|-----|-------------|----------|
| Profile | `ProfileMain` | `createTabPopToTopListener('ProfileMain')` |
| Activity | `ActivityFeed` | `createTabPopToTopListener('ActivityFeed')` |
| Groups | `GroupsList` | `createTabPopToTopListener('GroupsList')` |

| Event | Behavior |
|-------|----------|
| Tab press, tab **not** focused | Default — show top of that tab's stack |
| Tab press, tab **focused**, at root | No-op |
| Tab press, tab **focused**, nested | `preventDefault` + `StackActions.popToTop` on nested stack |

---

## Testing strategy

| Layer | What to test |
|-------|--------------|
| `tabNavigation.test.ts` | Listener fires `popToTop` only when focused + nested; no-op at root; no-op when switching tabs |
| `groupsTabNavigation.test.ts` | Each helper dispatches correct nested `state` (routes + index) |
| `profileTabNavigation.test.ts` | Same for Profile helpers |
| Screen tests | Update mocks to expect helper calls instead of raw `navigate` |
| Manual QA | Profile → friend → group; tab double-tap; Activity → expense; deep links |

**Run tests:** `cd cost-share-app/apps/mobile && npm test`

---

## SRS mapping

| Requirement | Coverage |
|-------------|----------|
| REQ-PROF-04 | Profile dashboard cross-links to groups with predictable navigation |
| REQ-GRP-01 / REQ-GRP-03 | Groups list and detail reachable without stack corruption |

---

## Out of scope

- Scroll-to-top on root re-press (future enhancement)
- Typed `useNavigation` hook code-gen (future; this spec adds `types.ts` foundation)
- Activity tab cross-tab entry (no current call sites)
- Web app navigation parity (REQ-AUTH-04)

---

## Success criteria

1. Profile → friend → group: lands on Groups tab at `GroupDetail` with clean stack; back → `GroupsList`.
2. After cross-tab group open, switch to Profile, tap Groups once → `GroupDetail`; tap Groups again → `GroupsList`.
3. Deep drill in Groups (e.g. `ExpenseDetail`), switch to Profile, cross-tab to different group → stack is `[GroupsList, GroupDetail]` only (no stale `ExpenseDetail`).
4. All existing Jest tests pass; new navigation unit tests pass.
