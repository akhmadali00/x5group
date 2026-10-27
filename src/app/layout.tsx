import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'x5group',
  description: 'Jamoa ishini kuzatish platformasi',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const V = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href={`/app/app.css?v=${V}`} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
