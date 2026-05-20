/**
 * SettlementHistoryScreen
 * List of past settlements in a group
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import { Settlement } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { fetchSettlements } from '../../services/settlements.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { MemberAvatar } from '../../components/MemberAvatar';
import { colors } from '../../theme';

export function SettlementHistoryScreen() {
    const { t } = useTranslation();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);

    const loadData = useCallback(async () => {
        startLoading();
        const settlementsData = await fetchSettlements(groupId);
        setSettlements(
            settlementsData.sort(
                (a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime()
            )
        );
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

    const renderSettlement = ({ item }: { item: Settlement }) => {
        const formattedDate = new Date(item.settlementDate).toLocaleDateString();

        return (
            <View className="bg-white rounded-xl p-4 mb-2">
                <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                        <MemberAvatar name={getUserName(item.fromUserId)} size="sm" />
                        <View className="mx-2">
                            <Text className="text-gray-400">→</Text>
                        </View>
                        <MemberAvatar name={getUserName(item.toUserId)} size="sm" />
                        <View className="ml-3 flex-1">
                            <Text className="text-sm font-medium text-gray-900">
                                {getUserName(item.fromUserId)} → {getUserName(item.toUserId)}
                            </Text>
                            <Text className="text-xs text-gray-400 mt-0.5">
                                {formattedDate}
                                {item.paymentMethod && ` • ${t(`balances.methods.${item.paymentMethod}`)}`}
                            </Text>
                        </View>
                    </View>
                    <Text className="text-base font-bold text-green-600">
                        {item.currency} {item.amount.toFixed(2)}
                    </Text>
                </View>
            </View>
        );
    };

    if (isLoading && settlements.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={settlements}
                keyExtractor={(item) => item.id}
                renderItem={renderSettlement}
                contentContainerClassName="p-4"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.primary}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        iconName="swap-horizontal-outline"
                        title={t('balances.noSettlements')}
                        message={t('balances.noSettlementsMessage')}
                    />
                }
            />
        </View>
    );
}
