import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/keys';
import { sweepZombiePendingRows } from '../../lib/zombieSweep';

describe('sweepZombiePendingRows', () => {
    const groupId = 'g1';

    function makeClient() {
        return new QueryClient();
    }

    it('removes a pending row with no matching mutation in the queue', () => {
        const c = makeClient();
        c.setQueryData(queryKeys.groupExpenses(groupId), [
            { id: 'pending_orphan', amount: 1 },
            { id: 'srv-1', amount: 2 },
        ]);
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([
            { id: 'srv-1', amount: 2 },
        ]);
        expect(removed).toEqual([{ groupId, pendingId: 'pending_orphan' }]);
    });

    it('keeps a pending row that has a live mutation', () => {
        const c = makeClient();
        c.setQueryData(queryKeys.groupExpenses(groupId), [
            { id: 'pending_live', amount: 1 },
        ]);
        c.getMutationCache().build(c, {
            mutationKey: ['addExpense', 'pending_live'],
            mutationFn: async () => 'noop',
        });
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses(groupId))).toEqual([
            { id: 'pending_live', amount: 1 },
        ]);
        expect(removed).toEqual([]);
    });

    it('handles multiple groups independently', () => {
        const c = makeClient();
        c.setQueryData(queryKeys.groupExpenses('g1'), [{ id: 'pending_a' }]);
        c.setQueryData(queryKeys.groupExpenses('g2'), [{ id: 'pending_b' }]);
        c.getMutationCache().build(c, {
            mutationKey: ['addExpense', 'pending_a'],
            mutationFn: async () => 'noop',
        });
        const removed = sweepZombiePendingRows(c);
        expect(c.getQueryData(queryKeys.groupExpenses('g1'))).toEqual([
            { id: 'pending_a' },
        ]);
        expect(c.getQueryData(queryKeys.groupExpenses('g2'))).toEqual([]);
        expect(removed).toEqual([{ groupId: 'g2', pendingId: 'pending_b' }]);
    });
});
