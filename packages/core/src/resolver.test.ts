import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resolver } from './resolver.js';
import { DiskCache } from './cache.js';
import { RateLimitError } from './errors.js';

const TEAM_ID = 'T_MAIN';

function makeMock() {
  return {
    conversations: {
      list: vi.fn(),
    },
    users: {
      list: vi.fn(),
    },
  };
}

type ClientMock = ReturnType<typeof makeMock>;

describe('Resolver', () => {
  let tmpDir: string;
  let mock: ClientMock;
  let cache: DiskCache;
  let resolver: Resolver;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slack-resolver-test-'));
    mock = makeMock();
    cache = new DiskCache(tmpDir, 3600);
    resolver = new Resolver(mock as never, cache, TEAM_ID);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('resolves a channel name to an id from a warm cache without a network call', async () => {
    await cache.set(TEAM_ID, 'channel', { general: 'C001' });

    const id = await resolver.resolveChannel('general');

    expect(id).toBe('C001');
    expect(mock.conversations.list).not.toHaveBeenCalled();
  });

  it('resolves a user name to an id from a warm cache without a network call', async () => {
    await cache.set(TEAM_ID, 'user', { alice: 'U001' });

    const id = await resolver.resolveUser('alice');

    expect(id).toBe('U001');
    expect(mock.users.list).not.toHaveBeenCalled();
  });

  it('refreshes from the api on a cache miss and stores the result', async () => {
    mock.conversations.list.mockResolvedValueOnce({
      ok: true,
      channels: [{ id: 'C100', name: 'engineering' }],
      response_metadata: { next_cursor: '' },
    });

    const id = await resolver.resolveChannel('engineering');

    expect(id).toBe('C100');
    expect(mock.conversations.list).toHaveBeenCalledOnce();

    mock.conversations.list.mockClear();
    const idAgain = await resolver.resolveChannel('engineering');
    expect(idAgain).toBe('C100');
    expect(mock.conversations.list).not.toHaveBeenCalled();
  });

  it('expires entries older than the TTL and refetches', async () => {
    const oldTime = Date.now() - 7200 * 1000;
    await cache.setWithTime(TEAM_ID, 'channel', { general: 'C001_OLD' }, oldTime);

    mock.conversations.list.mockResolvedValueOnce({
      ok: true,
      channels: [{ id: 'C001_NEW', name: 'general' }],
      response_metadata: { next_cursor: '' },
    });

    const id = await resolver.resolveChannel('general');

    expect(id).toBe('C001_NEW');
    expect(mock.conversations.list).toHaveBeenCalledOnce();
  });

  it('keys the cache by team_id so two workspaces do not collide', async () => {
    const resolverA = new Resolver(mock as never, cache, 'T_AAAAAA');
    const resolverB = new Resolver(mock as never, cache, 'T_BBBBBB');

    await cache.set('T_AAAAAA', 'channel', { ops: 'CA100' });
    await cache.set('T_BBBBBB', 'channel', { ops: 'CB200' });

    const idA = await resolverA.resolveChannel('ops');
    const idB = await resolverB.resolveChannel('ops');

    expect(idA).toBe('CA100');
    expect(idB).toBe('CB200');
    expect(mock.conversations.list).not.toHaveBeenCalled();
  });

  it('paginates conversations.list when populating', async () => {
    mock.conversations.list
      .mockResolvedValueOnce({
        ok: true,
        channels: [{ id: 'C001', name: 'alpha' }],
        response_metadata: { next_cursor: 'cursor_page2' },
      })
      .mockResolvedValueOnce({
        ok: true,
        channels: [{ id: 'C002', name: 'beta' }],
        response_metadata: { next_cursor: '' },
      });

    const idAlpha = await resolver.resolveChannel('alpha');
    const idBeta = await resolver.resolveChannel('beta');

    expect(idAlpha).toBe('C001');
    expect(idBeta).toBe('C002');
    expect(mock.conversations.list).toHaveBeenCalledTimes(2);
    expect(mock.conversations.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'cursor_page2' }),
    );
  });

  it('propagates a RateLimitError raised mid-pagination unchanged', async () => {
    const rateLimitErr = new RateLimitError('rate limited', 30);

    mock.conversations.list
      .mockResolvedValueOnce({
        ok: true,
        channels: [{ id: 'C001', name: 'alpha' }],
        response_metadata: { next_cursor: 'cursor_page2' },
      })
      .mockRejectedValueOnce(rateLimitErr);

    await expect(resolver.resolveChannel('beta')).rejects.toBe(rateLimitErr);
  });
});
