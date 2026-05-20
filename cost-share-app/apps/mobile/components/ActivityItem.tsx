/**
 * ActivityItem — activity feed row matching group feed card styling.
 */

import { Text } from './AppText';
import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RecentActivity } from '@cost-share/shared';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import { feedBubbleStyles } from './feedBubbleStyles';
import { formatCurrencyAmount } from '../lib/currencyDisplay';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';

interface ActivityItemProps {
    activity: RecentActivity;
    onPress?: (activity: RecentActivity) => void;
}

export const ActivityItem = React.memo(function ActivityItem({
    activity,
    onPress,
}: ActivityItemProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const isMessage = activity.activityType === 'message';
    const isExpense = activity.activityType === 'expense';
    const timestamp = formatFeedDateTime(
        new Date(activity.activityDate),
        language,
    );
    const pressable = Boolean(onPress);

    const avatar = (
        <MemberAvatar
            name={activity.userName}
            avatarUrl={activity.userAvatarUrl}
            size="xs"
            testID="activity-avatar"
        />
    );

    const metaParts = [
        activity.userName,
        ...(isMessage ? [t('activity.message')] : []),
        timestamp,
    ];

    return (
        <FeedChatRow avatar={avatar} testID={`activity-item-${activity.id}`}>
            <TouchableOpacity
                onPress={() => onPress?.(activity)}
                activeOpacity={pressable ? 0.85 : 1}
                disabled={!pressable}
                style={feedBubbleStyles.bubble}
            >
                <View className="flex-row items-start">
                    <View className="flex-1 min-w-0">
                        <Text
                            className="text-base font-semibold text-gray-900"
                            numberOfLines={isMessage ? 3 : 2}
                        >
                            {activity.description}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>
                            {metaParts.join(' · ')}
                        </Text>
                    </View>

                    {!isMessage && (
                        <Text
                            className={`text-sm font-bold shrink-0 ml-2 ${
                                isExpense ? 'text-gray-900' : 'text-green-600'
                            }`}
                        >
                            {formatCurrencyAmount(activity.amount, activity.currency)}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        </FeedChatRow>
    );
});
