/**
 * FeedRowThumbnail — 44×44 thumbnail for activity feed rows.
 * Displays an image or icon with optional background tint.
 */

import React from 'react';
import { View, Image } from 'react-native';
import { AppIcon, AppIconName } from './AppIcon';
import { colors } from '../theme';

interface FeedRowThumbnailProps {
    imageUrl?: string;
    iconName?: AppIconName;
    iconColor?: string;
    iconBgColor?: string;
    testID?: string;
}

export function FeedRowThumbnail({
    imageUrl,
    iconName,
    iconColor = colors.primaryDark,
    iconBgColor = colors.primaryExtraLight,
    testID,
}: FeedRowThumbnailProps) {
    if (imageUrl) {
        return (
            <Image
                source={{ uri: imageUrl }}
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    // slate-100 / design "border.soft"; no matching theme token exists
                    borderColor: '#F1F5F9',
                }}
                resizeMode="cover"
                testID={testID ? `${testID}-image` : undefined}
            />
        );
    }
    return (
        <View
            style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: iconBgColor,
                alignItems: 'center',
                justifyContent: 'center',
            }}
            testID={testID ? `${testID}-icon` : undefined}
        >
            {iconName && <AppIcon name={iconName} size={22} color={iconColor} />}
        </View>
    );
}
