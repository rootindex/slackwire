import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findOrCreate, type FindOrCreateArgs } from './idempotency.js';
import type { SlackClient } from './slack-client.js';


function makeClientMock() {
  return {
    post: vi.fn(),
    update: vi.fn(),
    history: vi.fn(),
    search: vi.fn(),
  };
}

type ClientMock = ReturnType<typeof makeClientMock>;

const BASE_ARGS: Omit<FindOrCreateArgs, 'client' | 'tokenType'> = {
  channel: 'C123',
  dedupeKey: 'pipeline-42/job-7',
  templateRef: 'alert@2.1.0',
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'hello' } }],
  text: 'hello',
};

describe('idempotency', () => {
  let mock: ClientMock;

  beforeEach(() => {
    mock = makeClientMock();
    mock.post.mockResolvedValue({ channel: 'C123', ts: '111.001' });
    mock.update.mockResolvedValue({ channel: 'C123', ts: '111.001' });
    mock.history.mockResolvedValue([]);
    mock.search.mockResolvedValue([]);
  });

  it('stamps the dedupe key and template@version into message metadata on first post', async () => {
    await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(mock.post).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          event_type: 'slack_card',
          event_payload: expect.objectContaining({
            dedupe_key: 'pipeline-42/job-7',
            template_ref: 'alert@2.1.0',
          }),
        }),
      }),
    );
  });

  it('finds an existing message by dedupe key via conversations.history with a bot token', async () => {
    mock.history.mockResolvedValue([
      {
        ts: '111.001',
        text: 'old',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'pipeline-42/job-7', template_ref: 'alert@2.1.0' },
        },
      },
    ]);

    const result = await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(mock.history).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C123' }),
    );
    expect(result.ts).toBe('111.001');
    expect(result.found).toBe(true);
  });

  it('finds an existing message by dedupe key via search.messages with a user token', async () => {
    mock.search.mockResolvedValue([
      {
        ts: '222.001',
        text: 'old',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'pipeline-42/job-7', template_ref: 'alert@2.1.0' },
        },
      },
    ]);

    const result = await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'user',
    });

    expect(mock.search).toHaveBeenCalled();
    expect(mock.history).not.toHaveBeenCalled();
    expect(result.ts).toBe('222.001');
    expect(result.found).toBe(true);
  });

  it('updates the existing message instead of posting when found', async () => {
    mock.history.mockResolvedValue([
      {
        ts: '111.001',
        text: 'old',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'pipeline-42/job-7', template_ref: 'alert@2.1.0' },
        },
      },
    ]);

    await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(mock.post).not.toHaveBeenCalled();
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C123', ts: '111.001' }),
    );
  });

  it('re-renders the pinned template@version from metadata on a morph', async () => {
    mock.history.mockResolvedValue([
      {
        ts: '111.001',
        text: 'old',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'pipeline-42/job-7', template_ref: 'alert@1.0.0' },
        },
      },
    ]);

    const result = await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(result.pinnedTemplateRef).toBe('alert@1.0.0');
  });

  it('posts a new message when no match exists', async () => {
    mock.history.mockResolvedValue([
      {
        ts: '999.001',
        text: 'unrelated',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'other-key', template_ref: 'alert@2.1.0' },
        },
      },
    ]);

    await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(mock.post).toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns the same ts across two find-or-create calls with the same key', async () => {
    mock.post.mockResolvedValue({ channel: 'C123', ts: '555.001' });

    const first = await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    mock.history.mockResolvedValue([
      {
        ts: '555.001',
        text: 'posted',
        metadata: {
          event_type: 'slack_card',
          event_payload: { dedupe_key: 'pipeline-42/job-7', template_ref: 'alert@2.1.0' },
        },
      },
    ]);

    const second = await findOrCreate({
      ...BASE_ARGS,
      client: mock as unknown as SlackClient,
      tokenType: 'bot',
    });

    expect(first.ts).toBe('555.001');
    expect(second.ts).toBe('555.001');
    expect(mock.post).toHaveBeenCalledTimes(1);
  });
});
