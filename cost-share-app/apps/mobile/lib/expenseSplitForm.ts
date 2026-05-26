/**
 * Pure helpers for custom expense split inputs (amounts / percentages).
 */

import { ExpenseSplitInput, ExpenseSplitMode } from '@cost-share/shared';

export type UnequalSplitMode = 'percent' | 'amount';

/**
 * UI split mode kept local to the editor (the editor uses 'exact' as the
 * label for amount-mode). Mirrors the type in EditPayerSplitSheet but
 * declared here to avoid a UI → lib import direction.
 */
export type UiSplitMode = 'equal' | 'percent' | 'exact';

export function uiToStoredSplitMode(mode: UiSplitMode): ExpenseSplitMode {
    if (mode === 'equal') return 'equal';
    if (mode === 'percent') return 'percent';
    return 'amount';
}

export function storedSplitModeToUi(mode: ExpenseSplitMode): UiSplitMode {
    if (mode === 'equal') return 'equal';
    if (mode === 'percent') return 'percent';
    return 'exact';
}

export const SPLIT_TOLERANCE = 0.01;

export function areSplitsEqual(amounts: number[]): boolean {
    if (amounts.length <= 1) return true;
    const first = amounts[0];
    return amounts.every(a => Math.abs(a - first) <= SPLIT_TOLERANCE);
}

export function parseSplitInput(raw: string): number {
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

export function computeUnequalTotal(
    mode: UnequalSplitMode,
    values: Record<string, string>,
    memberIds: string[],
    totalAmount: number,
): { total: number; target: number; difference: number; isValid: boolean } {
    const total = memberIds.reduce((sum, id) => sum + parseSplitInput(values[id] ?? ''), 0);
    const target = mode === 'percent' ? 100 : totalAmount;
    const difference = Number((target - total).toFixed(2));
    const isValid = Math.abs(difference) <= SPLIT_TOLERANCE;
    return { total, target, difference, isValid };
}

export function amountsFromPercentValues(
    values: Record<string, string>,
    memberIds: string[],
    totalAmount: number,
): number[] {
    const percents = memberIds.map(id => parseSplitInput(values[id] ?? ''));
    const amounts = percents.map(p => Number(((totalAmount * p) / 100).toFixed(2)));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const remainder = Number((totalAmount - sum).toFixed(2));
    if (Math.abs(remainder) > SPLIT_TOLERANCE && amounts.length > 0) {
        const last = amounts.length - 1;
        amounts[last] = Number((amounts[last] + remainder).toFixed(2));
    }
    return amounts;
}

export function amountsFromAmountValues(
    values: Record<string, string>,
    memberIds: string[],
    totalAmount: number,
): number[] {
    const amounts = memberIds.map(id => parseSplitInput(values[id] ?? ''));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const remainder = Number((totalAmount - sum).toFixed(2));
    if (Math.abs(remainder) > 0 && Math.abs(remainder) <= SPLIT_TOLERANCE && amounts.length > 0) {
        const last = amounts.length - 1;
        amounts[last] = Number((amounts[last] + remainder).toFixed(2));
    }
    return amounts;
}

export function buildUnequalSplits(
    mode: UnequalSplitMode,
    values: Record<string, string>,
    memberIds: string[],
    totalAmount: number,
): ExpenseSplitInput[] {
    const amounts =
        mode === 'percent'
            ? amountsFromPercentValues(values, memberIds, totalAmount)
            : amountsFromAmountValues(values, memberIds, totalAmount);

    return memberIds.map((userId, i) => ({
        userId,
        amount: amounts[i],
    }));
}

export function inferUnequalModeFromSplits(
    splits: { userId: string; amount: number }[],
    totalAmount: number,
): { mode: UnequalSplitMode; values: Record<string, string> } {
    const percents = splits.map(s =>
        totalAmount > 0 ? Number(((s.amount / totalAmount) * 100).toFixed(2)) : 0,
    );
    const roundedPercents = percents.map(p => Math.round(p * 100) / 100);
    const percentSum = roundedPercents.reduce((a, b) => a + b, 0);
    const usePercent = Math.abs(percentSum - 100) <= SPLIT_TOLERANCE;

    const values: Record<string, string> = {};
    splits.forEach((s, i) => {
        values[s.userId] = usePercent
            ? String(roundedPercents[i])
            : s.amount.toFixed(2);
    });

    return { mode: usePercent ? 'percent' : 'amount', values };
}

export function emptySplitValues(memberIds: string[]): Record<string, string> {
    return Object.fromEntries(memberIds.map(id => [id, '']));
}

/**
 * Reconstruct the editor's `unequalValues` map from stored splits for a known
 * non-equal mode. Used by edit-mode prefill once `splitMode` is persisted on
 * the expense row — replaces the lossy `inferUnequalModeFromSplits` guess.
 *
 * Percent values are rounded to two decimals to match how the editor renders
 * them; amount values are formatted as plain `toFixed(2)` strings.
 */
export function buildUnequalValuesFromStored(
    mode: UnequalSplitMode,
    splits: { userId: string; amount: number }[],
    totalAmount: number,
): Record<string, string> {
    const values: Record<string, string> = {};
    splits.forEach(s => {
        if (mode === 'percent') {
            const pct =
                totalAmount > 0 ? Number(((s.amount / totalAmount) * 100).toFixed(2)) : 0;
            values[s.userId] = String(pct);
        } else {
            values[s.userId] = s.amount.toFixed(2);
        }
    });
    return values;
}
