# slackwire (CLI)

The `slackwire` command-line tool: send, update, delete, react to, and upload Slack messages from a terminal or a CI job. It wraps [`@slackwire/core`](../core/README.md), adding argument parsing, token resolution, channel-name resolution, render-from-template, and a CI-friendly exit-code and fail-mode contract. This is the published headline package (unscoped name `slackwire`, bin `slackwire`). It ships as a self-contained CJS bundle (`dist/bundle.cjs`) so it runs without installing workspace dependencies.

Version 0.1.0. Requires Node.js 20 or newer.

## Install

```sh
npm install -g slackwire    # then: slackwire <verb> [options]
npx slackwire <verb> [options]
node packages/cli/dist/bundle.cjs <verb> [options]   # bundled single-file binary
docker build -t slackwire:dev . && docker run --rm -e SLACK_TOKEN slackwire:dev <verb>
```

## Minimal usage

```sh
export SLACK_TOKEN=xoxb-...
slackwire post --channel C0XXXXXXXXX --text "hello from slackwire"
```

`post`, `update`, and `card` print `<ts>\t<permalink>` on success. `delete`, `react`, `upload`, and `schedule` print a short confirmation line. `search` and `read` print one tab-separated line per result.

## Verbs

```
post      --channel <c> (--template <n@v> | --blocks <json>|-  | --text <t>)
update    --channel <c> --ts <ts> (--template | --blocks | --text)
delete    --channel <c> --ts <ts>
react     --channel <c> --ts <ts> --emoji <name>
upload    --channel <c> --file <path> [--title <t>] [--comment <c>]
card      --template <name@ver> --channel <c> [--data <json>]   (alias for post --template)
search    --query <q> [--limit <n>]
read      --channel <c> [--limit <n>]
schedule  --channel <c> --at <epoch|ISO> (--template | --blocks | --text)
```

Running `slackwire` with no verb prints usage and exits 2. An unknown verb also exits 2.

For `post`, `update`, and `schedule`, the body comes from exactly one of three sources:

- `--template <name@ver>` with optional `--data <json>`. The catalog ships bundled with the package, so this works out of the box; pass `--catalog <path>` only to use a custom catalog. Version defaults to `1.0.0`.
- `--blocks '<json>'`: a JSON array of blocks, or `{ "blocks": [...], "attachments": [...], "text": "..." }`. `--blocks -` reads the JSON from stdin. Structural and limit validation runs before sending, and fallback text is auto-derived from the blocks when `--text` is absent.
- `--text "<plain>"`.

For `update`, the body sources are optional: `update --channel --ts` with no body still issues a `chat.update` call.

`search` queries `search.messages` and prints one `<ts>\t<channel>\t<text>` line per match. `read` pulls `conversations.history` for a channel and prints one `<ts>\t<text>` line per message, newest first; `--limit` caps the count. `schedule` posts later via `chat.scheduleMessage`: `--at` takes a Unix epoch in seconds or an ISO 8601 date, and on success it prints `scheduled\t<scheduled_message_id>`. Under `--dry-run`, `schedule` prints the assembled `{post_at, text, blocks?}` and calls no API.

## Flags

| Flag | Meaning |
|---|---|
| `--channel <c>` | Channel ID (`C0XXXXXXXXX`, `G...`, `D...`) or channel name (resolved to an ID via the Slack API). |
| `--ts <ts>` | Message timestamp, for `update` / `delete` / `react`. |
| `--template <name@ver>` | Template to render. Version defaults to `1.0.0`. |
| `--data <json>` | JSON payload for the template. Invalid JSON exits 2. |
| `--blocks <json>` or `--blocks -` | Raw Block Kit. `-` reads stdin. |
| `--text <t>` | Plain message text, or fallback text alongside `--blocks`. |
| `--emoji <name>` | Reaction emoji name, without colons. |
| `--query <q>` | Search query for `search`. |
| `--limit <n>` | Result cap for `search` (count) and `read` (history limit). |
| `--at <epoch\|ISO>` | Post time for `schedule`: a Unix epoch in seconds or an ISO 8601 date. |
| `--file <path>` | File to upload. |
| `--title <t>` / `--comment <c>` | File title and initial comment for `upload`. |
| `--catalog <path>` | Custom template catalog directory. Overrides the bundled catalog and `SLACK_CATALOG`. |
| `--theme <#rrggbb>` | Accent color. Needs `SLACK_ATTRIBUTION=true` to render the colored bar. |
| `--dry-run` | Render the message from `--template` / `--blocks` / `--text` and print the assembled JSON (`{blocks, text, attachments?}`) to stdout. Works on `post`, `update`, and `card`. No token required, no Slack API call. |
| `--fail-mode <non-blocking\|block>` | Failure behavior. Defaults to `non-blocking`. |

## Environment

| Variable | Purpose |
|---|---|
| `SLACK_TOKEN` | Token, highest precedence. |
| `SLACK_TOKEN_BASE64` | Base64-encoded token, used if `SLACK_TOKEN` is unset. |
| `SLACK_TOKEN_FILE` | Path to a token file, used if the two above are unset (Docker-secret pattern). |
| `SLACK_ATTRIBUTION` | `true` to render the legacy colored accent bar. Off by default. |
| `SLACK_CATALOG` | Custom template catalog directory. Overrides the bundled catalog. |
| `SLACK_TEAM_ID` | Team ID used for channel/user name resolution. Default `T000`. |
| `HTTPS_PROXY` / `NO_PROXY` | Proxy passthrough for egress-restricted runners. |

Token precedence is `SLACK_TOKEN` -> `SLACK_TOKEN_BASE64` -> `SLACK_TOKEN_FILE`. Bot (`xoxb-`) and user (`xoxp-`) tokens both work. Tokens come from the environment only, never argv, are never logged, and are redacted from error output.

## stdout format

On success, `post`, `update`, and `card` print one tab-separated line:

```
<ts>	<permalink>
```

`delete` prints `deleted\t<ts>`, `react` prints `reacted\t<emoji>`, `upload` prints `uploaded\t<path>`, `schedule` prints `scheduled\t<scheduled_message_id>`. `search` prints `<ts>\t<channel>\t<text>` per match and `read` prints `<ts>\t<text>` per message. With `--dry-run`, `post`, `update`, `card`, and `schedule` print the assembled message as pretty-printed JSON instead.

## Exit codes and fail mode

| Code | Meaning |
|---|---|
| 0 | Success (or a non-blocking Slack / network / rate-limit warning). |
| 2 | Validation error: bad input, missing required flag, invalid `--data` / `--blocks` JSON, schema / structural / limit error, missing token, or unknown verb. |
| 3 | Slack API error (in `--fail-mode block`). |
| 4 | Network or timeout error (in `--fail-mode block`). |
| 5 | Rate-limited and gave up (in `--fail-mode block`). |

`--fail-mode non-blocking` (default) turns Slack, network, and rate-limit failures into a stderr warning and exit 0, so a notification step never breaks a pipeline. `--fail-mode block` propagates the non-zero code. Validation errors always exit 2 regardless of fail mode.

## Limits and gotchas

- A missing token exits 2 unless `--dry-run` is set. Channel name resolution uses a non-persisting (noop) cache in the CLI; if a name cannot be resolved, the raw string is passed to the API unchanged.
- Slack hard limits enforced before sending: 50 blocks, section text 3000 chars, header 150, button label 75, image blocks require `alt_text`. Violations exit 2.
- The colored bar rides on a legacy attachment, so Slack may show an "Added by &lt;app&gt;" footer. A native Alert block is the planned footer-free path.
- `attachments[].blocks` are not structurally validated; only top-level blocks are checked.
- The Docker image ships the bundled `templates/` catalog alongside the CLI, so `--template` works in a container out of the box. Mount your own catalog and set `SLACK_CATALOG` (or `--catalog`) only to use custom templates.

See the [root README](../../README.md) for full examples and the [CI/GitLab guide](../../docs/gitlab-integration.md).
