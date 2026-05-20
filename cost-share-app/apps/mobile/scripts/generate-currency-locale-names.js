/**
 * Regenerates lib/currencyLocaleNames.ts from CLDR via Intl.DisplayNames.
 * Run from apps/mobile: node scripts/generate-currency-locale-names.js
 */

const fs = require('fs');
const path = require('path');
const currencyCodes = require('currency-codes');

const he = {};
const en = {};
const dnHe = new Intl.DisplayNames(['he'], { type: 'currency' });
const dnEn = new Intl.DisplayNames(['en'], { type: 'currency' });

for (const { code } of currencyCodes.data) {
    try {
        const h = dnHe.of(code);
        const e = dnEn.of(code);
        if (h && h !== code) he[code] = h;
        if (e && e !== code) en[code] = e;
    } catch {
        /* skip invalid codes */
    }
}

const outPath = path.join(__dirname, '..', 'lib', 'currencyLocaleNames.ts');
const content = `/**
 * Pre-generated currency display names (CLDR via Intl).
 * Fallback when Intl.DisplayNames is unavailable (e.g. Hermes on device).
 * Regenerate: node scripts/generate-currency-locale-names.js
 */
export const CURRENCY_LOCALE_NAMES: Record<'he' | 'en', Record<string, string>> = ${JSON.stringify({ he, en }, null, 2)};
`;

fs.writeFileSync(outPath, content);
console.log(`Wrote ${outPath} (${Object.keys(he).length} he, ${Object.keys(en).length} en)`);
