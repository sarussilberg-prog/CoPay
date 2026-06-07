import type { UpdateExpenseDto } from '@cost-share/shared';

export type PendingFollowUp =
    | { kind: 'edit'; payload: UpdateExpenseDto }
    | { kind: 'delete' };

const followUps = new Map<string, PendingFollowUp>();

export function registerPendingFollowUp(pendingId: string, followUp: PendingFollowUp): void {
    followUps.set(pendingId, followUp);
}

export function takePendingFollowUp(pendingId: string): PendingFollowUp | null {
    const value = followUps.get(pendingId) ?? null;
    if (value) followUps.delete(pendingId);
    return value;
}

export function hasPendingFollowUp(pendingId: string): boolean {
    return followUps.has(pendingId);
}

/** Test-only — drains the registry so per-test state doesn't leak. */
export function __resetPendingFollowUpsForTests(): void {
    followUps.clear();
}
