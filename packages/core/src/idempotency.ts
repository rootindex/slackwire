import type { SlackClient } from './slack-client.js';
import type { TokenType } from './config.js';

export interface FindOrCreateArgs {
  client: SlackClient;
  tokenType: TokenType;
  channel: string;
  dedupeKey: string;
  templateRef: string;
  blocks?: unknown[];
  text?: string;
  historyLimit?: number;
}

export interface FindOrCreateResult {
  channel: string;
  ts: string;
  found: boolean;
  pinnedTemplateRef: string;
}

const EVENT_TYPE = 'slack_card';

async function findViaHistory(
  client: SlackClient,
  channel: string,
  dedupeKey: string,
  limit: number,
) {
  const messages = await client.history({ channel, limit });
  return messages.find(
    (m) =>
      m.metadata?.event_type === EVENT_TYPE &&
      (m.metadata.event_payload as Record<string, unknown>)['dedupe_key'] === dedupeKey,
  );
}

async function findViaSearch(client: SlackClient, dedupeKey: string) {
  const messages = await client.search(dedupeKey);
  return messages.find(
    (m) =>
      m.metadata?.event_type === EVENT_TYPE &&
      (m.metadata.event_payload as Record<string, unknown>)['dedupe_key'] === dedupeKey,
  );
}

export async function findOrCreate(args: FindOrCreateArgs): Promise<FindOrCreateResult> {
  const { client, tokenType, channel, dedupeKey, templateRef, blocks, text, historyLimit = 200 } = args;

  const existing =
    tokenType === 'user'
      ? await findViaSearch(client, dedupeKey)
      : await findViaHistory(client, channel, dedupeKey, historyLimit);

  if (existing) {
    const payload = existing.metadata!.event_payload as Record<string, unknown>;
    const pinnedTemplateRef = (payload['template_ref'] as string | undefined) ?? templateRef;

    const metadata = {
      event_type: EVENT_TYPE,
      event_payload: { dedupe_key: dedupeKey, template_ref: pinnedTemplateRef },
    };

    const updateArgs = Object.assign(
      { channel, ts: existing.ts, metadata },
      text !== undefined ? { text } : {},
      blocks !== undefined ? { blocks } : {},
    );
    await client.update(updateArgs);

    return { channel, ts: existing.ts, found: true, pinnedTemplateRef };
  }

  const metadata = {
    event_type: EVENT_TYPE,
    event_payload: { dedupe_key: dedupeKey, template_ref: templateRef },
  };

  const postArgs = Object.assign(
    { channel, metadata },
    text !== undefined ? { text } : {},
    blocks !== undefined ? { blocks } : {},
  );
  const result = await client.post(postArgs);

  return { channel: result.channel, ts: result.ts, found: false, pinnedTemplateRef: templateRef };
}
