import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    name: string;
    email?: string;
    avatarUrl?: string;
    onEditPress: () => void;
}

export function ProfileHeaderRow({ name, email, avatarUrl, onEditPress }: Props) {
    return (
        <View className="bg-white rounded-2xl mx-4 mt-4 mb-4 px-4 py-4 flex-row items-center border border-gray-100">
            <MemberAvatar name={name} avatarUrl={avatarUrl} size="md" />
            <View className="flex-1 ms-3">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>{name}</Text>
                {email ? <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{email}</Text> : null}
            </View>
            <TouchableOpacity
                onPress={onEditPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="profile-header-edit"
                accessibilityLabel="Edit profile"
                className="w-11 h-11 items-center justify-center rounded-full"
            >
                <AppIcon name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
        </View>
    );
}
