import React from 'react';
import { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { APP_BRAND_TITLE } from '../theme/brand';

interface AppBrandTitleProps {
    className?: string;
    style?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    testID?: string;
}

/** Standalone "Kupa" wordmark — same color and weight everywhere in the app. */
export function AppBrandTitle({
    className,
    style,
    testID = 'app-brand-title',
}: AppBrandTitleProps) {
    return (
        <Text
            testID={testID}
            className={`text-3xl font-bold text-primary-dark text-center self-stretch ${className ?? ''}`}
            style={style}
        >
            {APP_BRAND_TITLE}
        </Text>
    );
}
