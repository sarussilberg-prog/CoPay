import type { MetadataRoute } from 'next';
import { APP_BRAND_COLOR, APP_BRAND_TITLE } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_BRAND_TITLE,
    short_name: APP_BRAND_TITLE,
    description: 'Split expenses with friends',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: APP_BRAND_COLOR,
    lang: 'he',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
