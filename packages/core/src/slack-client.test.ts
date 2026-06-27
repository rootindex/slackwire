import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackClient } from './slack-client.js';
import { SlackApiError, RateLimitError, NetworkError } from './errors.js';
import { ErrorCode } from '@slack/web-api';

const TOKEN = 'xoxb-secret-token-abc123';

function makeWebClientMock() {
  return {
    chat: {
      postMessage: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      scheduleMessage: vi.fn(),
    },
    reactions: {
      add: vi.fn(),
    },
    conversations: {
      history: vi.fn(),
    },
    search: {
      messages: vi.fn(),
    },
    filesUploadV2: vi.fn(),
  };
}

type WebClientMock = ReturnType<typeof makeWebClientMock>;

describe('SlackClient', () => {
  let mock: WebClientMock;
  let client: SlackClient;

  beforeEach(() => {
    mock = makeWebClientMock();
    client = new SlackClient(TOKEN, mock as unknown as import('@slack/web-api').WebClient);
  });

  it('posts a message with metadata and returns channel and ts', async () => {
    mock.chat.postMessage.mockResolvedValue({
      ok: true,
      channel: 'C123',
      ts: '1234567890.000100',
    });

    const result = await client.post({
      channel: 'C123',
      text: 'hello',
      metadata: { event_type: 'card_posted', event_payload: { key: 'val' } },
    });

    expect(result).toEqual({ channel: 'C123', ts: '1234567890.000100' });
    expect(mock.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        text: 'hello',
        metadata: { event_type: 'card_posted', event_payload: { key: 'val' } },
      }),
    );
  });

  it('updates a message by ts', async () => {
    mock.chat.update.mockResolvedValue({
      ok: true,
      channel: 'C123',
      ts: '1234567890.000100',
    });

    const result = await client.update({
      channel: 'C123',
      ts: '1234567890.000100',
      text: 'updated',
      metadata: { event_type: 'card_updated', event_payload: {} },
    });

    expect(result).toEqual({ channel: 'C123', ts: '1234567890.000100' });
    expect(mock.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        ts: '1234567890.000100',
        text: 'updated',
        metadata: { event_type: 'card_updated', event_payload: {} },
      }),
    );
  });

  it('returns message metadata from history', async () => {
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [
        {
          ts: '111.000',
          text: 'msg1',
          metadata: { event_type: 'card_posted', event_payload: { id: '1' } },
        },
        {
          ts: '222.000',
          text: 'msg2',
        },
      ],
    });

    const messages = await client.history({ channel: 'C123', limit: 10 });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      ts: '111.000',
      metadata: { event_type: 'card_posted', event_payload: { id: '1' } },
    });
    expect(messages[1]).toMatchObject({ ts: '222.000' });
  });

  it('uploads a file via uploadV2 in a single call', async () => {
    mock.filesUploadV2.mockResolvedValue({ ok: true });

    await client.uploadV2({
      channel_id: 'C123',
      filename: 'report.png',
      content: 'binary-data',
    });

    expect(mock.filesUploadV2).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'C123',
        filename: 'report.png',
        content: 'binary-data',
      }),
    );
  });

  it('redacts the token from a thrown error', async () => {
    const sdkError = Object.assign(new Error(`invalid_auth token=${TOKEN}`), {
      code: ErrorCode.PlatformError,
      data: { ok: false, error: 'invalid_auth' },
    });
    mock.chat.postMessage.mockRejectedValue(sdkError);

    await expect(
      client.post({ channel: 'C123', text: 'hi' }),
    ).rejects.toSatisfy((err: unknown) => {
      const e = err as Error;
      return e instanceof SlackApiError && !e.message.includes(TOKEN);
    });
  });

  it('maps a 429 to a RateLimitError after the retry budget', async () => {
    const sdkError = Object.assign(new Error('rate_limited'), {
      code: ErrorCode.RateLimitedError,
      retryAfter: 30,
    });
    mock.chat.postMessage.mockRejectedValue(sdkError);

    await expect(
      client.post({ channel: 'C123', text: 'hi' }),
    ).rejects.toBeInstanceOf(RateLimitError);

    const err = await client
      .post({ channel: 'C123', text: 'hi' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(30);
  });

  it('honors HTTPS_PROXY when set', () => {
    const factory = (token: string, proxy: string) =>
      SlackClient.withProxy(token, proxy);

    const proxyClient = factory(TOKEN, 'http://proxy.corp:3128');
    expect(proxyClient).toBeInstanceOf(SlackClient);
  });

  it('maps search.messages matches into channel-scoped messages without relying on metadata', async () => {
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: {
        matches: [
          {
            ts: '333.000',
            text: 'Deploy pipeline-42/job-7 finished',
            channel: { id: 'C999', name: 'releases' },
          },
        ],
      },
    });

    const messages = await client.search('pipeline-42/job-7');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ ts: '333.000', channel: 'C999' });
    expect(messages[0]!.text).toContain('pipeline-42/job-7');
    expect(messages[0]!.metadata).toBeUndefined();
  });

  it('deletes a message by channel and ts', async () => {
    mock.chat.delete.mockResolvedValue({ ok: true });

    await client.delete('C123', '1234567890.000100');

    expect(mock.chat.delete).toHaveBeenCalledWith({
      channel: 'C123',
      ts: '1234567890.000100',
    });
  });

  it('adds a reaction with the timestamp mapped to the Slack arg', async () => {
    mock.reactions.add.mockResolvedValue({ ok: true });

    await client.react('C123', '1234567890.000100', 'tada');

    expect(mock.reactions.add).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '1234567890.000100',
      name: 'tada',
    });
  });

  it('schedules a message, mapping postAt to post_at and returning the scheduled id', async () => {
    mock.chat.scheduleMessage.mockResolvedValue({
      ok: true,
      scheduled_message_id: 'Q123ABC',
    });

    const result = await client.schedule({
      channel: 'C123',
      postAt: 1700000000,
      text: 'later',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'later' } }],
    });

    expect(result).toEqual({ scheduledMessageId: 'Q123ABC' });
    expect(mock.chat.scheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        post_at: 1700000000,
        text: 'later',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'later' } }],
      }),
    );
  });

  it('maps an HTTPError code to a NetworkError', async () => {
    const sdkError = Object.assign(new Error('socket hang up'), {
      code: ErrorCode.HTTPError,
    });
    mock.chat.postMessage.mockRejectedValue(sdkError);

    await expect(
      client.post({ channel: 'C123', text: 'hi' }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('maps a non-Error throw to a generic SlackApiError', async () => {
    mock.chat.postMessage.mockRejectedValue('catastrophe');

    const err = await client
      .post({ channel: 'C123', text: 'hi' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SlackApiError);
    expect((err as SlackApiError).code).toBe('unknown');
    expect((err as SlackApiError).message).toBe('unknown error');
  });
});
