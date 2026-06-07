/**
 * GroupDetailScreen — single-scroll feed with hero header, quick actions,
 * search + filter, mixed expense/message feed, sticky bottom "Add expense" CTA.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    Modal,
    Pressable,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    ExpenseCategory,
    ExpenseWithDelta,
    FeedItem,
    Group,
    GroupMemberLite,
    GroupMessage,
    Settlement,
} from '@cost-share/shared';
import { platformAlert } from '../../lib/platformAlert';
import { useAppStore } from '../../store';
import {
    getGroupById,
    archiveGroup,
    unarchiveGroup,
    deleteGroup,
    removeGroupMember,
    fetchProfilesByUserIds,
} from '../../services/groups.service';
import { collectFeedUserIds } from '../../lib/feedParticipants';
import { deleteExpense } from '../../services/expenses.service';
import {
    createMessage,
    updateMessage,
    deleteMessage,
} from '../../services/messages.service';
import { exportGroupCsv } from '../../services/group-share.service';
import { shareGroupInvite } from '../../services/invite.service';
import { buildFeed } from '../../services/feed';
import { useGroupMessagesRealtime } from '../../hooks/useGroupMessagesRealtime';
import { useGroupExpensesRealtime } from '../../hooks/useGroupExpensesRealtime';
import { useGroupSettlementsRealtime } from '../../hooks/useGroupSettlementsRealtime';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from '../../hooks/queries/keys';
import { prefetchAddExpense } from '../../hooks/queries/prefetchAddExpense';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import { useGroupExpensesQuery } from '../../hooks/queries/useGroupExpensesQuery';
import { useGroupMessagesQuery } from '../../hooks/queries/useGroupMessagesQuery';
import { GroupDetailSkeleton } from '../../components/skeletons/GroupDetailSkeleton';
import {
    cancelPendingAddExpense,
    chainDeleteFollowUp,
    resolvePendingEditAction,
} from '../../hooks/mutations/useAddExpenseMutation';
import { isPendingExpenseId } from '../../lib/pendingExpense';
import {
    PendingSyncIcon,
    type PendingSyncState,
} from '../../components/PendingSyncIcon';
import { useNetworkStatus } from '../../lib/networkStatus';
import { EmptyState } from '../../components/EmptyState';
import { GroupSummaryCard } from '../../components/groupDetail/GroupSummaryCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedItemRow } from '../../components/FeedItemRow';
import {
    FAB_BOTTOM_GAP,
    FAB_LIST_GAP,
    FAB_ROW_HEIGHT,
    GroupDetailFloatingActions,
} from '../../components/GroupDetailFloatingActions';
import { resolveAutoTextInputStyle, rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';
import { MessageComposerSheet } from '../../components/MessageComposerSheet';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import {
    DEFAULT_GROUP_FEED_FILTERS,
    GroupFeedFilters,
    GroupFeedFiltersSheet,
    isAnyGroupFeedFilterActive,
} from '../../components/GroupFeedFiltersSheet';
import { filterAndSortGroupFeed } from '../../lib/groupFeedFilters';
import {
    findFeedItemIndex,
    type GroupDetailFocusFeedItem,
} from '../../lib/groupDetailFocus';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import {
    useDeleteSettlementMutation,
    useGroupPairwiseDebtsQuery,
    useGroupSettlementsQuery,
    useUpdateSettlementMutation,
} from '../../hooks/queries/useSettlementQueries';
import { useGroupSimplifiedDebtsByCurrencyQuery } from '../../hooks/queries/useGroupBalancesQueries';
import { useGroupBalanceDisplay } from '../../hooks/useGroupBalancesDisplay';
import { AppIcon } from '../../components/AppIcon';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
import { colors } from '../../theme';
import { showInfoToast } from '../../lib/appToast';

type ComposerState =
    | { open: false }
    | { open: true; mode: 'create' }
    | { open: true; mode: 'edit'; messageId: string; initialBody: string };

const CATEGORIES: ExpenseCategory[] = [
    'food',
    'transport',
    'accommodation',
    'utilities',
    'entertainment',
    'shopping',
    'healthcare',
    'other',
];

const PENDING_SYNC_SPINNER_MS = 2000;

function PendingSyncBadge({
    expenseId,
    pendingFailed,
}: {
    expenseId: string;
    pendingFailed: boolean;
}) {
    // Show the spinner for 2s when the badge first appears AND every time the
    // user taps to retry. After the timer, fall back to a static "tap-to-retry"
    // refresh icon so the user knows the row is waiting and can poke it again.
    // The actual mutation may still be running underneath — the timer is a UX
    // affordance, not a real timeout on the network call.
    const [showSpinner, setShowSpinner] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setShowSpinner(false), PENDING_SYNC_SPINNER_MS);
        return () => clearTimeout(t);
    }, []);

    const handleRetry = useCallback(() => {
        setShowSpinner(true);
        // Kick the queued mutation. resumePausedMutations() runs every paused
        // mutation that has matching defaults; if the network is back up, this
        // is what actually sends the create. If still offline, it's a no-op
        // and the spinner just spins out the 2s before reverting.
        void queryClient.resumePausedMutations();
        setTimeout(() => setShowSpinner(false), PENDING_SYNC_SPINNER_MS);
    }, []);

    let state: PendingSyncState;
    let onPress: (() => void) | undefined;
    if (pendingFailed) {
        state = 'failed';
        onPress = handleRetry;
    } else if (showSpinner) {
        state = 'syncing';
    } else {
        state = 'tap-to-retry';
        onPress = handleRetry;
    }

    return (
        <View
            style={{
                position: 'absolute',
                top: 8,
                right: 8,
                padding: 4,
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.9)',
            }}
        >
            <PendingSyncIcon
                state={state}
                onPress={onPress}
                accessibilityLabel="expense not yet synced — tap to retry"
            />
        </View>
    );
}

export function GroupDetailScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const {
        groupId,
        focusFeedItem: focusFeedItemParam,
        editSettlementId: editSettlementIdParam,
    } = route.params as {
        groupId: string;
        focusFeedItem?: GroupDetailFocusFeedItem;
        editSettlementId?: string;
    };
    const listRef = useRef<FlatList<FeedItem>>(null);
    const focusConsumedRef = useRef(false);
    const pendingFocusKeyRef = useRef<string | null>(null);

    const [group, setGroup] = useState<Group | null>(null);
    const groupsQuery = useGroupsQuery();
    const storeGroup = groupsQuery.data?.find((g) => g.id === groupId);
    const displayGroup = storeGroup ?? group;
    const isArchivedByMe = storeGroup?.isArchivedByMe ?? false;
    const hasOpenBalance = useAppStore(s => Boolean(s.groupBalances[groupId]));
    const insets = useSafeAreaInsets();
    const listBottomPadding = FAB_BOTTOM_GAP + FAB_ROW_HEIGHT + FAB_LIST_GAP;
    const { data: groupUsers = [], refetch: refetchGroupUsers } =
        useGroupUsersQuery(groupId);
    const memberLites = useMemo<GroupMemberLite[]>(() => {
        const fromUsers: GroupMemberLite[] = groupUsers.map(u => ({
            userId: u.id,
            displayName: getDisplayName(u, t),
            avatarUrl: getAvatarUrl(u) ?? undefined,
            isActive: u.isActive,
        }));
        if (!storeGroup?.members?.length) return fromUsers;
        const avatarByUserId = new Map(
            fromUsers.map(m => [m.userId, m.avatarUrl]),
        );
        return storeGroup.members.map(m => ({
            ...m,
            avatarUrl: m.avatarUrl ?? avatarByUserId.get(m.userId),
        }));
    }, [storeGroup?.members, groupUsers, t]);
    const [feedParticipants, setFeedParticipants] = useState<
        Record<string, GroupMemberLite>
    >({});
    const currentUserId = useAppStore(s => s.currentUser?.id ?? '');
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<GroupFeedFilters>(DEFAULT_GROUP_FEED_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [composer, setComposer] = useState<ComposerState>({ open: false });
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
    const [feedDetailItem, setFeedDetailItem] = useState<
        | { kind: 'expense'; expense: ExpenseWithDelta }
        | { kind: 'settlement'; settlement: Settlement }
        | null
    >(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [archiveBusy, setArchiveBusy] = useState(false);
    const [exporting, setExporting] = useState(false);

    const { data: settlements = [] } = useGroupSettlementsQuery(groupId);
    const { data: pairwiseDebts = [] } = useGroupPairwiseDebtsQuery(groupId);
    const { data: simplifiedEntries = [] } =
        useGroupSimplifiedDebtsByCurrencyQuery(groupId);
    const updateSettlementMutation = useUpdateSettlementMutation(groupId);
    const deleteSettlementMutation = useDeleteSettlementMutation(groupId);

    const expensesQuery = useGroupExpensesQuery(groupId);
    const messagesQuery = useGroupMessagesQuery(groupId);
    const groupExpenses = useMemo(
        () => expensesQuery.data ?? [],
        [expensesQuery.data],
    );
    const messages = useMemo(
        () => messagesQuery.data ?? [],
        [messagesQuery.data],
    );
    const isLoading = expensesQuery.isLoading || messagesQuery.isLoading;
    const isFeedLoading = isLoading && groupExpenses.length === 0 && messages.length === 0;

    useGroupMessagesRealtime(groupId);
    useGroupExpensesRealtime(groupId);
    useGroupSettlementsRealtime(groupId);

    const groupBalance = useAppStore(s => s.groupBalances[groupId]);
    const balanceDisplay = useGroupBalanceDisplay(
        groupBalance,
        displayGroup?.defaultCurrency,
    );
    const balance = useMemo(() => {
        const net = balanceDisplay?.net ?? 0;
        return {
            net,
            currency: balanceDisplay?.currency ?? displayGroup?.defaultCurrency ?? 'USD',
            isSettled: Math.abs(net) < 0.01,
        };
    }, [balanceDisplay, displayGroup?.defaultCurrency]);

    const settlementCount = simplifiedEntries.reduce(
        (n, e) => n + e.result.debts.length,
        0,
    );

    const feedUserIds = useMemo(
        () => collectFeedUserIds(groupExpenses, messages, settlements),
        [groupExpenses, messages, settlements],
    );

    useEffect(() => {
        const activeIds = new Set(memberLites.map(m => m.userId));
        const missing = feedUserIds.filter(id => !activeIds.has(id));
        if (missing.length === 0) return;

        let cancelled = false;
        void fetchProfilesByUserIds(missing).then(profiles => {
            if (cancelled || Object.keys(profiles).length === 0) return;
            setFeedParticipants(prev => {
                const next = { ...prev };
                let changed = false;
                for (const [id, lite] of Object.entries(profiles)) {
                    if (!next[id]) {
                        next[id] = lite;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [feedUserIds, memberLites]);

    const memberMap = useMemo(() => {
        const map: Record<string, GroupMemberLite> = { ...feedParticipants };
        memberLites.forEach(m => {
            map[m.userId] = m;
        });
        return map;
    }, [memberLites, feedParticipants]);

    const loadAll = useCallback(
        async (options?: { force?: boolean }) => {
            const force = options?.force ?? false;
            const cachedGroups = queryClient.getQueryData<typeof groupsQuery.data>(
                queryKeys.groups,
            );
            const needsGroupFetch = !cachedGroups?.some((g) => g.id === groupId);

            const tasks: Promise<unknown>[] = [];

            if (needsGroupFetch) {
                tasks.push(
                    getGroupById(groupId).then((g) => {
                        if (g) setGroup(g);
                    }),
                );
            }
            if (force) {
                tasks.push(
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.groupExpenses(groupId),
                    }),
                );
                tasks.push(
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.groupMessages(groupId),
                    }),
                );
                tasks.push(refetchGroupUsers());
            }

            await Promise.all(tasks);
        },
        [groupId, refetchGroupUsers],
    );

    useEffect(() => {
        let cancelled = false;

        void loadAll().finally(() => {
            if (cancelled) return;
        });

        return () => {
            cancelled = true;
        };
    }, [groupId, loadAll]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            loadAll({ force: true }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.groupSettlements(groupId),
            }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.groupPairwiseDebts(groupId),
            }),
        ]);
        setRefreshing(false);
    }, [loadAll, groupId]);

    const feed = useMemo<FeedItem[]>(
        () => buildFeed(groupId, groupExpenses, messages, settlements, currentUserId),
        [groupId, groupExpenses, messages, settlements, currentUserId],
    );

    const trimmedQuery = searchQuery.trim().toLowerCase();
    const filterActive = isAnyGroupFeedFilterActive(filters);
    const hasActiveSearchOrFilter = trimmedQuery.length > 0 || filterActive;

    const filteredFeed = useMemo(
        () => filterAndSortGroupFeed(feed, filters, memberMap, searchQuery),
        [feed, filters, memberMap, searchQuery],
    );

    useEffect(() => {
        const focus = focusFeedItemParam;
        if (!focus) return;
        const key = `${focus.kind}:${focus.id}`;
        if (pendingFocusKeyRef.current === key) return;
        pendingFocusKeyRef.current = key;
        focusConsumedRef.current = false;
        setSearchQuery('');
        setFilters(DEFAULT_GROUP_FEED_FILTERS);
    }, [focusFeedItemParam]);

    useEffect(() => {
        const focus = focusFeedItemParam;
        if (!focus || focusConsumedRef.current || isFeedLoading) return;

        const index = findFeedItemIndex(filteredFeed, focus);
        if (index < 0) return;

        const row = filteredFeed[index];
        focusConsumedRef.current = true;
        navigation.setParams({ groupId, focusFeedItem: undefined });

        const openDetail = () => {
            if (row.kind === 'expense') {
                setFeedDetailItem({ kind: 'expense', expense: row.expense });
            } else if (row.kind === 'settlement') {
                setFeedDetailItem({
                    kind: 'settlement',
                    settlement: row.settlement,
                });
            }
        };

        const scrollTimer = setTimeout(() => {
            listRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.35,
            });
            openDetail();
        }, 120);

        return () => clearTimeout(scrollTimer);
    }, [
        focusFeedItemParam,
        filteredFeed,
        isFeedLoading,
        navigation,
        groupId,
    ]);

    useEffect(() => {
        if (!editSettlementIdParam) return;
        const target = settlements.find(s => s.id === editSettlementIdParam);
        if (!target) return;
        setEditingSettlement(target);
        navigation.setParams({ groupId, editSettlementId: undefined });
    }, [editSettlementIdParam, settlements, navigation, groupId]);

    const handleClearFeedSearchAndFilters = useCallback(() => {
        setSearchQuery('');
        setFilters(DEFAULT_GROUP_FEED_FILTERS);
    }, []);

    const handleBack = useCallback(() => navigation.goBack(), [navigation]);
    const handleOpenGroupMenu = useCallback(() => setMenuOpen(true), []);
    const handleEditGroup = useCallback(() => {
        setMenuOpen(false);
        navigation.navigate('EditGroup', { groupId });
    }, [navigation, groupId]);
    const handleArchiveToggle = useCallback(async () => {
        setMenuOpen(false);
        if (!isArchivedByMe && hasOpenBalance) {
            platformAlert(t('groups.archive.disabledReason'), undefined, [
                { text: t('common.ok'), style: 'default' },
            ]);
            return;
        }
        setArchiveBusy(true);
        try {
            if (isArchivedByMe) {
                await unarchiveGroup(groupId);
            } else {
                await archiveGroup(groupId);
            }
        } finally {
            setArchiveBusy(false);
        }
    }, [isArchivedByMe, hasOpenBalance, groupId, t]);
    const handleLeaveGroup = useCallback(() => {
        setMenuOpen(false);
        if (hasOpenBalance) {
            platformAlert(t('groups.archive.disabledReason'), undefined, [
                { text: t('common.ok'), style: 'default' },
            ]);
            return;
        }
        platformAlert(t('groups.leaveGroup'), t('groups.leaveGroupConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('groups.leaveGroup'),
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        if (!currentUserId) return;
                        const ok = await removeGroupMember(groupId, currentUserId);
                        if (ok) navigation.popToTop?.() ?? navigation.goBack();
                    })();
                },
            },
        ]);
    }, [groupId, currentUserId, navigation, t, hasOpenBalance]);
    const handleDeleteGroup = useCallback(() => {
        setMenuOpen(false);
        platformAlert(t('groups.deleteGroup'), t('groups.deleteGroupConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'),
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        const ok = await deleteGroup(groupId);
                        if (ok) navigation.popToTop?.() ?? navigation.goBack();
                    })();
                },
            },
        ]);
    }, [groupId, navigation, t]);
    const handleExport = useCallback(async () => {
        setMenuOpen(false);
        if (!displayGroup || exporting) return;
        setExporting(true);
        showInfoToast('groups.share.exporting');
        try {
            await exportGroupCsv(displayGroup, {
                feed,
                debts: pairwiseDebts,
                members: memberLites,
            });
        } finally {
            setExporting(false);
        }
    }, [displayGroup, exporting, feed, memberLites, pairwiseDebts, t]);
    const handleSettleUp = useCallback(
        () => navigation.navigate('SettleUpList', { groupId }),
        [navigation, groupId],
    );
    const handleBalances = useCallback(
        () => navigation.navigate('Balances', { groupId }),
        [navigation, groupId],
    );
    const handleNote = useCallback(
        () => navigation.navigate('GroupNote', { groupId }),
        [navigation, groupId],
    );
    const handleAddExpense = useCallback(() => {
        prefetchAddExpense(groupId);
        navigation.navigate('AddExpense', { groupId });
    }, [navigation, groupId]);
    const handleExpensePress = useCallback(
        (expenseId: string) => {
            const match = feed.find(
                i => i.kind === 'expense' && i.expense.id === expenseId,
            );
            if (match?.kind === 'expense') {
                setFeedDetailItem({ kind: 'expense', expense: match.expense });
            }
        },
        [feed],
    );

    const handleOpenComposer = useCallback(
        () => setComposer({ open: true, mode: 'create' }),
        [],
    );

    const handleShare = useCallback(() => {
        void shareGroupInvite(groupId);
    }, [groupId]);

    const handleMessageEdit = useCallback(
        (m: GroupMessage) =>
            setComposer({
                open: true,
                mode: 'edit',
                messageId: m.id,
                initialBody: m.body,
            }),
        [],
    );

    const handleSettlementPress = useCallback((s: Settlement) => {
        setFeedDetailItem({ kind: 'settlement', settlement: s });
    }, []);

    const handleFeedDetailEdit = useCallback(() => {
        if (!feedDetailItem) return;
        if (feedDetailItem.kind === 'expense') {
            const { id: expenseId } = feedDetailItem.expense;
            setFeedDetailItem(null);
            navigation.navigate('AddExpense', { expenseId, groupId });
            return;
        }
        const settlement = feedDetailItem.settlement;
        setFeedDetailItem(null);
        setEditingSettlement(settlement);
    }, [feedDetailItem, navigation, groupId]);

    const handleFeedDetailDeleteRequest = useCallback(() => {
        // Capture the current item in a closure so the eventual delete
        // call doesn't race with state changes if the sheet's selection
        // shifts while the alert is open.
        const item = feedDetailItem;
        if (!item) return;
        const confirmTitle =
            item.kind === 'expense'
                ? t('expenses.deleteExpenseConfirm')
                : t('settleUp.confirmDelete');
        platformAlert(confirmTitle, undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'),
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        if (item.kind === 'expense') {
                            if (isPendingExpenseId(item.expense.id)) {
                                const action = resolvePendingEditAction(
                                    queryClient,
                                    item.expense.id,
                                );
                                if (action === 'chain-follow-up') {
                                    chainDeleteFollowUp(
                                        queryClient,
                                        groupId,
                                        item.expense.id,
                                    );
                                } else {
                                    cancelPendingAddExpense(
                                        queryClient,
                                        groupId,
                                        item.expense.id,
                                    );
                                }
                                setFeedDetailItem(null);
                                return;
                            }
                            const ok = await deleteExpense(item.expense.id);
                            if (ok) setFeedDetailItem(null);
                        } else {
                            const deleted =
                                await deleteSettlementMutation.mutateAsync(
                                    item.settlement.id,
                                );
                            if (deleted) setFeedDetailItem(null);
                        }
                    })();
                },
            },
        ]);
    }, [feedDetailItem, t, deleteSettlementMutation]);

    const handleSettlementEditSubmit = useCallback(
        async (values: SettleUpFormValues) => {
            if (!editingSettlement) return;
            const updated = await updateSettlementMutation.mutateAsync({
                id: editingSettlement.id,
                dto: {
                    fromUserId: values.fromUserId,
                    toUserId: values.toUserId,
                    amount: values.amount,
                    currency: values.currency,
                    // Note: UpdateSettlementDto does not yet accept paymentMethod / settlementDate
                },
            });
            if (updated) setEditingSettlement(null);
        },
        [editingSettlement, updateSettlementMutation],
    );

    const handleMessageDelete = useCallback(
        (m: GroupMessage) => {
            platformAlert(t('groups.message.deleteConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('groups.message.delete'),
                    style: 'destructive',
                    onPress: () => {
                        void deleteMessage(groupId, m.id);
                    },
                },
            ]);
        },
        [groupId, t],
    );

    const handleComposerSubmit = useCallback(
        async (body: string) => {
            if (!composer.open) return;
            if (composer.mode === 'create') {
                const created = await createMessage(groupId, body);
                if (created) setComposer({ open: false });
                return;
            }
            const updated = await updateMessage(composer.messageId, body);
            if (updated) setComposer({ open: false });
        },
        [composer, groupId],
    );

    if (isLoading && groupExpenses.length === 0 && !displayGroup) {
        return <GroupDetailSkeleton />;
    }

    if (!displayGroup) {
        return (
            <EmptyState
                iconName="alert-circle-outline"
                title={t('common.error')}
                message={t('common.loadError')}
            />
        );
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                ref={listRef}
                data={filteredFeed}
                onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                        listRef.current?.scrollToIndex({
                            index: info.index,
                            animated: true,
                            viewPosition: 0.35,
                        });
                    }, 80);
                }}
                keyExtractor={item =>
                    item.kind === 'expense'
                        ? `e:${item.expense.id}`
                        : item.kind === 'settlement'
                            ? `s:${item.settlement.id}`
                            : `m:${item.message.id}`
                }
                renderItem={({ item }) => (
                    <View className="px-2" style={{ position: 'relative' }}>
                        <FeedItemRow
                            item={item}
                            currentUserId={currentUserId}
                            memberMap={memberMap}
                            onExpensePress={handleExpensePress}
                            onMessageEdit={handleMessageEdit}
                            onMessageDelete={handleMessageDelete}
                            onSettlementPress={handleSettlementPress}
                            searchQuery={trimmedQuery || undefined}
                        />
                        {item.kind === 'expense' &&
                            isPendingExpenseId(item.expense.id) && (
                                <PendingSyncBadge
                                    expenseId={item.expense.id}
                                    pendingFailed={
                                        (item.expense as { pendingFailed?: boolean })
                                            .pendingFailed === true
                                    }
                                />
                            )}
                    </View>
                )}
                ListHeaderComponent={
                    <>
                        <GroupSummaryCard
                            group={displayGroup}
                            members={memberLites}
                            balance={balance}
                            settlementCount={settlementCount}
                            onBack={handleBack}
                            onShare={handleShare}
                            onMenu={handleOpenGroupMenu}
                            onOpenBalances={handleBalances}
                            onOpenNote={handleNote}
                            onOpenSettleUp={handleSettleUp}
                        />
                        <View className="px-4 mt-3 mb-2 flex-row items-center">
                            <View className="flex-1 flex-row items-center rounded-full bg-gray-100 px-3 h-9">
                                <AppIcon name="search" size={18} color={colors.gray500} />
                                <TextInput
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    placeholder={t('groups.search.feedPlaceholder')}
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
                                    testID="detail-search-input"
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
                                accessibilityLabel={t('groups.filters.title')}
                                className="ml-2 h-9 w-9 items-center justify-center relative"
                                testID="detail-filter-btn"
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
                    </>
                }
                ListEmptyComponent={
                    isFeedLoading ? (
                        <View
                            className="py-16 items-center justify-center"
                            testID="feed-loading"
                        >
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : feed.length === 0 ? (
                        <View className="mx-4 my-6 bg-white rounded-2xl p-6 items-center border border-gray-100">
                            <Text className="text-base font-semibold text-gray-900 mb-1">
                                {t('groups.emptyFeed.title')}
                            </Text>
                            <Text className="text-sm text-gray-500 text-center mb-4">
                                {t('groups.emptyFeed.message')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setAddMembersOpen(true)}
                                className="h-11 rounded-xl border border-primary px-5 items-center justify-center flex-row"
                                testID="empty-feed-add-members"
                            >
                                <AppIcon name="person-add-outline" size={18} color={colors.primary} />
                                <Text className="text-sm font-semibold text-primary-dark ml-2">
                                    {t('groups.emptyFeed.addMembers')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { void shareGroupInvite(groupId); }}
                                className="mt-4 self-center"
                                testID="group-empty-share-link"
                            >
                                <Text className="text-sm text-primary">
                                    {t('invite.group.emptyStateLink')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View className="mx-4 my-6 bg-white rounded-2xl p-6 items-center border border-gray-100">
                            <Text className="text-base font-semibold text-gray-900 mb-1">
                                {t('groups.emptyFeed.noResultsTitle')}
                            </Text>
                            <Text className="text-sm text-gray-500 text-center mb-4">
                                {t('groups.emptyFeed.noResultsMessage')}
                            </Text>
                            {hasActiveSearchOrFilter && (
                                <TouchableOpacity
                                    onPress={handleClearFeedSearchAndFilters}
                                    className="h-11 rounded-xl border border-primary px-5 items-center justify-center"
                                    testID="empty-feed-clear-filters"
                                >
                                    <Text className="text-sm font-semibold text-primary-dark">
                                        {t('groups.filters.clearAll')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )
                }
                contentContainerStyle={{ paddingBottom: listBottomPadding }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                ListFooterComponent={<View style={{ height: 4 }} />}
            />

            <GroupDetailFloatingActions
                onMessage={handleOpenComposer}
                onExpense={handleAddExpense}
            />

            <GroupFeedFiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableCategories={CATEGORIES}
                availableMembers={memberLites}
                onChange={setFilters}
                onClose={() => setFiltersOpen(false)}
            />

            <MessageComposerSheet
                visible={composer.open}
                mode={composer.open ? composer.mode : 'create'}
                initialBody={
                    composer.open && composer.mode === 'edit' ? composer.initialBody : ''
                }
                onSubmit={handleComposerSubmit}
                onClose={() => setComposer({ open: false })}
            />

            <AddMembersSheet
                visible={addMembersOpen}
                groupId={groupId}
                currentMemberIds={memberLites.map(m => m.userId)}
                onClose={() => setAddMembersOpen(false)}
                onAdded={() => {
                    void loadAll({ force: true });
                }}
            />

            <FeedItemDetailSheet
                item={feedDetailItem}
                memberMap={memberMap}
                currentUserId={currentUserId}
                onClose={() => setFeedDetailItem(null)}
                onEdit={handleFeedDetailEdit}
                onDelete={handleFeedDetailDeleteRequest}
            />

            {editingSettlement && (
                <SettleUpSheet
                    visible={Boolean(editingSettlement)}
                    members={memberLites}
                    pairwiseDebts={pairwiseDebts}
                    currentUserId={currentUserId}
                    initial={{
                        fromUserId: editingSettlement.fromUserId,
                        toUserId: editingSettlement.toUserId,
                        currency: editingSettlement.currency,
                        amount: editingSettlement.amount,
                        settlementDate: editingSettlement.settlementDate,
                        paymentMethod: editingSettlement.paymentMethod,
                    }}
                    mode="edit"
                    submitting={updateSettlementMutation.isPending}
                    onSubmit={handleSettlementEditSubmit}
                    onClose={() => setEditingSettlement(null)}
                    groupName={displayGroup?.name}
                />
            )}

            <Modal
                visible={menuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuOpen(false)}
            >
                <Pressable className="flex-1" onPress={() => setMenuOpen(false)}>
                    <View
                        className="absolute right-2 bg-white rounded-2xl border border-gray-200 py-1"
                        style={{
                            top: insets.top + 52,
                            minWidth: 260,
                            maxWidth: 320,
                            shadowColor: '#000',
                            shadowOpacity: 0.15,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: 6,
                        }}
                    >
                        <DetailMenuRow
                            label={t('groups.editGroup')}
                            onPress={handleEditGroup}
                        />
                        <DetailMenuRow
                            label={t('groups.share.exportOption')}
                            onPress={handleExport}
                            disabled={exporting}
                            testID="group-menu-export"
                        />
                        <DetailMenuRow
                            label={
                                isArchivedByMe
                                    ? t('groups.archive.unarchiveCta')
                                    : t('groups.archive.archiveCta')
                            }
                            onPress={handleArchiveToggle}
                            disabled={archiveBusy}
                        />
                        <DetailMenuRow
                            label={t('groups.leaveGroup')}
                            onPress={handleLeaveGroup}
                        />
                        <View className="h-px bg-gray-100 my-1" />
                        <DetailMenuRow
                            label={t('groups.deleteGroup')}
                            onPress={handleDeleteGroup}
                            destructive
                        />
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

interface DetailMenuRowProps {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    destructive?: boolean;
    testID?: string;
}

function DetailMenuRow({ label, onPress, disabled, destructive, testID }: DetailMenuRowProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.6}
            className="px-4 py-3"
            testID={testID}
        >
            <Text
                className={
                    disabled
                        ? 'text-sm font-medium text-gray-400'
                        : destructive
                            ? 'text-sm font-medium text-red-600'
                            : 'text-sm font-medium text-gray-900'
                }
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}
