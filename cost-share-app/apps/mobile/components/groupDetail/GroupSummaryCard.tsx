/**
 * GroupSummaryCard — composite hero card replacing GroupHero +
 * GroupBalanceBanner. Composes SummaryCover (with overlaid app-bar
 * buttons), SummaryBalanceStrip, and SummaryFooter inside one
 * flat-top / rounded-bottom card frame that fills the top region of
 * the screen edge-to-edge.
 */

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Group, GroupMemberLite } from '@cost-share/shared';
import { SummaryCover } from './SummaryCover';
import { SummaryBalanceStrip } from './SummaryBalanceStrip';
import { SummaryFooter } from './SummaryFooter';
import { shadows } from '../../theme';

// Design token "border.card" (#E2E8F0 / slate-200) is not in theme/colors.ts.
const BORDER_CARD = '#E2E8F0';

export interface GroupSummaryBalance {
    net: number;
    currency: string;
    isSettled: boolean;
}

interface GroupSummaryCardProps {
    group: Group;
    members: GroupMemberLite[];
    balance: GroupSummaryBalance;
    settlementCount: number;
    noteHasContent: boolean;
    onBack: () => void;
    onShare: () => void;
    onMenu: () => void;
    onOpenBalances: () => void;
    onOpenNote: () => void;
    onOpenSettleUp: () => void;
}

export function GroupSummaryCard({
    group,
    members,
    balance,
    settlementCount,
    noteHasContent,
    onBack,
    onShare,
    onMenu,
    onOpenBalances,
    onOpenNote,
    onOpenSettleUp,
}: GroupSummaryCardProps) {
    const insets = useSafeAreaInsets();
    return (
        <View
            style={[
                {
                    backgroundColor: '#fff',
                    borderColor: BORDER_CARD,
                    borderBottomWidth: 1,
                    borderBottomLeftRadius: 20,
                    borderBottomRightRadius: 20,
                    overflow: 'hidden',
                },
                shadows.sm,
            ]}
        >
            <SummaryCover
                group={group}
                members={members}
                topInset={insets.top}
                onBack={onBack}
                onShare={onShare}
                onMenu={onMenu}
            />
            <SummaryBalanceStrip
                balance={balance}
                onPress={onOpenBalances}
                testID="summary-balance-strip"
            />
            <SummaryFooter
                settlementCount={settlementCount}
                isSettled={balance.isSettled}
                noteHasContent={noteHasContent}
                onOpenNote={onOpenNote}
                onOpenSettleUp={onOpenSettleUp}
            />
        </View>
    );
}
