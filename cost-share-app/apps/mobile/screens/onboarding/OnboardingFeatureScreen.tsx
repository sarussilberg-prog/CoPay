import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
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
import { OnboardingLanguageToggle } from '../../components/onboarding/OnboardingLanguageToggle';
import { onboardingColors } from '../../theme/onboardingColors';
import type { OnboardingHeroVariant } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const TOP_BAR_HEIGHT = 40;
const BOTTOM_CARD_HEIGHT = 220;
const MOCKUP_NATURAL_HEIGHT = 520;
const MOCKUP_NATURAL_WIDTH = 320;

type Props = {
    stepIndex: number;
    eyebrowKey: string;
    titleKey: string;
    mockupHighlight: OnboardingMockupHighlight;
    mockupHero: OnboardingHeroVariant;
    balanceLabelKey?: string;
    balanceAmountKey?: string;
    onSkip: () => void;
    onBack: () => void;
    onNext: () => void;
};

export function OnboardingFeatureScreen({
    stepIndex,
    eyebrowKey,
    titleKey,
    mockupHighlight,
    mockupHero,
    balanceLabelKey,
    balanceAmountKey,
    onSkip,
    onBack,
    onNext,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const insets = useSafeAreaInsets();
    const { width: screenW, height: screenH } = Dimensions.get('window');

    const availableHeight =
        screenH - insets.top - TOP_BAR_HEIGHT - BOTTOM_CARD_HEIGHT;
    const mockupScale = Math.min(
        availableHeight / MOCKUP_NATURAL_HEIGHT,
        screenW / MOCKUP_NATURAL_WIDTH,
    );

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" />

            <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
                <OnboardingLanguageToggle
                    variant="onLight"
                    testID="onboarding-feature-language-button"
                />
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
                <View style={{ transform: [{ scale: mockupScale }] }}>
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

                <View style={styles.footer}>
                    <TouchableOpacity
                        onPress={onBack}
                        activeOpacity={0.7}
                        style={styles.backBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.back')}
                        testID="onboarding-feature-back"
                    >
                        <AppIcon
                            name={isRtl ? 'chevron-forward' : 'chevron-back'}
                            size={22}
                            color={onboardingColors.muted}
                        />
                    </TouchableOpacity>
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
    mockupArea: {
        flex: 1,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
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
    backBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: onboardingColors.hairline,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
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
