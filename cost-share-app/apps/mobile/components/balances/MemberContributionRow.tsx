/**
 * MemberContributionRow — one row of the per-member list on the Balances
 * screen. Shows avatar, the toggle-dependent label (e.g. "Alice paid" /
 * "Spent on Alice"), and a per-currency amount list. Tapping opens the
 * MemberContributionDialog (handled by the parent).
 */

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CurrencyAmount } from '@cost-share/shared';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { CurrencyAmountList } from './CurrencyAmountList';
import type { BalanceMode } from './BalanceModeToggle';

interface MemberContributionRowProps {
    userId: string;
    name: string;
    avatarUrl?: string;
    amounts: CurrencyAmount[];
    mode: BalanceMode;
    isCurrentUser?: boolean;
    onPress: () => void;
}

export function MemberContributionRow({
    userId,
    name,
    avatarUrl,
    amounts,
    mode,
    isCurrentUser = false,
    onPress,
}: MemberContributionRowProps) {
    const { t } = useTranslation();
    const label = isCurrentUser
        ? mode === 'paid'
            ? t('balances.paidMode.rowYou')
            : t('balances.spentOnMode.rowYou')
        : mode === 'paid'
            ? t('balances.paidMode.row', { name })
            : t('balances.spentOnMode.row', { name });

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="bg-white rounded-xl p-4 mb-2 flex-row items-center"
            testID={`member-row-${userId}`}
        >
            <MemberAvatar name={name} avatarUrl={avatarUrl} size="md" />
            <View className="flex-1 ml-3">
                <Text className="text-sm text-gray-500 mb-1">{label}</Text>
                <CurrencyAmountList
                    amounts={amounts}
                    textClassName="text-base font-semibold text-gray-900"
                />
            </View>
        </TouchableOpacity>
    );
}
