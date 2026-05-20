/**
 * GroupTypeSelector
 * Horizontally scrollable picker for group type
 */

import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupType, GROUP_TYPES } from '@cost-share/shared';
import { getGroupTypeVisual } from '../lib/groupTypeVisuals';
import { AppIcon } from './AppIcon';
import { Text } from './AppText';

interface GroupTypeSelectorProps {
    value: GroupType;
    onChange: (type: GroupType) => void;
}

export function GroupTypeSelector({ value, onChange }: GroupTypeSelectorProps) {
    const { t } = useTranslation();

    return (
        <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">
                {t('groups.groupType')}
            </Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
            >
            {GROUP_TYPES.map((typeKey) => {
                const selected = value === typeKey;
                const visual = getGroupTypeVisual(typeKey);
                return (
                    <TouchableOpacity
                        key={typeKey}
                        onPress={() => onChange(typeKey)}
                        activeOpacity={0.7}
                        className={`flex-row items-center gap-2 px-4 py-2.5 rounded-xl ${
                            selected
                                ? 'bg-primary-extra-light border border-primary'
                                : 'bg-white border border-gray-200'
                        }`}
                    >
                        <AppIcon
                            name={visual.icon}
                            size={18}
                            color={selected ? visual.gradient[1] : '#6B7280'}
                        />
                        <Text
                            className={`text-sm font-medium ${
                                selected ? 'text-primary-dark' : 'text-gray-600'
                            }`}
                        >
                            {t(`groups.types.${typeKey}`)}
                        </Text>
                    </TouchableOpacity>
                );
            })}
            </ScrollView>
        </View>
    );
}
