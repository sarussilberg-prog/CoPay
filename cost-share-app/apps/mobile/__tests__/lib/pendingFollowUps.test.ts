import {
    registerPendingFollowUp,
    takePendingFollowUp,
    hasPendingFollowUp,
    __resetPendingFollowUpsForTests,
} from '../../lib/pendingFollowUps';

describe('pendingFollowUps', () => {
    beforeEach(() => __resetPendingFollowUpsForTests());

    it('register + take returns the stored follow-up once', () => {
        registerPendingFollowUp('pending_x', {
            kind: 'edit',
            payload: { amount: 12 } as any,
        });
        expect(takePendingFollowUp('pending_x')).toEqual({
            kind: 'edit',
            payload: { amount: 12 },
        });
        // One-shot: the second take returns null.
        expect(takePendingFollowUp('pending_x')).toBeNull();
    });

    it('hasPendingFollowUp reflects current state', () => {
        expect(hasPendingFollowUp('pending_y')).toBe(false);
        registerPendingFollowUp('pending_y', { kind: 'delete' });
        expect(hasPendingFollowUp('pending_y')).toBe(true);
        takePendingFollowUp('pending_y');
        expect(hasPendingFollowUp('pending_y')).toBe(false);
    });

    it('takePendingFollowUp on unknown id returns null', () => {
        expect(takePendingFollowUp('pending_unknown')).toBeNull();
    });
});
