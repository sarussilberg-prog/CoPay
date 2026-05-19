/**
 * GroupCard Component
 * Reusable group list item card
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Group } from '@cost-share/shared';
import { AppIcon } from './AppIcon';
import { GroupAvatar } from './GroupAvatar';
import { colors } from '../theme';

interface GroupCardProps {
    group: Group;
    memberCount?: number;
    onPress: (groupId: string) => void;
}

export function GroupCard({ group, memberCount, onPress }: GroupCardProps) {
    const { t } = useTranslation();

    return (
        <TouchableOpacity
            onPress={() => onPress(group.id)}
            activeOpacity={0.7}
            className="bg-white rounded-2xl p-4 mb-3 border border-gray-100"
        >
            <View className="flex-row items-center">
                <View className="mr-3">
                    <GroupAvatar
                        imageUrl={group.imageUrl}
                        groupType={group.groupType}
                        size="sm"
                    />
                </View>

                {/* Group Info */}
                <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">
                        {group.name}
                    </Text>
                    {group.description && (
                        <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                            {group.description}
                        </Text>
                    )}
                    <View className="flex-row items-center mt-1">
                        <Text className="text-xs text-gray-400">
                            {t(`groups.types.${group.groupType}`)}
                        </Text>
                        {memberCount !== undefined && (
                            <Text className="text-xs text-gray-400 ml-2">
                                • {memberCount} {t('groups.members')}
                            </Text>
                        )}
                    </View>
                </View>

                <AppIcon
                    name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
                    size={20}
                    color={colors.gray300}
                />
            </View>
        </TouchableOpacity>
    );
}
