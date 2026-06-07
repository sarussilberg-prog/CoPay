import {
    PENDING_ID_PREFIX,
    createPendingExpenseId,
    isPendingExpenseId,
    addExpenseMutationKey,
} from '../../lib/pendingExpense';

describe('pendingExpense', () => {
    it('prefix is the documented sentinel', () => {
        expect(PENDING_ID_PREFIX).toBe('pending_');
    });

    it('createPendingExpenseId returns a prefixed id with a non-empty unique tail', () => {
        const id = createPendingExpenseId();
        expect(id.startsWith(PENDING_ID_PREFIX)).toBe(true);
        expect(id.length).toBeGreaterThan(PENDING_ID_PREFIX.length);
        const another = createPendingExpenseId();
        expect(another).not.toBe(id);
    });

    it('isPendingExpenseId distinguishes pending from server ids', () => {
        expect(isPendingExpenseId('pending_a-b-c')).toBe(true);
        expect(isPendingExpenseId('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
        expect(isPendingExpenseId(undefined)).toBe(false);
        expect(isPendingExpenseId(null)).toBe(false);
    });

    it('addExpenseMutationKey is stable per pending id', () => {
        expect(addExpenseMutationKey('pending_abc')).toEqual(['addExpense', 'pending_abc']);
    });
});
