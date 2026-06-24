import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskCache } from './cache.js';

describe('DiskCache', () => {
  let tmpDir: string;
  let cache: DiskCache;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slack-cache-test-'));
    cache = new DiskCache(tmpDir, 3600);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('stores and retrieves a name-to-id map for a team and type', async () => {
    await cache.set('T123', 'channel', { general: 'C001', random: 'C002' });
    const result = await cache.get('T123', 'channel');
    expect(result).toEqual({ general: 'C001', random: 'C002' });
  });

  it('returns null on a cache miss', async () => {
    const result = await cache.get('T999', 'channel');
    expect(result).toBeNull();
  });

  it('returns null when the entry is older than the TTL', async () => {
    const pastTime = Date.now() - 7200 * 1000;
    await cache.setWithTime('T123', 'channel', { general: 'C001' }, pastTime);
    const result = await cache.get('T123', 'channel');
    expect(result).toBeNull();
  });

  it('isolates entries by team_id', async () => {
    await cache.set('T_A', 'channel', { general: 'CA001' });
    await cache.set('T_B', 'channel', { general: 'CB001' });
    const a = await cache.get('T_A', 'channel');
    const b = await cache.get('T_B', 'channel');
    expect(a).toEqual({ general: 'CA001' });
    expect(b).toEqual({ general: 'CB001' });
  });

  it('falls back to a refetch when the cache file is corrupt', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(tmpDir, 'T123-channel.json'), 'NOT_JSON_AT_ALL');
    const result = await cache.get('T123', 'channel');
    expect(result).toBeNull();
  });
});
