/**
 * First-group onboarding hero — milestone, live checklist, quick wins.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../AppIcon';
import { onboardingColors } from '../../theme/onboardingColors';
import { onboardingMotion } from '../../theme/onboardingMotion';
import { centeredTextStyle, rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const QUICK_WIN_KEYS = [
    'onboarding.create.hero.win1',
    'onboarding.create.hero.win2',
    'onboarding.create.hero.win3',
] as const;

const QUICK_WIN_ICONS: AppIconName[] = [
    'receipt-outline',
    'options-outline',
    'people-outline',
];

type ChecklistKey =
    | 'onboarding.create.hero.checkName'
    | 'onboarding.create.hero.checkDefaults'
    | 'onboarding.create.hero.checkMembers';

type Props = {
    hasName: boolean;
    hasExtraMembers: boolean;
};

function ChecklistRow({
    labelKey,
    done,
    optional,
}: {
    labelKey: ChecklistKey;
    done: boolean;
    optional?: boolean;
}) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <View className="flex-row items-center gap-2.5">
            <View
                style={[
                    styles.checkCircle,
                    done ? styles.checkDone : styles.checkPending,
                ]}
            >
                {done ? (
                    <AppIcon name="checkmark" size={14} color={onboardingColors.white} />
                ) : (
                    <View style={styles.checkDot} />
                )}
            </View>
            <Text
                className={rtlTextClassName(isRtl, 'text-sm flex-1')}
                style={{
                    color: done ? onboardingColors.ink : onboardingColors.muted,
                    fontWeight: done ? '600' : '400',
                }}
            >
                {t(labelKey)}
            </Text>
            {optional && !done ? (
                <Text
                    className={rtlTextClassName(isRtl, 'text-[11px] font-semibold')}
                    style={{ color: onboardingColors.muted }}
                >
                    {t('onboarding.create.hero.optional')}
                </Text>
            ) : null}
        </View>
    );
}

export function OnboardingCreateGroupHero({ hasName, hasExtraMembers }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

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
                style={styles.gradient}
            >
                <View style={styles.glowOrb} />
                <View style={styles.glowOrb2} />

                <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                        <AppIcon name="flag-outline" size={12} color={onboardingColors.blue} />
                        <Text
                            className={rtlTextClassName(
                                isRtl,
                                'text-[11px] font-bold ms-1.5',
                            )}
                            style={{ color: onboardingColors.blue }}
                        >
                            {t('onboarding.create.hero.eyebrow')}
                        </Text>
                    </View>
                </View>

                <Text
                    className={rtlTextClassName(isRtl, 'text-[22px] font-extrabold leading-tight')}
                    style={{ color: onboardingColors.white, letterSpacing: -0.3 }}
                >
                    {t('onboarding.create.hero.title')}
                </Text>
                <Text
                    className={rtlTextClassName(isRtl, 'text-sm leading-relaxed mt-2')}
                    style={{ color: 'rgba(255,255,255,0.78)' }}
                >
                    {t('onboarding.create.hero.subtitle')}
                </Text>
            </LinearGradient>

            <View style={styles.body}>
                <View style={styles.checklist}>
                    <ChecklistRow
                        labelKey="onboarding.create.hero.checkName"
                        done={hasName}
                    />
                    <ChecklistRow
                        labelKey="onboarding.create.hero.checkDefaults"
                        done={hasName}
                    />
                    <ChecklistRow
                        labelKey="onboarding.create.hero.checkMembers"
                        done={hasExtraMembers}
                        optional
                    />
                </View>

                <View style={styles.winsRow}>
                    {QUICK_WIN_KEYS.map((key, index) => (
                        <Animated.View
                            key={key}
                            entering={FadeInDown.delay(80 + index * 50)
                                .duration(280)
                                .springify()
                                .damping(18)}
                            style={styles.winCard}
                        >
                            <View
                                style={[
                                    styles.winIcon,
                                    {
                                        backgroundColor:
                                            index === 1
                                                ? onboardingColors.greenSoft
                                                : onboardingColors.blueSoft,
                                    },
                                ]}
                            >
                                <AppIcon
                                    name={QUICK_WIN_ICONS[index]}
                                    size={16}
                                    color={
                                        index === 1
                                            ? onboardingColors.greenInk
                                            : onboardingColors.blue
                                    }
                                />
                            </View>
                            <Text
                                className="text-[11px] font-semibold leading-snug mt-2"
                                style={[centeredTextStyle, { color: onboardingColors.ink2 }]}
                            >
                                {t(key)}
                            </Text>
                        </Animated.View>
                    ))}
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: onboardingColors.white,
        borderWidth: 1,
        borderColor: onboardingColors.hairline,
        shadowColor: '#0A1428',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
    },
    gradient: {
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 20,
        overflow: 'hidden',
    },
    glowOrb: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(74,134,232,0.25)',
        top: -40,
        end: -24,
    },
    glowOrb2: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(16,185,129,0.15)',
        bottom: -20,
        start: 12,
    },
    badgeRow: {
        marginBottom: 10,
    },
    badge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    body: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 16,
    },
    checklist: {
        gap: 10,
        marginBottom: 14,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: onboardingColors.hairline,
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkDone: {
        backgroundColor: onboardingColors.greenInk,
    },
    checkPending: {
        backgroundColor: onboardingColors.hairline,
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
    },
    checkDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#94A3B8',
    },
    winsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    winCard: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: onboardingColors.cream,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 6,
    },
    winIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
