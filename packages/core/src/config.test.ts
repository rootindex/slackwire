import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { ConfigError } from './errors.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['SLACK_TOKEN'];
    delete process.env['SLACK_TOKEN_BASE64'];
    delete process.env['SLACK_TOKEN_FILE'];
    delete process.env['SLACK_TOKEN_TYPE'];
    delete process.env['SLACK_ATTRIBUTION'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads a human xoxp token from config', () => {
    process.env['SLACK_TOKEN'] = 'xoxp-111-222-333-abc';
    const config = loadConfig();
    expect(config.token).toBe('xoxp-111-222-333-abc');
  });

  it('loads a bot token from config', () => {
    process.env['SLACK_TOKEN'] = 'xoxb-111-222-abc';
    const config = loadConfig();
    expect(config.token).toBe('xoxb-111-222-abc');
  });

  it('decodes a base64-encoded token var at runtime and never echoes it', () => {
    const raw = 'xoxp-secret-token-999';
    const encoded = Buffer.from(raw).toString('base64');
    process.env['SLACK_TOKEN_BASE64'] = encoded;
    const config = loadConfig();
    expect(config.token).toBe(raw);
    expect(JSON.stringify(config)).not.toContain(encoded);
  });

  it('reads a token from SLACK_TOKEN_FILE and trims trailing whitespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slk-'));
    const file = join(dir, 'token');
    writeFileSync(file, 'xoxp-file-token-42\n');
    process.env['SLACK_TOKEN_FILE'] = file;
    const config = loadConfig();
    expect(config.token).toBe('xoxp-file-token-42');
    expect(config.tokenType).toBe('user');
  });

  it('exposes the resolved token type (user vs bot)', () => {
    process.env['SLACK_TOKEN'] = 'xoxp-111-222-333-abc';
    const userConfig = loadConfig();
    expect(userConfig.tokenType).toBe('user');

    process.env['SLACK_TOKEN'] = 'xoxb-111-222-abc';
    const botConfig = loadConfig();
    expect(botConfig.tokenType).toBe('bot');
  });

  it('throws a clear error when no token is configured', () => {
    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('No Slack token configured');
  });
});
