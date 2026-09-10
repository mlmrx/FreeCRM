import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
      'cloudflare:workers': new URL('./tests/cloudflare-workers-stub.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['lib/crm-platform.ts', 'server/validation.ts', 'lib/brain-client.ts', 'lib/brain-retrieval.ts', 'server/brain.ts', 'server/brain-ai.ts', 'lib/adaptive-engine.ts', 'lib/adaptive-client.ts', 'server/adaptive.ts', 'server/capability-scout.ts', 'lib/demo-content.ts', 'lib/workspace-navigation.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
