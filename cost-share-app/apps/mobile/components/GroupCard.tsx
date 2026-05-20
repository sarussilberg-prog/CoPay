/**
 * GroupCard — list row for a group on the GroupsListScreen.
 * Supports highlighted name (search), "incl. matched members" subtitle, and a BalanceChip.
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupBalance, GroupWithMembers } from '@cost-share/shared';
import { AppIcon } from './AppIcon';
import { GroupAvatar } from './GroupAvatar';
import { BalanceChip } from './BalanceChip';
import { HighlightedText } from './HighlightedText';
import { colors } from '../theme';

interface GroupCardProps {
    group: GroupWithMembers;
    balance?: GroupBalance;
    searchQuery?: string;
    matchedMemberNames?: string[];
    onPress: (groupId: string) => void;
}

export function GroupCard({
    group,
    balance,
    searchQuery,
    matchedMemberNames,
    onPress,
}: GroupCardProps) {
    const { t } = useTranslation();
    const memberCount = group.members?.length ?? 0;
    const hasMatches = Boolean(matchedMemberNames && matchedMemberNames.length > 0);

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

                <View className="flex-1 mr-2">
                    <HighlightedText
                        className="text-base font-semibold text-gray-900"
                        text={group.name}
                        query={searchQuery}
                        numberOfLines={1}
                    />
                    <Text className="text-xs text-gray-400 mt-1" numberOfLines={1}>
                        {t(`groups.types.${group.groupType}`)}
                        {memberCount > 0
                            ? ` · ${memberCount} ${t('groups.members')}`
                            : ''}
                    </Text>
                    {hasMatches && (
                        <Text
                            className="text-xs text-gray-500 mt-0.5"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {t('groups.card.matchedMembers', {
                                names: (matchedMemberNames ?? []).join(', '),
                            })}
                        </Text>
                    )}
                </View>

                <BalanceChip
                    balance={balance}
                    defaultCurrency={group.defaultCurrency}
                />

                <View className="ml-2">
                    <AppIcon
                        name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
                        size={20}
                        color={colors.gray300}
                    />
                </View>
            </View>
        </TouchableOpacity>
    );
}
