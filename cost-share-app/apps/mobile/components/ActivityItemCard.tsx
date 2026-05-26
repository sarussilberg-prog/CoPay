/**
 * ActivityItemCard — group-feed-style card with per-kind visual variants.
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';
import type { ActivityEvent } from '@cost-share/shared';
import { Text } from './AppText';
import { FeedRowThumbnail } from './FeedRowThumbnail';
import { formatCurrencyAmount } from '../lib/currencyDisplay';
import {
    activityCardAmountClass,
    getActivityCardVariant,
} from '../lib/activityCardVariant';
import { useRtlLayout, rtlRowStyle } from '../hooks/useRtlLayout';

interface ResolveTitleArgs {
    actorName: string;
    groupName: string;
    newMemberName?: string;
}

export function resolveActivityTitle(
    event: ActivityEvent,
    args: ResolveTitleArgs,
    t: TFunction,
): string {
    const { actorName, groupName, newMemberName } = args;
    const meta = event.metadata ?? {};
    switch (event.kind) {
        case 'expense_added':
            return (meta.description as string | undefined) ?? '';
        case 'settlement_added':
            // Description is built by ActivityItem (it needs perspective + i18n)
            return (meta.description as string | undefined) ?? '';
        case 'message_posted':
            return (meta.body as string | undefined) ?? '';
        case 'friend_request_received': {
            const status = (meta.status as string | undefined) ?? 'pending';
            if (status === 'accepted') {
                return t('activity.notifications.friendRequestAccepted', { name: actorName });
            }
            if (status === 'rejected') {
                return t('activity.notifications.friendRequestRejected', { name: actorName });
            }
            return t('activity.notifications.friendRequest', { name: actorName });
        }
        case 'group_added':
            return t('activity.notifications.groupInvite', { name: actorName, group: groupName });
        case 'group_member_joined':
            return t('activity.notifications.memberJoined', {
                name: newMemberName ?? actorName,
                group: groupName,
            });
        case 'group_removed':
            return t('activity.notifications.memberLeft', {
                name: actorName || t('common.you'),
                group: groupName,
            });
    }
}

interface ActivityItemCardProps {
    event: ActivityEvent;
    friendRequestStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
    title: string;
    meta: string;
    groupName?: string;
    onPress?: () => void;
    testID?: string;
}

export function ActivityItemCard({
    event,
    friendRequestStatus,
    title,
    meta,
    groupName,
    onPress,
    testID,
}: ActivityItemCardProps) {
    const isRtl = useRtlLayout();
    const variant = getActivityCardVariant(event.kind, friendRequestStatus);
    const md = event.metadata ?? {};
    const amount = typeof md.amount === 'number' || typeof md.amount === 'string'
        ? Number(md.amount)
        : 0;
    const currency = typeof md.currency === 'string' ? md.currency : '';
    const showAmount = variant.showAmount && amount > 0 && Boolean(currency);
    const amountText = showAmount ? formatCurrencyAmount(amount, currency) : null;

    const rowStyle = {
        gap: 12,
        alignItems: 'center' as const,
        ...rtlRowStyle(isRtl),
    };

    const shellStyle = {
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        width: '100%' as const,
        backgroundColor: variant.backgroundColor,
        borderColor: variant.borderColor,
    };

    const body = (
        <View style={rowStyle}>
            <FeedRowThumbnail
                iconName={variant.iconName}
                iconColor={variant.iconColor}
                iconBgColor={variant.iconBgColor}
                testID="activity-card-thumbnail"
            />
            <View className="flex-1 min-w-0" style={{ gap: 3 }}>
                <Text
                    className="text-[15px] font-semibold text-gray-900 leading-5"
                    numberOfLines={variant.titleLines}
                >
                    {title}
                </Text>
                {groupName && variant.showGroupLine ? (
                    <Text
                        className="text-[12px] font-medium text-primary leading-4"
                        numberOfLines={1}
                    >
                        {groupName}
                    </Text>
                ) : null}
                <Text
                    className="text-[11px] text-gray-400 leading-4"
                    numberOfLines={1}
                >
                    {meta}
                </Text>
            </View>
            {amountText ? (
                <View
                    testID="activity-card-amount"
                    style={{ flexShrink: 0, maxWidth: 108, alignItems: 'flex-end' }}
                >
                    <Text
                        className={`text-[15px] font-bold ${activityCardAmountClass(variant.amountTone)}`}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.65}
                        style={{ textAlign: 'right' }}
                    >
                        {amountText}
                    </Text>
                </View>
            ) : null}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                testID={testID}
                style={shellStyle}
            >
                {body}
            </TouchableOpacity>
        );
    }

    return (
        <View testID={testID} style={shellStyle}>
            {body}
        </View>
    );
}
