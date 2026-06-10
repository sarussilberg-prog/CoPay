/**
 * OnboardingStepCard — interactive accordion step for first-group onboarding.
 * Tappable header (numbered badge → check, title, optional tag, summary, chevron)
 * + collapsible body. Uses RN core Animated (chevron) + LayoutAnimation (expand)
 * deliberately — the repo has no reanimated jest mock.
 */

import React, { useEffect, useRef } from 'react';
import {
    View,
    TouchableOpacity,
    Animated,
    Easing,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { onboardingColors } from '../../theme/onboardingColors';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

if (
    Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
    index: number;
    title: string;
    summary?: string;
    helper?: string;
    optionalLabel?: string;
    complete: boolean;
    expanded: boolean;
    /** The one step the user still needs to do — gets the accent treatment. */
    active?: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    testID?: string;
};

export function OnboardingStepCard({
    index,
    title,
    summary,
    helper,
    optionalLabel,
    complete,
    expanded,
    active = false,
    onToggle,
    children,
    testID,
}: Props) {
    const isRtl = useRtlLayout();
    const rotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(rotate, {
            toValue: expanded ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [expanded, rotate]);

    const rotateDeg = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const elevated = expanded || active;
    const badgeBg = complete
        ? colors.success.DEFAULT
        : active
          ? onboardingColors.blue
          : '#EEF2F7';
    const badgeNumberColor = active ? colors.white : '#64748B';

    const handlePress = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onToggle();
    };

    return (
        <View
            testID={testID}
            className="mb-3 rounded-2xl px-4 py-3.5"
            style={{
                backgroundColor: active ? '#F6FAFF' : '#FFFFFF',
                borderWidth: active ? 1.5 : 1,
                borderColor: active
                    ? onboardingColors.blue
                    : expanded
                      ? 'rgba(96,165,250,0.55)'
                      : '#E2E8F0',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: elevated ? 8 : 4 },
                shadowOpacity: elevated ? 0.08 : 0.04,
                shadowRadius: elevated ? 16 : 12,
                elevation: elevated ? 4 : 2,
            }}
        >
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={[`${index}.`, title, summary, optionalLabel]
                    .filter(Boolean)
                    .join(' ')}
                testID={testID ? `${testID}-header` : undefined}
                className="flex-row items-center gap-3"
            >
                <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{ backgroundColor: badgeBg }}
                    testID={testID ? `${testID}-badge` : undefined}
                >
                    {complete ? (
                        <AppIcon
                            name="checkmark"
                            size={16}
                            color={colors.white}
                            testID={testID ? `${testID}-check` : undefined}
                        />
                    ) : (
                        <Text
                            className="text-xs font-bold"
                            style={{
                                color: badgeNumberColor,
                                textAlign: 'center',
                                includeFontPadding: false,
                            }}
                        >
                            {String(index)}
                        </Text>
                    )}
                </View>

                <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                        <Text
                            numberOfLines={1}
                            className={rtlTextClassName(
                                isRtl,
                                'text-base font-bold flex-shrink',
                            )}
                            style={{ color: colors.text.primary }}
                        >
                            {title}
                        </Text>
                        {optionalLabel ? (
                            <View className="rounded-full bg-slate-100 px-2 py-0.5">
                                <Text className="text-[10px] font-medium text-gray-500">
                                    {optionalLabel}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {!expanded && summary ? (
                        <Text
                            numberOfLines={1}
                            className={rtlTextClassName(isRtl, 'text-sm mt-0.5')}
                            style={{ color: colors.text.secondary }}
                            testID={testID ? `${testID}-summary` : undefined}
                        >
                            {summary}
                        </Text>
                    ) : null}
                </View>

                <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
                    <AppIcon name="chevron-down" size={20} color={colors.gray400} />
                </Animated.View>
            </TouchableOpacity>

            {expanded ? (
                <Animated.View
                    style={{ marginTop: 12, opacity: rotate }}
                    testID={testID ? `${testID}-body` : undefined}
                >
                    {helper ? (
                        <Text
                            className={rtlTextClassName(
                                isRtl,
                                'text-sm leading-relaxed mb-3',
                            )}
                            style={{ color: colors.text.secondary }}
                        >
                            {helper}
                        </Text>
                    ) : null}
                    {children}
                </Animated.View>
            ) : null}
        </View>
    );
}
