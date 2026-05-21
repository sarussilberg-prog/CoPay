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
                                            name={member.name}
                                            avatarUrl={member.avatarUrl}
                                            size="xs"
                                        />
                                        <Text
                                            className={`ml-2 text-sm font-medium ${
                                                isSelected ? 'text-primary-dark' : 'text-gray-600'
                                            }`}
                                        >
                                            {member.name}
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
                <MemberAvatar name={item.name} avatarUrl={item.avatarUrl} size="sm" />
                <Text className={`flex-1 ml-3 text-base ${isSelected ? 'font-semibold text-primary-dark' : 'text-gray-700'
                    }`}>
                    {item.name}
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
