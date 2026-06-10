/**
 * i18n Configuration
 * Internationalization setup for English and Hebrew
 * With AsyncStorage persistence
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import en from './locales/en.json';
import he from './locales/he.json';
import { useAppStore } from '../store';

type SupportedLanguage = 'en' | 'he';

/** Falls back to English when the dev client was not rebuilt after adding expo-localization. */
const resolveDeviceLanguage = (): SupportedLanguage => {
    try {
        const code = Localization.getLocales()[0]?.languageCode;
        return code === 'he' ? 'he' : 'en';
    } catch {
        console.warn(
            'expo-localization unavailable — rebuild the dev client (npm run mobile:ios). Using en.',
        );
        return 'en';
    }
};

I18nManager.allowRTL(true);

const resources = {
    en: { translation: en },
    he: { translation: he },
};

const LANGUAGE_KEY = '@app_language';
/** Last language we already ran forceRTL + reload for (prevents Android dev reload loops). */
const RTL_NATIVE_APPLIED_KEY = '@rtl_native_applied';

const i18nInitOptions = {
    resources,
    fallbackLng: 'en' as const,
    interpolation: {
        escapeValue: false,
    },
    compatibilityJSON: 'v4' as const,
};

let initPromise: Promise<void> | null = null;

async function ensureI18nReady(language: SupportedLanguage): Promise<void> {
    if (!i18n.isInitialized) {
        if (!initPromise) {
            initPromise = i18n.use(initReactI18next).init({
                ...i18nInitOptions,
                lng: language,
            }).then(() => undefined);
        }
        await initPromise;
        return;
    }

    if (i18n.language !== language) {
        await i18n.changeLanguage(language);
    }
}

async function syncNativeRtl(language: SupportedLanguage): Promise<void> {
    const desiredRTL = language === 'he';
    if (I18nManager.isRTL === desiredRTL) {
        await AsyncStorage.setItem(RTL_NATIVE_APPLIED_KEY, language);
        return;
    }

    const applied = await AsyncStorage.getItem(RTL_NATIVE_APPLIED_KEY);
    if (applied === language) {
        // forceRTL + reload already ran for this language but native isRTL can stay
        // wrong on Android dev builds — RtlLayoutProvider still mirrors from store.
        if (__DEV__) {
            console.warn(
                '[i18n] Native I18nManager.isRTL still mismatched after reload; using logical RTL.',
            );
        }
        return;
    }

    I18nManager.forceRTL(desiredRTL);
    await AsyncStorage.setItem(RTL_NATIVE_APPLIED_KEY, language);
    if (__DEV__) {
        // Updates.reloadAsync() in a dev client can leave the splash stuck.
        DevSettings.reload();
    } else {
        await Updates.reloadAsync();
    }
    // Execution stops here — the app reloads.
}

async function resolveStartupLanguage(): Promise<SupportedLanguage> {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);

    if (savedLanguage === 'en' || savedLanguage === 'he') {
        return savedLanguage;
    }

    const deviceLanguage = resolveDeviceLanguage();
    await AsyncStorage.setItem(LANGUAGE_KEY, deviceLanguage);
    return deviceLanguage;
}

/**
 * Initialize language from AsyncStorage on app start
 * Loads saved language preference and applies RTL settings
 */
export const initializeLanguage = async (): Promise<void> => {
    try {
        const language = await resolveStartupLanguage();
        await ensureI18nReady(language);
        useAppStore.getState().setLanguage(language);
        await syncNativeRtl(language);
        if (__DEV__) console.log(`Language initialized: ${language}`);
    } catch (error) {
        console.error('Failed to initialize language:', error);
        await ensureI18nReady('en');
        useAppStore.getState().setLanguage('en');
    }
};

/**
 * Change language and update RTL settings
 * Saves preference to AsyncStorage for persistence
 */
export const changeLanguage = async (language: 'en' | 'he'): Promise<void> => {
    try {
        await ensureI18nReady(language);
        await i18n.changeLanguage(language);
        await AsyncStorage.setItem(LANGUAGE_KEY, language);
        useAppStore.getState().setLanguage(language);
        if (__DEV__) console.log(`Language saved to storage: ${language}`);
        await syncNativeRtl(language);
    } catch (error) {
        console.error('Failed to change language:', error);
        throw error;
    }
};

/**
 * Get current saved language from AsyncStorage
 */
export const getSavedLanguage = async (): Promise<'en' | 'he' | null> => {
    try {
        const language = await AsyncStorage.getItem(LANGUAGE_KEY);
        return language === 'en' || language === 'he' ? language : null;
    } catch (error) {
        console.error('Failed to get saved language:', error);
        return null;
    }
};

export default i18n;
