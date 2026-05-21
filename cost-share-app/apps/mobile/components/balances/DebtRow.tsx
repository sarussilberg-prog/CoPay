/**
 * DebtRow — one row in any debt list (Settle Up screen, simplified
 * debts on Balances screen). Tapping the row triggers `onPress`, which
 * the caller wires to opening SettleUpSheet pre-filled.
 *
 * `involved` controls highlight vs. dimmed-dashed styling — `true` for
 * debts where the current user is the payer or receiver.
 */

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';

export interface DebtRowDebt {
    fromUserId: string;
    toUserId: string;
    currency: string;
    amount: number;
}

interface DebtRowProps {
    debt: DebtRowDebt;
    involved: boolean;
    fromName: string;
    toName: string;
    fromAvatar?: string;
    toAvatar?: string;
    onPress: () => void;
}

export function DebtRow({
    debt,
    involved,
    fromName,
    toName,
    fromAvatar,
    toAvatar,
    onPress,
}: DebtRowProps) {
    const { t } = useTranslation();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className={`rounded-2xl p-4 mb-2 border flex-row items-center ${
                involved ? 'bg-white border-gray-100' : 'bg-slate-50 border-dashed border-gray-300'
            }`}
            accessibilityRole="button"
            testID={`settle-debt-${debt.fromUserId}-${debt.toUserId}-${debt.currency}`}
        >
            <MemberAvatar name={fromName} avatarUrl={fromAvatar} size="sm" />
            <View className="mx-2">
                <Text className="text-gray-400">→</Text>
            </View>
            <MemberAvatar name={toName} avatarUrl={toAvatar} size="sm" />

            <View className="flex-1 ml-3">
                <Text
                    className={`text-sm font-semibold ${involved ? 'text-gray-900' : 'text-gray-600'}`}
                    numberOfLines={1}
                >
                    {t('settleUp.row', {
                        from: fromName,
                        to: toName,
                        amount: `${debt.currency} ${debt.amount.toFixed(2)}`,
                    })}
                </Text>
                {!involved && (
                    <Text className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">
                        {t('settleUp.notInvolved')}
                    </Text>
                )}
            </View>

            <Text
                className={`text-base font-bold ${involved ? 'text-red-500' : 'text-gray-500'}`}
            >
                {debt.currency} {debt.amount.toFixed(2)}
            </Text>
        </TouchableOpacity>
    );
}
