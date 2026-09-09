import type { Metadata } from 'next';
import BrainWorkspace from './brain-workspace';

export const metadata: Metadata = {
  title: 'Second brain — FREE CRM',
  description: 'Capture your knowledge, connect your relationships, and ask your own sources. Open source and yours to keep.',
  robots: { index: false, follow: false },
};

export default function BrainPage() { return <BrainWorkspace />; }
