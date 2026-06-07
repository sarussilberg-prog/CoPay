/**
 * FriendGroupBalancesSheet
 * Modal popup that breaks a friend's balance down by group.
 * Each row tap navigates to that group and closes the sheet.
 */

import React, { useMemo } from 'react';
import {
    Modal,
    Pressable,
    View,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FriendBalance, PairwiseDebt } from '@cost-share/shared';
import { Text } from '../AppText';
import { MemberAvatar } from '../MemberAvatar';
import { GroupAvatar } from '../GroupAvatar';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { formatCurrencyAmount } from '../../lib/currencyDisplay';
import { useRtlLayout, rtlRowStyle } from '../../hooks/useRtlLayout';
import { queryKeys } from '../../hooks/queries/keys';
import { fetchGroupPairwiseDebts } from '../../services/settlements.service';
import { fetchGroups } from '../../services/groups.service';
import { getAvatarUrlForFriend, getDisplayNameForFriend } from '../../lib/userDisplay';

interface Props {
    visible: boolean;
    friend: FriendBalance | null;
    currentUserId: string | null;
    onClose: () => void;
    onSelectGroup: (groupId: string) => void;
}

interface CurrencyLine {
    currency: string;
    /** Positive = friend owes the current user. Negative = current user owes the friend. */
    netAmount: number;
}

interface GroupBreakdown {
    groupId: string;
    lines: CurrencyLine[];
    isSettled: boolean;
    isLoading: boolean;
}

function netLinesFromDebts(
    debts: PairwiseDebt[] | undefined,
    currentUserId: string,
    friendId: string,
): CurrencyLine[] {
    if (!debts) return [];
    const byCurrency = new Map<string, number>();
    for (const d of debts) {
        const involvesPair =
            (d.fromUserId === currentUserId && d.toUserId === friendId) ||
            (d.fromUserId === friendId && d.toUserId === currentUserId);
        if (!involvesPair) continue;
        const sign = d.fromUserId === friendId ? 1 : -1;
        byCurrency.set(d.currency, (byCurrency.get(d.currency) ?? 0) + sign * d.amount);
    }
    const lines: CurrencyLine[] = [];
    byCurrency.forEach((netAmount, currency) => {
        if (Math.abs(netAmount) >= 0.01) lines.push({ currency, netAmount });
    });
    return lines;
}

export function FriendGroupBalancesSheet({
    visible,
    friend,
    currentUserId,
    onClose,
    onSelectGroup,
}: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const sharedGroupIds = useMemo(() => friend?.sharedGroupIds ?? [], [friend]);

    const groupsQuery = useQuery({
        queryKey: queryKeys.groups,
        queryFn: fetchGroups,
        enabled: visible && sharedGroupIds.length > 0,
    });
    const groups = groupsQuery.data ?? [];

    const groupsById = useMemo(() => {
        const map = new Map<string, { name: string; imageUrl?: string; groupType: string }>();
        groups.forEach(g => map.set(g.id, {
            name: g.name,
            imageUrl: g.imageUrl,
            groupType: g.groupType,
        }));
        return map;
    }, [groups]);
    const friendId = friend?.userId ?? null;

    const debtQueries = useQueries({
        queries: sharedGroupIds.map(groupId => ({
            queryKey: queryKeys.groupPairwiseDebts(groupId),
            queryFn: () => fetchGroupPairwiseDebts(groupId),
            enabled: visible && Boolean(currentUserId) && Boolean(friendId),
        })),
    });

    const breakdowns: GroupBreakdown[] = useMemo(() => {
        if (!friendId || !currentUserId) return [];
        return sharedGroupIds.map((groupId, idx) => {
            const q = debtQueries[idx];
            const lines = netLinesFromDebts(q?.data, currentUserId, friendId);
            return {
                groupId,
                lines,
                isSettled: lines.length === 0 && !q?.isLoading,
                isLoading: Boolean(q?.isLoading),
            };
        });
    }, [sharedGroupIds, debtQueries, friendId, currentUserId]);

    const anyLoading = breakdowns.some(b => b.isLoading);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable onPress={onClose} className="flex-1 bg-black/40 justify-center px-4">
                <Pressable onPress={() => { }} className="bg-white rounded-2xl max-h-[55%]">
                    {/* Header */}
                    <View
                        style={rtlRowStyle(isRtl)}
                        className="px-4 pt-4 pb-3 items-center border-b border-slate-100"
                    >
                        {friend && (
                            <MemberAvatar
                                name={getDisplayNameForFriend(friend, t)}
                                avatarUrl={getAvatarUrlForFriend(friend)}
                                size="md"
                            />
                        )}
                        <View style={{ flex: 1, marginHorizontal: 12, minWidth: 0 }}>
                            <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                                {friend ? getDisplayNameForFriend(friend, t) : ''}
                            </Text>
                            <Text className="text-xs text-slate-500 mt-0.5">
                                {t('dashboard.friendBreakdownTitle')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={t('common.cancel')}
                            testID="friend-balances-close"
                        >
                            <AppIcon name="close" size={22} color={colors.gray500} />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    {anyLoading && breakdowns.every(b => b.isLoading) ? (
                        <View className="py-10 items-center">
                            <ActivityIndicator color={colors.primary} />
                        </View>
                    ) : breakdowns.length === 0 ? (
                        <View className="py-10 px-6 items-center">
                            <Text className="text-sm text-slate-500 text-center">
                                {t('dashboard.friendBreakdownEmpty')}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
                            {breakdowns.map((b, idx) => {
                                const group = groupsById.get(b.groupId);
                                const isLast = idx === breakdowns.length - 1;
                                return (
                                    <TouchableOpacity
                                        key={b.groupId}
                                        onPress={() => onSelectGroup(b.groupId)}
                                        style={rtlRowStyle(isRtl)}
                                        className={`items-center px-4 py-3 ${isLast ? '' : 'border-b border-slate-100'}`}
                                        accessibilityRole="button"
                                        testID={`friend-balance-group-${b.groupId}`}
                                    >
                                        <GroupAvatar
                                            imageUrl={group?.imageUrl}
                                            groupType={(group?.groupType as any) ?? 'general'}
                                            size="sm"
                                        />
                                        <View style={{ flex: 1, marginHorizontal: 12, minWidth: 0 }}>
                                            <Text
                                                className="text-sm font-medium text-gray-900"
                                                numberOfLines={1}
                                            >
                                                {group?.name
                                                    ?? (groupsQuery.isLoading ? '…' : t('common.unknown'))}
                                            </Text>
                                            {b.isLoading ? (
                                                <Text className="text-xs text-slate-400 mt-0.5">
                                                    …
                                                </Text>
                                            ) : b.isSettled ? (
                                                <Text className="text-xs text-slate-400 mt-0.5">
                                                    {t('dashboard.settled')}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View style={{ alignItems: isRtl ? 'flex-start' : 'flex-end', flexShrink: 0 }}>
                                            {b.lines.map(line => {
                                                const owesYou = line.netAmount > 0;
                                                const amountClass = owesYou
                                                    ? 'text-emerald-600'
                                                    : 'text-red-600';
                                                return (
                                                    <Text
                                                        key={line.currency}
                                                        className={`text-sm font-semibold ${amountClass}`}
                                                    >
                                                        {formatCurrencyAmount(
                                                            Math.abs(line.netAmount),
                                                            line.currency,
                                                        )}
                                                    </Text>
                                                );
                                            })}
                                        </View>
                                        <AppIcon
                                            name={isRtl ? 'chevron-back' : 'chevron-forward'}
                                            size={16}
                                            color={colors.gray400}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}
