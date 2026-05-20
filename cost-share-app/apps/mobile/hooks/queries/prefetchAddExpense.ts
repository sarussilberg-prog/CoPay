/**
 * Warm caches before navigating to AddExpense — members and user profiles.
 */

import { fetchGroupUsers } from '../../services/users.service';
import { getGroupMembers } from '../../services/groups.service';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from './keys';

export function prefetchAddExpense(groupId: string): void {
    if (!groupId) return;

    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupMembers(groupId),
        queryFn: () => getGroupMembers(groupId),
    });
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupUsers(groupId),
        queryFn: () => fetchGroupUsers(groupId),
    });
}
