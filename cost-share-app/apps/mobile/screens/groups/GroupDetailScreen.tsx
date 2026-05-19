/**
 * GroupDetailScreen
 * Group detail with summary stats, recent expenses, and actions
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    Group,
    GroupMember,
    GroupSummary,
    UserBalance,
    Expense,
} from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import {
    getGroupById,
    getGroupMembers,
    getGroupSummary,
    getGroupBalances,
    deleteGroup,
} from '../../services/groups.service';
import { fetchExpenses } from '../../services/expenses.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { ExpenseCard } from '../../components/ExpenseCard';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { GroupAvatar } from '../../components/GroupAvatar';
import { colors } from '../../theme';

export function GroupDetailScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [group, setGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [summary, setSummary] = useState<GroupSummary | null>(null);
    const [balances, setBalances] = useState<UserBalance[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const allExpenses = useAppStore((state) => state.expenses);
    const expenses = useMemo(
        () => allExpenses.filter((e) => e.groupId === groupId && !e.isDeleted),
        [allExpenses, groupId]
    );

    const loadGroupData = useCallback(async () => {
        startLoading();
        const [groupData, membersData, summaryData, balancesData] = await Promise.all([
            getGroupById(groupId),
            getGroupMembers(groupId),
            getGroupSummary(groupId),
            getGroupBalances(groupId),
        ]);
        await fetchExpenses(groupId);

        if (groupData) setGroup(groupData);
        setMembers(membersData);
        if (summaryData) setSummary(summaryData);
        setBalances(balancesData);
        stopLoading();
    }, [groupId, startLoading, stopLoading]);

    useEffect(() => {
        void loadGroupData();
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadGroupData();
        setRefreshing(false);
    }, [loadGroupData]);

    const handleAddExpense = useCallback(() => {
        navigation.navigate('AddExpense', { groupId });
    }, [navigation, groupId]);

    const handleViewBalances = useCallback(() => {
        navigation.navigate('Balances', { groupId });
    }, [navigation, groupId]);

    const handleViewMembers = useCallback(() => {
        navigation.navigate('GroupMembers', { groupId });
    }, [navigation, groupId]);

    const handleEditGroup = useCallback(() => {
        navigation.navigate('EditGroup', { groupId });
    }, [navigation, groupId]);

    const handleDeleteGroup = useCallback(async () => {
        setShowDeleteDialog(false);
        const success = await deleteGroup(groupId);
        if (success) {
            navigation.goBack();
        }
    }, [groupId, navigation]);

    const handleExpensePress = useCallback(
        (expenseId: string) => {
            navigation.navigate('ExpenseDetail', { expenseId, groupId });
        },
        [navigation, groupId]
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

    const recentExpenses = expenses
        .sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime())
        .slice(0, 5);

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
            {/* Group Header */}
            <View className="bg-white px-4 py-5 mb-4">
                <View className="flex-row items-center">
                    <View className="mr-3">
                        <GroupAvatar
                            imageUrl={group.imageUrl}
                            groupType={group.groupType}
                            size="md"
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-2xl font-bold text-gray-900">{group.name}</Text>
                        {group.description && (
                            <Text className="text-sm text-gray-500 mt-1">{group.description}</Text>
                        )}
                    </View>
                </View>
            </View>

            {/* Stats */}
            <View className="flex-row px-4 mb-4 gap-3">
                <View className="flex-1 bg-white rounded-xl p-4 items-center">
                    <Text className="text-2xl font-bold text-primary">
                        {summary?.memberCount || members.length}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">{t('groups.members')}</Text>
                </View>
                <View className="flex-1 bg-white rounded-xl p-4 items-center">
                    <Text className="text-2xl font-bold text-primary">
                        {summary?.expenseCount || 0}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">{t('groups.expenses')}</Text>
                </View>
                <View className="flex-1 bg-white rounded-xl p-4 items-center">
                    <Text className="text-2xl font-bold text-primary">
                        {group.defaultCurrency} {(summary?.totalSpent || 0).toFixed(0)}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">{t('groups.totalSpent')}</Text>
                </View>
            </View>

            {/* Action Buttons */}
            <View className="px-4 mb-4 gap-2">
                <Button
                    title={t('expenses.addExpense')}
                    onPress={handleAddExpense}
                />
                <View className="flex-row gap-2">
                    <View className="flex-1">
                        <Button
                            title={t('groups.balances')}
                            onPress={handleViewBalances}
                            variant="secondary"
                        />
                    </View>
                    <View className="flex-1">
                        <Button
                            title={t('groups.members')}
                            onPress={handleViewMembers}
                            variant="outline"
                        />
                    </View>
                </View>
            </View>

            {/* Recent Expenses */}
            <View className="px-4 mb-4">
                <Text className="text-lg font-semibold text-gray-900 mb-3">
                    {t('expenses.recentExpenses')}
                </Text>
                {recentExpenses.length > 0 ? (
                    recentExpenses.map((expense) => (
                        <ExpenseCard
                            key={expense.id}
                            expense={expense}
                            onPress={handleExpensePress}
                        />
                    ))
                ) : (
                    <View className="bg-white rounded-xl p-6 items-center">
                        <Text className="text-gray-400">
                            {t('expenses.noExpenses')}
                        </Text>
                    </View>
                )}
            </View>

            {/* Group Actions */}
            <View className="px-4 mb-8 gap-2">
                <Button
                    title={t('common.edit')}
                    onPress={handleEditGroup}
                    variant="outline"
                />
                <Button
                    title={t('common.delete')}
                    onPress={() => setShowDeleteDialog(true)}
                    variant="danger"
                />
            </View>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                visible={showDeleteDialog}
                title={t('groups.deleteGroup')}
                message={t('groups.deleteGroupConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={handleDeleteGroup}
                onCancel={() => setShowDeleteDialog(false)}
                destructive
            />
        </ScrollView>
    );
}
