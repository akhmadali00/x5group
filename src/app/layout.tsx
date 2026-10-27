import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'x5group',
  description: 'Jamoa ishini kuzatish platformasi',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

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
