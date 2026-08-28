import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'FREE CRM — Celebrate Love of CRM',
  description: 'Celebrate the relationships behind your work with a private, open-source CRM operating system for solopreneurs.',
  applicationName: 'FREE CRM',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    title: 'FREE CRM — Celebrate Love of CRM',
    description: 'Customers, pipeline, work, billing, service, analytics, and integrations in one private workspace.',
    images: [{ url: '/og.png', width: 1729, height: 910, alt: 'Celebrate Love of CRM, with an original navy wolf.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FREE CRM — Celebrate Love of CRM',
    description: 'Customers, pipeline, work, billing, service, analytics, and integrations in one private workspace.',
    images: ['/og.png'],
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
      <body>{children}</body>
    </html>
  );
}
