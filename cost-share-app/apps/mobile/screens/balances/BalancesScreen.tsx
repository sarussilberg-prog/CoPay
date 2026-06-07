/**
 * BalancesScreen
 *
 * Top-level layout (top → bottom):
 *   • GroupTotalsCard — total spent / unsettled / expense count.
 *   • Members card — one row per group member, paid per currency.
 *     Tapping a row opens MemberContributionDialog (unchanged).
 *   • SimplifiedDebtsSection — per-currency runs of simplifyDebts.
 *     Debts that don't involve the current user are collapsed behind
 *     a toggle (mirrors SettleUpListScreen).
 *
 * Multi-currency-aware throughout; amounts are never silently
 * collapsed across currencies.
 */

import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    CurrencyAmount,
    DebtSummary,
    GroupMemberLite,
    PairwiseDebt,
    calculateGroupTotalUnsettled,
} from '@cost-share/shared';
import { Text } from '../../components/AppText';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import { GroupTotalsCard } from '../../components/balances/GroupTotalsCard';
import { MemberContributionRow } from '../../components/balances/MemberContributionRow';
import { MemberContributionDialog } from '../../components/balances/MemberContributionDialog';
import { SimplifiedDebtsSection } from '../../components/balances/SimplifiedDebtsSection';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import {
    useGroupContributionsQuery,
    useGroupSimplifiedDebtsByCurrencyQuery,
} from '../../hooks/queries/useGroupBalancesQueries';
import {
    useCreateSettlementMutation,
    useGroupPairwiseDebtsQuery,
} from '../../hooks/queries/useSettlementQueries';
import { useAppStore } from '../../store';
import { colors } from '../../theme';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';

interface SettleTarget {
    fromUserId: string;
    toUserId: string;
    currency: string;
    amount: number;
}

function sumPaidByCurrency(
    totals: { paid: CurrencyAmount[] }[],
): CurrencyAmount[] {
    const acc = new Map<string, number>();
    for (const t of totals) {
        for (const row of t.paid) {
            acc.set(row.currency, (acc.get(row.currency) ?? 0) + row.amount);
        }
    }
    return Array.from(acc.entries())
        .map(([currency, amount]) => ({
            currency,
            amount: Number(amount.toFixed(2)),
        }))
        .filter(row => row.amount >= 0.01);
}

export function BalancesScreen() {
    const { t } = useTranslation();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { groupId } = route.params;
    const currentUserId = useAppStore(s => s.currentUser?.id ?? '');
    const groupsQuery = useGroupsQuery();
    const group = groupsQuery.data?.find(g => g.id === groupId);
    const groupName = group?.name;
    const defaultCurrency = group?.defaultCurrency ?? 'USD';

    useLayoutEffect(() => {
        if (groupName) {
            navigation.setOptions({ title: groupName });
        }
    }, [navigation, groupName]);

    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

    const { data: allUsers = [] } = useGroupUsersQuery(groupId);
    const {
        data: contributions,
        isLoading: isLoadingContributions,
        isFetching: isFetchingContributions,
        refetch: refetchContributions,
    } = useGroupContributionsQuery(groupId);
    const {
        data: simplifiedByCurrency,
        isLoading: isLoadingDebts,
        isFetching: isFetchingDebts,
        refetch: refetchDebts,
    } = useGroupSimplifiedDebtsByCurrencyQuery(groupId);
    const { data: pairwiseDebts = [], refetch: refetchPairwise } =
        useGroupPairwiseDebtsQuery(groupId);
    const createMutation = useCreateSettlementMutation(groupId);

    const members: GroupMemberLite[] = useMemo(
        () =>
            allUsers.map(u => ({
                userId: u.id,
                displayName: getDisplayName(u, t),
                avatarUrl: getAvatarUrl(u) ?? undefined,
                isActive: u.isActive,
            })),
        [allUsers, t],
    );

    const avatarById: Record<string, string | undefined> = useMemo(() => {
        const map: Record<string, string | undefined> = {};
        for (const m of members) map[m.userId] = m.avatarUrl;
        return map;
    }, [members]);

    const nameById: Record<string, string> = useMemo(() => {
        const map: Record<string, string> = {};
        for (const m of members) map[m.userId] = m.displayName;
        return map;
    }, [members]);

    const sortedMembers = useMemo(() => {
        const sorted = [...members];
        sorted.sort((a, b) => {
            if (a.userId === currentUserId) return -1;
            if (b.userId === currentUserId) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
        return sorted;
    }, [members, currentUserId]);

    const totalsByUser = useMemo(() => {
        const map = new Map<string, { paid: CurrencyAmount[]; owed: CurrencyAmount[] }>();
        for (const row of contributions?.totals ?? []) {
            map.set(row.userId, { paid: row.paid, owed: row.owed });
        }
        return map;
    }, [contributions]);

    const totalSpent: CurrencyAmount[] = useMemo(
        () => sumPaidByCurrency(contributions?.totals ?? []),
        [contributions],
    );

    const unsettledTotal: CurrencyAmount[] = useMemo(() => {
        const flat: PairwiseDebt[] =
            simplifiedByCurrency?.flatMap(e =>
                e.result.debts.map(d => ({
                    fromUserId: d.fromUserId,
                    toUserId: d.toUserId,
                    currency: d.currency,
                    amount: d.amount,
                })),
            ) ?? [];
        return calculateGroupTotalUnsettled(flat);
    }, [simplifiedByCurrency]);

    const expenseCount = contributions?.expenseCount ?? 0;

    const paidForUser = useCallback(
        (userId: string): CurrencyAmount[] => {
            return totalsByUser.get(userId)?.paid ?? [];
        },
        [totalsByUser],
    );

    const handleMemberPress = useCallback((userId: string) => {
        setSelectedMemberId(userId);
    }, []);

    const handleSettle = useCallback((debt: DebtSummary) => {
        setSettleTarget({
            fromUserId: debt.fromUserId,
            toUserId: debt.toUserId,
            currency: debt.currency,
            amount: debt.amount,
        });
    }, []);

    const handleSubmitSettlement = useCallback(
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
            setSettleTarget(null);
        },
        [createMutation, groupId],
    );

    const handleRefresh = useCallback(async () => {
        await Promise.all([
            refetchContributions(),
            refetchDebts(),
            refetchPairwise(),
        ]);
    }, [refetchContributions, refetchDebts, refetchPairwise]);

    const selectedMember =
        selectedMemberId != null
            ? members.find(m => m.userId === selectedMemberId) ?? null
            : null;

    const dialogSelfTotals: CurrencyAmount[] = useMemo(() => {
        if (!selectedMemberId) return [];
        return paidForUser(selectedMemberId);
    }, [selectedMemberId, paidForUser]);

    const pairwiseDebtsForSettle: PairwiseDebt[] = useMemo(() => {
        if (!settleTarget) return pairwiseDebts;
        const seed: PairwiseDebt = {
            fromUserId: settleTarget.fromUserId,
            toUserId: settleTarget.toUserId,
            currency: settleTarget.currency,
            amount: settleTarget.amount,
        };
        const exists = pairwiseDebts.some(
            d =>
                d.fromUserId === seed.fromUserId &&
                d.toUserId === seed.toUserId &&
                d.currency === seed.currency,
        );
        return exists ? pairwiseDebts : [seed, ...pairwiseDebts];
    }, [pairwiseDebts, settleTarget]);

    if (
        (isLoadingContributions && !contributions) ||
        (isLoadingDebts && !simplifiedByCurrency)
    ) {
        return <LoadingIndicator />;
    }

    return (
        <View className="flex-1 bg-slate-50">
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={isFetchingContributions || isFetchingDebts}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
            >
                <View className="px-4 pt-4">
                    <GroupTotalsCard
                        totalSpent={totalSpent}
                        unsettled={unsettledTotal}
                        expenseCount={expenseCount}
                        defaultCurrency={defaultCurrency}
                    />
                </View>

                <View className="px-4 pt-4">
                    <Text className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-2">
                        {t('balances.membersSectionLabel')}
                    </Text>
                    <View className="bg-white rounded-xl overflow-hidden">
                        {sortedMembers.map((member, idx) => (
                            <MemberContributionRow
                                key={member.userId}
                                userId={member.userId}
                                name={member.displayName}
                                avatarUrl={member.avatarUrl}
                                amounts={paidForUser(member.userId)}
                                isCurrentUser={member.userId === currentUserId}
                                isLast={idx === sortedMembers.length - 1}
                                onPress={() => handleMemberPress(member.userId)}
                            />
                        ))}
                    </View>
                </View>

                <View className="px-4 pt-4 pb-8">
                    <Text className="text-lg font-semibold text-gray-900 mb-1">
                        {t('balances.simplifiedDebts')}
                    </Text>
                    <SimplifiedDebtsSection
                        entries={simplifiedByCurrency ?? []}
                        avatarById={avatarById}
                        nameById={nameById}
                        currentUserId={currentUserId}
                        onSettle={handleSettle}
                    />
                </View>
            </ScrollView>

            {/* Toggle was removed; the breakdown always shows what each member paid. */}
            <MemberContributionDialog
                open={selectedMember !== null}
                member={selectedMember}
                allMembers={sortedMembers}
                matrix={contributions?.matrix ?? []}
                selfTotals={dialogSelfTotals}
                mode="paid"
                currentUserId={currentUserId}
                onClose={() => setSelectedMemberId(null)}
            />

            {settleTarget && currentUserId && (
                <SettleUpSheet
                    visible={Boolean(settleTarget)}
                    members={members}
                    pairwiseDebts={pairwiseDebtsForSettle}
                    currentUserId={currentUserId}
                    initial={settleTarget}
                    mode="create"
                    submitting={createMutation.isPending}
                    onSubmit={handleSubmitSettlement}
                    onClose={() => setSettleTarget(null)}
                    groupName={groupName}
                />
            )}
        </View>
    );
}
