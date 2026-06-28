import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
import { cpSync, existsSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  banner: { js: '#!/usr/bin/env node' },
  external: [],
  minify: false,
  sourcemap: false,
});

if (result.errors.length > 0) {
  process.exit(1);
}

await chmod('dist/bundle.cjs', 0o755);

cpSync('../../templates', 'dist/templates', { recursive: true });

if (!existsSync('dist/templates/ci-cd/1.0.0/skeleton.json')) {
  console.error('bundle: templates were not copied into dist/templates');
  process.exit(1);
}
