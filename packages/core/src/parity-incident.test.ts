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

function renderIncident(
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
  return render({ catalogPath, name: 'incident', version: '1.0.0' }, payload, {
    fs,
    partials,
    ...opts,
  });
}

function getIncidentCase(state: string) {
  const cases = discoverParityCases(catalogPath);
  const c = cases.find(x => x.card === 'incident' && x.state === state);
  if (!c) throw new Error(`incident parity case "${state}" not found`);
  return c;
}

describe('incident parity', () => {
  it('renders incident triggered to match the raw triggered fixture after normalization', () => {
    const c = getIncidentCase('triggered');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderIncident(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `triggered diverges: ${diff}`).toBeNull();
  });

  it('renders incident mitigating to match the raw mitigating fixture after normalization', () => {
    const c = getIncidentCase('mitigating');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderIncident(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `mitigating diverges: ${diff}`).toBeNull();
  });

  it('renders incident resolved to match the raw resolved fixture after normalization', () => {
    const c = getIncidentCase('resolved');
    const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as unknown;
    const result = renderIncident(c.dataPath, c.optsPath!);
    const diff = parityDiff(raw, result);
    expect(diff, `resolved diverges: ${diff}`).toBeNull();
  });

  it('morphs the accent color across the three incident states', () => {
    const states = [
      { state: 'triggered', expectedColor: '#e01e5a' },
      { state: 'mitigating', expectedColor: '#ecb22e' },
      { state: 'resolved', expectedColor: '#2eb67d' },
    ];

    for (const { state, expectedColor } of states) {
      const c = getIncidentCase(state);
      const result = renderIncident(c.dataPath, c.optsPath!);
      const output = JSON.stringify(result);
      expect(output, `${state} should contain color ${expectedColor}`).toContain(expectedColor);
    }
  });

  it('produces non-empty fallback text matching the raw fixture', () => {
    for (const state of ['triggered', 'mitigating', 'resolved'] as const) {
      const c = getIncidentCase(state);
      const raw = JSON.parse(readFileSync(c.rawPath, 'utf8')) as { text: string };
      const result = renderIncident(c.dataPath, c.optsPath!);

      expect(result.text.length, `${state} fallback text is empty`).toBeGreaterThan(0);
      expect(result.text, `${state} fallback text mismatch`).toBe(raw.text);
    }
  });
});
