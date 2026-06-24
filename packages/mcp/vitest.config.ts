import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@slack-cards/core': resolve(import.meta.dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
