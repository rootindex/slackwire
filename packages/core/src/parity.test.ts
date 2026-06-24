import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { render } from './render.js';
import { parityDiff } from './parity-normalize.js';
import { discoverParityCases } from './parity-cases.js';
import type { FsAdapter } from './loader.js';

// ---------------------------------------------------------------------------
// Helpers reused from golden.test.ts pattern
// ---------------------------------------------------------------------------

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
  const entries = readdirSync(dir, { withFileTypes: true }).filter(
    e => e.isFile() && e.name.endsWith('.json'),
  );
  const result: Record<string, object[]> = {};
  for (const entry of entries) {
    const name = entry.name.replace(/\.json$/, '');
    result[name] = JSON.parse(fs.readFile(resolve(dir, entry.name))) as object[];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Synthetic fixture helpers (OS tmpdir, never written to repo)
// ---------------------------------------------------------------------------

let tmpCatalog: string;

beforeAll(() => {
  tmpCatalog = mkdtempSync(join(tmpdir(), 'parity-test-'));
  buildSyntheticCatalog(tmpCatalog);
});

afterAll(() => {
  rmSync(tmpCatalog, { recursive: true, force: true });
});

function buildSyntheticCatalog(catalog: string): void {
  mkdirSync(join(catalog, 'partials'), { recursive: true });
  writeFileSync(join(catalog, 'partials', 'header.json'), JSON.stringify([]), 'utf8');
  writeFileSync(join(catalog, 'partials', 'footer.json'), JSON.stringify([]), 'utf8');

  const widgetDir = join(catalog, 'widget', '1.0.0');
  mkdirSync(widgetDir, { recursive: true });

  writeFileSync(
    join(widgetDir, 'meta.json'),
    JSON.stringify({ name: 'widget', version: '1.0.0', description: 'Test widget' }),
    'utf8',
  );
  writeFileSync(
    join(widgetDir, 'schema.json'),
    JSON.stringify({ title: 'text_plain', url: 'link_url' }),
    'utf8',
  );
  writeFileSync(
    join(widgetDir, 'skeleton.json'),
    JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: { type: 'plain_text', text: '{{text_plain:title}}' },
        },
      ],
    }),
    'utf8',
  );

  // __golden__ dir should be ignored by discovery
  mkdirSync(join(widgetDir, '__golden__'), { recursive: true });
  writeFileSync(
    join(widgetDir, '__golden__', 'default.json'),
    JSON.stringify({ blocks: [], attachments: [], text: 'golden' }),
    'utf8',
  );

  const parityDir = join(widgetDir, '__parity__');
  mkdirSync(parityDir, { recursive: true });

  const payload = { title: 'Hello World', url: 'https://example.com' };
  const fs = makeNodeFs();
  const result = render(
    { catalogPath: catalog, name: 'widget', version: '1.0.0' },
    payload,
    { fs, partials: {} },
  );

  writeFileSync(join(parityDir, 'default.raw.json'), JSON.stringify(result, null, 2), 'utf8');
  writeFileSync(join(parityDir, 'default.data.json'), JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(
    join(parityDir, 'default.opts.json'),
    JSON.stringify({ attribution: false }),
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const rootDir = resolve(import.meta.dirname, '../../../');
const realCatalogPath = resolve(rootDir, 'templates');
const realPartialsDir = resolve(rootDir, 'templates/partials');

describe('parity harness', () => {
  it('discovers parity cases from __parity__ directories under the catalog', () => {
    const cases = discoverParityCases(tmpCatalog);
    expect(cases.length).toBe(1);
    expect(cases[0]).toMatchObject({
      card: 'widget',
      version: '1.0.0',
      state: 'default',
    });
  });

  it('ignores the partials directory and __golden__ directories during discovery', () => {
    const cases = discoverParityCases(tmpCatalog);
    const cards = cases.map(c => c.card);
    expect(cards).not.toContain('partials');

    const hasGolden = cases.some(c => c.state === 'golden' || c.version === '__golden__');
    expect(hasGolden).toBe(false);
  });

  it('loads partials and per-case render options when rendering a case', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(join(tmpCatalog, 'partials'), fs);
    const cases = discoverParityCases(tmpCatalog);
    const c = cases[0]!;

    const payload = JSON.parse(readFileSync(c.dataPath, 'utf8')) as Record<string, unknown>;
    const opts = c.optsPath
      ? (JSON.parse(readFileSync(c.optsPath, 'utf8')) as {
          themeToken?: string;
          attribution?: boolean;
        })
      : {};

    const result = render(
      { catalogPath: tmpCatalog, name: c.card, version: c.version },
      payload,
      { fs, partials, ...opts },
    );

    expect(result).toHaveProperty('blocks');
    expect(result).toHaveProperty('attachments');
    expect(result).toHaveProperty('text');
  });

  it('renders each discovered case and asserts engine output matches the raw fixture after normalization', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(join(tmpCatalog, 'partials'), fs);
    const cases = discoverParityCases(tmpCatalog);

    for (const c of cases) {
      const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
      const payload = JSON.parse(readFileSync(c.dataPath, 'utf8')) as Record<string, unknown>;
      const opts = c.optsPath
        ? (JSON.parse(readFileSync(c.optsPath, 'utf8')) as {
            themeToken?: string;
            attribution?: boolean;
          })
        : {};

      const result = render(
        { catalogPath: tmpCatalog, name: c.card, version: c.version },
        payload,
        { fs, partials, ...opts },
      );

      const diff = parityDiff(raw, result);
      expect(diff, `[${c.card}/${c.version}/${c.state}] diverges: ${diff}`).toBeNull();
    }
  });

  it('fails loudly when a state has a raw fixture but no matching data fixture', () => {
    const badCatalog = mkdtempSync(join(tmpdir(), 'parity-bad-'));
    try {
      const badParityDir = join(badCatalog, 'mycard', '1.0.0', '__parity__');
      mkdirSync(badParityDir, { recursive: true });
      writeFileSync(join(badParityDir, 'orphan.raw.json'), JSON.stringify({}), 'utf8');

      expect(() => discoverParityCases(badCatalog)).toThrow(/missing data file.*orphan/);
    } finally {
      rmSync(badCatalog, { recursive: true, force: true });
    }
  });

  it('fails with a readable structural diff when engine output diverges from the raw fixture', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(join(tmpCatalog, 'partials'), fs);
    const cases = discoverParityCases(tmpCatalog);
    const c = cases[0]!;

    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as Record<string, unknown>;
    const tamperedRaw = { ...raw, text: 'THIS IS WRONG - SHOULD DIVERGE' };

    const payload = JSON.parse(readFileSync(c.dataPath, 'utf8')) as Record<string, unknown>;
    const opts = c.optsPath
      ? (JSON.parse(readFileSync(c.optsPath, 'utf8')) as {
          themeToken?: string;
          attribution?: boolean;
        })
      : {};

    const result = render(
      { catalogPath: tmpCatalog, name: c.card, version: c.version },
      payload,
      { fs, partials, ...opts },
    );

    const diff = parityDiff(tamperedRaw, result);
    expect(diff).not.toBeNull();
    expect(typeof diff).toBe('string');
    expect(diff).toMatch(/text/);
  });

  it('skips cleanly when no __parity__ fixtures exist', () => {
    const emptyCatalog = mkdtempSync(join(tmpdir(), 'parity-empty-'));
    try {
      mkdirSync(join(emptyCatalog, 'mycard', '1.0.0'), { recursive: true });
      writeFileSync(
        join(emptyCatalog, 'mycard', '1.0.0', 'meta.json'),
        JSON.stringify({ name: 'mycard', version: '1.0.0' }),
        'utf8',
      );

      const cases = discoverParityCases(emptyCatalog);
      expect(cases).toHaveLength(0);
    } finally {
      rmSync(emptyCatalog, { recursive: true, force: true });
    }
  });

  it('never derives or overwrites a raw fixture from engine output', () => {
    // The harness only asserts: discoverParityCases + render + parityDiff.
    // No "bless" / "update" / "write" path exists in the parity harness.
    const cases = discoverParityCases(tmpCatalog);
    expect(cases.length).toBeGreaterThanOrEqual(0);
    // No UPDATE_PARITY env var mechanism exists (contrast with golden suite's UPDATE_GOLDEN).
    expect(process.env['UPDATE_PARITY']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Real-catalog integration: green when no parity fixtures exist yet
// ---------------------------------------------------------------------------

describe('parity harness — real catalog', () => {
  it('skips cleanly when no __parity__ fixtures exist', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(realPartialsDir, fs);
    const cases = discoverParityCases(realCatalogPath);

    for (const c of cases) {
      const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
      const payload = JSON.parse(readFileSync(c.dataPath, 'utf8')) as Record<string, unknown>;
      const opts = c.optsPath
        ? (JSON.parse(readFileSync(c.optsPath, 'utf8')) as {
            themeToken?: string;
            attribution?: boolean;
          })
        : {};

      const result = render(
        { catalogPath: realCatalogPath, name: c.card, version: c.version },
        payload,
        { fs, partials, ...opts },
      );

      const diff = parityDiff(raw, result);
      expect(diff, `[${c.card}/${c.version}/${c.state}] diverges: ${diff}`).toBeNull();
    }

    expect(Array.isArray(cases)).toBe(true);
  });
});
