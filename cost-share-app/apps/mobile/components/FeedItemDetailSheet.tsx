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
    StyleSheet,
    Image,
    TouchableOpacity,
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
import { MemberStack } from './groupDetail/MemberStack';
import { getAvatarUrlForMember } from '../lib/userDisplay';
import {
    resolveExpenseFeedPerspective,
    expenseFeedSummaryKey,
    expenseFeedSummaryCount,
} from '../lib/feedExpensePerspective';
import { buildSettlementFeedCopy } from '../lib/feedSettlementPerspective';
import { useAppLanguage, useRtlLayout } from '../hooks/useRtlLayout';
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
    /** When set (e.g. from Activity feed), shows a link to open this item in the group. */
    onOpenInGroup?: () => void;
    openInGroupLabel?: string;
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

function memberAvatarUrl(
    map: Record<string, GroupMemberLite>,
    userId: string,
): string | undefined {
    return getAvatarUrlForMember(map[userId]) ?? undefined;
}

function OpenInGroupButton({
    label,
    onPress,
}: {
    label: string;
    onPress: () => void;
}) {
    const isRtl = useRtlLayout();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            testID="feed-detail-open-in-group"
            style={openInGroupStyles.button}
        >
            <AppIcon name="people-outline" size={16} color={colors.primaryDark} />
            <Text
                className="text-[13px] font-semibold text-primary ml-2 flex-1"
                numberOfLines={1}
            >
                {label}
            </Text>
            <AppIcon
                name={isRtl ? 'chevron-back' : 'chevron-forward'}
                size={16}
                color={colors.primary}
            />
        </TouchableOpacity>
    );
}

const openInGroupStyles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        backgroundColor: colors.primaryExtraLight,
    },
});

export function FeedItemDetailSheet({
    item,
    memberMap,
    currentUserId,
    onClose,
    onEdit,
    onDelete,
    onOpenInGroup,
    openInGroupLabel,
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
                        {onOpenInGroup && openInGroupLabel ? (
                            <OpenInGroupButton
                                label={openInGroupLabel}
                                onPress={onOpenInGroup}
                            />
                        ) : null}
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
    const [breakdownOpen, setBreakdownOpen] = useState(false);

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

    const splitMembers: GroupMemberLite[] = expense.splits.map(s => {
            const existing = memberMap[s.userId];
            if (existing) return existing;
            return {
                userId: s.userId,
                displayName: memberName(
                    memberMap,
                    s.userId,
                    currentUserId,
                    t('settleUp.you'),
                    t('common.unknown'),
                ),
                isActive: true,
            };
        });

    return (
        <View>
            <ExpenseHero
                expense={expense}
                currentUserId={currentUserId}
                payerName={payerName}
                payerAvatarUrl={memberAvatarUrl(memberMap, expense.paidBy)}
                splitMembers={splitMembers}
                amountText={amountFmt(expense.amount)}
                heroDate={heroDate}
            />

            {involvement !== 'settled' && (
                <InvolvementStrip
                    state={involvement}
                    amountText={amountFmt(Math.abs(expense.myDelta))}
                    subText={
                        involvement === 'borrowed'
                            ? t('groups.expense.fromPayer', { name: payerName })
                            : t('groups.expense.toNPeople', {
                                  count: expense.splits.length,
                              })
                    }
                />
            )}

            {expense.splits.length > 0 && (
                <View className="px-4 pt-3 pb-6">
                    <Pressable
                        onPress={() => setBreakdownOpen(open => !open)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: breakdownOpen }}
                        testID="expense-breakdown-toggle"
                        className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"
                    >
                        <Text
                            className="font-semibold text-gray-700"
                            style={{ fontSize: 14 }}
                        >
                            {breakdownOpen
                                ? t('groups.feedDetail.hideFullBreakdown')
                                : t('groups.feedDetail.showFullBreakdown')}
                        </Text>
                        <AppIcon
                            name={
                                breakdownOpen
                                    ? 'chevron-up-outline'
                                    : 'chevron-down-outline'
                            }
                            size={20}
                            color={colors.gray500}
                        />
                    </Pressable>

                    {breakdownOpen && (
                        <View className="mt-3" testID="expense-breakdown-list">
                            <View className="flex-row items-end justify-between mb-2.5">
                                <Text
                                    className="font-semibold uppercase text-gray-400"
                                    style={{ fontSize: 11, letterSpacing: 0.6 }}
                                >
                                    {t('groups.expense.splitBetweenCount', {
                                        count: expense.splits.length,
                                    })}
                                </Text>
                                <Text
                                    className="text-gray-500"
                                    style={{ fontSize: 11 }}
                                >
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
                                    const isPayer =
                                        split.userId === expense.paidBy;
                                    const isLast =
                                        idx === expense.splits.length - 1;
                                    const sub = isPayer
                                        ? t('groups.expense.splitLent', {
                                              amount: amountFmt(
                                                  expense.amount - split.amount,
                                              ),
                                          })
                                        : t('groups.expense.splitOwes', {
                                              name: payerFirstName,
                                          });
                                    return (
                                        <View
                                            key={split.id}
                                            className={`flex-row items-center px-3.5 py-3 ${isLast ? '' : 'border-b border-slate-100'}`}
                                        >
                                            <MemberAvatar
                                                name={name}
                                                avatarUrl={memberAvatarUrl(
                                                    memberMap,
                                                    split.userId,
                                                )}
                                                size="sm"
                                            />
                                            <View className="flex-1 mx-3 min-w-0">
                                                <View className="flex-row items-center">
                                                    <Text className="text-sm font-semibold text-gray-900">
                                                        {name}
                                                    </Text>
                                                    {isPayer && (
                                                        <View
                                                            className="ml-2 rounded"
                                                            style={{
                                                                backgroundColor:
                                                                    colors.primaryExtraLight,
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
                                                                {t(
                                                                    'groups.expense.paidBadge',
                                                                )}
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
                                                style={{
                                                    fontVariant: ['tabular-nums'],
                                                }}
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
            )}
        </View>
    );
}

const FLOW_SIDE_WIDTH = 96;

function FlowAmountCenter({
    amountText,
    flowCaption,
}: {
    amountText: string;
    flowCaption?: string;
}) {
    // Drive the chevron from the app language, not I18nManager.isRTL. On iOS,
    // I18nManager.isRTL only updates after a full app restart, so switching
    // language mid-session leaves them out of sync. FlowHeroRow forces the
    // visual side via an explicit `direction` style, so the chevron has to
    // follow the same source of truth to point at the right party.
    const isRtl = useRtlLayout();
    const chevronName: AppIconName = isRtl
        ? 'chevron-back'
        : 'chevron-forward';

    return (
        <View
            style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                paddingHorizontal: 4,
            }}
        >
            <Text
                style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                    letterSpacing: -0.2,
                    textAlign: 'center',
                    width: '100%',
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
                <View
                    style={{
                        flex: 1,
                        height: 2,
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        borderRadius: 9999,
                    }}
                />
            </View>
            {flowCaption ? (
                <Text
                    style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: 'rgba(255,255,255,0.9)',
                        textAlign: 'center',
                        marginTop: 4,
                        width: '100%',
                        textShadowColor: 'rgba(0,0,0,0.3)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                    }}
                    numberOfLines={2}
                >
                    {flowCaption}
                </Text>
            ) : null}
        </View>
    );
}

function FlowPerson({
    name,
    label,
    avatarUrl,
}: {
    name: string;
    label?: string;
    avatarUrl?: string;
}) {
    return (
        <View style={{ width: FLOW_SIDE_WIDTH, alignItems: 'center' }}>
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
                    <MemberAvatar
                        name={name}
                        avatarUrl={avatarUrl}
                        size="md"
                    />
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
            {label ? (
                <Text
                    style={{
                        fontSize: 9,
                        fontWeight: '700',
                        color: 'rgba(255,255,255,0.8)',
                        letterSpacing: 0.8,
                        marginTop: 2,
                        width: 96,
                        textAlign: 'center',
                    }}
                >
                    {label}
                </Text>
            ) : null}
        </View>
    );
}

function FlowSplitParty({
    members,
    singleName,
    singleAvatarUrl,
}: {
    members: GroupMemberLite[];
    singleName?: string;
    singleAvatarUrl?: string;
}) {
    if (members.length === 1 && singleName) {
        return (
            <FlowPerson
                name={singleName}
                avatarUrl={singleAvatarUrl}
            />
        );
    }

    return (
        <View style={{ width: FLOW_SIDE_WIDTH, alignItems: 'center' }}>
            <View
                style={{
                    padding: 3,
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    borderRadius: 9999,
                }}
            >
                <MemberStack members={members} maxWidth={84} />
            </View>
        </View>
    );
}

function FlowHeroRow({
    start,
    center,
    end,
    paddingTop = 0,
}: {
    start: React.ReactNode;
    center: React.ReactNode;
    end: React.ReactNode;
    paddingTop?: number;
}) {
    // Force the visual side from the app language. We can't rely on the
    // implicit `flexDirection: 'row'` auto-flip because `I18nManager.isRTL`
    // can lag behind the app language on iOS (it only updates on restart).
    // Setting `direction` explicitly keeps payer on the leading edge and
    // splits/recipient on the trailing edge regardless of `I18nManager` state.
    const isRtl = useRtlLayout();
    return (
        <View
            style={{
                flex: 1,
                flexDirection: 'row',
                direction: isRtl ? 'rtl' : 'ltr',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingTop,
                zIndex: 2,
            }}
        >
            <View style={{ width: FLOW_SIDE_WIDTH, alignItems: 'center' }}>
                {start}
            </View>
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {center}
            </View>
            <View style={{ width: FLOW_SIDE_WIDTH, alignItems: 'center' }}>
                {end}
            </View>
        </View>
    );
}

function ExpenseHero({
    expense,
    currentUserId,
    payerName,
    payerAvatarUrl,
    splitMembers,
    amountText,
    heroDate,
}: {
    expense: ExpenseWithDelta;
    currentUserId: string;
    payerName: string;
    payerAvatarUrl?: string;
    splitMembers: GroupMemberLite[];
    amountText: string;
    heroDate: string;
}) {
    const { t } = useTranslation();
    const perspective = resolveExpenseFeedPerspective(expense, currentUserId);
    const flowCaption =
        splitMembers.length > 0
            ? t(expenseFeedSummaryKey(perspective.perspective), {
                  count: expenseFeedSummaryCount(perspective),
              })
            : undefined;
    const categoryKey = expense.category ?? 'other';
    const baseColor = categoryBg[categoryKey] ?? categoryBg.other;

    const heroScrim = (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
            <LinearGradient
                colors={[
                    'rgba(0,0,0,0.22)',
                    'rgba(0,0,0,0.08)',
                    'rgba(0,0,0,0.08)',
                    'rgba(0,0,0,0.28)',
                ]}
                locations={[0, 0.35, 0.65, 1]}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );

    const heroChrome = (
        <>
            {heroScrim}
            {expense.category && (
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
                numberOfLines={2}
                style={{
                    position: 'absolute',
                    top: 36,
                    left: 14,
                    right: 14,
                    fontSize: 17,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.45)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                    zIndex: 2,
                }}
            >
                {expense.description}
            </Text>
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
            <FlowHeroRow
                paddingTop={52}
                start={
                    <FlowPerson
                        name={payerName}
                        avatarUrl={payerAvatarUrl}
                    />
                }
                center={
                    <FlowAmountCenter
                        amountText={amountText}
                        flowCaption={flowCaption}
                    />
                }
                end={
                    splitMembers.length > 0 ? (
                        <FlowSplitParty
                            members={splitMembers}
                            singleName={
                                splitMembers.length === 1
                                    ? splitMembers[0].displayName
                                    : undefined
                            }
                            singleAvatarUrl={
                                splitMembers.length === 1
                                    ? splitMembers[0].avatarUrl
                                    : undefined
                            }
                        />
                    ) : null
                }
            />
        </>
    );

    return (
        <View className="px-4 pt-1">
            <View
                className="rounded-2xl overflow-hidden border border-slate-200"
                style={{ height: 196, position: 'relative' }}
                testID="expense-detail-hero"
            >
                {expense.receiptUrl ? (
                    <>
                        <Image
                            source={{ uri: expense.receiptUrl }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                        />
                        {heroChrome}
                    </>
                ) : (
                    <LinearGradient
                        colors={[baseColor, '#374151']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    >
                        {heroChrome}
                    </LinearGradient>
                )}
            </View>
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
    settlement,
    currentUserId,
    fromName,
    toName,
    fromAvatarUrl,
    toAvatarUrl,
    amountText,
    heroDate,
}: {
    settlement: Settlement;
    currentUserId: string;
    fromName: string;
    toName: string;
    fromAvatarUrl?: string;
    toAvatarUrl?: string;
    amountText: string;
    heroDate: string;
}) {
    const { t } = useTranslation();
    const copy = buildSettlementFeedCopy(settlement, currentUserId);
    const flowCaption = t(copy.key);

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

                <FlowHeroRow
                    start={
                        <FlowPerson
                            name={fromName}
                            avatarUrl={fromAvatarUrl}
                        />
                    }
                    center={
                        <FlowAmountCenter
                            amountText={amountText}
                            flowCaption={flowCaption}
                        />
                    }
                    end={
                        <FlowPerson
                            name={toName}
                            avatarUrl={toAvatarUrl}
                        />
                    }
                />
            </View>
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
                settlement={settlement}
                currentUserId={currentUserId}
                fromName={fromName}
                toName={toName}
                fromAvatarUrl={memberAvatarUrl(
                    memberMap,
                    settlement.fromUserId,
                )}
                toAvatarUrl={memberAvatarUrl(memberMap, settlement.toUserId)}
                amountText={amountText}
                heroDate={heroDate}
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
