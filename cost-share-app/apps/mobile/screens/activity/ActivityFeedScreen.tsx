/**
 * ActivityFeedScreen — cross-group feed driven by activity_events.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
    ActivityEvent,
    ExpenseWithDelta,
    GroupMemberLite,
    Settlement,
} from '@cost-share/shared';
import { useActivityQuery } from '../../hooks/queries/useActivityQuery';
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import {
    ACTIVITY_INITIAL_SKELETON_COUNT,
    fetchActivityLastSeenAt,
} from '../../services/activity.service';
import {
    deleteExpense,
    getExpenseWithSplitsById,
} from '../../services/expenses.service';
import { getSettlementById } from '../../services/settlements.service';
import { decorateExpense } from '../../services/expense-delta';
import { fetchProfilesByUserIds } from '../../services/groups.service';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../hooks/queries/keys';
import { toEpochMs } from '../../lib/dateUtils';
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
import { setBadgeCount } from '../../lib/pushNotifications';
import { usePushPermissionPrompt } from '../../hooks/usePushPermissionPrompt';
import { EnableNotificationsBanner } from '../../components/notifications/EnableNotificationsBanner';

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

type FeedDetailItem =
    | { kind: 'expense'; expense: ExpenseWithDelta }
    | { kind: 'settlement'; settlement: Settlement };

const DIVIDER_ID = '__activity_divider__';
type DividerItem = { __divider: true; id: typeof DIVIDER_ID };
type FeedListItem = ActivityEvent | DividerItem;
function isDivider(item: FeedListItem): item is DividerItem {
    return (item as DividerItem).__divider === true;
}

function ActivityFeedDivider() {
    const { t } = useTranslation();
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 4,
                gap: 8,
            }}
            testID="activity-feed-divider"
        >
            <View style={{ flex: 1, height: 1, backgroundColor: colors.gray200 }} />
            <View
                style={{
                    backgroundColor: colors.gray50,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 2,
                }}
            >
                <Text
                    style={{
                        fontSize: 11,
                        color: colors.gray500,
                        fontWeight: '500',
                    }}
                >
                    {t('activity.earlier')}
                </Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.gray200 }} />
        </View>
    );
}

export function ActivityFeedScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();
    const currentUser = useAppStore(s => s.currentUser);
    const groupsQuery = useGroupsQuery();
    const groups = groupsQuery.data ?? [];

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
    const [detailMembers, setDetailMembers] = useState<Record<string, GroupMemberLite>>({});
    const [pendingDelete, setPendingDelete] = useState(false);
    const [userRefreshing, setUserRefreshing] = useState(false);
    const [profileMap, setProfileMap] = useState<Record<string, GroupMemberLite>>({});
    // Watermark captured at focus time. Anything strictly newer is "unseen",
    // anything at-or-before is "seen". Frozen during the visit so the divider
    // stays put after mark_activity_seen advances the live watermark to NOW.
    const [freezeWatermark, setFreezeWatermark] = useState<Date | null>(null);
    const canLoadMoreRef = useRef(false);
    const { status, showBanner, promptSoftAsk } = usePushPermissionPrompt();
    const [dismissed, setDismissed] = useState(false);

    const activities: ActivityEvent[] = useMemo(
        () => data?.pages.flatMap(page => page.items) ?? [],
        [data],
    );

    // Resolve all unique profile IDs referenced by current page (actors,
    // settlement counterparts, group_member_joined.new_member_user_id).
    useEffect(() => {
        const ids = new Set<string>();
        for (const evt of activities) {
            if (evt.actorUserId) ids.add(evt.actorUserId);
            const md = (evt.metadata ?? {}) as Record<string, unknown>;
            if (typeof md.from_user_id === 'string') ids.add(md.from_user_id);
            if (typeof md.to_user_id === 'string') ids.add(md.to_user_id);
            if (typeof md.new_member_user_id === 'string') ids.add(md.new_member_user_id);
        }
        const missing = [...ids].filter(id => !profileMap[id]);
        if (missing.length === 0) return;
        void fetchProfilesByUserIds(missing).then(extra => {
            setProfileMap(prev => ({ ...prev, ...extra }));
        });
    }, [activities, profileMap]);

    const handleRefresh = useCallback(async () => {
        canLoadMoreRef.current = false;
        setUserRefreshing(true);
        try {
            await refetch();
        } finally {
            setUserRefreshing(false);
        }
    }, [refetch]);

    useFocusEffect(
        useCallback(() => {
            // Capture the watermark BEFORE marking seen so the seen/unseen
            // divider stays anchored at the moment of focus.
            void (async () => {
                const wm = await fetchActivityLastSeenAt();
                setFreezeWatermark(wm);
                const { error } = await supabase.rpc('mark_activity_seen');
                if (!error) {
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.activityUnreadCount,
                    });
                    void setBadgeCount(0);
                }
            })();
            if (isStale) void refetch();
        }, [refetch, isStale, queryClient]),
    );

    const handleLoadMore = useCallback(() => {
        if (!canLoadMoreRef.current || !hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const handleScrollBeginDrag = useCallback(() => {
        canLoadMoreRef.current = true;
    }, []);

    const availableCurrencies = useMemo(() => {
        const fromGroups = groups.map(g => g.defaultCurrency);
        const fromActivities = activities
            .map(a => (a.metadata as Record<string, unknown>)?.currency)
            .filter((c): c is string => typeof c === 'string' && c.length > 0);
        return unique([...fromGroups, ...fromActivities]).sort();
    }, [groups, activities]);

    const availableGroups = useMemo(
        () =>
            groups
                .map(g => ({ id: g.id, name: g.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [groups],
    );

    const groupTypeById = useMemo(
        () => Object.fromEntries(groups.map(g => [g.id, g.groupType])),
        [groups],
    );

    const groupNameById = useMemo(
        () => Object.fromEntries(groups.map(g => [g.id, g.name])),
        [groups],
    );

    const displayedActivities = useMemo(() => {
        const filtered = filterAndSortActivities(
            activities,
            filters,
            currentUser?.id,
            groupTypeById,
        );
        return filtered.filter(item =>
            matchesActivitySearch(item, searchQuery, groupNameById),
        );
    }, [activities, filters, searchQuery, currentUser?.id, groupTypeById, groupNameById]);

    // Interleave a single divider sentinel between unseen (newer) and seen
    // (older) events. Omitted when everything is one side or the other.
    const displayedItems = useMemo<FeedListItem[]>(() => {
        if (!freezeWatermark || displayedActivities.length === 0) {
            return displayedActivities;
        }
        const cutoffMs = freezeWatermark.getTime();
        const splitIdx = displayedActivities.findIndex(
            (evt) => toEpochMs(evt.createdAt) <= cutoffMs,
        );
        if (splitIdx <= 0 || splitIdx >= displayedActivities.length) {
            return displayedActivities;
        }
        return [
            ...displayedActivities.slice(0, splitIdx),
            { __divider: true, id: DIVIDER_ID } as const,
            ...displayedActivities.slice(splitIdx),
        ];
    }, [displayedActivities, freezeWatermark]);

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
        const groupId = detailItem.kind === 'expense'
            ? detailItem.expense.groupId
            : detailItem.settlement.groupId;
        const groupName = groupNameById[groupId];
        if (!groupName) return undefined;
        const focusFeedItem: GroupDetailFocusFeedItem = detailItem.kind === 'expense'
            ? { kind: 'expense', id: detailItem.expense.id }
            : { kind: 'settlement', id: detailItem.settlement.id };
        return {
            label: t('activity.openInGroup', { group: groupName }),
            onPress: () => navigateToGroupWithFocus(groupId, focusFeedItem),
        };
    }, [detailItem, groupNameById, navigateToGroupWithFocus, t]);

    // Seed memberMap synchronously from the in-store group members so the
    // popup opens after one network round trip (the source row), not two.
    // Any leftover IDs (former members) are fetched in the background and
    // merged in once they arrive.
    const seedMemberMapFromGroup = useCallback(
        (groupId: string | null): Record<string, GroupMemberLite> => {
            if (!groupId) return {};
            const cachedGroups =
                queryClient.getQueryData<typeof groups>(queryKeys.groups) ?? [];
            const group = cachedGroups.find((g) => g.id === groupId);
            if (!group) return {};
            const map: Record<string, GroupMemberLite> = {};
            for (const m of group.members) map[m.userId] = m;
            return map;
        },
        [],
    );

    const openExpenseDetail = useCallback(
        async (event: ActivityEvent) => {
            const md = (event.metadata ?? {}) as Record<string, unknown>;
            const seed = seedMemberMapFromGroup(event.groupId);
            // Open immediately with a stub built from event.metadata so the
            // modal appears on the same tick as the press. Splits + extras
            // fill in once the network fetch resolves.
            const stub: ExpenseWithDelta = {
                id: event.refId,
                groupId: event.groupId ?? '',
                description: typeof md.description === 'string' ? md.description : '',
                amount: Number(md.amount ?? 0),
                currency: typeof md.currency === 'string' ? md.currency : '',
                expenseDate: typeof md.expense_date === 'string'
                    ? new Date(md.expense_date)
                    : event.createdAt,
                paidBy: event.actorUserId ?? '',
                createdBy: event.actorUserId ?? '',
                isDeleted: false,
                createdAt: event.createdAt,
                updatedAt: event.createdAt,
                splits: [],
                myDelta: 0,
                myDeltaState: 'settled',
            };
            setDetailMembers(seed);
            setDetailItem({ kind: 'expense', expense: stub });

            const expense = await getExpenseWithSplitsById(event.refId);
            if (!expense) {
                // Source row no longer accessible; close to avoid stale stub.
                setDetailItem(null);
                return;
            }
            const decorated = decorateExpense(expense, currentUser?.id ?? '');
            setDetailItem({ kind: 'expense', expense: decorated });
            const referencedIds = new Set<string>([
                expense.paidBy,
                expense.createdBy,
                ...expense.splits.map(s => s.userId),
            ].filter((id): id is string => Boolean(id)));
            const missing = [...referencedIds].filter(id => !seed[id]);
            if (missing.length > 0) {
                const extra = await fetchProfilesByUserIds(missing);
                if (Object.keys(extra).length > 0) {
                    setDetailMembers(prev => ({ ...prev, ...extra }));
                }
            }
        },
        [currentUser?.id, seedMemberMapFromGroup],
    );

    const openSettlementDetail = useCallback(
        async (event: ActivityEvent) => {
            const md = (event.metadata ?? {}) as Record<string, unknown>;
            const seed = seedMemberMapFromGroup(event.groupId);
            const stub: Settlement = {
                id: event.refId,
                groupId: event.groupId ?? '',
                fromUserId: typeof md.from_user_id === 'string' ? md.from_user_id : '',
                toUserId: typeof md.to_user_id === 'string' ? md.to_user_id : '',
                amount: Number(md.amount ?? 0),
                currency: typeof md.currency === 'string' ? md.currency : '',
                settlementDate: typeof md.settlement_date === 'string'
                    ? new Date(md.settlement_date)
                    : event.createdAt,
                createdBy: event.actorUserId ?? '',
                createdAt: event.createdAt,
                updatedAt: event.createdAt,
                deletedAt: null,
            };
            setDetailMembers(seed);
            setDetailItem({ kind: 'settlement', settlement: stub });

            const settlement = await getSettlementById(event.refId);
            if (!settlement) {
                setDetailItem(null);
                return;
            }
            setDetailItem({ kind: 'settlement', settlement });
            const referencedIds = new Set<string>([
                settlement.fromUserId,
                settlement.toUserId,
                settlement.createdBy,
            ].filter((id): id is string => Boolean(id)));
            const missing = [...referencedIds].filter(id => !seed[id]);
            if (missing.length > 0) {
                const extra = await fetchProfilesByUserIds(missing);
                if (Object.keys(extra).length > 0) {
                    setDetailMembers(prev => ({ ...prev, ...extra }));
                }
            }
        },
        [seedMemberMapFromGroup],
    );

    const handleActivityPress = useCallback(
        (event: ActivityEvent) => {
            if (event.kind === 'friend_request_received') {
                navigation.navigate('Profile', { screen: 'Friends' });
                return;
            }
            if (event.kind === 'expense_added') {
                void openExpenseDetail(event);
                return;
            }
            if (event.kind === 'settlement_added') {
                void openSettlementDetail(event);
                return;
            }
            // group_added / group_member_joined / message_posted → navigate to group
            if (event.groupId) {
                navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: event.groupId },
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
        setDetailItem(null);
        navigation.navigate('Groups', {
            screen: 'GroupDetail',
            params: { groupId, editSettlementId: id },
            merge: true,
        });
    }, [detailItem, navigation]);

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
        ({ item }: { item: FeedListItem }) => {
            if (isDivider(item)) {
                return <ActivityFeedDivider />;
            }
            const actor = item.actorUserId ? profileMap[item.actorUserId] : undefined;
            const md = (item.metadata ?? {}) as Record<string, unknown>;
            let counterpart: GroupMemberLite | undefined;
            if (item.kind === 'settlement_added') {
                const otherId = typeof md.from_user_id === 'string' && md.from_user_id !== item.actorUserId
                    ? md.from_user_id
                    : typeof md.to_user_id === 'string'
                    ? md.to_user_id
                    : undefined;
                if (otherId) counterpart = profileMap[otherId];
            }
            const newMemberId = typeof md.new_member_user_id === 'string'
                ? md.new_member_user_id
                : undefined;
            const newMember = newMemberId ? profileMap[newMemberId] : undefined;
            const groupName = item.groupId ? groupNameById[item.groupId] : undefined;
            return (
                <ActivityItem
                    event={item}
                    actor={actor}
                    counterpart={counterpart}
                    newMember={newMember}
                    groupName={groupName}
                    currentUserId={currentUser?.id ?? ''}
                    onPress={handleActivityPress}
                />
            );
        },
        [handleActivityPress, groupNameById, profileMap, currentUser?.id],
    );

    const keyExtractor = useCallback(
        (item: FeedListItem) => (isDivider(item) ? item.id : item.id),
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
                        ].filter(Boolean).join(' ')}
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
                            <AppIcon name="close-circle" size={18} color={colors.gray400} />
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
                    <AppIcon name="options-outline" size={22} color={colors.gray500} />
                    {filterActive && (
                        <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                    )}
                </TouchableOpacity>
            </View>

            {!dismissed && (status === 'undetermined' || showBanner) && (
                <EnableNotificationsBanner
                    mode={status === 'undetermined' ? 'soft-ask' : 'open-settings'}
                    onEnable={() => void promptSoftAsk()}
                    onDismiss={() => setDismissed(true)}
                />
            )}

            <FlatList
                data={displayedItems}
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
                onConfirm={() => { void handleConfirmDelete(); }}
                onCancel={() => setPendingDelete(false)}
                destructive
            />
        </SafeAreaView>
    );
}
