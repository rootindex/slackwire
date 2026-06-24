import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunIO } from './run.js';

vi.mock('@slack-cards/core', async () => {
  const SchemaError = class SchemaError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SchemaError';
    }
  };
  const StructuralError = class StructuralError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StructuralError';
    }
  };
  const LimitError = class LimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LimitError';
    }
  };
  const SlackApiError = class SlackApiError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = 'SlackApiError';
    }
  };
  const NetworkError = class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  };
  const RateLimitError = class RateLimitError extends Error {
    constructor(message: string, public readonly retryAfter: number) {
      super(message);
      this.name = 'RateLimitError';
    }
  };

  const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
  const mockUpdate = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
  const mockResolveChannel = vi.fn().mockResolvedValue(undefined);

  const SlackClient = vi.fn().mockImplementation(() => ({
    post: mockPost,
    update: mockUpdate,
    history: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
  }));

  const Resolver = vi.fn().mockImplementation(() => ({
    resolveChannel: mockResolveChannel,
    resolveUser: vi.fn().mockResolvedValue(undefined),
  }));

  const render = vi.fn().mockReturnValue({
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
    attachments: [],
    text: 'Hello',
  });

  const loadConfig = vi.fn().mockReturnValue({
    token: 'xoxb-test-token',
    tokenType: 'bot',
    attribution: false,
  });

  return {
    SchemaError,
    StructuralError,
    LimitError,
    SlackApiError,
    NetworkError,
    RateLimitError,
    SlackClient,
    Resolver,
    render,
    loadConfig,
    VERSION: '0.0.0',
  };
});

function makeIO(envOverrides: Record<string, string> = {}): RunIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line: string) => { out.push(line); },
    stderr: (line: string) => { err.push(line); },
    env: {
      SLACK_TOKEN: 'xoxb-test-token',
      ...envOverrides,
    },
  };
}

describe('CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts a card from a template and prints ts and permalink', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
      attachments: [],
      text: 'Hello',
    });

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{"title":"Hello"}',
    ], io);

    expect(code).toBe(0);
    expect(io.out).toHaveLength(1);
    expect(io.out[0]).toMatch(/^1234567890\.123456\t/);
    expect(io.out[0]).toContain('https://slack.com/archives/C123/p');
    expect(mockPost).toHaveBeenCalledOnce();
  });

  it('morphs an existing card with update --ts', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Updated' } }],
      attachments: [],
      text: 'Updated',
    });

    const mockUpdate = vi.fn().mockResolvedValue({ channel: 'C123', ts: '9999999999.000001' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: mockUpdate,
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'update',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
      '--template', 'announce@1.0.0',
      '--data', '{"title":"Updated"}',
    ], io);

    expect(code).toBe(0);
    expect(io.out).toHaveLength(1);
    expect(io.out[0]).toMatch(/^9999999999\.000001\t/);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ts: '1234567890.123456', channel: 'C123' }),
    );
  });

  it('resolves a channel name to an id before posting', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, Resolver, render } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [],
      attachments: [],
      text: 'Hello',
    });

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C456', ts: '1111111111.000001' });
    const mockResolveChannel = vi.fn().mockResolvedValue('C456');
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      web: {},
    }));
    (Resolver as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      resolveChannel: mockResolveChannel,
    }));

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'general',
      '--data', '{}',
    ], io);

    expect(code).toBe(0);
    expect(mockResolveChannel).toHaveBeenCalledWith('general');
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C456' }),
    );
  });

  it('exits 2 on a validation error', async () => {
    const { run } = await import('./run.js');
    const { render, SchemaError } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new (SchemaError as new (msg: string) => Error)('missing required field: title');
    });

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{}',
    ], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('Validation error'))).toBe(true);
  });

  it('exits 0 and warns under the default non-blocking fail mode on a Slack error', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render, SlackApiError } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [],
      attachments: [],
      text: 'Hello',
    });

    const mockPost = vi.fn().mockRejectedValue(
      new (SlackApiError as new (msg: string, code: string) => Error)('channel_not_found', 'channel_not_found'),
    );
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{}',
    ], io);

    expect(code).toBe(0);
    expect(io.err.some(e => e.includes('Warning'))).toBe(true);
  });

  it('reads the token from SLACK_TOKEN_FILE when SLACK_TOKEN is absent', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slack-cards/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [], attachments: [], text: 'Hi',
    });
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '2222222222.000002' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const dir = mkdtempSync(join(tmpdir(), 'clitok-'));
    const file = join(dir, 'tok');
    writeFileSync(file, 'xoxb-from-file\n');

    const out: string[] = [];
    const err: string[] = [];
    const io: RunIO & { out: string[]; err: string[] } = {
      out, err,
      stdout: (line: string) => { out.push(line); },
      stderr: (line: string) => { err.push(line); },
      env: { SLACK_TOKEN_FILE: file },
    };

    const code = await run([
      'card', '--template', 'announce@1.0.0', '--channel', 'C123', '--data', '{}',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).toHaveBeenCalledOnce();
    expect(SlackClient).toHaveBeenCalledWith('xoxb-from-file');
  });

  it('forwards non-empty attachments to client.post', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slack-cards/core');

    const mockAttachments = [{ color: '#2eb67d', blocks: [] }];
    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
      attachments: mockAttachments,
      text: 'Hello',
    });

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{"title":"Hello"}',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).toHaveBeenCalledOnce();
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: mockAttachments }),
    );
  });

  it('prints assembled JSON and posts nothing under --dry-run', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slack-cards/core');

    const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Dry run' } }];
    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: mockBlocks,
      attachments: [],
      text: 'Dry run',
    });

    const mockPost = vi.fn();
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
    }));

    const io = makeIO();
    const code = await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{}',
      '--dry-run',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).not.toHaveBeenCalled();
    const output = io.out.join('\n');
    const parsed = JSON.parse(output) as { blocks: unknown[] };
    expect(parsed.blocks).toEqual(mockBlocks);
  });
});
