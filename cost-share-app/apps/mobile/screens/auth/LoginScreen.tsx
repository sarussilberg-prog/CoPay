/**
 * LoginScreen
 * Authentication screen with Google sign-in
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, Alert, Modal } from 'react-native';
import { AppIcon } from '../../components/AppIcon';
import { AppLogo } from '../../components/AppLogo';
import { AppBrandTitle } from '../../components/AppBrandTitle';
import { DeletedAccountNoticeDialog } from '../../components/DeletedAccountNoticeDialog';
import { colors } from '../../theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLoading } from '../../hooks/useLoading';
import { signInWithGoogle } from '../../services/auth.service';
import { Button } from '../../components/Button';
import Toast from 'react-native-toast-message';
import { changeLanguage } from '../../i18n';
import { useAppStore } from '../../store';
import {
    clearDeactivationNoticePending,
    consumeDeactivationNoticePending,
} from '../../lib/deactivationNoticeStorage';
import { getSupportEmail, openSupportContact } from '../../lib/openMailto';

export function LoginScreen() {
    const { t } = useTranslation();
    const language = useAppStore((state) => state.language);
    const setLanguage = useAppStore((state) => state.setLanguage);
    const pendingDeactivationNotice = useAppStore((state) => state.pendingDeactivationNotice);
    const setPendingDeactivationNotice = useAppStore((state) => state.setPendingDeactivationNotice);
    const { isLoading, startLoading, stopLoading } = useLoading();
    const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
    const [deletedNoticeVisible, setDeletedNoticeVisible] = useState(false);

    const supportEmail = getSupportEmail();
    const deletedNoticeMessage = t('deleteAccount.deactivatedMessage', { email: supportEmail });

    const showDeletedAccountNotice = useCallback(() => {
        setDeletedNoticeVisible(true);
    }, []);

    // Survives web OAuth full-page reload via localStorage; also handles in-memory flag from App.tsx.
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            if (pendingDeactivationNotice) {
                if (cancelled) return;
                setPendingDeactivationNotice(false);
                await clearDeactivationNoticePending();
                showDeletedAccountNotice();
                return;
            }

            const persisted = await consumeDeactivationNoticePending();
            if (!cancelled && persisted) {
                showDeletedAccountNotice();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pendingDeactivationNotice, setPendingDeactivationNotice, showDeletedAccountNotice]);

    const handleLanguageChange = useCallback(
        async (lang: 'en' | 'he') => {
            setLanguagePickerVisible(false);
            try {
                await changeLanguage(lang);
                setLanguage(lang);
            } catch {
                Alert.alert(t('common.error'), t('profile.languageChangeError'));
            }
        },
        [setLanguage, t],
    );

    const handleSignIn = async () => {
        startLoading();
        try {
            const { error } = await signInWithGoogle();
            if (error) {
                if (error.code === 'account_deleted') {
                    showDeletedAccountNotice();
                    return;
                }
                Toast.show({
                    type: 'error',
                    text1: t('auth.signInError'),
                    text2: error.message,
                });
            }
        } catch {
            Toast.show({
                type: 'error',
                text1: t('auth.signInError'),
            });
        } finally {
            stopLoading();
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row justify-end px-4 pt-2">
                <TouchableOpacity
                    onPress={() => setLanguagePickerVisible(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    testID="login-language-button"
                    accessibilityLabel={t('settings.language')}
                    accessibilityRole="button"
                    className="p-2"
                >
                    <AppIcon name="language-outline" size={26} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <View className="flex-1 justify-center items-center px-8">
                <AppLogo size={128} style={{ marginBottom: 24 }} />

                <AppBrandTitle className="mb-2" />

                <Text className="text-base text-gray-500 text-center mb-12">
                    {t('auth.subtitle')}
                </Text>

                <Button
                    title={t('auth.signInWithGoogle')}
                    onPress={handleSignIn}
                    loading={isLoading}
                    disabled={isLoading}
                />
            </View>

            <DeletedAccountNoticeDialog
                visible={deletedNoticeVisible}
                title={t('deleteAccount.deactivatedTitle')}
                message={deletedNoticeMessage}
                closeLabel={t('common.close')}
                contactLabel={t('common.openMail')}
                onClose={() => setDeletedNoticeVisible(false)}
                onContact={() => {
                    void openSupportContact().catch(() => {
                        Alert.alert(t('common.error'), supportEmail);
                    });
                }}
            />

            <Modal
                visible={languagePickerVisible}
                animationType="fade"
                transparent
                onRequestClose={() => setLanguagePickerVisible(false)}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View
                        testID="login-language-picker"
                        className="bg-white rounded-t-2xl px-4 pt-4 pb-8"
                    >
                        <Text className="text-lg font-bold text-gray-900 mb-4 px-1">
                            {t('settings.language')}
                        </Text>
                        <View className="gap-2">
                            <Button
                                title={t('profile.english')}
                                onPress={() => handleLanguageChange('en')}
                                variant={language === 'en' ? 'primary' : 'outline'}
                            />
                            <Button
                                title={t('profile.hebrew')}
                                onPress={() => handleLanguageChange('he')}
                                variant={language === 'he' ? 'primary' : 'outline'}
                            />
                            <Button
                                title={t('common.cancel')}
                                onPress={() => setLanguagePickerVisible(false)}
                                variant="outline"
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
