/**
 * Onboarding guidance — sits above the shared create-group form.
 */

import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const TIP_KEYS = [
    'groups.createForm.guidance.tip1',
    'groups.createForm.guidance.tip2',
    'groups.createForm.guidance.tip3',
] as const;

export function CreateGroupGuidancePanel() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <Animated.View
            entering={FadeInDown.duration(400).springify().damping(20)}
            className="mb-4 rounded-2xl border border-primary/25 bg-primary-extra-light px-4 py-3.5"
            testID="create-group-guidance"
        >
            <View className="flex-row items-center gap-2 mb-2.5">
                <View className="w-8 h-8 rounded-full bg-white/80 items-center justify-center">
                    <AppIcon name="sparkles-outline" size={18} color={colors.primaryDark} />
                </View>
                <Text
                    className={rtlTextClassName(isRtl, 'text-base font-bold flex-1')}
                    style={{ color: colors.primaryDark }}
                >
                    {t('groups.createForm.guidance.title')}
                </Text>
            </View>
            <Text
                className={rtlTextClassName(isRtl, 'text-sm leading-relaxed mb-3')}
                style={{ color: colors.gray700 }}
            >
                {t('groups.createForm.guidance.subtitle')}
            </Text>
            {TIP_KEYS.map((key, index) => (
                <View key={key} className="flex-row gap-2.5 mt-2">
                    <View className="w-5 h-5 rounded-full bg-primary items-center justify-center mt-0.5">
                        <Text className="text-[11px] font-bold text-white">{index + 1}</Text>
                    </View>
                    <Text
                        className={rtlTextClassName(isRtl, 'text-sm leading-relaxed flex-1')}
                        style={{ color: colors.gray800 }}
                    >
                        {t(key)}
                    </Text>
                </View>
            ))}
        </Animated.View>
    );
}
