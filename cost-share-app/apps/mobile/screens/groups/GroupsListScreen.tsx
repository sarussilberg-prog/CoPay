/**
 * GroupsListScreen
 * Main groups list with expandable search, filter sheet,
 * per-group balance chips, and a pinned bottom Create-a-group CTA.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { GroupType, GroupWithMembers } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { fetchGroups } from '../../services/groups.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { GroupCard } from '../../components/GroupCard';
import { SearchExpandable } from '../../components/SearchExpandable';
import {
    DEFAULT_FILTERS,
    Filters,
    FiltersSheet,
    isAnyFilterActive,
} from '../../components/FiltersSheet';
import { AppIcon } from '../../components/AppIcon';
import { colors } from '../../theme';

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function memberMatches(group: GroupWithMembers, q: string): string[] {
    if (!q) return [];
    const lower = q.toLowerCase();
    return (group.members ?? [])
        .filter(m => m.displayName.toLowerCase().includes(lower))
        .map(m => m.displayName);
}

function passesFilters(
    group: GroupWithMembers,
    filters: Filters,
    balanceNet: number | undefined,
): boolean {
    if (filters.types.length > 0 && !filters.types.includes(group.groupType)) {
        return false;
    }
    if (
        filters.currencies.length > 0 &&
        !filters.currencies.includes(group.defaultCurrency)
    ) {
        return false;
    }
    if (!filters.includeArchived && !group.isActive) {
        return false;
    }
    if (filters.balanceState !== 'all') {
        const net = balanceNet ?? 0;
        if (filters.balanceState === 'owed' && net <= 0.01) return false;
        if (filters.balanceState === 'owe' && net >= -0.01) return false;
        if (filters.balanceState === 'settled' && Math.abs(net) >= 0.01) return false;
    }
    return true;
}

export function GroupsListScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { isLoading, startLoading, stopLoading } = useLoading();
    const groups = useAppStore(s => s.groups);
    const groupBalances = useAppStore(s => s.groupBalances);

    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const loadAll = useCallback(async () => {
        await fetchGroups();
    }, []);

    useEffect(() => {
        startLoading();
        void loadAll().finally(stopLoading);
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    }, [loadAll]);

    const handleGroupPress = useCallback(
        (groupId: string) => navigation.navigate('GroupDetail', { groupId }),
        [navigation],
    );
    const handleCreateGroup = useCallback(
        () => navigation.navigate('CreateGroup'),
        [navigation],
    );

    const availableCurrencies = useMemo(
        () => unique(groups.map(g => g.defaultCurrency)),
        [groups],
    );
    const availableTypes = useMemo<GroupType[]>(
        () => unique(groups.map(g => g.groupType)),
        [groups],
    );

    const trimmedQuery = searchQuery.trim();

    const filteredRows = useMemo(() => {
        const lowerQ = trimmedQuery.toLowerCase();
        return groups
            .map(g => {
                const matched = memberMatches(g, lowerQ);
                const nameHit =
                    !lowerQ || g.name.toLowerCase().includes(lowerQ);
                const searchHit = !lowerQ || nameHit || matched.length > 0;
                return { group: g, matched, searchHit };
            })
            .filter(({ group, searchHit }) => {
                if (!searchHit) return false;
                const net = groupBalances[group.id]?.net;
                return passesFilters(group, filters, net);
            });
    }, [groups, trimmedQuery, filters, groupBalances]);

    const filterActive = isAnyFilterActive(filters);

    if (isLoading && groups.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <View className="flex-row items-center px-4 py-2">
                <SearchExpandable
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    expanded={searchExpanded}
                    onExpandedChange={setSearchExpanded}
                    testID="groups-search"
                />
                {!searchExpanded && (
                    <>
                        <TouchableOpacity
                            onPress={() => setFiltersOpen(true)}
                            accessibilityRole="button"
                            accessibilityLabel={t('groups.filters.title')}
                            className="ml-1 h-9 w-9 items-center justify-center relative"
                            testID="groups-filter-btn"
                        >
                            <AppIcon
                                name="options-outline"
                                size={22}
                                color={colors.gray500}
                            />
                            {filterActive && (
                                <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                            )}
                        </TouchableOpacity>
                        <View className="flex-1" />
                        <TouchableOpacity
                            onPress={handleCreateGroup}
                            accessibilityRole="button"
                            accessibilityLabel={t('groups.createGroup')}
                            className="h-9 w-9 items-center justify-center"
                            testID="groups-create-btn"
                        >
                            <AppIcon name="add" size={26} color={colors.gray700} />
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <FlatList
                data={filteredRows}
                keyExtractor={item => item.group.id}
                renderItem={({ item }) => (
                    <GroupCard
                        group={item.group}
                        balance={groupBalances[item.group.id]}
                        searchQuery={trimmedQuery || undefined}
                        matchedMemberNames={
                            item.matched.length > 0 ? item.matched : undefined
                        }
                        onPress={handleGroupPress}
                    />
                )}
                className="flex-1"
                contentContainerClassName="px-4 pb-24"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        iconName="people-outline"
                        title={t('groups.noGroups')}
                        message={t('groups.noGroupsMessage')}
                        actionTitle={t('groups.createGroup')}
                        onAction={handleCreateGroup}
                    />
                }
            />

            {filteredRows.length > 0 && (
                <SafeAreaView edges={['bottom']} className="bg-slate-50">
                    <View className="px-4 pb-2 pt-2 border-t border-gray-100 bg-slate-50">
                        <TouchableOpacity
                            onPress={handleCreateGroup}
                            activeOpacity={0.85}
                            className="h-14 rounded-2xl bg-primary items-center justify-center flex-row"
                            testID="groups-bottom-cta"
                        >
                            <AppIcon name="add" size={22} color="#fff" />
                            <Text className="text-base font-semibold text-white ml-2">
                                {t('groups.bigCreateCta')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            )}

            <FiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableTypes={availableTypes}
                availableCurrencies={availableCurrencies}
                onApply={setFilters}
                onClose={() => setFiltersOpen(false)}
            />
        </SafeAreaView>
    );
}
