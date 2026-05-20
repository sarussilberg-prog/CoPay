/**
 * Client-side filter + sort for the group detail feed (REQ-GRP-03).
 */

import {
    ExpenseCategory,
    FeedItem,
    GroupMemberLite,
} from '@cost-share/shared';

export type GroupFeedTypeFilter = 'expense' | 'settlement' | 'message';
export type GroupFeedSortOption = 'dateDesc' | 'dateAsc';

export interface GroupFeedFilters {
    sortBy: GroupFeedSortOption;
    types: GroupFeedTypeFilter[];
    categories: ExpenseCategory[];
    memberIds: string[];
    dateFrom?: string;
    dateTo?: string;
}

export const DEFAULT_GROUP_FEED_FILTERS: GroupFeedFilters = {
    sortBy: 'dateDesc',
    types: [],
    categories: [],
    memberIds: [],
};

export function isAnyGroupFeedFilterActive(f: GroupFeedFilters): boolean {
    return (
        f.sortBy !== 'dateDesc' ||
        f.types.length > 0 ||
        f.categories.length > 0 ||
        f.memberIds.length > 0 ||
        Boolean(f.dateFrom) ||
        Boolean(f.dateTo)
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

function feedItemKind(item: FeedItem): GroupFeedTypeFilter {
    return item.kind;
}

function passesTypeFilter(item: FeedItem, types: GroupFeedTypeFilter[]): boolean {
    if (types.length === 0) return true;
    return types.includes(feedItemKind(item));
}

function passesSearch(
    item: FeedItem,
    query: string,
    memberMap: Record<string, GroupMemberLite>,
): boolean {
    if (!query) return true;

    if (item.kind === 'expense') {
        const e = item.expense;
        const payer = memberMap[e.paidBy]?.displayName ?? '';
        const hay = `${e.description} ${payer}`.toLowerCase();
        return hay.includes(query);
    }
    if (item.kind === 'settlement') {
        const s = item.settlement;
        const fromName = memberMap[s.fromUserId]?.displayName ?? '';
        const toName = memberMap[s.toUserId]?.displayName ?? '';
        const hay = `${fromName} ${toName}`.toLowerCase();
        return hay.includes(query);
    }
    const sender = memberMap[item.message.userId]?.displayName ?? '';
    const hay = `${item.message.body} ${sender}`.toLowerCase();
    return hay.includes(query);
}

function passesExpenseFilters(
    item: Extract<FeedItem, { kind: 'expense' }>,
    filters: GroupFeedFilters,
    dateFromMs: number | null,
    dateToMs: number | null,
): boolean {
    const e = item.expense;
    if (
        filters.categories.length > 0 &&
        (!e.category || !filters.categories.includes(e.category))
    ) {
        return false;
    }
    if (filters.memberIds.length > 0) {
        const participants = new Set<string>([
            e.paidBy,
            e.createdBy,
            ...e.splits.map(s => s.userId),
        ]);
        if (!filters.memberIds.some(id => participants.has(id))) return false;
    }
    const expenseMs = new Date(e.expenseDate).getTime();
    if (dateFromMs !== null && expenseMs < dateFromMs) return false;
    if (dateToMs !== null && expenseMs >= dateToMs) return false;
    return true;
}

function passesSettlementFilters(
    item: Extract<FeedItem, { kind: 'settlement' }>,
    filters: GroupFeedFilters,
    dateFromMs: number | null,
    dateToMs: number | null,
): boolean {
    const s = item.settlement;
    if (filters.memberIds.length > 0) {
        const participants = new Set<string>([
            s.fromUserId,
            s.toUserId,
            s.createdBy,
        ]);
        if (!filters.memberIds.some(id => participants.has(id))) return false;
    }
    const settlementMs = new Date(s.settlementDate).getTime();
    if (dateFromMs !== null && settlementMs < dateFromMs) return false;
    if (dateToMs !== null && settlementMs >= dateToMs) return false;
    return true;
}

export function filterAndSortGroupFeed(
    feed: FeedItem[],
    filters: GroupFeedFilters,
    memberMap: Record<string, GroupMemberLite>,
    searchQuery: string,
): FeedItem[] {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const dateFromMs = filters.dateFrom ? parseDateStart(filters.dateFrom) : null;
    const dateToMs = filters.dateTo ? parseDateEndExclusive(filters.dateTo) : null;

    const filtered = feed.filter(item => {
        if (!passesTypeFilter(item, filters.types)) return false;
        if (!passesSearch(item, trimmedQuery, memberMap)) return false;

        if (item.kind === 'expense') {
            return passesExpenseFilters(item, filters, dateFromMs, dateToMs);
        }
        if (item.kind === 'settlement') {
            return passesSettlementFilters(item, filters, dateFromMs, dateToMs);
        }
        if (filters.categories.length > 0 || filters.memberIds.length > 0) {
            if (filters.memberIds.length > 0) {
                if (!filters.memberIds.includes(item.message.userId)) return false;
            } else {
                return false;
            }
        }
        if (dateFromMs !== null || dateToMs !== null) {
            const msgMs = item.message.createdAt.getTime();
            if (dateFromMs !== null && msgMs < dateFromMs) return false;
            if (dateToMs !== null && msgMs >= dateToMs) return false;
        }
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        const diff = b.sortAt.getTime() - a.sortAt.getTime();
        return filters.sortBy === 'dateDesc' ? diff : -diff;
    });

    return sorted;
}
