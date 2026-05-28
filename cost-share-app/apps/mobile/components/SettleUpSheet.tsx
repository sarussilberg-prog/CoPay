/**
 * SettleUpSheet — bottom-sheet form for recording / editing a settlement.
 * Design: docs/design_handoff_settle/README.md.
 *
 * Layout:
 *   ┌ Cancel · SETTLE UP · Save ────────────┐  (BottomSheetShell header)
 *   │ Emerald hero: From → amount → To       │
 *   │ Method tiles (Cash · Bank · PP · Other)│
 *   │ Date chip + "Record payment · USD X.XX"│  (bottom dock)
 *   └────────────────────────────────────────┘
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { GroupMemberLite, PairwiseDebt, PaymentMethod } from '@cost-share/shared';
import { Text } from './AppText';
import { MemberAvatar } from './MemberAvatar';
import { AppIcon } from './AppIcon';
import type { AppIconName } from './AppIcon';
import { BottomSheetShell } from './BottomSheetShell';
import { DatePickerPopup } from './expenseV2/DatePickerPopup';
import { rtlRowStyle, useRtlLayout } from '../hooks/useRtlLayout';
import { getAvatarUrlForMember } from '../lib/userDisplay';
import { openPaymentApp, type IsraeliPaymentApp } from '../lib/israeliPaymentLinks';
import { PaymentAppLogo } from './settleUp/PaymentAppLogo';

export interface SettleUpFormValues {
    fromUserId: string;
    toUserId: string;
    currency: string;
    amount: number;
    paymentMethod: PaymentMethod;
    settlementDate: Date;
}

interface SettleUpSheetProps {
    visible: boolean;
    members: GroupMemberLite[];
    pairwiseDebts: PairwiseDebt[];
    currentUserId: string;
    initial: {
        fromUserId: string;
        toUserId: string;
        currency: string;
        amount: number;
        paymentMethod?: PaymentMethod;
        settlementDate?: Date;
    };
    groupName?: string;
    mode: 'create' | 'edit';
    submitting?: boolean;
    onSubmit: (values: SettleUpFormValues) => Promise<void> | void;
    onClose: () => void;
}

type MethodKey = Extract<PaymentMethod, 'cash' | 'credit_card' | 'paypal'>;

const METHOD_TILES: ReadonlyArray<{ key: MethodKey; icon: AppIconName }> = [
    { key: 'cash', icon: 'cash-outline' },
    { key: 'credit_card', icon: 'card-outline' },
    { key: 'paypal', icon: 'logo-paypal' },
];

const PAYMENT_APPS: ReadonlyArray<IsraeliPaymentApp> = ['bit', 'paybox'];

const DEFAULT_METHOD: MethodKey = 'credit_card';

function normalizeMethodKey(method: PaymentMethod | undefined): MethodKey {
    if (method === 'cash' || method === 'credit_card' || method === 'paypal') {
        return method;
    }
    return DEFAULT_METHOD;
}

const formatAmountText = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '');
const formatShortDate = (d: Date, locale: string) =>
    d.toLocaleDateString(locale === 'he' ? 'he-IL' : locale, { month: 'short', day: 'numeric' });

/** Space for the fixed bottom dock (date chip + record button). */
const BOTTOM_DOCK_PADDING = 132;

export function SettleUpSheet({
    visible,
    members,
    pairwiseDebts: _pairwiseDebts,
    currentUserId: _currentUserId,
    initial,
    groupName,
    mode,
    submitting = false,
    onSubmit,
    onClose,
}: SettleUpSheetProps) {
    const { t, i18n } = useTranslation();
    const isRtl = useRtlLayout();

    const [fromUserId, setFromUserId] = useState(initial.fromUserId);
    const [toUserId, setToUserId] = useState(initial.toUserId);
    const [currency] = useState(initial.currency);
    const [amountText, setAmountText] = useState(formatAmountText(initial.amount));
    const [paymentMethod, setPaymentMethod] = useState<MethodKey>(
        normalizeMethodKey(initial.paymentMethod),
    );
    const [settlementDate, setSettlementDate] = useState<Date>(
        initial.settlementDate ?? new Date()
    );
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setFromUserId(initial.fromUserId);
        setToUserId(initial.toUserId);
        setAmountText(formatAmountText(initial.amount));
        setPaymentMethod(normalizeMethodKey(initial.paymentMethod));
        setSettlementDate(initial.settlementDate ?? new Date());
    }, [
        visible,
        initial.fromUserId,
        initial.toUserId,
        initial.amount,
        initial.paymentMethod,
        initial.settlementDate,
    ]);

    const parsedAmount = useMemo(() => {
        const n = parseFloat(amountText.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }, [amountText]);

    const memberById = useMemo(() => {
        const map = new Map<string, GroupMemberLite>();
        members.forEach(m => map.set(m.userId, m));
        return map;
    }, [members]);

    const fromMember = memberById.get(fromUserId);
    const toMember = memberById.get(toUserId);

    const recordDisabled =
        submitting || !Number.isFinite(parsedAmount) || parsedAmount <= 0;

    const handleSwap = useCallback(() => {
        setFromUserId(toUserId);
        setToUserId(fromUserId);
    }, [fromUserId, toUserId]);

    const handleSubmit = useCallback(async () => {
        if (recordDisabled) return;
        await onSubmit({
            fromUserId,
            toUserId,
            currency,
            amount: Number(parsedAmount.toFixed(2)),
            paymentMethod,
            settlementDate,
        });
    }, [
        recordDisabled,
        onSubmit,
        fromUserId,
        toUserId,
        currency,
        parsedAmount,
        paymentMethod,
        settlementDate,
    ]);

    const label = mode === 'edit' ? t('settleUp.edit') : t('settleUp.title');
    const formattedAmountForButton = Number.isFinite(parsedAmount)
        ? `${currency} ${parsedAmount.toFixed(2)}`
        : `${currency} 0.00`;

    return (
        <BottomSheetShell
            visible={visible}
            label={label}
            onClose={onClose}
            onSave={handleSubmit}
            saveDisabled={recordDisabled}
        >
            <View className="flex-1">
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: BOTTOM_DOCK_PADDING }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                >
                    <SettleUpHero
                        fromMember={fromMember}
                        toMember={toMember}
                        currency={currency}
                        amountText={amountText}
                        onAmountChange={setAmountText}
                        onSwap={handleSwap}
                        groupName={groupName}
                        isRtl={isRtl}
                    />

                    <PaymentMethodSection
                        selected={paymentMethod}
                        onSelect={setPaymentMethod}
                        isRtl={isRtl}
                    />
                </ScrollView>

                <SettleUpBottomDock
                    settlementDate={settlementDate}
                    locale={i18n.language}
                    onOpenDatePicker={() => setDatePickerOpen(true)}
                    onRecord={handleSubmit}
                    recordDisabled={recordDisabled}
                    label={t('settleUp.recordPaymentWithAmount', {
                        currencyAndAmount: formattedAmountForButton,
                    })}
                />

                <DatePickerPopup
                    visible={datePickerOpen}
                    initialDate={settlementDate}
                    onCancel={() => setDatePickerOpen(false)}
                    onConfirm={next => {
                        setSettlementDate(next);
                        setDatePickerOpen(false);
                    }}
                />

            </View>
        </BottomSheetShell>
    );
}

/* ----- Hero ---------------------------------------------------------------- */

interface SettleUpHeroProps {
    fromMember: GroupMemberLite | undefined;
    toMember: GroupMemberLite | undefined;
    currency: string;
    amountText: string;
    onAmountChange: (v: string) => void;
    onSwap: () => void;
    groupName?: string;
    isRtl: boolean;
}

function SettleUpHero({
    fromMember,
    toMember,
    currency,
    amountText,
    onAmountChange,
    onSwap,
    groupName,
    isRtl,
}: SettleUpHeroProps) {
    const { t } = useTranslation();
    return (
        <View className="mx-4 mt-3 rounded-2xl overflow-hidden border border-success-border">
            <LinearGradient
                colors={['#10B981', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 196 }}
            >
                <View className="flex-row items-center justify-between px-3 pt-2">
                    <View
                        className="flex-row items-center px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                    >
                        <AppIcon name="checkmark-circle" size={12} color="#FFFFFF" />
                        <Text className="text-white text-[11px] font-semibold ms-1">
                            {t('settleUp.newPayment')}
                        </Text>
                    </View>
                    {groupName ? (
                        <Text
                            className="text-[11px] font-medium"
                            style={{
                                color: 'rgba(255,255,255,0.92)',
                                textShadowColor: 'rgba(0,0,0,0.4)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 2,
                            }}
                            numberOfLines={1}
                        >
                            {groupName}
                        </Text>
                    ) : null}
                </View>

                <View className="flex-1 flex-row items-center justify-between px-3">
                    <FlowAvatar member={fromMember} label={t('settleUp.from')} />

                    <View className="flex-1 items-center">
                        <View
                            className="flex-row items-baseline rounded-xl px-3 py-1"
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.14)',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.32)',
                            }}
                        >
                            <Text
                                className="text-[11px] font-bold me-1.5"
                                style={{
                                    color: 'rgba(255,255,255,0.78)',
                                    letterSpacing: 0.04 * 11,
                                }}
                            >
                                {currency}
                            </Text>
                            <AppIcon name="chevron-down" size={10} color="rgba(255,255,255,0.78)" />
                            <TextInput
                                value={amountText}
                                onChangeText={onAmountChange}
                                keyboardType="decimal-pad"
                                selectionColor="#FFFFFF"
                                style={{
                                    color: '#FFFFFF',
                                    fontSize: 26,
                                    fontWeight: '700',
                                    fontVariant: ['tabular-nums'],
                                    letterSpacing: -0.02 * 26,
                                    marginStart: 6,
                                    minWidth: 80,
                                    padding: 0,
                                    textAlign: 'center',
                                }}
                                testID="settle-amount-input"
                            />
                        </View>

                        <View className="flex-row items-center mt-2 w-3/4">
                            <View className="flex-1 h-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.85)' }} />
                            <AppIcon
                                name={isRtl ? 'chevron-back' : 'chevron-forward'}
                                size={18}
                                color="rgba(255,255,255,0.95)"
                            />
                        </View>

                        <Pressable
                            onPress={onSwap}
                            testID="settle-swap-chip"
                            className="flex-row items-center mt-2 rounded-full px-2 py-0.5"
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.18)',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.35)',
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={t('settleUp.swap')}
                        >
                            <AppIcon name="swap-horizontal-outline" size={11} color="#FFFFFF" />
                            <Text className="text-white text-[10px] font-bold ms-1">
                                {t('settleUp.swap')}
                            </Text>
                        </Pressable>
                    </View>

                    <FlowAvatar member={toMember} label={t('settleUp.to')} />
                </View>
            </LinearGradient>
        </View>
    );
}

function FlowAvatar({ member, label }: { member: GroupMemberLite | undefined; label: string }) {
    return (
        <View style={{ width: 96 }} className="items-center">
            <View
                style={{
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    borderRadius: 999,
                    shadowColor: '#FFFFFF',
                    shadowOpacity: 0.25,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 0 },
                }}
            >
                <MemberAvatar
                    name={member?.displayName ?? '?'}
                    avatarUrl={getAvatarUrlForMember(member)}
                    pixelSize={44}
                />
            </View>
            <Text
                className="text-[13px] font-bold text-white mt-1"
                style={{
                    textShadowColor: 'rgba(0,0,0,0.35)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                }}
                numberOfLines={1}
            >
                {member?.displayName ?? ''}
            </Text>
            <Text
                className="text-[9px] font-bold uppercase mt-0.5"
                style={{ color: 'rgba(255,255,255,0.8)', letterSpacing: 0.08 * 9 }}
            >
                {label}
            </Text>
        </View>
    );
}

/* ----- Payment method + app launchers -------------------------------------- */

interface PaymentMethodSectionProps {
    selected: MethodKey;
    onSelect: (m: MethodKey) => void;
    isRtl: boolean;
}

function PaymentMethodSection({ selected, onSelect, isRtl }: PaymentMethodSectionProps) {
    const { t } = useTranslation();
    const showAppLaunchers = Platform.OS === 'ios' || Platform.OS === 'android';

    return (
        <View className="px-4 pt-5 self-stretch">
            {showAppLaunchers ? (
                <>
                    <SectionLabel
                        isRtl={isRtl}
                        title={t('settleUp.paymentApps')}
                        subtitle={t('settleUp.paymentAppsSubtitle')}
                    />
                    <PaymentAppTiles t={t} isRtl={isRtl} />
                    <View
                        className="my-4 self-stretch"
                        style={{
                            height: 1,
                            backgroundColor: '#E5E7EB',
                        }}
                    />
                </>
            ) : null}

            <SectionLabel isRtl={isRtl} title={t('settleUp.methodType')} />
            <MethodTiles selected={selected} onSelect={onSelect} t={t} isRtl={isRtl} />
        </View>
    );
}

function SectionLabel({
    title,
    subtitle,
    isRtl: _isRtl,
}: {
    title: string;
    subtitle?: string;
    isRtl: boolean;
}) {
    return (
        <View className="mb-2.5 self-stretch">
            <Text className="text-[11px] font-bold text-gray-600">{title}</Text>
            {subtitle ? (
                <Text className="text-[11px] text-gray-400 mt-0.5">{subtitle}</Text>
            ) : null}
        </View>
    );
}

interface MethodTilesProps {
    selected: MethodKey;
    onSelect: (m: MethodKey) => void;
    t: (key: string) => string;
    isRtl: boolean;
}

function MethodTiles({ selected, onSelect, t, isRtl }: MethodTilesProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <View style={[rtlRowStyle(isRtl), { gap: 10 }]}>
                {METHOD_TILES.map(({ key, icon }) => {
                    const isSelected = key === selected;
                    const label = t(`balances.methods.${key}`);
                    return (
                        <Pressable
                            key={key}
                            onPress={() => onSelect(key)}
                            testID={`method-tile-${key}`}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            style={{ alignItems: 'center', width: 64 }}
                        >
                            <View
                                style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 14,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: isSelected ? 2 : 1,
                                    borderColor: isSelected ? '#3B82F6' : '#E5E7EB',
                                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                                }}
                            >
                                <AppIcon
                                    name={icon}
                                    size={22}
                                    color={isSelected ? '#3B82F6' : '#374151'}
                                />
                            </View>
                            <Text
                                className="text-[10px] font-semibold text-gray-600 mt-1"
                                style={{ textAlign: 'center' }}
                                numberOfLines={1}
                            >
                                {label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </ScrollView>
    );
}

function PaymentAppTiles({ t, isRtl }: { t: (key: string) => string; isRtl: boolean }) {
    const handleOpenApp = useCallback(
        async (app: IsraeliPaymentApp) => {
            try {
                await openPaymentApp(app);
            } catch {
                Alert.alert(t('settleUp.paymentAppErrorTitle'), t('settleUp.paymentAppOpenFailed'));
            }
        },
        [t],
    );

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <View style={[rtlRowStyle(isRtl), { gap: 12 }]}>
                {PAYMENT_APPS.map((key) => {
                    const appLabel = t(`settleUp.paymentAppLabels.${key}`);
                    const isPaybox = key === 'paybox';
                    return (
                        <Pressable
                            key={key}
                            onPress={() => void handleOpenApp(key)}
                            testID={`payment-app-tile-${key}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('settleUp.openPaymentApp', { app: appLabel })}
                            style={{ alignItems: 'center', width: 72 }}
                        >
                            <View
                                style={{
                                    width: 72,
                                    height: 72,
                                    borderRadius: 16,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: isPaybox ? 0 : 1,
                                    borderColor: '#E5E7EB',
                                    backgroundColor: isPaybox ? '#5BC8F5' : '#FFFFFF',
                                    overflow: 'hidden',
                                    shadowColor: '#000',
                                    shadowOpacity: 0.06,
                                    shadowRadius: 8,
                                    shadowOffset: { width: 0, height: 2 },
                                }}
                            >
                                {isPaybox ? (
                                    <PaymentAppLogo app={key} size={72} />
                                ) : (
                                    <PaymentAppLogo app={key} size={56} />
                                )}
                            </View>
                            {!isPaybox ? (
                                <Text
                                    className="text-[10px] font-semibold text-gray-600 mt-1"
                                    numberOfLines={1}
                                >
                                    {appLabel}
                                </Text>
                            ) : null}
                        </Pressable>
                    );
                })}
            </View>
        </ScrollView>
    );
}

/* ----- Bottom dock --------------------------------------------------------- */

interface SettleUpBottomDockProps {
    settlementDate: Date;
    locale: string;
    onOpenDatePicker: () => void;
    onRecord: () => void;
    recordDisabled: boolean;
    label: string;
}

function SettleUpBottomDock({
    settlementDate,
    locale,
    onOpenDatePicker,
    onRecord,
    recordDisabled,
    label,
}: SettleUpBottomDockProps) {
    return (
        <View
            className="absolute bottom-0 bg-white/95 border-t border-border-soft"
            style={{
                left: 0,
                right: 0,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 22,
            }}
        >
            <View className="items-center mb-2">
                <Pressable
                    onPress={onOpenDatePicker}
                    className="flex-row items-center bg-white border border-border-card rounded-full px-3 py-1"
                    style={{
                        shadowColor: '#000',
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                        shadowOffset: { width: 0, height: 1 },
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={formatShortDate(settlementDate, locale)}
                    testID="settle-date-chip"
                >
                    <AppIcon name="calendar-outline" size={13} color="#4B5563" />
                    <Text className="text-[12px] font-semibold text-gray-500" style={{ marginHorizontal: 6 }}>
                        {formatShortDate(settlementDate, locale)}
                    </Text>
                    <AppIcon name="chevron-down" size={11} color="#6B7280" />
                </Pressable>
            </View>

            <Pressable
                onPress={onRecord}
                disabled={recordDisabled}
                testID="settle-record-button"
                accessibilityRole="button"
                accessibilityLabel={label}
                className={
                    recordDisabled
                        ? 'flex-row items-center justify-center rounded-2xl bg-gray-200 px-5 py-3.5'
                        : 'flex-row items-center justify-center rounded-2xl bg-primary px-5 py-3.5'
                }
                style={
                    recordDisabled
                        ? undefined
                        : {
                              shadowColor: '#3B82F6',
                              shadowOpacity: 0.35,
                              shadowRadius: 16,
                              shadowOffset: { width: 0, height: 6 },
                          }
                }
            >
                <AppIcon
                    name="checkmark-circle"
                    size={20}
                    color={recordDisabled ? '#9CA3AF' : '#FFFFFF'}
                />
                <Text
                    className={
                        recordDisabled
                            ? 'text-[16px] font-bold text-gray-400 ms-2'
                            : 'text-[16px] font-bold text-white ms-2'
                    }
                >
                    {label}
                </Text>
            </Pressable>
        </View>
    );
}
