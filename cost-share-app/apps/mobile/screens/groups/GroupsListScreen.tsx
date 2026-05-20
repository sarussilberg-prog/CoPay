/**
 * GroupsListScreen
 * Main groups list with expandable search, filter/sort sheet,
 * per-group balance chips, and a floating bottom Create-a-kupa CTA.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GroupWithMembers } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { fetchGroups } from '../../services/groups.service';
import { fetchBalanceSummary } from '../../services/users.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { GroupCard } from '../../components/GroupCard';
import { SearchExpandable } from '../../components/SearchExpandable';
import {
    BalanceState,
    DEFAULT_FILTERS,
    Filters,
    FiltersSheet,
    isAnyFilterActive,
} from '../../components/FiltersSheet';
import {
    passesGroupFilters,
    sortGroups,
} from '../../lib/groupListQuery';
import { AppIcon } from '../../components/AppIcon';
import { colors, shadows } from '../../theme';

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

export function GroupsListScreen() {
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { isLoading, startLoading, stopLoading } = useLoading();
    const groups = useAppStore(s => s.groups);
    const groupBalances = useAppStore(s => s.groupBalances);

    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const incomingBalanceState = route.params?.balanceState as BalanceState | undefined;
    const incomingShowArchived = route.params?.showArchived as boolean | undefined;
    useEffect(() => {
        if (incomingBalanceState === undefined && incomingShowArchived === undefined) return;
        setFilters(f => ({
            ...f,
            ...(incomingBalanceState !== undefined && { balanceState: incomingBalanceState }),
            ...(incomingShowArchived !== undefined && { showArchived: incomingShowArchived }),
        }));
        navigation.setParams({ balanceState: undefined, showArchived: undefined });
    }, [incomingBalanceState, incomingShowArchived, navigation]);

    const loadAll = useCallback(async () => {
        await Promise.all([fetchGroups(), fetchBalanceSummary()]);
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
    const trimmedQuery = searchQuery.trim();
    const sortLocale = i18n.language.startsWith('he') ? 'he' : undefined;

    const filteredRows = useMemo(() => {
        const lowerQ = trimmedQuery.toLowerCase();
        const matched = groups
            .map(g => {
                const matchedNames = memberMatches(g, lowerQ);
                const nameHit =
                    !lowerQ || g.name.toLowerCase().includes(lowerQ);
                const searchHit = !lowerQ || nameHit || matchedNames.length > 0;
                return { group: g, matched: matchedNames, searchHit };
            })
            .filter(({ group, searchHit }) => {
                if (!searchHit) return false;
                const net = groupBalances[group.id]?.net;
                return passesGroupFilters(group, filters, net);
            });

        const sortedGroups = sortGroups(
            matched.map(r => r.group),
            filters.sortBy,
            groupBalances,
            sortLocale,
        );
        const order = new Map(sortedGroups.map((g, i) => [g.id, i]));
        return [...matched].sort(
            (a, b) => (order.get(a.group.id) ?? 0) - (order.get(b.group.id) ?? 0),
        );
    }, [groups, trimmedQuery, filters, groupBalances, sortLocale]);

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
                            className="h-9 w-9 items-center justify-center rounded-full bg-primary"
                            testID="groups-create-btn"
                        >
                            <AppIcon name="add" size={22} color={colors.white} />
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <View className="flex-1">
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
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: insets.bottom + 80,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.primary}
                        />
                    }
                    ListEmptyComponent={
                        filters.showArchived ? (
                            <View className="px-4 py-10 items-center">
                                <Text className="text-sm text-gray-500">
                                    {t('groups.archive.noArchived')}
                                </Text>
                            </View>
                        ) : (
                            <EmptyState
                                iconName="people-outline"
                                title={t('groups.noGroups')}
                                message={t('groups.noGroupsMessage')}
                                actionTitle={t('groups.createGroup')}
                                onAction={handleCreateGroup}
                            />
                        )
                    }
                />

                {filteredRows.length > 0 && (
                    <View
                        pointerEvents="box-none"
                        style={{
                            position: 'absolute',
                            left: 16,
                            right: 16,
                            bottom: insets.bottom + 8,
                        }}
                    >
                        <TouchableOpacity
                            onPress={handleCreateGroup}
                            activeOpacity={0.85}
                            className="h-14 rounded-2xl bg-primary items-center justify-center flex-row"
                            style={shadows.lg}
                            testID="groups-bottom-cta"
                        >
                            <AppIcon name="add" size={22} color="#fff" />
                            <Text className="text-base font-semibold text-white ml-2">
                                {t('groups.bigCreateCta')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <FiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableCurrencies={availableCurrencies}
                onChange={setFilters}
                onClose={() => setFiltersOpen(false)}
            />
        </SafeAreaView>
    );
}
