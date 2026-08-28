import type { Metadata } from 'next';
import DeploymentCenter from './deployment-center';

export const metadata: Metadata = {
  title: 'Deploy FREE CRM — Your cloud, your credentials',
  description: 'Launch a private FREE CRM with Cloudflare, GitHub Actions, or Docker without sharing provider credentials with FREE CRM.',
};

export default function DeployPage() {
  return <DeploymentCenter />;
}
