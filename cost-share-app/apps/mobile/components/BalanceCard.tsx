/**
 * BalanceCard Component
 * Reusable balance display card
 * Uses NativeWind styling only, supports i18n
 */

import { Text } from './AppText';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from './MemberAvatar';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface BalanceCardProps {
    userName: string;
    avatarUrl?: string;
    balance: number;
    currency: string;
}

export function BalanceCard({ userName, avatarUrl, balance, currency }: BalanceCardProps) {
    const { t } = useTranslation();

    const isPositive = balance > 0;
    const isNegative = balance < 0;
    const isSettled = balance === 0;

    const getStatusText = () => {
        if (isSettled) return t('balances.settledUp');
        if (isPositive) return t('balances.getsBack');
        return t('balances.owes');
    };

    const getBalanceColorClass = () => {
        if (isPositive) return 'text-green-600';
        if (isNegative) return 'text-red-500';
        return 'text-gray-400';
    };

    const getBackgroundClass = () => {
        if (isPositive) return 'bg-green-50';
        if (isNegative) return 'bg-red-50';
        return 'bg-gray-50';
    };

    return (
        <View className={`${getBackgroundClass()} rounded-xl p-4 mb-2`}>
            <View className="flex-row items-center">
                <MemberAvatar name={userName} avatarUrl={avatarUrl} size="md" />

                <View className="flex-1 ml-3">
                    <Text className="text-base font-medium text-gray-900">
                        {userName}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                        {getStatusText()}
                    </Text>
                </View>

                {isSettled ? (
                    <AppIcon
                        name="checkmark-circle"
                        size={24}
                        color={colors.gray400}
                        testID="balance-settled-icon"
                    />
                ) : (
                    <Text className={`text-base font-bold ${getBalanceColorClass()}`}>
                        {`${isNegative ? '-' : '+'}${currency} ${Math.abs(balance).toFixed(2)}`}
                    </Text>
                )}
            </View>
        </View>
    );
}
