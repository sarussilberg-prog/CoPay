/**
 * Button Component
 * Reusable button with primary, secondary, and outline variants
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    className?: string;
    testID?: string;
}

const variantClasses: Record<ButtonVariant, { container: string; text: string }> = {
    primary: {
        container: 'bg-primary rounded-xl py-4 px-6',
        text: 'text-white font-semibold text-base text-center',
    },
    secondary: {
        container: 'bg-primary-extra-light rounded-xl py-4 px-6',
        text: 'text-primary-dark font-semibold text-base text-center',
    },
    outline: {
        container: 'border border-gray-300 rounded-xl py-4 px-6 bg-white',
        text: 'text-gray-700 font-semibold text-base text-center',
    },
    danger: {
        container: 'bg-red-500 rounded-xl py-4 px-6',
        text: 'text-white font-semibold text-base text-center',
    },
};

export function Button({
    title,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    fullWidth = true,
    className = '',
    testID,
}: ButtonProps) {
    const styles = variantClasses[variant];
    const isDisabled = disabled || loading;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            disabled={isDisabled}
            testID={testID}
            style={isDisabled ? { opacity: 0.5 } : undefined}
            className={`${styles.container} ${fullWidth ? 'w-full' : ''} ${className}`}
        >
            {loading ? (
                <ActivityIndicator
                    size="small"
                    color={variant === 'outline' || variant === 'secondary' ? colors.primary : colors.white}
                />
            ) : (
                <Text className={styles.text}>{title}</Text>
            )}
        </TouchableOpacity>
    );
}
