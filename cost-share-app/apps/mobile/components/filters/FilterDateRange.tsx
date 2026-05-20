/**
 * From / to date inputs for filter sheets.
 */

import React from 'react';
import { View, TextInput, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import {
    resolveAutoTextInputStyle,
    rtlRowStyle,
    rtlTextClassName,
    useRtlLayout,
} from '../../hooks/useRtlLayout';

interface FilterDateRangeProps {
    dateFrom?: string;
    dateTo?: string;
    onChangeFrom: (value: string | undefined) => void;
    onChangeTo: (value: string | undefined) => void;
}

export function FilterDateRange({
    dateFrom,
    dateTo,
    onChangeFrom,
    onChangeTo,
}: FilterDateRangeProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const fieldLabelClass = rtlTextClassName(isRtl, 'text-xs text-gray-500 mb-1');
    const keyboardType =
        Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

    return (
        <View style={[rtlRowStyle(isRtl), { gap: 10 }]}>
            <View className="flex-1">
                <Text className={fieldLabelClass}>
                    {t('groups.filters.dateRange.from')}
                </Text>
                <TextInput
                    value={dateFrom ?? ''}
                    onChangeText={(v) => onChangeFrom(v || undefined)}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    keyboardType={keyboardType}
                    className="h-11 rounded-xl bg-white border border-gray-200 px-3 text-sm text-gray-900"
                    style={resolveAutoTextInputStyle(isRtl)}
                />
            </View>
            <View className="flex-1">
                <Text className={fieldLabelClass}>
                    {t('groups.filters.dateRange.to')}
                </Text>
                <TextInput
                    value={dateTo ?? ''}
                    onChangeText={(v) => onChangeTo(v || undefined)}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    keyboardType={keyboardType}
                    className="h-11 rounded-xl bg-white border border-gray-200 px-3 text-sm text-gray-900"
                    style={resolveAutoTextInputStyle(isRtl)}
                />
            </View>
        </View>
    );
}
