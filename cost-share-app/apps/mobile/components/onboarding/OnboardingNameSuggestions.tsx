/**
 * Tap-to-fill name chips for first-group onboarding.
 */

import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { onboardingColors } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

const SUGGESTION_KEYS = [
    'onboarding.create.suggestions.trip',
    'onboarding.create.suggestions.flat',
    'onboarding.create.suggestions.bbq',
    'onboarding.create.suggestions.friday',
] as const;

type Props = {
    onSelect: (name: string) => void;
    visible: boolean;
};

export function OnboardingNameSuggestions({ onSelect, visible }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    if (!visible) return null;

    return (
        <Animated.View entering={FadeIn.duration(220)} className="mb-3" testID="onboarding-name-suggestions">
            <Text
                className={rtlTextClassName(isRtl, 'text-xs font-semibold mb-2')}
                style={{ color: onboardingColors.muted }}
            >
                {t('onboarding.create.suggestions.label')}
            </Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
                {SUGGESTION_KEYS.map((key) => {
                    const label = t(key);
                    return (
                        <TouchableOpacity
                            key={key}
                            onPress={() => onSelect(label)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            testID={`onboarding-name-suggestion-${key}`}
                        >
                            <View
                                style={{
                                    backgroundColor: onboardingColors.blueSoft,
                                    borderWidth: 1,
                                    borderColor: 'rgba(74,134,232,0.35)',
                                    borderRadius: 999,
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                }}
                            >
                                <Text
                                    className={rtlTextClassName(isRtl, 'text-sm font-semibold')}
                                    style={{ color: onboardingColors.blueDeep }}
                                >
                                    {label}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </Animated.View>
    );
}
