/**
 * First-group onboarding hero — compact motivation + one unified progress bar.
 * The per-step checklist lives in the accordion below; this header only carries
 * overall progress and the next action, so "steps" are represented in one place.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { onboardingColors } from '../../theme/onboardingColors';
import { onboardingMotion } from '../../theme/onboardingMotion';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    hasName: boolean;
    hasImage: boolean;
    hasExtraMembers: boolean;
};

export function OnboardingCreateGroupHero({
    hasName,
    hasImage,
    hasExtraMembers,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    // The name is the only gate; image + members are optional polish that the
    // bar rewards but never blocks. "ready" === can open the group.
    const ready = hasName;
    const progress = Math.min(
        1,
        0.08 + (hasName ? 0.6 : 0) + (hasImage ? 0.16 : 0) + (hasExtraMembers ? 0.16 : 0),
    );
    const fillColor = ready ? '#34D399' : '#93C5FD';

    return (
        <Animated.View
            entering={onboardingMotion.fadeDown(0)}
            style={styles.wrap}
            testID="onboarding-create-group-hero"
        >
            <LinearGradient
                colors={[onboardingColors.navy, '#1E3A5F', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                <View style={styles.glowOrb} />

                <View style={styles.badge}>
                    <AppIcon
                        name={ready ? 'checkmark-circle' : 'flag-outline'}
                        size={12}
                        color={ready ? onboardingColors.greenInk : onboardingColors.blue}
                    />
                    <Text
                        className={rtlTextClassName(isRtl, 'text-[11px] font-bold ms-1.5')}
                        style={{
                            color: ready ? onboardingColors.greenInk : onboardingColors.blue,
                        }}
                    >
                        {t('onboarding.create.hero.eyebrow')}
                    </Text>
                </View>

                <Text
                    className={rtlTextClassName(isRtl, 'text-[20px] font-extrabold leading-tight')}
                    style={{ color: onboardingColors.white, letterSpacing: -0.3 }}
                >
                    {t(
                        ready
                            ? 'onboarding.create.hero.titleReady'
                            : 'onboarding.create.hero.titleTodo',
                    )}
                </Text>
                <Text
                    className={rtlTextClassName(isRtl, 'text-[13px] leading-relaxed mt-1.5')}
                    style={{ color: 'rgba(255,255,255,0.78)' }}
                >
                    {t(
                        ready
                            ? 'onboarding.create.hero.subtitleReady'
                            : 'onboarding.create.hero.subtitleTodo',
                    )}
                </Text>

                <View style={styles.track} testID="onboarding-create-group-hero-progress">
                    <View
                        style={[
                            styles.fill,
                            isRtl ? { right: 0 } : { left: 0 },
                            { width: `${progress * 100}%`, backgroundColor: fillColor },
                        ]}
                    />
                </View>
            </LinearGradient>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#0A1428',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 8,
    },
    card: {
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 18,
        overflow: 'hidden',
    },
    glowOrb: {
        position: 'absolute',
        width: 130,
        height: 130,
        borderRadius: 65,
        backgroundColor: 'rgba(74,134,232,0.25)',
        top: -50,
        end: -28,
    },
    badge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        marginBottom: 12,
    },
    track: {
        position: 'relative',
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.18)',
        overflow: 'hidden',
        marginTop: 16,
    },
    fill: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        borderRadius: 3,
    },
});
