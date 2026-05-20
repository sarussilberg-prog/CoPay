export {
    APP_BRAND_TITLE,
    APP_BRAND_COLOR,
    APP_BRAND_FONT_SIZE_PX,
    APP_BRAND_FONT_WEIGHT,
} from '@cost-share/shared';

import {
    APP_BRAND_COLOR,
    APP_BRAND_FONT_SIZE_PX,
    APP_BRAND_FONT_WEIGHT,
} from '@cost-share/shared';

export const appBrandTitleStyle = {
    fontSize: `${APP_BRAND_FONT_SIZE_PX / 16}rem`,
    fontWeight: APP_BRAND_FONT_WEIGHT,
    color: APP_BRAND_COLOR,
    margin: '0 0 8px 0',
    fontFamily: 'inherit',
} as const;
