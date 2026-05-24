/**
 * SummaryBalanceStrip — tappable middle row of GroupSummaryCard.
 * One sentence with the inline amount in green (owed) or red (owe).
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useTranslation, Trans } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

interface BalanceShape {
    net: number;
    currency: string;
    isSettled: boolean;
}

interface SummaryBalanceStripProps {
    balance: BalanceShape;
    onPress: () => void;
    testID?: string;
}

function formatAmount(amount: number, currency: string): string {
    return `${currency} ${Math.abs(amount).toFixed(2)}`;
}

export function SummaryBalanceStrip({
    balance,
    onPress,
    testID,
}: SummaryBalanceStripProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const { net, currency, isSettled } = balance;
    const owed = net > 0;
    const amount = formatAmount(net, currency);
    const amountColor = owed ? colors.success : colors.error;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            testID={testID}
            style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <Text
                className="text-[15px] text-gray-900 flex-1"
                numberOfLines={2}
            >
                {isSettled ? (
                    t('groups.card.settled')
                ) : (
                    <Trans
                        i18nKey={owed ? 'groups.summary.youAreOwed' : 'groups.summary.youOwe'}
                        values={{ amount }}
                        components={{
                            1: (
                                <Text
                                    className="font-bold"
                                    style={{
                                        color: amountColor,
                                        fontVariant: ['tabular-nums'],
                                    }}
                                />
                            ),
                        }}
                    >
                        {owed
                            ? `You have <1>${amount}</1> to your credit`
                            : `You owe <1>${amount}</1>`}
                    </Trans>
                )}
            </Text>
            <AppIcon
                name={isRtl ? 'chevron-back' : 'chevron-forward'}
                size={18}
                color={colors.gray400}
            />
        </TouchableOpacity>
    );
}
