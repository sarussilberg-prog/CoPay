/**
 * Client-side filter + sort for the groups list (REQ-GRP-01).
 */

import { GroupType, GroupWithMembers } from '@cost-share/shared';

export type BalanceState = 'all' | 'owe' | 'owed' | 'settled' | 'unsettled';

export type GroupSortOption =
    | 'recentDesc'
    | 'recentAsc'
    | 'nameAsc'
    | 'nameDesc'
    | 'balanceDesc'
    | 'balanceAsc';

export interface GroupListFilters {
    sortBy: GroupSortOption;
    balanceState: BalanceState;
    types: GroupType[];
    showArchived: boolean;
    currencies: string[];
}

export const DEFAULT_GROUP_LIST_FILTERS: GroupListFilters = {
    sortBy: 'recentDesc',
    balanceState: 'all',
    types: [],
    showArchived: false,
    currencies: [],
};

export function isAnyGroupListFilterActive(f: GroupListFilters): boolean {
    return (
        f.sortBy !== 'recentDesc' ||
        f.balanceState !== 'all' ||
        f.types.length > 0 ||
        f.showArchived ||
        f.currencies.length > 0
    );
}

export function isGroupArchived(group: GroupWithMembers): boolean {
    return group.isArchivedByMe || group.isAutoArchived;
}

export function passesGroupFilters(
    group: GroupWithMembers,
    filters: GroupListFilters,
    balanceNet: number | undefined,
): boolean {
    if (filters.types.length > 0 && !filters.types.includes(group.groupType)) {
        return false;
    }
    if (
        filters.currencies.length > 0 &&
        !filters.currencies.includes(group.defaultCurrency)
    ) {
        return false;
    }
    if (!filters.showArchived && isGroupArchived(group)) {
        return false;
    }
    if (filters.balanceState !== 'all') {
        const net = balanceNet ?? 0;
        if (filters.balanceState === 'owed' && net <= 0.01) return false;
        if (filters.balanceState === 'owe' && net >= -0.01) return false;
        if (filters.balanceState === 'settled' && Math.abs(net) >= 0.01) return false;
        if (filters.balanceState === 'unsettled' && Math.abs(net) < 0.01) return false;
    }
    return true;
}

export function sortGroups(
    groups: GroupWithMembers[],
    sortBy: GroupSortOption,
    groupBalances: Record<string, { net: number } | undefined>,
    locale?: string,
): GroupWithMembers[] {
    const collator = locale
        ? (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' })
        : (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

    return [...groups].sort((a, b) => {
        const aArchived = isGroupArchived(a);
        const bArchived = isGroupArchived(b);
        if (aArchived !== bArchived) return aArchived ? 1 : -1;

        switch (sortBy) {
            case 'nameAsc':
                return collator(a.name, b.name);
            case 'nameDesc':
                return collator(b.name, a.name);
            case 'recentAsc':
                return a.updatedAt.getTime() - b.updatedAt.getTime();
            case 'balanceDesc': {
                const na = groupBalances[a.id]?.net ?? 0;
                const nb = groupBalances[b.id]?.net ?? 0;
                return nb - na;
            }
            case 'balanceAsc': {
                const na = groupBalances[a.id]?.net ?? 0;
                const nb = groupBalances[b.id]?.net ?? 0;
                return na - nb;
            }
            case 'recentDesc':
            default:
                return b.updatedAt.getTime() - a.updatedAt.getTime();
        }
    });
}
