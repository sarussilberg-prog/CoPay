/**
 * SplitBreakdownAccordion
 * Collapsible "Full breakdown" panel shown on the AddExpense screen. Lists each
 * selected split member with their live per-share amount. Style mirrors the
 * accordion in FeedItemDetailSheet for visual parity with the expense detail popup.
 */

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { colors } from '../../theme';
import { parseSplitInput } from '../../lib/expenseSplitForm';
import type { UiSplitMode } from './EditPayerSplitSheet';

export interface BreakdownMember {
    id: string;
    name: string;
    avatarUrl?: string;
}

interface SplitBreakdownAccordionProps {
    members: BreakdownMember[];
    currency: string;
    totalAmount: number;
    splitMode: UiSplitMode;
    unequalValues: Record<string, string>;
    payerId?: string;
    paidLabel: string;
}

function shareFor(
    id: string,
    splitMode: UiSplitMode,
    unequalValues: Record<string, string>,
    totalAmount: number,
    selectedCount: number,
): number {
    if (splitMode === 'equal') {
        return selectedCount > 0 && Number.isFinite(totalAmount) ? totalAmount / selectedCount : 0;
    }
    const raw = parseSplitInput(unequalValues[id] ?? '');
    if (splitMode === 'percent') return (totalAmount * raw) / 100;
    return raw;
}

export function SplitBreakdownAccordion({
    members,
    currency,
    totalAmount,
    splitMode,
    unequalValues,
    payerId,
    paidLabel,
}: SplitBreakdownAccordionProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    if (members.length === 0) return null;

    return (
        <View style={{ marginTop: 12 }}>
            <Pressable
                onPress={() => setOpen(o => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                testID="expense-breakdown-toggle"
                style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 10,
                }}
            >
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: colors.gray500,
                        textAlign: 'center',
                        textDecorationLine: 'underline',
                        textDecorationColor: colors.gray300,
                    }}
                >
                    {open
                        ? t('groups.feedDetail.hideFullBreakdown')
                        : t('groups.feedDetail.showFullBreakdown')}
                </Text>
            </Pressable>

            {open ? (
                <View
                    style={{
                        marginTop: 10,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 16,
                        overflow: 'hidden',
                    }}
                    testID="expense-breakdown-list"
                >
                    {members.map((m, idx) => {
                        const isLast = idx === members.length - 1;
                        const amount = shareFor(m.id, splitMode, unequalValues, totalAmount, members.length);
                        const isPayer = m.id === payerId;
                        return (
                            <View
                                key={m.id}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingHorizontal: 14,
                                    paddingVertical: 10,
                                    borderBottomWidth: isLast ? 0 : 1,
                                    borderBottomColor: '#F1F5F9',
                                    gap: 12,
                                }}
                            >
                                <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text
                                        numberOfLines={1}
                                        style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}
                                    >
                                        {m.name}
                                    </Text>
                                    {isPayer ? (
                                        <View
                                            style={{
                                                backgroundColor: colors.primaryExtraLight,
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                borderRadius: 4,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    fontSize: 9,
                                                    fontWeight: '700',
                                                    color: colors.primaryDark,
                                                    letterSpacing: 0.4,
                                                }}
                                            >
                                                {paidLabel}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                <Text
                                    style={{
                                        fontSize: 14,
                                        fontWeight: '700',
                                        color: colors.text.secondary,
                                        fontVariant: ['tabular-nums'],
                                    }}
                                >
                                    {`${currency} ${amount.toFixed(2)}`}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            ) : null}
        </View>
    );
}
