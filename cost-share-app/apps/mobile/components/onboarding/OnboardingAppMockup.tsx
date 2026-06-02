import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { onboardingColors } from '../../theme/onboardingColors';
import { OnboardingHeroImage } from './OnboardingHeroImage';
import type { OnboardingHeroVariant } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

export type OnboardingMockupHighlight = 'list' | 'balance' | 'invite';

type ListRowTone = 'neutral' | 'positive' | 'negative' | 'partial';

type ListRow = {
    title: string;
    sub: string;
    tone: ListRowTone;
    partialIn?: number;
    partialTotal?: number;
};

type Props = {
    highlight: OnboardingMockupHighlight;
    hero: OnboardingHeroVariant;
    balanceLabelKey?: string;
    balanceAmountKey?: string;
};

const MOCK_WIDTH = 320;
const MOCK_HEIGHT = 520;

export function OnboardingAppMockup({
    highlight,
    hero,
    balanceLabelKey,
    balanceAmountKey,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    const listRows: ListRow[] =
        highlight === 'list'
            ? [
                  {
                      title: t('onboarding.mockup.expense2Title'),
                      sub: t('onboarding.mockup.expense2Sub'),
                      tone: 'partial',
                      partialIn: 3,
                      partialTotal: 5,
                  },
                  {
                      title: t('onboarding.mockup.expense1Title'),
                      sub: t('onboarding.mockup.expense1Sub'),
                      tone: 'neutral',
                  },
                  {
                      title: t('onboarding.mockup.expense3Title'),
                      sub: t('onboarding.mockup.expense3Sub'),
                      tone: 'neutral',
                  },
              ]
            : highlight === 'invite'
              ? [
                    {
                        title: t('onboarding.mockup.invite1Title'),
                        sub: t('onboarding.mockup.invite1Sub'),
                        tone: 'positive' as const,
                    },
                    {
                        title: t('onboarding.mockup.invite2Title'),
                        sub: t('onboarding.mockup.invite2Sub'),
                        tone: 'neutral' as const,
                    },
                    {
                        title: t('onboarding.mockup.invite3Title'),
                        sub: t('onboarding.mockup.invite3Sub'),
                        tone: 'neutral' as const,
                    },
                ]
              : [
                    {
                        title: t('onboarding.mockup.debt1Title'),
                        sub: t('onboarding.mockup.debt1Sub'),
                        tone: 'positive' as const,
                    },
                    {
                        title: t('onboarding.mockup.debt2Title'),
                        sub: t('onboarding.mockup.debt2Sub'),
                        tone: 'negative' as const,
                    },
                ];

    return (
        <View style={styles.phone}>
            <OnboardingHeroImage variant={hero} height={120}>
                <View style={styles.heroOverlay}>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-white text-lg font-extrabold')}
                    >
                        {t('onboarding.mockup.groupName')}
                    </Text>
                </View>
            </OnboardingHeroImage>

            {highlight === 'balance' && (
                <View style={styles.balanceCard}>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-xs')}
                        style={{ color: onboardingColors.muted }}
                    >
                        {balanceLabelKey
                            ? t(balanceLabelKey)
                            : t('onboarding.mockup.balanceDefaultLabel')}
                    </Text>
                    {balanceAmountKey ? (
                        <Text
                            className={rtlTextClassName(isRtl, 'text-2xl font-extrabold mt-1')}
                            style={{
                                color: onboardingColors.greenInk,
                                writingDirection: 'ltr',
                            }}
                        >
                            {t(balanceAmountKey)}
                        </Text>
                    ) : null}
                </View>
            )}

            <View style={styles.list}>
                {highlight === 'list' ? (
                    <View style={styles.partialCallout}>
                        <Text
                            className={rtlTextClassName(isRtl, 'text-[11px] font-bold')}
                            style={{ color: onboardingColors.blueDeep }}
                        >
                            {t('onboarding.mockup.partialSplitCallout')}
                        </Text>
                    </View>
                ) : null}
                {listRows.map((row) => (
                    <View
                        key={row.title}
                        style={[styles.row, row.tone === 'partial' && styles.rowPartial]}
                    >
                        <View
                            style={[
                                styles.rowDot,
                                row.tone === 'partial' && styles.rowDotPartial,
                            ]}
                        />
                        <View style={styles.rowText}>
                            <Text
                                className={rtlTextClassName(isRtl, 'text-sm font-bold')}
                                style={{ color: onboardingColors.ink }}
                            >
                                {row.title}
                            </Text>
                            <Text
                                className={rtlTextClassName(isRtl, 'text-xs mt-0.5')}
                                style={{
                                    color:
                                        row.tone === 'positive'
                                            ? onboardingColors.greenInk
                                            : onboardingColors.muted,
                                    fontWeight: row.tone === 'positive' ? '700' : '400',
                                }}
                            >
                                {row.sub}
                            </Text>
                            {row.tone === 'partial' &&
                            row.partialIn != null &&
                            row.partialTotal != null ? (
                                <View style={styles.partialMeta}>
                                    <View style={styles.partialPills}>
                                        {Array.from({ length: row.partialTotal }, (_, i) => (
                                            <View
                                                key={i}
                                                style={[
                                                    styles.partialPill,
                                                    i < row.partialIn!
                                                        ? styles.partialPillOn
                                                        : styles.partialPillOff,
                                                ]}
                                            />
                                        ))}
                                    </View>
                                    <Text
                                        className={rtlTextClassName(isRtl, 'text-[10px] font-bold')}
                                        style={{ color: onboardingColors.blueDeep }}
                                    >
                                        {t('onboarding.mockup.partialSplitBadge', {
                                            count: row.partialIn,
                                            total: row.partialTotal,
                                        })}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    phone: {
        width: MOCK_WIDTH,
        height: MOCK_HEIGHT,
        borderRadius: 28,
        backgroundColor: onboardingColors.white,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: onboardingColors.hairline,
    },
    heroOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.15)',
    },
    balanceCard: {
        marginHorizontal: 16,
        marginTop: -24,
        padding: 14,
        borderRadius: 16,
        backgroundColor: onboardingColors.white,
        shadowColor: onboardingColors.navy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
    },
    list: {
        padding: 16,
        gap: 12,
    },
    partialCallout: {
        alignSelf: 'stretch',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: onboardingColors.blueSoft,
        borderWidth: 1,
        borderColor: 'rgba(74,134,232,0.25)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rowPartial: {
        padding: 10,
        marginHorizontal: -4,
        borderRadius: 14,
        backgroundColor: onboardingColors.blueSoft,
        borderWidth: 1,
        borderColor: 'rgba(74,134,232,0.2)',
    },
    rowDotPartial: {
        backgroundColor: onboardingColors.blue,
    },
    partialMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    partialPills: {
        flexDirection: 'row',
        gap: 4,
    },
    partialPill: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    partialPillOn: {
        backgroundColor: onboardingColors.blue,
    },
    partialPillOff: {
        backgroundColor: onboardingColors.hairline,
    },
    rowDot: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: onboardingColors.blueSoft,
    },
    rowText: {
        flex: 1,
    },
});
