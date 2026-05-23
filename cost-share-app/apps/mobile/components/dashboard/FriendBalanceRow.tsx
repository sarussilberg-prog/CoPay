import { Text } from '../AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FriendBalance, FriendBalanceDisplay } from '@cost-share/shared';
import { MemberAvatar } from '../MemberAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { formatCurrencyAmount } from '../../lib/currencyDisplay';
import { useRtlLayout, rtlRowStyle, rtlTrailingAlign } from '../../hooks/useRtlLayout';
import { getAvatarUrlForFriend, getDisplayNameForFriend } from '../../lib/userDisplay';

interface Props {
    friend: FriendBalance;
    display: FriendBalanceDisplay;
    onPress: (friend: FriendBalance) => void;
    testID?: string;
    isLast?: boolean;
}

export function FriendBalanceRow({ friend, display, onPress, testID, isLast = false }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const isSettled = Math.abs(display.netBalance) < 0.01;
    const owesYou = display.netBalance > 0;
    const friendName = getDisplayNameForFriend(friend, t);
    const friendAvatar = getAvatarUrlForFriend(friend);

    const amountText = isSettled
        ? formatCurrencyAmount(0, display.currency)
        : formatCurrencyAmount(Math.abs(display.netBalance), display.currency);
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
                name={friendName}
                avatarUrl={friendAvatar}
                size="md"
                testID={`${testID}-avatar`}
            />

            <View style={{ flex: 1, marginHorizontal: 12, minWidth: 0 }}>
                <Text
                    className="text-base font-medium text-slate-900"
                    numberOfLines={1}
                >
                    {friendName}
                </Text>
            </View>

            <View style={{ alignItems: rtlTrailingAlign(isRtl), flexShrink: 0, marginHorizontal: 4 }}>
                {subtitle ? (
                    <Text className="text-xs text-slate-500 mt-0.5">{subtitle}</Text>
                ) : null}
                {display.isConverted && !isSettled ? (
                    <Text className="text-[10px] text-slate-400 mt-0.5">
                        {t('dashboard.friendConverted')}
                    </Text>
                ) : null}
                {display.conversionFailed && !isSettled ? (
                    <Text className="text-[10px] text-amber-600 mt-0.5">
                        {t('dashboard.friendConversionFailed')}
                    </Text>
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
