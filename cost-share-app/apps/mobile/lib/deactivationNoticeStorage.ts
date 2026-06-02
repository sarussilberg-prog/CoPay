import { authStorage } from './authStorage';

const DEACTIVATION_NOTICE_KEY = '@kupay/pending_deactivation_notice';

/** Persist across web OAuth full-page reloads (zustand alone is lost). */
export async function markDeactivationNoticePending(): Promise<void> {
    await authStorage.setItem(DEACTIVATION_NOTICE_KEY, '1');
}

export async function consumeDeactivationNoticePending(): Promise<boolean> {
    const value = await authStorage.getItem(DEACTIVATION_NOTICE_KEY);
    if (value !== '1') return false;
    await authStorage.removeItem(DEACTIVATION_NOTICE_KEY);
    return true;
}

export async function clearDeactivationNoticePending(): Promise<void> {
    await authStorage.removeItem(DEACTIVATION_NOTICE_KEY);
}
