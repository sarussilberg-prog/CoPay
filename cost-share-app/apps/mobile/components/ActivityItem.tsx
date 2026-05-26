/**
 * ActivityItem — one row in the activity feed.
 *
 * Receives the ActivityEvent plus pre-resolved actor profile and group name.
 * The screen-level component fetches profile/group lookups in batch and passes
 * them down so this component stays display-only.
 */

import React, { useMemo } from 'react';
import type { ActivityEvent, GroupMemberLite } from '@cost-share/shared';
import { useTranslation } from 'react-i18next';
import { MemberAvatar } from './MemberAvatar';
import { FeedChatRow } from './FeedChatRow';
import { ActivityItemCard, resolveActivityTitle } from './ActivityItemCard';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import {
    getAvatarUrlForMember,
    getDisplayNameForMember,
} from '../lib/userDisplay';

interface ActivityItemProps {
    event: ActivityEvent;
    actor?: GroupMemberLite;
    /** For settlements: profiles of from_user_id / to_user_id (in metadata). */
    counterpart?: GroupMemberLite;
    /** For group_member_joined: profile of the new member from metadata.new_member_user_id. */
    newMember?: GroupMemberLite;
    groupName?: string;
    currentUserId: string;
    onPress?: (event: ActivityEvent) => void;
}

export const ActivityItem = React.memo(function ActivityItem({
    event,
    actor,
    counterpart,
    newMember,
    groupName,
    currentUserId,
    onPress,
}: ActivityItemProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const pressable = Boolean(onPress) && event.kind !== 'group_removed';

    const timestamp = formatFeedDateTime(event.createdAt, language);
    const actorName = getDisplayNameForMember(actor ?? null, t);
    const newMemberName = newMember ? getDisplayNameForMember(newMember, t) : undefined;
    const friendRequestStatus = event.kind === 'friend_request_received'
        ? (((event.metadata?.status as string | undefined) ?? 'pending') as
            'pending' | 'accepted' | 'rejected' | 'cancelled')
        : undefined;

    // Build a settlement description (uses currentUserId for perspective).
    let titleOverride: string | undefined;
    if (event.kind === 'settlement_added') {
        const md = event.metadata ?? {};
        const fromId = md.from_user_id as string | undefined;
        const toId = md.to_user_id as string | undefined;
        const amount = Number(md.amount ?? 0);
        const currency = (md.currency as string | undefined) ?? '';
        const fromName = fromId === currentUserId
            ? t('common.you')
            : (fromId === actor?.userId ? actorName : getDisplayNameForMember(counterpart ?? null, t));
        const toName = toId === currentUserId
            ? t('common.you')
            : (toId === actor?.userId ? actorName : getDisplayNameForMember(counterpart ?? null, t));
        const amountText = `${currency} ${amount.toFixed(2)}`;
        if (fromId === currentUserId) {
            titleOverride = t('activity.youPaid', { name: toName, amount: amountText });
        } else if (toId === currentUserId) {
            titleOverride = t('activity.paidYou', { name: fromName, amount: amountText });
        } else {
            titleOverride = t('feed.settlement', { from: fromName, to: toName, amount: amountText });
        }
        if (groupName) {
            titleOverride = `${titleOverride} ${t('activity.inGroup', { group: groupName })}`;
        }
    }

    const title = titleOverride ?? resolveActivityTitle(
        event,
        { actorName, groupName: groupName ?? '', newMemberName },
        t,
    );

    const meta = useMemo(() => {
        switch (event.kind) {
            case 'settlement_added':
            case 'friend_request_received':
            case 'group_added':
            case 'group_member_joined':
            case 'group_removed':
                return timestamp;
            case 'expense_added':
            case 'message_posted':
            default:
                return `${actorName} · ${timestamp}`;
        }
    }, [event.kind, actorName, timestamp]);

    const avatar = (
        <MemberAvatar
            name={actorName}
            avatarUrl={getAvatarUrlForMember(actor ?? null)}
            size="xs"
            testID="activity-avatar"
        />
    );

    return (
        <FeedChatRow avatar={avatar} testID={`activity-item-${event.id}`}>
            <ActivityItemCard
                event={event}
                friendRequestStatus={friendRequestStatus}
                title={title}
                meta={meta}
                groupName={groupName}
                onPress={pressable ? () => onPress?.(event) : undefined}
                testID={`activity-card-${event.id}`}
            />
        </FeedChatRow>
    );
});
