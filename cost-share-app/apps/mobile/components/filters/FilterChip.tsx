/**
 * Selectable chip for filter sheets (single or multi).
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { AppIcon, type AppIconName } from '../AppIcon';
import { colors } from '../../theme';

interface FilterChipProps {
    label: string;
    active: boolean;
    onPress: () => void;
    icon?: AppIconName;
    iconColor?: string;
}

export function FilterChip({
    label,
    active,
    onPress,
    icon,
    iconColor,
}: FilterChipProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl border ${
                active
                    ? 'bg-primary-extra-light border-primary'
                    : 'bg-white border-gray-200'
            }`}
        >
            {icon ? (
                <AppIcon
                    name={icon}
                    size={16}
                    color={active ? iconColor ?? colors.primaryDark : colors.gray500}
                />
            ) : null}
            <Text
                className={`text-sm font-medium ${
                    active ? 'text-primary-dark' : 'text-gray-600'
                }`}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}
