/**
 * ExpenseListScreen
 * List of expenses for a group
 * Uses NativeWind styling only, full i18n support
 */

import React, { useCallback, useState, useMemo } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Expense } from '@cost-share/shared';
import { useGroupExpensesQuery } from '../../hooks/queries/useGroupExpensesQuery';
import { queryClient } from '../../lib/queryClient';
import { queryKeys } from '../../hooks/queries/keys';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { ExpenseCard } from '../../components/ExpenseCard';
import { colors } from '../../theme';

export function ExpenseListScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const expensesQuery = useGroupExpensesQuery(groupId);
    const [refreshing, setRefreshing] = useState(false);

    const expenses = useMemo(
        () =>
            (expensesQuery.data ?? [])
                .filter((e) => !e.isDeleted)
                .sort(
                    (a, b) =>
                        new Date(b.expenseDate).getTime() -
                        new Date(a.expenseDate).getTime(),
                ),
        [expensesQuery.data],
    );

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(groupId) });
        setRefreshing(false);
    }, [groupId]);

    const handleExpensePress = useCallback(
        (expenseId: string) => {
            navigation.navigate('ExpenseDetail', { expenseId, groupId });
        },
        [navigation, groupId],
    );

    const renderExpense = ({ item }: { item: Expense }) => (
        <ExpenseCard expense={item} onPress={handleExpensePress} />
    );

    if (expensesQuery.isLoading && expenses.length === 0) {
        return <LoadingIndicator />;
    }

    return (
        <View className="flex-1 bg-slate-50">
            <FlatList
                data={expenses}
                keyExtractor={(item) => item.id}
                renderItem={renderExpense}
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
                        iconName="cash-outline"
                        title={t('expenses.noExpenses')}
                        message={t('expenses.noExpensesMessage')}
                    />
                }
            />
        </View>
    );
}
