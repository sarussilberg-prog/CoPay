import {
    formatCurrencyAmount,
    getCurrencyDisplayName,
    getCurrencySymbol,
    getLocalizedCurrencyName,
    matchesCurrencySearch,
} from '../../lib/currencyDisplay';

describe('currencyDisplay', () => {
    describe('getCurrencySymbol', () => {
        it('returns $ for USD', () => {
            expect(getCurrencySymbol('USD')).toBe('$');
        });

        it('returns ₪ for ILS', () => {
            expect(getCurrencySymbol('ILS')).toBe('₪');
        });

        it('returns dram symbol for AMD', () => {
            expect(getCurrencySymbol('AMD')).toBe('֏');
        });

        it('falls back to code for unknown currency', () => {
            expect(getCurrencySymbol('XYZ')).toBe('XYZ');
        });
    });

    describe('formatCurrencyAmount', () => {
        it('prefixes shekel symbol', () => {
            expect(formatCurrencyAmount(50, 'ILS')).toMatch(/^₪50/);
        });

        it('prefixes dollar symbol', () => {
            expect(formatCurrencyAmount(150, 'USD')).toMatch(/^\$150/);
        });
    });

    describe('getLocalizedCurrencyName', () => {
        it('returns Hebrew name for ILS', () => {
            expect(getLocalizedCurrencyName('ILS', 'he')).toBe('שקל חדש');
        });

        it('returns English name for USD', () => {
            expect(getLocalizedCurrencyName('USD', 'en')).toBe('US Dollar');
        });

        it('normalizes lowercase ISO codes', () => {
            expect(getLocalizedCurrencyName('amd', 'he')).toBe('דראם ארמני');
        });
    });

    describe('getCurrencyDisplayName', () => {
        it('prefers localized name when available', () => {
            expect(getCurrencyDisplayName('ILS', 'New Israeli Sheqel', 'he')).toBe('שקל חדש');
        });

        it('falls back to English name when locale has no localized name', () => {
            expect(getCurrencyDisplayName('XYZ', 'Test Currency', 'he')).toBe('Test Currency');
        });
    });

    describe('matchesCurrencySearch', () => {
        it('matches ISO code', () => {
            expect(matchesCurrencySearch('ils', 'ILS', 'New Israeli Sheqel', 'en')).toBe(true);
        });

        it('matches English currency name', () => {
            expect(matchesCurrencySearch('dollar', 'USD', 'US Dollar', 'en')).toBe(true);
        });

        it('matches localized Hebrew partial query', () => {
            expect(matchesCurrencySearch('שק', 'ILS', 'New Israeli Sheqel', 'he')).toBe(true);
        });

        it('matches full localized Hebrew name', () => {
            expect(matchesCurrencySearch('שקל חדש', 'ILS', 'New Israeli Sheqel', 'he')).toBe(true);
        });

        it('returns false for unrelated query', () => {
            expect(matchesCurrencySearch('yen', 'ILS', 'New Israeli Sheqel', 'he')).toBe(false);
        });
    });
});
