import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const pkgRoot = resolve(import.meta.dirname, '..');
const bundlePath = resolve(pkgRoot, 'dist/bundle.cjs');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runBundle(args: string[], stdin: string): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [bundlePath, ...args], { cwd: pkgRoot });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => { resolvePromise({ code: code ?? -1, stdout, stderr }); });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

describe('main entry (built binary)', () => {
  beforeAll(() => {
    if (!existsSync(bundlePath) || !existsSync(resolve(pkgRoot, 'dist/templates'))) {
      const built = spawnSync(process.execPath, ['bundle.mjs'], { cwd: pkgRoot, stdio: 'inherit' });
      if (built.status !== 0) throw new Error('failed to build dist/bundle.cjs for the entry test');
    }
  });

  it('reads --blocks - from real process.stdin and assembles them under --dry-run', async () => {
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }];
    const result = await runBundle(
      ['post', '--channel', 'C123', '--blocks', '-', '--dry-run'],
      JSON.stringify(blocks),
    );

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { blocks: unknown[]; text: string };
    expect(parsed.blocks).toEqual(blocks);
  });

  it('renders --template ci-cd@1.0.0 from the bundled catalog with no --catalog, from a cwd without templates', async () => {
    const noTemplatesCwd = mkdtempSync(join(tmpdir(), 'slackwire-bundled-'));
    const data = {
      title: 'CI passed: healthcart-v2 #2451',
      ref: 'feature/checkout-fix',
      short_sha: 'a1b9f2c',
      description: 'Fix Stitch amount overflow',
      author: 'Naledi',
      icon_url: 'https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS',
      icon_alt: 'passed',
      steps_text: 'Install -> Lint -> Test -> Build -> Deploy',
      progress_bar: '5 of 5 - deployed to staging',
      runner: 'ci-3',
      test_count: '142',
      coverage: '84.2%',
      finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
      primary_label: 'Open staging',
      primary_url: 'https://staging.example.com/healthcart-v2',
      logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
    };
    const result = await new Promise<RunResult>((resolvePromise, reject) => {
      const child = spawn(
        process.execPath,
        [bundlePath, 'card', '--template', 'ci-cd@1.0.0', '--data', JSON.stringify(data), '--dry-run'],
        { cwd: noTemplatesCwd },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (code) => { resolvePromise({ code: code ?? -1, stdout, stderr }); });
      child.stdin.end();
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { blocks: unknown[]; text: string };
    expect(Array.isArray(parsed.blocks)).toBe(true);
    expect(parsed.blocks.length).toBeGreaterThan(0);
  });
});
