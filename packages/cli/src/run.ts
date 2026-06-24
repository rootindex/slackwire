import { parseArgs } from 'node:util';
import {
  SlackClient,
  Resolver,
  render,
  SchemaError,
  StructuralError,
  LimitError,
  SlackApiError,
  NetworkError,
  RateLimitError,
} from '@slack-cards/core';
import type { RenderOptions, TemplateRef } from '@slack-cards/core';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RunEnv {
  SLACK_TOKEN?: string;
  SLACK_TOKEN_BASE64?: string;
  SLACK_TOKEN_FILE?: string;
  SLACK_ATTRIBUTION?: string;
  SLACK_TEAM_ID?: string;
  SLACK_CATALOG?: string;
}

export interface RunIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: RunEnv;
}

function buildFsAdapter() {
  return {
    readFile(path: string): string {
      return readFileSync(path, 'utf8');
    },
    listDirs(path: string): string[] {
      if (!existsSync(path)) return [];
      return readdirSync(path, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    },
  };
}

function loadPartials(catalogPath: string): Record<string, object[]> {
  const dir = join(catalogPath, 'partials');
  if (!existsSync(dir)) return {};
  const out: Record<string, object[]> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      out[file.slice(0, -5)] = JSON.parse(readFileSync(join(dir, file), 'utf8')) as object[];
    } catch {
      // skip malformed partial
    }
  }
  return out;
}

function themeTokenFrom(payload: Record<string, unknown>): string | undefined {
  return typeof payload['accent'] === 'string' ? payload['accent'] : undefined;
}

function exitCodeForError(err: unknown): number {
  if (err instanceof SchemaError || err instanceof StructuralError || err instanceof LimitError) {
    return 2;
  }
  if (err instanceof RateLimitError) {
    return 5;
  }
  if (err instanceof NetworkError) {
    return 4;
  }
  if (err instanceof SlackApiError) {
    return 3;
  }
  return 1;
}

function buildPermalink(channel: string, ts: string): string {
  const tsClean = ts.replace('.', '');
  return `https://slack.com/archives/${channel}/p${tsClean}`;
}

function looksLikeChannelId(channel: string): boolean {
  return /^[CGD][A-Z0-9]+$/.test(channel);
}

function noopCache() {
  return {
    get: async (_teamId: string, _type: string) => null as Record<string, string> | null,
    set: async (_teamId: string, _type: string, _map: Record<string, string>) => { },
  };
}

type MinimalWebClient = {
  conversations: {
    list(args: { limit: number; cursor?: string }): Promise<{
      ok: boolean;
      channels?: Array<{ id?: string; name?: string }>;
      response_metadata?: { next_cursor?: string };
    }>;
  };
  users: {
    list(args: { limit: number; cursor?: string }): Promise<{
      ok: boolean;
      members?: Array<{ id?: string; name?: string }>;
      response_metadata?: { next_cursor?: string };
    }>;
  };
};

export async function run(argv: string[], io: RunIO): Promise<number> {
  const verb = argv[0];

  if (!verb) {
    io.stderr('Usage: slack-cards <card|post|update|react|upload|schedule> [options]');
    return 2;
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      template: { type: 'string' },
      data: { type: 'string' },
      channel: { type: 'string' },
      ts: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'fail-mode': { type: 'string' },
      version: { type: 'string' },
      catalog: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const failMode = (values['fail-mode'] as string | undefined) ?? 'non-blocking';
  const dryRun = (values['dry-run'] as boolean | undefined) ?? false;

  const processEnv = io.env as Record<string, string | undefined>;
  const attribution = processEnv['SLACK_ATTRIBUTION'] === 'true';
  const tokenFile = processEnv['SLACK_TOKEN_FILE'];
  const fileToken = tokenFile ? readFileSync(tokenFile, 'utf8').trim() : undefined;
  const rawToken = processEnv['SLACK_TOKEN'] ?? processEnv['SLACK_TOKEN_BASE64'] ?? fileToken;
  if (!rawToken && !dryRun) {
    io.stderr('No Slack token configured');
    return 2;
  }

  const realToken = processEnv['SLACK_TOKEN_BASE64']
    ? Buffer.from(processEnv['SLACK_TOKEN_BASE64'], 'base64').toString('utf8')
    : (processEnv['SLACK_TOKEN'] ?? fileToken ?? '');

  async function execWithFailMode(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SchemaError || err instanceof StructuralError || err instanceof LimitError) {
        io.stderr(`Validation error: ${(err as Error).message}`);
        return 2;
      }
      if (failMode === 'block') {
        const code = exitCodeForError(err);
        io.stderr(`Error: ${(err as Error).message}`);
        return code;
      }
      io.stderr(`Warning: ${(err as Error).message}`);
      return 0;
    }
  }

  async function resolveChannel(client: SlackClient, channelArg: string): Promise<string> {
    if (looksLikeChannelId(channelArg)) return channelArg;

    const teamId = processEnv['SLACK_TEAM_ID'] ?? 'T000';
    const cache = noopCache();

    const webClient = (client as unknown as { web: MinimalWebClient }).web;
    const resolver = new Resolver(
      webClient,
      cache as unknown as ConstructorParameters<typeof Resolver>[1],
      teamId,
    );

    const resolved = await resolver.resolveChannel(channelArg);
    return resolved ?? channelArg;
  }

  if (verb === 'card') {
    const templateStr = values['template'] as string | undefined;
    if (!templateStr) {
      io.stderr('--template is required for card command');
      return 2;
    }

    const [templateName, templateVersion = '1.0.0'] = templateStr.split('@');
    const catalogPath = (values['catalog'] as string | undefined) ??
      processEnv['SLACK_CATALOG'] ??
      join(process.cwd(), 'templates');

    const dataStr = values['data'] as string | undefined;
    let payload: Record<string, unknown> = {};
    if (dataStr) {
      try {
        payload = JSON.parse(dataStr) as Record<string, unknown>;
      } catch {
        io.stderr('--data must be valid JSON');
        return 2;
      }
    }

    const templateRef: TemplateRef = {
      catalogPath,
      name: templateName ?? '',
      version: templateVersion,
    };

    const fsAdapter = buildFsAdapter();
    const renderOptions: RenderOptions = {
      fs: fsAdapter,
      dryRun,
      attribution,
      partials: loadPartials(catalogPath),
    };
    const themeToken = themeTokenFrom(payload);
    if (themeToken !== undefined) renderOptions.themeToken = themeToken;

    let rendered;
    try {
      rendered = render(templateRef, payload, renderOptions);
    } catch (err) {
      if (err instanceof SchemaError || err instanceof StructuralError || err instanceof LimitError) {
        io.stderr(`Validation error: ${(err as Error).message}`);
        return 2;
      }
      if (failMode === 'block') {
        const code = exitCodeForError(err);
        io.stderr(`Error: ${(err as Error).message}`);
        return code;
      }
      io.stderr(`Warning: ${(err as Error).message}`);
      return 0;
    }

    if (dryRun) {
      const dryOut: { blocks: object[]; text: string; attachments?: object[] } = {
        blocks: rendered.blocks,
        text: rendered.text,
      };
      if (rendered.attachments.length > 0) dryOut.attachments = rendered.attachments;
      io.stdout(JSON.stringify(dryOut, null, 2));
      return 0;
    }

    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for card command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);

      const postArgs = Object.assign(
        { channel, text: rendered.text, blocks: rendered.blocks },
        rendered.attachments.length > 0 ? { attachments: rendered.attachments } : {},
      );
      const result = await client.post(postArgs);

      const permalink = buildPermalink(result.channel, result.ts);
      io.stdout(`${result.ts}\t${permalink}`);
      return 0;
    });
  }

  if (verb === 'update') {
    const tsArg = values['ts'] as string | undefined;
    if (!tsArg) {
      io.stderr('--ts is required for update command');
      return 2;
    }
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for update command');
      return 2;
    }

    const templateStr = values['template'] as string | undefined;
    let blocks: unknown[] | undefined;
    let text: string | undefined;
    let updateAttachments: object[] = [];

    if (templateStr) {
      const [templateName, templateVersion = '1.0.0'] = templateStr.split('@');
      const catalogPath = (values['catalog'] as string | undefined) ??
        processEnv['SLACK_CATALOG'] ??
        join(process.cwd(), 'templates');
      const dataStr = values['data'] as string | undefined;
      let payload: Record<string, unknown> = {};
      if (dataStr) {
        try {
          payload = JSON.parse(dataStr) as Record<string, unknown>;
        } catch {
          io.stderr('--data must be valid JSON');
          return 2;
        }
      }
      const templateRef: TemplateRef = {
        catalogPath,
        name: templateName ?? '',
        version: templateVersion,
      };
      const fsAdapter = buildFsAdapter();
      const updateRenderOptions: RenderOptions = {
        fs: fsAdapter,
        attribution,
        partials: loadPartials(catalogPath),
      };
      const updateThemeToken = themeTokenFrom(payload);
      if (updateThemeToken !== undefined) updateRenderOptions.themeToken = updateThemeToken;
      try {
        const rendered = render(templateRef, payload, updateRenderOptions);
        blocks = rendered.blocks;
        text = rendered.text;
        updateAttachments = rendered.attachments;
      } catch (err) {
        if (err instanceof SchemaError || err instanceof StructuralError || err instanceof LimitError) {
          io.stderr(`Validation error: ${(err as Error).message}`);
          return 2;
        }
        if (failMode === 'block') {
          const code = exitCodeForError(err);
          io.stderr(`Error: ${(err as Error).message}`);
          return code;
        }
        io.stderr(`Warning: ${(err as Error).message}`);
        return 0;
      }
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const updateArgs = Object.assign(
        { channel: channelArg, ts: tsArg },
        text !== undefined ? { text } : {},
        blocks !== undefined ? { blocks } : {},
        updateAttachments.length > 0 ? { attachments: updateAttachments } : {},
      );
      const result = await client.update(updateArgs);
      const permalink = buildPermalink(result.channel, result.ts);
      io.stdout(`${result.ts}\t${permalink}`);
      return 0;
    });
  }

  io.stderr(`Unknown verb: ${verb}`);
  return 2;
}

