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
import { colors } from '../../theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLoading } from '../../hooks/useLoading';
import { signInWithGoogle } from '../../services/auth.service';
import { Button } from '../../components/Button';
import Toast from 'react-native-toast-message';
import { changeLanguage } from '../../i18n';
import { useAppStore } from '../../store';
import { getSupportEmail, openSupportContact } from '../../lib/openMailto';

export function LoginScreen() {
    const { t } = useTranslation();
    const language = useAppStore((state) => state.language);
    const setLanguage = useAppStore((state) => state.setLanguage);
    const pendingDeactivationNotice = useAppStore((state) => state.pendingDeactivationNotice);
    const setPendingDeactivationNotice = useAppStore((state) => state.setPendingDeactivationNotice);
    const { isLoading, startLoading, stopLoading } = useLoading();
    const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

    // When App.tsx detects that the user signing in has been deleted, it flips
    // pendingDeactivationNotice on the store and skips storing the session. We
    // wait until LoginScreen is mounted before firing the Alert so the message
    // can't race with the navigator transition.
    useEffect(() => {
        if (!pendingDeactivationNotice) return;
        const email = getSupportEmail();
        Alert.alert(
            t('deleteAccount.deactivatedTitle'),
            t('deleteAccount.deactivatedMessage', { email }),
            [
                { text: t('common.close'), style: 'cancel' },
                {
                    text: t('common.openMail'),
                    onPress: () => { void openSupportContact(); },
                },
            ],
        );
        setPendingDeactivationNotice(false);
    }, [pendingDeactivationNotice, setPendingDeactivationNotice, t]);

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
        [setLanguage, t]
    );

    const handleSignIn = async () => {
        startLoading();
        try {
            const { error } = await signInWithGoogle();
            if (error) {
                if (error.code === 'account_deleted') {
                    Alert.alert(
                        t('deleteAccount.reSignupBlockedTitle'),
                        t('deleteAccount.reSignupBlocked', { email: getSupportEmail() }),
                        [
                            { text: t('common.close'), style: 'cancel' },
                            {
                                text: t('common.openMail'),
                                onPress: () => {
                                    void openSupportContact();
                                },
                            },
                        ],
                    );
                    return;
                }
                Toast.show({
                    type: 'error',
                    text1: t('auth.signInError'),
                    text2: error.message,
                });
            }
        } catch (err) {
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

                {/* Subtitle */}
                <Text className="text-base text-gray-500 text-center mb-12">
                    {t('auth.subtitle')}
                </Text>

                {/* Sign In Button */}
                <Button
                    title={t('auth.signInWithGoogle')}
                    onPress={handleSignIn}
                    loading={isLoading}
                    disabled={isLoading}
                />
            </View>

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
