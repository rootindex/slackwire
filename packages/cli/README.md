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

`post`, `update`, and `card` print `<ts>\t<permalink>` on success. `delete`, `react`, and `upload` print a short confirmation line.

## Verbs

```
post    --channel <c> (--template <n@v> | --blocks <json>|-  | --text <t>)
update  --channel <c> --ts <ts> (--template | --blocks | --text)
delete  --channel <c> --ts <ts>
react   --channel <c> --ts <ts> --emoji <name>
upload  --channel <c> --file <path> [--title <t>] [--comment <c>]
card    --template <name@ver> --channel <c> [--data <json>]   (alias for post --template)
```

Running `slackwire` with no verb prints usage and exits 2. An unknown verb also exits 2.

For `post` and `update`, the body comes from exactly one of three sources:

- `--template <name@ver>` with optional `--data <json>` and `--catalog <path>`. Version defaults to `1.0.0`.
- `--blocks '<json>'`: a JSON array of blocks, or `{ "blocks": [...], "attachments": [...], "text": "..." }`. `--blocks -` reads the JSON from stdin. Structural and limit validation runs before sending, and fallback text is auto-derived from the blocks when `--text` is absent.
- `--text "<plain>"`.

For `update`, the body sources are optional: `update --channel --ts` with no body still issues a `chat.update` call.

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
| `--file <path>` | File to upload. |
| `--title <t>` / `--comment <c>` | File title and initial comment for `upload`. |
| `--catalog <path>` | Template catalog directory. Overrides `SLACK_CATALOG` (default `./templates`). |
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
| `SLACK_CATALOG` | Template catalog directory. Default `./templates`. |
| `SLACK_TEAM_ID` | Team ID used for channel/user name resolution. Default `T000`. |
| `HTTPS_PROXY` / `NO_PROXY` | Proxy passthrough for egress-restricted runners. |

Token precedence is `SLACK_TOKEN` -> `SLACK_TOKEN_BASE64` -> `SLACK_TOKEN_FILE`. Bot (`xoxb-`) and user (`xoxp-`) tokens both work. Tokens come from the environment only, never argv, are never logged, and are redacted from error output.

## stdout format

On success, `post`, `update`, and `card` print one tab-separated line:

```
<ts>	<permalink>
```

`delete` prints `deleted\t<ts>`, `react` prints `reacted\t<emoji>`, `upload` prints `uploaded\t<path>`. With `--dry-run`, `post`, `update`, and `card` print the assembled message as pretty-printed JSON instead.

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
- The Docker image bundles only the CLI, not the `templates/` catalog. Mount your catalog and set `SLACK_CATALOG` (or `--catalog`) to use templates in a container.

See the [root README](../../README.md) for full examples and the [CI/GitLab guide](../../docs/gitlab-integration.md).
