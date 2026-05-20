/**
 * CategoryPicker Component
 * Expense category selector
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExpenseCategory } from '@cost-share/shared';

interface CategoryPickerProps {
    value?: ExpenseCategory;
    onChange: (category: ExpenseCategory) => void;
    label?: string;
}

const categories: ExpenseCategory[] = [
    'food',
    'transport',
    'accommodation',
    'utilities',
    'entertainment',
    'shopping',
    'healthcare',
    'other',
];

const categoryTranslationKeys: Record<ExpenseCategory, string> = {
    food: 'expenses.categories.food',
    transport: 'expenses.categories.transport',
    accommodation: 'expenses.categories.accommodation',
    utilities: 'expenses.categories.utilities',
    entertainment: 'expenses.categories.entertainment',
    shopping: 'expenses.categories.shopping',
    healthcare: 'expenses.categories.healthcare',
    other: 'expenses.categories.other',
};

export function CategoryPicker({ value, onChange, label }: CategoryPickerProps) {
    const { t } = useTranslation();

    return (
        <View className="mb-4">
            {label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                </Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                    {categories.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            onPress={() => onChange(cat)}
                            activeOpacity={0.7}
                            className={`px-4 py-2 rounded-xl ${value === cat
                                    ? 'bg-primary-extra-light border border-primary'
                                    : 'bg-gray-50 border border-gray-200'
                                }`}
                        >
                            <Text
                                className={`text-sm font-medium ${value === cat ? 'text-primary-dark' : 'text-gray-600'
                                    }`}
                            >
                                {t(categoryTranslationKeys[cat])}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}
