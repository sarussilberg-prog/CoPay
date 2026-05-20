/**
 * GroupBalanceBanner — prominent net balance summary for a single group.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupBalance } from '@cost-share/shared';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { useRtlLayout, rtlTextAlign } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface GroupBalanceBannerProps {
    balance?: GroupBalance;
    defaultCurrency: string;
    settlementCount?: number;
    onPress?: () => void;
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${Math.abs(amount).toFixed(2)}`;
}

export function GroupBalanceBanner({
    balance,
    defaultCurrency,
    settlementCount = 0,
    onPress,
}: GroupBalanceBannerProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const align = rtlTextAlign(isRtl);
    const direction: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';

    const net = balance?.net ?? 0;
    const currency = balance?.currency ?? defaultCurrency;
    const isSettled = Math.abs(net) < 0.01;

    const mainText = isSettled
        ? t('groups.card.settled')
        : net > 0
            ? t('groups.summary.youAreOwed', {
                  amount: formatAmount(net, currency),
              })
            : t('groups.summary.youOwe', {
                  amount: formatAmount(net, currency),
              });

    const mainClass = isSettled
        ? 'text-base font-semibold text-gray-500'
        : net > 0
            ? 'text-lg font-bold text-green-600'
            : 'text-lg font-bold text-red-500';

    const iconName = isSettled
        ? 'checkmark-circle-outline'
        : net > 0
            ? 'arrow-down-circle-outline'
            : 'arrow-up-circle-outline';
    const iconColor = isSettled
        ? colors.gray500
        : net > 0
            ? colors.success
            : colors.error;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={onPress ? 0.85 : 1}
            disabled={!onPress}
            className="mx-4 mt-3 rounded-2xl bg-white border border-gray-100 px-4 py-3.5"
            testID="group-balance-banner"
        >
            <View className="flex-row items-center">
                <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{
                        backgroundColor: isSettled
                            ? colors.gray100
                            : net > 0
                                ? '#ecfdf5'
                                : '#fef2f2',
                    }}
                >
                    <AppIcon name={iconName} size={22} color={iconColor} />
                </View>
                <View className="flex-1 min-w-0">
                    <Text
                        className={mainClass}
                        style={{ textAlign: align, writingDirection: direction }}
                        numberOfLines={2}
                    >
                        {mainText}
                    </Text>
                    {settlementCount > 0 && (
                        <Text
                            className="text-xs text-gray-500 mt-1"
                            style={{ textAlign: align, writingDirection: direction }}
                            testID="group-balance-settlement-hint"
                        >
                            {t('balances.paymentsToSettle', { count: settlementCount })}
                        </Text>
                    )}
                </View>
                {onPress && (
                    <AppIcon
                        name={isRtl ? 'chevron-back' : 'chevron-forward'}
                        size={20}
                        color={colors.gray400}
                    />
                )}
            </View>
        </TouchableOpacity>
    );
}
