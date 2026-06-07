import { captureError } from '../lib/captureError';
import { supabase } from '../lib/supabase';
import { clearLocalAuthSession } from './auth.service';
// Note: account.service has no user-facing toasts of its own; callers translate
// the returned i18n key and show the toast. So this file keeps using captureError
// directly (Sentry-only, no toast) rather than handleError.

export interface DeleteAccountResult {
    ok: boolean;
    error?: string; // i18n key
}

export interface OpenBalancesSummary {
    hasOpenBalances: boolean;
    totalOwed: number;
    totalOwing: number;
    currency: string;
}

interface SummaryRow {
    currency: string;
    owed: number;
    owe: number;
    net: number;
}

const FALLBACK_CURRENCY = 'ILS';

/**
 * Soft-delete the signed-in user's account.
 * On RPC success → also signs out from all devices. On RPC failure → leaves the session intact.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
        captureError(rpcError, {
            tags: { service: 'account', op: 'deleteMyAccount' },
        });
        console.error('deleteMyAccount: RPC failed', rpcError);
        return { ok: false, error: 'deleteAccount.deleteFailed' };
    }

    // delete_my_account bans auth.users server-side; skip global revoke and force a
    // local session wipe + Zustand reset so App.tsx routes to Login immediately.
    await clearLocalAuthSession();

    return { ok: true };
}

/**
 * Pre-deletion check: returns aggregate open-balance info for the signed-in user.
 * Returns hasOpenBalances=false on RPC error so the warning sheet renders without
 * the banner (the user can still proceed; we don't block them on a flaky network).
 */
export async function getMyOpenBalances(): Promise<OpenBalancesSummary> {
    const { data, error } = await supabase.rpc('get_my_open_balances');

    if (error || !data) {
        if (error) {
            captureError(error, {
                tags: { service: 'account', op: 'getMyOpenBalances' },
            });
            console.warn('getMyOpenBalances: RPC failed', error);
        }
        return { hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: FALLBACK_CURRENCY };
    }

    const rows: SummaryRow[] = Array.isArray((data as any)?.summary) ? (data as any).summary : [];

    if (rows.length === 0) {
        return { hasOpenBalances: false, totalOwed: 0, totalOwing: 0, currency: FALLBACK_CURRENCY };
    }

    let totalOwed = 0;
    let totalOwing = 0;
    let dominant: SummaryRow = rows[0];

    for (const row of rows) {
        totalOwed += Number(row.owed) || 0;
        totalOwing += Number(row.owe) || 0;
        if (Math.abs(Number(row.net) || 0) > Math.abs(Number(dominant.net) || 0)) {
            dominant = row;
        }
    }

    return {
        hasOpenBalances: true,
        totalOwed,
        totalOwing,
        currency: dominant.currency || FALLBACK_CURRENCY,
    };
}
