/**
 * GroupHero — top ~1/3 of GroupDetailScreen.
 * Image background (cover) when group has imageUrl; gradient fallback otherwise.
 * Back chevron top-leading, settings gear top-trailing, group name centered.
 */

import React from 'react';
import {
    View,
    Text,
    ImageBackground,
    TouchableOpacity,
    Dimensions,
    I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Group, GroupType } from '@cost-share/shared';
import { AppIcon } from './AppIcon';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.26);

const groupTypeGradient: Record<GroupType, [string, string]> = {
    trip: ['#60A5FA', '#3B82F6'],
    home: ['#34D399', '#10B981'],
    couple: ['#F472B6', '#EC4899'],
    general: ['#A78BFA', '#7C3AED'],
    other: ['#94A3B8', '#475569'],
};

const groupTypeEmoji: Record<GroupType, string> = {
    trip: '✈️',
    home: '🏠',
    couple: '💑',
    general: '👥',
    other: '📋',
};

interface GroupHeroProps {
    group: Group;
    memberCount: number;
    onBack: () => void;
    onSettings: () => void;
}

function HeroChrome({
    group,
    memberCount,
    onBack,
    onSettings,
    topInset,
}: GroupHeroProps & { topInset: number }) {
    const { t } = useTranslation();
    const isRtl = I18nManager.isRTL;
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
                <TouchableOpacity
                    onPress={onSettings}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                    testID="hero-settings-btn"
                >
                    <AppIcon name="settings-outline" size={20} color="#fff" />
                </TouchableOpacity>
            </View>
        </>
    );
}

export function GroupHero({ group, memberCount, onBack, onSettings }: GroupHeroProps) {
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
                    onBack={onBack}
                    onSettings={onSettings}
                    topInset={insets.top}
                />
            </ImageBackground>
        );
    }

    const colorsTuple = groupTypeGradient[group.groupType] ?? groupTypeGradient.general;
    return (
        <LinearGradient
            colors={colorsTuple}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: '100%', height: HERO_HEIGHT }}
            testID="hero-gradient"
        >
            <View className="absolute inset-0 items-center justify-center">
                <Text className="text-7xl opacity-30">
                    {groupTypeEmoji[group.groupType] ?? '👥'}
                </Text>
            </View>
            <HeroChrome
                group={group}
                memberCount={memberCount}
                onBack={onBack}
                onSettings={onSettings}
                topInset={insets.top}
            />
        </LinearGradient>
    );
}
