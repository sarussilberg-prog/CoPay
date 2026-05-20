/**
 * Input Component
 * Reusable text input with validation and error display
 * Uses NativeWind styling only
 */

import React from 'react';
import { View, TextInput, TextInputProps } from 'react-native';
import { Text } from './AppText';
import { resolveAutoTextInputStyle, useRtlLayout } from '../hooks/useRtlLayout';

interface InputProps extends Omit<TextInputProps, 'className'> {
    label?: string;
    error?: string;
    containerClassName?: string;
}

export function Input({
    label,
    error,
    containerClassName = '',
    style,
    ...textInputProps
}: InputProps) {
    const isRtl = useRtlLayout();

    return (
        <View className={`mb-4 ${containerClassName}`}>
            {label && (
                <Text className="text-sm font-medium text-gray-700 mb-2">
                    {label}
                </Text>
            )}
            <TextInput
                className={`bg-white border rounded-xl px-4 py-3 text-base text-gray-900 ${error ? 'border-red-500' : 'border-gray-300'
                    }`}
                style={[resolveAutoTextInputStyle(isRtl, style), style]}
                placeholderTextColor="#9CA3AF"
                {...textInputProps}
            />
            {error && (
                <Text className="text-sm text-red-500 mt-1">{error}</Text>
            )}
        </View>
    );
}
