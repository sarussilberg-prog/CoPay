import { Text } from '../AppText';
import React from 'react';
import { View, Modal, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Language } from '@cost-share/shared';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    visible: boolean;
    current: Language;
    onSelect: (lang: Language) => void;
    onClose: () => void;
}

const OPTIONS: { code: Language; labelKey: string }[] = [
    { code: 'en', labelKey: 'profile.english' },
    { code: 'he', labelKey: 'profile.hebrew' },
];

export function LanguageSheet({ visible, current, onSelect, onClose }: Props) {
    const { t } = useTranslation();
    if (!visible) return null;
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose}>
                <Pressable onPress={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl absolute bottom-0 inset-x-0">
                    <View className="items-center pt-2 pb-1">
                        <View className="w-10 h-1 bg-gray-300 rounded-full" />
                    </View>
                    <Text className="text-lg font-bold text-gray-900 px-5 mt-2 mb-2">{t('settings.language')}</Text>
                    {OPTIONS.map(opt => (
                        <TouchableOpacity
                            key={opt.code}
                            onPress={() => onSelect(opt.code)}
                            className="flex-row items-center px-5 py-4 border-t border-gray-100"
                        >
                            <Text className="flex-1 text-base text-gray-900">{t(opt.labelKey)}</Text>
                            {opt.code === current ? <AppIcon name="checkmark" size={20} color={colors.primary} /> : null}
                        </TouchableOpacity>
                    ))}
                    <View className="h-6" />
                </Pressable>
            </Pressable>
        </Modal>
    );
}
