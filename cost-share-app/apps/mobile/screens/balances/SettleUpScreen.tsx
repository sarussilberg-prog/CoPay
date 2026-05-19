/**
 * SettleUpScreen
 * Form to record a settlement/payment between users
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PaymentMethod, DEFAULT_CURRENCY } from '@cost-share/shared';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { createSettlement } from '../../services/settlements.service';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';

const paymentMethods: { key: PaymentMethod; emoji: string }[] = [
    { key: 'cash', emoji: '💵' },
    { key: 'bank_transfer', emoji: '🏦' },
    { key: 'venmo', emoji: '📱' },
    { key: 'paypal', emoji: '💳' },
    { key: 'credit_card', emoji: '💳' },
    { key: 'other', emoji: '📋' },
];

export function SettleUpScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { groupId, fromUserId, toUserId, amount: defaultAmount, currency } = route.params;
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore((state) => state.currentUser);

    const [amount, setAmount] = useState(defaultAmount?.toString() || '');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [amountError, setAmountError] = useState('');

    const validateForm = (): boolean => {
        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            setAmountError(t('expenses.invalidAmount'));
            return false;
        }
        setAmountError('');
        return true;
    };

    const handleSettle = async () => {
        if (!validateForm()) return;
        if (!currentUser) return;

        startLoading();
        const result = await createSettlement({
            groupId,
            fromUserId,
            toUserId,
            amount: parseFloat(amount),
            currency: currency || DEFAULT_CURRENCY,
            paymentMethod,
        });
        stopLoading();

        if (result) {
            navigation.goBack();
        }
    };

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="p-4">
                {/* Settlement Info */}
                <View className="bg-primary-extra-light rounded-xl p-4 mb-6 items-center">
                    <Text className="text-lg font-semibold text-primary-dark">
                        {t('balances.recordPayment')}
                    </Text>
                </View>

                {/* Amount */}
                <Input
                    label={t('expenses.amount')}
                    placeholder="0.00"
                    value={amount}
                    onChangeText={(text) => {
                        setAmount(text);
                        if (amountError) setAmountError('');
                    }}
                    error={amountError}
                    keyboardType="decimal-pad"
                />

                {/* Payment Method */}
                <View className="mb-4">
                    <Text className="text-sm font-medium text-gray-700 mb-2">
                        {t('balances.paymentMethod')}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                        {paymentMethods.map((pm) => (
                            <View
                                key={pm.key}
                                className={`rounded-xl px-4 py-2 ${paymentMethod === pm.key
                                    ? 'bg-primary-extra-light border border-primary'
                                    : 'bg-white border border-gray-200'
                                    }`}
                            >
                                <Button
                                    title={`${pm.emoji} ${t(`balances.methods.${pm.key}`)}`}
                                    onPress={() => setPaymentMethod(pm.key)}
                                    variant={paymentMethod === pm.key ? 'secondary' : 'outline'}
                                    fullWidth={false}
                                    className="py-1 px-2"
                                />
                            </View>
                        ))}
                    </View>
                </View>

                {/* Submit */}
                <View className="mt-4 gap-2">
                    <Button
                        title={t('groups.settleUp')}
                        onPress={handleSettle}
                        loading={isLoading}
                        disabled={isLoading}
                    />
                    <Button
                        title={t('common.cancel')}
                        onPress={() => navigation.goBack()}
                        variant="outline"
                    />
                </View>
            </View>
        </ScrollView>
    );
}
