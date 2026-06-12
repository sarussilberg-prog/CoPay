import React from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';

interface Props {
    mode: 'soft-ask' | 'open-settings';
    onEnable: () => void;
    onDismiss: () => void;
}

export function EnableNotificationsBanner({ mode, onEnable, onDismiss }: Props) {
    const { t } = useTranslation();
    const primary = mode === 'soft-ask' ? onEnable : () => { void Linking.openSettings(); };
    const label = mode === 'soft-ask' ? t('notifications.primingEnable') : t('notifications.openSettings');
    const body = mode === 'soft-ask' ? t('notifications.primingBody') : t('notifications.systemDisabled');

    return (
        <View className="mx-4 my-2 rounded-2xl bg-white p-4 flex-row items-center">
            <AppIcon name="notifications-outline" size={22} color={colors.primary} />
            <View className="flex-1 ms-3">
                <Text className="text-sm text-gray-900">{body}</Text>
                <TouchableOpacity onPress={primary} className="mt-1">
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>{label}</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onDismiss} testID="banner-dismiss">
                <AppIcon name="close" size={18} color={colors.gray400} />
            </TouchableOpacity>
        </View>
    );
}
