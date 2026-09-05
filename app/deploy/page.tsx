import type { Metadata } from 'next';
import DeploymentCenter from './deployment-center';

export const metadata: Metadata = {
  title: 'Deploy FREE CRM — Your cloud, your credentials',
  description: 'Launch FREE CRM directly from GitHub main on Vercel, on Cloudflare, or locally without sharing provider credentials with FREE CRM.',
};

export default async function DeployPage({ searchParams }: { searchParams: Promise<{ path?: string | string[] }> }) {
  const { path } = await searchParams;
  const initialPath = path === 'docker' || path === 'cloudflare' || path === 'github' ? path : 'vercel';
  return <DeploymentCenter key={initialPath} initialPath={initialPath} />;
}
