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
      // main.ts is a process entrypoint (IIFE + process.exit); it is exercised
      // by main.test.ts which spawns the built bundle, so it does not register
      // as source coverage here.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // Floors sit a few points below measured (stmts 80 / branch 69 / funcs 76
      // / lines 80) so the gate is a real regression guard, not a flaky ceiling.
      thresholds: {
        statements: 74,
        branches: 63,
        functions: 70,
        lines: 74,
      },
    },
  },
});
