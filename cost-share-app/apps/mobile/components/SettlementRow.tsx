/**
 * SettlementRow — WhatsApp-style feed row for a settlement payment.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Settlement } from '@cost-share/shared';
import { Text } from './AppText';
import { AppIcon } from './AppIcon';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import { FeedActorName } from './FeedActorName';
import { feedBubbleStyles } from './feedBubbleStyles';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { colors } from '../theme';

interface SettlementRowProps {
    settlement: Settlement;
    actorName: string;
    actorAvatarUrl?: string;
    fromName: string;
    toName: string;
    isMine: boolean;
    onPress: () => void;
}

function SettlementRowBase({
    settlement,
    actorName,
    actorAvatarUrl,
    fromName,
    toName,
    isMine,
    onPress,
}: SettlementRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(new Date(settlement.settlementDate), language);
    const amountText = `${settlement.currency} ${settlement.amount.toFixed(2)}`;

    const avatar = (
        <MemberAvatar
            name={actorName}
            avatarUrl={actorAvatarUrl}
            size="xs"
            testID="settlement-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID={`settlement-row-${settlement.id}`}>
            <TouchableOpacity
                onPress={onPress}
                testID={`settlement-press-${settlement.id}`}
                activeOpacity={0.85}
                style={feedBubbleStyles.bubble}
            >
                {!isMine && <FeedActorName name={actorName} />}

                <View className="flex-row items-center">
                    <View
                        style={styles.thumb}
                        className="rounded-xl bg-green-50 items-center justify-center mr-3"
                    >
                        <AppIcon
                            name="swap-horizontal-outline"
                            size={18}
                            color={colors.success}
                        />
                    </View>

                    <View className="flex-1 min-w-0 mr-2">
                        <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
                            {t('feed.settlement', {
                                from: fromName,
                                to: toName,
                                amount: amountText,
                            })}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-0.5">
                            {t('activity.settlement')}
                        </Text>
                    </View>

                    <Text className="text-sm font-bold text-green-600 shrink-0">
                        {amountText}
                    </Text>
                </View>

                <Text className="text-[11px] text-gray-400 mt-2" testID="settlement-timestamp">
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
});

export const SettlementRow = React.memo(SettlementRowBase);
