/**
 * ActivityFiltersSheet — sort + filter bottom sheet for the activity feed.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBottomSheet } from './filters/FilterBottomSheet';
import { FilterSection } from './filters/FilterSection';
import { FilterSingleChipGrid } from './filters/FilterSingleChipGrid';
import { FilterChipGrid } from './filters/FilterChipGrid';
import { GroupTypeFilterGrid } from './filters/GroupTypeFilterGrid';
import { FilterToggleRow } from './filters/FilterToggleRow';
import { FilterDateRange } from './filters/FilterDateRange';
import {
    ActivityFilters,
    ActivitySortOption,
    ActivityTypeFilter,
    DEFAULT_ACTIVITY_FILTERS,
} from '../lib/activityFilters';
import { getCurrencySymbol } from '../lib/currencyDisplay';

export type { ActivityFilters, ActivitySortOption, ActivityTypeFilter };
export { DEFAULT_ACTIVITY_FILTERS, isAnyActivityFilterActive } from '../lib/activityFilters';

interface GroupOption {
    id: string;
    name: string;
}

interface ActivityFiltersSheetProps {
    visible: boolean;
    filters: ActivityFilters;
    availableCurrencies: string[];
    availableGroups: GroupOption[];
    onChange: (next: ActivityFilters) => void;
    onClose: () => void;
}

export function ActivityFiltersSheet({
    visible,
    filters,
    availableCurrencies,
    availableGroups,
    onChange,
    onClose,
}: ActivityFiltersSheetProps) {
    const { t } = useTranslation();

    const sortOptions: { key: ActivitySortOption; label: string }[] = [
        { key: 'dateDesc', label: t('activity.sortDateDesc') },
        { key: 'dateAsc', label: t('activity.sortDateAsc') },
        { key: 'amountDesc', label: t('activity.sortAmountDesc') },
        { key: 'amountAsc', label: t('activity.sortAmountAsc') },
    ];

    const typeOptions: { key: ActivityTypeFilter; label: string }[] = [
        { key: 'expense', label: t('activity.expense') },
        { key: 'settlement', label: t('activity.settlement') },
        { key: 'message', label: t('activity.message') },
    ];
    const allTypeKeys = typeOptions.map((opt) => opt.key);

    const currencyOptions = availableCurrencies.map((c) => ({
        key: c,
        label: getCurrencySymbol(c),
    }));

    const groupOptions = availableGroups.map((g) => ({
        key: g.id,
        label: g.name,
    }));
    const allGroupIds = availableGroups.map((g) => g.id);

    return (
        <FilterBottomSheet
            visible={visible}
            filters={filters}
            title={t('activity.filters.title')}
            subtitle={t('activity.filters.subtitle')}
            onChange={onChange}
            onClose={onClose}
            onClear={() => DEFAULT_ACTIVITY_FILTERS}
        >
            {({ filters: f, patch }) => (
                <>
                    <FilterSection
                        first
                        label={t('activity.filters.sort.label')}
                    >
                        <FilterSingleChipGrid
                            value={f.sortBy}
                            options={sortOptions}
                            onChange={(sortBy) => patch({ sortBy })}
                        />
                    </FilterSection>

                    <FilterSection
                        label={t('activity.filters.types.label')}
                        hint={t('activity.filters.types.hint')}
                    >
                        <FilterChipGrid
                            allLabel={t('activity.filterAll')}
                            selected={f.types}
                            allValues={allTypeKeys}
                            options={typeOptions}
                            onChange={(types) => patch({ types })}
                        />
                    </FilterSection>

                    <FilterSection
                        label={t('groups.filters.type.label')}
                        hint={t('groups.filters.type.hint')}
                    >
                        <GroupTypeFilterGrid
                            allLabel={t('activity.filterAll')}
                            selected={f.groupTypes}
                            onChange={(groupTypes) => patch({ groupTypes })}
                        />
                    </FilterSection>

                    {availableCurrencies.length > 0 && (
                        <FilterSection label={t('activity.filters.currency.label')}>
                            <FilterChipGrid
                                allLabel={t('activity.filterAll')}
                                selected={f.currencies}
                                allValues={availableCurrencies}
                                options={currencyOptions}
                                onChange={(currencies) => patch({ currencies })}
                            />
                        </FilterSection>
                    )}

                    {availableGroups.length > 0 && (
                        <FilterSection label={t('activity.filters.group.label')}>
                            <FilterChipGrid
                                allLabel={t('activity.filterAll')}
                                selected={f.groupIds}
                                allValues={allGroupIds}
                                options={groupOptions}
                                onChange={(groupIds) => patch({ groupIds })}
                            />
                        </FilterSection>
                    )}

                    <FilterSection>
                        <FilterToggleRow
                            label={t('activity.filters.onlyMine')}
                            hint={t('activity.filters.onlyMineHint')}
                            value={f.onlyMine}
                            onValueChange={(onlyMine) => patch({ onlyMine })}
                        />
                    </FilterSection>

                    <FilterSection label={t('groups.filters.dateRange.label')}>
                        <FilterDateRange
                            dateFrom={f.dateFrom}
                            dateTo={f.dateTo}
                            onChangeFrom={(dateFrom) => patch({ dateFrom })}
                            onChangeTo={(dateTo) => patch({ dateTo })}
                        />
                    </FilterSection>
                </>
            )}
        </FilterBottomSheet>
    );
}
