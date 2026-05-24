/**
 * BalanceModeToggle — segmented control switching the Balances screen
 * between "Paid" (what each member paid into the group) and "Spent on"
 * (what was paid on each member's behalf). State is held by the parent;
 * default lives in the screen and resets to "paid" on every entry.
 */

import React from 'react';
import { View, TouchableOpacity, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';

/** Inline shadow — NativeWind `shadow-sm` on TouchableOpacity breaks navigation context when toggled. */
const selectedSegmentShadow: ViewStyle = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
};

export type BalanceMode = 'paid' | 'spentOn';

interface BalanceModeToggleProps {
    mode: BalanceMode;
    onChange: (mode: BalanceMode) => void;
    testID?: string;
}

export function BalanceModeToggle({
    mode,
    onChange,
    testID = 'balance-mode-toggle',
}: BalanceModeToggleProps) {
    const { t } = useTranslation();

    const options: Array<{ value: BalanceMode; label: string }> = [
        { value: 'paid', label: t('balances.modeToggle.paid') },
        { value: 'spentOn', label: t('balances.modeToggle.spentOn') },
    ];

    return (
        <View
            className="flex-row bg-gray-100 rounded-xl p-1"
            testID={testID}
        >
            {options.map(opt => {
                const selected = opt.value === mode;
                return (
                    <TouchableOpacity
                        key={opt.value}
                        onPress={() => onChange(opt.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`flex-1 py-2 rounded-lg items-center ${
                            selected ? 'bg-white' : ''
                        }`}
                        style={selected ? selectedSegmentShadow : undefined}
                        testID={`${testID}-${opt.value}`}
                    >
                        <Text
                            className={`text-sm font-semibold ${
                                selected ? 'text-primary-dark' : 'text-gray-600'
                            }`}
                        >
                            {opt.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
