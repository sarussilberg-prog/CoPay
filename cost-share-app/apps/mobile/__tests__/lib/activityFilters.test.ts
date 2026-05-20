import {
    DEFAULT_ACTIVITY_FILTERS,
    filterAndSortActivities,
    isAnyActivityFilterActive,
    matchesActivitySearch,
} from '../../lib/activityFilters';
import { RecentActivity } from '@cost-share/shared';

function activity(
    overrides: Partial<RecentActivity> & Pick<RecentActivity, 'id' | 'activityType'>,
): RecentActivity {
    return {
        groupId: 'g1',
        description: 'Item',
        amount: 10,
        currency: 'USD',
        userId: 'u1',
        userName: 'Alice',
        activityDate: new Date('2026-05-01'),
        createdAt: new Date('2026-05-01'),
        ...overrides,
    };
}

describe('activityFilters', () => {
    const items: RecentActivity[] = [
        activity({
            id: 'e1',
            activityType: 'expense',
            amount: 50,
            currency: 'USD',
            activityDate: new Date('2026-05-10'),
            userId: 'me',
        }),
        activity({
            id: 's1',
            activityType: 'settlement',
            amount: 20,
            currency: 'ILS',
            activityDate: new Date('2026-05-05'),
            userId: 'other',
        }),
        activity({
            id: 'm1',
            activityType: 'message',
            description: 'Hello team',
            currency: '',
            amount: 0,
            activityDate: new Date('2026-05-03'),
            userId: 'me',
        }),
    ];

    it('returns all when filters are default', () => {
        expect(filterAndSortActivities(items, DEFAULT_ACTIVITY_FILTERS)).toHaveLength(3);
    });

    it('filters by activity type', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            types: ['expense'],
        });
        expect(result.map((i) => i.id)).toEqual(['e1']);
    });

    it('filters messages only', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            types: ['message'],
        });
        expect(result.map((i) => i.id)).toEqual(['m1']);
    });

    it('excludes messages when filtering by currency', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            currencies: ['USD'],
        });
        expect(result.map((i) => i.id)).toEqual(['e1']);
    });

    it('filters by currency', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            currencies: ['ILS'],
        });
        expect(result.map((i) => i.id)).toEqual(['s1']);
    });

    it('filters by group type', () => {
        const result = filterAndSortActivities(
            items,
            { ...DEFAULT_ACTIVITY_FILTERS, groupTypes: ['trip'] },
            undefined,
            { g1: 'trip', g2: 'home' },
        );
        expect(result.map((i) => i.id)).toEqual(['e1', 's1', 'm1']);
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

    it('filters onlyMine by current user', () => {
        const result = filterAndSortActivities(
            items,
            { ...DEFAULT_ACTIVITY_FILTERS, onlyMine: true },
            'me',
        );
        expect(result.map((i) => i.id)).toEqual(['e1', 'm1']);
    });

    it('sorts by amount descending', () => {
        const result = filterAndSortActivities(items, {
            ...DEFAULT_ACTIVITY_FILTERS,
            sortBy: 'amountDesc',
        });
        expect(result.map((i) => i.id)).toEqual(['e1', 's1', 'm1']);
    });

    it('matches search on description', () => {
        const item = items[0];
        expect(matchesActivitySearch(item, 'item')).toBe(true);
        expect(matchesActivitySearch(item, 'zzz')).toBe(false);
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
