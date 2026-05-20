import { Text } from './AppText';
import React, { useEffect } from 'react';
import { View, Animated, TouchableOpacity } from 'react-native';
import { colors } from '../theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    visible: boolean;
    message: string;
    type?: ToastType;
    duration?: number;
    onHide: () => void;
}

export function Toast({
    visible,
    message,
    type = 'info',
    duration = 3000,
    onHide,
}: ToastProps) {
    const opacity = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // Fade in
            Animated.timing(opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();

            // Auto hide after duration
            const timer = setTimeout(() => {
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start(() => {
                    onHide();
                });
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [visible, duration, opacity, onHide]);

    if (!visible) return null;

    const getBackgroundColor = () => {
        switch (type) {
            case 'success':
                return 'bg-green-500';
            case 'error':
                return 'bg-red-500';
            case 'warning':
                return 'bg-amber-500';
            case 'info':
            default:
                return 'bg-blue-500';
        }
    };

    return (
        <Animated.View
            style={{ opacity }}
            className="absolute top-16 left-4 right-4 z-50"
        >
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onHide}
                style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 8,
                    elevation: 6,
                }}
                className={`${getBackgroundColor()} rounded-lg p-4 flex-row items-center`}
            >
                <Text className="text-white text-base flex-1">{message}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}
