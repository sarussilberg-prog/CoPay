/** Locale-aware date/time formatters for group export. */

import { toDate, type DateLike } from './dateUtils';

export function formatExportDate(value: DateLike, language: 'en' | 'he'): string {
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    return toDate(value).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function formatExportTime(value: DateLike, language: 'en' | 'he'): string {
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    return toDate(value).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
    });
}
