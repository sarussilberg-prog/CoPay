import type { Language } from '@cost-share/shared';
import { DEFAULT_CURRENCY } from '@cost-share/shared';

/** Default currency when the UI is Hebrew (until the user picks another). */
export const HEBREW_APP_DEFAULT_CURRENCY = 'ILS';

/** Prefill for create-group / onboarding currency fields. */
export function initialCreateGroupCurrency(
    appLanguage: Language,
    user?: { defaultCurrency?: string } | null,
): string {
    if (appLanguage === 'he') return HEBREW_APP_DEFAULT_CURRENCY;
    return user?.defaultCurrency ?? DEFAULT_CURRENCY;
}

/** Settings / profile fallback when no stored user currency is available. */
export function defaultCurrencyForAppLanguage(appLanguage: Language): string {
    if (appLanguage === 'he') return HEBREW_APP_DEFAULT_CURRENCY;
    return DEFAULT_CURRENCY;
}
