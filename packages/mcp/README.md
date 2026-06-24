# @slack-cards/mcp

Model Context Protocol (MCP) server front-end for the Slack Card Engine. Exposes Slack posting, updating, reacting, uploading, and name-resolution as MCP tools consumed by AI agents. Communicates over stdio using the standard MCP SDK transport.

## Install

```sh
pnpm add @slack-cards/mcp
```

## Minimal usage

```ts
import { createMcpServer } from '@slack-cards/mcp';
import { SlackClient, Resolver, DiskCache } from '@slack-cards/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const client = new SlackClient(process.env.SLACK_TOKEN!);
const cache = new DiskCache('.cache', 3600);
const resolver = new Resolver(client['web'], cache, process.env.SLACK_TEAM_ID!);

const server = createMcpServer(client, resolver);
await server.connect(new StdioServerTransport());
```

The server runs until the transport closes. All diagnostic logs go to `stderr` prefixed with `[slack-cards-mcp]`.

## Public API surface

### `createMcpServer(slackClient, resolver): McpServerHandle`

Creates and configures the MCP server instance. Does not start listening until `connect()` is called.

```ts
interface McpServerHandle {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}
```

## MCP tools

| Tool | Required inputs | Optional inputs | Returns |
|---|---|---|---|
| `post_card` | `channel`, `blocks` (JSON string) | `text` | `{ ts, channel, permalink }` |
| `update_card` | `channel`, `ts`, `blocks` (JSON string) | `text` | `{ ts, channel }` |
| `post` | `channel`, `text` | - | `{ ts, channel }` |
| `react` | `channel`, `ts`, `name` | - | `"ok"` |
| `upload` | `channel`, `filename`, `content` | - | `"ok"` |
| `resolve` | `name`, `type` (`"channel"` or `"user"`) | - | `{ name, type, id }` |

All `channel` inputs accept either a channel name or a Slack channel ID. Names are resolved to IDs via the injected `Resolver` before each API call.

`blocks` is passed as a JSON-encoded string so the MCP schema stays `type: string` and avoids nesting issues with arbitrary block shapes.

`post_card` and `update_card` return a `permalink` of the form `https://slack.com/archives/<channel>/p<ts>`.

`resolve` returns `{ id: null }` when the name cannot be resolved.

## Transport

The server uses stdio transport. Wire it up in your MCP host config:

```json
{
  "mcpServers": {
    "slack-cards": {
      "command": "node",
      "args": ["path/to/mcp-entry.js"],
      "env": {
        "SLACK_TOKEN": "xoxb-...",
        "SLACK_TEAM_ID": "T12345"
      }
    }
  }
}
```

## Limits and gotchas

- **`blocks` must be a valid JSON string** when calling `post_card` or `update_card`. Passing a non-JSON value throws at parse time inside the tool handler.
- **Channel name resolution** delegates to the `Resolver` instance you inject. The resolver caches results using the `DiskCache` you provide; TTL is caller-controlled.
- **No template rendering** in the MCP server itself. Render with `@slack-cards/core`'s `render()` function first, then pass the resulting blocks to `post_card`.
- **All Slack hard limits** (50 blocks, 3000-char sections, 38 000-char soft total) are enforced by `@slack-cards/core` when you call `render()`. The MCP tools forward blocks as-is and do not re-validate.
- Errors thrown inside tool handlers propagate as MCP error responses to the calling agent.
- Attribution footer is **off by default**. Pass `attribution: true` to `render()` in `@slack-cards/core` before handing blocks to the MCP server.
