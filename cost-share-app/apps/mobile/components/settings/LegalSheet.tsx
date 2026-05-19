import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    title: string;
    body: string;
    onClose: () => void;
}

export function LegalSheet({ visible, title, body, onClose }: Props) {
    const { t } = useTranslation();
    if (!visible) return null;
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
                    <Text className="text-xl font-bold text-gray-900 px-5 mt-2">{title}</Text>
                    <ScrollView className="px-5 mt-3">
                        <Text className="text-base text-gray-700 leading-6 mb-6">{body}</Text>
                    </ScrollView>
                    <TouchableOpacity onPress={onClose} className="bg-primary mx-5 mb-5 mt-2 py-4 rounded-xl">
                        <Text className="text-white text-center font-semibold">{t('legal.close')}</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
