import { Text } from '../../components/AppText';
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Linking, Platform, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { Language, DEFAULT_CURRENCY } from '@cost-share/shared';
import { useAppStore } from '../../store';
import { changeLanguage } from '../../i18n';
import { signOut } from '../../services/auth.service';
import { updateUser } from '../../services/users.service';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SettingsRow } from '../../components/settings/SettingsRow';
import { ContactSupportRow } from '../../components/settings/ContactSupportRow';
import { LegalSheet } from '../../components/settings/LegalSheet';
import { LanguageSheet } from '../../components/settings/LanguageSheet';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import Toast from 'react-native-toast-message';
import { deleteMyAccount, getMyOpenBalances, type OpenBalancesSummary } from '../../services/account.service';
import { useNavigation } from '@react-navigation/native';
import { DeleteAccountWarningSheet } from '../../components/settings/DeleteAccountWarningSheet';
import { DeleteAccountConfirmSheet } from '../../components/settings/DeleteAccountConfirmSheet';
import currencyCodes from 'currency-codes';
import { getCurrencyDisplayName } from '../../lib/currencyDisplay';
import { InviteLinkBlock } from '../../components/InviteLinkBlock';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL;
const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL;

export function SettingsScreen() {
    const { t } = useTranslation();
    const language = useAppStore((s) => s.language);
    const setLanguage = useAppStore((s) => s.setLanguage);
    const currentUser = useAppStore((s) => s.currentUser);

    const [showLogout, setShowLogout] = useState(false);
    const [showLanguage, setShowLanguage] = useState(false);
    const [showCurrency, setShowCurrency] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [openBalances, setOpenBalances] = useState<OpenBalancesSummary | null>(null);

    const navigation = useNavigation<any>();

    const handleLanguagePick = useCallback(async (lang: Language) => {
        setShowLanguage(false);
        try {
            await changeLanguage(lang);
            setLanguage(lang);
        } catch {
            Alert.alert(t('common.error'), t('profile.languageChangeError'));
        }
    }, [setLanguage, t]);

    const currencyCode = currentUser?.defaultCurrency ?? DEFAULT_CURRENCY;
    const currencyMeta = currencyCodes.code(currencyCode);
    const currencyValueText = currencyMeta
        ? `${currencyMeta.code} - ${getCurrencyDisplayName(currencyMeta.code, currencyMeta.currency, language)}`
        : currencyCode;

    const handleCurrencyPick = useCallback(async (nextCurrency: string) => {
        setShowCurrency(false);
        if (!currentUser || nextCurrency === currentUser.defaultCurrency) return;

        const result = await updateUser(currentUser.id, { defaultCurrency: nextCurrency });
        if (result) {
            Toast.show({
                type: 'success',
                text1: t('common.success'),
                text2: t('profile.profileUpdated'),
            });
        } else {
            Toast.show({
                type: 'error',
                text1: t('common.error'),
                text2: t('profile.updateError'),
            });
        }
    }, [currentUser, t]);

    const handleRate = useCallback(async () => {
        if (await StoreReview.isAvailableAsync()) {
            await StoreReview.requestReview();
            return;
        }
        const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
        if (url) await Linking.openURL(url);
    }, []);

    const handleLogout = useCallback(async () => {
        setShowLogout(false);
        await signOut();
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        const result = await deleteMyAccount();
        if (result.ok) {
            setShowDeleteConfirm(false);
            Toast.show({ type: 'success', text1: t('deleteAccount.deletedToast') });
        } else {
            Toast.show({
                type: 'error',
                text1: t(result.error ?? 'deleteAccount.deleteFailed'),
            });
        }
    }, [t]);

    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="pt-4">
                <View className="px-4 mb-4">
                    <InviteLinkBlock kind="friend" mode="expanded" />
                </View>

                <SettingsSection title={t('settings.general')}>
                    <SettingsRow
                        iconName="globe-outline"
                        label={t('settings.language')}
                        variant="value"
                        valueText={language === 'he' ? t('profile.hebrew') : t('profile.english')}
                        onPress={() => setShowLanguage(true)}
                    />
                    <SettingsRow
                        iconName="cash-outline"
                        label={t('settings.defaultCurrency')}
                        variant="value"
                        valueText={currencyValueText}
                        onPress={() => setShowCurrency(true)}
                        testID="settings-currency-row"
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.support')}>
                    <SettingsRow iconName="star-outline" label={t('settings.rateUs')} variant="chevron" onPress={handleRate} />
                    <ContactSupportRow />
                </SettingsSection>

                <SettingsSection title={t('settings.legal')}>
                    <SettingsRow iconName="document-text-outline" label={t('settings.terms')} variant="chevron" onPress={() => setShowTerms(true)} />
                    <SettingsRow iconName="shield-outline" label={t('settings.privacy')} variant="chevron" onPress={() => setShowPrivacy(true)} />
                </SettingsSection>

                <SettingsSection title={t('settings.account')}>
                    <SettingsRow iconName="log-out-outline" label={t('settings.logout')} variant="danger" onPress={() => setShowLogout(true)} />
                    <SettingsRow
                        iconName="trash-outline"
                        label={t('settings.deleteAccount')}
                        variant="danger"
                        onPress={async () => {
                            const balances = await getMyOpenBalances();
                            setOpenBalances(balances);
                            setShowDeleteWarning(true);
                        }}
                    />
                </SettingsSection>

                <Text className="text-center text-xs text-gray-400 mb-8">
                    {t('settings.version', { version: APP_VERSION })}
                </Text>
            </View>

            <ConfirmDialog
                visible={showLogout}
                title={t('settings.logout')}
                message={t('profile.logoutConfirm')}
                confirmText={t('settings.logout')}
                cancelText={t('common.cancel')}
                onConfirm={handleLogout}
                onCancel={() => setShowLogout(false)}
                destructive
            />

            <LanguageSheet
                visible={showLanguage}
                current={language as Language}
                onSelect={handleLanguagePick}
                onClose={() => setShowLanguage(false)}
            />

            <CurrencyPicker
                value={currencyCode}
                onChange={handleCurrencyPick}
                visible={showCurrency}
                onClose={() => setShowCurrency(false)}
            />

            <LegalSheet visible={showTerms} title={t('legal.termsTitle')} body={t('legal.termsBody')} onClose={() => setShowTerms(false)} />
            <LegalSheet visible={showPrivacy} title={t('legal.privacyTitle')} body={t('legal.privacyBody')} onClose={() => setShowPrivacy(false)} />

            <DeleteAccountWarningSheet
                visible={showDeleteWarning}
                openBalances={openBalances}
                onClose={() => setShowDeleteWarning(false)}
                onContinue={() => {
                    setShowDeleteWarning(false);
                    setShowDeleteConfirm(true);
                }}
                onSettleUp={() => {
                    setShowDeleteWarning(false);
                    navigation.navigate('SettleUpList');
                }}
            />

            <DeleteAccountConfirmSheet
                visible={showDeleteConfirm}
                expectedEmail={currentUser?.email ?? ''}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDeleteConfirm}
            />
        </ScrollView>
    );
}
