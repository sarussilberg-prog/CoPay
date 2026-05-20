import { supabase } from '../lib/supabase';

export interface DeleteAccountResult {
    ok: boolean;
    error?: string; // i18n key
}

/**
 * Soft-delete the signed-in user's account.
 * On RPC success → also signs out. On RPC failure → leaves the session intact.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
        console.error('deleteMyAccount: RPC failed', rpcError);
        return { ok: false, error: 'deleteAccount.deleteFailed' };
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
        // The deactivation already succeeded. Log and proceed.
        console.warn('deleteMyAccount: signOut failed after deactivation', signOutError);
    }

    return { ok: true };
}
