import type { Metadata } from 'next';
import StartGuide from './start-guide';

export const metadata: Metadata = {
  title: 'Find your path — FREE CRM',
  description: 'A short conversation to find the FREE CRM profile and setup that fit your work.',
};

export default function StartPage() {
  return <StartGuide />;
}
