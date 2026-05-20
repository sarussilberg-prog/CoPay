/**
 * SplitTypeSelector Component
 * Toggle between equal and unequal split types
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

type SplitType = 'equal' | 'unequal';

interface SplitTypeSelectorProps {
    value: SplitType;
    onChange: (type: SplitType) => void;
    label?: string;
}

export function SplitTypeSelector({ value, onChange, label }: SplitTypeSelectorProps) {
    const { t } = useTranslation();

    return (
        <View className="mb-4">
            {label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                </Text>
            )}
            <View className="flex-row bg-gray-100 rounded-xl p-1">
                <TouchableOpacity
                    onPress={() => onChange('equal')}
                    activeOpacity={0.7}
                    className={`flex-1 py-3 rounded-lg ${value === 'equal' ? 'bg-white shadow-sm' : ''
                        }`}
                >
                    <Text
                        className={`text-center text-sm font-medium ${value === 'equal' ? 'text-primary-dark' : 'text-gray-500'
                            }`}
                    >
                        {t('expenses.equalSplit')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onChange('unequal')}
                    activeOpacity={0.7}
                    className={`flex-1 py-3 rounded-lg ${value === 'unequal' ? 'bg-white shadow-sm' : ''
                        }`}
                >
                    <Text
                        className={`text-center text-sm font-medium ${value === 'unequal' ? 'text-primary-dark' : 'text-gray-500'
                            }`}
                    >
                        {t('expenses.unequalSplit')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
