import { Text } from '../AppText';
import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BalanceSummary } from '@cost-share/shared';
import { AppIcon } from '../AppIcon';
import { colors, shadows } from '../../theme';

interface Props { summary: BalanceSummary; }

function currencySymbol(currency: string): string {
    return currency === 'ILS' ? '₪' : currency;
}

function formatMoney(value: number, currency: string): string {
    const symbol = currencySymbol(currency);
    if (symbol === '₪') return `${symbol}${value.toFixed(2)}`;
    return `${value.toFixed(2)} ${symbol}`;
}

type BalanceDisplay = { text: string; tone: 'neutral' | 'owe' | 'owed' | 'unknown' };

function getBalanceDisplay(
    value: number | null,
    currency: string,
    zeroLabel: string,
    positiveTone: 'owe' | 'owed',
): BalanceDisplay {
    if (value === null || !Number.isFinite(value)) {
        return { text: '—', tone: 'unknown' };
    }
    if (value < 0.01) {
        return { text: zeroLabel, tone: 'neutral' };
    }
    return {
        text: formatMoney(value, currency),
        tone: positiveTone,
    };
}

const toneClass: Record<BalanceDisplay['tone'], string> = {
    neutral: 'text-slate-500 text-sm font-medium leading-5',
    owe: 'text-red-600 text-lg font-semibold tracking-tight',
    owed: 'text-emerald-600 text-lg font-semibold tracking-tight',
    unknown: 'text-slate-400 text-lg font-semibold',
};

export function BalanceHeroCard({ summary }: Props) {
    const { t } = useTranslation();
    const multi = summary.totalOwed === null || summary.totalOwedToUser === null;
    const [expanded, setExpanded] = useState(multi);

    const owedDisplay = getBalanceDisplay(
        summary.totalOwed,
        summary.defaultCurrency,
        t('dashboard.nothingOwed'),
        'owe',
    );
    const owedToUserDisplay = getBalanceDisplay(
        summary.totalOwedToUser,
        summary.defaultCurrency,
        t('dashboard.notOwedToYou'),
        'owed',
    );

    return (
        <View
            className="rounded-xl mx-4 mb-4 bg-white border border-slate-200/80 overflow-hidden"
            style={shadows.sm}
        >
            <View className="px-4 pt-4 pb-3 border-b border-slate-100">
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t('dashboard.balanceOverview')}
                </Text>
            </View>

            <View className="flex-row">
                <View className="flex-1 px-4 py-4 border-e border-slate-100">
                    <Text className="text-xs font-medium text-slate-500 mb-2">{t('dashboard.youOwe')}</Text>
                    <Text className={toneClass[owedDisplay.tone]}>
                        {owedDisplay.text}
                    </Text>
                </View>
                <View className="flex-1 px-4 py-4">
                    <Text className="text-xs font-medium text-slate-500 mb-2">{t('dashboard.youAreOwed')}</Text>
                    <Text className={toneClass[owedToUserDisplay.tone]}>
                        {owedToUserDisplay.text}
                    </Text>
                </View>
            </View>

            {summary.byCurrency.length > 0 ? (
                <TouchableOpacity
                    onPress={() => setExpanded(v => !v)}
                    testID="balance-hero-toggle"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    className="mx-4 mb-4 py-2.5 flex-row items-center justify-center rounded-lg bg-slate-50 border border-slate-100"
                >
                    <Text className="text-sm font-medium text-slate-600 me-1">
                        {expanded ? t('dashboard.hideBreakdown') : t('dashboard.viewBreakdown')}
                    </Text>
                    <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray500} />
                </TouchableOpacity>
            ) : null}

            {expanded ? (
                <View className="mx-4 mb-4 rounded-lg border border-slate-100 overflow-hidden">
                    {summary.byCurrency.map((row, index) => (
                        <View
                            key={row.currency}
                            className={`flex-row justify-between px-3 py-2.5 ${index > 0 ? 'border-t border-slate-100' : ''}`}
                        >
                            <Text className="text-sm font-medium text-slate-700">{row.currency}</Text>
                            <View className="flex-row gap-4">
                                <Text className="text-sm text-slate-500">
                                    {row.owed < 0.01 ? t('dashboard.nothingOwedShort') : `-${formatMoney(row.owed, row.currency)}`}
                                </Text>
                                <Text className="text-sm text-slate-500">
                                    {row.owedToUser < 0.01 ? t('dashboard.notOwedToYouShort') : `+${formatMoney(row.owedToUser, row.currency)}`}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}
