/**
 * Multi-select grid for all group types (icons + labels).
 */

import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GROUP_TYPES, type GroupType } from '@cost-share/shared';
import { FilterChip } from './FilterChip';
import type { AppIconName } from '../AppIcon';
import { getGroupTypeVisual } from '../../lib/groupTypeVisuals';
import { rtlRowStyle, useRtlLayout } from '../../hooks/useRtlLayout';
import {
    handleMultiToggle,
    isAllMultiSelected,
    isMultiItemActive,
} from '../../lib/multiSelectFilters';

const chipWrapStyle = { flexWrap: 'wrap' as const, gap: 8 };

interface GroupTypeFilterGridProps {
    allLabel: string;
    selected: GroupType[];
    onChange: (next: GroupType[]) => void;
}

export function GroupTypeFilterGrid({
    allLabel,
    selected,
    onChange,
}: GroupTypeFilterGridProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const allTypes = [...GROUP_TYPES];

    return (
        <View style={[rtlRowStyle(isRtl), chipWrapStyle]}>
            <FilterChip
                label={allLabel}
                active={isAllMultiSelected(selected, allTypes)}
                onPress={() => onChange([])}
            />
            {GROUP_TYPES.map((typeKey) => {
                const visual = getGroupTypeVisual(typeKey);
                return (
                    <FilterChip
                        key={typeKey}
                        label={t(`groups.types.${typeKey}`)}
                        icon={visual.icon as AppIconName}
                        iconColor={visual.gradient[1]}
                        active={isMultiItemActive(selected, typeKey)}
                        onPress={() =>
                            onChange(
                                handleMultiToggle(selected, typeKey, allTypes),
                            )
                        }
                    />
                );
            })}
        </View>
    );
}
