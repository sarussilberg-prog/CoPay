import * as Crypto from 'expo-crypto';

export const PENDING_ID_PREFIX = 'pending_' as const;

export function createPendingExpenseId(): string {
    return `${PENDING_ID_PREFIX}${Crypto.randomUUID()}`;
}

export function isPendingExpenseId(id: string | null | undefined): id is string {
    return typeof id === 'string' && id.startsWith(PENDING_ID_PREFIX);
}

export function addExpenseMutationKey(pendingId: string): readonly ['addExpense', string] {
    return ['addExpense', pendingId] as const;
}
