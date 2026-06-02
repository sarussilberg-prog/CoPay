/** App brand name — always English in headers (not i18n). */
export const APP_BRAND_TITLE = 'Kupay';

/** Production web hostname (DNS). Brand display name is {@link APP_BRAND_TITLE}. */
export const APP_WEB_HOST = 'kupa.pro';

/** Canonical HTTPS origin for invites, auth callbacks, and legal URLs. */
export const APP_WEB_ORIGIN = `https://${APP_WEB_HOST}`;

/** Logo artwork fills this fraction of its square frame (rest is transparent padding). */
export const APP_LOGO_CONTENT_SCALE = 0.82;

/** Canonical brand title color (matches mobile `colors.primaryDark`). */
export const APP_BRAND_COLOR = '#3B82F6';

/** Canonical brand title size for hero / auth surfaces. */
export const APP_BRAND_FONT_SIZE_PX = 30;

/** Canonical brand title weight. */
export const APP_BRAND_FONT_WEIGHT = '700' as const;
