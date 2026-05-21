/**
 * BalanceChip — small pill summarising a single group's net balance for the user.
 * Variants by sign: positive = owed (green), negative = owe (red), zero/undefined = settled (gray).
 * The `display` prop carries the amount already resolved to the user's default currency
 * (with a `conversionFailed` fallback to the group's own currency when FX is unavailable).
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupBalanceDisplay } from '@cost-share/shared';

interface BalanceChipProps {
    display?: GroupBalanceDisplay;
    /** Currency to use in the "settled" / no-data state. Usually the group's default currency. */
    defaultCurrency: string;
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${Math.abs(amount).toFixed(2)}`;
}

export function BalanceChip({ display, defaultCurrency }: BalanceChipProps) {
    const { t } = useTranslation();
    const net = display?.net ?? 0;

    if (!display || Math.abs(net) < 0.01) {
        return (
            <View className="rounded-full bg-gray-100 px-2.5 py-1 max-w-[120px]">
                <Text
                    className="text-xs font-medium text-gray-500"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {t('groups.card.settled')}
                </Text>
            </View>
        );
    }

    const isOwed = net > 0;
    const containerClass = isOwed
        ? 'rounded-full bg-green-50 px-2.5 py-1 max-w-[120px]'
        : 'rounded-full bg-red-50 px-2.5 py-1 max-w-[120px]';
    const textClass = isOwed
        ? 'text-xs font-semibold text-green-600'
        : 'text-xs font-semibold text-red-500';
    const prefix = isOwed ? '+' : '−';

    return (
        <View className={containerClass}>
            <Text className={textClass} numberOfLines={1} ellipsizeMode="tail">
                {`${prefix}${formatAmount(net, display.currency || defaultCurrency)}`}
            </Text>
        </View>
    );
}
