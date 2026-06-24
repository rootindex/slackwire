import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from './render.js';
import { SchemaError } from './errors.js';
import type { FsAdapter } from './loader.js';

const rootDir = resolve(import.meta.dirname, '../../../');
const catalogPath = resolve(rootDir, 'templates');
const partialsDir = resolve(rootDir, 'templates/partials');

function makeNodeFs(): FsAdapter {
  return {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) =>
      readdirSync(path, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name),
  };
}

function loadPartials(dir: string, fs: FsAdapter): Record<string, object[]> {
  const entries = readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.json'));
  const result: Record<string, object[]> = {};
  for (const entry of entries) {
    const name = entry.name.replace(/\.json$/, '');
    result[name] = JSON.parse(fs.readFile(resolve(dir, entry.name))) as object[];
  }
  return result;
}

const BASE_PAYLOAD = {
  title: '⏳ CI · healthcart-v2 · #2451 · RUNNING',
  ref: 'feature/checkout-fix',
  short_sha: 'a1b9f2c',
  description: 'Fix Stitch amount overflow',
  author: 'Naledi',
  icon_url: 'https://placehold.co/72x72/ecb22e/ffffff/png?text=RUN',
  icon_alt: 'running',
  steps_text: '⏳ Install     ⏳ Lint     ⏳ Test     ⏳ Build     ⏳ Deploy',
  progress_bar: '🟨🟨🟨⬜⬜  3 of 5 · running…',
  runner: 'ci-3',
  test_count: '142',
  coverage: '84.2%',
  finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
  primary_label: '⏳ Running',
  primary_url: 'https://ci.example.com/healthcart-v2/2451',
  logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
};

const RUNNING_PAYLOAD = { ...BASE_PAYLOAD };

const PASSED_PAYLOAD = {
  ...BASE_PAYLOAD,
  title: '✅ CI · healthcart-v2 · #2451 · PASSED',
  icon_url: 'https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS',
  icon_alt: 'passed',
  steps_text: '✅ Install     ✅ Lint     ✅ Test     ✅ Build     ✅ Deploy',
  progress_bar: '🟩🟩🟩🟩🟩  5 of 5 · 3m08s · *deployed to staging* 🚀',
  primary_label: '🚀 Staging',
  primary_url: 'https://staging.example.com/healthcart-v2',
};

const FAILED_PAYLOAD = {
  ...BASE_PAYLOAD,
  title: '❌ CI · healthcart-v2 · #2451 · FAILED',
  icon_url: 'https://placehold.co/72x72/e01e5a/ffffff/png?text=FAIL',
  icon_alt: 'failed',
  steps_text: '✅ Install     ✅ Lint     ❌ Test     ⬜ Build     ⬜ Deploy',
  progress_bar: '🟥🟥🟥⬜⬜  2 of 5 · 1m22s · *test stage failed*',
  primary_label: '❌ View failure',
};

const TEMPLATE_REF = { catalogPath, name: 'ci-cd', version: '1.0.0' };

describe('template: ci-cd/1.0.0', () => {
  it('renders the running state with the amber accent', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, RUNNING_PAYLOAD, {
      fs,
      partials,
      themeToken: '#ecb22e',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).toContain('#ecb22e');
    expect(output).toContain('RUNNING');
  });

  it('morphs to the passed state with the green accent on the same template', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, PASSED_PAYLOAD, {
      fs,
      partials,
      themeToken: '#2eb67d',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).toContain('#2eb67d');
    expect(output).toContain('PASSED');
  });

  it('morphs to the failed state with the red accent', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, FAILED_PAYLOAD, {
      fs,
      partials,
      themeToken: '#e01e5a',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).toContain('#e01e5a');
    expect(output).toContain('FAILED');
  });

  it('renders without an Added by footer by default', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, RUNNING_PAYLOAD, {
      fs,
      partials,
      themeToken: '#ecb22e',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).not.toContain('Added by');
  });

  it('escapes a commit author containing angle brackets', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(
      TEMPLATE_REF,
      { ...RUNNING_PAYLOAD, author: 'Alice Smith <alice@example.com>' },
      { fs, partials, themeToken: '#ecb22e', attribution: true },
    );

    const blocksJson = JSON.stringify({ blocks: result.blocks, attachments: result.attachments });
    expect(blocksJson).not.toContain('<alice@example.com>');
    expect(blocksJson).toContain('&lt;alice@example.com&gt;');
  });

  it('rejects a payload missing the required title field', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const withoutTitle: Record<string, unknown> = { ...RUNNING_PAYLOAD };
    delete withoutTitle['title'];

    expect(() =>
      render(TEMPLATE_REF, withoutTitle, { fs, partials }),
    ).toThrow(SchemaError);
  });
});
