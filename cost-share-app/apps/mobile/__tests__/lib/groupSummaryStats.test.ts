import {
    calculateGroupTotalSpent,
    calculateGroupTotalUnsettled,
    sortCurrencyAmounts,
} from '@cost-share/shared';

describe('groupSummaryStats', () => {
    describe('calculateGroupTotalSpent', () => {
        it('sums expenses by currency', () => {
            expect(
                calculateGroupTotalSpent([
                    { amount: 100, currency: 'USD' },
                    { amount: 50, currency: 'USD' },
                    { amount: 20, currency: 'EUR' },
                ]),
            ).toEqual([
                { currency: 'EUR', amount: 20 },
                { currency: 'USD', amount: 150 },
            ]);
        });

        it('returns empty array when there are no expenses', () => {
            expect(calculateGroupTotalSpent([])).toEqual([]);
        });
    });

    describe('calculateGroupTotalUnsettled', () => {
        it('sums pairwise debts by currency', () => {
            expect(
                calculateGroupTotalUnsettled([
                    { fromUserId: 'a', toUserId: 'b', amount: 30, currency: 'USD' },
                    { fromUserId: 'c', toUserId: 'd', amount: 20, currency: 'USD' },
                    { fromUserId: 'a', toUserId: 'c', amount: 10, currency: 'ILS' },
                ]),
            ).toEqual([
                { currency: 'ILS', amount: 10 },
                { currency: 'USD', amount: 50 },
            ]);
        });

        it('returns empty array when all debts are settled', () => {
            expect(calculateGroupTotalUnsettled([])).toEqual([]);
        });
    });

    describe('sortCurrencyAmounts', () => {
        it('puts the default currency first', () => {
            expect(
                sortCurrencyAmounts(
                    [
                        { currency: 'EUR', amount: 10 },
                        { currency: 'USD', amount: 20 },
                    ],
                    'USD',
                ),
            ).toEqual([
                { currency: 'USD', amount: 20 },
                { currency: 'EUR', amount: 10 },
            ]);
        });
    });
});
