import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ONBOARDING_HERO_GRADIENTS,
    OnboardingHeroVariant,
} from '../../theme/onboardingColors';

type Props = {
    variant: OnboardingHeroVariant;
    height: number;
    children?: React.ReactNode;
    style?: ViewStyle;
};

export function OnboardingHeroImage({ variant, height, children, style }: Props) {
    const preset = ONBOARDING_HERO_GRADIENTS[variant];

    return (
        <View style={[{ height, overflow: 'hidden' }, style]}>
            <LinearGradient
                colors={preset.colors}
                locations={preset.locations}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {children}
        </View>
    );
}
