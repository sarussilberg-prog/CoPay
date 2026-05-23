import React from 'react';
import { Modal, View, TouchableOpacity } from 'react-native';
import { Text } from './AppText';
import { getSupportEmail } from '../lib/openMailto';

interface DeletedAccountNoticeDialogProps {
    visible: boolean;
    title: string;
    message: string;
    closeLabel: string;
    contactLabel: string;
    onClose: () => void;
    onContact: () => void;
}

export function DeletedAccountNoticeDialog({
    visible,
    title,
    message,
    closeLabel,
    contactLabel,
    onClose,
    onContact,
}: DeletedAccountNoticeDialogProps) {
    const supportEmail = getSupportEmail();

    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
                    <Text className="text-xl font-bold text-gray-900 mb-2">{title}</Text>
                    <Text className="text-base text-gray-600 mb-3">{message}</Text>
                    <Text
                        className="text-sm text-primary font-medium mb-6"
                        selectable
                        testID="deleted-account-support-email"
                    >
                        {supportEmail}
                    </Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={onClose}
                            className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
                            accessibilityRole="button"
                        >
                            <Text className="text-base font-semibold text-gray-700">{closeLabel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onContact}
                            className="flex-1 py-3 rounded-xl bg-primary items-center"
                            accessibilityRole="button"
                            testID="deleted-account-contact-support"
                        >
                            <Text className="text-base font-semibold text-white">{contactLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
