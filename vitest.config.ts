import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    // tests/e2e needs a built dist first and runs via vitest.e2e.config.ts.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', 'src/client/types.ts'],
    },
  },
});
