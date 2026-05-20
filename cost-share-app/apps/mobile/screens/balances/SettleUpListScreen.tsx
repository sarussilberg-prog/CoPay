/**
 * SettleUpListScreen
 * Lists every pairwise debt in a group (per currency).
 * Rows where the current user is involved are pinned at the top with "you" labels.
 * Rows where the current user is not involved are visible but disabled.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import { GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import { Text } from '../../components/AppText';
import { MemberAvatar } from '../../components/MemberAvatar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { SettleUpSheet, SettleUpFormValues } from '../../components/SettleUpSheet';
import {
    useCreateSettlementMutation,
    useGroupPairwiseDebtsQuery,
} from '../../hooks/queries/useSettlementQueries';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useAppStore } from '../../store';
import { colors } from '../../theme';

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
    const { groupId } = route.params;
    const currentUserId = useAppStore(s => s.currentUser?.id ?? '');

    const { data: members = [] } = useGroupUsersQuery(groupId);
    const memberLites = useMemo<GroupMemberLite[]>(
        () =>
            members.map(m => ({
                userId: m.id,
                displayName: m.name,
                avatarUrl: m.avatarUrl,
            })),
        [members],
    );

    const {
        data: debts = [],
        isLoading,
        isRefetching,
        refetch,
    } = useGroupPairwiseDebtsQuery(groupId);
    const createMutation = useCreateSettlementMutation(groupId);

    const [activeDebt, setActiveDebt] = useState<PairwiseDebt | null>(null);

    const { youInvolved, others } = useMemo(
        () => sortDebts(debts, currentUserId),
        [debts, currentUserId],
    );

    const sections = useMemo(
        () => [
            ...youInvolved.map(d => ({ debt: d, involved: true as const })),
            ...others.map(d => ({ debt: d, involved: false as const })),
        ],
        [youInvolved, others],
    );

    const displayName = useCallback(
        (userId: string): string => {
            if (userId === currentUserId) return t('settleUp.you');
            const m = memberLites.find(x => x.userId === userId);
            return m?.displayName ?? t('common.unknown');
        },
        [memberLites, currentUserId, t],
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
            });
            setActiveDebt(null);
        },
        [createMutation, groupId],
    );

    if (isLoading && debts.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
            <FlatList
                data={sections}
                keyExtractor={(item, idx) =>
                    `${item.debt.fromUserId}:${item.debt.toUserId}:${item.debt.currency}:${idx}`
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                renderItem={({ item }) => (
                    <DebtRow
                        debt={item.debt}
                        involved={item.involved}
                        fromName={displayName(item.debt.fromUserId)}
                        toName={displayName(item.debt.toUserId)}
                        fromAvatar={
                            memberLites.find(m => m.userId === item.debt.fromUserId)?.avatarUrl
                        }
                        toAvatar={
                            memberLites.find(m => m.userId === item.debt.toUserId)?.avatarUrl
                        }
                        onPress={() => handleRowPress(item.debt)}
                    />
                )}
                ListEmptyComponent={
                    <EmptyState
                        iconName="checkmark-circle-outline"
                        title={t('settleUp.empty')}
                        message={t('balances.noDebts')}
                    />
                }
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={() => {
                            void refetch();
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
                />
            )}
        </SafeAreaView>
    );
}

interface DebtRowProps {
    debt: PairwiseDebt;
    involved: boolean;
    fromName: string;
    toName: string;
    fromAvatar?: string;
    toAvatar?: string;
    onPress: () => void;
}

function DebtRow({
    debt,
    involved,
    fromName,
    toName,
    fromAvatar,
    toAvatar,
    onPress,
}: DebtRowProps) {
    const { t } = useTranslation();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className={`rounded-2xl p-4 mb-2 border flex-row items-center ${
                involved ? 'bg-white border-gray-100' : 'bg-slate-50 border-dashed border-gray-300'
            }`}
            accessibilityRole="button"
            testID={`settle-debt-${debt.fromUserId}-${debt.toUserId}-${debt.currency}`}
        >
            <MemberAvatar name={fromName} avatarUrl={fromAvatar} size="sm" />
            <View className="mx-2">
                <Text className="text-gray-400">→</Text>
            </View>
            <MemberAvatar name={toName} avatarUrl={toAvatar} size="sm" />

            <View className="flex-1 ml-3">
                <Text
                    className={`text-sm font-semibold ${involved ? 'text-gray-900' : 'text-gray-600'}`}
                    numberOfLines={1}
                >
                    {t('settleUp.row', {
                        from: fromName,
                        to: toName,
                        amount: `${debt.currency} ${debt.amount.toFixed(2)}`,
                    })}
                </Text>
                {!involved && (
                    <Text className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">
                        {t('settleUp.notInvolved')}
                    </Text>
                )}
            </View>

            <Text
                className={`text-base font-bold ${involved ? 'text-red-500' : 'text-gray-500'}`}
            >
                {debt.currency} {debt.amount.toFixed(2)}
            </Text>
        </TouchableOpacity>
    );
}
