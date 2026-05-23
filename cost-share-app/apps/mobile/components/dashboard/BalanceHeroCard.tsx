import { Text } from '../AppText';
import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BalanceSummary } from '@cost-share/shared';
import { AppIcon } from '../AppIcon';
import { colors, shadows } from '../../theme';
import { CurrencyBadge } from '../CurrencyBadge';
import { formatCurrencyAmount } from '../../lib/currencyDisplay';
import { useRtlLayout, rtlRowStyle } from '../../hooks/useRtlLayout';
import type { ProfileBalanceConversion } from '../../hooks/useProfileBalanceSummary';

interface Props {
    summary: BalanceSummary;
    conversion?: ProfileBalanceConversion;
}

function computeNetBalance(
    totalOwed: number | null,
    totalOwedToUser: number | null,
): number | null {
    if (totalOwed === null || totalOwedToUser === null) return null;
    if (!Number.isFinite(totalOwed) || !Number.isFinite(totalOwedToUser)) return null;
    return Number((totalOwedToUser - totalOwed).toFixed(2));
}

type BalanceTone = 'neutral' | 'owe' | 'owed' | 'unknown' | 'loading';

type BalanceDisplay = { text: string; tone: BalanceTone; labelKey: string };

function getNetBalanceDisplay(
    net: number | null,
    currency: string,
    isLoading: boolean,
): BalanceDisplay {
    if (isLoading) {
        return { text: '…', tone: 'loading', labelKey: 'dashboard.netBalance' };
    }
    if (net === null || !Number.isFinite(net)) {
        return { text: '—', tone: 'unknown', labelKey: 'dashboard.netBalance' };
    }
    if (Math.abs(net) < 0.01) {
        return {
            text: formatCurrencyAmount(0, currency),
            tone: 'neutral',
            labelKey: 'dashboard.netBalance',
        };
    }
    if (net > 0) {
        return {
            text: formatCurrencyAmount(net, currency),
            tone: 'owed',
            labelKey: 'dashboard.netOwedToYou',
        };
    }
    return {
        text: formatCurrencyAmount(Math.abs(net), currency),
        tone: 'owe',
        labelKey: 'dashboard.netYouOwe',
    };
}

const heroToneClass: Record<BalanceTone, string> = {
    neutral: 'text-slate-500 text-2xl font-semibold tracking-tight text-center',
    owe: 'text-red-600 text-3xl font-bold tracking-tight text-center',
    owed: 'text-emerald-600 text-3xl font-bold tracking-tight text-center',
    unknown: 'text-slate-400 text-3xl font-semibold text-center',
    loading: 'text-slate-400 text-3xl font-semibold text-center',
};

const chipToneStyles = {
    owe: 'bg-red-50 border-red-200',
    owed: 'bg-emerald-50 border-emerald-200',
    neutral: 'bg-slate-50 border-slate-200',
} as const;

const chipTextStyles = {
    owe: 'text-red-700',
    owed: 'text-emerald-700',
    neutral: 'text-slate-500',
} as const;

function AmountChip({
    label,
    tone,
    testID,
}: {
    label: string;
    tone: keyof typeof chipToneStyles;
    testID?: string;
}) {
    return (
        <View
            testID={testID}
            className={`px-2.5 py-1 rounded-md border ${chipToneStyles[tone]}`}
        >
            <Text className={`text-sm font-semibold tabular-nums ${chipTextStyles[tone]}`}>
                {label}
            </Text>
        </View>
    );
}

function CurrencyBreakdownRow({
    currency,
    owed,
    owedToUser,
    isLast,
}: {
    currency: string;
    owed: number;
    owedToUser: number;
    isLast: boolean;
}) {
    const isRtl = useRtlLayout();
    const hasOwe = owed >= 0.01;
    const hasOwed = owedToUser >= 0.01;

    return (
        <View
            style={rtlRowStyle(isRtl)}
            className={`items-center gap-3 px-3 py-3 ${isLast ? '' : 'border-b border-slate-100'}`}
        >
            <CurrencyBadge currency={currency} />
            <View style={rtlRowStyle(isRtl)} className="flex-1 flex-wrap gap-2 justify-end">
                {hasOwe ? (
                    <AmountChip
                        tone="owe"
                        testID={`breakdown-owe-${currency}`}
                        label={`-${formatCurrencyAmount(owed, currency)}`}
                    />
                ) : (
                    <AmountChip
                        tone="neutral"
                        testID={`breakdown-owe-zero-${currency}`}
                        label={formatCurrencyAmount(0, currency)}
                    />
                )}
                {hasOwed ? (
                    <AmountChip
                        tone="owed"
                        testID={`breakdown-owed-${currency}`}
                        label={`+${formatCurrencyAmount(owedToUser, currency)}`}
                    />
                ) : (
                    <AmountChip
                        tone="neutral"
                        testID={`breakdown-owed-zero-${currency}`}
                        label={formatCurrencyAmount(0, currency)}
                    />
                )}
            </View>
        </View>
    );
}

export function BalanceHeroCard({ summary, conversion }: Props) {
    const { t } = useTranslation();
    const multiNative = summary.totalOwed === null || summary.totalOwedToUser === null;
    const showBreakdownDefault = multiNative && !conversion?.isConverted;
    const [expanded, setExpanded] = useState(showBreakdownDefault);
    const isLoading = conversion?.isLoading ?? false;

    const net = computeNetBalance(summary.totalOwed, summary.totalOwedToUser);
    const netDisplay = getNetBalanceDisplay(net, summary.defaultCurrency, isLoading);

    const conversionFootnote = conversion?.isConverted && conversion.ratesDate
        ? t('dashboard.convertedFootnote', {
            currency: summary.defaultCurrency,
            date: conversion.ratesDate,
        })
        : conversion?.failed
            ? t('dashboard.conversionFailed')
            : null;

    return (
        <View
            className="rounded-xl mx-4 mb-4 bg-white border border-slate-200/80 overflow-hidden"
            style={shadows.sm}
        >
            <View className="px-4 pt-4 pb-2 border-b border-slate-100">
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center">
                    {t('dashboard.balanceOverview')}
                </Text>
                {conversion?.isConverted && conversion.ratesDate ? (
                    <Text className="text-[11px] text-slate-400 mt-1 leading-4 text-center">
                        {t('dashboard.convertedLabel')}
                    </Text>
                ) : null}
            </View>

            <View className="px-4 py-5 items-center">
                <Text className="text-xs font-medium text-slate-500 mb-2 text-center">
                    {t(netDisplay.labelKey)}
                </Text>
                {netDisplay.tone === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.gray400} />
                ) : (
                    <Text className={heroToneClass[netDisplay.tone]} testID="balance-hero-net">
                        {netDisplay.text}
                    </Text>
                )}
            </View>

            {conversionFootnote ? (
                <Text className="px-4 pb-3 text-[11px] text-slate-400 text-center leading-4">
                    {conversionFootnote}
                </Text>
            ) : null}

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
                <View className="mx-4 mb-4 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                    {summary.byCurrency.map((row, index) => (
                        <CurrencyBreakdownRow
                            key={row.currency}
                            currency={row.currency}
                            owed={row.owed}
                            owedToUser={row.owedToUser}
                            isLast={index === summary.byCurrency.length - 1}
                        />
                    ))}
                </View>
            ) : null}
        </View>
    );
}
