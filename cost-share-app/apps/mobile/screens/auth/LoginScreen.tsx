/**
 * LoginScreen
 * Authentication screen with Google sign-in
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    TouchableOpacity,
    Modal,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { platformAlert } from '../../lib/platformAlert';
import { AppIcon } from '../../components/AppIcon';
import { AppLogo } from '../../components/AppLogo';
import { AppBrandTitle } from '../../components/AppBrandTitle';
import { DeletedAccountNoticeDialog } from '../../components/DeletedAccountNoticeDialog';
import { LoginFeatureChips } from '../../components/auth/LoginFeatureChips';
import { LoginGoogleButton } from '../../components/auth/LoginGoogleButton';
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
import { rtlTextClassName, useRtlLayout } from '../../hooks/useRtlLayout';

export function LoginScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
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
                platformAlert(t('common.error'), t('profile.languageChangeError'));
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
        <View style={styles.root} testID="login-screen">
            <LinearGradient
                colors={['#FFFFFF', '#F0F7FF', '#E0EDFF']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.blobTop} pointerEvents="none" />
            <View style={styles.blobBottom} pointerEvents="none" />

            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View className="flex-row justify-end px-5 pt-1">
                    <TouchableOpacity
                        onPress={() => setLanguagePickerVisible(true)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="login-language-button"
                        accessibilityLabel={t('settings.language')}
                        accessibilityRole="button"
                        style={styles.langBtn}
                    >
                        <AppIcon name="language-outline" size={22} color={colors.primaryDark} />
                    </TouchableOpacity>
                </View>

                <View className="flex-1 justify-center px-7">
                    <View style={styles.hero}>
                        <View style={styles.logoRing}>
                            <AppLogo size={96} />
                        </View>
                        <AppBrandTitle className="mt-5 mb-1" />
                        <Text
                            className={rtlTextClassName(
                                isRtl,
                                'text-xl font-bold text-primary-dark text-center',
                            )}
                        >
                            {t('auth.tagline')}
                        </Text>
                        <Text
                            className={rtlTextClassName(
                                isRtl,
                                'text-[15px] leading-relaxed text-gray-500 text-center mt-3 px-1',
                            )}
                        >
                            {t('auth.description')}
                        </Text>
                        <LoginFeatureChips />
                    </View>
                </View>

                <View className="px-7 pb-2">
                    <LoginGoogleButton
                        title={t('auth.signInWithGoogle')}
                        onPress={handleSignIn}
                        loading={isLoading}
                        disabled={isLoading}
                    />
                    {isLoading ? (
                        <View style={styles.signingHint}>
                            <ActivityIndicator size="small" color={colors.primary} />
                            <Text className="text-sm text-gray-400 mt-2 text-center">
                                {t('auth.signingIn')}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </SafeAreaView>

            <DeletedAccountNoticeDialog
                visible={deletedNoticeVisible}
                title={t('deleteAccount.deactivatedTitle')}
                message={deletedNoticeMessage}
                closeLabel={t('common.close')}
                contactLabel={t('common.openMail')}
                onClose={() => setDeletedNoticeVisible(false)}
                onContact={() => {
                    void openSupportContact().catch(() => {
                        platformAlert(t('common.error'), supportEmail);
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
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.white,
    },
    safe: {
        flex: 1,
    },
    langBtn: {
        padding: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(96,165,250,0.2)',
    },
    hero: {
        alignItems: 'center',
    },
    logoRing: {
        padding: 20,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(147,197,253,0.45)',
        overflow: 'visible',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 6,
    },
    blobTop: {
        position: 'absolute',
        top: -80,
        end: -60,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(147,197,253,0.35)',
    },
    blobBottom: {
        position: 'absolute',
        bottom: 120,
        start: -90,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(96,165,250,0.18)',
    },
    signingHint: {
        alignItems: 'center',
        marginTop: 12,
    },
});
