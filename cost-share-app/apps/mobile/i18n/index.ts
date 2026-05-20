/**
 * i18n Configuration
 * Internationalization setup for English and Hebrew
 * With AsyncStorage persistence
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import he from './locales/he.json';
import { useAppStore } from '../store';

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
        } else {
            console.log('No saved language found, using default: en');
        }
    } catch (error) {
        console.error('Failed to load language from storage:', error);
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
