/**
 * Central toast API — localized via i18n at show time, consistent layout via toastConfig.
 */
import Toast, { type ToastShowParams } from 'react-native-toast-message';
import i18n from '../i18n';

export type AppToastType = 'success' | 'error' | 'info' | 'warning';

export type AppToastOptions = {
    type: AppToastType;
    /** i18n key for primary line */
    titleKey?: string;
    /** Pre-translated primary line (e.g. dynamic invite copy) */
    title?: string;
    titleParams?: Record<string, unknown>;
    /** i18n key for secondary line */
    messageKey?: string;
    /** Pre-translated or API secondary line */
    message?: string;
    messageParams?: Record<string, unknown>;
    visibilityTime?: number;
};

function resolveLine(
    key: string | undefined,
    literal: string | undefined,
    params?: Record<string, unknown>,
): string | undefined {
    if (literal !== undefined && literal !== '') return literal;
    if (key) return i18n.t(key, params);
    return undefined;
}

export function showAppToast(options: AppToastOptions): void {
    const text1 = resolveLine(options.titleKey, options.title, options.titleParams);
    if (!text1) return;

    const text2 = resolveLine(options.messageKey, options.message, options.messageParams);
    const payload: ToastShowParams = {
        type: options.type,
        text1,
        position: 'top',
        visibilityTime: options.visibilityTime ?? 3500,
    };
    if (text2) payload.text2 = text2;
    Toast.show(payload);
}

/** Success with title + optional detail (common.success + message). */
export function showSuccessToast(messageKey: string, titleKey = 'common.success'): void {
    showAppToast({ type: 'success', titleKey, messageKey });
}

/** Single-line success (friends, archive, link copied, etc.). */
export function showSuccessMessage(titleKey: string, titleParams?: Record<string, unknown>): void {
    showAppToast({ type: 'success', titleKey, titleParams });
}

/** Error with title + optional detail. */
export function showErrorToast(titleKey: string, messageKey?: string, message?: string): void {
    showAppToast({ type: 'error', titleKey, messageKey, message });
}

export function showInfoToast(titleKey: string, titleParams?: Record<string, unknown>): void {
    showAppToast({ type: 'info', titleKey, titleParams });
}

export function showWarningToast(titleKey: string, messageKey?: string): void {
    showAppToast({ type: 'warning', titleKey, messageKey });
}

/** Map shared split validation to localized toast detail. */
export function expenseSplitValidationMessage(validation: {
    valid: boolean;
    message?: string;
}): string {
    if (validation.valid) return '';
    if (validation.message?.includes('negative')) {
        return i18n.t('expenses.invalidAmount');
    }
    return i18n.t('expenses.splitMismatch');
}
