# @slackwire/core

The engine behind [slackwire](../cli/README.md): the render pipeline, the typed template engine, and the Slack client. It loads JSON templates from a catalog, validates a payload against the template schema, interpolates typed placeholders into Block Kit with per-kind escaping, enforces Slack's hard limits, and delivers the result through a thin `SlackClient` wrapper over `@slack/web-api`. Pure render functions do no I/O; Slack calls, the name resolver, and config all live in clearly separated modules.

Version 0.1.0. Requires Node.js 20 or newer.

## Install

```sh
pnpm add @slackwire/core
```

## Minimal usage

Render a template, then post the result.

```ts
import { render, SlackClient, loadConfig } from '@slackwire/core';
import { readFileSync, readdirSync } from 'node:fs';

const fsAdapter = {
  readFile: (p: string) => readFileSync(p, 'utf8'),
  listDirs: (p: string) =>
    readdirSync(p, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name),
};

// every key in the template's schema.json is required (see "Limits and gotchas")
const result = render(
  { catalogPath: './templates', name: 'ci-cd', version: '1.0.0' },
  {
    title: 'CI passed: healthcart-v2 #2451',
    ref: 'feature/checkout-fix',
    short_sha: 'a1b9f2c',
    description: 'Fix Stitch amount overflow',
    author: 'Naledi',
    icon_url: 'https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS',
    icon_alt: 'passed',
    steps_text: 'Install -> Lint -> Test -> Build -> Deploy',
    progress_bar: '5 of 5 - deployed to staging',
    runner: 'ci-3',
    test_count: '142',
    coverage: '84.2%',
    finished_at: { epoch: 1750000000, format: '{time}', fallback: 'now' },
    primary_label: 'Open staging',
    primary_url: 'https://staging.example.com/healthcart-v2',
    logs_url: 'https://ci.example.com/healthcart-v2/2451/logs',
  },
  { fs: fsAdapter },
);

const cfg = loadConfig();                 // reads SLACK_TOKEN / _BASE64 / _FILE
const client = new SlackClient(cfg.token);
const { ts, channel } = await client.post({
  channel: 'C0XXXXXXXXX',
  blocks: result.blocks,
  text: result.text,
});
```

You can also skip templates and post raw blocks directly with `client.post({ channel, blocks, text })`.

## Public API surface

Everything below is re-exported from the package root (`packages/core/src/index.ts`).

### `render(templateRef, payload, options): RenderResult`

Loads the template bundle, validates the payload against the schema, interpolates typed placeholders, assembles partials, derives fallback text, and checks Slack limits.

```ts
interface TemplateRef { catalogPath: string; name: string; version: string; }

interface RenderOptions {
  fs: FsAdapter;                          // { readFile, listDirs }
  dryRun?: boolean;
  partials?: Record<string, object[]>;
  themeToken?: string;
  attribution?: boolean;                  // default false
}

interface RenderResult { blocks: object[]; attachments: object[]; text: string; }
```

### Placeholder kinds (`PlaceholderKind`)

Declared per field in `schema.json`. Skeleton tokens use `{{kind:key}}`. Each kind is escaped for its position, which is why `< > &` and values like `Name <email>` render safely.

| Kind | Behavior |
|---|---|
| `text_plain` | Plain text. |
| `text_mrkdwn` | Slack mrkdwn, special characters escaped. |
| `link_url` | URL for a link. |
| `link_text` | Display text for a link, `\|` and `>` escaped. |
| `date` | Object `{ epoch, format, fallback }`, rendered to a `<!date^...>` token. |
| `user_mention` | Wrapped as `<@id>`. |
| `channel_mention` | Wrapped as `<#id>`. |
| `code` | Inline code. |
| `code_block` | Triple-backtick code block, passed through literally. |
| `color` | Hex color used for the accent attachment. |
| `image_url` | Image URL. |
| `button` | Button value. |

### `SlackClient`

Thin wrapper around `@slack/web-api`. Every SDK error is mapped to a typed error (see below), and the token is redacted from error messages.

```ts
new SlackClient(token)
SlackClient.withProxy(token, proxyUrl)

client.post(args: PostArgs): Promise<PostResult>           // { channel, ts }
client.update(args: UpdateArgs): Promise<PostResult>
client.delete(channel, ts): Promise<void>
client.schedule(args): Promise<{ scheduledMessageId: string }>
client.react(channel, ts, name): Promise<void>
client.uploadV2(args): Promise<void>                       // @slack/web-api FilesUploadV2Arguments
client.search(query, options?): Promise<SlackMessage[]>
client.history(args: HistoryArgs): Promise<SlackMessage[]> // surfaces blocks + attachments + metadata
```

`post` and `update` accept optional `metadata` (`{ event_type, event_payload }`), which is how idempotent re-finds tag messages.

### `loadConfig(): SlackConfig`

Resolves the token in order `SLACK_TOKEN` -> `SLACK_TOKEN_BASE64` (base64-decoded) -> `SLACK_TOKEN_FILE` (trimmed file contents), throwing `ConfigError` if none resolve. Reports `tokenType` (`'user'` for `xoxp-`, otherwise `'bot'`) and `attribution` (`true` only when `SLACK_ATTRIBUTION=true`).

### `Resolver`

Resolves channel and user names to Slack IDs by paginating the API and caching the map.

```ts
new Resolver(client, cache, teamId)
resolver.resolveChannel(name): Promise<string | undefined>
resolver.resolveUser(name): Promise<string | undefined>
```

### `findOrCreate(args): Promise<FindOrCreateResult>`

Idempotent post-or-update for CI. Re-finds an existing card by a dedupe key stored in Slack message metadata (`conversations.history` for bot tokens, `search.messages` for user tokens), then updates it instead of posting a duplicate.

### Validation and fallback helpers

```ts
validateStructural(output): void   // block structure; image alt_text; mrkdwn token balance
validateLimits(output): void       // 50 blocks, section 3000, header 150, button 75, ~38000 soft total
deriveFallback(blocks, attachments?): string
escape(value, kind): string        // per-kind escaping primitive
```

### Parity harness

`normalize`, `parityDiff`, and `discoverParityCases` power the byte-parity eval suite. See [docs/parity-evals.md](../../docs/parity-evals.md).

### Error classes

| Class | CLI exit code | Meaning |
|---|---|---|
| `SchemaError` | 2 | Payload failed JSON Schema validation. |
| `StructuralError` | 2 | Block structure invalid (includes an unknown `$use` partial). |
| `LimitError` | 2 | Slack hard limit exceeded. |
| `SlackApiError` | 3 | Slack platform error. |
| `NetworkError` | 4 | HTTP / request-level failure. |
| `RateLimitError` | 5 | Rate limited; carries `retryAfter` seconds. |
| `ConfigError` | (no CLI mapping) | Missing token at config load time. |

## Limits and gotchas

- 50 blocks per message; section text 3000 chars; header 150; button label 75; image blocks require `alt_text`. A roughly 38000-char soft total payload limit is checked against the serialized block array. Violations throw `LimitError`.
- `validateStructural` walks only top-level `blocks` and shallow-walks attachments. It does not validate `attachments[].blocks`, so house-style colored cards (whose block tree lives in the attachment) are not length- or `alt_text`-checked by the engine. Respect Slack limits manually for those.
- The template JSON Schema marks every key required; there is no optional-field support yet.
- `attribution` is `false` by default. Pass `attribution: true` (or set `SLACK_ATTRIBUTION=true`) to render the accent attachment, which Slack may footer with "Added by &lt;app&gt;".
- Tokens are redacted from all error messages; `SLACK_TOKEN_BASE64` is decoded at runtime and never logged.
