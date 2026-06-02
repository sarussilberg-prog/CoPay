import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const logoSource = require('../assets/logo.png');

interface AppLogoProps {
    size?: number;
    style?: StyleProp<ImageStyle>;
    testID?: string;
}

/** Kupay brand mark — use on auth and marketing surfaces. */
export function AppLogo({ size = 120, style, testID = 'app-logo' }: AppLogoProps) {
    return (
        <Image
            source={logoSource}
            style={[{ width: size, height: size }, style]}
            resizeMode="contain"
            accessibilityLabel="Kupay"
            testID={testID}
        />
    );
}
