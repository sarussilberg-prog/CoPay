/**
 * Admin Service — admin-only RPCs (gated by is_app_admin() on the DB).
 */
import { supabase } from '../lib/supabase';

export interface DeletedAccount {
    userId: string;
    email: string;
    deletedAt: Date;
    reason: string;
    openBalanceSnapshot: unknown;
    notes: string | null;
}

export interface RestoreResult {
    ok: boolean;
    error?: string; // i18n key
}

type Row = {
    user_id: string;
    email: string;
    deleted_at: string;
    reason: string;
    open_balance_snapshot: unknown;
    notes: string | null;
};

export async function listDeletedAccounts(): Promise<DeletedAccount[]> {
    const { data, error } = await supabase.rpc('admin_list_deleted_accounts');
    if (error || !data) {
        if (error) console.warn('listDeletedAccounts: RPC failed', error);
        return [];
    }
    return (data as Row[]).map((r) => ({
        userId: r.user_id,
        email: r.email,
        deletedAt: new Date(r.deleted_at),
        reason: r.reason,
        openBalanceSnapshot: r.open_balance_snapshot,
        notes: r.notes,
    }));
}

export async function restoreDeletedAccount(userId: string): Promise<RestoreResult> {
    const { error } = await supabase.rpc('admin_restore_deleted_account', { p_user_id: userId });
    if (!error) return { ok: true };

    console.warn('restoreDeletedAccount: RPC failed', error);
    if (error.message === 'not_authorized') {
        return { ok: false, error: 'admin.errors.notAuthorized' };
    }
    return { ok: false, error: 'admin.deletedUsers.restoreError' };
}

import type { AdminPlatformMetrics } from '@cost-share/shared';

type MetricsRow = {
    version: number;
    generatedAt: string;
    users: AdminPlatformMetrics['users'];
    groups: AdminPlatformMetrics['groups'];
};

export async function fetchAdminPlatformMetrics(): Promise<AdminPlatformMetrics | null> {
    const { data, error } = await supabase.rpc('admin_get_platform_metrics');
    if (error || !data) {
        if (error) console.warn('fetchAdminPlatformMetrics: RPC failed', error);
        return null;
    }
    const r = data as MetricsRow;
    return {
        version: r.version,
        generatedAt: r.generatedAt,
        users: {
            registered: Number(r.users?.registered ?? 0),
            deleted: Number(r.users?.deleted ?? 0),
        },
        groups: {
            active: Number(r.groups?.active ?? 0),
            archived: Number(r.groups?.archived ?? 0),
            deleted: Number(r.groups?.deleted ?? 0),
            manualArchiveMemberships: Number(r.groups?.manualArchiveMemberships ?? 0),
        },
    };
}
