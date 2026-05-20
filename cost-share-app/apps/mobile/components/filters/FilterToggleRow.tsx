/**
 * Label + hint + switch row for filter sheets.
 */

import React from 'react';
import { View, Switch } from 'react-native';
import { Text } from '../AppText';
import { rtlRowStyle, useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

interface FilterToggleRowProps {
    label: string;
    hint?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
}

export function FilterToggleRow({
    label,
    hint,
    value,
    onValueChange,
}: FilterToggleRowProps) {
    const isRtl = useRtlLayout();

    return (
        <View
            style={[
                rtlRowStyle(isRtl),
                { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
            ]}
        >
            <View className="flex-1">
                <Text className="text-sm font-medium text-gray-800">{label}</Text>
                {hint ? (
                    <Text className="text-xs text-gray-500 mt-0.5">{hint}</Text>
                ) : null}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: colors.gray200, true: colors.primaryLight }}
                thumbColor={colors.white}
            />
        </View>
    );
}
