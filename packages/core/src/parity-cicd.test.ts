import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from './render.js';
import { parityDiff } from './parity-normalize.js';
import { discoverParityCases } from './parity-cases.js';
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

function renderCiCd(
  dataPath: string,
  optsPath: string,
): ReturnType<typeof render> {
  const fs = makeNodeFs();
  const partials = loadPartials(partialsDir, fs);
  const payload = JSON.parse(readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
  const opts = JSON.parse(readFileSync(optsPath, 'utf8')) as {
    themeToken?: string;
    attribution?: boolean;
  };
  return render({ catalogPath, name: 'ci-cd', version: '1.0.0' }, payload, {
    fs,
    partials,
    ...opts,
  });
}

function getCiCdCase(state: string) {
  const cases = discoverParityCases(catalogPath);
  const c = cases.find(x => x.card === 'ci-cd' && x.state === state);
  if (!c) throw new Error(`ci-cd parity case "${state}" not found`);
  return c;
}

describe('ci-cd parity', () => {
  it('renders ci-cd running to match the raw running fixture after normalization', () => {
    const c = getCiCdCase('running');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderCiCd(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `running diverges: ${diff}`).toBeNull();
  });

  it('renders ci-cd passed to match the raw passed fixture after normalization', () => {
    const c = getCiCdCase('passed');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderCiCd(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `passed diverges: ${diff}`).toBeNull();
  });

  it('renders ci-cd failed to match the raw failed fixture after normalization', () => {
    const c = getCiCdCase('failed');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderCiCd(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `failed diverges: ${diff}`).toBeNull();
  });

  it('uses a typed date kind for the finished timestamp', () => {
    const c = getCiCdCase('passed');
    const payload = JSON.parse(readFileSync(c.dataPath, 'utf8')) as Record<string, unknown>;
    const finishedAt = payload['finished_at'];
    expect(finishedAt).toBeDefined();
    expect(typeof finishedAt).toBe('object');
    expect(finishedAt).toHaveProperty('epoch');
    expect(finishedAt).toHaveProperty('format');
    expect(finishedAt).toHaveProperty('fallback');

    const result = renderCiCd(c.dataPath, c.optsPath!);
    const output = JSON.stringify(result);
    expect(output).toMatch(/<!date\^\d+\^\{time\}\|/);
  });

  it('produces non-empty fallback text matching the raw fixture', () => {
    for (const state of ['running', 'passed', 'failed'] as const) {
      const c = getCiCdCase(state);
      const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as { text: string };
      const result = renderCiCd(c.dataPath, c.optsPath!);

      expect(result.text.length, `${state} fallback text is empty`).toBeGreaterThan(0);
      expect(result.text, `${state} fallback text mismatch`).toBe(raw.text);
    }
  });
});
