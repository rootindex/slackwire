import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SlackClient, Resolver } from '@slackwire/core';
import { createMcpServer } from './server.js';

function makeFakeSlackClient(): SlackClient {
  return {
    post: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    schedule: vi.fn(),
    react: vi.fn(),
    uploadV2: vi.fn(),
    search: vi.fn(),
    history: vi.fn(),
  } as unknown as SlackClient;
}

function makeFakeResolver(): Resolver {
  return {
    resolveChannel: vi.fn().mockResolvedValue(undefined),
    resolveUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as Resolver;
}

describe('mcp main entry', () => {
  it('starts the stdio server and responds to tools/list with the expected tools', async () => {
    const slackClient = makeFakeSlackClient();
    const resolver = makeFakeResolver();

    const server = createMcpServer(slackClient, resolver);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-main', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

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
      await client.close();
      await server.close();
    }
  });
});
