import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';

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
