# @slack-cards/cli

Command-line front-end for the Slack Card Engine. Renders templates from a local catalog and posts or updates Slack messages. Ships as a self-contained CJS bundle (`dist/bundle.cjs`) so it runs without installing workspace dependencies.

## Install

```sh
pnpm add @slack-cards/cli
# or use the binary directly after build
node dist/bundle.cjs <verb> [options]
```

Binary name after install: `slack-cards`

## Minimal usage

```sh
# Render and post a template
SLACK_TOKEN=xoxb-... \
  slack-cards card \
  --template incident@1.0.0 \
  --data '{"title":"DB spike","severity":"P1","accent":"#cc0000","incident_id":"INC-1","service":"api","runbook_url":"https://runbook/","assigned_to":"alice"}' \
  --channel C12345

# Dry-run: print rendered JSON without posting
slack-cards card --template ci-cd@1.0.0 --data '{...}' --dry-run

# Update an existing message
SLACK_TOKEN=xoxb-... \
  slack-cards update \
  --channel C12345 \
  --ts 1717000000.123456 \
  --template incident@1.0.0 \
  --data '{...}'
```

## Verbs

| Verb | Required flags | Description |
|---|---|---|
| `card` | `--template`, `--channel` (unless `--dry-run`) | Render a template and post it |
| `update` | `--channel`, `--ts` | Update an existing message; optionally re-render with `--template` and `--data` |

No other verbs are implemented. Unknown verbs exit with code `2`.

## Options

| Flag | Type | Description |
|---|---|---|
| `--template` | `name@version` | Template name and version (version defaults to `1.0.0`) |
| `--data` | JSON string | Payload object for interpolation |
| `--channel` | string | Channel name or ID (names are resolved via the Slack API) |
| `--ts` | string | Message timestamp (required for `update`) |
| `--dry-run` | boolean | Print rendered blocks to stdout; skip posting |
| `--fail-mode` | `block` or `non-blocking` | Default `non-blocking`: Slack/network errors print a warning and exit 0. `block`: errors exit with a non-zero code |
| `--catalog` | path | Override the template catalog directory (default: `$SLACK_CATALOG` or `./templates`) |
| `--version` | string | Parsed but unused; reserved |

## Environment variables

| Variable | Description |
|---|---|
| `SLACK_TOKEN` | Bot or user token (plain text) |
| `SLACK_TOKEN_BASE64` | Token base64-encoded (decoded at runtime) |
| `SLACK_ATTRIBUTION` | Set to `true` to enable attribution footer |
| `SLACK_TEAM_ID` | Team ID used for channel name resolution cache (defaults to `T000`) |
| `SLACK_CATALOG` | Fallback catalog path when `--catalog` is not set |

## Exit-code contract

| Code | Meaning |
|---|---|
| `0` | Success (or non-blocking Slack/network warning) |
| `2` | Validation failure (`SchemaError`, `StructuralError`, `LimitError`), missing required flag, bad JSON in `--data`, or unknown verb |
| `3` | Slack API error (only in `--fail-mode block`) |
| `4` | Network error (only in `--fail-mode block`) |
| `5` | Rate limit error (only in `--fail-mode block`) |
| `1` | Unexpected/unknown error (only in `--fail-mode block`) |

Validation errors (code `2`) always block regardless of `--fail-mode`.

## stdout format

On success, `card` and `update` print one tab-separated line:

```
<ts>\t<permalink>
```

`--dry-run` prints the rendered payload as pretty JSON to stdout.

## Limits and gotchas

- **Token is required** unless `--dry-run` is set; missing token exits with code `2`.
- **Channel name resolution** uses a noop (non-persisting) cache. If the channel name cannot be resolved, the raw name string is passed to the API unchanged.
- Validation errors (schema, structural, limit) **always** exit `2` even with `--fail-mode non-blocking`.
- `SLACK_TOKEN_BASE64` takes precedence over `SLACK_TOKEN` when both are set.
- The Slack hard limits enforced by `@slack-cards/core` apply: 50 blocks, 3000-char sections, 38 000-char soft total.
