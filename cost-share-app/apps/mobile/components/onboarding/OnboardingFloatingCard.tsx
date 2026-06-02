import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { onboardingMotion } from '../../theme/onboardingMotion';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../AppIcon';
import { onboardingColors } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    icon: AppIconName;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle: string;
    subtitleColor?: string;
    subtitleBold?: boolean;
    style: View['props']['style'];
    rotateDeg: number;
    delayMs: number;
};

export function OnboardingFloatingCard({
    icon,
    iconBg,
    iconColor,
    title,
    subtitle,
    subtitleColor = onboardingColors.muted,
    subtitleBold = false,
    style,
    rotateDeg,
    delayMs,
}: Props) {
    const isRtl = useRtlLayout();

    return (
        <Animated.View
            entering={onboardingMotion.fadeDown(delayMs)}
            style={[
                styles.card,
                style,
                { transform: [{ rotate: `${rotateDeg}deg` }] },
            ]}
        >
            <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                <AppIcon name={icon} size={16} color={iconColor} />
            </View>
            <View style={styles.textCol}>
                <Text
                    className={rtlTextClassName(isRtl, 'text-[11px] font-bold')}
                    style={{ color: onboardingColors.ink }}
                >
                    {title}
                </Text>
                <Text
                    className={rtlTextClassName(isRtl, 'text-[10px] mt-px')}
                    style={{
                        color: subtitleColor,
                        fontWeight: subtitleBold ? '700' : '400',
                    }}
                >
                    {subtitle}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        zIndex: 2,
        backgroundColor: onboardingColors.white,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
        elevation: 12,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textCol: {
        flexShrink: 1,
    },
});
