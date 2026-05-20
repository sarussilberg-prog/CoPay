/**
 * ExpenseRow — WhatsApp-style feed row for an expense with actor avatar.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExpenseWithDelta } from '@cost-share/shared';
import { AppIcon, AppIconName } from './AppIcon';
import { HighlightedText } from './HighlightedText';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import { FeedActorName } from './FeedActorName';
import { ExpensePaidBySub } from './ExpensePaidBySub';
import { feedBubbleStyles } from './feedBubbleStyles';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface ExpenseRowProps {
    expense: ExpenseWithDelta;
    actorName: string;
    actorAvatarUrl?: string;
    payerName: string;
    isMine: boolean;
    onPress: (id: string) => void;
    searchQuery?: string;
}

const categoryIcon: Record<string, AppIconName> = {
    food: 'restaurant-outline',
    transport: 'car-outline',
    accommodation: 'bed-outline',
    utilities: 'flash-outline',
    entertainment: 'film-outline',
    shopping: 'bag-outline',
    healthcare: 'medkit-outline',
    other: 'receipt-outline',
};

function ExpenseRowBase({
    expense,
    actorName,
    actorAvatarUrl,
    payerName,
    isMine,
    onPress,
    searchQuery,
}: ExpenseRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(new Date(expense.expenseDate), language);

    const deltaText = Math.abs(expense.myDelta).toFixed(2);
    const isLent = expense.myDeltaState === 'lent';
    const isBorrowed = expense.myDeltaState === 'borrowed';
    const amountColor = isLent
        ? 'text-green-600'
        : isBorrowed
            ? 'text-red-500'
            : 'text-gray-400';
    const labelKey = isLent
        ? 'groups.expense.youLent'
        : isBorrowed
            ? 'groups.expense.youBorrowed'
            : 'groups.expense.settled';

    const avatar = (
        <MemberAvatar
            name={actorName}
            avatarUrl={actorAvatarUrl}
            size="xs"
            testID="expense-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID="expense-row">
            <TouchableOpacity
                onPress={() => onPress(expense.id)}
                activeOpacity={0.85}
                style={feedBubbleStyles.bubble}
            >
                {!isMine && <FeedActorName name={actorName} />}

                <View className="flex-row items-center">
                    <View
                        style={styles.thumb}
                        className="rounded-xl bg-primary-extra-light items-center justify-center overflow-hidden mr-3"
                    >
                        {expense.receiptUrl ? (
                            <Image
                                source={{ uri: expense.receiptUrl }}
                                style={styles.thumbImage}
                                resizeMode="cover"
                            />
                        ) : (
                            <AppIcon
                                name={
                                    categoryIcon[expense.category ?? 'other'] ??
                                    'receipt-outline'
                                }
                                size={18}
                                color={colors.primary}
                            />
                        )}
                    </View>

                    <View className="flex-1 min-w-0">
                        <HighlightedText
                            className="text-base font-semibold text-gray-900"
                            text={expense.description}
                            query={searchQuery}
                        />
                        <ExpensePaidBySub
                            amount={`${expense.currency} ${expense.amount.toFixed(2)}`}
                            payerName={payerName}
                        />
                    </View>

                    <View className="items-end ml-2 shrink-0">
                        <Text
                            className={`text-sm font-bold ${amountColor}`}
                            numberOfLines={1}
                        >
                            {`${expense.currency} ${deltaText}`}
                        </Text>
                        <Text className="text-[10px] text-gray-400 mt-0.5" numberOfLines={1}>
                            {t(labelKey, {
                                amount: `${expense.currency} ${deltaText}`,
                            })}
                        </Text>
                    </View>
                </View>

                <Text className="text-[11px] text-gray-400 mt-2" testID="expense-timestamp">
                    {timestamp}
                </Text>
            </TouchableOpacity>
        </FeedChatRow>
    );
}

const styles = StyleSheet.create({
    thumb: {
        width: 36,
        height: 36,
    },
    thumbImage: {
        width: 36,
        height: 36,
    },
});

export const ExpenseRow = React.memo(ExpenseRowBase);
