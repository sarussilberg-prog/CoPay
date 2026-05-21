/**
 * MemberContributionBreakdown — content rendered inside the
 * MemberContributionDialog. Sections by counterparty, each with its
 * per-currency lines. Counterparties with zero gross activity show a
 * muted "No activity" line. Amounts are gross: the simplified-debts
 * section on the parent screen handles net resolution.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    CurrencyAmount,
    GroupMemberLite,
    PaidByMatrixRow,
} from '@cost-share/shared';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { CurrencyAmountList } from './CurrencyAmountList';
import type { BalanceMode } from './BalanceModeToggle';

interface MemberContributionBreakdownProps {
    /** Member whose breakdown we're rendering (the "self" of the dialog). */
    member: GroupMemberLite;
    /** All group members — used to render counterparty rows in roster order. */
    allMembers: GroupMemberLite[];
    matrix: PaidByMatrixRow[];
    /** Per-currency totals to show at the top of the dialog. */
    selfTotals: CurrencyAmount[];
    mode: BalanceMode;
    currentUserId: string;
}

function aggregateByCurrency(rows: PaidByMatrixRow[]): CurrencyAmount[] {
    const acc = new Map<string, number>();
    for (const r of rows) {
        acc.set(r.currency, (acc.get(r.currency) ?? 0) + r.amount);
    }
    return Array.from(acc.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function MemberContributionBreakdown({
    member,
    allMembers,
    matrix,
    selfTotals,
    mode,
    currentUserId,
}: MemberContributionBreakdownProps) {
    const { t } = useTranslation();

    const counterparties = useMemo(
        () => allMembers.filter(m => m.userId !== member.userId),
        [allMembers, member.userId],
    );

    const rowsForCounterparty = (otherUserId: string): PaidByMatrixRow[] => {
        if (mode === 'paid') {
            // "Member paid for <Other>": payer = self, consumer = other.
            return matrix.filter(
                r => r.payerId === member.userId && r.consumerId === otherUserId,
            );
        }
        // "Spent on <Member>" → "Other paid for Member": payer = other, consumer = self.
        return matrix.filter(
            r => r.payerId === otherUserId && r.consumerId === member.userId,
        );
    };

    const ownerIsCurrentUser = member.userId === currentUserId;
    const headerLabel = ownerIsCurrentUser
        ? mode === 'paid'
            ? t('balances.paidMode.rowYou')
            : t('balances.spentOnMode.rowYou')
        : mode === 'paid'
            ? t('balances.paidMode.row', { name: member.displayName })
            : t('balances.spentOnMode.row', { name: member.displayName });

    return (
        <View>
            {/* Header: self avatar + name + totals */}
            <View className="flex-row items-center mb-4">
                <MemberAvatar
                    name={member.displayName}
                    avatarUrl={member.avatarUrl}
                    size="lg"
                />
                <View className="flex-1 ml-3">
                    <Text className="text-sm text-gray-500 mb-1">{headerLabel}</Text>
                    <CurrencyAmountList
                        amounts={selfTotals}
                        textClassName="text-base font-bold text-gray-900"
                    />
                </View>
            </View>

            <View className="h-px bg-gray-200 mb-4" />

            {counterparties.map(other => {
                const rows = rowsForCounterparty(other.userId);
                const counterpartyIsCurrentUser = other.userId === currentUserId;
                let sectionTitle: string;
                if (mode === 'paid') {
                    // Self is the payer; counterparty is the consumer.
                    sectionTitle = counterpartyIsCurrentUser
                        ? t('balances.paidMode.detailSectionYou')
                        : t('balances.paidMode.detailSection', { name: other.displayName });
                } else if (counterpartyIsCurrentUser) {
                    // Self (owner) is the consumer; counterparty (you) is the payer.
                    sectionTitle = t('balances.spentOnMode.detailSectionNameYou', {
                        owner: member.displayName,
                    });
                } else if (ownerIsCurrentUser) {
                    // Counterparty paid for you.
                    sectionTitle = t('balances.spentOnMode.detailSectionOwnerYou', {
                        name: other.displayName,
                    });
                } else {
                    sectionTitle = t('balances.spentOnMode.detailSection', {
                        name: other.displayName,
                        owner: member.displayName,
                    });
                }
                const amounts = aggregateByCurrency(rows);

                return (
                    <View
                        key={other.userId}
                        className="mb-3"
                        testID={`contribution-section-${other.userId}`}
                    >
                        <View className="flex-row items-center mb-1">
                            <MemberAvatar
                                name={other.displayName}
                                avatarUrl={other.avatarUrl}
                                size="xs"
                            />
                            <Text className="text-sm font-medium text-gray-700 ml-2">
                                {sectionTitle}
                            </Text>
                        </View>
                        <View className="pl-9">
                            <CurrencyAmountList
                                amounts={amounts}
                                textClassName="text-sm text-gray-900"
                            />
                        </View>
                    </View>
                );
            })}
        </View>
    );
}
