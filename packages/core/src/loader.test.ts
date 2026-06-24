import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTemplate, listTemplates, placeholderTokens, selectTemplate } from './loader.js';
import type { FsAdapter } from './loader.js';

const fixturesPath = resolve(import.meta.dirname, '__fixtures__/templates');

function makeRealFsAdapter(): FsAdapter {
  return {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) => readdirSync(path, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name),
  };
}

describe('template loader', () => {
  it('loads skeleton, schema, and meta for a named template from a catalog path', () => {
    const fs = makeRealFsAdapter();
    const result = loadTemplate(fixturesPath, 'announcement', '1.0.0', fs);

    expect(result.meta.name).toBe('announcement');
    expect(result.meta.version).toBe('1.0.0');
    expect(result.schema).toEqual({ title: 'text_mrkdwn', body: 'text_mrkdwn', author: 'text_plain' });
    expect(result.skeleton.blocks).toHaveLength(2);
  });

  it('lists available templates with name and version', () => {
    const fs = makeRealFsAdapter();
    const list = listTemplates(fixturesPath, fs);

    expect(list).toEqual(
      expect.arrayContaining([
        { name: 'announcement', version: '1.0.0' },
        { name: 'alert', version: '2.1.0' },
      ]),
    );
  });

  it('throws when a template directory is missing a required file', () => {
    const brokenFs: FsAdapter = {
      readFile: (path: string) => {
        if (path.endsWith('meta.json')) throw new Error('ENOENT');
        return readFileSync(path, 'utf8');
      },
      listDirs: makeRealFsAdapter().listDirs,
    };

    expect(() => loadTemplate(fixturesPath, 'announcement', '1.0.0', brokenFs)).toThrow('meta.json');
  });

  it('returns the set of placeholder tokens referenced by a skeleton', () => {
    const fs = makeRealFsAdapter();
    const result = loadTemplate(fixturesPath, 'announcement', '1.0.0', fs);
    const tokens = placeholderTokens(result.skeleton);

    expect(tokens).toEqual(new Set(['title', 'body', 'author']));
  });

  it('selects a template by name and explicit version', () => {
    const fs = makeRealFsAdapter();
    const result = selectTemplate(fixturesPath, 'alert', '2.1.0', fs);

    expect(result.meta.name).toBe('alert');
    expect(result.meta.version).toBe('2.1.0');
    expect(result.schema).toEqual({ message: 'text_mrkdwn' });
  });
});
