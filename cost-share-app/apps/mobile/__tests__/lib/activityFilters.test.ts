import {
    DEFAULT_ACTIVITY_FILTERS,
    filterAndSortActivities,
    isAnyActivityFilterActive,
    matchesActivitySearch,
} from '../../lib/activityFilters';
import type { ActivityEvent, ActivityEventKind } from '@cost-share/shared';

function event(
    overrides: Partial<ActivityEvent> & Pick<ActivityEvent, 'id' | 'kind'>,
): ActivityEvent {
    const { metadata: metaOverride, ...rest } = overrides;
    return {
        userId: 'u-me',
        groupId: 'g1',
        refId: 'src-1',
        actorUserId: 'u1',
        createdAt: new Date('2026-05-01'),
        metadata: {
            description: 'Item',
            amount: 10,
            currency: 'USD',
            ...(metaOverride ?? {}),
        },
        ...rest,
    };
}

describe('activityFilters', () => {
    const items: ActivityEvent[] = [
        event({
            id: 'e1',
            kind: 'expense_added',
            actorUserId: 'me',
            createdAt: new Date('2026-05-10'),
            metadata: { description: 'Lunch', amount: 50, currency: 'USD' },
        }),
        event({
            id: 's1',
            kind: 'settlement_added',
            actorUserId: 'other',
            createdAt: new Date('2026-05-05'),
            metadata: { amount: 20, currency: 'ILS' },
        }),
        event({
            id: 'm1',
            kind: 'message_posted',
            actorUserId: 'me',
            createdAt: new Date('2026-05-03'),
            metadata: { body: 'Hello team' },
        }),
    ];

    it('returns all when filters are default', () => {
        expect(filterAndSortActivities(items, DEFAULT_ACTIVITY_FILTERS)).toHaveLength(3);
    });

    it('filters by expense type chip and keeps membership rows', () => {
        const membership = event({
            id: 'ga1',
            kind: 'group_added',
            createdAt: new Date('2026-05-08'),
            metadata: {},
        });
        const friend = event({
            id: 'fr1',
            kind: 'friend_request_received',
            createdAt: new Date('2026-05-07'),
            metadata: { status: 'pending' },
        });
        const list = [...items, membership, friend];
        const result = filterAndSortActivities(list, {
            ...DEFAULT_ACTIVITY_FILTERS,
            types: ['expense'],
        });
        const ids = result.map(i => i.id).sort();
        expect(ids).toEqual(['e1', 'fr1', 'ga1'].sort());
    });

    it('filters messages only and still keeps membership rows', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            types: ['message'],
        });
        expect(result.map(i => i.id)).toEqual(['m1']);
    });

    it('lets message and membership rows pass through a currency filter', () => {
        const membership = event({
            id: 'ga1',
            kind: 'group_added',
            createdAt: new Date('2026-05-08'),
            metadata: {},
        });
        const result = filterAndSortActivities([...items, membership], {
            ...DEFAULT_ACTIVITY_FILTERS,
            currencies: ['USD'],
        });
        const ids = result.map(i => i.id).sort();
        // expense USD kept, settlement ILS dropped, message kept, group_added kept
        expect(ids).toEqual(['e1', 'ga1', 'm1'].sort());
    });

    it('filters by currency for expense/settlement only', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            currencies: ['ILS'],
        });
        const ids = result.map(i => i.id).sort();
        expect(ids).toEqual(['m1', 's1'].sort());
    });

    it('filters by group type', () => {
        const result = filterAndSortActivities(
            items,
            { ...DEFAULT_ACTIVITY_FILTERS, groupTypes: ['trip'] },
            undefined,
            { g1: 'trip', g2: 'home' },
        );
        expect(result.map(i => i.id).sort()).toEqual(['e1', 'm1', 's1']);
    });

    it('excludes items when group type does not match', () => {
        const result = filterAndSortActivities(
            items,
            { ...DEFAULT_ACTIVITY_FILTERS, groupTypes: ['home'] },
            undefined,
            { g1: 'trip' },
        );
        expect(result).toHaveLength(0);
    });

    it('filters onlyMine by actorUserId === currentUserId', () => {
        const result = filterAndSortActivities(
            items,
            { ...DEFAULT_ACTIVITY_FILTERS, onlyMine: true },
            'me',
        );
        expect(result.map(i => i.id).sort()).toEqual(['e1', 'm1']);
    });

    it('sorts by amount descending using metadata.amount', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            sortBy: 'amountDesc',
        });
        expect(result.map(i => i.id)).toEqual(['e1', 's1', 'm1']);
    });

    it('sorts by amount ascending using metadata.amount', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            sortBy: 'amountAsc',
        });
        // m1 has no amount → 0, s1 → 20, e1 → 50
        expect(result.map(i => i.id)).toEqual(['m1', 's1', 'e1']);
    });

    it('matches search on description', () => {
        const expense = items[0];
        expect(matchesActivitySearch(expense, 'lunch')).toBe(true);
        expect(matchesActivitySearch(expense, 'zzz')).toBe(false);
    });

    it('matches search on message body', () => {
        const message = items[2];
        expect(matchesActivitySearch(message, 'hello')).toBe(true);
    });

    it('matches search on group name when groupNameById is provided', () => {
        const expense = items[0]; // groupId: 'g1'
        const groupNameById = { g1: 'Trip 2026' };
        expect(matchesActivitySearch(expense, 'Trip', groupNameById)).toBe(true);
        expect(matchesActivitySearch(expense, '2026', groupNameById)).toBe(true);
        // Without the lookup, group name is not in the haystack
        expect(matchesActivitySearch(expense, 'Trip')).toBe(false);
    });

    it('detects active filters', () => {
        expect(isAnyActivityFilterActive(DEFAULT_ACTIVITY_FILTERS)).toBe(false);
        expect(
            isAnyActivityFilterActive({
                ...DEFAULT_ACTIVITY_FILTERS,
                types: ['expense'],
            }),
        ).toBe(true);
    });
});
