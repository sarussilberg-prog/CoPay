/**
 * Multi-select chip grid with an "all" option.
 */

import React from 'react';
import { View } from 'react-native';
import { FilterChip } from './FilterChip';
import { rtlRowStyle, useRtlLayout } from '../../hooks/useRtlLayout';
import {
    handleMultiToggle,
    isAllMultiSelected,
    isMultiItemActive,
} from '../../lib/multiSelectFilters';

const chipWrapStyle = { flexWrap: 'wrap' as const, gap: 8 };

export interface FilterChipOption<T extends string> {
    key: T;
    label: string;
}

interface FilterChipGridProps<T extends string> {
    allLabel: string;
    selected: T[];
    allValues: T[];
    options: FilterChipOption<T>[];
    onChange: (next: T[]) => void;
}

export function FilterChipGrid<T extends string>({
    allLabel,
    selected,
    allValues,
    options,
    onChange,
}: FilterChipGridProps<T>) {
    const isRtl = useRtlLayout();

    return (
        <View style={[rtlRowStyle(isRtl), chipWrapStyle]}>
            <FilterChip
                label={allLabel}
                active={isAllMultiSelected(selected, allValues)}
                onPress={() => onChange([])}
            />
            {options.map((opt) => (
                <FilterChip
                    key={opt.key}
                    label={opt.label}
                    active={isMultiItemActive(selected, opt.key)}
                    onPress={() =>
                        onChange(handleMultiToggle(selected, opt.key, allValues))
                    }
                />
            ))}
        </View>
    );
}
