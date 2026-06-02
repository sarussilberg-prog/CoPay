import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import {
    OnboardingAppMockup,
    OnboardingMockupHighlight,
} from '../../components/onboarding/OnboardingAppMockup';
import { OnboardingPagerDots } from '../../components/onboarding/OnboardingPagerDots';
import { onboardingColors } from '../../theme/onboardingColors';
import type { OnboardingHeroVariant } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    stepIndex: number;
    eyebrowKey: string;
    titleKey: string;
    bodyKey: string;
    mockupHighlight: OnboardingMockupHighlight;
    mockupHero: OnboardingHeroVariant;
    balanceLabelKey?: string;
    balanceAmountKey?: string;
    onSkip: () => void;
    onNext: () => void;
};

export function OnboardingFeatureScreen({
    stepIndex,
    eyebrowKey,
    titleKey,
    bodyKey,
    mockupHighlight,
    mockupHero,
    balanceLabelKey,
    balanceAmountKey,
    onSkip,
    onNext,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" />

            <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
                <View style={styles.topBarSpacer} />
                <TouchableOpacity
                    onPress={onSkip}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    testID="onboarding-feature-skip"
                >
                    <Text
                        className={rtlTextClassName(isRtl, 'text-sm font-semibold')}
                        style={{ color: onboardingColors.muted }}
                    >
                        {t('onboarding.skip')}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.mockupArea}>
                <View style={styles.mockupScale}>
                    <OnboardingAppMockup
                        highlight={mockupHighlight}
                        hero={mockupHero}
                        balanceLabelKey={balanceLabelKey}
                        balanceAmountKey={balanceAmountKey}
                    />
                </View>
            </View>

            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                <Text
                    className={rtlTextClassName(isRtl, 'text-xs font-bold tracking-wider mb-2.5')}
                    style={{ color: onboardingColors.blue }}
                >
                    {t(eyebrowKey)}
                </Text>
                <Text
                    className={rtlTextClassName(isRtl, 'text-[26px] font-extrabold leading-tight mb-2.5')}
                    style={{ color: onboardingColors.ink, letterSpacing: -0.3 }}
                >
                    {t(titleKey)}
                </Text>
                <Text
                    className={rtlTextClassName(isRtl, 'text-[15px] leading-relaxed mb-5')}
                    style={{ color: onboardingColors.muted }}
                >
                    {t(bodyKey)}
                </Text>

                <View style={styles.footer}>
                    <OnboardingPagerDots count={4} activeIndex={stepIndex} />
                    <TouchableOpacity
                        onPress={onNext}
                        activeOpacity={0.88}
                        style={styles.nextBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.next')}
                        testID="onboarding-feature-next"
                    >
                        <AppIcon
                            name={isRtl ? 'chevron-back' : 'chevron-forward'}
                            size={22}
                            color={onboardingColors.white}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: onboardingColors.cream,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 22,
    },
    topBarSpacer: {
        width: 48,
    },
    mockupArea: {
        flex: 1,
        overflow: 'hidden',
        alignItems: 'center',
        paddingTop: 22,
    },
    mockupScale: {
        transform: [{ scale: 0.62 }, { translateY: -30 }],
    },
    sheet: {
        backgroundColor: onboardingColors.white,
        paddingHorizontal: 26,
        paddingTop: 24,
        borderTopStartRadius: 28,
        borderTopEndRadius: 28,
        shadowColor: onboardingColors.navy,
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 12,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    nextBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: onboardingColors.blue,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: onboardingColors.blue,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
});
