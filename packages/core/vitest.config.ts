import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Floors sit a few points below measured (stmts 94 / branch 78 / funcs 97
      // / lines 94) so the gate is a real regression guard, not a flaky ceiling.
      thresholds: {
        statements: 88,
        branches: 72,
        functions: 90,
        lines: 88,
      },
    },
  },
});
