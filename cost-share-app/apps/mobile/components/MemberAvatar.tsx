/**
 * MemberAvatar Component
 * User avatar with fallback initials
 * Uses NativeWind styling only
 */

import { Text } from './AppText';
import React from 'react';
import { View, Image } from 'react-native';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface MemberAvatarProps {
    name: string;
    avatarUrl?: string;
    size?: AvatarSize;
    testID?: string;
}

const sizeStyles: Record<AvatarSize, { imageSize: number; text: string }> = {
    xs: { imageSize: 32, text: 'text-[10px]' },
    sm: { imageSize: 36, text: 'text-xs' },
    md: { imageSize: 44, text: 'text-sm' },
    lg: { imageSize: 56, text: 'text-lg' },
};

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

export function MemberAvatar({
    name,
    avatarUrl,
    size = 'md',
    testID = 'member-avatar',
}: MemberAvatarProps) {
    const { imageSize, text } = sizeStyles[size];
    const frameStyle = {
        width: imageSize,
        height: imageSize,
        borderRadius: imageSize / 2,
    };

    if (avatarUrl) {
        return (
            <View style={frameStyle} className="overflow-hidden shrink-0 bg-slate-100" testID={testID}>
                <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: imageSize, height: imageSize }}
                    resizeMode="cover"
                    accessibilityLabel={name}
                    testID={`${testID}-image`}
                />
            </View>
        );
    }

    return (
        <View
            style={[frameStyle, { borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)' }]}
            className="shrink-0 bg-slate-100 justify-center items-center"
            testID={testID}
        >
            <Text
                className={`${text} font-semibold text-slate-600 text-center`}
                style={{ width: '100%', textAlign: 'center' }}
            >
                {getInitials(name)}
            </Text>
        </View>
    );
}
