import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import type { OpenBalancesSummary } from '../../services/account.service';

interface Props {
    visible: boolean;
    onClose: () => void;
    onContinue: () => void;
    onSettleUp?: () => void;
    openBalances?: OpenBalancesSummary | null;
}

const SUPPORT_EMAIL = 'sarussilberg@gmail.com';

const BULLET_KEYS = [
    'deleteAccount.warningBullet1',
    'deleteAccount.warningBullet2',
    'deleteAccount.warningBullet3',
    'deleteAccount.warningBullet4',
];

export function DeleteAccountWarningSheet({
    visible,
    onClose,
    onContinue,
    onSettleUp,
    openBalances,
}: Props) {
    const { t } = useTranslation();
    if (!visible) return null;

    const showBalanceBanner = openBalances?.hasOpenBalances === true;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                    style={{ maxHeight: '85%' }}
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-xl font-bold text-red-600 px-5 mt-2 mb-3">
                        {t('deleteAccount.warningTitle')}
                    </Text>

                    {showBalanceBanner && (
                        <View
                            className="mx-5 mb-3 p-3 rounded-xl bg-red-50 border border-red-200"
                            testID="delete-account-balance-banner"
                        >
                            <Text className="text-sm font-semibold text-red-700 mb-1">
                                {t('deleteAccount.openBalancesWarningTitle')}
                            </Text>
                            <Text className="text-sm text-red-700 leading-5">
                                {t('deleteAccount.openBalancesWarningBody')}
                            </Text>
                            <TouchableOpacity
                                onPress={onSettleUp}
                                testID="delete-account-settle-up-btn"
                                className="mt-3 self-start px-3 py-2 rounded-lg bg-red-600"
                            >
                                <Text className="text-white text-sm font-semibold">
                                    {t('deleteAccount.openBalancesCta')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <ScrollView className="px-5">
                        {BULLET_KEYS.map((key) => (
                            <View key={key} className="flex-row items-start mb-3">
                                <AppIcon name="alert-circle-outline" size={18} color={colors.error} />
                                <Text className="flex-1 ms-2 text-base text-gray-700 leading-6">
                                    {t(key, { email: SUPPORT_EMAIL })}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                    <View className="flex-row gap-3 px-5 my-5">
                        <TouchableOpacity onPress={onClose} className="flex-1 bg-gray-100 rounded-xl py-4">
                            <Text className="text-center font-semibold text-gray-700">{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onContinue} className="flex-1 bg-red-500 rounded-xl py-4">
                            <Text className="text-center font-semibold text-white">{t('deleteAccount.continueBtn')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
