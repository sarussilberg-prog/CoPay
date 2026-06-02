/** @jest-environment jsdom */

import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { shareTextMessage } from '../../lib/platformShare';

const originalPlatform = Platform.OS;

describe('shareTextMessage (web)', () => {
    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    });

    it('copies to clipboard when Web Share API is unavailable', async () => {
        const setString = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);

        await shareTextMessage('https://kupa.pro/g/abc');

        expect(setString).toHaveBeenCalledWith('https://kupa.pro/g/abc');
    });

    it('uses navigator.share when available', async () => {
        const share = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(globalThis.navigator, 'share', {
            configurable: true,
            value: share,
        });
        const setString = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);

        await shareTextMessage('hello');

        expect(share).toHaveBeenCalledWith({ text: 'hello' });
        expect(setString).not.toHaveBeenCalled();
    });
});
