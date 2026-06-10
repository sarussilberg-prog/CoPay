/**
 * changeLanguage() must persist the same @app_language key used by initializeLanguage().
 */

jest.mock('expo-localization', () => ({
    getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-updates', () => ({
    reloadAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
    I18nManager: {
        allowRTL: jest.fn(),
        forceRTL: jest.fn(),
        isRTL: false,
    },
    DevSettings: {
        reload: jest.fn(),
    },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { changeLanguage, initializeLanguage } from '../../i18n';
import { useAppStore } from '../../store';

describe('changeLanguage', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        useAppStore.setState({ language: 'en' });
    });

    it('persists Hebrew to AsyncStorage and updates the store', async () => {
        await initializeLanguage();

        await changeLanguage('he');

        expect(await AsyncStorage.getItem('@app_language')).toBe('he');
        expect(useAppStore.getState().language).toBe('he');
    });

    it('persists English after switching from Hebrew', async () => {
        await AsyncStorage.setItem('@app_language', 'he');
        await initializeLanguage();

        await changeLanguage('en');

        expect(await AsyncStorage.getItem('@app_language')).toBe('en');
        expect(useAppStore.getState().language).toBe('en');
    });
});
