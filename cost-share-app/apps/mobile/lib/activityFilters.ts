/**
 * Client-side filter + sort for the cross-group activity feed (REQ-ACT-01).
 */

import { GroupType, RecentActivity } from '@cost-share/shared';

export type ActivityTypeFilter = 'expense' | 'settlement' | 'message';
export type ActivitySortOption = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';

export interface ActivityFilters {
    types: ActivityTypeFilter[];
    groupTypes: GroupType[];
    currencies: string[];
    groupIds: string[];
    onlyMine: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortBy: ActivitySortOption;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
    types: [],
    groupTypes: [],
    currencies: [],
    groupIds: [],
    onlyMine: false,
    sortBy: 'dateDesc',
};

export function isAnyActivityFilterActive(f: ActivityFilters): boolean {
    return (
        f.types.length > 0 ||
        f.groupTypes.length > 0 ||
        f.currencies.length > 0 ||
        f.groupIds.length > 0 ||
        f.onlyMine ||
        Boolean(f.dateFrom) ||
        Boolean(f.dateTo) ||
        f.sortBy !== 'dateDesc'
    );
}

function parseDateStart(isoDate: string): number | null {
    const ms = Date.parse(isoDate);
    return Number.isNaN(ms) ? null : ms;
}

function parseDateEndExclusive(isoDate: string): number | null {
    const ms = Date.parse(isoDate);
    return Number.isNaN(ms) ? null : ms + 24 * 3600 * 1000;
}

export function filterAndSortActivities(
    items: RecentActivity[],
    filters: ActivityFilters,
    currentUserId?: string | null,
    groupTypeById?: Record<string, GroupType>,
): RecentActivity[] {
    const query = filters;
    let list = [...items];

    if (query.types.length > 0) {
        list = list.filter((item) => query.types.includes(item.activityType));
    }

    if (query.currencies.length > 0) {
        list = list.filter(
            (item) =>
                item.activityType !== 'message' &&
                query.currencies.includes(item.currency),
        );
    }

    if (query.groupIds.length > 0) {
        list = list.filter((item) => query.groupIds.includes(item.groupId));
    }

    if (query.groupTypes.length > 0 && groupTypeById) {
        list = list.filter((item) => {
            const groupType = groupTypeById[item.groupId];
            return groupType && query.groupTypes.includes(groupType);
        });
    }

    if (query.onlyMine && currentUserId) {
        list = list.filter((item) => item.userId === currentUserId);
    }

    const fromMs = query.dateFrom ? parseDateStart(query.dateFrom) : null;
    const toMs = query.dateTo ? parseDateEndExclusive(query.dateTo) : null;
    if (fromMs !== null || toMs !== null) {
        list = list.filter((item) => {
            const t = new Date(item.activityDate).getTime();
            if (fromMs !== null && t < fromMs) return false;
            if (toMs !== null && t >= toMs) return false;
            return true;
        });
    }

    list.sort((a, b) => {
        switch (query.sortBy) {
            case 'dateAsc':
                return (
                    new Date(a.activityDate).getTime() -
                    new Date(b.activityDate).getTime()
                );
            case 'amountDesc':
                return b.amount - a.amount;
            case 'amountAsc':
                return a.amount - b.amount;
            case 'dateDesc':
            default:
                return (
                    new Date(b.activityDate).getTime() -
                    new Date(a.activityDate).getTime()
                );
        }
    });

    return list;
}

export function matchesActivitySearch(
    item: RecentActivity,
    searchQuery: string,
): boolean {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
        item.description.toLowerCase().includes(q) ||
        item.userName.toLowerCase().includes(q) ||
        item.currency.toLowerCase().includes(q) ||
        String(item.amount).includes(q)
    );
}
