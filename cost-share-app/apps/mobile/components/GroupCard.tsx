/**
 * GroupCard — list row for a group on the GroupsListScreen.
 * Supports highlighted name (search), "incl. matched members" subtitle, and a BalanceChip.
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useRtlLayout, rtlRowStyle } from '../hooks/useRtlLayout';
import { useTranslation } from 'react-i18next';
import { GroupBalanceDisplay, GroupWithMembers } from '@cost-share/shared';
import { AppIcon } from './AppIcon';
import { GroupAvatar } from './GroupAvatar';
import { BalanceChip } from './BalanceChip';
import { HighlightedText } from './HighlightedText';
import { colors } from '../theme';

interface GroupCardProps {
    group: GroupWithMembers;
    balanceDisplay?: GroupBalanceDisplay;
    searchQuery?: string;
    matchedMemberNames?: string[];
    onPress: (groupId: string) => void;
}

export function GroupCard({
    group,
    balanceDisplay,
    searchQuery,
    matchedMemberNames,
    onPress,
}: GroupCardProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const memberCount = group.members?.length ?? 0;
    const hasMatches = Boolean(matchedMemberNames && matchedMemberNames.length > 0);
    const isArchived = group.isArchivedByMe || group.isAutoArchived;

    return (
        <TouchableOpacity
            onPress={() => onPress(group.id)}
            activeOpacity={0.7}
            className={
                isArchived
                    ? 'bg-slate-50 rounded-2xl p-4 mb-3 border border-dashed border-gray-300'
                    : 'bg-white rounded-2xl p-4 mb-3 border border-gray-100'
            }
        >
            <View style={[rtlRowStyle(isRtl), { alignItems: 'center' }]}>
                <View className="mr-3">
                    <GroupAvatar
                        imageUrl={group.imageUrl}
                        groupType={group.groupType}
                        size="sm"
                    />
                </View>

                <View className="flex-1 mr-2 self-stretch" style={{ minWidth: 0 }}>
                    <View style={[rtlRowStyle(isRtl), { alignItems: 'center' }]}>
                        <View style={{ flexShrink: 1, minWidth: 0 }}>
                            <HighlightedText
                                className={
                                    isArchived
                                        ? 'text-base font-semibold text-gray-600'
                                        : 'text-base font-semibold text-gray-900'
                                }
                                text={group.name}
                                query={searchQuery}
                                numberOfLines={1}
                            />
                        </View>
                        {isArchived && (
                            <View
                                className="px-2 py-1 rounded-md bg-gray-200"
                                style={{ marginStart: 'auto', marginEnd: 4 }}
                                testID="group-archived-badge"
                            >
                                <Text
                                    className="text-gray-600 font-medium"
                                    style={{ fontSize: 12, letterSpacing: 0.5 }}
                                >
                                    {t('groups.archive.badge')}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text
                        className={`text-xs mt-1 ${isArchived ? 'text-gray-500' : 'text-gray-400'}`}
                        numberOfLines={1}
                    >
                        {t(`groups.types.${group.groupType}`)}
                        {memberCount > 0
                            ? ` · ${t('groups.memberCount', { count: memberCount })}`
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
                    display={balanceDisplay}
                    defaultCurrency={group.defaultCurrency}
                />

                <View className="ml-2">
                    <AppIcon
                        name={isRtl ? 'chevron-back' : 'chevron-forward'}
                        size={20}
                        color={colors.gray300}
                    />
                </View>
            </View>
        </TouchableOpacity>
    );
}
