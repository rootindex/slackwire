# @slack-cards/core

The render pipeline, Slack client, and template engine for the Slack Card Engine. It loads JSON templates from a catalog, validates and interpolates typed placeholders into Block Kit blocks, enforces Slack's hard limits, and delivers the result via a thin `SlackClient` wrapper around `@slack/web-api`.

## Install

```sh
pnpm add @slack-cards/core
```

## Minimal usage

```ts
import { render, SlackClient, loadConfig } from '@slack-cards/core';
import { readFileSync, readdirSync } from 'node:fs';

const fsAdapter = {
  readFile: (p: string) => readFileSync(p, 'utf8'),
  listDirs: (p: string) =>
    readdirSync(p, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name),
};

const result = render(
  { catalogPath: './templates', name: 'incident', version: '1.0.0' },
  { title: 'DB latency spike', severity: 'P1', accent: '#cc0000',
    incident_id: 'INC-001', service: 'api', runbook_url: 'https://runbook/',
    assigned_to: 'alice' },
  { fs: fsAdapter },
);

const cfg = loadConfig();
const client = new SlackClient(cfg.token);
const { ts, channel } = await client.post({
  channel: 'C12345',
  blocks: result.blocks,
  text: result.text,
});
```

## Public API surface

### `render(templateRef, payload, options): RenderResult`

Loads the template bundle, validates the payload against the schema, interpolates typed placeholders, assembles partials, derives fallback text, and checks all Slack limits.

```ts
interface TemplateRef {
  catalogPath: string;
  name: string;
  version: string;
}

interface RenderOptions {
  fs: FsAdapter;
  dryRun?: boolean;
  partials?: Record<string, object[]>;
  themeToken?: string;
  attribution?: boolean;   // default false
}

interface RenderResult {
  blocks: object[];
  attachments: object[];
  text: string;
}
```

### Placeholder kinds (`PlaceholderKind`)

Declared in `schema.json` per template field. Every skeleton token uses `{{kind:key}}` syntax.

| Kind | Behavior |
|---|---|
| `text_plain` | Plain text, no markup |
| `text_mrkdwn` | Slack mrkdwn, special chars escaped |
| `link_url` | Raw URL string |
| `link_text` | Display text for a link |
| `date` | Accepts `{ epoch, format, fallback }` |
| `user_mention` | Wrapped as `<@id>` |
| `channel_mention` | Wrapped as `<#id>` |
| `code` | Inline code with backtick quoting |
| `code_block` | Triple-backtick code block |
| `color` | Hex color string used for accent/attachment |
| `image_url` | URL passed through unchanged |
| `button` | Button action value |

### `SlackClient`

Thin wrapper around `@slack/web-api`. All SDK errors are translated to typed errors (see below).

```ts
new SlackClient(token)
SlackClient.withProxy(token, proxyUrl)

client.post(args: PostArgs): Promise<PostResult>
client.update(args: UpdateArgs): Promise<PostResult>
client.delete(channel, ts): Promise<void>
client.schedule(args): Promise<{ scheduledMessageId: string }>
client.react(channel, ts, name): Promise<void>
client.uploadV2(args): Promise<void>
client.search(query, options?): Promise<SlackMessage[]>
client.history(args: HistoryArgs): Promise<SlackMessage[]>
```

### `loadConfig(): SlackConfig`

Reads `SLACK_TOKEN` or `SLACK_TOKEN_BASE64` from environment. Sets `attribution: true` only when `SLACK_ATTRIBUTION=true`.

### `Resolver`

Resolves channel/user names to Slack IDs by paginating the Slack API and caching results in a `DiskCache`.

```ts
new Resolver(webClient, diskCache, teamId)
resolver.resolveChannel(name): Promise<string | undefined>
resolver.resolveUser(name): Promise<string | undefined>
```

### `DiskCache`

```ts
new DiskCache(dir: string, ttlSeconds: number)
cache.get(teamId, type): Promise<Record<string,string> | null>
cache.set(teamId, type, map): Promise<void>
```

### `findOrCreate(args): Promise<FindOrCreateResult>`

Idempotent post-or-update. Uses `conversations.history` for bot tokens, `search.messages` for user tokens. Tags every message with `event_type: 'slack_card'` metadata.

### Error classes

| Class | Exit code (CLI) | Meaning |
|---|---|---|
| `SchemaError` | 2 | Payload failed JSON Schema validation |
| `StructuralError` | 2 | Block structure invalid |
| `LimitError` | 2 | Slack hard limit exceeded |
| `SlackApiError` | 3 | Slack platform error |
| `NetworkError` | 4 | HTTP/request-level failure |
| `RateLimitError` | 5 | `429` rate limit; carries `retryAfter` seconds |
| `ConfigError` | - | Missing token at config load time |

## Limits and gotchas

- **50 blocks per message** (Slack API hard limit; enforced by `validateStructural`).
- **3000 characters** max for a `section` text field.
- **150 characters** max for a `header` text field.
- **75 characters** max for a button label.
- **~38 000 characters** soft total payload limit; `validateLimits` throws `LimitError` when the JSON-serialised block array exceeds this.
- **12 000 characters** is Slack's documented markdown field cap; the engine does not enforce this independently but the section/total limits cover it in practice.
- **`attribution` is `false` by default.** Pass `attribution: true` in `RenderOptions` (or set `SLACK_ATTRIBUTION=true`) to append the footer.
- **`DiskCache` TTL** is set by the caller at construction time; there is no default. The CLI's inline noop cache has no TTL and never persists.
- Token values are redacted from all error messages before they are thrown.
- `SLACK_TOKEN_BASE64` is decoded at runtime; the raw value is never logged.
