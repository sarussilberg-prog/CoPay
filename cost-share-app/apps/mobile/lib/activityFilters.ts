/**
 * Client-side filter + sort for the cross-group activity feed.
 *
 * The filter UI chip values stay 'expense' | 'settlement' | 'message' so the
 * sheet doesn't change. We map them here to the new activity_events kinds.
 * Membership and friend-request events are always shown (never filtered out
 * by the type chip).
 */

import { ActivityEvent, ActivityEventKind, GroupType } from '@cost-share/shared';

export type ActivityTypeFilter = 'expense' | 'settlement' | 'message';
export type ActivitySortOption = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';

const TYPE_FILTER_TO_KINDS: Record<ActivityTypeFilter, readonly ActivityEventKind[]> = {
    expense: ['expense_added'],
    settlement: ['settlement_added'],
    message: ['message_posted'],
};

const ALWAYS_VISIBLE_KINDS: readonly ActivityEventKind[] = [
    'friend_request_received',
    'group_added',
    'group_member_joined',
    'group_removed',
];

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

function amountOf(event: ActivityEvent): number {
    const v = (event.metadata as Record<string, unknown> | undefined)?.amount;
    return typeof v === 'number' ? v : Number(v ?? 0);
}

function currencyOf(event: ActivityEvent): string {
    const v = (event.metadata as Record<string, unknown> | undefined)?.currency;
    return typeof v === 'string' ? v : '';
}

export function filterAndSortActivities(
    items: ActivityEvent[],
    filters: ActivityFilters,
    currentUserId?: string | null,
    groupTypeById?: Record<string, GroupType>,
): ActivityEvent[] {
    let list = [...items];

    if (filters.types.length > 0) {
        const allowedKinds = new Set<ActivityEventKind>([
            ...filters.types.flatMap(t => TYPE_FILTER_TO_KINDS[t]),
            ...ALWAYS_VISIBLE_KINDS,
        ]);
        list = list.filter(item => allowedKinds.has(item.kind));
    }

    if (filters.currencies.length > 0) {
        list = list.filter(item => {
            // Only expense/settlement carry currency; everything else passes through.
            if (item.kind !== 'expense_added' && item.kind !== 'settlement_added') return true;
            return filters.currencies.includes(currencyOf(item));
        });
    }

    if (filters.groupIds.length > 0) {
        list = list.filter(item => item.groupId !== null && filters.groupIds.includes(item.groupId));
    }

    if (filters.groupTypes.length > 0 && groupTypeById) {
        list = list.filter(item => {
            if (item.groupId === null) return false;
            const groupType = groupTypeById[item.groupId];
            return groupType && filters.groupTypes.includes(groupType);
        });
    }

    if (filters.onlyMine && currentUserId) {
        list = list.filter(item => item.actorUserId === currentUserId);
    }

    const fromMs = filters.dateFrom ? parseDateStart(filters.dateFrom) : null;
    const toMs = filters.dateTo ? parseDateEndExclusive(filters.dateTo) : null;
    if (fromMs !== null || toMs !== null) {
        list = list.filter(item => {
            const t = item.createdAt.getTime();
            if (fromMs !== null && t < fromMs) return false;
            if (toMs !== null && t >= toMs) return false;
            return true;
        });
    }

    list.sort((a, b) => {
        switch (filters.sortBy) {
            case 'dateAsc':
                return a.createdAt.getTime() - b.createdAt.getTime();
            case 'amountDesc':
                return amountOf(b) - amountOf(a);
            case 'amountAsc':
                return amountOf(a) - amountOf(b);
            case 'dateDesc':
            default:
                return b.createdAt.getTime() - a.createdAt.getTime();
        }
    });

    return list;
}

export function matchesActivitySearch(
    item: ActivityEvent,
    searchQuery: string,
    groupNameById?: Record<string, string>,
): boolean {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const md = item.metadata ?? {};
    const groupName = item.groupId ? groupNameById?.[item.groupId] : undefined;
    const haystack = [
        md.description as string | undefined,
        md.body as string | undefined,
        currencyOf(item),
        String(amountOf(item)),
        groupName,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
}
