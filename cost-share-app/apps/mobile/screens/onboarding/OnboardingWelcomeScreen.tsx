import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { onboardingMotion } from '../../theme/onboardingMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/AppText';
import { OnboardingHeroImage } from '../../components/onboarding/OnboardingHeroImage';
import { OnboardingFloatingCard } from '../../components/onboarding/OnboardingFloatingCard';
import { onboardingColors } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const { height: SCREEN_H } = Dimensions.get('window');

type Props = {
    onStart: () => void;
    onExistingAccount: () => void;
};

export function OnboardingWelcomeScreen({ onStart, onExistingAccount }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const insets = useSafeAreaInsets();
    const heroHeight = SCREEN_H * 0.7;

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" />

            <View style={[styles.heroWrap, { height: heroHeight }]}>
                <OnboardingHeroImage variant="mountains" height={heroHeight} />
                <LinearGradient
                    colors={['rgba(10,20,40,0)', onboardingColors.navy]}
                    locations={[0.4, 1]}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            <OnboardingFloatingCard
                icon="receipt-outline"
                iconBg={onboardingColors.blueSoft}
                iconColor={onboardingColors.blue}
                title={t('onboarding.welcome.card1Title')}
                subtitle={t('onboarding.welcome.card1Subtitle')}
                style={{ top: insets.top + 56, end: 24 }}
                rotateDeg={-3}
                delayMs={60}
            />
            <OnboardingFloatingCard
                icon="swap-horizontal-outline"
                iconBg={onboardingColors.greenSoft}
                iconColor={onboardingColors.greenInk}
                title={t('onboarding.welcome.card2Title')}
                subtitle={t('onboarding.welcome.card2Subtitle')}
                subtitleColor={onboardingColors.greenInk}
                subtitleBold
                style={{ top: insets.top + 156, start: 28 }}
                rotateDeg={4}
                delayMs={120}
            />
            <OnboardingFloatingCard
                icon="people-outline"
                iconBg={onboardingColors.blueSoft}
                iconColor={onboardingColors.blue}
                title={t('onboarding.welcome.card3Title')}
                subtitle={t('onboarding.welcome.card3Subtitle')}
                style={{ top: insets.top + 276, end: 20 }}
                rotateDeg={-2}
                delayMs={180}
            />

            <Animated.View
                entering={onboardingMotion.fadeUp(220)}
                style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}
            >
                <Animated.View entering={onboardingMotion.fadeDown(280)}>
                    <Text style={styles.wordmark}>{t('onboarding.welcome.brand')}</Text>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-[17px] font-medium leading-snug mt-3.5')}
                        style={{ color: 'rgba(255,255,255,0.78)', maxWidth: 280 }}
                    >
                        {t('onboarding.welcome.tagline')}
                    </Text>
                </Animated.View>

                <View style={styles.ctas}>
                    <TouchableOpacity
                        onPress={onStart}
                        activeOpacity={0.85}
                        style={styles.primaryBtn}
                        accessibilityRole="button"
                        testID="onboarding-welcome-start"
                    >
                        <Text className="text-base font-bold text-white text-center">
                            {t('onboarding.welcome.start')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onExistingAccount}
                        activeOpacity={0.7}
                        style={styles.secondaryBtn}
                        accessibilityRole="button"
                        testID="onboarding-welcome-existing"
                    >
                        <Text
                            className="text-sm font-semibold text-center"
                            style={{ color: 'rgba(255,255,255,0.85)' }}
                        >
                            {t('onboarding.welcome.existingAccount')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: onboardingColors.navy,
    },
    heroWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    bottom: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 28,
        paddingTop: 24,
        zIndex: 3,
        gap: 20,
    },
    wordmark: {
        fontSize: 56,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -0.5,
        lineHeight: 56,
    },
    ctas: {
        gap: 10,
        marginTop: 8,
    },
    primaryBtn: {
        height: 54,
        borderRadius: 999,
        backgroundColor: onboardingColors.blue,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryBtn: {
        height: 48,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
