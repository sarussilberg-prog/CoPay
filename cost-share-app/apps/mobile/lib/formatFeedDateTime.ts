/**
 * Locale-aware date + time for group feed bubbles.
 */

import { toDate, type DateLike } from './dateUtils';

export function formatFeedDateTime(value: DateLike, language: 'en' | 'he'): string {
    const date = toDate(value);
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    return date.toLocaleString(locale, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        hour: '2-digit',
        minute: '2-digit',
    });
}
