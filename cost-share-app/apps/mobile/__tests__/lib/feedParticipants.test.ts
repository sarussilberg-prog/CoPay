import { collectFeedUserIds } from '../../lib/feedParticipants';
import type { ExpenseWithDelta, GroupMessage, Settlement } from '@cost-share/shared';

const expense = (createdBy: string, paidBy: string): ExpenseWithDelta =>
    ({
        id: 'e1',
        groupId: 'g1',
        createdBy,
        paidBy,
        description: 'x',
        amount: 10,
        currency: 'ILS',
        expenseDate: new Date(),
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        myDelta: 0,
        myDeltaState: 'settled',
    }) as ExpenseWithDelta;

const message = (userId: string): GroupMessage =>
    ({
        id: 'm1',
        groupId: 'g1',
        userId,
        body: 'hi',
        createdAt: new Date(),
    }) as GroupMessage;

const settlement = (from: string, to: string, by: string): Settlement =>
    ({
        id: 's1',
        groupId: 'g1',
        fromUserId: from,
        toUserId: to,
        createdBy: by,
        amount: 5,
        currency: 'ILS',
        settlementDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    }) as Settlement;

describe('collectFeedUserIds', () => {
    it('collects unique user ids from expenses, messages, and settlements', () => {
        const ids = collectFeedUserIds(
            [expense('u1', 'u2')],
            [message('u3')],
            [settlement('u4', 'u5', 'u6')],
        );
        expect(ids.sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].sort());
    });

    it('deduplicates repeated ids', () => {
        const ids = collectFeedUserIds(
            [expense('u1', 'u1')],
            [message('u1')],
            [],
        );
        expect(ids).toEqual(['u1']);
    });
});
