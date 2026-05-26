import { findFeedItemIndex } from '../../lib/groupDetailFocus';
import type { FeedItem } from '@cost-share/shared';

const feed: FeedItem[] = [
    {
        kind: 'message',
        sortAt: new Date(),
        message: {
            id: 'm1',
            groupId: 'g1',
            userId: 'u1',
            body: 'hi',
            editedAt: null,
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    },
    {
        kind: 'expense',
        sortAt: new Date(),
        expense: {
            id: 'e1',
            groupId: 'g1',
            description: 'Lunch',
            amount: 10,
            currency: 'USD',
            category: 'food',
            expenseDate: new Date(),
            paidBy: 'u1',
            createdBy: 'u1',
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            splits: [],
            myDelta: 0,
            myDeltaState: 'settled',
        },
    },
];

describe('findFeedItemIndex', () => {
    it('finds expense index in feed', () => {
        expect(findFeedItemIndex(feed, { kind: 'expense', id: 'e1' })).toBe(1);
    });

    it('returns -1 when item is missing', () => {
        expect(findFeedItemIndex(feed, { kind: 'settlement', id: 's9' })).toBe(-1);
    });
});
