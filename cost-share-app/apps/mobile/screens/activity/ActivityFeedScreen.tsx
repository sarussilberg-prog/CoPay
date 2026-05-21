/**
 * ActivityFeedScreen
 * Cross-group activity feed (Supabase) — REQ-ACT-01
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { RecentActivity } from '@cost-share/shared';
import { useActivityQuery } from '../../hooks/queries/useActivityQuery';
import { ACTIVITY_INITIAL_SKELETON_COUNT } from '../../services/activity.service';
import { resolveAutoTextInputStyle, rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';
import { EmptyState } from '../../components/EmptyState';
import { ActivityItem } from '../../components/ActivityItem';
import { ActivityItemSkeleton } from '../../components/ActivityItemSkeleton';
import { AppIcon } from '../../components/AppIcon';
import {
    ActivityFiltersSheet,
    DEFAULT_ACTIVITY_FILTERS,
    isAnyActivityFilterActive,
    type ActivityFilters,
} from '../../components/ActivityFiltersSheet';
import {
    filterAndSortActivities,
    matchesActivitySearch,
} from '../../lib/activityFilters';
import { useAppStore } from '../../store';
import { colors } from '../../theme';

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

export function ActivityFeedScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const currentUser = useAppStore((s) => s.currentUser);
    const groups = useAppStore((s) => s.groups);

    const {
        data,
        isLoading,
        isRefetching,
        isFetchingNextPage,
        isError,
        fetchNextPage,
        hasNextPage,
        refetch,
    } = useActivityQuery();

    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const canLoadMoreRef = useRef(false);

    const activities = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data],
    );

    const handleRefresh = useCallback(async () => {
        canLoadMoreRef.current = false;
        await refetch();
    }, [refetch]);

    const handleLoadMore = useCallback(() => {
        if (!canLoadMoreRef.current || !hasNextPage || isFetchingNextPage) {
            return;
        }
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const handleScrollBeginDrag = useCallback(() => {
        canLoadMoreRef.current = true;
    }, []);

    const availableCurrencies = useMemo(() => {
        const fromGroups = groups.map((g) => g.defaultCurrency);
        const fromActivities = activities
            .map((a) => a.currency)
            .filter(Boolean);
        return unique([...fromGroups, ...fromActivities]).sort();
    }, [groups, activities]);

    const availableGroups = useMemo(
        () =>
            groups
                .map((g) => ({ id: g.id, name: g.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [groups],
    );

    const groupTypeById = useMemo(
        () => Object.fromEntries(groups.map((g) => [g.id, g.groupType])),
        [groups],
    );

    const displayedActivities = useMemo(() => {
        const filtered = filterAndSortActivities(
            activities,
            filters,
            currentUser?.id,
            groupTypeById,
        );
        return filtered.filter((item) => matchesActivitySearch(item, searchQuery));
    }, [activities, filters, searchQuery, currentUser?.id, groupTypeById]);

    const filterActive = isAnyActivityFilterActive(filters);
    const showInitialSkeleton = isLoading && activities.length === 0;

    const handleActivityPress = useCallback(
        (activity: RecentActivity) => {
            if (activity.activityType === 'expense') {
                navigation.navigate('Groups', {
                    screen: 'ExpenseDetail',
                    params: { expenseId: activity.id, groupId: activity.groupId },
                });
                return;
            }
            if (
                activity.activityType === 'message' ||
                activity.activityType === 'settlement'
            ) {
                navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: activity.groupId },
                });
            }
        },
        [navigation],
    );

    const renderActivity = useCallback(
        ({ item }: { item: RecentActivity }) => (
            <ActivityItem activity={item} onPress={handleActivityPress} />
        ),
        [handleActivityPress],
    );

    const keyExtractor = useCallback(
        (item: RecentActivity) => `${item.activityType}-${item.id}`,
        [],
    );

    const listEmptyComponent = useMemo(() => {
        if (showInitialSkeleton) {
            return (
                <View>
                    {Array.from({ length: ACTIVITY_INITIAL_SKELETON_COUNT }, (_, index) => (
                        <ActivityItemSkeleton key={`activity-skeleton-${index}`} />
                    ))}
                </View>
            );
        }

        if (isError) {
            return (
                <EmptyState
                    iconName="alert-circle-outline"
                    title={t('activity.loadError')}
                    message={t('common.networkError')}
                    actionTitle={t('common.retry')}
                    onAction={handleRefresh}
                />
            );
        }

        if (searchQuery.trim().length > 0) {
            return (
                <EmptyState
                    iconName="search-outline"
                    title={t('activity.noSearchResults')}
                    message={t('activity.noSearchResultsMessage')}
                />
            );
        }

        return (
            <EmptyState
                iconName="list-outline"
                title={t('activity.noActivity')}
                message={t('activity.noActivityMessage')}
            />
        );
    }, [showInitialSkeleton, isError, t, handleRefresh, searchQuery]);

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <View className="flex-row items-center px-4 py-2">
                <View className="flex-1 flex-row items-center rounded-full bg-gray-100 px-3 h-9">
                    <AppIcon name="search" size={18} color={colors.gray500} />
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('activity.searchPlaceholder')}
                        placeholderTextColor={colors.gray400}
                        className={[
                            'flex-1 text-sm text-gray-900 mx-2',
                            rtlTextClassName(isRtl),
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        style={resolveAutoTextInputStyle(isRtl)}
                        testID="activity-search-input"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            accessibilityRole="button"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <AppIcon
                                name="close-circle"
                                size={18}
                                color={colors.gray400}
                            />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    onPress={() => setFiltersOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('activity.filters.title')}
                    className="ml-2 h-9 w-9 items-center justify-center relative"
                    testID="activity-filter-btn"
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
            </View>

            <FlatList
                data={displayedActivities}
                keyExtractor={keyExtractor}
                renderItem={renderActivity}
                contentContainerClassName="px-2 pb-4"
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                onScrollBeginDrag={handleScrollBeginDrag}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <ActivityIndicator className="py-4" color={colors.primary} />
                    ) : null
                }
                ListEmptyComponent={listEmptyComponent}
            />

            <ActivityFiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableCurrencies={availableCurrencies}
                availableGroups={availableGroups}
                onChange={setFilters}
                onClose={() => setFiltersOpen(false)}
            />
        </SafeAreaView>
    );
}
