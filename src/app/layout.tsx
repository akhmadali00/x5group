import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'x5group',
  description: 'Jamoa ishini kuzatish platformasi',
  robots: { index: false, follow: false },
  applicationName: 'x5group',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'x5group', statusBarStyle: 'default' }
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0071e3' };

const V = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href={`/app/app.css?v=${V}`} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
