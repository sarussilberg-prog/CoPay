/**
 * i18n Configuration
 * Internationalization setup for English and Hebrew
 * With AsyncStorage persistence
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
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

// Storage key for language preference
const LANGUAGE_KEY = '@app_language';

// Initialize i18n
void i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en', // default language
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        compatibilityJSON: 'v4',
    });

/**
 * Initialize language from AsyncStorage on app start
 * Loads saved language preference and applies RTL settings
 */
export const initializeLanguage = async (): Promise<void> => {
    try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);

        if (savedLanguage === 'en' || savedLanguage === 'he') {
            await i18n.changeLanguage(savedLanguage);
            const isRTL = savedLanguage === 'he';

            // Apply RTL setting if needed
            if (I18nManager.isRTL !== isRTL) {
                I18nManager.forceRTL(isRTL);
            }

            useAppStore.getState().setLanguage(savedLanguage);

            console.log(`Language loaded from storage: ${savedLanguage}`);
            return;
        }

        // First launch — seed from device locale.
        const deviceLanguage = resolveDeviceLanguage();
        await i18n.changeLanguage(deviceLanguage);
        useAppStore.getState().setLanguage(deviceLanguage);
        await AsyncStorage.setItem(LANGUAGE_KEY, deviceLanguage);
        console.log(`Language seeded from device locale: ${deviceLanguage}`);

        const desiredRTL = deviceLanguage === 'he';
        if (I18nManager.isRTL !== desiredRTL) {
            I18nManager.forceRTL(desiredRTL);
            await Updates.reloadAsync();
            // Execution stops here — the app reloads.
        }
    } catch (error) {
        console.error('Failed to initialize language:', error);
    }
};

/**
 * Change language and update RTL settings
 * Saves preference to AsyncStorage for persistence
 */
export const changeLanguage = async (language: 'en' | 'he'): Promise<void> => {
    try {
        await i18n.changeLanguage(language);

        const isRTL = language === 'he';
        if (I18nManager.isRTL !== isRTL) {
            I18nManager.forceRTL(isRTL);
        }

        await AsyncStorage.setItem(LANGUAGE_KEY, language);
        console.log(`Language saved to storage: ${language}`);
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
