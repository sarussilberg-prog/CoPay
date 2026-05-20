/**
 * BalancesScreen
 * Group balances and simplified debts
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { UserBalance, DebtSummary } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { getGroupBalances, getGroupDebts } from '../../services/groups.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { BalanceCard } from '../../components/BalanceCard';
import { Button } from '../../components/Button';
import { colors } from '../../theme';

export function BalancesScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [balances, setBalances] = useState<UserBalance[]>([]);
    const [debts, setDebts] = useState<DebtSummary[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);

    const loadData = useCallback(async () => {
        startLoading();
        const [balancesData, debtsData] = await Promise.all([
            getGroupBalances(groupId),
            getGroupDebts(groupId),
        ]);
        setBalances(balancesData);
        setDebts(debtsData);
        stopLoading();
    }, [groupId, startLoading, stopLoading]);

    useEffect(() => {
        void loadData();
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    const getUserName = (userId: string): string => {
        return allUsers.find((u) => u.id === userId)?.name || t('common.unknown');
    };

    const getUserAvatar = (userId: string): string | undefined => {
        return allUsers.find((u) => u.id === userId)?.avatarUrl;
    };

    const handleSettleUp = useCallback(
        (debt: DebtSummary) => {
            navigation.navigate('SettleUp', {
                groupId,
                fromUserId: debt.fromUserId,
                toUserId: debt.toUserId,
                amount: debt.amount,
                currency: debt.currency,
            });
        },
        [navigation, groupId]
    );

    const handleViewHistory = useCallback(() => {
        navigation.navigate('SettlementHistory', { groupId });
    }, [navigation, groupId]);

    if (isLoading && balances.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <ScrollView
            className="flex-1 bg-slate-50"
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.primary}
                />
            }
        >
            {/* Balances */}
            <View className="px-4 pt-4 mb-4">
                <Text className="text-lg font-semibold text-gray-900 mb-3">
                    {t('balances.title')}
                </Text>
                {balances.map((balance) => (
                    <BalanceCard
                        key={balance.userId}
                        userName={getUserName(balance.userId)}
                        avatarUrl={getUserAvatar(balance.userId)}
                        balance={balance.netBalance}
                        currency={balance.currency}
                    />
                ))}
                {balances.length === 0 && (
                    <View className="bg-white rounded-xl p-6 items-center">
                        <Text className="text-gray-400">{t('balances.noBalances')}</Text>
                    </View>
                )}
            </View>

            {/* Simplified Debts */}
            <View className="px-4 mb-4">
                <Text className="text-lg font-semibold text-gray-900 mb-3">
                    {t('balances.simplifiedDebts')}
                </Text>
                {debts.length > 0 ? (
                    debts.map((debt, index) => (
                        <View
                            key={`${debt.fromUserId}-${debt.toUserId}-${index}`}
                            className="bg-white rounded-xl p-4 mb-2"
                        >
                            <View className="flex-row items-center justify-between mb-3">
                                <View className="flex-1">
                                    <Text className="text-sm text-gray-500">
                                        {debt.fromUserName}
                                    </Text>
                                    <Text className="text-xs text-gray-400">
                                        {t('balances.owes')} {debt.toUserName}
                                    </Text>
                                </View>
                                <Text className="text-base font-bold text-red-500">
                                    {debt.currency} {debt.amount.toFixed(2)}
                                </Text>
                            </View>
                            <Button
                                title={t('groups.settleUp')}
                                onPress={() => handleSettleUp(debt)}
                                variant="secondary"
                            />
                        </View>
                    ))
                ) : (
                    <View className="bg-green-50 rounded-xl p-6 items-center">
                        <Text className="text-2xl mb-2">✅</Text>
                        <Text className="text-base font-medium text-green-700">
                            {t('balances.allSettled')}
                        </Text>
                        <Text className="text-sm text-green-600 mt-1">
                            {t('balances.noDebts')}
                        </Text>
                    </View>
                )}
            </View>

            {/* Settlement History Link */}
            <View className="px-4 mb-8">
                <Button
                    title={t('balances.settlementHistory')}
                    onPress={handleViewHistory}
                    variant="outline"
                />
            </View>
        </ScrollView>
    );
}
