import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Clover — Your relationships, remembered',
  description: 'A private, open-source CRM and second brain for the people who matter.',
  applicationName: 'Clover',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    title: 'Clover — Your relationships, remembered',
    description: 'A private, open-source relationship CRM that runs on your device.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Clover — Your relationships, remembered.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clover — Your relationships, remembered',
    description: 'A private, open-source relationship CRM that runs on your device.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#245c47',
  colorScheme: 'light',
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
