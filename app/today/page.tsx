import type { Metadata } from 'next';
import TodayWorkspace from './today-workspace';

export const metadata: Metadata = {
  title: 'Today — FREE CRM',
  description: 'Your private daily briefing. Relationships, knowledge, and useful next steps, with you in control.',
  robots: { index: false, follow: false },
};

export default function TodayPage() { return <TodayWorkspace />; }
