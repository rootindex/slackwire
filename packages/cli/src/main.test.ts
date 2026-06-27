import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
    if (!existsSync(bundlePath)) {
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
});
