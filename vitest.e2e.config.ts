import { defineConfig } from 'vitest/config';

/**
 * Functional (e2e) suite: spawns the built dist/bin.js against a local mock
 * Yuque API. Requires `npm run build` first; run via `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
