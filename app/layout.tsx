import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaLifecycle from './pwa-lifecycle';

function configuredMetadataBase(): URL | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

const metadataBase = configuredMetadataBase();

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
  title: 'FREE CRM — Celebrate Love of FREE CRM',
  description: 'Celebrate the relationships behind your work with a private, open-source CRM operating system for solopreneurs.',
  applicationName: 'FREE CRM',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg', apple: '/icon-192.svg' },
  openGraph: {
    type: 'website',
    title: 'FREE CRM — Celebrate Love of FREE CRM',
    description: 'Customers, pipeline, work, billing, service, analytics, and integrations in one private workspace.',
    ...(metadataBase ? { images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Celebrate Love of FREE CRM, with a solid-red bald eagle carrying the FREE banner into place before CRM.' }] } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FREE CRM — Celebrate Love of FREE CRM',
    description: 'Customers, pipeline, work, billing, service, analytics, and integrations in one private workspace.',
    ...(metadataBase ? { images: ['/og.png'] } : {}),
  },
};

export const viewport: Viewport = {
  themeColor: '#002868',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<PwaLifecycle /></body>
    </html>
  );
}
