import React from 'react';
import { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { APP_BRAND_TITLE } from '../theme/brand';
import { centeredTextStyle } from '../hooks/useRtlLayout';

interface AppBrandTitleProps {
    className?: string;
    style?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    testID?: string;
}

/** Standalone "KupaPay" wordmark — same color and weight everywhere in the app. */
export function AppBrandTitle({
    className,
    style,
    testID = 'app-brand-title',
}: AppBrandTitleProps) {
    return (
        <Text
            testID={testID}
            className={`text-3xl font-bold text-primary-dark text-center ${className ?? ''}`}
            style={[centeredTextStyle, style]}
        >
            {APP_BRAND_TITLE}
        </Text>
    );
}
