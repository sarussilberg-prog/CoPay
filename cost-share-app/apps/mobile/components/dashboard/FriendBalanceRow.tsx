import { Text } from '../AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FriendBalance } from '@cost-share/shared';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { useRtlLayout, rtlRowStyle, rtlTrailingAlign } from '../../hooks/useRtlLayout';

interface Props {
    friend: FriendBalance;
    onPress: (friend: FriendBalance) => void;
    testID?: string;
    isLast?: boolean;
}

function formatAmount(amount: number, currency: string): string {
    const symbol = currency === 'ILS' ? '₪' : currency;
    if (symbol === '₪') return `${symbol}${amount.toFixed(2)}`;
    return `${amount.toFixed(2)} ${symbol}`;
}

export function FriendBalanceRow({ friend, onPress, testID, isLast = false }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const isSettled = Math.abs(friend.netBalance) < 0.01;
    const owesYou = friend.netBalance > 0;

    const amountText = isSettled
        ? t('dashboard.settled')
        : formatAmount(Math.abs(friend.netBalance), friend.currency);
    const amountClass = isSettled ? 'text-slate-400' : owesYou ? 'text-emerald-600' : 'text-red-600';
    const subtitle = isSettled
        ? null
        : owesYou
            ? t('dashboard.owesYou')
            : t('dashboard.youOweFriend');

    return (
        <TouchableOpacity
            onPress={() => onPress(friend)}
            testID={testID}
            style={rtlRowStyle(isRtl)}
            className={`items-center px-4 py-3.5 ${isLast ? '' : 'border-b border-slate-100'}`}
            accessibilityRole="button"
        >
            <MemberAvatar
                name={friend.name}
                avatarUrl={friend.avatarUrl}
                size="md"
                testID={`${testID}-avatar`}
            />

            <View style={{ flex: 1, marginHorizontal: 12, minWidth: 0 }}>
                <Text
                    className="text-base font-medium text-slate-900"
                    numberOfLines={1}
                >
                    {friend.name}
                </Text>
            </View>

            <View style={{ alignItems: rtlTrailingAlign(isRtl), flexShrink: 0, marginHorizontal: 4 }}>
                {subtitle ? (
                    <Text className="text-xs text-slate-500 mt-0.5">{subtitle}</Text>
                ) : null}
                <Text className={`text-sm font-semibold ${amountClass}`}>{amountText}</Text>
            </View>

            <AppIcon
                name={isRtl ? 'chevron-back' : 'chevron-forward'}
                size={16}
                color={colors.gray400}
            />
        </TouchableOpacity>
    );
}
