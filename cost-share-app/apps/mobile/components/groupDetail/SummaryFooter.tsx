/**
 * SummaryFooter — bottom region of GroupSummaryCard.
 * "N payments to settle" on the left; Note + Settle-up pills on the right.
 * Note pill is always rendered; the amber dot toggles on noteHasContent.
 * Settle-up is disabled in the settled state.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { useRtlLayout } from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

// Design tokens not in theme/colors.ts — use literal slate-200 / slate-100 values.
const BORDER_CARD = '#E2E8F0'; // slate-200; design "border.card"
const BORDER_SOFT = '#F1F5F9'; // slate-100; design "border.soft"

interface SummaryFooterProps {
    settlementCount: number;
    isSettled: boolean;
    noteHasContent: boolean;
    onOpenNote: () => void;
    onOpenSettleUp: () => void;
}

export function SummaryFooter({
    settlementCount,
    isSettled,
    noteHasContent,
    onOpenNote,
    onOpenSettleUp,
}: SummaryFooterProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    return (
        <View style={styles.row}>
            <Text
                className="text-[12px] text-gray-500 flex-1"
                numberOfLines={1}
            >
                {isSettled
                    ? t('groups.summary.noOpenPayments')
                    : t('balances.paymentsToSettle', { count: settlementCount })}
            </Text>

            <View style={styles.pillGroup}>
                <TouchableOpacity
                    onPress={onOpenNote}
                    activeOpacity={0.7}
                    testID="summary-note-pill"
                    style={styles.notePill}
                >
                    <AppIcon
                        name="receipt-outline"
                        size={13}
                        color={colors.gray700}
                    />
                    <Text
                        className="text-[12px] font-semibold"
                        style={{ color: colors.gray700 }}
                    >
                        {t('groups.actions.note')}
                    </Text>
                    {noteHasContent && (
                        <View testID="summary-note-dot" style={styles.noteDot} />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={isSettled ? undefined : onOpenSettleUp}
                    activeOpacity={isSettled ? 1 : 0.7}
                    disabled={isSettled}
                    testID="summary-settle-pill"
                    style={[
                        styles.settlePill,
                        {
                            backgroundColor: isSettled
                                ? colors.gray100
                                : colors.primaryExtraLight,
                        },
                    ]}
                >
                    <Text
                        className="text-[12px] font-semibold"
                        style={{
                            color: isSettled
                                ? colors.gray400
                                : colors.primaryDark,
                        }}
                    >
                        {t('groups.actions.settleUp')}
                    </Text>
                    <AppIcon
                        name={isRtl ? 'arrow-back' : 'arrow-forward'}
                        size={12}
                        color={isSettled ? colors.gray400 : colors.primaryDark}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        marginHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: BORDER_SOFT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    pillGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notePill: {
        backgroundColor: '#fff',
        borderColor: BORDER_CARD,
        borderWidth: 1,
        borderRadius: 9999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    noteDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 7,
        height: 7,
        borderRadius: 9999,
        backgroundColor: colors.warning,
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    settlePill: {
        borderRadius: 9999,
        paddingHorizontal: 14,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});
