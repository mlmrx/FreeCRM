import type { Metadata } from 'next';
import DeploymentCenter from './deployment-center';

export const metadata: Metadata = {
  title: 'Deploy FREE CRM — Your cloud, your credentials',
  description: 'Launch FREE CRM directly from GitHub main on Vercel, on Cloudflare, or locally without sharing provider credentials with FREE CRM.',
};

export default function DeployPage() {
  return <DeploymentCenter />;
}
