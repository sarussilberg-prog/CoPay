/**
 * Labeled section wrapper for filter sheets.
 */

import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

interface FilterSectionProps {
    label?: string;
    hint?: string;
    first?: boolean;
    children: ReactNode;
}

export function FilterSection({
    label,
    hint,
    first,
    children,
}: FilterSectionProps) {
    const isRtl = useRtlLayout();
    const labelClass = rtlTextClassName(
        isRtl,
        'text-sm font-semibold text-gray-800',
    );
    const hintClass = rtlTextClassName(isRtl, 'text-xs text-gray-500 mb-2.5');
    const hasHeader = Boolean(label || hint);

    return (
        <View
            className={`rounded-2xl bg-slate-50 border border-gray-100 px-4 ${
                first ? 'mt-1' : 'mt-3'
            }`}
            style={{ paddingVertical: 14 }}
        >
            {label ? <Text className={labelClass}>{label}</Text> : null}
            {hint ? (
                <Text className={[hintClass, label ? 'mt-1' : ''].join(' ')}>
                    {hint}
                </Text>
            ) : null}
            <View style={hasHeader ? { marginTop: 10 } : undefined}>{children}</View>
        </View>
    );
}
