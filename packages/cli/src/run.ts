import { parseArgs } from 'node:util';
import {
  SlackClient,
  Resolver,
  resolveTokenFrom,
  render,
  SchemaError,
  StructuralError,
  LimitError,
  SlackApiError,
  NetworkError,
  RateLimitError,
  validateStructural,
  validateLimits,
  deriveFallback,
} from '@slackwire/core';
import type { RenderOptions, TemplateRef } from '@slackwire/core';

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
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
  stdin?: string;
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

function parsePostAt(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
}

function singleLine(text: string): string {
  return text.replace(/\r?\n/g, ' ');
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
    io.stderr(
      'Usage: slackwire <card|post|update|delete|react|upload|search|read|schedule> [options]\n' +
      '\n' +
      'Verbs:\n' +
      '  post      --channel <c> (--template <n@v> | --blocks <json>|-  | --text <t>)\n' +
      '  update    --channel <c> --ts <ts> (--template | --blocks | --text)\n' +
      '  delete    --channel <c> --ts <ts>\n' +
      '  react     --channel <c> --ts <ts> --emoji <name>\n' +
      '  upload    --channel <c> --file <path> [--title <t>] [--comment <c>]\n' +
      '  card      --template <name@ver> --channel <c> [--data <json>] (alias for post --template)\n' +
      '  search    --query <q> [--limit <n>]\n' +
      '  read      --channel <c> [--limit <n>]\n' +
      '  schedule  --channel <c> --at <epoch|ISO> (--template | --blocks | --text)\n',
    );
    return 2;
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      template: { type: 'string' },
      data: { type: 'string' },
      channel: { type: 'string' },
      ts: { type: 'string' },
      blocks: { type: 'string' },
      text: { type: 'string' },
      emoji: { type: 'string' },
      file: { type: 'string' },
      title: { type: 'string' },
      comment: { type: 'string' },
      query: { type: 'string' },
      limit: { type: 'string' },
      at: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'fail-mode': { type: 'string' },
      version: { type: 'string' },
      catalog: { type: 'string' },
      theme: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const failMode = (values['fail-mode'] as string | undefined) ?? 'non-blocking';
  const dryRun = (values['dry-run'] as boolean | undefined) ?? false;

  const processEnv = io.env as Record<string, string | undefined>;
  const attribution = processEnv['SLACK_ATTRIBUTION'] === 'true';
  const realToken = resolveTokenFrom(processEnv) ?? '';
  if (!realToken && !dryRun) {
    io.stderr('No Slack token configured');
    return 2;
  }

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
    const themeToken = (values['theme'] as string | undefined) ?? themeTokenFrom(payload);
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

  type MessageSource =
    | { kind: 'template'; blocks: unknown[]; text: string; attachments: unknown[] }
    | { kind: 'raw'; blocks: JsonValue[]; text: string; attachments: JsonValue[] }
    | { kind: 'text'; text: string }
    | { kind: 'error'; code: number };

  async function resolveMessageSource(): Promise<MessageSource> {
    const templateStr = values['template'] as string | undefined;
    const blocksArg = values['blocks'] as string | undefined;
    const textArg = values['text'] as string | undefined;

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
          return { kind: 'error', code: 2 };
        }
      }
      const templateRef: TemplateRef = {
        catalogPath,
        name: templateName ?? '',
        version: templateVersion,
      };
      const fsAdapter = buildFsAdapter();
      const opts: RenderOptions = {
        fs: fsAdapter,
        attribution,
        partials: loadPartials(catalogPath),
      };
      const themeToken = (values['theme'] as string | undefined) ?? themeTokenFrom(payload);
      if (themeToken !== undefined) opts.themeToken = themeToken;
      try {
        const rendered = render(templateRef, payload, opts);
        return { kind: 'template', blocks: rendered.blocks, text: rendered.text, attachments: rendered.attachments };
      } catch (err) {
        if (err instanceof SchemaError || err instanceof StructuralError || err instanceof LimitError) {
          io.stderr(`Validation error: ${(err as Error).message}`);
          return { kind: 'error', code: 2 };
        }
        if (failMode === 'block') {
          const code = exitCodeForError(err);
          io.stderr(`Error: ${(err as Error).message}`);
          return { kind: 'error', code };
        }
        io.stderr(`Warning: ${(err as Error).message}`);
        return { kind: 'error', code: 0 };
      }
    }

    if (blocksArg !== undefined) {
      let rawJson: string;
      if (blocksArg === '-') {
        rawJson = io.stdin ?? '';
      } else {
        rawJson = blocksArg;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        io.stderr('--blocks must be valid JSON');
        return { kind: 'error', code: 2 };
      }
      let blocks: JsonValue[];
      let attachments: JsonValue[] = [];
      if (Array.isArray(parsed)) {
        blocks = parsed as JsonValue[];
      } else if (typeof parsed === 'object' && parsed !== null && 'blocks' in parsed) {
        const obj = parsed as { blocks?: JsonValue[]; attachments?: JsonValue[] };
        blocks = Array.isArray(obj['blocks']) ? obj['blocks'] : [];
        attachments = Array.isArray(obj['attachments']) ? obj['attachments'] : [];
      } else {
        io.stderr('--blocks must be a JSON array or object with a "blocks" key');
        return { kind: 'error', code: 2 };
      }
      try {
        validateStructural({ blocks: blocks as unknown as object[], attachments: attachments as unknown as object[] });
        validateLimits({ blocks: blocks as unknown as object[], attachments: attachments as unknown as object[] });
      } catch (err) {
        if (err instanceof StructuralError || err instanceof LimitError) {
          io.stderr(`Validation error: ${(err as Error).message}`);
          return { kind: 'error', code: 2 };
        }
        throw err;
      }
      const fallbackText = (values['text'] as string | undefined) ?? deriveFallback(blocks);
      return { kind: 'raw', blocks, text: fallbackText, attachments };
    }

    if (textArg !== undefined) {
      return { kind: 'text', text: textArg };
    }

    return { kind: 'error', code: -1 };
  }

  if (verb === 'post') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for post command');
      return 2;
    }

    const source = await resolveMessageSource();
    if (source.kind === 'error') {
      if (source.code === -1) {
        io.stderr('post requires one of --template, --blocks, or --text');
        return 2;
      }
      return source.code;
    }

    if (dryRun) {
      const dryOut: { blocks?: unknown[]; text: string; attachments?: unknown[] } = { text: source.kind === 'text' ? source.text : source.text };
      if (source.kind !== 'text') {
        dryOut.blocks = source.blocks as unknown[];
        if ((source.attachments as unknown[]).length > 0) dryOut.attachments = source.attachments as unknown[];
      }
      io.stdout(JSON.stringify(dryOut, null, 2));
      return 0;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);

      let postArgs: { channel: string; text: string; blocks?: unknown[]; attachments?: unknown[] };
      if (source.kind === 'text') {
        postArgs = { channel, text: source.text };
      } else {
        postArgs = Object.assign(
          { channel, text: source.text, blocks: source.blocks },
          source.attachments.length > 0 ? { attachments: source.attachments } : {},
        );
      }
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

    const source = await resolveMessageSource();

    if (dryRun) {
      const dryOut: { blocks?: unknown[]; text?: string; attachments?: unknown[] } = {};
      if (source.kind !== 'error') {
        dryOut.text = source.text;
        if (source.kind !== 'text') {
          dryOut.blocks = source.blocks as unknown[];
          if ((source.attachments as unknown[]).length > 0) dryOut.attachments = source.attachments as unknown[];
        }
      }
      io.stdout(JSON.stringify(dryOut, null, 2));
      return 0;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      let updateArgs: { channel: string; ts: string; text?: string; blocks?: unknown[]; attachments?: unknown[] };
      if (source.kind === 'error') {
        updateArgs = { channel: channelArg, ts: tsArg };
      } else if (source.kind === 'text') {
        updateArgs = { channel: channelArg, ts: tsArg, text: source.text };
      } else {
        updateArgs = Object.assign(
          { channel: channelArg, ts: tsArg, text: source.text, blocks: source.blocks },
          source.attachments.length > 0 ? { attachments: source.attachments } : {},
        );
      }
      const result = await client.update(updateArgs);
      const permalink = buildPermalink(result.channel, result.ts);
      io.stdout(`${result.ts}\t${permalink}`);
      return 0;
    });
  }

  if (verb === 'delete') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for delete command');
      return 2;
    }
    const tsArg = values['ts'] as string | undefined;
    if (!tsArg) {
      io.stderr('--ts is required for delete command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);
      await client.delete(channel, tsArg);
      io.stdout(`deleted\t${tsArg}`);
      return 0;
    });
  }

  if (verb === 'react') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for react command');
      return 2;
    }
    const tsArg = values['ts'] as string | undefined;
    if (!tsArg) {
      io.stderr('--ts is required for react command');
      return 2;
    }
    const emojiArg = values['emoji'] as string | undefined;
    if (!emojiArg) {
      io.stderr('--emoji is required for react command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);
      await client.react(channel, tsArg, emojiArg);
      io.stdout(`reacted\t${emojiArg}`);
      return 0;
    });
  }

  if (verb === 'upload') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for upload command');
      return 2;
    }
    const fileArg = values['file'] as string | undefined;
    if (!fileArg) {
      io.stderr('--file is required for upload command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);
      const fileContent = readFileSync(fileArg);
      const uploadArgs: {
        channel: string;
        file: Buffer;
        filename: string;
        title?: string;
        initial_comment?: string;
      } = {
        channel,
        file: fileContent,
        filename: fileArg.split('/').pop() ?? fileArg,
      };
      const titleArg = values['title'] as string | undefined;
      if (titleArg) uploadArgs.title = titleArg;
      const commentArg = values['comment'] as string | undefined;
      if (commentArg) uploadArgs.initial_comment = commentArg;
      await client.uploadV2(uploadArgs);
      io.stdout(`uploaded\t${fileArg}`);
      return 0;
    });
  }

  if (verb === 'search') {
    const queryArg = values['query'] as string | undefined;
    if (!queryArg) {
      io.stderr('--query is required for search command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const searchOptions: { count?: number } = {};
      const limitArg = values['limit'] as string | undefined;
      if (limitArg !== undefined) {
        const count = Number.parseInt(limitArg, 10);
        if (Number.isFinite(count)) searchOptions.count = count;
      }
      const matches = await client.search(queryArg, searchOptions);
      for (const match of matches) {
        io.stdout(`${match.ts}\t${match.channel ?? ''}\t${singleLine(match.text ?? '')}`);
      }
      return 0;
    });
  }

  if (verb === 'read') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for read command');
      return 2;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);
      const histArgs: { channel: string; limit?: number } = { channel };
      const limitArg = values['limit'] as string | undefined;
      if (limitArg !== undefined) {
        const limit = Number.parseInt(limitArg, 10);
        if (Number.isFinite(limit)) histArgs.limit = limit;
      }
      const messages = await client.history(histArgs);
      for (const message of messages) {
        io.stdout(`${message.ts}\t${singleLine(message.text ?? '')}`);
      }
      return 0;
    });
  }

  if (verb === 'schedule') {
    const channelArg = values['channel'] as string | undefined;
    if (!channelArg) {
      io.stderr('--channel is required for schedule command');
      return 2;
    }
    const atArg = values['at'] as string | undefined;
    if (!atArg) {
      io.stderr('--at is required for schedule command');
      return 2;
    }
    const postAt = parsePostAt(atArg);
    if (postAt === undefined) {
      io.stderr('--at must be a Unix epoch (seconds) or an ISO 8601 date');
      return 2;
    }

    const source = await resolveMessageSource();
    if (source.kind === 'error') {
      if (source.code === -1) {
        io.stderr('schedule requires one of --template, --blocks, or --text');
        return 2;
      }
      return source.code;
    }

    if (dryRun) {
      const dryOut: { post_at: number; blocks?: unknown[]; text: string } = {
        post_at: postAt,
        text: source.text,
      };
      if (source.kind !== 'text') {
        dryOut.blocks = source.blocks as unknown[];
      }
      io.stdout(JSON.stringify(dryOut, null, 2));
      return 0;
    }

    return execWithFailMode(async () => {
      const client = new SlackClient(realToken);
      const channel = await resolveChannel(client, channelArg);
      let schedArgs: { channel: string; postAt: number; text?: string; blocks?: unknown[] };
      if (source.kind === 'text') {
        schedArgs = { channel, postAt, text: source.text };
      } else {
        schedArgs = { channel, postAt, text: source.text, blocks: source.blocks as unknown[] };
      }
      const result = await client.schedule(schedArgs);
      io.stdout(`scheduled\t${result.scheduledMessageId}`);
      return 0;
    });
  }

  io.stderr(`Unknown verb: ${verb}`);
  return 2;
}

