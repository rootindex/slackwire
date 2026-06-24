import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SlackClient, Resolver } from '@slack-cards/core';
import { createMcpServer } from './server.js';

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
  slackClient: SlackClient,
  resolver: Resolver,
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

      const hasStderrLog = stderrCalls.some((s) => s.includes('slack-cards-mcp'));
      expect(hasStderrLog).toBe(true);

      const hasStdoutLog = stdoutCalls.some(
        (s) => s.includes('slack-cards-mcp') && !s.startsWith('{'),
      );
      expect(hasStdoutLog).toBe(false);
    } finally {
      await cleanup();
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
