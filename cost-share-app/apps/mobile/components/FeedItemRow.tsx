/**
 * FeedItemRow — switches between ExpenseRow, MessageRow, and SettlementRow.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FeedItem, GroupMemberLite, GroupMessage, Settlement } from '@cost-share/shared';
import { ExpenseRow } from './ExpenseRow';
import { MessageRow } from './MessageRow';
import { SettlementRow } from './SettlementRow';

interface FeedItemRowProps {
    item: FeedItem;
    currentUserId: string;
    memberMap: Record<string, GroupMemberLite>;
    onExpensePress: (id: string) => void;
    onMessageEdit: (m: GroupMessage) => void;
    onMessageDelete: (m: GroupMessage) => void;
    onSettlementPress: (s: Settlement) => void;
    searchQuery?: string;
}

export function FeedItemRow({
    item,
    currentUserId,
    memberMap,
    onExpensePress,
    onMessageEdit,
    onMessageDelete,
    onSettlementPress,
    searchQuery,
}: FeedItemRowProps) {
    const { t } = useTranslation();

    if (item.kind === 'expense') {
        const actor = memberMap[item.expense.createdBy];
        const payer = memberMap[item.expense.paidBy];
        return (
            <ExpenseRow
                expense={item.expense}
                actorName={actor?.displayName ?? ''}
                actorAvatarUrl={actor?.avatarUrl}
                payerName={payer?.displayName ?? ''}
                isMine={item.expense.createdBy === currentUserId}
                onPress={onExpensePress}
                searchQuery={searchQuery}
            />
        );
    }
    if (item.kind === 'settlement') {
        const actor = memberMap[item.settlement.createdBy];
        const fromName =
            item.settlement.fromUserId === currentUserId
                ? t('settleUp.you')
                : memberMap[item.settlement.fromUserId]?.displayName ?? '';
        const toName =
            item.settlement.toUserId === currentUserId
                ? t('settleUp.you')
                : memberMap[item.settlement.toUserId]?.displayName ?? '';
        return (
            <SettlementRow
                settlement={item.settlement}
                actorName={actor?.displayName ?? fromName}
                actorAvatarUrl={actor?.avatarUrl}
                fromName={fromName}
                toName={toName}
                isMine={item.settlement.createdBy === currentUserId}
                onPress={() => onSettlementPress(item.settlement)}
            />
        );
    }
    const sender = memberMap[item.message.userId];
    return (
        <MessageRow
            message={item.message}
            senderName={sender?.displayName ?? ''}
            senderAvatarUrl={sender?.avatarUrl}
            isMine={item.message.userId === currentUserId}
            onEdit={onMessageEdit}
            onDelete={onMessageDelete}
            searchQuery={searchQuery}
        />
    );
}
