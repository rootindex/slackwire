import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@slackwire/core': resolve(import.meta.dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // main.ts is a process entrypoint (stdio transport + process.exit); it is
      // covered by the live integration path, not by these in-memory unit tests.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // Floors sit a few points below measured (stmts 97 / branch 66 / funcs 80
      // / lines 97) so the gate is a real regression guard, not a flaky ceiling.
      thresholds: {
        statements: 90,
        branches: 60,
        functions: 72,
        lines: 90,
      },
    },
  },
});
