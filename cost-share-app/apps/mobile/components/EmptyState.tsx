/**
 * EmptyState Component
 * Reusable empty state with icon, title, message, and optional action
 * Uses NativeWind styling only
 */

import { Text } from './AppText';
import React from 'react';
import { View } from 'react-native';
import { AppIcon, AppIconName } from './AppIcon';
import { Button } from './Button';
import { colors } from '../theme';

interface EmptyStateProps {
    iconName?: AppIconName;
    title: string;
    message?: string;
    actionTitle?: string;
    onAction?: () => void;
}

export function EmptyState({
    iconName,
    title,
    message,
    actionTitle,
    onAction,
}: EmptyStateProps) {
    return (
        <View className="flex-1 justify-center items-center px-8 py-12">
            {iconName && (
                <View className="mb-4">
                    <AppIcon
                        name={iconName}
                        size={56}
                        color={colors.gray300}
                        testID="empty-state-icon"
                    />
                </View>
            )}
            <Text className="text-xl font-semibold text-gray-800 text-center mb-2">
                {title}
            </Text>
            {message && (
                <Text className="text-base text-gray-500 text-center mb-6">
                    {message}
                </Text>
            )}
            {actionTitle && onAction && (
                <Button
                    title={actionTitle}
                    onPress={onAction}
                    fullWidth={false}
                />
            )}
        </View>
    );
}
