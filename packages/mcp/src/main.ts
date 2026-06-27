#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SlackClient, Resolver, resolveTokenFrom } from '@slackwire/core';
import { createMcpServer } from './server.js';

function err(msg: string): never {
  process.stderr.write(`[slackwire-mcp] ${msg}\n`);
  process.exit(1);
}

function resolveToken(): string {
  let token: string | undefined;
  try {
    token = resolveTokenFrom(process.env);
  } catch {
    err(`Cannot read SLACK_TOKEN_FILE: ${process.env['SLACK_TOKEN_FILE']}`);
  }
  if (!token) {
    err('No Slack token configured. Set SLACK_TOKEN, SLACK_TOKEN_BASE64, or SLACK_TOKEN_FILE.');
  }
  return token;
}

function noopCache() {
  return {
    get: async (_teamId: string, _type: string) => null as Record<string, string> | null,
    set: async (_teamId: string, _type: string, _map: Record<string, string>): Promise<void> => {},
  };
}

async function main(): Promise<void> {
  const token = resolveToken();
  const slackClient = new SlackClient(token);

  const teamId = process.env['SLACK_TEAM_ID'] ?? 'T000';
  const cache = noopCache();
  const web = (slackClient as unknown as { web: ConstructorParameters<typeof Resolver>[0] }).web;
  const resolver = new Resolver(
    web,
    cache as unknown as ConstructorParameters<typeof Resolver>[1],
    teamId,
  );

  const server = createMcpServer(slackClient, resolver);
  const transport = new StdioServerTransport();

  process.stderr.write('[slackwire-mcp] starting\n');
  await server.connect(transport);
}

main().catch((e: unknown) => {
  process.stderr.write(`[slackwire-mcp] fatal: ${String(e)}\n`);
  process.exit(1);
});
