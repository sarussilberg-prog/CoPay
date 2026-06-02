/** @jest-environment jsdom */

import { Linking, Platform, Share } from 'react-native';
import { DEFAULT_SUPPORT_EMAIL, getSupportEmail, openSupportContact } from '../../lib/openMailto';

const originalPlatform = Platform.OS;

describe('openMailto', () => {
    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
        jest.restoreAllMocks();
    });

    it('returns default support email when env is unset', () => {
        expect(getSupportEmail()).toBe(DEFAULT_SUPPORT_EMAIL);
    });

    it('no-ops on web', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

        await expect(openSupportContact()).resolves.toBeUndefined();
        expect(openURL).not.toHaveBeenCalled();
    });

    it('opens mailto via Linking on native', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
        const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

        await expect(openSupportContact()).resolves.toBeUndefined();
        expect(openURL).toHaveBeenCalledWith(`mailto:${DEFAULT_SUPPORT_EMAIL}?subject=Kupay%20Support`);
        expect(share).not.toHaveBeenCalled();
    });

    it('falls back to Share when Linking fails', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
        jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('failed'));
        const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

        await expect(openSupportContact()).resolves.toBeUndefined();
        expect(share).toHaveBeenCalledWith({
            url: `mailto:${DEFAULT_SUPPORT_EMAIL}?subject=Kupay%20Support`,
        });
    });

    it('throws when Linking and Share both fail', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
        jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('failed'));
        jest.spyOn(Share, 'share').mockRejectedValue(new Error('failed'));

        await expect(openSupportContact()).rejects.toThrow('contact_unavailable');
    });
});
