'use client';

import { useI18n } from '@/app/i18n-provider';

/** These labels come from the readiness checklist, never from workspace data. */
export default function ReadinessSourceLink({ href, source, title }: { href: string; source: string; title: string }) {
  const { text } = useI18n();
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={text('{source} for {title}', { source: text(source), title: text(title) })}>{text(source)} ↗</a>;
}
