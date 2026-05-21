import {
    calculateMemberContributions,
    calculateUserBalancesByCurrencyFromData,
} from '@cost-share/shared';

describe('calculateMemberContributions', () => {
    it('returns empty totals for an empty group', () => {
        const { totals, matrix } = calculateMemberContributions({
            userIds: [],
            expenses: [],
            splits: [],
        });
        expect(totals).toEqual([]);
        expect(matrix).toEqual([]);
    });

    it('returns one totals entry per member, even those with no activity', () => {
        const { totals, matrix } = calculateMemberContributions({
            userIds: ['A', 'B', 'C'],
            expenses: [],
            splits: [],
        });
        expect(totals).toHaveLength(3);
        expect(totals.map(t => t.userId).sort()).toEqual(['A', 'B', 'C']);
        for (const t of totals) {
            expect(t.paid).toEqual([]);
            expect(t.owed).toEqual([]);
        }
        expect(matrix).toEqual([]);
    });

    it('sums single-currency paid + owed totals and produces a payer→consumer matrix', () => {
        const { totals, matrix } = calculateMemberContributions({
            userIds: ['A', 'B'],
            expenses: [{ id: 'e1', paidBy: 'A', amount: 30, currency: 'USD' }],
            splits: [
                { expenseId: 'e1', userId: 'A', amount: 15 },
                { expenseId: 'e1', userId: 'B', amount: 15 },
            ],
        });

        const a = totals.find(t => t.userId === 'A')!;
        const b = totals.find(t => t.userId === 'B')!;
        expect(a.paid).toEqual([{ currency: 'USD', amount: 30 }]);
        expect(a.owed).toEqual([{ currency: 'USD', amount: 15 }]);
        expect(b.paid).toEqual([]);
        expect(b.owed).toEqual([{ currency: 'USD', amount: 15 }]);

        // Matrix should show: A paid for A ($15) and A paid for B ($15).
        expect(matrix).toEqual([
            { payerId: 'A', consumerId: 'A', currency: 'USD', amount: 15 },
            { payerId: 'A', consumerId: 'B', currency: 'USD', amount: 15 },
        ]);
    });

    it('keeps currencies separate in totals and matrix', () => {
        const { totals, matrix } = calculateMemberContributions({
            userIds: ['A', 'B'],
            expenses: [
                { id: 'e1', paidBy: 'A', amount: 100, currency: 'USD' },
                { id: 'e2', paidBy: 'B', amount: 60, currency: 'ILS' },
            ],
            splits: [
                { expenseId: 'e1', userId: 'A', amount: 50 },
                { expenseId: 'e1', userId: 'B', amount: 50 },
                { expenseId: 'e2', userId: 'A', amount: 30 },
                { expenseId: 'e2', userId: 'B', amount: 30 },
            ],
        });

        const a = totals.find(t => t.userId === 'A')!;
        expect(a.paid).toEqual([{ currency: 'USD', amount: 100 }]);
        // owed should have both currencies sorted alphabetically.
        expect(a.owed).toEqual([
            { currency: 'ILS', amount: 30 },
            { currency: 'USD', amount: 50 },
        ]);

        // matrix sorts by (payer, consumer, currency).
        expect(matrix).toEqual([
            { payerId: 'A', consumerId: 'A', currency: 'USD', amount: 50 },
            { payerId: 'A', consumerId: 'B', currency: 'USD', amount: 50 },
            { payerId: 'B', consumerId: 'A', currency: 'ILS', amount: 30 },
            { payerId: 'B', consumerId: 'B', currency: 'ILS', amount: 30 },
        ]);
    });

    it('skips splits whose expense is not in the input', () => {
        const { totals, matrix } = calculateMemberContributions({
            userIds: ['A'],
            expenses: [],
            splits: [{ expenseId: 'missing', userId: 'A', amount: 10 }],
        });
        expect(totals[0].owed).toEqual([]);
        expect(matrix).toEqual([]);
    });

    it('handles payer being the consumer (self-share)', () => {
        const { matrix } = calculateMemberContributions({
            userIds: ['A'],
            expenses: [{ id: 'e1', paidBy: 'A', amount: 10, currency: 'USD' }],
            splits: [{ expenseId: 'e1', userId: 'A', amount: 10 }],
        });
        expect(matrix).toEqual([
            { payerId: 'A', consumerId: 'A', currency: 'USD', amount: 10 },
        ]);
    });

    it('uses integer-cent accumulation to avoid float drift', () => {
        const { totals } = calculateMemberContributions({
            userIds: ['A'],
            expenses: Array.from({ length: 3 }, (_, i) => ({
                id: `e${i}`,
                paidBy: 'A',
                amount: 0.1,
                currency: 'USD',
            })),
            splits: [],
        });
        expect(totals[0].paid).toEqual([{ currency: 'USD', amount: 0.3 }]);
    });
});

describe('calculateUserBalancesByCurrencyFromData', () => {
    it('returns one entry per user with empty byCurrency when no activity', () => {
        const result = calculateUserBalancesByCurrencyFromData({
            groupId: 'g1',
            userIds: ['A', 'B'],
            expenses: [],
            splits: [],
            settlements: [],
        });
        expect(result).toEqual([
            { groupId: 'g1', userId: 'A', byCurrency: [] },
            { groupId: 'g1', userId: 'B', byCurrency: [] },
        ]);
    });

    it('computes net balance per currency with offsetting settlement', () => {
        const result = calculateUserBalancesByCurrencyFromData({
            groupId: 'g1',
            userIds: ['A', 'B'],
            expenses: [{ id: 'e1', paidBy: 'A', amount: 100, currency: 'USD' }],
            splits: [
                { expenseId: 'e1', userId: 'A', amount: 50 },
                { expenseId: 'e1', userId: 'B', amount: 50 },
            ],
            settlements: [
                { fromUserId: 'B', toUserId: 'A', amount: 20, currency: 'USD' },
            ],
        });

        const a = result.find(r => r.userId === 'A')!.byCurrency[0];
        const b = result.find(r => r.userId === 'B')!.byCurrency[0];

        // A: paid 100, owed 50, received 20 → net = 100 - 50 + 20 = 70
        expect(a).toMatchObject({
            currency: 'USD',
            totalPaid: 100,
            totalOwed: 50,
            totalSettledReceived: 20,
            totalSettledPaid: 0,
            netBalance: 70,
        });
        // B: paid 0, owed 50, paid-settled 20 → net = 0 - 50 - 20 = -70
        expect(b).toMatchObject({
            currency: 'USD',
            totalPaid: 0,
            totalOwed: 50,
            totalSettledPaid: 20,
            totalSettledReceived: 0,
            netBalance: -70,
        });
    });

    it('separates ledgers across currencies', () => {
        const result = calculateUserBalancesByCurrencyFromData({
            groupId: 'g1',
            userIds: ['A', 'B'],
            expenses: [
                { id: 'e1', paidBy: 'A', amount: 100, currency: 'USD' },
                { id: 'e2', paidBy: 'B', amount: 80, currency: 'ILS' },
            ],
            splits: [
                { expenseId: 'e1', userId: 'A', amount: 50 },
                { expenseId: 'e1', userId: 'B', amount: 50 },
                { expenseId: 'e2', userId: 'A', amount: 40 },
                { expenseId: 'e2', userId: 'B', amount: 40 },
            ],
            settlements: [],
        });

        const a = result.find(r => r.userId === 'A')!;
        const b = result.find(r => r.userId === 'B')!;
        expect(a.byCurrency.map(r => r.currency).sort()).toEqual(['ILS', 'USD']);
        expect(b.byCurrency.map(r => r.currency).sort()).toEqual(['ILS', 'USD']);

        const aUsd = a.byCurrency.find(r => r.currency === 'USD')!;
        const aIls = a.byCurrency.find(r => r.currency === 'ILS')!;
        // USD: A paid 100, owed 50 → +50.  ILS: A paid 0, owed 40 → -40.
        expect(aUsd.netBalance).toBe(50);
        expect(aIls.netBalance).toBe(-40);
    });

    it('records settlement-only balances when no expenses share that currency', () => {
        const result = calculateUserBalancesByCurrencyFromData({
            groupId: 'g1',
            userIds: ['A', 'B'],
            expenses: [],
            splits: [],
            settlements: [
                { fromUserId: 'A', toUserId: 'B', amount: 25, currency: 'EUR' },
            ],
        });
        const a = result.find(r => r.userId === 'A')!.byCurrency[0];
        const b = result.find(r => r.userId === 'B')!.byCurrency[0];
        expect(a).toMatchObject({ currency: 'EUR', netBalance: -25 });
        expect(b).toMatchObject({ currency: 'EUR', netBalance: 25 });
    });
});
