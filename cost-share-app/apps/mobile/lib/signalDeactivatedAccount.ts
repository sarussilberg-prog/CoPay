import { markDeactivationNoticePending } from './deactivationNoticeStorage';

/** Flip in-memory + persisted flags so LoginScreen can show the deleted-account notice. */
export async function signalDeactivatedAccount(
    setPendingDeactivationNotice: (value: boolean) => void,
): Promise<void> {
    setPendingDeactivationNotice(true);
    await markDeactivationNoticePending();
}
