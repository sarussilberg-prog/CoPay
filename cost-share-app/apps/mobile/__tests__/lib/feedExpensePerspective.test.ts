import {
    resolveExpenseFeedPerspective,
    expenseFeedSummaryKey,
    expenseFeedSummaryCount,
} from '../../lib/feedExpensePerspective';
import type { ExpenseWithSplits } from '@cost-share/shared';

const base: ExpenseWithSplits = {
    id: 'e1',
    groupId: 'g1',
    description: 'Dinner',
    amount: 90,
    currency: 'ILS',
    category: 'food',
    expenseDate: new Date(),
    paidBy: 'alice',
    createdBy: 'alice',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    splits: [
        {
            id: 's1',
            expenseId: 'e1',
            userId: 'alice',
            amount: 30,
            createdAt: new Date(),
        },
        {
            id: 's2',
            expenseId: 'e1',
            userId: 'me',
            amount: 30,
            createdAt: new Date(),
        },
        {
            id: 's3',
            expenseId: 'e1',
            userId: 'bob',
            amount: 30,
            createdAt: new Date(),
        },
    ],
};

describe('feedExpensePerspective', () => {
    it('detects when the current user is the payer', () => {
        const params = resolveExpenseFeedPerspective(
            { ...base, paidBy: 'me' },
            'me',
        );
        expect(params.perspective).toBe('youPaid');
        expect(expenseFeedSummaryKey(params.perspective)).toBe(
            'groups.expense.feedYouPaid',
        );
        expect(expenseFeedSummaryCount(params)).toBe(3);
    });

    it('detects when someone else paid and the user is in the split', () => {
        const params = resolveExpenseFeedPerspective(base, 'me');
        expect(params.perspective).toBe('paidForYouAndOthers');
        expect(params.othersCount).toBe(2);
        expect(expenseFeedSummaryCount(params)).toBe(2);
    });

    it('detects paid-for-you only when the user is the sole splitter', () => {
        const solo = {
            ...base,
            splits: [
                {
                    id: 's1',
                    expenseId: 'e1',
                    userId: 'me',
                    amount: 90,
                    createdAt: new Date(),
                },
            ],
        };
        const params = resolveExpenseFeedPerspective(solo, 'me');
        expect(params.perspective).toBe('paidForYou');
        expect(expenseFeedSummaryKey(params.perspective)).toBe(
            'groups.expense.feedPaidForYou',
        );
    });

    it('detects when the user is not involved', () => {
        const params = resolveExpenseFeedPerspective(base, 'carol');
        expect(params.perspective).toBe('paidExcludingYou');
        expect(expenseFeedSummaryCount(params)).toBe(3);
    });
});
