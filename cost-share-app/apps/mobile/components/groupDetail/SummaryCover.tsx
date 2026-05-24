/**
 * SummaryCover — top region of GroupSummaryCard.
 * Image OR type-gradient background, scrim, type chip, title block,
 * member stack, and the three top-bar buttons (back · share · menu)
 * overlaid on the cover.
 */

import React from 'react';
import { View, ImageBackground, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Group, GroupMemberLite } from '@cost-share/shared';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { MemberStack } from './MemberStack';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { getGroupTypeVisual } from '../../lib/groupTypeVisuals';

const COVER_BODY_HEIGHT = 150;
const BUTTON_TOP_OFFSET = 8;

interface SummaryCoverProps {
    group: Group;
    members: GroupMemberLite[];
    topInset: number;
    onBack: () => void;
    onShare: () => void;
    onMenu: () => void;
}

export function SummaryCover({
    group,
    members,
    topInset,
    onBack,
    onShare,
    onMenu,
}: SummaryCoverProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const visual = getGroupTypeVisual(group.groupType);
    const typeLabel = t(`groups.types.${group.groupType}`, {
        defaultValue: group.groupType,
    });
    const totalHeight = COVER_BODY_HEIGHT + topInset;

    const buttons = (
        <View
            style={{
                position: 'absolute',
                top: topInset + BUTTON_TOP_OFFSET,
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
                testID="appbar-back"
                style={styles.circleButton}
            >
                <AppIcon
                    name={isRtl ? 'chevron-forward' : 'chevron-back'}
                    size={22}
                    color="#fff"
                />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                    onPress={onShare}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="appbar-share"
                    style={styles.circleButton}
                >
                    <AppIcon name="share-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onMenu}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="appbar-menu"
                    style={styles.circleButton}
                >
                    <AppIcon name="ellipsis-vertical" size={20} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );

    const overlay = (
        <>
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                locations={[0.35, 1]}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.typeChip}>
                <AppIcon name={visual.icon} size={12} color="#fff" />
                <Text
                    className="text-[11px] font-semibold text-white"
                    style={{ textTransform: 'capitalize' }}
                >
                    {typeLabel}
                </Text>
            </View>

            <View style={styles.titleRow}>
                <View style={styles.titleColumn}>
                    <Text
                        numberOfLines={1}
                        className="text-[18px] font-bold text-white"
                        style={styles.titleShadow}
                    >
                        {group.name}
                    </Text>
                    <Text
                        numberOfLines={1}
                        className="text-[11px] text-white/90"
                        style={[styles.subtitleShadow, { marginTop: 2 }]}
                    >
                        {t('groups.memberCount', { count: members.length })}
                    </Text>
                </View>
                <MemberStack members={members} />
            </View>

            {buttons}
        </>
    );

    if (group.imageUrl) {
        return (
            <ImageBackground
                source={{ uri: group.imageUrl }}
                resizeMode="cover"
                style={[styles.cover, { height: totalHeight }]}
                testID="summary-cover-image"
            >
                {overlay}
            </ImageBackground>
        );
    }

    return (
        <LinearGradient
            colors={visual.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.cover, { height: totalHeight }]}
            testID="summary-cover-gradient"
        >
            <View
                style={[
                    styles.centeredIcon,
                    { paddingTop: topInset / 2 },
                ]}
            >
                <AppIcon
                    name={visual.icon}
                    size={72}
                    color="rgba(255,255,255,0.45)"
                />
            </View>
            {overlay}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    cover: { width: '100%' },
    centeredIcon: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeChip: {
        position: 'absolute',
        top: 10,
        // Note: 'left' here is fine — RTL handling is via the buttons row above
        // (which uses left/right + RTL-flipped row order). Keeping the chip in
        // the visual top-left even under RTL is consistent with the old hero.
        left: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: 'rgba(0,0,0,0.55)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    titleRow: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 10,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 10,
    },
    titleColumn: { flex: 1, minWidth: 0 },
    titleShadow: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    subtitleShadow: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    circleButton: {
        width: 40,
        height: 40,
        borderRadius: 9999,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
