/**
 * Single-select chip grid (e.g. sort options).
 */

import React from 'react';
import { View } from 'react-native';
import { FilterChip } from './FilterChip';
import { rtlRowStyle, useRtlLayout } from '../../hooks/useRtlLayout';

const chipWrapStyle = { flexWrap: 'wrap' as const, gap: 8 };

export interface FilterSingleChipOption<T extends string> {
    key: T;
    label: string;
}

interface FilterSingleChipGridProps<T extends string> {
    value: T;
    options: FilterSingleChipOption<T>[];
    onChange: (key: T) => void;
}

export function FilterSingleChipGrid<T extends string>({
    value,
    options,
    onChange,
}: FilterSingleChipGridProps<T>) {
    const isRtl = useRtlLayout();

    return (
        <View style={[rtlRowStyle(isRtl), chipWrapStyle]}>
            {options.map((opt) => (
                <FilterChip
                    key={opt.key}
                    label={opt.label}
                    active={value === opt.key}
                    onPress={() => onChange(opt.key)}
                />
            ))}
        </View>
    );
}
