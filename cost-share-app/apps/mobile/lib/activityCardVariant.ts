/**
 * Per-type visual tokens for activity feed cards (icon-only type cue).
 * Each variant uses a white card with a subtle tinted border (like settlement).
 */

import type { ActivityEventKind } from '@cost-share/shared';
import type { AppIconName } from '../components/AppIcon';
import { colors } from '../theme';

export interface ActivityCardVariant {
    iconName: AppIconName;
    iconColor: string;
    iconBgColor: string;
    backgroundColor: string;
    borderColor: string;
    amountTone: 'default' | 'settlement' | 'muted';
    showAmount: boolean;
    showGroupLine: boolean;
    titleLines: number;
}

const EXPENSE: ActivityCardVariant = {
    iconName: 'receipt-outline',
    iconColor: colors.primaryDark,
    iconBgColor: colors.primaryExtraLight,
    backgroundColor: colors.white,
    borderColor: '#bfdbfe',
    amountTone: 'default',
    showAmount: true,
    showGroupLine: true,
    titleLines: 2,
};

const SETTLEMENT: ActivityCardVariant = {
    iconName: 'swap-horizontal-outline',
    iconColor: colors.success,
    iconBgColor: '#ecfdf5',
    backgroundColor: colors.white,
    borderColor: '#bbf7d0',
    amountTone: 'settlement',
    showAmount: true,
    showGroupLine: false,
    titleLines: 3,
};

const MESSAGE: ActivityCardVariant = {
    iconName: 'chatbubble-outline',
    iconColor: colors.primaryDark,
    iconBgColor: colors.primaryExtraLight,
    backgroundColor: colors.white,
    borderColor: '#c7d2fe',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: true,
    titleLines: 3,
};

const FRIEND_REQUEST: ActivityCardVariant = {
    iconName: 'person-add-outline',
    iconColor: '#b45309',
    iconBgColor: '#fffbeb',
    backgroundColor: colors.white,
    borderColor: '#fde68a',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

const FRIEND_REQUEST_ACCEPTED: ActivityCardVariant = {
    iconName: 'checkmark-circle-outline',
    iconColor: colors.success,
    iconBgColor: '#ecfdf5',
    backgroundColor: colors.white,
    borderColor: '#fde68a',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

const FRIEND_REQUEST_REJECTED: ActivityCardVariant = {
    iconName: 'close-circle-outline',
    iconColor: colors.gray500,
    iconBgColor: colors.gray100,
    backgroundColor: colors.white,
    borderColor: '#fde68a',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

const GROUP_INVITE: ActivityCardVariant = {
    iconName: 'people-outline',
    iconColor: colors.primaryDark,
    iconBgColor: colors.primaryExtraLight,
    backgroundColor: colors.white,
    borderColor: '#fde68a',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

const MEMBER_JOINED: ActivityCardVariant = {
    iconName: 'enter-outline',
    iconColor: colors.success,
    iconBgColor: '#ecfdf5',
    backgroundColor: colors.white,
    borderColor: '#bbf7d0',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

const MEMBER_LEFT: ActivityCardVariant = {
    iconName: 'exit-outline',
    iconColor: colors.gray600,
    iconBgColor: colors.gray100,
    backgroundColor: colors.white,
    borderColor: '#d1d5db',
    amountTone: 'muted',
    showAmount: false,
    showGroupLine: false,
    titleLines: 2,
};

export function getActivityCardVariant(
    kind: ActivityEventKind,
    friendRequestStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled',
): ActivityCardVariant {
    switch (kind) {
        case 'expense_added':
            return EXPENSE;
        case 'settlement_added':
            return SETTLEMENT;
        case 'message_posted':
            return MESSAGE;
        case 'friend_request_received':
            if (friendRequestStatus === 'accepted') return FRIEND_REQUEST_ACCEPTED;
            if (friendRequestStatus === 'rejected') return FRIEND_REQUEST_REJECTED;
            return FRIEND_REQUEST;
        case 'group_added':
            return GROUP_INVITE;
        case 'group_member_joined':
            return MEMBER_JOINED;
        case 'group_removed':
            return MEMBER_LEFT;
    }
}

export function activityCardAmountClass(tone: ActivityCardVariant['amountTone']): string {
    switch (tone) {
        case 'settlement':
            return 'text-green-600';
        case 'muted':
            return 'text-gray-500';
        default:
            return 'text-gray-900';
    }
}
