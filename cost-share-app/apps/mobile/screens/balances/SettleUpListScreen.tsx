/**
 * SettleUpListScreen
 * Lists the simplified settle-up plan in a group (per currency) — the same
 * set of transfers that the Balances screen's simplified-debts section shows.
 * Rows where the current user is involved are shown directly; debts that
 * don't involve the current user are collapsed behind a toggle.
 */

import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GroupMemberLite, PairwiseDebt, Settlement } from '@cost-share/shared';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { MemberAvatar } from '../../components/MemberAvatar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import { DebtRow } from '../../components/balances/DebtRow';
import { FeedItemDetailSheet } from '../../components/FeedItemDetailSheet';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
    useCreateSettlementMutation,
    useDeleteSettlementMutation,
    useGroupSettlementsQuery,
    useUpdateSettlementMutation,
} from '../../hooks/queries/useSettlementQueries';
import { useGroupSimplifiedDebtsByCurrencyQuery } from '../../hooks/queries/useGroupBalancesQueries';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useGroupSettlementsRealtime } from '../../hooks/useGroupSettlementsRealtime';
import { useAppStore } from '../../store';
import { colors } from '../../theme';
import { getAvatarUrl, getAvatarUrlForMember, getDisplayName } from '../../lib/userDisplay';

interface SortedDebts {
    youInvolved: PairwiseDebt[];
    others: PairwiseDebt[];
}

function sortDebts(debts: PairwiseDebt[], currentUserId: string): SortedDebts {
    const youInvolved: PairwiseDebt[] = [];
    const others: PairwiseDebt[] = [];
    for (const d of debts) {
        if (d.fromUserId === currentUserId || d.toUserId === currentUserId) {
            youInvolved.push(d);
        } else {
            others.push(d);
        }
    }
    const cmp = (a: PairwiseDebt, b: PairwiseDebt) => b.amount - a.amount;
    youInvolved.sort(cmp);
    others.sort(cmp);
    return { youInvolved, others };
}

export function SettleUpListScreen() {
    const { t } = useTranslation();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { groupId } = route.params;
    const currentUserId = useAppStore(s => s.currentUser?.id ?? '');
    const groupName = useAppStore(
        s => s.groups.find(g => g.id === groupId)?.name,
    );
    const groupDefaultCurrency = useAppStore(
        s => s.groups.find(g => g.id === groupId)?.defaultCurrency ?? 'USD',
    );

    useLayoutEffect(() => {
        if (groupName) {
            navigation.setOptions({ title: groupName });
        }
    }, [navigation, groupName]);

    const { data: members = [] } = useGroupUsersQuery(groupId);
    const memberLites = useMemo<GroupMemberLite[]>(
        () =>
            members.map(m => ({
                userId: m.id,
                displayName: getDisplayName(m, t),
                avatarUrl: getAvatarUrl(m) ?? undefined,
                isActive: m.isActive,
            })),
        [members, t],
    );

    const {
        data: simplifiedEntries = [],
        isLoading,
        isFetching,
        isRefetching,
        refetch,
    } = useGroupSimplifiedDebtsByCurrencyQuery(groupId);
    const debts = useMemo<PairwiseDebt[]>(
        () =>
            simplifiedEntries.flatMap(entry =>
                entry.result.debts.map(d => ({
                    fromUserId: d.fromUserId,
                    toUserId: d.toUserId,
                    currency: d.currency,
                    amount: d.amount,
                })),
            ),
        [simplifiedEntries],
    );
    const { data: settlements = [], refetch: refetchSettlements } =
        useGroupSettlementsQuery(groupId);
    const createMutation = useCreateSettlementMutation(groupId);
    const updateSettlementMutation = useUpdateSettlementMutation(groupId);
    const deleteSettlementMutation = useDeleteSettlementMutation(groupId);

    useGroupSettlementsRealtime(groupId);

    const [activeDebt, setActiveDebt] = useState<PairwiseDebt | null>(null);
    const [detailSettlement, setDetailSettlement] = useState<Settlement | null>(null);
    const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
    const [pendingDeleteSettlement, setPendingDeleteSettlement] =
        useState<Settlement | null>(null);
    const [othersExpanded, setOthersExpanded] = useState(false);
    const [recordingPayment, setRecordingPayment] = useState(false);

    const memberMap = useMemo<Record<string, GroupMemberLite>>(() => {
        const map: Record<string, GroupMemberLite> = {};
        for (const m of memberLites) {
            map[m.userId] = m;
        }
        return map;
    }, [memberLites]);

    const sortedSettlements = useMemo(
        () =>
            [...settlements].sort((a, b) => {
                const da = new Date(a.settlementDate).getTime();
                const db = new Date(b.settlementDate).getTime();
                if (db !== da) return db - da;
                return (
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );
            }),
        [settlements],
    );

    const { youInvolved, others } = useMemo(
        () => sortDebts(debts, currentUserId),
        [debts, currentUserId],
    );

    const involvedItems = useMemo(
        () => youInvolved.map(d => ({ debt: d, involved: true as const })),
        [youInvolved],
    );

    const displayName = useCallback(
        (userId: string): string => {
            if (userId === currentUserId) return t('settleUp.you');
            const m = memberLites.find(x => x.userId === userId);
            return m?.displayName ?? t('common.unknown');
        },
        [memberLites, currentUserId, t],
    );

    const memberAvatarFor = useCallback(
        (userId: string): string | undefined =>
            getAvatarUrlForMember(memberLites.find(x => x.userId === userId)),
        [memberLites],
    );

    const handleRowPress = useCallback((debt: PairwiseDebt) => {
        setActiveDebt(debt);
    }, []);

    const handleSubmit = useCallback(
        async (values: SettleUpFormValues) => {
            await createMutation.mutateAsync({
                groupId,
                fromUserId: values.fromUserId,
                toUserId: values.toUserId,
                amount: values.amount,
                currency: values.currency,
                paymentMethod: values.paymentMethod,
                settlementDate: values.settlementDate,
            });
            setActiveDebt(null);
        },
        [createMutation, groupId],
    );

    const handleSettlementRowPress = useCallback((s: Settlement) => {
        setDetailSettlement(s);
    }, []);

    const handleDetailEdit = useCallback(() => {
        if (!detailSettlement) return;
        const s = detailSettlement;
        setDetailSettlement(null);
        setEditingSettlement(s);
    }, [detailSettlement]);

    const handleDetailDeleteRequest = useCallback(() => {
        if (!detailSettlement) return;
        setPendingDeleteSettlement(detailSettlement);
    }, [detailSettlement]);

    const handleConfirmDelete = useCallback(async () => {
        if (!pendingDeleteSettlement) return;
        const deleted = await deleteSettlementMutation.mutateAsync(
            pendingDeleteSettlement.id,
        );
        if (deleted) {
            setDetailSettlement(null);
        }
        setPendingDeleteSettlement(null);
    }, [pendingDeleteSettlement, deleteSettlementMutation]);

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

    if ((isLoading || isFetching) && debts.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
            <FlatList
                data={involvedItems}
                keyExtractor={(item, idx) =>
                    `${item.debt.fromUserId}:${item.debt.toUserId}:${item.debt.currency}:${idx}`
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                ListHeaderComponent={
                    involvedItems.length > 0 ? (
                        <Text className="mb-3 px-1 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                            {t('settleUp.openDebts')}
                        </Text>
                    ) : null
                }
                renderItem={({ item }) => (
                    <DebtRow
                        debt={item.debt}
                        involved={item.involved}
                        fromName={displayName(item.debt.fromUserId)}
                        toName={displayName(item.debt.toUserId)}
                        fromAvatar={memberAvatarFor(item.debt.fromUserId)}
                        toAvatar={memberAvatarFor(item.debt.toUserId)}
                        onPress={() => handleRowPress(item.debt)}
                    />
                )}
                ListEmptyComponent={
                    isFetching ? null : (
                        <EmptyState
                            iconName="checkmark-circle-outline"
                            title={t('settleUp.empty')}
                            message={t('balances.noDebts')}
                        />
                    )
                }
                ListFooterComponent={
                    <>
                        {others.length > 0 ? (
                            <View className={involvedItems.length > 0 ? 'mt-2' : 'mt-4'}>
                                <TouchableOpacity
                                    onPress={() => setOthersExpanded(v => !v)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    className="flex-row items-center px-3 py-2.5 rounded-2xl bg-slate-100/70 border border-gray-200"
                                    testID="settle-others-toggle"
                                >
                                    <AppIcon
                                        name={othersExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={16}
                                        color={colors.gray500}
                                    />
                                    <Text className="ml-2 flex-1 text-[13px] font-medium text-gray-600">
                                        {t('settleUp.othersToggle', { count: others.length })}
                                    </Text>
                                </TouchableOpacity>
                                {othersExpanded && (
                                    <View className="mt-2">
                                        {others.map(d => (
                                            <DebtRow
                                                key={`${d.fromUserId}:${d.toUserId}:${d.currency}`}
                                                debt={d}
                                                involved={false}
                                                fromName={displayName(d.fromUserId)}
                                                toName={displayName(d.toUserId)}
                                                fromAvatar={memberAvatarFor(d.fromUserId)}
                                                toAvatar={memberAvatarFor(d.toUserId)}
                                                onPress={() => handleRowPress(d)}
                                            />
                                        ))}
                                    </View>
                                )}
                            </View>
                        ) : null}
                        {memberLites.filter(m => m.isActive).length >= 2 ? (
                            <TouchableOpacity
                                onPress={() => setRecordingPayment(true)}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                className="mt-3 flex-row items-center justify-center px-3 py-3 rounded-2xl bg-white border border-dashed border-primary-dark"
                                testID="settle-record-payment-cta"
                            >
                                <AppIcon name="add-circle-outline" size={18} color={colors.primaryDark} />
                                <Text className="ml-2 text-[14px] font-semibold text-primary-dark">
                                    {t('settleUp.recordPaymentCta')}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                        {sortedSettlements.length > 0 ? (
                            <View className="mt-8 mb-4">
                                <View className="flex-row items-center mb-3 px-1">
                                    <View className="flex-1 h-px bg-gray-300" />
                                    <View className="flex-row items-center mx-3">
                                        <AppIcon
                                            name="time-outline"
                                            size={14}
                                            color={colors.gray500}
                                        />
                                        <Text className="ml-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                                            {t('balances.settlementHistory')}
                                        </Text>
                                    </View>
                                    <View className="flex-1 h-px bg-gray-300" />
                                </View>
                                <View className="rounded-2xl bg-slate-100/70 border border-gray-200 overflow-hidden">
                                    {sortedSettlements.map((s, idx) => (
                                        <SettlementHistoryRow
                                            key={s.id}
                                            settlement={s}
                                            fromName={displayName(s.fromUserId)}
                                            toName={displayName(s.toUserId)}
                                            fromAvatar={memberAvatarFor(s.fromUserId)}
                                            toAvatar={memberAvatarFor(s.toUserId)}
                                            isLast={idx === sortedSettlements.length - 1}
                                            onPress={() => handleSettlementRowPress(s)}
                                        />
                                    ))}
                                </View>
                            </View>
                        ) : null}
                    </>
                }
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={() => {
                            void refetch();
                            void refetchSettlements();
                        }}
                        tintColor={colors.primary}
                    />
                }
            />

            {activeDebt && currentUserId && (
                <SettleUpSheet
                    visible={Boolean(activeDebt)}
                    members={memberLites}
                    pairwiseDebts={debts}
                    currentUserId={currentUserId}
                    initial={{
                        fromUserId: activeDebt.fromUserId,
                        toUserId: activeDebt.toUserId,
                        currency: activeDebt.currency,
                        amount: activeDebt.amount,
                    }}
                    mode="create"
                    submitting={createMutation.isPending}
                    onSubmit={handleSubmit}
                    onClose={() => setActiveDebt(null)}
                    groupName={groupName}
                />
            )}

            <FeedItemDetailSheet
                item={detailSettlement ? { kind: 'settlement', settlement: detailSettlement } : null}
                memberMap={memberMap}
                currentUserId={currentUserId}
                onClose={() => setDetailSettlement(null)}
                onEdit={handleDetailEdit}
                onDelete={handleDetailDeleteRequest}
            />

            <ConfirmDialog
                visible={pendingDeleteSettlement !== null}
                title={t('settleUp.delete')}
                message={t('settleUp.confirmDelete')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={() => {
                    void handleConfirmDelete();
                }}
                onCancel={() => setPendingDeleteSettlement(null)}
                destructive
            />

            {editingSettlement && currentUserId && (
                <SettleUpSheet
                    visible={Boolean(editingSettlement)}
                    members={memberLites}
                    pairwiseDebts={debts}
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
                    groupName={groupName}
                />
            )}

            {recordingPayment && currentUserId && (
                <SettleUpSheet
                    visible={recordingPayment}
                    members={memberLites}
                    pairwiseDebts={debts}
                    currentUserId={currentUserId}
                    initial={pickRecordPaymentInitial({
                        memberLites,
                        currentUserId,
                        defaultCurrency: groupDefaultCurrency,
                    })}
                    mode="create"
                    allowParticipantEdit
                    submitting={createMutation.isPending}
                    onSubmit={async values => {
                        await handleSubmit(values);
                        setRecordingPayment(false);
                    }}
                    onClose={() => setRecordingPayment(false)}
                    groupName={groupName}
                />
            )}
        </SafeAreaView>
    );
}

interface RecordPaymentInitialArgs {
    memberLites: GroupMemberLite[];
    currentUserId: string;
    defaultCurrency: string;
}

/**
 * Starting point for the "record a payment" sheet: the current user is the
 * default payer; the first other active member is the default receiver; the
 * currency defaults to the group's default. Deleted (inactive) accounts are
 * skipped — the user can swap any of these via the in-sheet pickers.
 */
function pickRecordPaymentInitial({
    memberLites,
    currentUserId,
    defaultCurrency,
}: RecordPaymentInitialArgs) {
    const activeMembers = memberLites.filter(m => m.isActive);
    const selfIsActive = activeMembers.some(m => m.userId === currentUserId);
    const fromUserId = selfIsActive
        ? currentUserId
        : activeMembers[0]?.userId ?? '';
    const toUserId =
        activeMembers.find(m => m.userId !== fromUserId)?.userId ?? '';
    return {
        fromUserId,
        toUserId,
        currency: defaultCurrency,
        amount: 0,
    };
}

interface SettlementHistoryRowProps {
    settlement: Settlement;
    fromName: string;
    toName: string;
    fromAvatar?: string;
    toAvatar?: string;
    isLast: boolean;
    onPress: () => void;
}

function SettlementHistoryRow({
    settlement,
    fromName,
    toName,
    fromAvatar,
    toAvatar,
    isLast,
    onPress,
}: SettlementHistoryRowProps) {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language?.startsWith('he') ?? false;
    const locale = isRtl ? 'he-IL' : undefined;
    const dateText = new Date(settlement.settlementDate).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
    const amountText = `${settlement.currency} ${settlement.amount.toFixed(2)}`;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            className={`flex-row items-center px-3 py-2.5 bg-transparent ${
                isLast ? '' : 'border-b border-gray-200'
            }`}
            testID={`settle-history-${settlement.id}`}
        >
            <View className="mr-2">
                <AppIcon name="checkmark-circle" size={18} color={colors.success.DEFAULT} />
            </View>
            <MemberAvatar name={fromName} avatarUrl={fromAvatar} size="xs" />
            <View className="mx-1.5">
                <Text className="text-gray-400 text-xs">{isRtl ? '←' : '→'}</Text>
            </View>
            <MemberAvatar name={toName} avatarUrl={toAvatar} size="xs" />

            <View className="flex-1 ml-2.5">
                <Text
                    className="text-[13px] text-gray-600"
                    numberOfLines={1}
                >
                    {t('feed.settlement', {
                        from: fromName,
                        to: toName,
                        amount: amountText,
                    })}
                </Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">
                    {dateText}
                </Text>
            </View>

            <Text className="text-[13px] font-semibold text-gray-500">
                {amountText}
            </Text>
        </TouchableOpacity>
    );
}
