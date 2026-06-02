import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { onboardingColors } from '../../theme/onboardingColors';
import { onboardingMotion } from '../../theme/onboardingMotion';

type Props = {
    count: number;
    activeIndex: number;
};

function Dot({ active }: { active: boolean }) {
    const width = useSharedValue(active ? 22 : 6);

    useEffect(() => {
        width.value = withTiming(active ? 22 : 6, onboardingMotion.dotTiming);
    }, [active, width]);

    const style = useAnimatedStyle(() => ({
        width: width.value,
        height: 6,
        borderRadius: 999,
        backgroundColor: active ? onboardingColors.blue : onboardingColors.hairline,
    }));

    return <Animated.View style={style} />;
}

export function OnboardingPagerDots({ count, activeIndex }: Props) {
    return (
        <View style={styles.row} accessibilityRole="tablist">
            {Array.from({ length: count }, (_, i) => (
                <Dot key={i} active={i === activeIndex} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
});
