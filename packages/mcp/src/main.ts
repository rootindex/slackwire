#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SlackClient, Resolver, resolveTokenFrom } from '@slackwire/core';
import { createMcpServer } from './server.js';

function resolveToken(): string | undefined {
  try {
    return resolveTokenFrom(process.env);
  } catch {
    process.stderr.write(
      `[slackwire-mcp] Cannot read SLACK_TOKEN_FILE: ${process.env['SLACK_TOKEN_FILE']}\n`,
    );
    return undefined;
  }
}

function noopCache() {
  return {
    get: async (_teamId: string, _type: string) => null as Record<string, string> | null,
    set: async (_teamId: string, _type: string, _map: Record<string, string>): Promise<void> => {},
  };
}

function buildSlackDeps(token: string): { slackClient: SlackClient; resolver: Resolver } {
  const slackClient = new SlackClient(token);

  const teamId = process.env['SLACK_TEAM_ID'] ?? 'T000';
  const cache = noopCache();
  const web = (slackClient as unknown as { web: ConstructorParameters<typeof Resolver>[0] }).web;
  const resolver = new Resolver(
    web,
    cache as unknown as ConstructorParameters<typeof Resolver>[1],
    teamId,
  );

  return { slackClient, resolver };
}

async function main(): Promise<void> {
  const token = resolveToken();

  let slackClient: SlackClient | null = null;
  let resolver: Resolver | null = null;
  if (token) {
    ({ slackClient, resolver } = buildSlackDeps(token));
  } else {
    process.stderr.write(
      '[slackwire-mcp] no Slack token configured; tools/list is available but tool calls require a token\n',
    );
  }

  const server = createMcpServer(slackClient, resolver);
  const transport = new StdioServerTransport();

  process.stderr.write('[slackwire-mcp] starting\n');
  await server.connect(transport);
}

main().catch((e: unknown) => {
  process.stderr.write(`[slackwire-mcp] fatal: ${String(e)}\n`);
  process.exit(1);
});
