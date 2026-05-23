/**
 * SettleUpSheet — bottom sheet form for recording / editing a settlement.
 * Fields: payer, receiver, currency, amount. Warns on partial / overpay but
 * never blocks submission unless amount <= 0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Modal,
    Pressable,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { GroupMemberLite, PairwiseDebt } from '@cost-share/shared';
import { Text } from './AppText';
import { MemberAvatar } from './MemberAvatar';
import { Button } from './Button';
import { resolveAutoTextInputStyle, useRtlLayout } from '../hooks/useRtlLayout';
import { getAvatarUrlForMember } from '../lib/userDisplay';

export interface SettleUpFormValues {
    fromUserId: string;
    toUserId: string;
    currency: string;
    amount: number;
}

interface SettleUpSheetProps {
    visible: boolean;
    members: GroupMemberLite[];
    pairwiseDebts: PairwiseDebt[];
    currentUserId: string;
    /** Pre-fill payer/receiver/currency/amount. Required for v1. */
    initial: {
        fromUserId: string;
        toUserId: string;
        currency: string;
        amount: number;
    };
    /** "edit" hides the swap arrow; "create" allows row-pick semantics. */
    mode: 'create' | 'edit';
    submitting?: boolean;
    onSubmit: (values: SettleUpFormValues) => Promise<void> | void;
    onClose: () => void;
}

const formatAmount = (n: number) =>
    Number.isFinite(n) ? n.toFixed(2) : '';

export function SettleUpSheet({
    visible,
    members,
    pairwiseDebts,
    currentUserId: _currentUserId,
    initial,
    mode,
    submitting = false,
    onSubmit,
    onClose,
}: SettleUpSheetProps) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();

    const [fromUserId, setFromUserId] = useState(initial.fromUserId);
    const [toUserId, setToUserId] = useState(initial.toUserId);
    const [currency, setCurrency] = useState(initial.currency);
    const [amountText, setAmountText] = useState(formatAmount(initial.amount));

    useEffect(() => {
        if (visible) {
            setFromUserId(initial.fromUserId);
            setToUserId(initial.toUserId);
            setCurrency(initial.currency);
            setAmountText(formatAmount(initial.amount));
        }
    }, [visible, initial.fromUserId, initial.toUserId, initial.currency, initial.amount]);

    const parsedAmount = useMemo(() => {
        const n = parseFloat(amountText.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }, [amountText]);

    const memberById = useMemo(() => {
        const map = new Map<string, GroupMemberLite>();
        members.forEach(m => map.set(m.userId, m));
        return map;
    }, [members]);

    const availableCurrencies = useMemo(() => {
        const set = new Set<string>();
        set.add(initial.currency);
        pairwiseDebts
            .filter(d => d.fromUserId === fromUserId && d.toUserId === toUserId)
            .forEach(d => set.add(d.currency));
        return Array.from(set);
    }, [pairwiseDebts, fromUserId, toUserId, initial.currency]);

    const findSuggestedAmount = useCallback(
        (cur: string) =>
            pairwiseDebts.find(
                d =>
                    d.fromUserId === fromUserId &&
                    d.toUserId === toUserId &&
                    d.currency === cur,
            )?.amount ?? 0,
        [pairwiseDebts, fromUserId, toUserId],
    );

    const suggestedAmount = useMemo(
        () => findSuggestedAmount(currency),
        [findSuggestedAmount, currency],
    );

    const handleCurrencyChange = useCallback(
        (code: string) => {
            setCurrency(code);
            setAmountText(formatAmount(findSuggestedAmount(code)));
        },
        [findSuggestedAmount],
    );

    const fromMember = memberById.get(fromUserId);
    const toMember = memberById.get(toUserId);
    const submitDisabled = submitting || !Number.isFinite(parsedAmount) || parsedAmount <= 0;

    const showPartialWarn =
        suggestedAmount > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount < suggestedAmount - 0.001;
    const showOverpayWarn =
        Number.isFinite(parsedAmount) && parsedAmount > suggestedAmount + 0.001;

    const remaining = Math.max(suggestedAmount - parsedAmount, 0);
    const flipAmount = Math.max(parsedAmount - suggestedAmount, 0);

    const handleSwap = () => {
        if (mode !== 'edit') return;
        setFromUserId(toUserId);
        setToUserId(fromUserId);
    };

    const handleSubmit = async () => {
        if (submitDisabled) return;
        await onSubmit({
            fromUserId,
            toUserId,
            currency,
            amount: Number(parsedAmount.toFixed(2)),
        });
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable onPress={onClose} className="flex-1 bg-black/40 justify-end">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pt-4 pb-8">
                        <View className="items-center mb-3">
                            <View className="w-10 h-1 rounded-full bg-gray-300" />
                        </View>

                        <Text className="text-lg font-semibold text-gray-900 mb-4 text-center">
                            {mode === 'edit' ? t('settleUp.edit') : t('settleUp.title')}
                        </Text>

                        <View className="flex-row items-center justify-between mb-5">
                            <View className="items-center flex-1">
                                <Text className="text-xs text-gray-500 mb-2">
                                    {t('settleUp.payer')}
                                </Text>
                                <MemberAvatar
                                    name={fromMember?.displayName ?? '?'}
                                    avatarUrl={getAvatarUrlForMember(fromMember)}
                                    size="lg"
                                />
                                <Text className="text-sm font-medium text-gray-900 mt-2" numberOfLines={1}>
                                    {fromMember?.displayName ?? ''}
                                </Text>
                            </View>

                            <TouchableOpacity
                                onPress={handleSwap}
                                accessibilityRole="button"
                                accessibilityLabel="Swap payer and receiver"
                                disabled={mode !== 'edit'}
                                className="px-3"
                            >
                                <Text className="text-2xl text-gray-400">→</Text>
                            </TouchableOpacity>

                            <View className="items-center flex-1">
                                <Text className="text-xs text-gray-500 mb-2">
                                    {t('settleUp.receiver')}
                                </Text>
                                <MemberAvatar
                                    name={toMember?.displayName ?? '?'}
                                    avatarUrl={getAvatarUrlForMember(toMember)}
                                    size="lg"
                                />
                                <Text className="text-sm font-medium text-gray-900 mt-2" numberOfLines={1}>
                                    {toMember?.displayName ?? ''}
                                </Text>
                            </View>
                        </View>

                        <View className="mb-3">
                            <Text className="text-sm font-medium text-gray-700 mb-2">
                                {t('settleUp.currency')}
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 2 }}
                            >
                                {availableCurrencies.map(code => {
                                    const selected = code === currency;
                                    return (
                                        <TouchableOpacity
                                            key={code}
                                            onPress={() => handleCurrencyChange(code)}
                                            className={`rounded-xl px-4 py-2 mr-2 border ${
                                                selected
                                                    ? 'bg-primary-extra-light border-primary'
                                                    : 'bg-white border-gray-200'
                                            }`}
                                            testID={`settle-currency-${code}`}
                                        >
                                            <Text
                                                className={`text-sm font-semibold ${
                                                    selected ? 'text-primary-dark' : 'text-gray-700'
                                                }`}
                                            >
                                                {code}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        <View className="mb-2">
                            <Text className="text-sm font-medium text-gray-700 mb-2">
                                {t('settleUp.amount')}
                            </Text>
                            <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-4 py-3">
                                <Text className="text-base font-semibold text-gray-700 mr-2">
                                    {currency}
                                </Text>
                                <TextInput
                                    value={amountText}
                                    onChangeText={setAmountText}
                                    placeholder="0.00"
                                    placeholderTextColor="#9CA3AF"
                                    keyboardType="decimal-pad"
                                    style={resolveAutoTextInputStyle(isRtl, { flex: 1, fontSize: 16 })}
                                    testID="settle-amount-input"
                                />
                            </View>
                        </View>

                        <View style={{ minHeight: 32 }} className="mb-2">
                            {showPartialWarn && (
                                <Text className="text-xs text-amber-600" testID="settle-partial-warn">
                                    {t('settleUp.warnPartial', {
                                        remaining: `${currency} ${remaining.toFixed(2)}`,
                                    })}
                                </Text>
                            )}
                            {showOverpayWarn && (
                                <Text className="text-xs text-amber-600" testID="settle-overpay-warn">
                                    {t('settleUp.warnOverpay', {
                                        flipAmount: `${currency} ${flipAmount.toFixed(2)}`,
                                    })}
                                </Text>
                            )}
                        </View>

                        <View className="mt-4 gap-2">
                            <Button
                                title={mode === 'edit' ? t('common.save') : t('settleUp.submit')}
                                onPress={handleSubmit}
                                disabled={submitDisabled}
                                loading={submitting}
                            />
                            <Button
                                title={t('common.cancel')}
                                onPress={onClose}
                                variant="outline"
                            />
                        </View>
                    </Pressable>
                </KeyboardAvoidingView>
            </Pressable>
        </Modal>
    );
}
