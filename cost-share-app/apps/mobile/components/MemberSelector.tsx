/**
 * MemberSelector Component
 * Multi-select for group members
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { User } from '@cost-share/shared';
import { MemberAvatar } from './MemberAvatar';
import { getAvatarUrl, getDisplayName } from '../lib/userDisplay';

interface MemberSelectorProps {
    members: User[];
    selectedIds: string[];
    onToggle: (userId: string) => void;
    label?: string;
    /** Visual variant. 'list' (default) = vertical rows; 'pills' = horizontal scrolling chips (matches PayerPicker). */
    variant?: 'list' | 'pills';
}

export function MemberSelector({
    members,
    selectedIds,
    onToggle,
    label,
    variant = 'list',
}: MemberSelectorProps) {
    const { t } = useTranslation();

    if (variant === 'pills') {
        return (
            <View className="mb-4">
                {label && (
                    <Text className="text-sm font-medium text-gray-700 mb-2">
                        {label}
                    </Text>
                )}
                {members.length === 0 ? (
                    <Text className="text-sm text-gray-400 text-center py-4">
                        {t('groups.noMembers')}
                    </Text>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View className="flex-row" style={{ gap: 8 }}>
                            {members.map((member) => {
                                const isSelected = selectedIds.includes(member.id);
                                return (
                                    <TouchableOpacity
                                        key={member.id}
                                        onPress={() => onToggle(member.id)}
                                        activeOpacity={0.7}
                                        className={`flex-row items-center px-3 py-2 rounded-xl ${
                                            isSelected
                                                ? 'bg-primary-extra-light border border-primary'
                                                : 'bg-gray-50 border border-gray-200'
                                        }`}
                                    >
                                        <MemberAvatar
                                            name={getDisplayName(member, t)}
                                            avatarUrl={getAvatarUrl(member) ?? undefined}
                                            size="xs"
                                        />
                                        <Text
                                            className={`ml-2 text-sm font-medium ${
                                                isSelected ? 'text-primary-dark' : 'text-gray-600'
                                            }`}
                                        >
                                            {getDisplayName(member, t)}
                                        </Text>
                                        {isSelected && (
                                            <Text className="text-primary text-sm ml-1">✓</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}
            </View>
        );
    }

    const renderMember = ({ item }: { item: User }) => {
        const isSelected = selectedIds.includes(item.id);

        return (
            <TouchableOpacity
                onPress={() => onToggle(item.id)}
                activeOpacity={0.7}
                className={`flex-row items-center p-3 rounded-xl mb-2 ${isSelected
                        ? 'bg-primary-extra-light border border-primary'
                        : 'bg-white border border-gray-200'
                    }`}
            >
                <MemberAvatar name={getDisplayName(item, t)} avatarUrl={getAvatarUrl(item) ?? undefined} size="sm" />
                <Text className={`flex-1 ml-3 text-base ${isSelected ? 'font-semibold text-primary-dark' : 'text-gray-700'
                    }`}>
                    {getDisplayName(item, t)}
                </Text>
                {isSelected && (
                    <Text className="text-primary text-lg">✓</Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View className="mb-4">
            {label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                </Text>
            )}
            <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                renderItem={renderMember}
                scrollEnabled={false}
                ListEmptyComponent={
                    <Text className="text-sm text-gray-400 text-center py-4">
                        {t('groups.noMembers')}
                    </Text>
                }
            />
        </View>
    );
}
