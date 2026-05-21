/**
 * SimplifiedDebtsSection — bottom section of the Balances screen.
 * Reuses the same `DebtRow` as SettleUpListScreen so the visual is
 * identical. Tapping a row triggers settle (callers wire it to the
 * SettleUpSheet). The "All settled" empty state appears only when
 * every currency simplifies to zero debts; the Minimum badge surfaces
 * when all currencies were solved by the exact algorithm.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DebtSummary } from '@cost-share/shared';
import { Text } from '../AppText';
import { DebtRow } from './DebtRow';
import type { SimplifiedDebtsByCurrencyEntry } from '../../services/groups.service';

interface SimplifiedDebtsSectionProps {
    entries: SimplifiedDebtsByCurrencyEntry[];
    avatarById: Record<string, string | undefined>;
    nameById: Record<string, string>;
    currentUserId: string;
    onSettle: (debt: DebtSummary) => void;
}

export function SimplifiedDebtsSection({
    entries,
    avatarById,
    nameById,
    currentUserId,
    onSettle,
}: SimplifiedDebtsSectionProps) {
    const { t } = useTranslation();

    const { totalCount, allExact, anyDebts } = useMemo(() => {
        let count = 0;
        let exact = true;
        let any = false;
        for (const e of entries) {
            count += e.result.transactionCount;
            if (e.result.algorithm !== 'exact') exact = false;
            if (e.result.debts.length > 0) any = true;
        }
        return { totalCount: count, allExact: exact, anyDebts: any };
    }, [entries]);

    if (!anyDebts) {
        return (
            <View className="bg-green-50 rounded-xl p-6 items-center">
                <Text className="text-2xl mb-2">✅</Text>
                <Text className="text-base font-medium text-green-700">
                    {t('balances.allSettled')}
                </Text>
                <Text className="text-sm text-green-600 mt-1">
                    {t('balances.noDebts')}
                </Text>
            </View>
        );
    }

    const resolveName = (userId: string): string => {
        if (userId === currentUserId) return t('settleUp.you');
        return nameById[userId] ?? t('common.unknown');
    };

    return (
        <View>
            <View
                testID="debts-summary"
                className="flex-row items-center mb-3"
                style={{ gap: 8 }}
            >
                <Text className="text-sm text-gray-500">
                    {t('balances.paymentsToSettle', { count: totalCount })}
                </Text>
                {allExact && (
                    <View
                        testID="minimum-badge"
                        className="bg-emerald-50 rounded-full px-2 py-0.5"
                    >
                        <Text className="text-xs font-medium text-emerald-700">
                            {t('balances.minimumBadge')}
                        </Text>
                    </View>
                )}
            </View>

            {entries.map(entry =>
                entry.result.debts.map(debt => {
                    const involved =
                        debt.fromUserId === currentUserId ||
                        debt.toUserId === currentUserId;
                    return (
                        <DebtRow
                            key={`${entry.currency}-${debt.fromUserId}-${debt.toUserId}`}
                            debt={debt}
                            involved={involved}
                            fromName={resolveName(debt.fromUserId)}
                            toName={resolveName(debt.toUserId)}
                            fromAvatar={avatarById[debt.fromUserId]}
                            toAvatar={avatarById[debt.toUserId]}
                            onPress={() => onSettle(debt)}
                        />
                    );
                }),
            )}
        </View>
    );
}
