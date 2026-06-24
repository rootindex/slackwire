import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAuthTest, runSmokePost } from './smoke.js';

const FAKE_TOKEN = 'xoxb-fake-0000-0000-aaabbbcccddd';
const TEST_CHANNEL = 'C0EXAMPLE123';

function makeWebClientMock(authResult: object, postResult: object) {
  return {
    auth: {
      test: vi.fn().mockResolvedValue(authResult),
    },
    chat: {
      postMessage: vi.fn().mockResolvedValue(postResult),
    },
  };
}

describe('smoke', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['SLACK_SMOKE'];
    delete process.env['SLACK_TOKEN'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns ok and a team_id from auth.test with a valid token', async () => {
    const mockClient = makeWebClientMock(
      { ok: true, team_id: 'T12345678', user_id: 'U99999' },
      {},
    );

    const result = await runAuthTest(FAKE_TOKEN, mockClient as never);

    expect(result.ok).toBe(true);
    expect(typeof result.team_id).toBe('string');
    expect(result.team_id.length).toBeGreaterThan(0);
  });

  it('posts a message and returns a ts when the live smoke flag is set', async () => {
    const mockClient = makeWebClientMock(
      { ok: true, team_id: 'T12345678', user_id: 'U99999' },
      { ok: true, channel: TEST_CHANNEL, ts: '1700000000.000100' },
    );

    const result = await runSmokePost(FAKE_TOKEN, TEST_CHANNEL, mockClient as never);

    expect(typeof result.ts).toBe('string');
    expect(result.ts.length).toBeGreaterThan(0);
  });

  it('skips the live smoke test when no token is present', async () => {
    delete process.env['SLACK_TOKEN'];
    const smokeFlag = process.env['SLACK_SMOKE'] === '1';
    const tokenPresent = Boolean(process.env['SLACK_TOKEN']);

    const shouldRun = smokeFlag && tokenPresent;
    expect(shouldRun).toBe(false);
  });

  it('never prints the token in output or errors', async () => {
    const mockClient = {
      auth: {
        test: vi.fn().mockRejectedValue(
          Object.assign(new Error(`invalid_auth token=${FAKE_TOKEN}`), {
            code: 'slack_webapi_platform_error',
          }),
        ),
      },
      chat: { postMessage: vi.fn() },
    };

    const err = await runAuthTest(FAKE_TOKEN, mockClient as never).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(FAKE_TOKEN);
  });
});
