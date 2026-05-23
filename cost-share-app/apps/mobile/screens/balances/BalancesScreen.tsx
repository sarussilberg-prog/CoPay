/**
 * BalancesScreen
 *
 * Top-level layout (top → bottom):
 *   • Mode toggle (Paid / Spent on) — defaults to Paid on every screen entry.
 *   • Per-member list — one row per group member, with per-currency totals
 *     in the chosen mode. Tapping a row opens MemberContributionDialog.
 *   • Simplified-debts section — per-currency runs of simplifyDebts; each
 *     row has a "Settle debt" button that opens SettleUpSheet pre-filled.
 *
 * Multi-currency-aware: amounts are never silently collapsed across
 * currencies. Drill-in shows gross "X paid for Y" matrix rows; net
 * resolution lives only in the simplified-debts section.
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
} from '@cost-share/shared';
import { Text } from '../../components/AppText';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import { BalanceModeToggle, type BalanceMode } from '../../components/balances/BalanceModeToggle';
import { MemberContributionRow } from '../../components/balances/MemberContributionRow';
import { MemberContributionDialog } from '../../components/balances/MemberContributionDialog';
import { SimplifiedDebtsSection } from '../../components/balances/SimplifiedDebtsSection';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
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

export function BalancesScreen() {
    const { t } = useTranslation();
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { groupId } = route.params;
    const currentUserId = useAppStore(s => s.currentUser?.id ?? '');
    const groupName = useAppStore(
        s => s.groups.find(g => g.id === groupId)?.name,
    );

    useLayoutEffect(() => {
        if (groupName) {
            navigation.setOptions({ title: groupName });
        }
    }, [navigation, groupName]);

    const [mode, setMode] = useState<BalanceMode>('paid');
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
        for (const t of contributions?.totals ?? []) {
            map.set(t.userId, { paid: t.paid, owed: t.owed });
        }
        return map;
    }, [contributions]);

    const amountsForRow = useCallback(
        (userId: string): CurrencyAmount[] => {
            const entry = totalsByUser.get(userId);
            if (!entry) return [];
            return mode === 'paid' ? entry.paid : entry.owed;
        },
        [totalsByUser, mode],
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
        return amountsForRow(selectedMemberId);
    }, [selectedMemberId, amountsForRow]);

    const pairwiseDebtsForSettle: PairwiseDebt[] = useMemo(() => {
        if (!settleTarget) return pairwiseDebts;
        // Ensure the (from, to, currency) at the offered amount is in the
        // sheet's debts so currency picker shows it even if the RPC view
        // doesn't surface a perfect pair.
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
                    <BalanceModeToggle mode={mode} onChange={setMode} />
                </View>

                <View className="px-4 pt-4">
                    <Text className="text-lg font-semibold text-gray-900 mb-3">
                        {t('balances.title')}
                    </Text>
                    {sortedMembers.map(member => (
                        <MemberContributionRow
                            key={member.userId}
                            userId={member.userId}
                            name={member.displayName}
                            avatarUrl={member.avatarUrl}
                            amounts={amountsForRow(member.userId)}
                            mode={mode}
                            isCurrentUser={member.userId === currentUserId}
                            onPress={() => handleMemberPress(member.userId)}
                        />
                    ))}
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

            <MemberContributionDialog
                open={selectedMember !== null}
                member={selectedMember}
                allMembers={sortedMembers}
                matrix={contributions?.matrix ?? []}
                selfTotals={dialogSelfTotals}
                mode={mode}
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
                />
            )}
        </View>
    );
}
