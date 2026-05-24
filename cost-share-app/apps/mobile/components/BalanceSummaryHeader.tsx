/**
 * BalanceSummaryHeader — per-currency owed/owe rows above the groups list.
 * Hides rows where both owed and owe round to 0; returns null if all rows are empty.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BalanceSummaryRow } from '@cost-share/shared';
import { useRtlLayout, rtlTextAlign } from '../hooks/useRtlLayout';

interface BalanceSummaryHeaderProps {
    rows: BalanceSummaryRow[];
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${amount.toFixed(2)}`;
}

export function BalanceSummaryHeader({ rows }: BalanceSummaryHeaderProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const align = rtlTextAlign(isRtl);
    const direction: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';

    const visible = rows.filter(r => r.owed >= 0.01 || r.owe >= 0.01);
    if (visible.length === 0) return null;

    return (
        <View className="mx-4 mt-2 mb-3 rounded-2xl bg-white p-4 border border-gray-100">
            {visible.map((row, idx) => (
                <View
                    key={row.currency}
                    className={idx === 0 ? '' : 'mt-2 pt-2 border-t border-gray-100'}
                >
                    {row.owed >= 0.01 && (
                        <Text
                            className="text-sm font-medium text-green-600"
                            style={{ textAlign: align, writingDirection: direction }}
                        >
                            {/* <1>…</1> markers are for the SummaryBalanceStrip <Trans> consumer; strip them here. */}
                            {t('groups.summary.youAreOwed', {
                                amount: formatAmount(row.owed, row.currency),
                            }).replace(/<\/?1>/g, '')}
                        </Text>
                    )}
                    {row.owe >= 0.01 && (
                        <Text
                            className="text-sm font-medium text-red-500 mt-0.5"
                            style={{ textAlign: align, writingDirection: direction }}
                        >
                            {t('groups.summary.youOwe', {
                                amount: formatAmount(row.owe, row.currency),
                            }).replace(/<\/?1>/g, '')}
                        </Text>
                    )}
                </View>
            ))}
        </View>
    );
}
