/**
 * ExpenseRow — activity-feed row for an expense.
 * Composes the shared FeedRowCard + FeedRowThumbnail primitives.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExpenseCategory, ExpenseWithDelta } from '@cost-share/shared';
import { FeedRowCard } from './FeedRowCard';
import { FeedRowThumbnail } from './FeedRowThumbnail';
import { AppIconName } from './AppIcon';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';

// ExpenseCategory → Ionicon for the icon-thumbnail fallback.
const CATEGORY_ICON: Record<ExpenseCategory, AppIconName> = {
    food: 'restaurant-outline',
    transport: 'car-outline',
    accommodation: 'bed-outline',
    utilities: 'flash-outline',
    entertainment: 'film-outline',
    shopping: 'cart-outline',
    healthcare: 'medkit-outline',
    other: 'pricetag-outline',
};

interface ExpenseRowProps {
    expense: ExpenseWithDelta;
    // The following props are kept for caller compatibility (FeedItemRow).
    // They are unused in the R1 visual and can be removed when FeedItemRow
    // is refactored to the new row primitives.
    actorName?: string;
    actorAvatarUrl?: string;
    payerName: string;
    isMine?: boolean;
    onPress: (id: string) => void;
    searchQuery?: string;
}

function ExpenseRowBase({ expense, payerName, onPress }: ExpenseRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(new Date(expense.createdAt), language);

    const amount = `${expense.currency} ${expense.amount.toFixed(2)}`;
    const meta = `${timestamp} · ${t('expenses.paidBy')} ${payerName}`.trim();

    // Involvement sub-line — only when the current user has non-zero exposure.
    let subLine: string | undefined;
    const userShare = Math.abs(expense.myDelta);
    if (userShare > 0) {
        const formatted = `${expense.currency} ${userShare.toFixed(2)}`;
        const key =
            expense.myDeltaState === 'lent'
                ? 'groups.expense.youLent'
                : 'groups.expense.youBorrowed';
        subLine = t(key, { amount: formatted });
    }

    const thumbnail = (
        <FeedRowThumbnail
            imageUrl={expense.receiptUrl ?? undefined}
            iconName={
                CATEGORY_ICON[expense.category as ExpenseCategory] ??
                CATEGORY_ICON.other
            }
        />
    );

    return (
        <FeedRowCard
            thumbnail={thumbnail}
            title={expense.description}
            meta={meta}
            amount={amount}
            subLine={subLine}
            onPress={() => onPress(expense.id)}
            testID={`expense-row-${expense.id}`}
        />
    );
}

export const ExpenseRow = React.memo(ExpenseRowBase);
