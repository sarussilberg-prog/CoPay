/**
 * ExpenseDetailScreen
 * Detailed view of a single expense with splits
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Expense, ExpenseSplit, User } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { getExpenseWithSplits, deleteExpense } from '../../services/expenses.service';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { MemberAvatar } from '../../components/MemberAvatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const categoryEmoji: Record<string, string> = {
    food: '🍕',
    transport: '🚗',
    accommodation: '🏨',
    utilities: '💡',
    entertainment: '🎬',
    shopping: '🛍️',
    healthcare: '💊',
    other: '📦',
};

export function ExpenseDetailScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { expenseId, groupId } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [expense, setExpense] = useState<Expense | null>(null);
    const [splits, setSplits] = useState<ExpenseSplit[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);

    useEffect(() => {
        const loadData = async () => {
            startLoading();
            const expenseData = await getExpenseWithSplits(expenseId);
            if (expenseData) {
                setExpense(expenseData.expense);
                setSplits(expenseData.splits);
            }
            stopLoading();
        };
        void loadData();
    }, [expenseId]);

    const getUserName = (userId: string): string => {
        return allUsers.find((u) => u.id === userId)?.name || t('common.unknown');
    };

    const handleEdit = useCallback(() => {
        navigation.navigate('EditExpense', { expenseId, groupId });
    }, [navigation, expenseId, groupId]);

    const handleDelete = useCallback(async () => {
        setShowDeleteDialog(false);
        const success = await deleteExpense(expenseId);
        if (success) {
            navigation.goBack();
        }
    }, [expenseId, navigation]);

    if (isLoading) {
        return <LoadingIndicator />;
    }

    if (!expense) {
        return (
            <EmptyState
                iconName="alert-circle-outline"
                title={t('common.error')}
                message={t('common.loadError')}
            />
        );
    }

    const formattedDate = new Date(expense.expenseDate).toLocaleDateString();
    const emoji = categoryEmoji[expense.category || 'other'] || '📦';

    return (
        <ScrollView className="flex-1 bg-slate-50">
            {/* Expense Header */}
            <View className="bg-white px-4 py-6 items-center mb-4">
                <Text className="text-4xl mb-3">{emoji}</Text>
                <Text className="text-2xl font-bold text-gray-900">
                    {expense.currency} {expense.amount.toFixed(2)}
                </Text>
                <Text className="text-lg text-gray-700 mt-1">
                    {expense.description}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">
                    {formattedDate}
                </Text>
                {expense.category && (
                    <View className="bg-primary-extra-light rounded-full px-3 py-1 mt-2">
                        <Text className="text-xs font-medium text-primary-dark">
                            {t(`expenses.categories.${expense.category}`)}
                        </Text>
                    </View>
                )}
            </View>

            {/* Paid By */}
            <View className="bg-white mx-4 rounded-xl p-4 mb-4">
                <Text className="text-sm font-medium text-gray-500 mb-2">
                    {t('expenses.paidBy')}
                </Text>
                <View className="flex-row items-center">
                    <MemberAvatar name={getUserName(expense.paidBy)} size="md" />
                    <Text className="text-base font-medium text-gray-900 ml-3">
                        {getUserName(expense.paidBy)}
                    </Text>
                </View>
            </View>

            {/* Splits */}
            <View className="bg-white mx-4 rounded-xl p-4 mb-4">
                <Text className="text-sm font-medium text-gray-500 mb-3">
                    {t('expenses.splitBetween')}
                </Text>
                {splits.map((split) => (
                    <View
                        key={split.id}
                        className="flex-row items-center justify-between py-2 border-b border-gray-50"
                    >
                        <View className="flex-row items-center">
                            <MemberAvatar name={getUserName(split.userId)} size="sm" />
                            <Text className="text-base text-gray-700 ml-3">
                                {getUserName(split.userId)}
                            </Text>
                        </View>
                        <Text className="text-base font-medium text-gray-900">
                            {expense.currency} {split.amount.toFixed(2)}
                        </Text>
                    </View>
                ))}
            </View>

            {/* Actions */}
            <View className="px-4 mb-8 gap-2">
                <Button
                    title={t('common.edit')}
                    onPress={handleEdit}
                    variant="outline"
                />
                <Button
                    title={t('common.delete')}
                    onPress={() => setShowDeleteDialog(true)}
                    variant="danger"
                />
            </View>

            {/* Delete Confirmation */}
            <ConfirmDialog
                visible={showDeleteDialog}
                title={t('expenses.deleteExpense')}
                message={t('expenses.deleteExpenseConfirm')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteDialog(false)}
                destructive
            />
        </ScrollView>
    );
}
