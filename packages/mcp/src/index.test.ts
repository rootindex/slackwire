import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SlackClient, Resolver } from '@slackwire/core';
import { createMcpServer, NO_TOKEN_MESSAGE } from './server.js';

function makeMockClient(): SlackClient {
  return {
    post: vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.000001' }),
    update: vi.fn().mockResolvedValue({ channel: 'C123', ts: '1234567890.000001' }),
    delete: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue({ scheduledMessageId: 'sched1' }),
    react: vi.fn().mockResolvedValue(undefined),
    uploadV2: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    history: vi.fn().mockResolvedValue([]),
  } as unknown as SlackClient;
}

function makeMockResolver(channelMap: Record<string, string> = {}): Resolver {
  return {
    resolveChannel: vi.fn().mockImplementation((name: string) => Promise.resolve(channelMap[name])),
    resolveUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as Resolver;
}

async function createTestPair(
  slackClient: SlackClient | null,
  resolver: Resolver | null,
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = createMcpServer(slackClient, resolver);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('mcp server', () => {
  it('lists the expected tools on initialize', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver();
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toContain('post_card');
      expect(names).toContain('update_card');
      expect(names).toContain('post');
      expect(names).toContain('react');
      expect(names).toContain('upload');
      expect(names).toContain('resolve');
    } finally {
      await cleanup();
    }
  });

  it('posts a card via the post_card tool and returns ts and permalink', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'post_card',
        arguments: {
          channel: 'general',
          blocks: JSON.stringify([{ type: 'section', text: { type: 'mrkdwn', text: 'hello' } }]),
          text: 'hello',
        },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]).toBeDefined();
      const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
      expect(parsed['ts']).toBe('1234567890.000001');
      expect(typeof parsed['permalink']).toBe('string');
    } finally {
      await cleanup();
    }
  });

  it('morphs a card via the update_card tool', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'update_card',
        arguments: {
          channel: 'general',
          ts: '1234567890.000001',
          blocks: JSON.stringify([{ type: 'section', text: { type: 'mrkdwn', text: 'updated' } }]),
          text: 'updated',
        },
      });
      expect(slackClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', ts: '1234567890.000001' }),
      );
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
      expect(parsed['ts']).toBe('1234567890.000001');
    } finally {
      await cleanup();
    }
  });

  it('resolves a channel name via the resolve tool from cache', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ engineering: 'C456' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'resolve',
        arguments: { name: 'engineering', type: 'channel' },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
      expect(parsed['id']).toBe('C456');
    } finally {
      await cleanup();
    }
  });

  it('writes logs to stderr and never corrupts the stdout protocol stream', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    const stdoutSpy = vi.spyOn(process.stdout, 'write');

    const slackClient = makeMockClient();
    const resolver = makeMockResolver();
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      await client.listTools();
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));

      const hasStderrLog = stderrCalls.some((s) => s.includes('slackwire-mcp'));
      expect(hasStderrLog).toBe(true);

      const hasStdoutLog = stdoutCalls.some(
        (s) => s.includes('slackwire-mcp') && !s.startsWith('{'),
      );
      expect(hasStdoutLog).toBe(false);
    } finally {
      await cleanup();
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });

  it('returns a clean tool error for malformed blocks JSON without posting', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'post_card',
        arguments: { channel: 'general', blocks: '{not valid json' },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Invalid blocks');
      expect(slackClient.post).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it('rejects an over-limit blocks array before posting', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const tooMany = Array.from({ length: 51 }, (_, i) => ({
        type: 'section',
        text: { type: 'mrkdwn', text: `block ${i}` },
      }));
      const result = await client.callTool({
        name: 'post_card',
        arguments: { channel: 'general', blocks: JSON.stringify(tooMany) },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Validation error');
      expect(slackClient.post).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it('posts a plain text message via the post tool', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'post',
        arguments: { channel: 'general', text: 'hello world' },
      });
      expect(slackClient.post).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', text: 'hello world' }),
      );
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
      expect(parsed['ts']).toBe('1234567890.000001');
    } finally {
      await cleanup();
    }
  });

  it('adds a reaction via the react tool', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'react',
        arguments: { channel: 'general', ts: '1234567890.000001', name: 'tada' },
      });
      expect(slackClient.react).toHaveBeenCalledWith('C123', '1234567890.000001', 'tada');
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toBe('ok');
    } finally {
      await cleanup();
    }
  });

  it('uploads a file via the upload tool', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'upload',
        arguments: { channel: 'general', filename: 'report.txt', content: 'file body' },
      });
      expect(slackClient.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'C123',
          filename: 'report.txt',
          content: 'file body',
        }),
      );
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toBe('ok');
    } finally {
      await cleanup();
    }
  });

  it('resolves a user name via the resolve tool with type user', async () => {
    const slackClient = makeMockClient();
    const resolver = {
      resolveChannel: vi.fn().mockResolvedValue(undefined),
      resolveUser: vi.fn().mockResolvedValue('U999'),
    } as unknown as Resolver;
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      const result = await client.callTool({
        name: 'resolve',
        arguments: { name: 'alice', type: 'user' },
      });
      expect(resolver.resolveUser).toHaveBeenCalledWith('alice');
      expect(resolver.resolveChannel).not.toHaveBeenCalled();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
      expect(parsed['id']).toBe('U999');
      expect(parsed['type']).toBe('user');
    } finally {
      await cleanup();
    }
  });

  it('errors on an unknown tool name', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver();
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      await expect(
        client.callTool({ name: 'does_not_exist', arguments: {} }),
      ).rejects.toThrow(/Unknown tool/);
    } finally {
      await cleanup();
    }
  });

  it('constructs and uses the SlackClient when deps are present', async () => {
    const slackClient = makeMockClient();
    const resolver = makeMockResolver({ general: 'C123' });
    const { client, cleanup } = await createTestPair(slackClient, resolver);
    try {
      await client.callTool({
        name: 'post',
        arguments: { channel: 'general', text: 'hi' },
      });
      expect(slackClient.post).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', text: 'hi' }),
      );
    } finally {
      await cleanup();
    }
  });
});

describe('mcp server without a token', () => {
  it('lists all 6 tools on initialize with no slack deps', async () => {
    const { client, cleanup } = await createTestPair(null, null);
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toContain('post_card');
      expect(names).toContain('update_card');
      expect(names).toContain('post');
      expect(names).toContain('react');
      expect(names).toContain('upload');
      expect(names).toContain('resolve');
      expect(names).toHaveLength(6);
    } finally {
      await cleanup();
    }
  });

  it('returns a clean token error when a slack-backed tool is invoked', async () => {
    const { client, cleanup } = await createTestPair(null, null);
    try {
      const result = await client.callTool({
        name: 'post',
        arguments: { channel: 'general', text: 'hi' },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toBe(NO_TOKEN_MESSAGE);
    } finally {
      await cleanup();
    }
  });

  it('returns the token error for resolve too, without throwing', async () => {
    const { client, cleanup } = await createTestPair(null, null);
    try {
      const result = await client.callTool({
        name: 'resolve',
        arguments: { name: 'general', type: 'channel' },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toBe(NO_TOKEN_MESSAGE);
    } finally {
      await cleanup();
    }
  });
});
