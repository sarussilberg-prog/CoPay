/**
 * ExpenseCard Component
 * Reusable expense list item card
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Expense } from '@cost-share/shared';

interface ExpenseCardProps {
    expense: Expense;
    payerName?: string;
    onPress?: (expenseId: string) => void;
}

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

export function ExpenseCard({ expense, payerName, onPress }: ExpenseCardProps) {
    const { t } = useTranslation();

    const formattedDate = new Date(expense.expenseDate).toLocaleDateString();
    const emoji = categoryEmoji[expense.category || 'other'] || '📦';

    return (
        <TouchableOpacity
            onPress={() => onPress?.(expense.id)}
            activeOpacity={onPress ? 0.7 : 1}
            className="bg-white rounded-xl p-4 mb-2 border border-gray-100"
        >
            <View className="flex-row items-center">
                {/* Category Icon */}
                <View className="w-10 h-10 rounded-lg bg-gray-50 justify-center items-center mr-3">
                    <Text className="text-lg">{emoji}</Text>
                </View>

                {/* Expense Info */}
                <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900">
                        {expense.description}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">
                        {payerName
                            ? `${t('expenses.paidBy')} ${payerName} • ${formattedDate}`
                            : formattedDate}
                    </Text>
                </View>

                {/* Amount */}
                <Text className="text-base font-semibold text-gray-900">
                    {expense.currency} {expense.amount.toFixed(2)}
                </Text>
            </View>
        </TouchableOpacity>
    );
}
