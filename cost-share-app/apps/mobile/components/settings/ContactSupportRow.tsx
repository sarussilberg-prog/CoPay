import React, { useCallback } from 'react';
import { Platform, TouchableOpacity, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Text } from '../AppText';
import { AppIcon } from '../AppIcon';
import { colors } from '../../theme';
import { getSupportEmail, getSupportMailtoUrl, openSupportContact } from '../../lib/openMailto';

function RowContent({ label }: { label: string }) {
    return (
        <View className="flex-row items-center bg-white px-4 py-3.5 min-h-[52px]">
            <AppIcon name="mail-outline" size={22} color={colors.gray500} />
            <Text className="flex-1 ms-3 text-base text-gray-900">{label}</Text>
            <AppIcon name="chevron-forward" size={18} color={colors.gray400} />
        </View>
    );
}

export function ContactSupportRow() {
    const { t } = useTranslation();
    const label = t('settings.contactUs');
    const mailto = getSupportMailtoUrl();

    const handlePress = useCallback(async () => {
        const email = getSupportEmail();
        try {
            await openSupportContact();
        } catch {
            Alert.alert(t('settings.contactUs'), email, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('settings.copyEmail'),
                    onPress: () => {
                        void Clipboard.setStringAsync(email).then(() => {
                            Toast.show({ type: 'success', text1: t('settings.contactEmailCopied') });
                        });
                    },
                },
            ]);
        }
    }, [t]);

    if (Platform.OS === 'web') {
        return (
            <View testID="settings-contact-row">
                {React.createElement(
                    'a',
                    {
                        href: mailto,
                        style: { display: 'block', textDecoration: 'none', color: 'inherit' },
                    },
                    <RowContent label={label} />,
                )}
            </View>
        );
    }

    return (
        <TouchableOpacity onPress={handlePress} testID="settings-contact-row">
            <RowContent label={label} />
        </TouchableOpacity>
    );
}
