/**
 * CurrencyAmountList — compact "$120 USD · ₪450 ILS" renderer used on
 * the member list row and inside the contribution dialog. Renders one
 * line per non-zero amount; shows a muted "No activity" line when the
 * list is empty.
 */

import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CurrencyAmount } from '@cost-share/shared';
import { Text } from '../AppText';
import { useRtlLayout, rtlTextAlign } from '../../hooks/useRtlLayout';

interface CurrencyAmountListProps {
    amounts: CurrencyAmount[];
    emptyLabel?: string;
    textClassName?: string;
    emptyClassName?: string;
    testID?: string;
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${amount.toFixed(2)}`;
}

export function CurrencyAmountList({
    amounts,
    emptyLabel,
    textClassName = 'text-sm font-medium text-gray-900',
    emptyClassName = 'text-sm text-gray-400 italic',
    testID,
}: CurrencyAmountListProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const align = rtlTextAlign(isRtl);
    const direction: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';

    const filtered = amounts.filter(a => Math.abs(a.amount) >= 0.005);

    if (filtered.length === 0) {
        return (
            <Text
                className={emptyClassName}
                style={{ textAlign: align, writingDirection: direction }}
                testID={testID ? `${testID}-empty` : undefined}
            >
                {emptyLabel ?? t('balances.noActivityInMode')}
            </Text>
        );
    }

    return (
        <View testID={testID}>
            {filtered.map((row, idx) => (
                <Text
                    key={`${row.currency}-${idx}`}
                    className={textClassName}
                    style={{ textAlign: align, writingDirection: direction }}
                >
                    {formatAmount(row.amount, row.currency)}
                </Text>
            ))}
        </View>
    );
}
