import { captureError } from './captureError';
import { showErrorToast } from './appToast';

export type HandleErrorOptions = {
    /** User-facing toast. Required — this layer is for errors the user sees. */
    toast: {
        titleKey: string;
        messageKey?: string;
        message?: string;
    };
    tags?: Record<string, string | number | boolean | null | undefined>;
    extra?: Record<string, unknown>;
};

/**
 * Single entry point for user-facing system errors: captures to Sentry with
 * the toast text + provided context, then shows the toast. Use this in catch
 * blocks where the user will see an error toast and we also want to know.
 *
 * - For pure validation/UX guidance (no underlying Error): use `showErrorToast`.
 * - For background / silent failures (no toast): use `captureError`.
 */
export function handleError(error: unknown, options: HandleErrorOptions): void {
    captureError(error, {
        tags: options.tags,
        extra: {
            ...options.extra,
            toastTitleKey: options.toast.titleKey,
            toastMessageKey: options.toast.messageKey,
        },
    });
    if (__DEV__) {
        const scope = options.tags?.service ? `[${options.tags.service}] ` : '';
        // eslint-disable-next-line no-console
        console.error(`${scope}${options.toast.titleKey}`, error);
    }
    showErrorToast(options.toast.titleKey, options.toast.messageKey, options.toast.message);
}
