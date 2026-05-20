/**
 * In-memory flags for per-group feed hydration (expenses/messages).
 * Avoids redundant Supabase round-trips when navigating back to GroupDetail.
 */

import { useAppStore } from '../store';

const hydratedExpenseGroups = new Set<string>();

export function markGroupExpensesHydrated(groupId: string): void {
    hydratedExpenseGroups.add(groupId);
}

export function isGroupExpensesHydrated(groupId: string): boolean {
    return hydratedExpenseGroups.has(groupId);
}

export function isGroupMessagesHydrated(groupId: string): boolean {
    return groupId in useAppStore.getState().messagesByGroup;
}

export function isGroupFeedHydrated(groupId: string): boolean {
    return isGroupExpensesHydrated(groupId) && isGroupMessagesHydrated(groupId);
}

export function hasStoreGroupMembers(groupId: string): boolean {
    const group = useAppStore.getState().groups.find(g => g.id === groupId);
    return (group?.members?.length ?? 0) > 0;
}

export function clearGroupFeedHydration(): void {
    hydratedExpenseGroups.clear();
}
