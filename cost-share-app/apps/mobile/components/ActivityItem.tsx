/**
 * ActivityItem — side avatar + minimal activity card (icon distinguishes type).
 */

import React, { useMemo } from 'react';
import { RecentActivity } from '@cost-share/shared';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import {
    ActivityItemCard,
    resolveActivityTitle,
} from './ActivityItemCard';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';

interface ActivityItemProps {
    activity: RecentActivity;
    groupName?: string;
    onPress?: (activity: RecentActivity) => void;
}

export const ActivityItem = React.memo(function ActivityItem({
    activity,
    groupName,
    onPress,
}: ActivityItemProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const pressable = Boolean(onPress);

    // Use createdAt (timestamptz) — activityDate maps to expense_date/settlement_date
    // which are DATE columns (no time), so they always render as midnight UTC → 03:00 IST.
    const timestamp = formatFeedDateTime(
        new Date(activity.createdAt),
        language,
    );

    const title = resolveActivityTitle(activity, groupName, t);

    const meta = useMemo(() => {
        switch (activity.activityType) {
            case 'settlement':
            case 'friend_request':
            case 'group_invite':
            case 'member_joined':
            case 'member_left':
                return timestamp;
            case 'message':
            case 'expense':
            default:
                return `${activity.userName} · ${timestamp}`;
        }
    }, [activity.activityType, activity.userName, timestamp]);

    const avatar = (
        <MemberAvatar
            name={activity.userName}
            avatarUrl={activity.userAvatarUrl}
            size="xs"
            testID="activity-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID={`activity-item-${activity.id}`}>
            <ActivityItemCard
                activity={activity}
                title={title}
                meta={meta}
                groupName={groupName}
                onPress={pressable ? () => onPress?.(activity) : undefined}
                testID={`activity-card-${activity.id}`}
            />
        </FeedChatRow>
    );
});
