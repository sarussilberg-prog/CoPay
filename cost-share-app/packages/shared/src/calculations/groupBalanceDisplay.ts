import type { GroupBalance } from '../types';
import { convertToBaseCurrency, type RatesFromBase } from './fxConversion';

export type GroupBalanceDisplay = {
    /** Net in the chosen display currency (positive = I'm owed, negative = I owe). */
    net: number;
    /** Currency the `net` is expressed in. */
    currency: string;
    /** True when `net` was converted from the group's currency to the user's default. */
    isConverted: boolean;
    /** True when FX was needed but no rate was available — we fell back to the group's currency. */
    conversionFailed?: boolean;
};

function roundMoney(value: number): number {
    return Number(value.toFixed(2));
}

/**
 * Choose how a single group's net balance should be displayed for the current user.
 * Same currency → render as-is; foreign currency → convert to `defaultCurrency` if a rate is available,
 * otherwise fall back to the group's currency and mark `conversionFailed`.
 */
export function resolveGroupBalanceDisplay(
    balance: GroupBalance | undefined,
    defaultCurrency: string,
    ratesFromBase?: RatesFromBase,
): GroupBalanceDisplay | undefined {
    if (!balance) return undefined;

    if (balance.currency === defaultCurrency) {
        return { net: balance.net, currency: defaultCurrency, isConverted: false };
    }

    if (Math.abs(balance.net) < 0.01) {
        return { net: 0, currency: defaultCurrency, isConverted: false };
    }

    if (!ratesFromBase) {
        return {
            net: balance.net,
            currency: balance.currency,
            isConverted: false,
            conversionFailed: true,
        };
    }

    const converted = convertToBaseCurrency(
        Math.abs(balance.net),
        balance.currency,
        defaultCurrency,
        ratesFromBase,
    );
    if (converted === null) {
        return {
            net: balance.net,
            currency: balance.currency,
            isConverted: false,
            conversionFailed: true,
        };
    }
    return {
        net: roundMoney(balance.net >= 0 ? converted : -converted),
        currency: defaultCurrency,
        isConverted: true,
    };
}

/** Foreign currencies (vs. `defaultCurrency`) across all groups that have a non-zero net. */
export function collectGroupFxCurrencies(
    balances: GroupBalance[],
    defaultCurrency: string,
): string[] {
    const set = new Set<string>();
    for (const b of balances) {
        if (!b || b.currency === defaultCurrency) continue;
        if (Math.abs(b.net) < 0.01) continue;
        set.add(b.currency);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}
