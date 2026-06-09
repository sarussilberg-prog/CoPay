import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

const LOGO_SIZE = Platform.OS === 'ios' ? 216 : 200;

export function AppGateSkeleton() {
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, {
                    toValue: 1.06,
                    duration: 700,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 1,
                    duration: 700,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => {
            loop.stop();
        };
    }, [scale]);

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Animated.Image
                source={require('../../assets/splash-icon.png')}
                style={{
                    width: LOGO_SIZE,
                    height: LOGO_SIZE,
                    transform: [{ scale }],
                }}
                resizeMode="contain"
            />
        </View>
    );
}
