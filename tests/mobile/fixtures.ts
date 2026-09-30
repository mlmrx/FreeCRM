import { test as base, expect } from '@playwright/test';

export const privatePrefixes = ['/workspace', '/brain', '/today', '/api', '/auth'];
export function isPrivatePath(path: string) {
  return privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const test = base.extend<{ publicNetworkGuard: void }>({
  publicNetworkGuard: [async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const unexpected: string[] = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || isPrivatePath(url.pathname) || !['GET', 'HEAD'].includes(request.method())) {
        // Never include a query, credential, header, body, or customer response in evidence.
        unexpected.push(url.origin !== origin ? 'cross-origin request' : `${request.method()} private or mutating request`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await use();
    expect(unexpected, 'Public mobile surfaces must not request private data, send mutations, or contact another origin.').toEqual([]);
  }, { auto: true }],
});

export { expect };
