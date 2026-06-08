/**
 * GroupAvatar
 * Shows a group image or a type-based icon fallback
 */

import React from 'react';
import { View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GroupType } from '@cost-share/shared';
import { getGroupTypeVisual } from '../lib/groupTypeVisuals';
import { AppIcon } from './AppIcon';
import { useLocalAvatar } from '../hooks/useLocalAvatar';

interface GroupAvatarProps {
    imageUrl?: string | null;
    groupType?: GroupType;
    size?: 'sm' | 'md' | 'lg';
    testID?: string;
}

const sizeStyles = {
    sm: { className: 'w-12 h-12 rounded-xl', iconSize: 22 },
    md: { className: 'w-16 h-16 rounded-2xl', iconSize: 28 },
    lg: { className: 'w-24 h-24 rounded-2xl', iconSize: 40 },
} as const;

export function GroupAvatar({
    imageUrl,
    groupType = 'general',
    size = 'sm',
    testID = 'group-avatar',
}: GroupAvatarProps) {
    const { className, iconSize } = sizeStyles[size];
    const visual = getGroupTypeVisual(groupType);
    // Use the disk-cached local URI when one is available so group images
    // render instantly + work offline.
    const resolvedImageUrl = useLocalAvatar(imageUrl);

    if (resolvedImageUrl) {
        return (
            <View className={`${className} overflow-hidden`} testID={testID}>
                <Image
                    source={{ uri: resolvedImageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                    testID={`${testID}-image`}
                />
            </View>
        );
    }

    return (
        <View className={`${className} overflow-hidden`} testID={testID}>
            <LinearGradient
                colors={visual.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <AppIcon
                    name={visual.icon}
                    size={iconSize}
                    color="#FFFFFF"
                    testID={`${testID}-icon`}
                />
            </LinearGradient>
        </View>
    );
}
