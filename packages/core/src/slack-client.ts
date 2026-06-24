import { WebClient, ErrorCode } from '@slack/web-api';
import type { FilesUploadV2Arguments } from '@slack/web-api';
import { createProxyAgent } from './proxy-agent.js';
import { SlackApiError, NetworkError, RateLimitError } from './errors.js';

export interface MessageMetadata {
  event_type: string;
  event_payload: Record<string, unknown>;
}

export interface PostArgs {
  channel: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  metadata?: MessageMetadata;
}

export interface UpdateArgs {
  channel: string;
  ts: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  metadata?: MessageMetadata;
}

export interface HistoryArgs {
  channel: string;
  limit?: number;
  oldest?: string;
  latest?: string;
}

export interface SlackMessage {
  ts: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  metadata?: MessageMetadata;
}

export interface PostResult {
  channel: string;
  ts: string;
}

function redactToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join('[REDACTED]');
}

function mapSdkError(err: unknown, token: string): never {
  if (err instanceof Error) {
    const redacted = redactToken(err.message, token);
    const coded = err as { code?: string; retryAfter?: number };

    if (coded.code === ErrorCode.RateLimitedError) {
      throw new RateLimitError(redacted, coded.retryAfter ?? 60);
    }

    if (
      coded.code === ErrorCode.RequestError ||
      coded.code === ErrorCode.HTTPError
    ) {
      throw new NetworkError(redacted);
    }

    if (
      coded.code === ErrorCode.PlatformError ||
      coded.code === ErrorCode.FileUploadInvalidArgumentsError
    ) {
      throw new SlackApiError(redacted, coded.code);
    }

    throw new SlackApiError(redacted, coded.code ?? 'unknown');
  }
  throw new SlackApiError('unknown error', 'unknown');
}

export class SlackClient {
  private readonly token: string;
  private readonly web: WebClient;

  constructor(token: string, webClient?: WebClient) {
    this.token = token;
    this.web = webClient ?? new WebClient(token);
  }

  static withProxy(token: string, proxyUrl: string): SlackClient {
    const agent = createProxyAgent(proxyUrl);
    const web = new WebClient(token, { agent });
    return new SlackClient(token, web);
  }

  async post(args: PostArgs): Promise<PostResult> {
    try {
      const postArgs = Object.assign(
        { channel: args.channel, text: args.text ?? '' },
        args.blocks !== undefined ? { blocks: args.blocks } : {},
        args.attachments !== undefined ? { attachments: args.attachments } : {},
        args.metadata !== undefined ? { metadata: args.metadata } : {},
      ) as Parameters<typeof this.web.chat.postMessage>[0];
      const res = await this.web.chat.postMessage(postArgs);
      return {
        channel: res.channel as string,
        ts: res.ts as string,
      };
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async update(args: UpdateArgs): Promise<PostResult> {
    try {
      const updateArgs = Object.assign(
        { channel: args.channel, ts: args.ts, text: args.text ?? '' },
        args.blocks !== undefined ? { blocks: args.blocks } : {},
        args.attachments !== undefined ? { attachments: args.attachments } : {},
        args.metadata !== undefined ? { metadata: args.metadata } : {},
      ) as Parameters<typeof this.web.chat.update>[0];
      const res = await this.web.chat.update(updateArgs);
      return {
        channel: res.channel as string,
        ts: res.ts as string,
      };
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async delete(channel: string, ts: string): Promise<void> {
    try {
      await this.web.chat.delete({ channel, ts });
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async schedule(args: {
    channel: string;
    postAt: number;
    text?: string;
    blocks?: unknown[];
    metadata?: MessageMetadata;
  }): Promise<{ scheduledMessageId: string }> {
    try {
      const schedArgs = Object.assign(
        { channel: args.channel, post_at: args.postAt, text: args.text ?? '' },
        args.blocks !== undefined ? { blocks: args.blocks } : {},
        args.metadata !== undefined ? { metadata: args.metadata } : {},
      ) as Parameters<typeof this.web.chat.scheduleMessage>[0];
      const res = await this.web.chat.scheduleMessage(schedArgs);
      return { scheduledMessageId: res.scheduled_message_id as string };
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async react(channel: string, ts: string, name: string): Promise<void> {
    try {
      await this.web.reactions.add({ channel, timestamp: ts, name });
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async uploadV2(args: FilesUploadV2Arguments): Promise<void> {
    try {
      await this.web.filesUploadV2(args);
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async search(query: string, options?: { count?: number; page?: number }): Promise<SlackMessage[]> {
    try {
      const searchArgs: { query: string; count?: number; page?: number } = { query };
      if (options?.count !== undefined) searchArgs.count = options.count;
      if (options?.page !== undefined) searchArgs.page = options.page;
      const res = await this.web.search.messages(searchArgs);
      const matches = (res.messages as { matches?: unknown[] } | undefined)?.matches ?? [];
      return matches.map((m) => {
        const msg = m as { ts?: string; text?: string; metadata?: MessageMetadata };
        const result: SlackMessage = { ts: msg.ts ?? '' };
        if (msg.text !== undefined) result.text = msg.text;
        if (msg.metadata !== undefined) result.metadata = msg.metadata;
        return result;
      });
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }

  async history(args: HistoryArgs): Promise<SlackMessage[]> {
    try {
      const histArgs: {
        channel: string;
        include_all_metadata: true;
        limit?: number;
        oldest?: string;
        latest?: string;
      } = { channel: args.channel, include_all_metadata: true };
      if (args.limit !== undefined) histArgs.limit = args.limit;
      if (args.oldest !== undefined) histArgs.oldest = args.oldest;
      if (args.latest !== undefined) histArgs.latest = args.latest;
      const res = await this.web.conversations.history(histArgs);
      const messages = (res.messages as unknown[]) ?? [];
      return messages.map((m) => {
        const msg = m as { ts?: string; text?: string; blocks?: unknown[]; attachments?: unknown[]; metadata?: MessageMetadata };
        const result: SlackMessage = { ts: msg.ts ?? '' };
        if (msg.text !== undefined) result.text = msg.text;
        if (msg.blocks !== undefined) result.blocks = msg.blocks;
        if (msg.attachments !== undefined) result.attachments = msg.attachments;
        if (msg.metadata !== undefined) result.metadata = msg.metadata;
        return result;
      });
    } catch (err) {
      mapSdkError(err, this.token);
    }
  }
}
