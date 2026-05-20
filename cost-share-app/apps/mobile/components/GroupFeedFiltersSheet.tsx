/**
 * GroupFeedFiltersSheet — filter & sort bottom sheet for the group detail feed.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExpenseCategory, GroupMemberLite } from '@cost-share/shared';
import { FilterBottomSheet } from './filters/FilterBottomSheet';
import { FilterSection } from './filters/FilterSection';
import { FilterSingleChipGrid } from './filters/FilterSingleChipGrid';
import { FilterChipGrid } from './filters/FilterChipGrid';
import { FilterDateRange } from './filters/FilterDateRange';
import {
    DEFAULT_GROUP_FEED_FILTERS,
    GroupFeedFilters,
    GroupFeedSortOption,
    GroupFeedTypeFilter,
} from '../lib/groupFeedFilters';

export type { GroupFeedFilters, GroupFeedSortOption, GroupFeedTypeFilter };
export {
    DEFAULT_GROUP_FEED_FILTERS,
    isAnyGroupFeedFilterActive,
} from '../lib/groupFeedFilters';

interface GroupFeedFiltersSheetProps {
    visible: boolean;
    filters: GroupFeedFilters;
    availableCategories: ExpenseCategory[];
    availableMembers: GroupMemberLite[];
    onChange: (next: GroupFeedFilters) => void;
    onClose: () => void;
}

export function GroupFeedFiltersSheet({
    visible,
    filters,
    availableCategories,
    availableMembers,
    onChange,
    onClose,
}: GroupFeedFiltersSheetProps) {
    const { t } = useTranslation();

    const sortOptions: { key: GroupFeedSortOption; label: string }[] = [
        { key: 'dateDesc', label: t('activity.sortDateDesc') },
        { key: 'dateAsc', label: t('activity.sortDateAsc') },
    ];

    const typeOptions: { key: GroupFeedTypeFilter; label: string }[] = [
        { key: 'expense', label: t('activity.expense') },
        { key: 'settlement', label: t('activity.settlement') },
        { key: 'message', label: t('activity.message') },
    ];
    const allTypeKeys = typeOptions.map(opt => opt.key);

    const categoryOptions = availableCategories.map(c => ({
        key: c,
        label: t(`expenses.categories.${c}`, { defaultValue: c }),
    }));
    const allCategoryKeys = availableCategories;

    const memberOptions = availableMembers.map(m => ({
        key: m.userId,
        label: m.displayName,
    }));
    const allMemberIds = availableMembers.map(m => m.userId);

    return (
        <FilterBottomSheet
            visible={visible}
            filters={filters}
            title={t('groups.filters.title')}
            subtitle={t('groups.filters.feedSubtitle')}
            onChange={onChange}
            onClose={onClose}
            onClear={() => DEFAULT_GROUP_FEED_FILTERS}
        >
            {({ filters: f, patch }) => (
                <>
                    <FilterSection first label={t('groups.filters.sort.label')}>
                        <FilterSingleChipGrid
                            value={f.sortBy}
                            options={sortOptions}
                            onChange={sortBy => patch({ sortBy })}
                        />
                    </FilterSection>

                    <FilterSection
                        label={t('groups.filters.feedTypes.label')}
                        hint={t('groups.filters.feedTypes.hint')}
                    >
                        <FilterChipGrid
                            allLabel={t('activity.filterAll')}
                            selected={f.types}
                            allValues={allTypeKeys}
                            options={typeOptions}
                            onChange={types => patch({ types })}
                        />
                    </FilterSection>

                    {availableCategories.length > 0 && (
                        <FilterSection label={t('groups.filters.category.label')}>
                            <FilterChipGrid
                                allLabel={t('activity.filterAll')}
                                selected={f.categories}
                                allValues={allCategoryKeys}
                                options={categoryOptions}
                                onChange={categories => patch({ categories })}
                            />
                        </FilterSection>
                    )}

                    {availableMembers.length > 0 && (
                        <FilterSection label={t('groups.filters.member.label')}>
                            <FilterChipGrid
                                allLabel={t('activity.filterAll')}
                                selected={f.memberIds}
                                allValues={allMemberIds}
                                options={memberOptions}
                                onChange={memberIds => patch({ memberIds })}
                            />
                        </FilterSection>
                    )}

                    <FilterSection label={t('groups.filters.dateRange.label')}>
                        <FilterDateRange
                            dateFrom={f.dateFrom}
                            dateTo={f.dateTo}
                            onChangeFrom={dateFrom => patch({ dateFrom })}
                            onChangeTo={dateTo => patch({ dateTo })}
                        />
                    </FilterSection>
                </>
            )}
        </FilterBottomSheet>
    );
}
