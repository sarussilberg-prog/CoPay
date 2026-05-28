import { Linking, Platform } from 'react-native';
import { openPaymentApp } from '../../lib/israeliPaymentLinks';

describe('israeliPaymentLinks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('opens bit:// on native platforms', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
        const canOpenURL = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

        await openPaymentApp('bit');

        expect(canOpenURL).toHaveBeenCalledWith('bit://');
        expect(openURL).toHaveBeenCalledWith('bit://');
    });

    it('tries paybox://pay before paybox://', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

        await openPaymentApp('paybox');

        expect(openURL).toHaveBeenCalledWith('paybox://pay');
    });

    it('falls back to the App Store when no deep link opens', async () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
        jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
        jest.spyOn(Linking, 'openURL')
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce(undefined);

        await openPaymentApp('paybox');

        expect(Linking.openURL).toHaveBeenLastCalledWith('https://apps.apple.com/app/id895491053');
    });
});
