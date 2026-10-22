import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('static language catalog loading', () => {
  it('preserves unknown keys that match object prototype properties', async () => {
    const { installUiCatalog, translateUi } = await import('@/lib/ui-i18n');
    installUiCatalog('es-ES', {});
    for (const source of ['constructor', 'toString', '__proto__']) expect(translateUi('es-ES', source)).toBe(source);
  });

  it('does not fetch any catalog for English', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog } = await import('@/lib/ui-i18n');
    await loadUiCatalog('en-US');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches only the requested bundled catalog and shares concurrent requests', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog, translateUi } = await import('@/lib/ui-i18n');
    const first = loadUiCatalog('es-ES');
    const second = loadUiCatalog('es-ES');
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/locales/es-ES.json', { credentials: 'same-origin', cache: 'no-cache', signal: expect.any(AbortSignal) });
    finish(Response.json({ 'Contacts': 'Contactos' }));
    await Promise.all([first, second]);
    await loadUiCatalog('es-ES');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(translateUi('es-ES', 'Contacts')).toBe('Contactos');
  });

  it('never sends interpolated customer content to a translation service', async () => {
    const fetch = vi.fn(async () => Response.json({ 'Open {name}': 'Abrir {name}' }));
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog, translateUi } = await import('@/lib/ui-i18n');
    await loadUiCatalog('es-ES');
    const customer = 'Private customer <敏感> — Jane & Co';
    expect(translateUi('es-ES', 'Open {name}', { name: customer })).toBe(`Abrir ${customer}`);
    expect(translateUi('es-ES', customer)).toBe(customer);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(customer);
  });

  it('allows retry after an unsuccessful request', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ Home: 'Accueil' }));
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog, translateUi } = await import('@/lib/ui-i18n');
    await expect(loadUiCatalog('fr-FR')).rejects.toThrow('unavailable');
    expect(translateUi('fr-FR', 'Home')).toBe('Home');
    await loadUiCatalog('fr-FR');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(translateUi('fr-FR', 'Home')).toBe('Accueil');
  });

  it('rejects paths and malformed catalog responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(['invalid'])).mockResolvedValueOnce(Response.json({ Home: 42 }));
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog } = await import('@/lib/ui-i18n');
    await expect(loadUiCatalog('../api/records')).rejects.toThrow('Invalid language');
    expect(fetch).not.toHaveBeenCalled();
    await expect(loadUiCatalog('fr-FR')).rejects.toThrow('Invalid language catalog');
    await expect(loadUiCatalog('fr-FR')).rejects.toThrow('Invalid language catalog');
  });

  it('aborts a stalled download, releases the pending request and allows a retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const { loadUiCatalog, translateUi } = await import('@/lib/ui-i18n');
    const result = loadUiCatalog('fr-FR').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toBeInstanceOf(DOMException);
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(translateUi('fr-FR', 'Home')).toBe('Home');
    fetch.mockResolvedValueOnce(Response.json({ Home: 'Accueil' }));
    await loadUiCatalog('fr-FR');
    expect(translateUi('fr-FR', 'Home')).toBe('Accueil');
    expect(vi.getTimerCount()).toBe(0);
  });
});
