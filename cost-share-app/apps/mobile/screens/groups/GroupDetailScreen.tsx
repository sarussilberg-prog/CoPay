/**
 * GroupDetailScreen — single-scroll feed with hero header, quick actions,
 * search + filter, mixed expense/message feed, sticky bottom "Add expense" CTA.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    Alert,
    ActionSheetIOS,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    ExpenseCategory,
    FeedItem,
    Group,
    GroupMember,
    GroupMemberLite,
    GroupMessage,
    Settlement,
} from '@cost-share/shared';
import { useAppStore } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import {
    getGroupById,
    getGroupMembers,
} from '../../services/groups.service';
import { fetchExpenses } from '../../services/expenses.service';
import {
    fetchMessages,
    createMessage,
    updateMessage,
    deleteMessage,
} from '../../services/messages.service';
import { exportGroupCsv } from '../../services/group-share.service';
import { buildFeed } from '../../services/feed';
import { useGroupMessagesRealtime } from '../../hooks/useGroupMessagesRealtime';
import { getCurrentUserId } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { GroupHero } from '../../components/GroupHero';
import { QuickActionsRow } from '../../components/QuickActionsRow';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedItemRow } from '../../components/FeedItemRow';
import { SearchExpandable } from '../../components/SearchExpandable';
import { MessageComposerSheet } from '../../components/MessageComposerSheet';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import {
    DEFAULT_EXPENSE_FILTERS,
    ExpenseFilters,
    ExpenseFiltersSheet,
    isAnyExpenseFilterActive,
} from '../../components/ExpenseFiltersSheet';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import {
    useDeleteSettlementMutation,
    useGroupPairwiseDebtsQuery,
    useGroupSettlementsQuery,
    useUpdateSettlementMutation,
} from '../../hooks/queries/useSettlementQueries';
import { AppIcon } from '../../components/AppIcon';
import { colors } from '../../theme';

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

function membersToLite(members: GroupMember[], nameById: Map<string, string>, avatarById: Map<string, string | undefined>): GroupMemberLite[] {
    return members.map(m => ({
        userId: m.userId,
        displayName: nameById.get(m.userId) ?? m.userId.slice(0, 8),
        avatarUrl: avatarById.get(m.userId),
    }));
}

export function GroupDetailScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [group, setGroup] = useState<Group | null>(null);
    const [memberLites, setMemberLites] = useState<GroupMemberLite[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [filters, setFilters] = useState<ExpenseFilters>(DEFAULT_EXPENSE_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [composer, setComposer] = useState<ComposerState>({ open: false });
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);

    const { data: settlements = [], refetch: refetchSettlements } =
        useGroupSettlementsQuery(groupId);
    const { data: pairwiseDebts = [] } = useGroupPairwiseDebtsQuery(groupId);
    const updateSettlementMutation = useUpdateSettlementMutation(groupId);
    const deleteSettlementMutation = useDeleteSettlementMutation(groupId);

    const expenses = useAppStore(s => s.expenses);
    const messagesMap = useAppStore(s => s.messagesByGroup);
    const messages = useMemo(
        () => messagesMap[groupId] ?? [],
        [messagesMap, groupId],
    );

    useGroupMessagesRealtime(groupId);

    const memberMap = useMemo(() => {
        const map: Record<string, GroupMemberLite> = {};
        memberLites.forEach(m => {
            map[m.userId] = m;
        });
        return map;
    }, [memberLites]);

    const loadAll = useCallback(async () => {
        const [groupData, membersData, userId] = await Promise.all([
            getGroupById(groupId),
            getGroupMembers(groupId),
            getCurrentUserId(),
        ]);

        if (groupData) setGroup(groupData);
        if (userId) setCurrentUserId(userId);

        const userIds = membersData.map(m => m.userId);
        const nameById = new Map<string, string>();
        const avatarById = new Map<string, string | undefined>();
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, avatar_url')
                .in('id', userIds);
            (profiles ?? []).forEach(p => {
                nameById.set(p.id as string, (p.name as string) ?? '');
                avatarById.set(p.id as string, (p.avatar_url as string | undefined) ?? undefined);
            });
        }
        setMemberLites(membersToLite(membersData, nameById, avatarById));

        await Promise.all([
            fetchExpenses(groupId),
            fetchMessages(groupId),
            refetchSettlements(),
        ]);
    }, [groupId, refetchSettlements]);

    useEffect(() => {
        startLoading();
        void loadAll().finally(stopLoading);
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    }, [loadAll]);

    const feed = useMemo<FeedItem[]>(
        () => buildFeed(groupId, expenses, messages, settlements, currentUserId),
        [groupId, expenses, messages, settlements, currentUserId],
    );

    const trimmedQuery = searchQuery.trim().toLowerCase();
    const filterActive = isAnyExpenseFilterActive(filters);

    const filteredFeed = useMemo(() => {
        const dateFromMs = filters.dateFrom ? Date.parse(filters.dateFrom) : null;
        const dateToMs = filters.dateTo ? Date.parse(filters.dateTo) + 24 * 3600 * 1000 : null;
        return feed.filter(item => {
            if (item.kind === 'expense') {
                const e = item.expense;
                if (
                    filters.categories.length > 0 &&
                    (!e.category || !filters.categories.includes(e.category))
                ) {
                    return false;
                }
                if (filters.memberIds.length > 0) {
                    const participants = new Set<string>([
                        e.paidBy,
                        ...e.splits.map(s => s.userId),
                    ]);
                    if (!filters.memberIds.some(id => participants.has(id))) return false;
                }
                const expenseMs = new Date(e.expenseDate).getTime();
                if (dateFromMs !== null && expenseMs < dateFromMs) return false;
                if (dateToMs !== null && expenseMs >= dateToMs) return false;
                if (trimmedQuery) {
                    const payer = memberMap[e.paidBy]?.displayName ?? '';
                    const hay = `${e.description} ${payer}`.toLowerCase();
                    if (!hay.includes(trimmedQuery)) return false;
                }
                return true;
            }
            if (item.kind === 'settlement') {
                const s = item.settlement;
                if (filters.memberIds.length > 0) {
                    const participants = new Set<string>([s.fromUserId, s.toUserId]);
                    if (!filters.memberIds.some(id => participants.has(id))) return false;
                }
                const settlementMs = new Date(s.settlementDate).getTime();
                if (dateFromMs !== null && settlementMs < dateFromMs) return false;
                if (dateToMs !== null && settlementMs >= dateToMs) return false;
                if (trimmedQuery) {
                    const fromName = memberMap[s.fromUserId]?.displayName ?? '';
                    const toName = memberMap[s.toUserId]?.displayName ?? '';
                    const hay = `${fromName} ${toName}`.toLowerCase();
                    if (!hay.includes(trimmedQuery)) return false;
                }
                return true;
            }
            // message
            if (trimmedQuery) {
                const sender = memberMap[item.message.userId]?.displayName ?? '';
                const hay = `${item.message.body} ${sender}`.toLowerCase();
                if (!hay.includes(trimmedQuery)) return false;
            }
            return true;
        });
    }, [feed, filters, trimmedQuery, memberMap]);

    const handleBack = useCallback(() => navigation.goBack(), [navigation]);
    const handleSettings = useCallback(
        () => navigation.navigate('EditGroup', { groupId }),
        [navigation, groupId],
    );
    const handleSettleUp = useCallback(
        () => navigation.navigate('SettleUpList', { groupId }),
        [navigation, groupId],
    );
    const handleBalances = useCallback(
        () => navigation.navigate('Balances', { groupId }),
        [navigation, groupId],
    );
    const handleAddExpense = useCallback(
        () => navigation.navigate('AddExpense', { groupId }),
        [navigation, groupId],
    );
    const handleExpensePress = useCallback(
        (expenseId: string) =>
            navigation.navigate('ExpenseDetail', { expenseId, groupId }),
        [navigation, groupId],
    );

    const handleOpenComposer = useCallback(
        () => setComposer({ open: true, mode: 'create' }),
        [],
    );

    const handleExport = useCallback(async () => {
        if (!group) return;
        const filteredExpenses = filteredFeed
            .filter((i): i is Extract<FeedItem, { kind: 'expense' }> => i.kind === 'expense')
            .map(i => i.expense);
        await exportGroupCsv(group, filteredExpenses, memberLites);
    }, [group, filteredFeed, memberLites]);

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

    const confirmDeleteSettlement = useCallback(
        (s: Settlement) => {
            Alert.alert(t('settleUp.confirmDelete'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('settleUp.delete'),
                    style: 'destructive',
                    onPress: () => {
                        void deleteSettlementMutation.mutateAsync(s.id);
                    },
                },
            ]);
        },
        [deleteSettlementMutation, t],
    );

    const handleSettlementPress = useCallback(
        (s: Settlement) => {
            const involved =
                s.fromUserId === currentUserId || s.toUserId === currentUserId;
            const options = [
                t('common.cancel'),
                ...(involved ? [t('settleUp.edit'), t('settleUp.delete')] : []),
            ];

            if (Platform.OS === 'ios') {
                ActionSheetIOS.showActionSheetWithOptions(
                    {
                        options,
                        cancelButtonIndex: 0,
                        destructiveButtonIndex: involved ? 2 : undefined,
                    },
                    idx => {
                        if (!involved) return;
                        if (idx === 1) setEditingSettlement(s);
                        else if (idx === 2) confirmDeleteSettlement(s);
                    },
                );
                return;
            }

            if (!involved) return;
            Alert.alert(t('settleUp.title'), undefined, [
                { text: t('settleUp.edit'), onPress: () => setEditingSettlement(s) },
                {
                    text: t('settleUp.delete'),
                    style: 'destructive',
                    onPress: () => confirmDeleteSettlement(s),
                },
                { text: t('common.cancel'), style: 'cancel' },
            ]);
        },
        [confirmDeleteSettlement, currentUserId, t],
    );

    const handleSettlementEditSubmit = useCallback(
        async (values: SettleUpFormValues) => {
            if (!editingSettlement) return;
            await updateSettlementMutation.mutateAsync({
                id: editingSettlement.id,
                dto: {
                    fromUserId: values.fromUserId,
                    toUserId: values.toUserId,
                    amount: values.amount,
                    currency: values.currency,
                },
            });
            setEditingSettlement(null);
        },
        [editingSettlement, updateSettlementMutation],
    );

    const handleMessageDelete = useCallback(
        (m: GroupMessage) => {
            Alert.alert(t('groups.message.deleteConfirm'), undefined, [
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

    if (isLoading && !group) {
        return <LoadingIndicator />;
    }

    if (!group) {
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
                data={filteredFeed}
                keyExtractor={item =>
                    item.kind === 'expense'
                        ? `e:${item.expense.id}`
                        : item.kind === 'settlement'
                            ? `s:${item.settlement.id}`
                            : `m:${item.message.id}`
                }
                renderItem={({ item }) => (
                    <View className="px-4">
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
                    </View>
                )}
                ListHeaderComponent={
                    <>
                        <GroupHero
                            group={group}
                            memberCount={memberLites.length}
                            onBack={handleBack}
                            onSettings={handleSettings}
                        />
                        <QuickActionsRow
                            onSettleUp={handleSettleUp}
                            onBalances={handleBalances}
                            onExport={handleExport}
                        />
                        <View className="px-4 mt-4 mb-2 flex-row items-center">
                            <SearchExpandable
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                expanded={searchExpanded}
                                onExpandedChange={setSearchExpanded}
                                placeholder={t('groups.search.placeholder')}
                                testID="detail-search"
                            />
                            {!searchExpanded && (
                                <TouchableOpacity
                                    onPress={() => setFiltersOpen(true)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('groups.filters.title')}
                                    className="ml-1 h-9 w-9 items-center justify-center relative"
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
                            )}
                        </View>
                    </>
                }
                ListEmptyComponent={
                    isLoading ? null : (
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
                        </View>
                    )
                }
                contentContainerStyle={{ paddingBottom: 120 }}
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

            <SafeAreaView
                edges={['bottom']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
                className="bg-white border-t border-gray-100"
            >
                <View className="flex-row px-4 pt-2.5 pb-1" style={{ gap: 8 }}>
                    <TouchableOpacity
                        onPress={handleOpenComposer}
                        activeOpacity={0.85}
                        className="h-14 rounded-2xl bg-primary-extra-light items-center justify-center flex-row"
                        style={{ flex: 1 }}
                        testID="detail-message-btn"
                    >
                        <AppIcon name="chatbubble-outline" size={20} color={colors.primary} />
                        <Text className="text-base font-semibold text-primary-dark ml-2">
                            {t('groups.actions.message')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleAddExpense}
                        activeOpacity={0.85}
                        className="h-14 rounded-2xl bg-primary items-center justify-center flex-row"
                        style={{ flex: 1 }}
                        testID="detail-add-expense"
                    >
                        <AppIcon name="add" size={22} color="#fff" />
                        <Text className="text-base font-semibold text-white ml-2">
                            {t('expenses.addExpense')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <ExpenseFiltersSheet
                visible={filtersOpen}
                filters={filters}
                availableCategories={CATEGORIES}
                availableMembers={memberLites}
                onApply={setFilters}
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
                    void loadAll();
                }}
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
                    }}
                    mode="edit"
                    submitting={updateSettlementMutation.isPending}
                    onSubmit={handleSettlementEditSubmit}
                    onClose={() => setEditingSettlement(null)}
                />
            )}
        </View>
    );
}
