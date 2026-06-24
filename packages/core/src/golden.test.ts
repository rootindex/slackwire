import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { render } from './render.js';
import { escape } from './escaping.js';
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

function goldenPath(templateName: string, version: string, stateName: string): string {
  return resolve(rootDir, `templates/${templateName}/${version}/__golden__/${stateName}.json`);
}

function blessOrAssert(path: string, actual: object): void {
  if (process.env['UPDATE_GOLDEN'] === '1') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    return;
  }
  if (!existsSync(path)) {
    throw new Error(
      `Golden file missing: ${path}. Run UPDATE_GOLDEN=1 pnpm --filter @slack-cards/core test to bless.`,
    );
  }
  const expected = JSON.parse(readFileSync(path, 'utf8')) as object;
  expect(actual).toStrictEqual(expected);
}

const CICD_STATES: Array<{ name: string; accent: string; payload: Record<string, unknown> }> = [
  {
    name: 'running',
    accent: '#ecb22e',
    payload: {
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
  },
  {
    name: 'passed',
    accent: '#2eb67d',
    payload: {
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
  },
  {
    name: 'failed',
    accent: '#e01e5a',
    payload: {
      title: '❌ CI · healthcart-v2 · #2451 · FAILED',
      ref: 'feature/checkout-fix',
      short_sha: 'a1b9f2c',
      description: 'Fix Stitch amount overflow',
      author: 'Naledi',
      icon_url: 'https://placehold.co/72x72/e01e5a/ffffff/png?text=FAIL',
      icon_alt: 'failed',
      steps_text: '✅ Install     ✅ Lint     ❌ Test     ⬜ Build     ⬜ Deploy',
      progress_bar: '🟥🟥🟥⬜⬜  2 of 5 · 1m22s · *test stage failed*',
      runner: 'ci-3',
      test_count: '142',
      coverage: '84.2%',
      finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
      primary_label: '❌ View failure',
      primary_url: 'https://ci.example.com/healthcart-v2/2451',
      logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
    },
  },
];

const INCIDENT_STATES: Array<{ name: string; accent: string; payload: Record<string, unknown> }> = [
  {
    name: 'triggered',
    accent: '#e01e5a',
    payload: {
      title: 'Database connection pool exhausted',
      severity: 'TRIGGERED',
      accent: '#e01e5a',
      incident_id: 'INC-001',
      service: 'payments-api',
      runbook_url: 'https://example.com/runbooks/db-pool',
      assigned_to: 'on-call-team',
    },
  },
  {
    name: 'mitigating',
    accent: '#ecb22e',
    payload: {
      title: 'Database connection pool exhausted',
      severity: 'MITIGATING',
      accent: '#ecb22e',
      incident_id: 'INC-001',
      service: 'payments-api',
      runbook_url: 'https://example.com/runbooks/db-pool',
      assigned_to: 'on-call-team',
    },
  },
  {
    name: 'resolved',
    accent: '#2eb67d',
    payload: {
      title: 'Database connection pool exhausted',
      severity: 'RESOLVED',
      accent: '#2eb67d',
      incident_id: 'INC-001',
      service: 'payments-api',
      runbook_url: 'https://example.com/runbooks/db-pool',
      assigned_to: 'on-call-team',
    },
  },
];

describe('golden snapshots', () => {
  it('matches the golden snapshot for each CI/CD state', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const templateRef = { catalogPath, name: 'ci-cd', version: '1.0.0' };

    for (const state of CICD_STATES) {
      const result = render(templateRef, state.payload, {
        fs,
        partials,
        themeToken: state.accent,
        attribution: true,
      });
      blessOrAssert(goldenPath('ci-cd', '1.0.0', state.name), result);
    }
  });

  it('matches the golden snapshot for each incident state', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const templateRef = { catalogPath, name: 'incident', version: '1.0.0' };

    for (const state of INCIDENT_STATES) {
      const result = render(templateRef, state.payload, {
        fs,
        partials,
        themeToken: state.accent,
        attribution: true,
      });
      blessOrAssert(goldenPath('incident', '1.0.0', state.name), result);
    }
  });

  it('passes the full per-kind escaping matrix across both templates', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);

    const cicdResult = render(
      { catalogPath, name: 'ci-cd', version: '1.0.0' },
      {
        title: '⏳ CI · healthcart-v2 · #2451 · RUNNING',
        ref: 'feat/my-branch & "quotes"',
        short_sha: 'abc1234',
        description: 'Fix <test> & "escaping"',
        author: 'Jane Doe <jane@example.com>',
        icon_url: 'https://placehold.co/72x72/ecb22e/ffffff/png?text=RUN',
        icon_alt: 'running',
        steps_text: '⏳ Install',
        progress_bar: '🟨  1 of 5',
        runner: 'ci-3',
        test_count: '0',
        coverage: '0%',
        finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
        primary_label: '⏳ Running',
        primary_url: 'https://ci.example.com/healthcart-v2/2451',
        logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
      },
      { fs, partials, themeToken: '#ecb22e', attribution: true },
    );

    const cicdBlocksJson = JSON.stringify({ blocks: cicdResult.blocks, attachments: cicdResult.attachments });
    expect(cicdBlocksJson).not.toContain('<test>');
    expect(cicdBlocksJson).toContain('&lt;test&gt;');
    expect(cicdBlocksJson).not.toContain('<jane@example.com>');
    expect(cicdBlocksJson).toContain('&lt;jane@example.com&gt;');
    expect(escape('text_plain', 'a & b')).toBe('a &amp; b');
    expect(escape('text_mrkdwn', 'a & b')).toBe('a &amp; b');
    expect(escape('color', '#ecb22e')).toBe('#ecb22e');
    expect(escape('link_url', 'https://example.com/path with spaces')).toBe(
      'https://example.com/path%20with%20spaces',
    );

    const incidentResult = render(
      { catalogPath, name: 'incident', version: '1.0.0' },
      {
        title: 'DB <failure> & alert',
        severity: 'TRIGGERED',
        accent: '#e01e5a',
        incident_id: 'INC-001',
        service: 'payments-api <service>',
        runbook_url: 'https://example.com/runbooks/db-pool',
        assigned_to: 'on-call <team>',
      },
      { fs, partials, themeToken: '#e01e5a', attribution: true },
    );

    const incidentBlocksJson = JSON.stringify({ blocks: incidentResult.blocks, attachments: incidentResult.attachments });
    expect(incidentBlocksJson).not.toContain('<failure>');
    expect(incidentBlocksJson).toContain('&lt;failure&gt;');
    expect(incidentBlocksJson).not.toContain('<service>');
    expect(incidentBlocksJson).toContain('&lt;service&gt;');
    expect(incidentBlocksJson).not.toContain('<team>');
    expect(incidentBlocksJson).toContain('&lt;team&gt;');
  });

  it('flags a drift when assembled JSON changes without a re-bless', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const templateRef = { catalogPath, name: 'ci-cd', version: '1.0.0' };

    const result = render(templateRef, CICD_STATES[0]!.payload, {
      fs,
      partials,
      themeToken: CICD_STATES[0]!.accent,
      attribution: true,
    });

    const tampered = JSON.parse(JSON.stringify(result)) as object;
    (tampered as Record<string, unknown>)['text'] = 'DRIFT INJECTED';

    const path = goldenPath('ci-cd', '1.0.0', 'running');
    const expected = JSON.parse(readFileSync(path, 'utf8')) as object;

    expect(tampered).not.toStrictEqual(expected);
  });
});
