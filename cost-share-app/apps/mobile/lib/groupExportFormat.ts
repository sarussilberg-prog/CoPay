/** Locale-aware date/time formatters for group export. */

export function htmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Wraps the app brand name in export HTML with canonical styling. */
export function formatBrandFooter(footer: string, brandTitle = 'Kupay'): string {
    const parts = footer.split(brandTitle);
    return parts
        .map((part, index) =>
            htmlEscape(part)
            + (index < parts.length - 1 ? `<span class="brand-name">${brandTitle}</span>` : ''),
        )
        .join('');
}

export function formatExportDate(date: Date, language: 'en' | 'he'): string {
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function formatExportTime(date: Date, language: 'en' | 'he'): string {
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
