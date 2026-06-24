import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, buildJsonSchema } from './render.js';
import { validatePayload } from './validate.js';
import { SchemaError, LimitError } from './errors.js';
import type { FsAdapter } from './loader.js';

function makeMemoryFs(files: Record<string, string>): FsAdapter {
  return {
    readFile: (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    listDirs: (path: string) => {
      const prefix = path.endsWith('/') ? path : path + '/';
      const dirs = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const segment = rest.split('/')[0];
          if (segment) dirs.add(segment);
        }
      }
      return Array.from(dirs);
    },
  };
}

const CATALOG = '/fixtures';

const validMeta = JSON.stringify({ name: 'test-card', version: '1.0.0' });
const validSchema = JSON.stringify({
  title: 'text_mrkdwn',
  body: 'text_mrkdwn',
});
const validSkeleton = JSON.stringify({
  blocks: [
    { type: 'header', text: { type: 'plain_text', text: '{{text_plain:title}}' } },
    { type: 'section', text: { type: 'mrkdwn', text: '{{text_mrkdwn:body}}' } },
  ],
});

const validFs = makeMemoryFs({
  [`${CATALOG}/test-card/1.0.0/meta.json`]: validMeta,
  [`${CATALOG}/test-card/1.0.0/schema.json`]: validSchema,
  [`${CATALOG}/test-card/1.0.0/skeleton.json`]: validSkeleton,
});

describe('buildJsonSchema', () => {
  it('keeps additionalProperties false inside the date object so unknown date sub-keys are rejected', () => {
    const schema = buildJsonSchema({ ts: 'date' });
    expect(() =>
      validatePayload(schema, {
        ts: { epoch: 1700000000, format: '{date}', fallback: '2023-11-14', extra: 'bad' },
      }),
    ).toThrow(SchemaError);
  });

  it('keeps top-level additionalProperties false so unknown payload fields are rejected', () => {
    const schema = buildJsonSchema({ title: 'text_plain' });
    expect(() =>
      validatePayload(schema, { title: 'Hello', extra: 'boom' }),
    ).toThrow(SchemaError);
  });

  it('accepts a date field given a valid epoch format fallback object', () => {
    const schema = buildJsonSchema({ ts: 'date', title: 'text_plain' });
    const result = validatePayload(schema, {
      ts: { epoch: 1700000000, format: '{date_num} {time_secs}', fallback: '2023-11-14' },
      title: 'Hello',
    });
    const ts = result['ts'] as Record<string, unknown>;
    expect(ts['epoch']).toBe(1700000000);
    expect(ts['format']).toBe('{date_num} {time_secs}');
    expect(ts['fallback']).toBe('2023-11-14');
  });

  it('rejects a date field given a bare string value', () => {
    const schema = buildJsonSchema({ ts: 'date', title: 'text_plain' });
    expect(() =>
      validatePayload(schema, { ts: 'not-an-object', title: 'Hello' }),
    ).toThrow(SchemaError);
  });

  it('builds a string subschema for text color link mention image button and code kinds', () => {
    const stringKinds: Record<string, string> = {
      a: 'text_mrkdwn',
      b: 'text_plain',
      c: 'color',
      d: 'link_url',
      e: 'link_text',
      f: 'user_mention',
      g: 'channel_mention',
      h: 'image_url',
      i: 'button',
      j: 'code',
      k: 'code_block',
    };
    const schema = buildJsonSchema(stringKinds);
    const properties = schema['properties'] as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(stringKinds)) {
      expect(properties[key]?.['type']).toBe('string');
    }
  });

  it('builds an object subschema with required epoch format and fallback for a date kind field', () => {
    const schema = buildJsonSchema({ ts: 'date' });
    const properties = (schema['properties'] as Record<string, unknown>);
    const tsSchema = properties['ts'] as Record<string, unknown>;
    expect(tsSchema['type']).toBe('object');
    const props = tsSchema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['epoch']?.['type']).toBe('number');
    expect(props['format']?.['type']).toBe('string');
    expect(props['fallback']?.['type']).toBe('string');
    expect(tsSchema['required']).toEqual(['epoch', 'format', 'fallback']);
    expect(tsSchema['additionalProperties']).toBe(false);
  });
});

describe('render ci-cd and incident golden parity', () => {
  const rootDir = resolve(import.meta.dirname, '../../../');
  const goldenCatalogPath = resolve(rootDir, 'templates');
  const partialsDir = resolve(rootDir, 'templates/partials');

  const nodeFs: FsAdapter = {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) =>
      readdirSync(path, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name),
  };

  function loadPartials(): Record<string, object[]> {
    const entries = readdirSync(partialsDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'));
    const result: Record<string, object[]> = {};
    for (const entry of entries) {
      const name = entry.name.replace(/\.json$/, '');
      result[name] = JSON.parse(nodeFs.readFile(resolve(partialsDir, entry.name))) as object[];
    }
    return result;
  }

  it('leaves ci-cd and incident rendered output unchanged', () => {
    const partials = loadPartials();

    const cicdPayload = {
      title: '✅ CI · healthcart-v2 · #2451 · PASSED',
      ref: 'feature/checkout-fix',
      short_sha: 'a1b9f2c',
      description: 'Fix Stitch amount overflow',
      author: 'Naledi',
      icon_url: 'https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS',
      icon_alt: 'passed',
      steps_text: '✅ Install     ✅ Lint     ✅ Test     ✅ Build     ✅ Deploy',
      progress_bar: '🟩🟩🟩🟩🟩  5 of 5 · 3m08s · *deployed to staging* 🚀',
      runner: 'ci-3',
      test_count: '142',
      coverage: '84.2%',
      finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
      primary_label: '🚀 Staging',
      primary_url: 'https://staging.example.com/healthcart-v2',
      logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
    };
    const cicdResult = render(
      { catalogPath: goldenCatalogPath, name: 'ci-cd', version: '1.0.0' },
      cicdPayload,
      { fs: nodeFs, partials, themeToken: '#2eb67d', attribution: true },
    );
    const cicdGolden = JSON.parse(readFileSync(
      resolve(rootDir, 'templates/ci-cd/1.0.0/__golden__/passed.json'), 'utf8',
    )) as object;
    expect(cicdResult).toStrictEqual(cicdGolden);

    const incidentPayload = {
      title: 'Database connection pool exhausted',
      severity: 'RESOLVED',
      accent: '#2eb67d',
      incident_id: 'INC-001',
      service: 'payments-api',
      runbook_url: 'https://example.com/runbooks/db-pool',
      assigned_to: 'on-call-team',
    };
    const incidentResult = render(
      { catalogPath: goldenCatalogPath, name: 'incident', version: '1.0.0' },
      incidentPayload,
      { fs: nodeFs, partials, themeToken: '#2eb67d', attribution: true },
    );
    const incidentGolden = JSON.parse(readFileSync(
      resolve(rootDir, 'templates/incident/1.0.0/__golden__/resolved.json'), 'utf8',
    )) as object;
    expect(incidentResult).toStrictEqual(incidentGolden);
  });
});

describe('partial resolution in render', () => {
  const rootDir = resolve(import.meta.dirname, '../../../');
  const goldenCatalogPath = resolve(rootDir, 'templates');
  const partialsDir = resolve(rootDir, 'templates/partials');

  const nodeFs: FsAdapter = {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) =>
      readdirSync(path, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name),
  };

  function loadPartials(): Record<string, object[]> {
    const entries = readdirSync(partialsDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'));
    const result: Record<string, object[]> = {};
    for (const entry of entries) {
      const name = entry.name.replace(/\.json$/, '');
      result[name] = JSON.parse(nodeFs.readFile(resolve(partialsDir, entry.name))) as object[];
    }
    return result;
  }

  it('leaves no residual $use markers anywhere in rendered output for an attribution colored card', () => {
    const partials = loadPartials();
    const result = render(
      { catalogPath: goldenCatalogPath, name: 'ci-cd', version: '1.0.0' },
      {
        title: '✅ CI · healthcart-v2 · #2451 · PASSED',
        ref: 'feature/checkout-fix',
        short_sha: 'a1b9f2c',
        description: 'Fix Stitch amount overflow',
        author: 'Naledi',
        icon_url: 'https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS',
        icon_alt: 'passed',
        steps_text: '✅ Install     ✅ Lint     ✅ Test     ✅ Build     ✅ Deploy',
        progress_bar: '🟩🟩🟩🟩🟩  5 of 5 · 3m08s · *deployed to staging* 🚀',
        runner: 'ci-3',
        test_count: '142',
        coverage: '84.2%',
        finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
        primary_label: '🚀 Staging',
        primary_url: 'https://staging.example.com/healthcart-v2',
        logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
      },
      { fs: nodeFs, partials, themeToken: '#2eb67d', attribution: true },
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain('"$use"');
  });

  it('leaves no residual $use markers anywhere in rendered output for a non-attribution card', () => {
    const skeletonWithUse = JSON.stringify({
      blocks: [{ $use: 'header' }, { type: 'section', text: { type: 'mrkdwn', text: '{{text_plain:status}}' } }],
    });
    const testFs = makeMemoryFs({
      [`${CATALOG}/use-card/1.0.0/meta.json`]: JSON.stringify({ name: 'use-card', version: '1.0.0' }),
      [`${CATALOG}/use-card/1.0.0/schema.json`]: JSON.stringify({ status: 'text_plain' }),
      [`${CATALOG}/use-card/1.0.0/skeleton.json`]: skeletonWithUse,
    });
    const headerPartial = JSON.parse(nodeFs.readFile(resolve(partialsDir, 'header.json'))) as object[];
    const result = render(
      { catalogPath: CATALOG, name: 'use-card', version: '1.0.0' },
      { status: 'ok' },
      { fs: testFs, partials: { header: headerPartial } },
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain('"$use"');
  });

  it('renders ci-cd and incident with house-style header and footer blocks inside the colored attachment', () => {
    const partials = loadPartials();

    const cicdResult = render(
      { catalogPath: goldenCatalogPath, name: 'ci-cd', version: '1.0.0' },
      {
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
      },
      { fs: nodeFs, partials, themeToken: '#ecb22e', attribution: true },
    );

    const json = JSON.stringify(cicdResult);
    expect(json).not.toContain('"$use"');
    expect(cicdResult.attachments.length).toBeGreaterThan(0);

    const attachment = cicdResult.attachments[0] as Record<string, unknown>;
    const attachBlocks = attachment['blocks'] as object[];
    expect(attachBlocks.length).toBeGreaterThan(0);

    const firstBlock = attachBlocks[0] as Record<string, unknown>;
    expect(firstBlock['type']).toBe('header');

    const incidentResult = render(
      { catalogPath: goldenCatalogPath, name: 'incident', version: '1.0.0' },
      {
        title: 'Database connection pool exhausted',
        severity: 'TRIGGERED',
        accent: '#e01e5a',
        incident_id: 'INC-001',
        service: 'payments-api',
        runbook_url: 'https://example.com/runbooks/db-pool',
        assigned_to: 'on-call-team',
      },
      { fs: nodeFs, partials, themeToken: '#e01e5a', attribution: true },
    );

    const incJson = JSON.stringify(incidentResult);
    expect(incJson).not.toContain('"$use"');
    expect(incidentResult.attachments.length).toBeGreaterThan(0);
  });
});

describe('fallback from attachments', () => {
  const rootDir = resolve(import.meta.dirname, '../../../');
  const goldenCatalogPath = resolve(rootDir, 'templates');
  const partialsDir = resolve(rootDir, 'templates/partials');

  const nodeFs: FsAdapter = {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) =>
      readdirSync(path, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name),
  };

  function loadPartials(): Record<string, object[]> {
    const entries = readdirSync(partialsDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'));
    const result: Record<string, object[]> = {};
    for (const entry of entries) {
      const name = entry.name.replace(/\.json$/, '');
      result[name] = JSON.parse(nodeFs.readFile(resolve(partialsDir, entry.name))) as object[];
    }
    return result;
  }

  it('produces non-empty fallback text for an attribution colored card end to end via render', () => {
    const partials = loadPartials();
    const result = render(
      { catalogPath: goldenCatalogPath, name: 'ci-cd', version: '1.0.0' },
      {
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
      },
      { fs: nodeFs, partials, themeToken: '#ecb22e', attribution: true },
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.attachments.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain('RUNNING');
  });
});

describe('render with date kind', () => {
  it('renders a template declaring a date kind to a valid <!date^EPOCH^...> token string end to end', () => {
    const dateMeta = JSON.stringify({ name: 'date-card', version: '1.0.0' });
    const dateSchema = JSON.stringify({ occurred_at: 'date' });
    const dateSkeleton = JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'Event at {{date:occurred_at}}' },
        },
      ],
    });
    const dateFs = makeMemoryFs({
      [`${CATALOG}/date-card/1.0.0/meta.json`]: dateMeta,
      [`${CATALOG}/date-card/1.0.0/schema.json`]: dateSchema,
      [`${CATALOG}/date-card/1.0.0/skeleton.json`]: dateSkeleton,
    });

    const result = render(
      { catalogPath: CATALOG, name: 'date-card', version: '1.0.0' },
      { occurred_at: { epoch: 1700000000, format: '{date_num}', fallback: '2023-11-14' } },
      { fs: dateFs },
    );

    const json = JSON.stringify(result.blocks);
    expect(json).toContain('<!date^1700000000^{date_num}|2023-11-14>');
  });
});

describe('render', () => {
  it('renders a valid payload to blocks attachments and text', () => {
    const result = render(
      { catalogPath: CATALOG, name: 'test-card', version: '1.0.0' },
      { title: 'Hello World', body: 'A test body' },
      { fs: validFs },
    );

    expect(result.blocks).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.attachments).toBeDefined();
    expect(Array.isArray(result.attachments)).toBe(true);
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same template and payload', () => {
    const payload = { title: 'Deterministic', body: 'Same every time' };
    const opts = { fs: validFs };

    const result1 = render({ catalogPath: CATALOG, name: 'test-card', version: '1.0.0' }, payload, opts);
    const result2 = render({ catalogPath: CATALOG, name: 'test-card', version: '1.0.0' }, payload, opts);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it('surfaces a SchemaError from the validation stage', () => {
    expect(() =>
      render(
        { catalogPath: CATALOG, name: 'test-card', version: '1.0.0' },
        { title: 'Only title' },
        { fs: validFs },
      ),
    ).toThrow(SchemaError);
  });

  it('surfaces a LimitError from the enforcement stage', () => {
    const longText = 'a'.repeat(3001);
    const longSkeleton = JSON.stringify({
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_mrkdwn:body}}' } },
      ],
    });
    const longFs = makeMemoryFs({
      [`${CATALOG}/test-card/1.0.0/meta.json`]: validMeta,
      [`${CATALOG}/test-card/1.0.0/schema.json`]: validSchema,
      [`${CATALOG}/test-card/1.0.0/skeleton.json`]: longSkeleton,
    });

    expect(() =>
      render(
        { catalogPath: CATALOG, name: 'test-card', version: '1.0.0' },
        { title: 'Title', body: longText },
        { fs: longFs },
      ),
    ).toThrow(LimitError);
  });

  it('renders without posting in dry-run and returns the assembled JSON', () => {
    const result = render(
      { catalogPath: CATALOG, name: 'test-card', version: '1.0.0' },
      { title: 'Dry Run', body: 'No posting' },
      { fs: validFs, dryRun: true },
    );

    expect(result.blocks).toBeDefined();
    expect(result.attachments).toBeDefined();
    expect(typeof result.text).toBe('string');
  });
});
