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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
    ExpenseWithDelta,
    GroupMemberLite,
    RecentActivity,
    Settlement,
} from '@cost-share/shared';
import { useActivityQuery } from '../../hooks/queries/useActivityQuery';
import { ACTIVITY_INITIAL_SKELETON_COUNT } from '../../services/activity.service';
import {
    deleteExpense,
    getExpenseWithSplitsById,
} from '../../services/expenses.service';
import { getSettlementById } from '../../services/settlements.service';
import { decorateExpense } from '../../services/expense-delta';
import { fetchProfilesByUserIds } from '../../services/groups.service';
import { resolveAutoTextInputStyle, rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';
import { EmptyState } from '../../components/EmptyState';
import { ActivityItem } from '../../components/ActivityItem';
import { ActivityItemSkeleton } from '../../components/ActivityItemSkeleton';
import { AppIcon } from '../../components/AppIcon';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
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
import type { GroupDetailFocusFeedItem } from '../../lib/groupDetailFocus';

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

type FeedDetailItem =
    | { kind: 'expense'; expense: ExpenseWithDelta }
    | { kind: 'settlement'; settlement: Settlement };

export function ActivityFeedScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const currentUser = useAppStore((s) => s.currentUser);
    const groups = useAppStore((s) => s.groups);

    const {
        data,
        isLoading,
        isFetchingNextPage,
        isError,
        fetchNextPage,
        hasNextPage,
        refetch,
        isStale,
    } = useActivityQuery();

    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [detailItem, setDetailItem] = useState<FeedDetailItem | null>(null);
    const [detailMembers, setDetailMembers] = useState<
        Record<string, GroupMemberLite>
    >({});
    const [pendingDelete, setPendingDelete] = useState(false);
    // Show the pull-to-refresh spinner ONLY for explicit user pulls.
    // Background refetches (realtime invalidation, focus-when-stale) update
    // the list silently — they must not flip the spinner on.
    const [userRefreshing, setUserRefreshing] = useState(false);
    const canLoadMoreRef = useRef(false);

    const activities = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data],
    );

    const handleRefresh = useCallback(async () => {
        canLoadMoreRef.current = false;
        setUserRefreshing(true);
        try {
            await refetch();
        } finally {
            setUserRefreshing(false);
        }
    }, [refetch]);

    // Only refetch on focus when cached data is stale (older than the
    // query's staleTime). Without this gate, every tab focus forced a
    // visible refresh-spinner reload of unchanged data.
    useFocusEffect(
        useCallback(() => {
            if (isStale) {
                void refetch();
            }
        }, [refetch, isStale]),
    );

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

    const groupNameById = useMemo(
        () => Object.fromEntries(groups.map((g) => [g.id, g.name])),
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

    const navigateToGroupWithFocus = useCallback(
        (groupId: string, focusFeedItem: GroupDetailFocusFeedItem) => {
            setDetailItem(null);
            navigation.navigate('Groups', {
                screen: 'GroupDetail',
                params: { groupId, focusFeedItem },
                merge: true,
            });
        },
        [navigation],
    );

    const detailOpenInGroup = useMemo(() => {
        if (!detailItem) return undefined;
        const groupId =
            detailItem.kind === 'expense'
                ? detailItem.expense.groupId
                : detailItem.settlement.groupId;
        const groupName = groupNameById[groupId];
        if (!groupName) return undefined;
        const focusFeedItem: GroupDetailFocusFeedItem =
            detailItem.kind === 'expense'
                ? { kind: 'expense', id: detailItem.expense.id }
                : { kind: 'settlement', id: detailItem.settlement.id };
        return {
            label: t('activity.openInGroup', { group: groupName }),
            onPress: () => navigateToGroupWithFocus(groupId, focusFeedItem),
        };
    }, [detailItem, groupNameById, navigateToGroupWithFocus, t]);

    const openExpenseDetail = useCallback(
        async (expenseId: string) => {
            const expense = await getExpenseWithSplitsById(expenseId);
            if (!expense) return;
            const decorated = decorateExpense(expense, currentUser?.id ?? '');
            const userIds = Array.from(
                new Set([
                    expense.paidBy,
                    expense.createdBy,
                    ...expense.splits.map((s) => s.userId),
                ].filter(Boolean)),
            );
            const profiles = await fetchProfilesByUserIds(userIds);
            setDetailMembers(profiles);
            setDetailItem({ kind: 'expense', expense: decorated });
        },
        [currentUser?.id],
    );

    const openSettlementDetail = useCallback(async (settlementId: string) => {
        const settlement = await getSettlementById(settlementId);
        if (!settlement) return;
        const userIds = Array.from(
            new Set(
                [
                    settlement.fromUserId,
                    settlement.toUserId,
                    settlement.createdBy,
                ].filter(Boolean),
            ),
        );
        const profiles = await fetchProfilesByUserIds(userIds);
        setDetailMembers(profiles);
        setDetailItem({ kind: 'settlement', settlement });
    }, []);

    const handleActivityPress = useCallback(
        (activity: RecentActivity) => {
            if (activity.activityType === 'friend_request') {
                navigation.navigate('Profile', { screen: 'Friends' });
                return;
            }
            if (activity.activityType === 'expense') {
                void openExpenseDetail(activity.id);
                return;
            }
            if (activity.activityType === 'settlement') {
                void openSettlementDetail(activity.id);
                return;
            }
            if (activity.groupId) {
                navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: activity.groupId },
                });
            }
        },
        [navigation, openExpenseDetail, openSettlementDetail],
    );

    const handleDetailEdit = useCallback(() => {
        if (!detailItem) return;
        if (detailItem.kind === 'expense') {
            const { id: expenseId, groupId } = detailItem.expense;
            setDetailItem(null);
            navigation.navigate('Groups', {
                screen: 'AddExpense',
                params: { expenseId, groupId },
            });
            return;
        }
        const { groupId, id } = detailItem.settlement;
        navigateToGroupWithFocus(groupId, { kind: 'settlement', id });
    }, [detailItem, navigateToGroupWithFocus]);

    const handleDetailDeleteRequest = useCallback(() => {
        if (!detailItem) return;
        if (detailItem.kind === 'settlement') {
            const { groupId, id } = detailItem.settlement;
            navigateToGroupWithFocus(groupId, { kind: 'settlement', id });
            return;
        }
        setPendingDelete(true);
    }, [detailItem, navigateToGroupWithFocus]);

    const handleConfirmDelete = useCallback(async () => {
        if (!detailItem || detailItem.kind !== 'expense') {
            setPendingDelete(false);
            return;
        }
        const ok = await deleteExpense(detailItem.expense.id);
        setPendingDelete(false);
        if (ok) {
            setDetailItem(null);
            void refetch();
        }
    }, [detailItem, refetch]);

    const renderActivity = useCallback(
        ({ item }: { item: RecentActivity }) => (
            <ActivityItem
                activity={item}
                groupName={groupNameById[item.groupId]}
                onPress={handleActivityPress}
            />
        ),
        [handleActivityPress, groupNameById],
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
                contentContainerClassName="px-3 pb-4"
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews
                refreshControl={
                    <RefreshControl
                        refreshing={userRefreshing}
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

            <FeedItemDetailSheet
                item={detailItem}
                memberMap={detailMembers}
                currentUserId={currentUser?.id ?? ''}
                onClose={() => setDetailItem(null)}
                onEdit={handleDetailEdit}
                onDelete={handleDetailDeleteRequest}
                onOpenInGroup={detailOpenInGroup?.onPress}
                openInGroupLabel={detailOpenInGroup?.label}
            />

            <ConfirmDialog
                visible={pendingDelete}
                title={t('expenses.deleteExpense')}
                message={t('expenses.deleteExpenseConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={() => {
                    void handleConfirmDelete();
                }}
                onCancel={() => setPendingDelete(false)}
                destructive
            />
        </SafeAreaView>
    );
}
