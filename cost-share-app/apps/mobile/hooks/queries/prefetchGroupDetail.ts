/**
 * Warm caches before navigating to GroupDetail — expenses, messages, members.
 */

import { fetchExpenses } from '../../services/expenses.service';
import { fetchMessages } from '../../services/messages.service';
import { fetchGroupUsers } from '../../services/users.service';
import { fetchSettlements } from '../../services/settlements.service';
import {
    hasStoreGroupMembers,
    isGroupExpensesHydrated,
    isGroupMessagesHydrated,
} from '../../lib/groupFeedCache';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from './keys';

export function prefetchGroupDetail(groupId: string): void {
    if (!groupId) return;

    if (!isGroupExpensesHydrated(groupId)) {
        void fetchExpenses(groupId);
    }
    if (!isGroupMessagesHydrated(groupId)) {
        void fetchMessages(groupId);
    }
    if (!hasStoreGroupMembers(groupId)) {
        void queryClient.prefetchQuery({
            queryKey: queryKeys.groupUsers(groupId),
            queryFn: () => fetchGroupUsers(groupId),
        });
    }
    void queryClient.prefetchQuery({
        queryKey: queryKeys.groupSettlements(groupId),
        queryFn: () => fetchSettlements(groupId),
    });
}
