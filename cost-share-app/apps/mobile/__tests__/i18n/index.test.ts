/**
 * Tests for initializeLanguage() in i18n/index.ts.
 *
 * Covers two paths:
 *  - Saved-value path: AsyncStorage already has 'en' or 'he' (existing behavior).
 *  - Seeding path: AsyncStorage is empty, so the language is seeded from the
 *    device locale and persisted. Hebrew also forces native RTL + reload.
 */

jest.mock('expo-localization', () => ({
    getLocales: jest.fn(),
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
import { DevSettings, I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import i18n, { initializeLanguage } from '../../i18n';
import { useAppStore } from '../../store';

const i18nMgr = I18nManager as unknown as {
    allowRTL: jest.Mock;
    forceRTL: jest.Mock;
    isRTL: boolean;
};
const getLocalesMock = Localization.getLocales as jest.Mock;
const reloadAsyncMock = Updates.reloadAsync as jest.Mock;
// In jest, __DEV__ === true, so syncNativeRtl uses DevSettings.reload(), not Updates.reloadAsync().
const devReloadMock = DevSettings.reload as jest.Mock;

describe('initializeLanguage', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        getLocalesMock.mockReset();
        reloadAsyncMock.mockReset();
        devReloadMock.mockReset();
        i18nMgr.forceRTL.mockReset();
        i18nMgr.isRTL = false;
        useAppStore.setState({ language: 'en' });
        if (i18n.isInitialized && i18n.language !== 'en') {
            await i18n.changeLanguage('en');
        }
    });

    describe('saved-value path', () => {
        it('uses saved he without reading device locale when native is already RTL', async () => {
            await AsyncStorage.setItem('@app_language', 'he');
            i18nMgr.isRTL = true;

            await initializeLanguage();

            expect(i18n.language).toBe('he');
            expect(useAppStore.getState().language).toBe('he');
            expect(getLocalesMock).not.toHaveBeenCalled();
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('uses saved he, forces RTL, and reloads when native is still LTR', async () => {
            await AsyncStorage.setItem('@app_language', 'he');

            await initializeLanguage();

            expect(i18n.language).toBe('he');
            expect(useAppStore.getState().language).toBe('he');
            expect(getLocalesMock).not.toHaveBeenCalled();
            expect(i18nMgr.forceRTL).toHaveBeenCalledWith(true);
            expect(devReloadMock).toHaveBeenCalledTimes(1);
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(await AsyncStorage.getItem('@rtl_native_applied')).toBe('he');
        });

        it('does not reload again when native RTL stays wrong after a prior reload for he', async () => {
            await AsyncStorage.multiSet([
                ['@app_language', 'he'],
                ['@rtl_native_applied', 'he'],
            ]);

            await initializeLanguage();

            expect(i18n.language).toBe('he');
            expect(i18nMgr.forceRTL).not.toHaveBeenCalled();
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('uses saved en without reading device locale when native is already LTR', async () => {
            await AsyncStorage.setItem('@app_language', 'en');

            await initializeLanguage();

            expect(i18n.language).toBe('en');
            expect(useAppStore.getState().language).toBe('en');
            expect(getLocalesMock).not.toHaveBeenCalled();
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('uses saved en, forces LTR, and reloads when native still has RTL', async () => {
            await AsyncStorage.setItem('@app_language', 'en');
            i18nMgr.isRTL = true;

            await initializeLanguage();

            expect(i18n.language).toBe('en');
            expect(useAppStore.getState().language).toBe('en');
            expect(getLocalesMock).not.toHaveBeenCalled();
            expect(i18nMgr.forceRTL).toHaveBeenCalledWith(false);
            expect(devReloadMock).toHaveBeenCalledTimes(1);
            expect(reloadAsyncMock).not.toHaveBeenCalled();
        });
    });

    describe('seeding path (no saved value)', () => {
        it('seeds he, persists it, forces RTL, and reloads', async () => {
            getLocalesMock.mockReturnValue([{ languageCode: 'he' }]);

            await initializeLanguage();

            expect(await AsyncStorage.getItem('@app_language')).toBe('he');
            expect(i18n.language).toBe('he');
            expect(useAppStore.getState().language).toBe('he');
            expect(i18nMgr.forceRTL).toHaveBeenCalledWith(true);
            expect(devReloadMock).toHaveBeenCalledTimes(1);
            expect(reloadAsyncMock).not.toHaveBeenCalled();
        });

        it('seeds en when device locale is en — no RTL flip, no reload', async () => {
            getLocalesMock.mockReturnValue([{ languageCode: 'en' }]);

            await initializeLanguage();

            expect(await AsyncStorage.getItem('@app_language')).toBe('en');
            expect(i18n.language).toBe('en');
            expect(i18nMgr.forceRTL).not.toHaveBeenCalled();
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('falls back to en for an unsupported language', async () => {
            getLocalesMock.mockReturnValue([{ languageCode: 'fr' }]);

            await initializeLanguage();

            expect(await AsyncStorage.getItem('@app_language')).toBe('en');
            expect(i18n.language).toBe('en');
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('falls back to en when getLocales returns an empty array', async () => {
            getLocalesMock.mockReturnValue([]);

            await initializeLanguage();

            expect(await AsyncStorage.getItem('@app_language')).toBe('en');
            expect(i18n.language).toBe('en');
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('seeds he but skips reload when native is already RTL', async () => {
            getLocalesMock.mockReturnValue([{ languageCode: 'he' }]);
            i18nMgr.isRTL = true;

            await initializeLanguage();

            expect(i18n.language).toBe('he');
            expect(i18nMgr.forceRTL).not.toHaveBeenCalled();
            expect(reloadAsyncMock).not.toHaveBeenCalled();
            expect(devReloadMock).not.toHaveBeenCalled();
        });

        it('seeds en and force-LTR + reloads when native still has RTL from a prior install', async () => {
            getLocalesMock.mockReturnValue([{ languageCode: 'en' }]);
            i18nMgr.isRTL = true;

            await initializeLanguage();

            expect(await AsyncStorage.getItem('@app_language')).toBe('en');
            expect(i18nMgr.forceRTL).toHaveBeenCalledWith(false);
            expect(devReloadMock).toHaveBeenCalledTimes(1);
            expect(reloadAsyncMock).not.toHaveBeenCalled();
        });
    });
});
