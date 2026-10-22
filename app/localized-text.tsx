'use client';

import { cloneElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { useI18n } from './i18n-provider';
import { translateUi, uiTemplate } from '@/lib/ui-i18n';

/** Only source-authored UI messages belong here. Record text stays outside T. */
export function T({ text, values = {} }: { text: string; values?: Record<string, ReactNode> }) {
  const { locale } = useI18n();
  return uiTemplate(locale, text).split(/(\{\w+\})/g).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{key && Object.hasOwn(values, key) ? values[key] : part}</Fragment>;
  });
}

/** Translates only explicitly named presentation attributes, never input values. */
export function LocalizedAttributes({ children, names = [], messages = {} }: { children: ReactElement<object>; names?: string[]; messages?: Record<string, { text: string; values?: Record<string, string | number> }> }) {
  const { locale } = useI18n();
  const translated: Record<string, unknown> = {};
  const props = children.props as Record<string, unknown>;
  for (const name of names) {
    if (['title', 'placeholder', 'aria-label', 'alt'].includes(name) && typeof props[name] === 'string') translated[name] = uiTemplate(locale, props[name] as string);
  }
  for (const [name, message] of Object.entries(messages)) {
    // This component cannot alter identifiers, links, event handlers, or customer input.
    if (['title', 'placeholder', 'aria-label', 'alt'].includes(name)) translated[name] = translateUi(locale, message.text, message.values);
  }
  return cloneElement(children, translated);
}

/** Static editorial dates use the same selected language as the surrounding page. */
export function LocalizedDate({ date }: { date: string }) {
  const { locale } = useI18n();
  return <time dateTime={date}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</time>;
}
