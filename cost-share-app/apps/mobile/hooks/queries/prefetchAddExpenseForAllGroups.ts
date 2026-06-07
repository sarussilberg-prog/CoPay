/**
 * Background-warm the add-expense prerequisites (members + user profiles) for
 * every group the user belongs to.
 *
 * Why: without this, the AddExpenseScreen offline-create path is broken for any
 * group the user has never tapped while online — `useGroupMembersQuery` and
 * `useGroupUsersQuery` would have no cache to read from, the member picker
 * would be empty, the form wouldn't validate, and the optimistic mutation
 * wouldn't enqueue. After this prefetch, once you've ever loaded the groups
 * list while online, every group's add-expense form works offline.
 *
 * Triggered from the navigator (alongside `prefetchGroupsList` and
 * `prefetchProfileWarmup`) after sign-in. Quietly no-ops if data is already
 * fresh in cache (RQ's prefetchQuery semantics).
 */

import type { GroupWithMembers } from '@cost-share/shared';
import { fetchGroupUsers } from '../../services/users.service';
import { getGroupMembers } from '../../services/groups.service';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from './keys';

const ADD_EXPENSE_PREREQ_STALE_MS = 5 * 60_000; // 5 min — realtime keeps it fresher in practice

export function prefetchAddExpensePrerequisitesForGroup(groupId: string): void {
    if (!groupId) return;
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupMembers(groupId),
        queryFn: () => getGroupMembers(groupId),
        staleTime: ADD_EXPENSE_PREREQ_STALE_MS,
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupUsers(groupId),
        queryFn: () => fetchGroupUsers(groupId),
        staleTime: ADD_EXPENSE_PREREQ_STALE_MS,
    });
}

export function prefetchAddExpensePrerequisitesForAllGroups(): void {
    const groups =
        queryClient.getQueryData<GroupWithMembers[]>(queryKeys.groups) ?? [];
    for (const g of groups) {
        prefetchAddExpensePrerequisitesForGroup(g.id);
    }
}
