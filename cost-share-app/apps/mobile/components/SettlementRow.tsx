/**
 * SettlementRow — feed row for a settlement (payment between two users).
 * Distinct visual treatment from expenses: green accent + payment icon.
 * Tap opens the View / Edit / Delete action sheet (Edit / Delete only if the
 * current user is the payer or receiver).
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Settlement } from '@cost-share/shared';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';

interface SettlementRowProps {
    settlement: Settlement;
    fromName: string;
    toName: string;
    onPress: (settlement: Settlement) => void;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function SettlementRowBase({ settlement, fromName, toName, onPress }: SettlementRowProps) {
    const { t } = useTranslation();
    const date = new Date(settlement.settlementDate);
    const month = MONTHS[date.getMonth()];
    const day = date.getDate();

    const amountText = `${settlement.currency} ${settlement.amount.toFixed(2)}`;

    return (
        <TouchableOpacity
            onPress={() => onPress(settlement)}
            activeOpacity={0.7}
            className="bg-white rounded-2xl p-3 mb-2 border border-gray-100 flex-row items-center"
            testID={`settlement-row-${settlement.id}`}
        >
            <View style={{ width: 44 }} className="items-center mr-2">
                <Text className="text-[10px] font-semibold text-gray-500">{month}</Text>
                <Text className="text-lg font-bold text-gray-900 leading-5">{day}</Text>
            </View>

            <View
                style={{ width: 40, height: 40 }}
                className="rounded-xl bg-green-100 items-center justify-center mr-3"
            >
                <AppIcon name="swap-horizontal-outline" size={20} color={colors.success} />
            </View>

            <View className="flex-1 mr-2">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                    {t('feed.settlement', {
                        from: fromName,
                        to: toName,
                        amount: amountText,
                    })}
                </Text>
                <Text className="text-xs text-gray-500 mt-0.5">{t('activity.settlement')}</Text>
            </View>

            <Text className="text-sm font-semibold text-green-600">{amountText}</Text>
        </TouchableOpacity>
    );
}

export const SettlementRow = React.memo(SettlementRowBase);
