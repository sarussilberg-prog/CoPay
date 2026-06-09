import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { onboardingMotion } from '../../theme/onboardingMotion';
import { OnboardingWelcomeScreen } from './OnboardingWelcomeScreen';
import { OnboardingFeatureScreen } from './OnboardingFeatureScreen';
import { markPreLoginOnboardingComplete } from '../../lib/onboardingStorage';
import { useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    onFinished: () => void;
};

type Step = 'welcome' | 'feature1' | 'feature2' | 'feature3' | 'feature4';

const FEATURE_STEPS: Step[] = ['feature1', 'feature2', 'feature3', 'feature4'];

export function OnboardingPreAuthFlow({ onFinished }: Props) {
    const isRtl = useRtlLayout();
    const [step, setStep] = useState<Step>('welcome');
    const [isBack, setIsBack] = useState(false);
    const screenEnter = onboardingMotion.screenEnter(isRtl, isBack);
    const screenExit = onboardingMotion.screenExit(isRtl, isBack);

    const finishPre = useCallback(async () => {
        await markPreLoginOnboardingComplete();
        onFinished();
    }, [onFinished]);

    const goNext = useCallback(() => {
        let target: Step | null = null;
        if (step === 'welcome') {
            target = 'feature1';
        } else {
            const idx = FEATURE_STEPS.indexOf(step);
            if (idx >= 0 && idx < FEATURE_STEPS.length - 1) {
                target = FEATURE_STEPS[idx + 1];
            }
        }
        if (target === null) {
            void finishPre();
            return;
        }
        const next = target;
        setIsBack(false);
        requestAnimationFrame(() => setStep(next));
    }, [step, finishPre]);

    const goBack = useCallback(() => {
        const idx = FEATURE_STEPS.indexOf(step);
        const target: Step = idx <= 0 ? 'welcome' : FEATURE_STEPS[idx - 1];
        setIsBack(true);
        requestAnimationFrame(() => setStep(target));
    }, [step]);

    return (
        <View style={styles.root}>
            {step === 'welcome' && (
                <Animated.View
                    key="welcome"
                    entering={onboardingMotion.fade}
                    exiting={onboardingMotion.fadeOut}
                    style={styles.fill}
                >
                    <OnboardingWelcomeScreen
                        onStart={goNext}
                        onExistingAccount={() => void finishPre()}
                    />
                </Animated.View>
            )}

            {step === 'feature1' && (
                <Animated.View key="f1" entering={screenEnter} exiting={screenExit} style={styles.fill}>
                    <OnboardingFeatureScreen
                        stepIndex={0}
                        eyebrowKey="onboarding.feature1.eyebrow"
                        titleKey="onboarding.feature1.title"
                        mockupHighlight="list"
                        mockupHero="sea"
                        onSkip={() => void finishPre()}
                        onBack={goBack}
                        onNext={goNext}
                    />
                </Animated.View>
            )}

            {step === 'feature2' && (
                <Animated.View key="f2" entering={screenEnter} exiting={screenExit} style={styles.fill}>
                    <OnboardingFeatureScreen
                        stepIndex={1}
                        eyebrowKey="onboarding.feature2.eyebrow"
                        titleKey="onboarding.feature2.title"
                        mockupHighlight="invite"
                        mockupHero="mountains"
                        onSkip={() => void finishPre()}
                        onBack={goBack}
                        onNext={goNext}
                    />
                </Animated.View>
            )}

            {step === 'feature3' && (
                <Animated.View key="f3" entering={screenEnter} exiting={screenExit} style={styles.fill}>
                    <OnboardingFeatureScreen
                        stepIndex={2}
                        eyebrowKey="onboarding.feature3.eyebrow"
                        titleKey="onboarding.feature3.title"
                        mockupHighlight="balance"
                        mockupHero="forest"
                        balanceLabelKey="onboarding.feature3.balanceLabel"
                        balanceAmountKey="onboarding.feature3.balanceAmount"
                        onSkip={() => void finishPre()}
                        onBack={goBack}
                        onNext={goNext}
                    />
                </Animated.View>
            )}

            {step === 'feature4' && (
                <Animated.View key="f4" entering={screenEnter} exiting={screenExit} style={styles.fill}>
                    <OnboardingFeatureScreen
                        stepIndex={3}
                        eyebrowKey="onboarding.feature4.eyebrow"
                        titleKey="onboarding.feature4.title"
                        mockupHighlight="balance"
                        mockupHero="waves"
                        onSkip={() => void finishPre()}
                        onBack={goBack}
                        onNext={goNext}
                    />
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    fill: {
        ...StyleSheet.absoluteFillObject,
    },
});
