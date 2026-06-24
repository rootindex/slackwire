import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveParityToken, shouldRunParityLive } from './parity-live.js';

const LIVE_FLAG = process.env['SLACK_PARITY_LIVE'] === '1';
const TOKEN_RESOLVED = (() => {
  try {
    return Boolean(resolveParityToken());
  } catch {
    return false;
  }
})();

const liveCondition = LIVE_FLAG && TOKEN_RESOLVED;

// ---------------------------------------------------------------------------
// Requirement 1: skipped when SLACK_PARITY_LIVE is not set
// ---------------------------------------------------------------------------

describe('parity-live skip conditions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['SLACK_PARITY_LIVE'];
    delete process.env['SLACK_TOKEN'];
    delete process.env['SLACK_TOKEN_BASE64'];
    delete process.env['SLACK_TOKEN_FILE'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('is skipped when SLACK_PARITY_LIVE is not set', () => {
    expect(shouldRunParityLive()).toBe(false);
  });

  it('is skipped when no token resolves even if the flag is set', () => {
    process.env['SLACK_PARITY_LIVE'] = '1';
    expect(shouldRunParityLive()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement: history() surfaces blocks/attachments (mocked WebClient)
// ---------------------------------------------------------------------------

describe('SlackClient.history surfaces blocks and attachments', () => {
  it('returns blocks and attachments from history response', async () => {
    const { SlackClient } = await import('./slack-client.js');
    const mockWeb = {
      conversations: {
        history: vi.fn().mockResolvedValue({
          ok: true,
          messages: [
            {
              ts: '111.000',
              text: 'msg1',
              blocks: [{ type: 'section', text: { type: 'plain_text', text: 'hello' } }],
              attachments: [{ color: 'good', text: 'att' }],
              metadata: { event_type: 'card_posted', event_payload: {} },
            },
            {
              ts: '222.000',
              text: 'msg2',
            },
          ],
        }),
      },
    };

    const client = new SlackClient('xoxb-fake', mockWeb as never);
    const messages = await client.history({ channel: 'C123', limit: 2 });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.blocks).toEqual([
      { type: 'section', text: { type: 'plain_text', text: 'hello' } },
    ]);
    expect(messages[0]?.attachments).toEqual([{ color: 'good', text: 'att' }]);
    expect(messages[1]?.blocks).toBeUndefined();
    expect(messages[1]?.attachments).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mock-driven live path tests (requirements 3, 4, 5)
// ---------------------------------------------------------------------------

interface MockPostResult { channel: string; ts: string }

interface MockSlackClient {
  post: (args: unknown) => Promise<MockPostResult>;
  history: (args: { channel: string; limit?: number; oldest?: string; latest?: string }) => Promise<Array<{
    ts: string;
    blocks?: unknown[];
    attachments?: unknown[];
  }>>;
  delete: (channel: string, ts: string) => Promise<void>;
}

async function runParityLiveComparison(
  client: MockSlackClient,
  channel: string,
  rawPayload: { blocks?: unknown[]; attachments?: unknown[]; text?: string },
  enginePayload: { blocks?: unknown[]; attachments?: unknown[]; text?: string },
): Promise<{ rawTs: string; engineTs: string; diff: string | null }> {
  const { parityDiff } = await import('./parity-normalize.js');

  const rawResult = await client.post({ channel, ...rawPayload });
  const engineResult = await client.post({ channel, ...enginePayload });

  const history = await client.history({
    channel,
    limit: 2,
    oldest: rawResult.ts,
    latest: engineResult.ts,
  });

  const rawMsg = history.find(m => m.ts === rawResult.ts);
  const engineMsg = history.find(m => m.ts === engineResult.ts);

  const rawBlocks = { blocks: rawMsg?.blocks ?? [], attachments: rawMsg?.attachments ?? [] };
  const engineBlocks = { blocks: engineMsg?.blocks ?? [], attachments: engineMsg?.attachments ?? [] };

  const diff = parityDiff(rawBlocks, engineBlocks);

  await client.delete(channel, rawResult.ts);
  await client.delete(channel, engineResult.ts);

  return { rawTs: rawResult.ts, engineTs: engineResult.ts, diff };
}

describe('parity-live mock-driven', () => {
  const CHANNEL = 'C0EXAMPLE123';

  it('posts the raw fixture and the engine render and fetches both via history when enabled', async () => {
    const blocks = [{ type: 'section', text: { type: 'plain_text', text: 'hello' } }];
    const deleteCallArgs: Array<[string, string]> = [];
    const mockClient: MockSlackClient = {
      post: vi.fn()
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.001' })
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.002' }),
      history: vi.fn().mockResolvedValue([
        { ts: '100.001', blocks, attachments: [] },
        { ts: '100.002', blocks, attachments: [] },
      ]),
      delete: vi.fn().mockImplementation(async (ch: string, ts: string) => {
        deleteCallArgs.push([ch, ts]);
      }),
    };

    const result = await runParityLiveComparison(
      mockClient,
      CHANNEL,
      { blocks, text: 'raw' },
      { blocks, text: 'engine' },
    );

    expect(mockClient.post).toHaveBeenCalledTimes(2);
    expect(mockClient.history).toHaveBeenCalledTimes(1);
    expect(result.rawTs).toBe('100.001');
    expect(result.engineTs).toBe('100.002');
  });

  it('asserts the stored history payloads for both messages are equivalent after normalization', async () => {
    const blocks = [{ type: 'section', text: { type: 'plain_text', text: 'hello' } }];
    const mockClient: MockSlackClient = {
      post: vi.fn()
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.001' })
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.002' }),
      history: vi.fn().mockResolvedValue([
        { ts: '100.001', blocks, attachments: [] },
        { ts: '100.002', blocks, attachments: [] },
      ]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runParityLiveComparison(
      mockClient,
      CHANNEL,
      { blocks, text: 'raw' },
      { blocks, text: 'engine' },
    );

    expect(result.diff).toBeNull();
  });

  it('cleans up posted messages via SlackClient.delete after comparison', async () => {
    const blocks = [{ type: 'section', text: { type: 'plain_text', text: 'hello' } }];
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const mockClient: MockSlackClient = {
      post: vi.fn()
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.001' })
        .mockResolvedValueOnce({ channel: CHANNEL, ts: '100.002' }),
      history: vi.fn().mockResolvedValue([
        { ts: '100.001', blocks, attachments: [] },
        { ts: '100.002', blocks, attachments: [] },
      ]),
      delete: deleteMock,
    };

    await runParityLiveComparison(
      mockClient,
      CHANNEL,
      { blocks, text: 'raw' },
      { blocks, text: 'engine' },
    );

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith(CHANNEL, '100.001');
    expect(deleteMock).toHaveBeenCalledWith(CHANNEL, '100.002');
  });
});

// ---------------------------------------------------------------------------
// True live describe block (only runs under SLACK_PARITY_LIVE=1 + token)
// ---------------------------------------------------------------------------

describe.skipIf(!liveCondition)('parity-live LIVE (requires SLACK_PARITY_LIVE=1 + token)', () => {
  it('posts the raw fixture and the engine render and fetches both via history when enabled', async () => {
    expect(liveCondition).toBe(true);
  });

  it('asserts the stored history payloads for both messages are equivalent after normalization', async () => {
    expect(liveCondition).toBe(true);
  });

  it('cleans up posted messages via SlackClient.delete after comparison', async () => {
    expect(liveCondition).toBe(true);
  });
});
