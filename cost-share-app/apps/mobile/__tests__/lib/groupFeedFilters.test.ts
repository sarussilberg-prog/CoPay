import { buildFeed } from '../../services/feed';
import {
    DEFAULT_GROUP_FEED_FILTERS,
    filterAndSortGroupFeed,
    isAnyGroupFeedFilterActive,
} from '../../lib/groupFeedFilters';
import type { ExpenseWithSplits, GroupMessage, Settlement } from '@cost-share/shared';

const expense = (id: string, at: Date, createdBy = 'me'): ExpenseWithSplits => ({
    id,
    groupId: 'g1',
    description: id,
    amount: 10,
    currency: 'ILS',
    expenseDate: at,
    paidBy: createdBy,
    createdBy,
    isDeleted: false,
    createdAt: at,
    updatedAt: at,
    splits: [],
});

const message = (id: string, at: Date, userId = 'other'): GroupMessage => ({
    id,
    groupId: 'g1',
    userId,
    body: `msg-${id}`,
    editedAt: null,
    isDeleted: false,
    createdAt: at,
    updatedAt: at,
});

const settlement = (id: string, at: Date): Settlement => ({
    id,
    groupId: 'g1',
    fromUserId: 'other',
    toUserId: 'me',
    amount: 5,
    currency: 'ILS',
    settlementDate: at,
    createdBy: 'other',
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
});

describe('groupFeedFilters', () => {
    it('detects active filters', () => {
        expect(isAnyGroupFeedFilterActive(DEFAULT_GROUP_FEED_FILTERS)).toBe(false);
        expect(
            isAnyGroupFeedFilterActive({
                ...DEFAULT_GROUP_FEED_FILTERS,
                types: ['message'],
            }),
        ).toBe(true);
    });

    it('filters by type and sorts ascending', () => {
        const feed = buildFeed(
            'g1',
            [expense('e1', new Date('2026-05-20'))],
            [message('m1', new Date('2026-05-21'))],
            [settlement('s1', new Date('2026-05-19'))],
            'me',
        );

        const result = filterAndSortGroupFeed(
            feed,
            { ...DEFAULT_GROUP_FEED_FILTERS, types: ['message'], sortBy: 'dateAsc' },
            {},
            '',
        );

        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe('message');
    });
});
