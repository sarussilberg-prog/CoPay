/**
 * LoadingIndicator Component
 * Reusable loading indicator with spinner and text
 * Shows centered loading state with consistent styling
 */

import { Text } from './AppText';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';

interface LoadingIndicatorProps {
    message?: string; // Optional custom message, defaults to t('common.loading')
}

/**
 * Displays a centered loading indicator with spinner and text
 * 
 * @param message - Optional custom loading message
 * 
 * @example
 * ```typescript
 * // Default usage
 * <LoadingIndicator />
 * 
 * // Custom message
 * <LoadingIndicator message={t('groups.loadingGroups')} />
 * ```
 */
export function LoadingIndicator({ message }: LoadingIndicatorProps) {
    const { t } = useTranslation();

    return (
        <View className="flex-1 justify-center items-center bg-gray-50">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="mt-4 text-gray-600 text-center w-full">
                {message || t('common.loading')}
            </Text>
        </View>
    );
}
