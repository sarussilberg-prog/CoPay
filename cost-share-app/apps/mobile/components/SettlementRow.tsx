/**
 * SettlementRow — activity-feed row for a settlement payment.
 * Composes the shared FeedRowCard + FeedRowThumbnail primitives.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settlement } from '@cost-share/shared';
import { FeedRowCard } from './FeedRowCard';
import { FeedRowThumbnail } from './FeedRowThumbnail';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { colors } from '../theme';

interface SettlementRowProps {
    settlement: Settlement;
    // Kept for caller compatibility (FeedItemRow). Unused in R1 visual.
    actorName?: string;
    actorAvatarUrl?: string;
    fromName: string;
    toName: string;
    isMine?: boolean;
    onPress: () => void;
}

function SettlementRowBase({
    settlement,
    fromName,
    toName,
    onPress,
}: SettlementRowProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const timestamp = formatFeedDateTime(
        new Date(settlement.createdAt),
        language,
    );

    const title = t('feed.settlementRow', { from: fromName, to: toName });
    const meta = `${timestamp} · ${t('activity.settlement')}`;
    const amount = `${settlement.currency} ${settlement.amount.toFixed(2)}`;

    const thumbnail = (
        <FeedRowThumbnail
            iconName="swap-horizontal-outline"
            iconColor={colors.success}
            iconBgColor="#ecfdf5"
        />
    );

    return (
        <FeedRowCard
            thumbnail={thumbnail}
            title={title}
            meta={meta}
            amount={amount}
            onPress={onPress}
            testID={`settlement-press-${settlement.id}`}
        />
    );
}

export const SettlementRow = React.memo(SettlementRowBase);
