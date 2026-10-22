/** Static product-copy catalogs. No user or workspace text is sent for translation. */
const catalogs = new Map<string, Readonly<Record<string, string>>>();
const requests = new Map<string, Promise<void>>();

export function installUiCatalog(locale: string, messages: Record<string, string>): void {
  catalogs.set(locale, Object.freeze({ ...messages }));
}

export async function loadUiCatalog(locale: string): Promise<void> {
  if (locale === 'en-US' || catalogs.has(locale)) return;
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(locale)) throw new Error('Invalid language.');
  const pending = requests.get(locale);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    // A stalled download must not leave the chooser disabled indefinitely.
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/locales/${locale}.json`, { credentials: 'same-origin', cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('The language catalog is unavailable.');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.values(body).some((value) => typeof value !== 'string')) throw new Error('Invalid language catalog.');
      installUiCatalog(locale, body as Record<string, string>);
    } finally {
      clearTimeout(timeout);
    }
  })();
  requests.set(locale, request);
  try { await request; } finally { requests.delete(locale); }
}

export function uiTemplate(locale: string, source: string): string {
  const whitespace = /^(\s*)([\s\S]*?)(\s*)$/.exec(source)!;
  const core = whitespace[2].replace(/\s+/g, ' ');
  const catalog = catalogs.get(locale);
  const translated = catalog && Object.hasOwn(catalog, core) ? catalog[core] : undefined;
  return translated ? `${whitespace[1]}${translated}${whitespace[3]}` : source;
}

export function translateUi(locale: string, source: string, values: Record<string, string | number> = {}): string {
  return uiTemplate(locale, source).replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
