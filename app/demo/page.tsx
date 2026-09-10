import type { Metadata } from 'next';
import DemoStage from './demo-stage';

export const metadata: Metadata = {
  title: 'FREE CRM — The platform, in ten chapters',
  description: 'A screen-share-ready guide to FREE CRM: relationships, business operations, second brain, adaptive intelligence, guarded agents, and user ownership.',
};

export default function DemoPage() { return <DemoStage />; }
