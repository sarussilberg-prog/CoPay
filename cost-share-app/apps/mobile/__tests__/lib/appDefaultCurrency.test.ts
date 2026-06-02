import {
    defaultCurrencyForAppLanguage,
    HEBREW_APP_DEFAULT_CURRENCY,
    initialCreateGroupCurrency,
} from '../../lib/appDefaultCurrency';

describe('appDefaultCurrency', () => {
    it('uses ILS for Hebrew UI in create flows', () => {
        expect(initialCreateGroupCurrency('he', { defaultCurrency: 'USD' })).toBe(
            HEBREW_APP_DEFAULT_CURRENCY,
        );
    });

    it('uses profile currency for English UI when set', () => {
        expect(initialCreateGroupCurrency('en', { defaultCurrency: 'EUR' })).toBe('EUR');
    });

    it('falls back to shared default for English UI without profile currency', () => {
        expect(initialCreateGroupCurrency('en', null)).toBe('ILS');
    });

    it('defaults settings fallback to ILS for Hebrew UI', () => {
        expect(defaultCurrencyForAppLanguage('he')).toBe(HEBREW_APP_DEFAULT_CURRENCY);
    });
});
