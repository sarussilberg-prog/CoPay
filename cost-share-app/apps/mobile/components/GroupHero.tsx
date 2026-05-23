/**
 * GroupHero — top ~1/3 of GroupDetailScreen.
 * Image background (cover) when group has imageUrl; gradient fallback otherwise.
 * Back chevron top-leading, settings gear top-trailing, group name centered.
 */

import React from 'react';
import {
    View,
    ImageBackground,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Group, CurrencyAmount } from '@cost-share/shared';
import { useRtlLayout } from '../hooks/useRtlLayout';
import { getGroupTypeVisual } from '../lib/groupTypeVisuals';
import { formatCurrencyAmount } from '../lib/currencyDisplay';
import { AppIcon } from './AppIcon';
import { Text } from './AppText';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.30);

interface GroupHeroStats {
    totalSpent: CurrencyAmount[];
    totalUnsettled: CurrencyAmount[];
}

interface GroupHeroProps {
    group: Group;
    memberCount: number;
    stats?: GroupHeroStats;
    onBack: () => void;
    onMenu: () => void;
    onShare?: () => void;
}

function formatPrimaryAmount(rows: CurrencyAmount[], defaultCurrency: string): string {
    const primary =
        rows.find(row => row.currency === defaultCurrency) ?? rows[0];
    if (!primary) return formatCurrencyAmount(0, defaultCurrency);
    return formatCurrencyAmount(primary.amount, primary.currency);
}

function HeroStatRow({
    label,
    value,
    testID,
}: {
    label: string;
    value: string;
    testID: string;
}) {
    return (
        <View
            className="flex-row items-center justify-between gap-3 py-0.5"
            testID={testID}
        >
            <Text
                className="text-[11px] font-medium text-white/85 shrink"
                numberOfLines={1}
                style={{
                    textShadowColor: 'rgba(0,0,0,0.45)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                }}
            >
                {label}
            </Text>
            <Text
                className="text-sm font-bold text-white shrink-0"
                style={{
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function HeroChrome({
    group,
    memberCount,
    stats,
    onBack,
    onMenu,
    onShare,
    topInset,
}: GroupHeroProps & { topInset: number }) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const spentValue = stats
        ? formatPrimaryAmount(stats.totalSpent, group.defaultCurrency)
        : formatCurrencyAmount(0, group.defaultCurrency);
    const unsettledValue =
        stats && stats.totalUnsettled.length > 0
            ? formatPrimaryAmount(stats.totalUnsettled, group.defaultCurrency)
            : t('groups.card.settled');
    return (
        <>
            <View pointerEvents="none" className="absolute inset-0 bg-black/30" />

            <View
                pointerEvents="none"
                className="absolute inset-0 items-center justify-center px-8"
            >
                <Text
                    className="text-3xl font-bold text-white text-center"
                    numberOfLines={2}
                    style={{
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                    }}
                >
                    {group.name}
                </Text>
                <View className="mt-2 px-3 py-1 rounded-full bg-black/35">
                    <Text
                        className="text-xs font-semibold text-white text-center"
                        numberOfLines={1}
                    >
                        {t('groups.memberCount', { count: memberCount })}
                    </Text>
                </View>
                {stats && (
                    <View
                        className="mt-3 self-stretch rounded-2xl bg-black/35 px-4 py-2.5"
                        testID="hero-group-stats"
                    >
                        <HeroStatRow
                            label={t('groups.hero.spentTogether')}
                            value={spentValue}
                            testID="hero-stat-spent"
                        />
                        <View className="h-px bg-white/25 my-1.5" />
                        <HeroStatRow
                            label={t('groups.hero.leftToSettle')}
                            value={unsettledValue}
                            testID="hero-stat-unsettled"
                        />
                    </View>
                )}
            </View>

            <View
                style={{
                    position: 'absolute',
                    top: topInset + 8,
                    left: 12,
                    right: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    zIndex: 20,
                    elevation: 20,
                }}
            >
                <TouchableOpacity
                    onPress={onBack}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                    testID="hero-back-btn"
                >
                    <AppIcon
                        name={isRtl ? 'chevron-forward' : 'chevron-back'}
                        size={22}
                        color="#fff"
                    />
                </TouchableOpacity>
                <View className="flex-row items-center gap-2">
                    {onShare && (
                        <TouchableOpacity
                            onPress={onShare}
                            accessibilityRole="button"
                            accessibilityLabel="Share invite link"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                            testID="hero-share-btn"
                        >
                            <AppIcon name="share-outline" size={20} color="#fff" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={onMenu}
                        accessibilityRole="button"
                        accessibilityLabel={t('groups.menu.title')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                        testID="hero-menu-btn"
                    >
                        <AppIcon name="ellipsis-vertical" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );
}

export function GroupHero({ group, memberCount, stats, onBack, onMenu, onShare }: GroupHeroProps) {
    const insets = useSafeAreaInsets();

    if (group.imageUrl) {
        return (
            <ImageBackground
                source={{ uri: group.imageUrl }}
                resizeMode="cover"
                style={{ width: '100%', height: HERO_HEIGHT }}
                testID="hero-image-bg"
            >
                <HeroChrome
                    group={group}
                    memberCount={memberCount}
                    stats={stats}
                    onBack={onBack}
                    onMenu={onMenu}
                    onShare={onShare}
                    topInset={insets.top}
                />
            </ImageBackground>
        );
    }

    const visual = getGroupTypeVisual(group.groupType);
    return (
        <LinearGradient
            colors={visual.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: '100%', height: HERO_HEIGHT }}
            testID="hero-gradient"
        >
            <View className="absolute inset-0 items-center justify-center">
                <AppIcon
                    name={visual.icon}
                    size={120}
                    color="rgba(255,255,255,0.25)"
                    testID="hero-type-icon"
                />
            </View>
            <HeroChrome
                group={group}
                memberCount={memberCount}
                stats={stats}
                onBack={onBack}
                onMenu={onMenu}
                onShare={onShare}
                topInset={insets.top}
            />
        </LinearGradient>
    );
}
