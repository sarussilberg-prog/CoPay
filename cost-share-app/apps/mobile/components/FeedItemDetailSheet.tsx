/**
 * FeedItemDetailSheet — bottom sheet with full expense or settlement details
 * and edit / delete icon actions (used from GroupDetailScreen feed).
 */

import React from 'react';
import {
    View,
    Modal,
    Pressable,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
    ExpenseWithDelta,
    GroupMemberLite,
    Settlement,
} from '@cost-share/shared';
import { Text } from './AppText';
import { AppIcon, AppIconName } from './AppIcon';
import { MemberAvatar } from './MemberAvatar';
import { formatFeedDateTime } from '../lib/formatFeedDateTime';
import { useAppLanguage } from '../hooks/useRtlLayout';
import { colors } from '../theme';
import { shadows } from '../theme/shadows';

const categoryIcon: Record<string, AppIconName> = {
    food: 'restaurant-outline',
    transport: 'car-outline',
    accommodation: 'bed-outline',
    utilities: 'flash-outline',
    entertainment: 'film-outline',
    shopping: 'bag-outline',
    healthcare: 'medkit-outline',
    other: 'receipt-outline',
};

type FeedDetailItem =
    | { kind: 'expense'; expense: ExpenseWithDelta }
    | { kind: 'settlement'; settlement: Settlement };

export interface FeedItemDetailSheetProps {
    item: FeedDetailItem | null;
    memberMap: Record<string, GroupMemberLite>;
    currentUserId: string;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function memberName(
    map: Record<string, GroupMemberLite>,
    userId: string,
    currentUserId: string,
    youLabel: string,
    fallback: string,
): string {
    if (userId === currentUserId) return youLabel;
    return map[userId]?.displayName ?? fallback;
}

export function FeedItemDetailSheet({
    item,
    memberMap,
    currentUserId,
    onClose,
    onEdit,
    onDelete,
}: FeedItemDetailSheetProps) {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const insets = useSafeAreaInsets();
    const visible =
        item !== null &&
        (item.kind === 'expense'
            ? Boolean(item.expense)
            : Boolean(item.settlement));

    const canManage = visible;

    const title =
        item?.kind === 'expense'
            ? t('groups.feedDetail.expenseTitle')
            : item?.kind === 'settlement'
              ? t('groups.feedDetail.settlementTitle')
              : '';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <Pressable
                    onPress={onClose}
                    style={StyleSheet.absoluteFillObject}
                    accessibilityRole="button"
                    accessibilityLabel={t('groups.filters.close')}
                />
                <View
                    style={[styles.sheet, shadows.lg]}
                    testID={
                        item?.kind === 'expense'
                            ? 'expense-detail-sheet'
                            : item?.kind === 'settlement'
                              ? 'settlement-detail-sheet'
                              : undefined
                    }
                >
                    <View className="px-5 pt-4 pb-2">
                        <View className="self-center w-12 h-1 rounded-full bg-gray-200 mb-3" />
                        <View style={styles.headerRow}>
                            <Text className="text-xl font-bold text-gray-900 flex-1">
                                {title}
                            </Text>
                            {canManage && (
                                <View className="flex-row items-center gap-2">
                                    <TouchableOpacity
                                        onPress={onEdit}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('common.edit')}
                                        className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
                                        testID="detail-edit-btn"
                                    >
                                        <AppIcon
                                            name="create-outline"
                                            size={20}
                                            color={colors.primary}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={onDelete}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('common.delete')}
                                        className="w-10 h-10 rounded-full bg-red-50 items-center justify-center"
                                        testID="detail-delete-btn"
                                    >
                                        <AppIcon
                                            name="trash-outline"
                                            size={20}
                                            color={colors.error}
                                        />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <TouchableOpacity
                                onPress={onClose}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={t('groups.filters.close')}
                                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center ml-2"
                            >
                                <AppIcon name="close" size={18} color={colors.gray600} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView
                        className="px-5"
                        contentContainerStyle={{
                            paddingBottom: insets.bottom + 24,
                        }}
                        showsVerticalScrollIndicator
                    >
                        {item?.kind === 'expense' && (
                            <ExpenseDetailBody
                                expense={item.expense}
                                memberMap={memberMap}
                                currentUserId={currentUserId}
                                language={language}
                            />
                        )}
                        {item?.kind === 'settlement' && (
                            <SettlementDetailBody
                                settlement={item.settlement}
                                memberMap={memberMap}
                                currentUserId={currentUserId}
                                language={language}
                            />
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function ExpenseDetailBody({
    expense,
    memberMap,
    currentUserId,
    language,
}: {
    expense: ExpenseWithDelta;
    memberMap: Record<string, GroupMemberLite>;
    currentUserId: string;
    language: 'en' | 'he';
}) {
    const { t } = useTranslation();
    const payerName = memberName(
        memberMap,
        expense.paidBy,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const timestamp = formatFeedDateTime(new Date(expense.expenseDate), language);
    const deltaAbs = Math.abs(expense.myDelta).toFixed(2);
    const deltaLabelKey =
        expense.myDeltaState === 'lent'
            ? 'groups.expense.youLent'
            : expense.myDeltaState === 'borrowed'
              ? 'groups.expense.youBorrowed'
              : 'groups.expense.settled';
    const deltaColor =
        expense.myDeltaState === 'lent'
            ? 'text-green-600'
            : expense.myDeltaState === 'borrowed'
              ? 'text-red-500'
              : 'text-gray-500';

    return (
        <View>
            <View className="items-center py-4">
                <View className="w-16 h-16 rounded-2xl bg-primary-extra-light items-center justify-center overflow-hidden mb-3">
                    {expense.receiptUrl ? (
                        <Image
                            source={{ uri: expense.receiptUrl }}
                            className="w-16 h-16"
                            resizeMode="cover"
                        />
                    ) : (
                        <AppIcon
                            name={
                                categoryIcon[expense.category ?? 'other'] ??
                                'receipt-outline'
                            }
                            size={28}
                            color={colors.primary}
                        />
                    )}
                </View>
                <Text className="text-2xl font-bold text-gray-900">
                    {expense.currency} {expense.amount.toFixed(2)}
                </Text>
                <Text className="text-lg text-gray-800 mt-1 text-center">
                    {expense.description}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">{timestamp}</Text>
                {expense.category && (
                    <View className="bg-primary-extra-light rounded-full px-3 py-1 mt-2">
                        <Text className="text-xs font-medium text-primary-dark">
                            {t(`expenses.categories.${expense.category}`)}
                        </Text>
                    </View>
                )}
            </View>

            <DetailSection label={t('expenses.paidBy')}>
                <View className="flex-row items-center">
                    <MemberAvatar name={payerName} size="md" />
                    <Text className="text-base font-medium text-gray-900 ml-3">
                        {payerName}
                    </Text>
                </View>
            </DetailSection>

            <DetailSection label={t('groups.feedDetail.yourShare')}>
                <Text className={`text-base font-semibold ${deltaColor}`}>
                    {t(deltaLabelKey, {
                        amount: `${expense.currency} ${deltaAbs}`,
                    })}
                </Text>
            </DetailSection>

            {expense.splits.length > 0 && (
                <DetailSection label={t('expenses.splitBetween')}>
                    {expense.splits.map(split => {
                        const name = memberName(
                            memberMap,
                            split.userId,
                            currentUserId,
                            t('settleUp.you'),
                            t('common.unknown'),
                        );
                        return (
                            <View
                                key={split.id}
                                className="flex-row items-center justify-between py-2 border-b border-gray-50"
                            >
                                <View className="flex-row items-center">
                                    <MemberAvatar name={name} size="sm" />
                                    <Text className="text-base text-gray-700 ml-3">
                                        {name}
                                    </Text>
                                </View>
                                <Text className="text-base font-medium text-gray-900">
                                    {expense.currency} {split.amount.toFixed(2)}
                                </Text>
                            </View>
                        );
                    })}
                </DetailSection>
            )}
        </View>
    );
}

function SettlementDetailBody({
    settlement,
    memberMap,
    currentUserId,
    language,
}: {
    settlement: Settlement;
    memberMap: Record<string, GroupMemberLite>;
    currentUserId: string;
    language: 'en' | 'he';
}) {
    const { t } = useTranslation();
    const fromName = memberName(
        memberMap,
        settlement.fromUserId,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const toName = memberName(
        memberMap,
        settlement.toUserId,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const amountText = `${settlement.currency} ${settlement.amount.toFixed(2)}`;
    const timestamp = formatFeedDateTime(
        new Date(settlement.settlementDate),
        language,
    );

    return (
        <View>
            <View className="items-center py-4">
                <View className="w-16 h-16 rounded-2xl bg-green-50 items-center justify-center mb-3">
                    <AppIcon
                        name="swap-horizontal-outline"
                        size={28}
                        color={colors.success}
                    />
                </View>
                <Text className="text-2xl font-bold text-green-600">{amountText}</Text>
                <Text className="text-base text-gray-800 mt-2 text-center px-4">
                    {t('feed.settlement', {
                        from: fromName,
                        to: toName,
                        amount: amountText,
                    })}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">{timestamp}</Text>
            </View>

            <DetailSection label={t('balances.fromUser')}>
                <View className="flex-row items-center">
                    <MemberAvatar name={fromName} size="md" />
                    <Text className="text-base font-medium text-gray-900 ml-3">
                        {fromName}
                    </Text>
                </View>
            </DetailSection>

            <DetailSection label={t('balances.toUser')}>
                <View className="flex-row items-center">
                    <MemberAvatar name={toName} size="md" />
                    <Text className="text-base font-medium text-gray-900 ml-3">
                        {toName}
                    </Text>
                </View>
            </DetailSection>

            {settlement.paymentMethod && (
                <DetailSection label={t('balances.paymentMethod')}>
                    <Text className="text-base text-gray-900">
                        {t(`balances.paymentMethods.${settlement.paymentMethod}`)}
                    </Text>
                </DetailSection>
            )}
        </View>
    );
}

function DetailSection({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100">
            <Text className="text-sm font-medium text-gray-500 mb-2">{label}</Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        overflow: 'hidden',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
