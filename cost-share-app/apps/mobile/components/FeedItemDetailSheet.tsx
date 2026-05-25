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
import { DetailSheetHeader } from './DetailSheetHeader';
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

                    {item && (
                        <DetailSheetHeader
                            label={
                                item.kind === 'expense'
                                    ? t('groups.feedDetail.expenseHeaderLabel')
                                    : t('settleUp.detailHeaderLabel')
                            }
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

function SettlementHero({
    fromName,
    toName,
    amountText,
    heroDate,
    isRtl,
}: {
    fromName: string;
    toName: string;
    amountText: string;
    heroDate: string;
    isRtl: boolean;
}) {
    const { t } = useTranslation();
    const chevronName: AppIconName = isRtl
        ? 'chevron-back'
        : 'chevron-forward';

    return (
        <View className="px-4 pt-1">
            <View
                className="rounded-2xl overflow-hidden border"
                style={{
                    height: 180,
                    borderColor: '#A7F3D0',
                    position: 'relative',
                }}
            >
                <LinearGradient
                    colors={['#10B981', '#047857']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Top + bottom legibility scrim */}
                <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
                >
                    <LinearGradient
                        colors={[
                            'rgba(0,0,0,0.18)',
                            'rgba(0,0,0,0)',
                            'rgba(0,0,0,0)',
                            'rgba(0,0,0,0.18)',
                        ]}
                        locations={[0, 0.3, 0.7, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                </View>

                {/* Payment chip — top-left */}
                <View
                    className="flex-row items-center rounded-full"
                    style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        zIndex: 2,
                    }}
                >
                    <AppIcon
                        name="checkmark-circle"
                        size={12}
                        color="#FFFFFF"
                    />
                    <Text
                        className="text-white font-semibold ml-1"
                        style={{ fontSize: 11 }}
                    >
                        {t('settleUp.payment')}
                    </Text>
                </View>

                {/* Date — top-right */}
                <Text
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 14,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.92)',
                        textShadowColor: 'rgba(0,0,0,0.4)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                        zIndex: 2,
                    }}
                >
                    {heroDate}
                </Text>

                {/* Center payment flow — parent's direction: rtl auto-reverses children. */}
                <View
                    style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 14,
                        zIndex: 2,
                    }}
                >
                    <FlowPerson name={fromName} label={t('settleUp.paid')} />

                    <View
                        style={{
                            flex: 1,
                            minWidth: 0,
                            paddingHorizontal: 6,
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 20,
                                fontWeight: '700',
                                color: '#FFFFFF',
                                fontVariant: ['tabular-nums'],
                                letterSpacing: -0.2,
                                textShadowColor: 'rgba(0,0,0,0.35)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3,
                            }}
                            numberOfLines={1}
                        >
                            {amountText}
                        </Text>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                width: '100%',
                                marginTop: 4,
                            }}
                        >
                            <View
                                style={{
                                    flex: 1,
                                    height: 2,
                                    backgroundColor: 'rgba(255,255,255,0.85)',
                                    borderRadius: 9999,
                                }}
                            />
                            <AppIcon
                                name={chevronName}
                                size={18}
                                color="rgba(255,255,255,0.95)"
                            />
                        </View>
                    </View>

                    <FlowPerson name={toName} label={t('settleUp.received')} />
                </View>
            </View>
        </View>
    );
}

function FlowPerson({ name, label }: { name: string; label: string }) {
    return (
        <View style={{ width: 96, alignItems: 'center' }}>
            <View
                style={{
                    padding: 3,
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    borderRadius: 9999,
                }}
            >
                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 9999,
                    }}
                >
                    <MemberAvatar name={name} size="md" />
                </View>
            </View>
            <Text
                style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    width: 96,
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.35)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                }}
                numberOfLines={1}
            >
                {name}
            </Text>
            <Text
                style={{
                    fontSize: 9,
                    fontWeight: '700',
                    color: 'rgba(255,255,255,0.8)',
                    letterSpacing: 0.8,
                    marginTop: 2,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function SettlementInvolvementStrip({
    settlement,
    currentUserId,
    fromName,
    toName,
    amountText,
    methodLabel,
}: {
    settlement: Settlement;
    currentUserId: string;
    fromName: string;
    toName: string;
    amountText: string;
    methodLabel: string | null;
}) {
    const { t } = useTranslation();

    const isRecipient = settlement.toUserId === currentUserId;
    const isPayer = settlement.fromUserId === currentUserId;

    let iconName: AppIconName;
    let heading: string;
    let sub: string | null;

    if (isRecipient) {
        iconName = 'arrow-down-circle-outline';
        heading = t('settleUp.youReceivedAmount', { amount: amountText });
        sub = methodLabel
            ? t('settleUp.fromVia', { name: fromName, method: methodLabel })
            : t('settleUp.fromName', { name: fromName });
    } else if (isPayer) {
        iconName = 'arrow-up-circle-outline';
        heading = t('settleUp.youPaidAmount', { amount: amountText });
        sub = methodLabel
            ? t('settleUp.toVia', { name: toName, method: methodLabel })
            : t('settleUp.toName', { name: toName });
    } else {
        iconName = 'swap-horizontal-outline';
        heading = t('settleUp.someonePaid', { from: fromName, to: toName });
        sub = methodLabel
            ? t('settleUp.via', { method: methodLabel })
            : null;
    }

    return (
        <View
            className="flex-row items-center mx-4 mt-3.5 mb-6 rounded-xl"
            style={{
                backgroundColor: '#ECFDF5',
                borderColor: '#A7F3D0',
                borderWidth: 1,
                paddingVertical: 14,
                paddingHorizontal: 14,
            }}
        >
            <View
                className="items-center justify-center bg-white"
                style={{ width: 36, height: 36, borderRadius: 9999 }}
            >
                <AppIcon name={iconName} size={20} color={colors.success} />
            </View>
            <View className="flex-1 mx-3 min-w-0">
                <Text
                    style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#047857',
                    }}
                >
                    {heading}
                </Text>
                {sub && (
                    <Text
                        style={{
                            fontSize: 12,
                            color: '#047857',
                            opacity: 0.8,
                            marginTop: 2,
                        }}
                    >
                        {sub}
                    </Text>
                )}
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
    const heroDate = formatHeroDate(
        new Date(settlement.settlementDate ?? settlement.createdAt),
        language,
    );
    const methodLabel = settlement.paymentMethod
        ? t(`balances.paymentMethods.${settlement.paymentMethod}`)
        : null;

    return (
        <View>
            <SettlementHero
                fromName={fromName}
                toName={toName}
                amountText={amountText}
                heroDate={heroDate}
                isRtl={language === 'he'}
            />
            <SettlementInvolvementStrip
                settlement={settlement}
                currentUserId={currentUserId}
                fromName={fromName}
                toName={toName}
                amountText={amountText}
                methodLabel={methodLabel}
            />
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
});
