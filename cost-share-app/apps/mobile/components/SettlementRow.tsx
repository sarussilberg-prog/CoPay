/**
 * SettlementRow — WhatsApp-style feed row for a settlement payment.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
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
                    <View className="mr-3">
                        <AppIcon
                            name="swap-horizontal-outline"
                            size={18}
                            color={colors.success}
                        />
                    </View>

                    <View className="flex-1 min-w-0">
                        <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
                            {t('feed.settlementRow', {
                                from: fromName,
                                to: toName,
                            })}
                        </Text>
                    </View>

                    <View className="items-end ml-2 shrink-0">
                        <Text className="text-sm font-bold text-green-600" numberOfLines={1}>
                            {amountText}
                        </Text>
                        <Text className="text-[10px] text-gray-400 mt-0.5" numberOfLines={1}>
                            {t('activity.settlement')}
                        </Text>
                    </View>
                </View>

                <Text className="text-[11px] text-gray-400 mt-2" testID="settlement-timestamp">
                    {timestamp}
                </Text>
            </TouchableOpacity>
        </FeedChatRow>
    );
}

export const SettlementRow = React.memo(SettlementRowBase);
