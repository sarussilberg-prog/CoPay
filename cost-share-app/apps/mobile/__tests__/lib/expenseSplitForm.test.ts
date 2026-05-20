import {
    areSplitsEqual,
    buildUnequalSplits,
    computeUnequalTotal,
    inferUnequalModeFromSplits,
    parseSplitInput,
} from '../../lib/expenseSplitForm';

describe('expenseSplitForm', () => {
    it('detects equal splits', () => {
        expect(areSplitsEqual([10, 10, 10])).toBe(true);
        expect(areSplitsEqual([10, 10.01])).toBe(true);
        expect(areSplitsEqual([10, 12])).toBe(false);
    });

    it('validates percent totals', () => {
        const values = { u1: '50', u2: '50' };
        const result = computeUnequalTotal('percent', values, ['u1', 'u2'], 100);
        expect(result.isValid).toBe(true);
    });

    it('flags incomplete amount totals', () => {
        const values = { u1: '30', u2: '30' };
        const result = computeUnequalTotal('amount', values, ['u1', 'u2'], 100);
        expect(result.isValid).toBe(false);
        expect(result.difference).toBe(40);
    });

    it('adjusts amount-mode rounding remainder on the last split', () => {
        const splits = buildUnequalSplits(
            'amount',
            { u1: '33.33', u2: '33.33', u3: '33.33' },
            ['u1', 'u2', 'u3'],
            100,
        );
        const sum = splits.reduce((acc, s) => acc + (s.amount ?? 0), 0);
        expect(sum).toBeCloseTo(100, 2);
    });

    it('builds splits from percent inputs', () => {
        const splits = buildUnequalSplits(
            'percent',
            { u1: '60', u2: '40' },
            ['u1', 'u2'],
            100,
        );
        expect(splits).toHaveLength(2);
        const sum = splits.reduce((acc, s) => acc + (s.amount ?? 0), 0);
        expect(sum).toBeCloseTo(100, 2);
    });

    it('infers percent mode from splits', () => {
        const inferred = inferUnequalModeFromSplits(
            [
                { userId: 'u1', amount: 60 },
                { userId: 'u2', amount: 40 },
            ],
            100,
        );
        expect(inferred.mode).toBe('percent');
        expect(parseSplitInput(inferred.values.u1)).toBe(60);
    });
});
