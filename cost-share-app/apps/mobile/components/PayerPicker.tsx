/**
 * PayerPicker Component
 * Horizontal pill selector for the user who paid an expense.
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { User } from '@cost-share/shared';
import { MemberAvatar } from './MemberAvatar';

interface PayerPickerProps {
    members: User[];
    value?: string;
    onChange: (userId: string) => void;
    label?: string;
}

export function PayerPicker({ members, value, onChange, label }: PayerPickerProps) {
    return (
        <View className="mb-4">
            {label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                </Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row" style={{ gap: 8 }}>
                    {members.map((member) => {
                        const isSelected = value === member.id;
                        return (
                            <TouchableOpacity
                                key={member.id}
                                onPress={() => onChange(member.id)}
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
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}
