import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Pressable,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    expectedEmail: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

function normalize(s: string): string {
    return s.trim().toLowerCase();
}

export function DeleteAccountConfirmSheet({ visible, expectedEmail, onClose, onConfirm }: Props) {
    const { t } = useTranslation();
    const [typed, setTyped] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!visible) return null;

    const isMatch = normalize(typed) === normalize(expectedEmail);
    const canSubmit = isMatch && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setTyped('');
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <Pressable className="flex-1 bg-black/40" onPress={handleClose}>
                <Pressable
                    onPress={(e) => e?.stopPropagation()}
                    className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0"
                >
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-xl font-bold text-gray-900 px-5 mt-2 mb-1">
                        {t('deleteAccount.confirmTitle')}
                    </Text>
                    <Text className="text-sm text-gray-500 px-5 mb-1">
                        {t('deleteAccount.typeEmailHint')}
                    </Text>
                    <Text selectable className="text-sm font-medium text-gray-800 px-5 mb-3">
                        {expectedEmail}
                    </Text>
                    <TextInput
                        value={typed}
                        onChangeText={setTyped}
                        placeholder={t('profile.email')}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        editable={!submitting}
                        className="mx-5 mb-4 px-3 py-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900"
                    />
                    <TouchableOpacity
                        testID="delete-account-confirm-btn"
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        className={`mx-5 mb-3 rounded-xl py-4 ${canSubmit ? 'bg-red-500' : 'bg-red-200'}`}
                    >
                        {submitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-center font-semibold text-white">
                                {t('deleteAccount.deleteBtn')}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClose} disabled={submitting} className="mx-5 mb-6">
                        <Text className="text-center text-sm text-gray-500">{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
