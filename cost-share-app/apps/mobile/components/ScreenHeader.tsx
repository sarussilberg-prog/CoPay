/**
 * ScreenHeader Component
 * Consistent screen header with title and optional right action
 * Uses NativeWind styling only
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { AppIcon, AppIconName } from './AppIcon';
import { colors } from '../theme';

interface ScreenHeaderProps {
    title: string;
    rightLabel?: string;
    rightIconName?: AppIconName;
    onRightPress?: () => void;
    subtitle?: string;
}

export function ScreenHeader({
    title,
    rightLabel,
    rightIconName = 'add',
    onRightPress,
    subtitle,
}: ScreenHeaderProps) {
    return (
        <View className="px-4 pt-2 pb-4">
            <View className="flex-row justify-between items-center">
                <View className="flex-1">
                    <Text className="text-2xl font-bold text-gray-900">
                        {title}
                    </Text>
                    {subtitle && (
                        <Text className="text-sm text-gray-500 mt-1">
                            {subtitle}
                        </Text>
                    )}
                </View>
                {rightLabel && onRightPress && (
                    <TouchableOpacity
                        onPress={onRightPress}
                        activeOpacity={0.7}
                        className="bg-primary rounded-xl px-4 py-2 flex-row items-center gap-1.5"
                    >
                        <AppIcon name={rightIconName} size={18} color={colors.white} />
                        <Text className="text-white font-semibold text-sm">
                            {rightLabel}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
