import { BalanceSummary } from '@cost-share/shared';
import { deriveProfileBalanceSummary } from '../../hooks/useProfileBalanceSummary';

describe('deriveProfileBalanceSummary — headline always in default currency', () => {
    /**
     * Regression for the profile-screen bug where a USD-only balance was
     * rendered with the ILS shekel sign. Even if the server (incorrectly)
     * fills in totals using the foreign-currency value, the derived summary
     * MUST re-aggregate from `byCurrency` so the displayed amount and the
     * displayed currency tag stay coupled.
     */
    it('converts a single foreign-currency balance into the user default currency', () => {
        // 1 ILS = 0.25 USD (i.e. 4 ILS per dollar) — chosen so the math is obvious.
        const rates = { USD: 0.25 };

        // Mirrors today's buggy SQL: totals are non-null but actually USD figures.
        const raw: BalanceSummary = {
            totalOwed: 0,
            totalOwedToUser: 360.50,
            defaultCurrency: 'ILS',
            byCurrency: [{ currency: 'USD', owed: 0, owedToUser: 360.50 }],
        };

        const result = deriveProfileBalanceSummary(raw, rates);

        // 360.50 USD ÷ 0.25 = 1442.00 ILS — what the hero must display.
        expect(result.summary?.totalOwed).toBe(0);
        expect(result.summary?.totalOwedToUser).toBe(1442);
        expect(result.summary?.defaultCurrency).toBe('ILS');
        expect(result.fxApplied).toBe(true);
        expect(result.needsRates).toBe(false);
    });

    /**
     * The original ask: "checks the amount owed + amount he owes and
     * calculates it in his default currency." Both sides have foreign-currency
     * amounts in different currencies; the headline must aggregate both.
     */
    it('sums what the user owes and what is owed to the user, in default currency', () => {
        // 1 ILS = 0.25 USD, 1 ILS = 0.20 EUR.
        const rates = { USD: 0.25, EUR: 0.20 };

        const raw: BalanceSummary = {
            totalOwed: null,
            totalOwedToUser: null,
            defaultCurrency: 'ILS',
            byCurrency: [
                { currency: 'USD', owed: 10, owedToUser: 40 },   // owe $10, owed $40
                { currency: 'EUR', owed: 5, owedToUser: 0 },     // owe €5
            ],
        };

        const result = deriveProfileBalanceSummary(raw, rates);

        // owed       = 10 USD / 0.25 + 5 EUR / 0.20 = 40 + 25 = 65 ILS
        // owedToUser = 40 USD / 0.25 + 0           = 160 ILS
        expect(result.summary?.totalOwed).toBe(65);
        expect(result.summary?.totalOwedToUser).toBe(160);
        expect(result.fxApplied).toBe(true);
    });

    it('does not need FX when every row is already in the default currency', () => {
        const raw: BalanceSummary = {
            totalOwed: 50,
            totalOwedToUser: 100,
            defaultCurrency: 'ILS',
            byCurrency: [{ currency: 'ILS', owed: 50, owedToUser: 100 }],
        };

        const result = deriveProfileBalanceSummary(raw, undefined);

        expect(result.summary?.totalOwed).toBe(50);
        expect(result.summary?.totalOwedToUser).toBe(100);
        expect(result.fxApplied).toBe(false);
        expect(result.needsRates).toBe(false);
    });

    it('returns zero totals for an empty balance', () => {
        const raw: BalanceSummary = {
            totalOwed: 0,
            totalOwedToUser: 0,
            defaultCurrency: 'ILS',
            byCurrency: [],
        };

        const result = deriveProfileBalanceSummary(raw, undefined);

        expect(result.summary?.totalOwed).toBe(0);
        expect(result.summary?.totalOwedToUser).toBe(0);
        expect(result.fxApplied).toBe(false);
        expect(result.needsRates).toBe(false);
    });

    it('reports needsRates when foreign currency is present but no rates supplied', () => {
        const raw: BalanceSummary = {
            totalOwed: 0,
            totalOwedToUser: 360.50,
            defaultCurrency: 'ILS',
            byCurrency: [{ currency: 'USD', owed: 0, owedToUser: 360.50 }],
        };

        const result = deriveProfileBalanceSummary(raw, undefined);

        expect(result.needsRates).toBe(true);
        expect(result.fxApplied).toBe(false);
        // Headline must NOT pretend totals exist when conversion can't be done.
        expect(result.summary?.totalOwed).toBeNull();
        expect(result.summary?.totalOwedToUser).toBeNull();
    });

    it('reports needsRates when a required rate is missing from the payload', () => {
        const raw: BalanceSummary = {
            totalOwed: null,
            totalOwedToUser: null,
            defaultCurrency: 'ILS',
            byCurrency: [
                { currency: 'USD', owed: 0, owedToUser: 10 },
                { currency: 'GBP', owed: 5, owedToUser: 0 },
            ],
        };

        // Missing GBP rate — aggregation cannot complete.
        const result = deriveProfileBalanceSummary(raw, { USD: 0.25 });

        expect(result.needsRates).toBe(true);
        expect(result.fxApplied).toBe(false);
        expect(result.summary?.totalOwed).toBeNull();
        expect(result.summary?.totalOwedToUser).toBeNull();
    });
});
