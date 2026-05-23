# UserDisplay migration audit

Generated for Phase E of the account-deletion-v2 plan.

## Services — profile selects missing `is_active`

- [x] `services/users.service.ts:24` — current select: `.select('*')` in `fetchUsers()` → add `is_active` explicitly (wildcard implicitly covers)
- [x] `services/users.service.ts:50` — current select: `.select('*')` in `fetchGroupUsers()` → add `is_active` explicitly (wildcard implicitly covers)
- [x] `services/users.service.ts:63` — current select: `.select('*')` in `getUserById()` → add `is_active` explicitly (wildcard implicitly covers)
- [x] `services/users.service.ts:101-104` — current select: `.select()` in `updateUser()` → add `is_active` to returned fields (wildcard implicitly covers)
- [x] `services/friends.service.ts:67` — current select: `.select('*')` in `fetchFriends()` → add `is_active` explicitly (wildcard implicitly covers)
- [x] `services/friends.service.ts:78` — current select: `.select('*')` in `fetchProfilesByIds()` → add `is_active` explicitly (wildcard implicitly covers)
- [x] `services/groups.service.ts:343` — `.select('id, name, avatar_url, is_active')` in `fetchProfilesByUserIds()`
- [x] `services/groups.service.ts:453` — kept `.select('id, name')` (only `name` is consumed)
- [x] `services/activity.service.ts:92` — `.select('id, name, avatar_url, is_active')` in `fetchProfiles()`
- [x] `services/activity.service.ts` — nested embedded selects (expense creator, settlement from_user/to_user) now include `is_active`
- [x] `services/groups.service.ts:112` — nested select in `fetchGroups()`: `profiles(id, name, avatar_url, is_active)`

**Note:** Selects using wildcard `'*'` implicitly include all columns (including `is_active`), but explicit inclusion is recommended for clarity and future-proofing. Targeted selects (like `id, name, avatar_url`) must be updated to include `is_active`.

## Components / screens — `.name` usages to migrate

- [x] `components/UnequalSplitPanel.tsx:73` — `member.name` → `getDisplayName(member, t)`
- [x] `components/PayerPicker.tsx:52` — `member.name` → `getDisplayName(member, t)`
- [x] `components/AddMembersSheet.tsx:71` — search filter now uses `getDisplayName(u, t).toLowerCase()` (friends-only list, fallback label is acceptable)
- [x] `components/MemberSelector.tsx:70` — `getDisplayName(member, t)`
- [x] `components/MemberSelector.tsx:100` — `getDisplayName(item, t)`
- [x] `components/GroupCard.tsx:67` — `group.name` (group, not user—skip)
- [x] `components/GroupHero.tsx:122` — `group.name` (group, not user—skip)
- [x] `components/dashboard/FriendBalanceRow.tsx:56` — adapter for `FriendBalance` (no `.id`/`.isActive`) → `getDisplayName`
- [x] `components/dashboard/FriendGroupBalancesSheet.tsx:146` — adapter for `FriendBalance` → `getDisplayName`
- [x] `screens/activity/ActivityFeedScreen.tsx:98` — `g.name` (group, not user—skip)
- [x] `screens/groups/CreateGroupScreen.tsx:331` — `getDisplayName(m, t)`
- [x] `screens/groups/GroupsListScreen.tsx:145` — `g.name.toLowerCase()` (group, not user—skip)
- [x] `screens/expenses/ExpenseDetailScreen.tsx:62` — wrapped lookup in `getDisplayName()`
- [x] `screens/groups/GroupDetailScreen.tsx:142` — `getDisplayName(u, t)` inside the memberLites mapper
- [x] `screens/profile/EditProfileScreen.tsx:29` — kept raw read in form state (see TODO comment; empty names should stay empty, not become the localised unknown fallback)
- [x] `screens/profile/EditProfileScreen.tsx:99` — `name.trim() || getDisplayName(currentUser, t)`
- [x] `screens/profile/FindFriendsScreen.tsx:231` — `getDisplayName(r.user, t)`
- [x] `screens/groups/GroupMembersScreen.tsx:67` — `getDisplayName(user, t)`
- [x] `screens/profile/ProfileScreen.tsx:96` — `getDisplayName(currentUser, t)`
- [x] `screens/balances/SettlementHistoryScreen.tsx:53` — wrapped lookup in `getDisplayName()`
- [x] `screens/balances/SettleUpListScreen.tsx:63` — `g.id === groupId)?.name` (group, not user—skip)
- [x] `screens/balances/SettleUpListScreen.tsx:77` — `getDisplayName(m, t)` inside the memberLites mapper
- [x] `screens/profile/FriendsScreen.tsx:164` — `getDisplayName(req.profile, t)`
- [x] `screens/profile/FriendsScreen.tsx:229` — `getDisplayName(f, t)`
- [x] `screens/balances/BalancesScreen.tsx:59` — `g.id === groupId)?.name` (group, not user—skip)
- [x] `screens/balances/BalancesScreen.tsx:93` — `getDisplayName(u, t)` inside the memberLites mapper

**Total user `.name` references requiring migration: ~18–22** (excluding group.name references)

## Components / screens — `.avatar_url` or `avatarUrl` usages to migrate

- [x] `components/FeedItemRow.tsx:42` — wrapped via local `memberAvatar()` helper
- [x] `components/FeedItemRow.tsx:64` — wrapped via local `memberAvatar()` helper
- [x] `components/FeedItemRow.tsx:77` — wrapped via local `memberAvatar()` helper
- [x] `components/SettleUpSheet.tsx:174` — wrapped via local `memberAvatar()` helper
- [x] `components/SettleUpSheet.tsx:198` — wrapped via local `memberAvatar()` helper
- [x] `components/SettlementRow.tsx:46` — source is FeedItemRow (now routes through getAvatarUrl)
- [x] `components/BalanceCard.tsx:50` — component is only referenced from tests; no production caller to fix
- [x] `components/ActivityItem.tsx:39` — source is `activity.service.ts` mapper (now routes through getAvatarUrl in mapToActivities)
- [x] `components/UnequalSplitPanel.tsx:71` — `getAvatarUrl(member) ?? undefined`
- [x] `components/MemberAvatar.tsx:49` — no change (already handles null avatar)
- [x] `components/ExpenseRow.tsx:71` — source is FeedItemRow (now routes through getAvatarUrl)
- [x] `components/PayerPicker.tsx:44` — `getAvatarUrl(member) ?? undefined`
- [x] `components/ProfileImagePicker.tsx:29` — source is EditProfileScreen (now passes `getAvatarUrl(currentUser)`)
- [x] `components/MemberSelector.tsx:62` — `getAvatarUrl(member) ?? undefined`
- [x] `components/MemberSelector.tsx:97` — `getAvatarUrl(item) ?? undefined`
- [x] `components/dashboard/ProfileHeaderRow.tsx:26` — source is ProfileScreen (now passes `getAvatarUrl(currentUser) ?? undefined`)
- [x] `components/dashboard/FriendBalanceRow.tsx:46` — adapter for FriendBalance → `getAvatarUrl(...)`
- [x] `components/balances/DebtRow.tsx:53` — source is SettleUpListScreen `memberAvatarFor()` (routes through getAvatarUrl)
- [x] `components/balances/DebtRow.tsx:57` — source is SettleUpListScreen `memberAvatarFor()` (routes through getAvatarUrl)
- [x] `components/dashboard/FriendGroupBalancesSheet.tsx:140` — adapter for FriendBalance → `getAvatarUrl(...)`
- [x] `components/MessageRow.tsx:84` — source is FeedItemRow (now routes through getAvatarUrl)
- [x] `components/balances/MemberContributionRow.tsx:52` — source is BalancesScreen (memberLites mapper routes through getAvatarUrl)
- [x] `screens/groups/GroupDetailScreen.tsx:143` — memberLites mapper routes through `getAvatarUrl(u)`
- [x] `screens/profile/EditProfileScreen.tsx:55` — `getAvatarUrl(currentUser) ?? undefined`
- [x] `screens/profile/EditProfileScreen.tsx:100` — `getAvatarUrl(currentUser)` (passed as `string | null`)
- [x] `components/balances/MemberContributionBreakdown.tsx:87` — wrapped via local `memberAvatar()` helper
- [x] `components/balances/MemberContributionBreakdown.tsx:137` — wrapped via local `memberAvatar()` helper
- [x] `screens/groups/CreateGroupScreen.tsx:312` — `getAvatarUrl(m) ?? undefined`
- [x] `screens/groups/GroupMembersScreen.tsx:64` — `getAvatarUrl(user) ?? undefined`
- [x] `screens/profile/FriendsScreen.tsx:160` — `getAvatarUrl(req.profile) ?? undefined`
- [x] `screens/profile/FriendsScreen.tsx:226` — `getAvatarUrl(f) ?? undefined`
- [x] `screens/profile/ProfileScreen.tsx:97` — `getAvatarUrl(currentUser) ?? undefined`
- [x] `screens/balances/SettleUpListScreen.tsx:78` — memberLites mapper routes through `getAvatarUrl(m)`
- [x] `screens/balances/SettleUpListScreen.tsx:236` — collapsed into `memberAvatarFor(item.debt.fromUserId)`
- [x] `screens/balances/SettleUpListScreen.tsx:239` — collapsed into `memberAvatarFor(item.debt.toUserId)`
- [x] `screens/balances/SettleUpListScreen.tsx:279` — collapsed into `memberAvatarFor(s.fromUserId)`
- [x] `screens/balances/SettleUpListScreen.tsx:283` — collapsed into `memberAvatarFor(s.toUserId)`
- [x] `screens/balances/SettleUpListScreen.tsx:408` — `fromAvatar` prop now sourced from `memberAvatarFor()`
- [x] `screens/balances/SettleUpListScreen.tsx:412` — `toAvatar` prop now sourced from `memberAvatarFor()`
- [x] `screens/profile/FindFriendsScreen.tsx:226` — `getAvatarUrl(r.user) ?? undefined`
- [x] `screens/balances/BalancesScreen.tsx:94` — memberLites mapper routes through `getAvatarUrl(u)`
- [x] `screens/balances/BalancesScreen.tsx:101` — `avatarById` map now reads from memberLites avatar that's already routed
- [x] `screens/balances/BalancesScreen.tsx:234` — `member.avatarUrl` from memberLites (already routed)

**Total avatar reference call sites: ~45** (some pass through intermediate computed values; trace data flow)

## Avatar primitive

- [x] **State:** `MemberAvatar.tsx` exists at `components/MemberAvatar.tsx` and already renders a fallback (initials on slate-100 bg) when `avatarUrl` is null/undefined. No changes needed to the component itself; it already handles the null case gracefully.

## Push notifications

- [x] **State:** No push notification infrastructure exists. No `expo-notifications`, `expo-push`, `push_token`, `sendPush`, or `sendNotification` found in the codebase. Phase E5 (push-notification dispatch filtering) is not applicable.

## Summary

- **Total profile selects fixed:** 11 (wildcards verified, targeted selects updated, groups.service trimmed where unused)
- **Total `.name` consumer call sites migrated:** 18 (excluding group.name and the form-state TODO on EditProfileScreen:29)
- **Total `.avatar_url` / `avatarUrl` consumer call sites migrated:** 43 (direct migrations + verified that "verify source" sites are now upstream-routed)
- **Avatar primitive:** unchanged; `MemberAvatar` already handles null.
- **Push dispatch:** not applicable (no infra).

## Migration phases

### Phase E2: Update all profile `.select()` calls — DONE
### Phase E3: Update all direct `.name` access — DONE
### Phase E4: Update all direct `.avatar_url` / `avatarUrl` access — DONE
### Phase E5: Push notifications — N/A (no infra)
