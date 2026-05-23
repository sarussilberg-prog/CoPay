import type { PairwiseDebt } from '../types';
import type { CurrencyAmount } from './memberContributions';

function roundMoney(value: number): number {
    return Number(value.toFixed(2));
}

function aggregateByCurrency(
    items: { amount: number; currency: string }[],
): CurrencyAmount[] {
    const map = new Map<string, number>();
    for (const item of items) {
        map.set(item.currency, (map.get(item.currency) ?? 0) + item.amount);
    }
    return [...map.entries()]
        .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }))
        .filter(row => row.amount >= 0.01)
        .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Gross expense total for a group, grouped by currency. */
export function calculateGroupTotalSpent(
    expenses: { amount: number; currency: string }[],
): CurrencyAmount[] {
    return aggregateByCurrency(expenses);
}

/**
 * Total money still owed between members (sum of simplified pairwise debts),
 * grouped by currency.
 */
export function calculateGroupTotalUnsettled(debts: PairwiseDebt[]): CurrencyAmount[] {
    return aggregateByCurrency(debts);
}

/** Puts the group's default currency first for compact UI display. */
export function sortCurrencyAmounts(
    rows: CurrencyAmount[],
    defaultCurrency: string,
): CurrencyAmount[] {
    return [...rows].sort((a, b) => {
        if (a.currency === defaultCurrency) return -1;
        if (b.currency === defaultCurrency) return 1;
        return a.currency.localeCompare(b.currency);
    });
}
