import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunIO } from './run.js';

vi.mock('@slackwire/core', async () => {
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
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockReact = vi.fn().mockResolvedValue(undefined);
  const mockUploadV2 = vi.fn().mockResolvedValue(undefined);
  const mockResolveChannel = vi.fn().mockResolvedValue(undefined);

  const SlackClient = vi.fn().mockImplementation(() => ({
    post: mockPost,
    update: mockUpdate,
    delete: mockDelete,
    react: mockReact,
    uploadV2: mockUploadV2,
    history: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    schedule: vi.fn().mockResolvedValue({ scheduledMessageId: 'Q000000' }),
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

  const validateStructural = vi.fn();
  const validateLimits = vi.fn();
  const deriveFallback = vi.fn().mockReturnValue('fallback text');

  const { readFileSync } = await import('node:fs');
  const resolveTokenFrom = vi.fn((env: Record<string, string | undefined>): string | undefined => {
    if (env['SLACK_TOKEN']) return env['SLACK_TOKEN'].trim();
    if (env['SLACK_TOKEN_BASE64']) return Buffer.from(env['SLACK_TOKEN_BASE64'], 'base64').toString('utf8').trim();
    if (env['SLACK_TOKEN_FILE']) return readFileSync(env['SLACK_TOKEN_FILE'], 'utf8').trim();
    return undefined;
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
    validateStructural,
    validateLimits,
    deriveFallback,
    resolveTokenFrom,
    VERSION: '0.1.1',
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
    const { SlackClient, render } = await import('@slackwire/core');

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
    const { SlackClient, render } = await import('@slackwire/core');

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
    const { SlackClient, Resolver, render } = await import('@slackwire/core');

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
    const { render, SchemaError } = await import('@slackwire/core');

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
    const { SlackClient, render, SlackApiError } = await import('@slackwire/core');

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
    const { SlackClient, render } = await import('@slackwire/core');

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
    const { SlackClient, render } = await import('@slackwire/core');

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

  it('passes --theme as the render themeToken', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slackwire/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [], attachments: [], text: 'Hello',
    });
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{}',
      '--theme', '#FF0000',
    ], io);

    expect(render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ themeToken: '#FF0000' }),
    );
  });

  it('lets --theme take precedence over a payload accent field', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slackwire/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [], attachments: [], text: 'Hello',
    });
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    await run([
      'card',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{"accent":"#00FF00"}',
      '--theme', '#FF0000',
    ], io);

    expect(render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ themeToken: '#FF0000' }),
    );
  });

  it('applies --theme on the update verb as well', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slackwire/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [], attachments: [], text: 'Updated',
    });
    const mockUpdate = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: mockUpdate,
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    await run([
      'update',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
      '--template', 'announce@1.0.0',
      '--data', '{}',
      '--theme', '#ABCDEF',
    ], io);

    expect(render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ themeToken: '#ABCDEF' }),
    );
  });

  it('prints assembled JSON and posts nothing under --dry-run', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slackwire/core');

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

  it('posts a plain text message with post --text', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'Hello world',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello world', channel: 'C123' }));
    expect(io.out[0]).toMatch(/^1234567890\.123456\t/);
  });

  it('posts raw blocks with post --blocks', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'raw' } }];
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', JSON.stringify(blocks),
    ], io);

    expect(code).toBe(0);
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ blocks, channel: 'C123' }));
    expect(io.out[0]).toMatch(/^1234567890\.123456\t/);
  });

  it('reads raw blocks from stdin with post --blocks -', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'from stdin' } }];
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    (io as RunIO & { out: string[]; err: string[]; stdin?: string }).stdin = JSON.stringify(blocks);
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', '-',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ blocks, channel: 'C123' }));
  });

  it('derives fallback text for raw blocks when no --text is given', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, deriveFallback } = await import('@slackwire/core');

    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hello' } }];
    (deriveFallback as ReturnType<typeof vi.fn>).mockReturnValue('derived fallback');
    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', JSON.stringify(blocks),
    ], io);

    expect(code).toBe(0);
    expect(deriveFallback).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ text: 'derived fallback' }));
  });

  it('still posts from a template with post --template', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, render } = await import('@slackwire/core');

    (render as ReturnType<typeof vi.fn>).mockReturnValue({
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'from template' } }],
      attachments: [],
      text: 'from template',
    });

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--template', 'announce@1.0.0',
      '--channel', 'C123',
      '--data', '{"title":"Hi"}',
    ], io);

    expect(code).toBe(0);
    expect(render).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C123' }));
    expect(io.out[0]).toMatch(/^1234567890\.123456\t/);
  });

  it('errors with exit 2 when post has neither text nor blocks nor template', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
    ], io);

    expect(code).toBe(2);
    expect(io.err.length).toBeGreaterThan(0);
  });

  it('updates a message with raw blocks via update --blocks', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'updated raw' } }];
    const mockUpdate = vi.fn().mockResolvedValue({ channel: 'C123', ts: '9999999999.000001' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: mockUpdate,
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'update',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
      '--blocks', JSON.stringify(blocks),
    ], io);

    expect(code).toBe(0);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'C123',
      ts: '1234567890.123456',
      blocks,
    }));
    expect(io.out[0]).toMatch(/^9999999999\.000001\t/);
  });

  it('deletes a message with delete --channel --ts', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: mockDelete,
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'delete',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
    ], io);

    expect(code).toBe(0);
    expect(mockDelete).toHaveBeenCalledWith('C123', '1234567890.123456');
    expect(io.out[0]).toContain('deleted');
    expect(io.out[0]).toContain('1234567890.123456');
  });

  it('reacts to a message with react --emoji', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockReact = vi.fn().mockResolvedValue(undefined);
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: mockReact,
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'react',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
      '--emoji', 'thumbsup',
    ], io);

    expect(code).toBe(0);
    expect(mockReact).toHaveBeenCalledWith('C123', '1234567890.123456', 'thumbsup');
    expect(io.out[0]).toContain('reacted');
    expect(io.out[0]).toContain('thumbsup');
  });

  it('uploads a file with upload --file', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const dir = mkdtempSync(join(tmpdir(), 'upload-test-'));
    const filePath = join(dir, 'test.txt');
    writeFileSync(filePath, 'file contents');

    const mockUploadV2 = vi.fn().mockResolvedValue(undefined);
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: mockUploadV2,
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'upload',
      '--channel', 'C123',
      '--file', filePath,
    ], io);

    expect(code).toBe(0);
    expect(mockUploadV2).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'C123',
    }));
    expect(io.out[0]).toContain('uploaded');
  });

  it('prints assembled JSON and posts nothing under post --dry-run', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockPost = vi.fn();
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'hi',
      '--dry-run',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).not.toHaveBeenCalled();
    const parsed = JSON.parse(io.out.join('\n')) as { text: string };
    expect(parsed.text).toBe('hi');
  });

  it('does not require a token under post --dry-run', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockPost = vi.fn();
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const out: string[] = [];
    const err: string[] = [];
    const io: RunIO & { out: string[]; err: string[] } = {
      out, err,
      stdout: (line: string) => { out.push(line); },
      stderr: (line: string) => { err.push(line); },
      env: {},
    };

    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'hi',
      '--dry-run',
    ], io);

    expect(code).toBe(0);
    expect(mockPost).not.toHaveBeenCalled();
    const parsed = JSON.parse(out.join('\n')) as { text: string };
    expect(parsed.text).toBe('hi');
  });

  it('prints assembled JSON and calls no API under update --dry-run', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockUpdate = vi.fn();
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: mockUpdate,
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'update',
      '--channel', 'C123',
      '--ts', '1234567890.123456',
      '--text', 'updated hi',
      '--dry-run',
    ], io);

    expect(code).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
    const parsed = JSON.parse(io.out.join('\n')) as { text: string };
    expect(parsed.text).toBe('updated hi');
  });

  it('resolves a channel name to id before posting', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, Resolver } = await import('@slackwire/core');

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C456', ts: '1111111111.000001' });
    const mockResolveChannel = vi.fn().mockResolvedValue('C456');
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      web: {},
    }));
    (Resolver as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      resolveChannel: mockResolveChannel,
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'general',
      '--text', 'hello',
    ], io);

    expect(code).toBe(0);
    expect(mockResolveChannel).toHaveBeenCalledWith('general');
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C456' }));
  });

  it('searches messages and prints one tab-separated line per match', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockSearch = vi.fn().mockResolvedValue([
      { ts: '333.000', channel: 'C999', text: 'deploy finished' },
      { ts: '444.000', text: 'no channel here' },
    ]);
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: mockSearch,
      schedule: vi.fn(),
    }));

    const io = makeIO();
    const code = await run(['search', '--query', 'deploy', '--limit', '5'], io);

    expect(code).toBe(0);
    expect(mockSearch).toHaveBeenCalledWith('deploy', expect.objectContaining({ count: 5 }));
    expect(io.out).toEqual([
      '333.000\tC999\tdeploy finished',
      '444.000\t\tno channel here',
    ]);
  });

  it('exits 2 when search has no --query', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run(['search'], io);

    expect(code).toBe(2);
    expect(io.err.length).toBeGreaterThan(0);
  });

  it('reads channel history and prints one tab-separated line per message', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockHistory = vi.fn().mockResolvedValue([
      { ts: '111.000', text: 'first message' },
      { ts: '222.000', text: 'second\nmessage' },
    ]);
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: mockHistory,
      search: vi.fn().mockResolvedValue([]),
      schedule: vi.fn(),
    }));

    const io = makeIO();
    const code = await run(['read', '--channel', 'C123', '--limit', '2'], io);

    expect(code).toBe(0);
    expect(mockHistory).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C123', limit: 2 }));
    expect(io.out).toEqual(['111.000\tfirst message', '222.000\tsecond message']);
  });

  it('exits 2 when read has no --channel', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run(['read'], io);

    expect(code).toBe(2);
    expect(io.err.length).toBeGreaterThan(0);
  });

  it('assembles and prints a scheduled message under schedule --dry-run without a token', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockSchedule = vi.fn();
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      schedule: mockSchedule,
    }));

    const out: string[] = [];
    const err: string[] = [];
    const io: RunIO & { out: string[]; err: string[] } = {
      out,
      err,
      stdout: (line: string) => { out.push(line); },
      stderr: (line: string) => { err.push(line); },
      env: {},
    };

    const code = await run([
      'schedule',
      '--channel', 'C123',
      '--at', '1700000000',
      '--text', 'send me later',
      '--dry-run',
    ], io);

    expect(code).toBe(0);
    expect(mockSchedule).not.toHaveBeenCalled();
    const parsed = JSON.parse(out.join('\n')) as { post_at: number; text: string };
    expect(parsed.post_at).toBe(1700000000);
    expect(parsed.text).toBe('send me later');
  });

  it('schedules a message at an ISO time and prints the scheduled id', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockSchedule = vi.fn().mockResolvedValue({ scheduledMessageId: 'Q123ABC' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      schedule: mockSchedule,
    }));

    const io = makeIO();
    const code = await run([
      'schedule',
      '--channel', 'C123',
      '--at', '2030-01-01T00:00:00Z',
      '--text', 'happy new year',
    ], io);

    expect(code).toBe(0);
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'C123',
      postAt: Math.floor(Date.parse('2030-01-01T00:00:00Z') / 1000),
      text: 'happy new year',
    }));
    expect(io.out[0]).toBe('scheduled\tQ123ABC');
  });

  it('exits 2 when schedule --at is not a valid time', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([
      'schedule',
      '--channel', 'C123',
      '--at', 'not-a-date',
      '--text', 'x',
    ], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('--at'))).toBe(true);
  });

  it('exits 2 when schedule has no body source', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([
      'schedule',
      '--channel', 'C123',
      '--at', '1700000000',
    ], io);

    expect(code).toBe(2);
    expect(io.err.length).toBeGreaterThan(0);
  });

  it('maps a SlackApiError to exit 3 under --fail-mode block', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, SlackApiError } = await import('@slackwire/core');

    const mockPost = vi.fn().mockRejectedValue(
      new (SlackApiError as new (msg: string, code: string) => Error)('channel_not_found', 'channel_not_found'),
    );
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'hi',
      '--fail-mode', 'block',
    ], io);

    expect(code).toBe(3);
    expect(io.err.some(e => e.includes('Error'))).toBe(true);
  });

  it('maps a NetworkError to exit 4 under --fail-mode block', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, NetworkError } = await import('@slackwire/core');

    const mockPost = vi.fn().mockRejectedValue(
      new (NetworkError as new (msg: string) => Error)('socket hang up'),
    );
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'hi',
      '--fail-mode', 'block',
    ], io);

    expect(code).toBe(4);
  });

  it('maps a RateLimitError to exit 5 under --fail-mode block', async () => {
    const { run } = await import('./run.js');
    const { SlackClient, RateLimitError } = await import('@slackwire/core');

    const mockPost = vi.fn().mockRejectedValue(
      new (RateLimitError as new (msg: string, retryAfter: number) => Error)('rate_limited', 30),
    );
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--text', 'hi',
      '--fail-mode', 'block',
    ], io);

    expect(code).toBe(5);
  });

  it('decodes a SLACK_TOKEN_BASE64 token and constructs the client with it', async () => {
    const { run } = await import('./run.js');
    const { SlackClient } = await import('@slackwire/core');

    const mockPost = vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.123456' });
    (SlackClient as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      post: mockPost,
      update: vi.fn(),
      delete: vi.fn(),
      react: vi.fn(),
      uploadV2: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    }));

    const out: string[] = [];
    const err: string[] = [];
    const io: RunIO & { out: string[]; err: string[] } = {
      out, err,
      stdout: (line: string) => { out.push(line); },
      stderr: (line: string) => { err.push(line); },
      env: { SLACK_TOKEN_BASE64: Buffer.from('xoxb-decoded-token').toString('base64') },
    };

    const code = await run(['post', '--channel', 'C123', '--text', 'hi'], io);

    expect(code).toBe(0);
    expect(SlackClient).toHaveBeenCalledWith('xoxb-decoded-token');
  });

  it('exits 2 with no token configured on a non-dry-run command', async () => {
    const { run } = await import('./run.js');

    const out: string[] = [];
    const err: string[] = [];
    const io: RunIO & { out: string[]; err: string[] } = {
      out, err,
      stdout: (line: string) => { out.push(line); },
      stderr: (line: string) => { err.push(line); },
      env: {},
    };

    const code = await run(['post', '--channel', 'C123', '--text', 'hi'], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('No Slack token configured'))).toBe(true);
  });

  it('exits 2 when post --blocks is not valid JSON', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', '{not valid json',
    ], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('must be valid JSON'))).toBe(true);
  });

  it('exits 2 when post --blocks has the wrong JSON shape', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', '{"notblocks":1}',
    ], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('must be a JSON array or object'))).toBe(true);
  });

  it('exits 2 when post --blocks fails structural/limit validation', async () => {
    const { run } = await import('./run.js');
    const { validateLimits, LimitError } = await import('@slackwire/core');

    (validateLimits as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new (LimitError as new (msg: string) => Error)('too many blocks');
    });

    const io = makeIO();
    const code = await run([
      'post',
      '--channel', 'C123',
      '--blocks', JSON.stringify([{ type: 'section', text: { type: 'mrkdwn', text: 'x' } }]),
    ], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('Validation error'))).toBe(true);
  });

  it('prints the usage banner and exits 2 when no verb is given', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run([], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('Usage:'))).toBe(true);
  });

  it('exits 2 on an unknown verb', async () => {
    const { run } = await import('./run.js');

    const io = makeIO();
    const code = await run(['frobnicate', '--channel', 'C123'], io);

    expect(code).toBe(2);
    expect(io.err.some(e => e.includes('Unknown verb'))).toBe(true);
  });
});
