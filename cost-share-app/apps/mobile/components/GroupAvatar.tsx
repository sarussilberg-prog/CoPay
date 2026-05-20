/**
 * GroupAvatar
 * Shows a group image or a type-based emoji fallback
 */

import { Text } from './AppText';
import React from 'react';
import { View, Image } from 'react-native';
import { GroupType } from '@cost-share/shared';

const groupTypeEmoji: Record<string, string> = {
    trip: '✈️',
    home: '🏠',
    couple: '💑',
    general: '👥',
    other: '📋',
};

interface GroupAvatarProps {
    imageUrl?: string | null;
    groupType?: GroupType;
    size?: 'sm' | 'md' | 'lg';
    testID?: string;
}

const sizeClasses = {
    sm: 'w-12 h-12 rounded-xl',
    md: 'w-16 h-16 rounded-2xl',
    lg: 'w-24 h-24 rounded-2xl',
};

const emojiSizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
};

export function GroupAvatar({
    imageUrl,
    groupType = 'general',
    size = 'sm',
    testID = 'group-avatar',
}: GroupAvatarProps) {
    const containerClass = `${sizeClasses[size]} bg-primary-extra-light justify-center items-center overflow-hidden`;

    if (imageUrl) {
        return (
            <View className={containerClass} testID={testID}>
                <Image
                    source={{ uri: imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                    testID={`${testID}-image`}
                />
            </View>
        );
    }

    return (
        <View className={containerClass} testID={testID}>
            <Text className={emojiSizes[size]}>
                {groupTypeEmoji[groupType] || '👥'}
            </Text>
        </View>
    );
}
