/**
 * LoginScreen
 * Authentication screen with Google sign-in
 * Uses NativeWind styling only, full i18n support
 */

import { Text } from '../../components/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { platformAlert } from '../../lib/platformAlert';
import { AppIcon } from '../../components/AppIcon';
import { AppLogo } from '../../components/AppLogo';
import { AppBrandTitle } from '../../components/AppBrandTitle';
import { DeletedAccountNoticeDialog } from '../../components/DeletedAccountNoticeDialog';
import { LoginFeatureChips } from '../../components/auth/LoginFeatureChips';
import { LoginGoogleButton } from '../../components/auth/LoginGoogleButton';
import { LoginAppleButton } from '../../components/auth/LoginAppleButton';
import { colors } from '../../theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { signInWithApple, signInWithGoogle } from '../../services/auth.service';
import { showAppToast } from '../../lib/appToast';
import { handleError } from '../../lib/handleError';
import { LanguageSheet } from '../../components/settings/LanguageSheet';
import { useChangeAppLanguage } from '../../hooks/useChangeAppLanguage';
import { centeredTextStyle, useAppLanguage } from '../../hooks/useRtlLayout';
import { useAppStore } from '../../store';
import {
    clearDeactivationNoticePending,
    consumeDeactivationNoticePending,
} from '../../lib/deactivationNoticeStorage';
import { getSupportEmail, openSupportContact } from '../../lib/openMailto';
import appVersion from '../../version.json';

export function LoginScreen() {
    const { t } = useTranslation();
    const language = useAppLanguage();
    const changeAppLanguage = useChangeAppLanguage();
    const pendingDeactivationNotice = useAppStore((state) => state.pendingDeactivationNotice);
    const setPendingDeactivationNotice = useAppStore((state) => state.setPendingDeactivationNotice);
    const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);
    const isAppleLoading = loadingProvider === 'apple';
    const isGoogleLoading = loadingProvider === 'google';
    const isAnyLoading = loadingProvider !== null;
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
            await changeAppLanguage(lang);
        },
        [changeAppLanguage],
    );

    const handleSignIn = async () => {
        setLoadingProvider('google');
        try {
            const { error } = await signInWithGoogle();
            if (error) {
                // account_deleted is expected business state (user previously deleted their account),
                // shown via a dedicated dialog — not a bug, so no Sentry capture.
                if (error.code === 'account_deleted') {
                    showDeletedAccountNotice();
                    return;
                }
                handleError(error, {
                    toast: { titleKey: 'auth.signInError', message: error.message },
                    tags: { service: 'auth', op: 'signInWithGoogle' },
                    extra: { errorCode: error.code },
                });
            }
        } catch (error) {
            handleError(error, {
                toast: { titleKey: 'auth.signInError' },
                tags: { service: 'auth', op: 'signInWithGoogle' },
            });
        } finally {
            setLoadingProvider(null);
        }
    };

    const handleAppleSignIn = async () => {
        setLoadingProvider('apple');
        try {
            const { error } = await signInWithApple();
            if (error) {
                if (error.code === 'account_deleted') {
                    showDeletedAccountNotice();
                    return;
                }
                handleError(error, {
                    toast: { titleKey: 'auth.signInError', message: error.message },
                    tags: { service: 'auth', op: 'signInWithApple' },
                    extra: { errorCode: error.code },
                });
            }
        } catch (error) {
            handleError(error, {
                toast: { titleKey: 'auth.signInError' },
                tags: { service: 'auth', op: 'signInWithApple' },
            });
        } finally {
            setLoadingProvider(null);
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
                            <AppLogo size={108} />
                        </View>
                        <AppBrandTitle className="mt-5 mb-1" />
                        <Text
                            className="text-xl font-bold text-primary-dark text-center"
                            style={centeredTextStyle}
                        >
                            {t('auth.tagline')}
                        </Text>
                        <LoginFeatureChips />
                    </View>
                </View>

                <View className="px-7 pb-2">
                    {Platform.OS === 'ios' ? (
                        <>
                            <LoginAppleButton
                                title={t('auth.signInWithApple')}
                                onPress={handleAppleSignIn}
                                loading={isAppleLoading}
                                disabled={isAnyLoading}
                            />
                            <View className="h-3" />
                            <LoginGoogleButton
                                title={t('auth.signInWithGoogle')}
                                onPress={handleSignIn}
                                loading={isGoogleLoading}
                                disabled={isAnyLoading}
                            />
                        </>
                    ) : (
                        <>
                            <LoginGoogleButton
                                title={t('auth.signInWithGoogle')}
                                onPress={handleSignIn}
                                loading={isGoogleLoading}
                                disabled={isAnyLoading}
                            />
                            <View className="h-3" />
                            <LoginAppleButton
                                title={t('auth.signInWithApple')}
                                onPress={handleAppleSignIn}
                                loading={isAppleLoading}
                                disabled={isAnyLoading}
                            />
                        </>
                    )}
                    <Text className="text-[11px] text-gray-300 text-center mt-4">
                        v{appVersion.version}
                    </Text>
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

            <LanguageSheet
                testID="login-language-picker"
                visible={languagePickerVisible}
                current={language}
                onSelect={handleLanguageChange}
                onClose={() => setLanguagePickerVisible(false)}
            />
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
        alignSelf: 'stretch',
        width: '100%',
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
});
