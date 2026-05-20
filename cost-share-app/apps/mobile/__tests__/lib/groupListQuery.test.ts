import {
    DEFAULT_GROUP_LIST_FILTERS,
    isAnyGroupListFilterActive,
    passesGroupFilters,
    sortGroups,
} from '../../lib/groupListQuery';
import { GroupWithMembers } from '@cost-share/shared';

const baseGroup = (overrides: Partial<GroupWithMembers> = {}): GroupWithMembers => ({
    id: 'g1',
    name: 'Beta',
    groupType: 'general',
    defaultCurrency: 'USD',
    inviteToken: 'beta123456',
    createdBy: 'u1',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-05-01'),
    members: [],
    ...overrides,
});

describe('groupListQuery', () => {
    it('detects active sort as a filter change', () => {
        expect(isAnyGroupListFilterActive(DEFAULT_GROUP_LIST_FILTERS)).toBe(false);
        expect(
            isAnyGroupListFilterActive({
                ...DEFAULT_GROUP_LIST_FILTERS,
                sortBy: 'nameAsc',
            }),
        ).toBe(true);
    });

    it('sorts by name ascending', () => {
        const groups = [
            baseGroup({ id: 'g1', name: 'Zulu' }),
            baseGroup({ id: 'g2', name: 'Alpha' }),
        ];
        const sorted = sortGroups(groups, 'nameAsc', {});
        expect(sorted.map((g) => g.name)).toEqual(['Alpha', 'Zulu']);
    });

    it('sorts by balance descending', () => {
        const groups = [
            baseGroup({ id: 'g1', name: 'Low' }),
            baseGroup({ id: 'g2', name: 'High' }),
        ];
        const sorted = sortGroups(groups, 'balanceDesc', {
            g1: { net: 10 },
            g2: { net: 50 },
        });
        expect(sorted[0].id).toBe('g2');
    });

    it('filters balance state owed', () => {
        const group = baseGroup();
        expect(
            passesGroupFilters(
                group,
                { ...DEFAULT_GROUP_LIST_FILTERS, balanceState: 'owed' },
                5,
            ),
        ).toBe(true);
        expect(
            passesGroupFilters(
                group,
                { ...DEFAULT_GROUP_LIST_FILTERS, balanceState: 'owed' },
                -5,
            ),
        ).toBe(false);
    });
});
