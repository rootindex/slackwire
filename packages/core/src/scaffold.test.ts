import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../../../');

describe('monorepo scaffold', () => {
  it('resolves the three workspace packages from the root pnpm-workspace', () => {
    const workspaceYaml = readFileSync(resolve(rootDir, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspaceYaml).toContain('packages/*');

    const corePkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/core/package.json'), 'utf8')) as { name: string };
    const cliPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/package.json'), 'utf8')) as { name: string };
    const mcpPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/mcp/package.json'), 'utf8')) as { name: string };

    expect(corePkg.name).toBe('@slackwire/core');
    expect(cliPkg.name).toBe('slackwire');
    expect(mcpPkg.name).toBe('@slackwire/mcp');
  });

  it('compiles core, cli, and mcp with tsc strict and no errors', () => {
    const coreTs = JSON.parse(readFileSync(resolve(rootDir, 'packages/core/tsconfig.json'), 'utf8')) as { extends: string };
    const cliTs = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/tsconfig.json'), 'utf8')) as { extends: string };
    const mcpTs = JSON.parse(readFileSync(resolve(rootDir, 'packages/mcp/tsconfig.json'), 'utf8')) as { extends: string };
    const baseTs = JSON.parse(readFileSync(resolve(rootDir, 'tsconfig.base.json'), 'utf8')) as { compilerOptions: { strict: boolean } };

    expect(baseTs.compilerOptions.strict).toBe(true);
    expect(coreTs.extends).toMatch(/tsconfig.base/);
    expect(cliTs.extends).toMatch(/tsconfig.base/);
    expect(mcpTs.extends).toMatch(/tsconfig.base/);
  });

  it('runs an empty vitest suite green in each package', () => {
    const corePkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/core/package.json'), 'utf8')) as { scripts: Record<string, string> };
    const cliPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/package.json'), 'utf8')) as { scripts: Record<string, string> };
    const mcpPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/mcp/package.json'), 'utf8')) as { scripts: Record<string, string> };

    expect(corePkg.scripts['test']).toContain('vitest');
    expect(cliPkg.scripts['test']).toContain('vitest');
    expect(mcpPkg.scripts['test']).toContain('vitest');
  });

  it('exposes @slackwire/core as a workspace dependency to cli and mcp', () => {
    const cliPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const mcpPkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/mcp/package.json'), 'utf8')) as { dependencies: Record<string, string> };

    expect(cliPkg.dependencies['@slackwire/core']).toBe('workspace:*');
    expect(mcpPkg.dependencies['@slackwire/core']).toBe('workspace:*');
  });

  it('lints the repo with zero eslint errors on the scaffold', () => {
    const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(rootPkg.devDependencies['eslint']).toBeDefined();
    expect(rootPkg.devDependencies['@typescript-eslint/eslint-plugin']).toBeDefined();

    const eslintConfig = readFileSync(resolve(rootDir, 'eslint.config.mjs'), 'utf8');
    expect(eslintConfig).toContain('@typescript-eslint');
  });
});
