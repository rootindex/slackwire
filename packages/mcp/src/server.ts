import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { validateStructural, validateLimits, StructuralError, LimitError } from '@slackwire/core';
import type { SlackClient, Resolver } from '@slackwire/core';

export const NO_TOKEN_MESSAGE =
  'No Slack token configured. Set SLACK_TOKEN, SLACK_TOKEN_BASE64, or SLACK_TOKEN_FILE.';

const log = (msg: string): void => {
  process.stderr.write(`[slackwire-mcp] ${msg}\n`);
};

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function parseBlocks(raw: string): { blocks: unknown[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Invalid blocks: must be a JSON-encoded array' };
  }
  if (!Array.isArray(parsed)) {
    return { error: 'Invalid blocks: must be a JSON array' };
  }
  try {
    validateStructural({ blocks: parsed as object[], attachments: [] });
    validateLimits({ blocks: parsed as object[], attachments: [] });
  } catch (err) {
    if (err instanceof StructuralError || err instanceof LimitError) {
      return { error: `Validation error: ${err.message}` };
    }
    throw err;
  }
  return { blocks: parsed as unknown[] };
}

const TOOLS = [
  {
    name: 'post_card',
    description: 'Post a Slack card (blocks) to a channel',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        blocks: { type: 'string', description: 'JSON-encoded blocks array' },
        text: { type: 'string', description: 'Fallback text' },
      },
      required: ['channel', 'blocks'],
    },
  },
  {
    name: 'update_card',
    description: 'Update (morph) an existing Slack card by ts',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        ts: { type: 'string', description: 'Message timestamp' },
        blocks: { type: 'string', description: 'JSON-encoded blocks array' },
        text: { type: 'string', description: 'Fallback text' },
      },
      required: ['channel', 'ts', 'blocks'],
    },
  },
  {
    name: 'post',
    description: 'Post a plain text message to a Slack channel',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'react',
    description: 'Add a reaction emoji to a Slack message',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        ts: { type: 'string', description: 'Message timestamp' },
        name: { type: 'string', description: 'Emoji name (without colons)' },
      },
      required: ['channel', 'ts', 'name'],
    },
  },
  {
    name: 'upload',
    description: 'Upload a file to a Slack channel',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        filename: { type: 'string', description: 'File name' },
        content: { type: 'string', description: 'File content (text)' },
      },
      required: ['channel', 'filename', 'content'],
    },
  },
  {
    name: 'resolve',
    description: 'Resolve a channel or user name to a Slack ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name to resolve' },
        type: { type: 'string', description: 'Either "channel" or "user"' },
      },
      required: ['name', 'type'],
    },
  },
];

export interface McpServerHandle {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

export function createMcpServer(
  slackClient: SlackClient | null,
  resolver: Resolver | null,
): McpServerHandle {
  const server = new Server(
    { name: 'slackwire-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  log('registering tools');

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('tools/list');
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, string>;
    log(`tools/call ${name}`);

    if (!slackClient || !resolver) {
      return toolError(NO_TOKEN_MESSAGE);
    }

    if (name === 'post_card') {
      const channel = (await resolver.resolveChannel(a['channel']!)) ?? a['channel']!;
      const parsed = parseBlocks(a['blocks']!);
      if ('error' in parsed) return toolError(parsed.error);
      const result = await slackClient.post({
        channel,
        blocks: parsed.blocks,
        ...(a['text'] !== undefined ? { text: a['text'] } : {}),
      });
      const permalink = `https://slack.com/archives/${result.channel}/p${result.ts.replace('.', '')}`;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ts: result.ts, channel: result.channel, permalink }),
          },
        ],
      };
    }

    if (name === 'update_card') {
      const channel = (await resolver.resolveChannel(a['channel']!)) ?? a['channel']!;
      const parsed = parseBlocks(a['blocks']!);
      if ('error' in parsed) return toolError(parsed.error);
      const result = await slackClient.update({
        channel,
        ts: a['ts']!,
        blocks: parsed.blocks,
        ...(a['text'] !== undefined ? { text: a['text'] } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ts: result.ts, channel: result.channel }),
          },
        ],
      };
    }

    if (name === 'post') {
      const channel = (await resolver.resolveChannel(a['channel']!)) ?? a['channel']!;
      const result = await slackClient.post({ channel, text: a['text']! });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ts: result.ts, channel: result.channel }),
          },
        ],
      };
    }

    if (name === 'react') {
      const channel = (await resolver.resolveChannel(a['channel']!)) ?? a['channel']!;
      await slackClient.react(channel, a['ts']!, a['name']!);
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    }

    if (name === 'upload') {
      const channel = (await resolver.resolveChannel(a['channel']!)) ?? a['channel']!;
      await slackClient.uploadV2({
        channel_id: channel,
        filename: a['filename']!,
        content: a['content']!,
      });
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    }

    if (name === 'resolve') {
      const type = a['type']!;
      const resolvedName = a['name']!;
      const id =
        type === 'channel'
          ? await resolver.resolveChannel(resolvedName)
          : await resolver.resolveUser(resolvedName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ name: resolvedName, type, id: id ?? null }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}
