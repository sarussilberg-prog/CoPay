import { useAppStore } from '../../store';
import {
    clearGroupFeedHydration,
    hasStoreGroupMembers,
    isGroupExpensesHydrated,
    isGroupFeedHydrated,
    isGroupMessagesHydrated,
    markGroupExpensesHydrated,
} from '../../lib/groupFeedCache';

describe('groupFeedCache', () => {
    beforeEach(() => {
        clearGroupFeedHydration();
        useAppStore.setState({
            groups: [],
            messagesByGroup: {},
        });
    });

    it('tracks hydrated expenses per group', () => {
        expect(isGroupExpensesHydrated('g1')).toBe(false);
        markGroupExpensesHydrated('g1');
        expect(isGroupExpensesHydrated('g1')).toBe(true);
        expect(isGroupExpensesHydrated('g2')).toBe(false);
    });

    it('detects cached messages from the store', () => {
        expect(isGroupMessagesHydrated('g1')).toBe(false);
        useAppStore.getState().setGroupMessages('g1', []);
        expect(isGroupMessagesHydrated('g1')).toBe(true);
    });

    it('requires both expenses and messages before feed is hydrated', () => {
        expect(isGroupFeedHydrated('g1')).toBe(false);
        markGroupExpensesHydrated('g1');
        expect(isGroupFeedHydrated('g1')).toBe(false);
        useAppStore.getState().setGroupMessages('g1', []);
        expect(isGroupFeedHydrated('g1')).toBe(true);
    });

    it('detects members already loaded with groups list', () => {
        useAppStore.getState().setGroups([
            {
                id: 'g1',
                name: 'Trip',
                groupType: 'trip',
                defaultCurrency: 'USD',
                inviteToken: 'tok',
                createdBy: 'u1',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: [{ userId: 'u1', displayName: 'Ada', isActive: true }],
                isArchivedByMe: false,
                isAutoArchived: false,
            },
        ]);
        expect(hasStoreGroupMembers('g1')).toBe(true);
        expect(hasStoreGroupMembers('g2')).toBe(false);
    });
});
