import type { Metadata } from 'next';
import { APP_BRAND_COLOR, APP_BRAND_TITLE } from '@/lib/brand';

export const metadata: Metadata = {
  title: APP_BRAND_TITLE,
  applicationName: APP_BRAND_TITLE,
  description: 'Split expenses with friends',
  appleWebApp: {
    capable: true,
    title: APP_BRAND_TITLE,
    statusBarStyle: 'default',
  },
  themeColor: APP_BRAND_COLOR,
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
