/**
 * FeedItemDetailSheet — bottom sheet with full expense or settlement details
 * and edit / delete icon actions (used from GroupDetailScreen feed).
 */

import React, { useState } from 'react';
import {
    View,
    Modal,
    Pressable,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
    other: 'pricetag-outline',
};

const categoryBg: Record<string, string> = {
    food: '#F59E0B',
    transport: '#3B82F6',
    accommodation: '#8B5CF6',
    utilities: '#EAB308',
    entertainment: '#EC4899',
    shopping: '#10B981',
    healthcare: '#EF4444',
    other: '#6B7280',
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

    const [menuOpen, setMenuOpen] = useState(false);

    React.useEffect(() => {
        if (!visible) setMenuOpen(false);
    }, [visible]);

    const handleEdit = () => {
        setMenuOpen(false);
        onEdit();
    };
    const handleDelete = () => {
        setMenuOpen(false);
        onDelete();
    };

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
                    <View className="self-center w-10 h-1 rounded-full bg-gray-200 mt-2.5 mb-2" />

                    {item?.kind === 'expense' && (
                        <ExpenseHeader
                            onClose={onClose}
                            menuOpen={menuOpen}
                            onToggleMenu={() => setMenuOpen(o => !o)}
                            onCloseMenu={() => setMenuOpen(false)}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    )}

                    {item?.kind === 'settlement' && (
                        <SettlementHeader
                            onClose={onClose}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    )}

                    <ScrollView
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

function ExpenseHeader({
    onClose,
    menuOpen,
    onToggleMenu,
    onCloseMenu,
    onEdit,
    onDelete,
}: {
    onClose: () => void;
    menuOpen: boolean;
    onToggleMenu: () => void;
    onCloseMenu: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    return (
        <View
            className="flex-row items-center justify-between px-2 pb-1"
            style={{ position: 'relative', zIndex: 5 }}
        >
            <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('groups.filters.close')}
                className="w-11 h-11 items-center justify-center"
            >
                <AppIcon name="close" size={22} color={colors.gray600} />
            </TouchableOpacity>

            <Text
                className="text-xs font-semibold uppercase text-gray-500"
                style={{ letterSpacing: 0.7 }}
            >
                {t('groups.feedDetail.expenseHeaderLabel')}
            </Text>

            <View>
                <TouchableOpacity
                    onPress={onToggleMenu}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.edit')}
                    className="w-11 h-11 items-center justify-center"
                    testID="detail-kebab-btn"
                >
                    <AppIcon
                        name="ellipsis-vertical"
                        size={20}
                        color={colors.gray600}
                    />
                </TouchableOpacity>

                {menuOpen && (
                    <>
                        <Pressable
                            onPress={onCloseMenu}
                            style={styles.menuBackdrop}
                        />
                        <View style={styles.menuCard}>
                            <TouchableOpacity
                                onPress={onEdit}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.edit')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-edit-btn"
                            >
                                <AppIcon
                                    name="create-outline"
                                    size={16}
                                    color={colors.gray700}
                                />
                                <Text className="text-sm font-medium text-gray-900 ml-2.5">
                                    {t('common.edit')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={onDelete}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.delete')}
                                className="flex-row items-center px-3 py-2.5 rounded-lg"
                                testID="detail-delete-btn"
                            >
                                <AppIcon
                                    name="trash-outline"
                                    size={16}
                                    color={colors.error}
                                />
                                <Text
                                    className="text-sm font-medium ml-2.5"
                                    style={{ color: colors.error }}
                                >
                                    {t('common.delete')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

function SettlementHeader({
    onClose,
    onEdit,
    onDelete,
}: {
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    return (
        <View className="px-5 pb-2">
            <View style={styles.headerRow}>
                <Text className="text-xl font-bold text-gray-900 flex-1">
                    {t('groups.feedDetail.settlementTitle')}
                </Text>
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
    );
}

function formatHeroDate(date: Date, language: 'en' | 'he'): string {
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    return date.toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
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

    const categoryKey = expense.category ?? 'other';
    const heroDate = formatHeroDate(
        new Date(expense.expenseDate ?? expense.createdAt),
        language,
    );
    const payerName = memberName(
        memberMap,
        expense.paidBy,
        currentUserId,
        t('settleUp.you'),
        t('common.unknown'),
    );
    const payerFirstName = payerName.split(' ')[0];

    const amountFmt = (n: number) => `${expense.currency} ${n.toFixed(2)}`;

    const involvement: 'borrowed' | 'lent' | 'settled' = expense.myDeltaState;

    return (
        <View>
            {/* Hero card */}
            <View className="px-4 pt-1">
                <View
                    className="rounded-2xl overflow-hidden border border-slate-200"
                    style={{ height: 140, position: 'relative' }}
                >
                    {expense.receiptUrl ? (
                        <Image
                            source={{ uri: expense.receiptUrl }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                        />
                    ) : (
                        <View
                            style={[
                                StyleSheet.absoluteFill,
                                {
                                    backgroundColor: categoryBg[categoryKey] ?? categoryBg.other,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                },
                            ]}
                        >
                            <AppIcon
                                name={categoryIcon[categoryKey] ?? 'pricetag-outline'}
                                size={64}
                                color="rgba(255,255,255,0.55)"
                            />
                        </View>
                    )}
                    <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
                        locations={[0.4, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                    <View
                        style={{
                            position: 'absolute',
                            left: 14,
                            right: 14,
                            bottom: 12,
                        }}
                    >
                        {expense.category && (
                            <View
                                className="self-start flex-row items-center rounded-full"
                                style={{
                                    backgroundColor: 'rgba(0,0,0,0.55)',
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                }}
                            >
                                <AppIcon
                                    name={categoryIcon[categoryKey] ?? 'pricetag-outline'}
                                    size={12}
                                    color="#FFFFFF"
                                />
                                <Text
                                    className="text-white font-semibold ml-1"
                                    style={{ fontSize: 11 }}
                                >
                                    {t(`expenses.categories.${categoryKey}`)}
                                </Text>
                            </View>
                        )}
                        <Text
                            className="font-bold text-white mt-1"
                            style={{
                                fontSize: 20,
                                textShadowColor: 'rgba(0,0,0,0.5)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 4,
                            }}
                        >
                            {expense.description}
                        </Text>
                        <Text
                            style={{
                                fontSize: 12,
                                color: 'rgba(255,255,255,0.92)',
                                textShadowColor: 'rgba(0,0,0,0.5)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 2,
                                marginTop: 2,
                            }}
                        >
                            {heroDate}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Total amount */}
            <View className="px-4 pt-3 pb-1.5">
                <Text
                    className="font-semibold text-gray-400 uppercase"
                    style={{ fontSize: 10, letterSpacing: 0.6 }}
                >
                    {t('groups.expense.totalLabel')}
                </Text>
                <Text
                    className="font-bold text-gray-900"
                    style={{ fontSize: 28, marginTop: 2 }}
                >
                    {amountFmt(expense.amount)}
                </Text>
            </View>

            {/* Involvement strip */}
            {involvement !== 'settled' && (
                <InvolvementStrip
                    state={involvement}
                    amountText={amountFmt(Math.abs(expense.myDelta))}
                    subText={
                        involvement === 'borrowed'
                            ? t('groups.expense.fromPayer', { name: payerName })
                            : t('groups.expense.toNPeople', {
                                  count: Math.max(0, expense.splits.length - 1),
                              })
                    }
                />
            )}

            {/* Splits */}
            {expense.splits.length > 0 && (
                <View className="px-4 pt-4 pb-6">
                    <View className="flex-row items-end justify-between mb-2.5">
                        <Text
                            className="font-semibold uppercase text-gray-400"
                            style={{ fontSize: 11, letterSpacing: 0.6 }}
                        >
                            {t('groups.expense.splitBetweenCount', {
                                count: expense.splits.length,
                            })}
                        </Text>
                        <Text className="text-gray-500" style={{ fontSize: 11 }}>
                            {t('expenses.equalSplit')}
                        </Text>
                    </View>
                    <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        {expense.splits.map((split, idx) => {
                            const name = memberName(
                                memberMap,
                                split.userId,
                                currentUserId,
                                t('settleUp.you'),
                                t('common.unknown'),
                            );
                            const isPayer = split.userId === expense.paidBy;
                            const isLast = idx === expense.splits.length - 1;
                            const sub = isPayer
                                ? t('groups.expense.splitLent', {
                                      amount: amountFmt(expense.amount - split.amount),
                                  })
                                : t('groups.expense.splitOwes', {
                                      name: payerFirstName,
                                  });
                            return (
                                <View
                                    key={split.id}
                                    className={`flex-row items-center px-3.5 py-3 ${isLast ? '' : 'border-b border-slate-100'}`}
                                >
                                    <MemberAvatar name={name} size="sm" />
                                    <View className="flex-1 mx-3 min-w-0">
                                        <View className="flex-row items-center">
                                            <Text className="text-sm font-semibold text-gray-900">
                                                {name}
                                            </Text>
                                            {isPayer && (
                                                <View
                                                    className="ml-2 rounded"
                                                    style={{
                                                        backgroundColor: colors.primaryExtraLight,
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 2,
                                                    }}
                                                >
                                                    <Text
                                                        className="font-bold"
                                                        style={{
                                                            fontSize: 9,
                                                            color: colors.primaryDark,
                                                            letterSpacing: 0.4,
                                                        }}
                                                    >
                                                        {t('groups.expense.paidBadge')}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text
                                            className="text-gray-400 mt-0.5"
                                            style={{ fontSize: 11 }}
                                        >
                                            {sub}
                                        </Text>
                                    </View>
                                    <Text
                                        className="text-sm font-bold text-gray-900"
                                        style={{ fontVariant: ['tabular-nums'] }}
                                    >
                                        {amountFmt(split.amount)}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}
        </View>
    );
}

function InvolvementStrip({
    state,
    amountText,
    subText,
}: {
    state: 'borrowed' | 'lent';
    amountText: string;
    subText: string;
}) {
    const { t } = useTranslation();
    const isBorrowed = state === 'borrowed';

    const bg = isBorrowed ? '#FEF2F2' : '#ECFDF5';
    const border = isBorrowed ? '#FECACA' : '#A7F3D0';
    const textColor = isBorrowed ? '#B91C1C' : '#047857';
    const iconColor = isBorrowed ? colors.error : colors.success;
    const iconName: AppIconName = isBorrowed
        ? 'arrow-up-circle-outline'
        : 'arrow-down-circle-outline';
    const headingKey = isBorrowed
        ? 'groups.expense.youBorrowed'
        : 'groups.expense.youLent';

    return (
        <View
            className="flex-row items-center mx-4 mt-1.5 rounded-xl"
            style={{
                backgroundColor: bg,
                borderColor: border,
                borderWidth: 1,
                paddingVertical: 12,
                paddingHorizontal: 14,
            }}
        >
            <View
                className="items-center justify-center bg-white"
                style={{ width: 32, height: 32, borderRadius: 9999 }}
            >
                <AppIcon name={iconName} size={18} color={iconColor} />
            </View>
            <View className="flex-1 mx-3 min-w-0">
                <Text
                    className="font-bold"
                    style={{ fontSize: 14, color: textColor }}
                >
                    {t(headingKey, { amount: amountText })}
                </Text>
                <Text
                    style={{
                        fontSize: 11,
                        color: textColor,
                        opacity: 0.8,
                        marginTop: 1,
                    }}
                >
                    {subText}
                </Text>
            </View>
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
        new Date(settlement.createdAt),
        language,
    );

    return (
        <View className="px-5">
            <View className="items-center py-4">
                <View className="mb-3">
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
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
    menuCard: {
        position: 'absolute',
        top: 42,
        right: 4,
        minWidth: 160,
        padding: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 20,
        elevation: 8,
        zIndex: 10,
    },
    menuBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 9,
    },
});
