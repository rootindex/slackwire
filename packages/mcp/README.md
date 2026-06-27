# @slackwire/mcp

A Model Context Protocol (MCP) server over [`@slackwire/core`](../core/README.md). It exposes the same Slack operations the CLI uses (post, morph, react, upload, resolve names) as MCP tools, so an MCP-capable assistant can drive Slack through tool calls instead of a shell. The package is a library: it provides `createMcpServer(slackClient, resolver)`, and you supply the transport (typically stdio).

Version 0.1.0. Requires Node.js 20 or newer.

## Install

```sh
pnpm add @slackwire/mcp
```

## Running it

Construct a `SlackClient` and `Resolver` from `@slackwire/core`, create the server, and connect a transport. The server runs until the transport closes. Diagnostic logs go to stderr, prefixed `[slackwire-mcp]`.

```ts
import { createMcpServer } from '@slackwire/mcp';
import { SlackClient, Resolver } from '@slackwire/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const client = new SlackClient(process.env.SLACK_TOKEN!);
const resolver = new Resolver(/* web client */, /* cache */, process.env.SLACK_TEAM_ID ?? 'T000');

const server = createMcpServer(client, resolver);
await server.connect(new StdioServerTransport());
```

Wire it into an MCP host that launches your stdio entry point:

```json
{
  "mcpServers": {
    "slackwire": {
      "command": "node",
      "args": ["path/to/your-mcp-entry.js"],
      "env": { "SLACK_TOKEN": "xoxb-...", "SLACK_TEAM_ID": "T0XXXXXXXXX" }
    }
  }
}
```

## Public API surface

### `createMcpServer(slackClient, resolver): McpServerHandle`

Creates and configures the server. It does not listen until `connect()` is called.

```ts
interface McpServerHandle {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}
```

## Tools exposed

| Tool | Required inputs | Optional inputs | Returns |
|---|---|---|---|
| `post_card` | `channel`, `blocks` (JSON string) | `text` | `{ ts, channel, permalink }` |
| `update_card` | `channel`, `ts`, `blocks` (JSON string) | `text` | `{ ts, channel }` |
| `post` | `channel`, `text` | (none) | `{ ts, channel }` |
| `react` | `channel`, `ts`, `name` | (none) | `"ok"` |
| `upload` | `channel`, `filename`, `content` | (none) | `"ok"` |
| `resolve` | `name`, `type` (`"channel"` or `"user"`) | (none) | `{ name, type, id }` |

Every `channel` input accepts a channel name or a Slack ID; names are resolved to an ID via the injected `Resolver` before each call. `blocks` is passed as a JSON-encoded string so the tool schema stays `type: string` and avoids nesting issues with arbitrary block shapes. `post_card` returns a permalink of the form `https://slack.com/archives/<channel>/p<ts>`. `react` expects the emoji `name` without colons. `resolve` returns `id: null` when the name cannot be resolved.

## Limits and gotchas

- `blocks` must be a JSON-encoded array for `post_card` and `update_card`. A non-JSON or non-array value is rejected with an `isError` tool response (`Invalid blocks: ...`), not a thrown exception.
- The MCP server does **no** template rendering and **no** per-kind escaping, but it **does** re-validate: `post_card` and `update_card` run `validateStructural` and `validateLimits` on the parsed blocks before sending, and a structure or Slack-limit violation comes back as a `Validation error: ...` tool response. Render and escape with `@slackwire/core`'s `render()` first, then pass the resulting blocks; the tools forward them unchanged once validation passes.
- Name resolution and its caching are entirely the responsibility of the `Resolver` you inject.
- The accent / attribution footer is off by default and is a render-time concern in `@slackwire/core`, not something these tools add.
- Errors thrown inside a tool handler surface to the calling agent as MCP error responses.

See the [root README](../../README.md) for the overall project.
