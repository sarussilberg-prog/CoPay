/**
 * Live cover preview for create/edit group — mirrors group detail hero styling.
 */

import React from 'react';
import { View, ImageBackground, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { GroupType } from '@cost-share/shared';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { getGroupTypeVisual } from '../../lib/groupTypeVisuals';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const COVER_HEIGHT = 152;

type Props = {
    name: string;
    groupType: GroupType;
    imageUrl?: string | null;
    localUri?: string | null;
    onPress: () => void;
    testID?: string;
};

export function CreateGroupCoverPreview({
    name,
    groupType,
    imageUrl,
    localUri,
    onPress,
    testID,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const visual = getGroupTypeVisual(groupType);
    const displayUri = localUri ?? imageUrl ?? null;
    const displayName = name.trim() || t('groups.createForm.coverNamePlaceholder');

    const body = (
        <>
            <LinearGradient
                colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)']}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.bottomRow}>
                <View style={styles.nameBlock}>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-2xl font-extrabold text-white')}
                        numberOfLines={2}
                        style={styles.nameShadow}
                    >
                        {displayName}
                    </Text>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-xs font-medium mt-1')}
                        style={{ color: 'rgba(255,255,255,0.85)' }}
                    >
                        {t(`groups.types.${groupType}`)}
                    </Text>
                </View>
                <View style={styles.cameraBadge}>
                    <AppIcon name="camera" size={18} color={colors.white} />
                </View>
            </View>
        </>
    );

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel={t('groups.tapToChangeImage')}
            testID={testID}
            style={styles.wrap}
        >
            {displayUri ? (
                <ImageBackground
                    source={{ uri: displayUri }}
                    style={styles.cover}
                    imageStyle={styles.coverImage}
                >
                    {body}
                </ImageBackground>
            ) : (
                <LinearGradient
                    colors={visual.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cover}
                >
                    {body}
                </LinearGradient>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
        elevation: 6,
    },
    cover: {
        height: COVER_HEIGHT,
        justifyContent: 'flex-end',
    },
    coverImage: {
        borderRadius: 20,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: 16,
        gap: 12,
    },
    nameBlock: {
        flex: 1,
    },
    nameShadow: {
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    cameraBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(15,23,42,0.35)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
