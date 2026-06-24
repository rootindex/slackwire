# slackwire

A command-line tool for sending, updating, and managing rich Slack messages, from your terminal or CI.

Version 0.1.0. Requires Node.js 20 or newer.

## Why slackwire

Most Slack notification tools are send-only webhook wrappers: they can post a message and nothing more. slackwire talks to the Slack Web API, so it can post a message and then live-update it (morph the status, text, and accent color on the same message), delete it, react to it, and upload files. Every message goes through per-kind escaping and structural limit guards, so `< > &`, names like `Name <email>`, and oversized payloads never silently corrupt or truncate the rendered card. It is built for CI: predictable exit codes, a token-from-file pattern for secrets, and a `running -> passed/failed` morph flow for pipeline notifications. Templates are optional; most usage is a single `--text` or `--blocks` call.

## Quickstart (30 seconds)

```sh
export SLACK_TOKEN=xoxb-...
npx slackwire post --channel C0XXXXXXXXX --text "hello from slackwire"
```

On success, `post` prints the message timestamp and a permalink, tab-separated:

```
1718900000.123456	https://slack.com/archives/C0XXXXXXXXX/p1718900000123456
```

## Install

slackwire ships on three rails. Pick whichever fits your environment.

1. Bare bundled binary (single CommonJS file, no install step):

   ```sh
   node packages/cli/dist/bundle.cjs post --channel C0XXXXXXXXX --text "hi"
   ```

2. Global npm install or `npx`:

   ```sh
   npm install -g slackwire
   slackwire post --channel C0XXXXXXXXX --text "hi"

   # or without installing
   npx slackwire post --channel C0XXXXXXXXX --text "hi"
   ```

3. Distroless Docker image (built from the included `Dockerfile`):

   ```sh
   docker build -t slackwire:dev .
   docker run --rm -e SLACK_TOKEN slackwire:dev post --channel C0XXXXXXXXX --text "hi"
   ```

## Usage

slackwire is invoked as `slackwire <verb> [options]`. Running it with no verb prints usage and exits 2.

```
Verbs:
  post    --channel <c> (--template <n@v> | --blocks <json>|-  | --text <t>)
  update  --channel <c> --ts <ts> (--template | --blocks | --text)
  delete  --channel <c> --ts <ts>
  react   --channel <c> --ts <ts> --emoji <name>
  upload  --channel <c> --file <path> [--title <t>] [--comment <c>]
  card    --template <name@ver> --channel <c> [--data <json>] (alias for post --template)
```

For `post` and `update`, the message body comes from exactly one of three sources: `--template`, `--blocks`, or `--text`.

`--dry-run` works on `post`, `update`, and `card`. It renders the message from `--template` / `--blocks` / `--text` and prints the assembled JSON (`{blocks, text, attachments?}`) to stdout, without a token and without calling Slack. Use it to preview a message or validate a template in CI.

### Post plain text

```sh
slackwire post --channel C0XXXXXXXXX --text "deploy finished"
```

`--channel` accepts a channel ID (`C0XXXXXXXXX`, `G...`, or `D...`) or a channel name. Names are resolved to an ID via the Slack API before posting.

### Post raw Block Kit

`--blocks` takes a JSON array of blocks, or an object shaped `{ "blocks": [...], "attachments": [...], "text": "..." }`.

```sh
slackwire post --channel C0XXXXXXXXX \
  --blocks '[{"type":"section","text":{"type":"mrkdwn","text":"*Build* passed"}}]'
```

Pass `--blocks -` to read the JSON from stdin:

```sh
cat card.json | slackwire post --channel C0XXXXXXXXX --blocks -
```

When you post raw blocks, slackwire validates the structure and Slack limits before sending, and auto-derives the fallback `text` from the blocks if you do not supply `--text`.

### Post from a template

Templates render typed placeholders into Block Kit. Provide the template as `name@version` (version defaults to `1.0.0`) and feed it data with `--data`:

```sh
slackwire post --channel C0XXXXXXXXX \
  --template ci-cd@1.0.0 \
  --data '{"title":"CI passed","ref":"main","author":"Naledi"}'
```

`card` is an alias for `post --template`:

```sh
slackwire card --template ci-cd@1.0.0 --channel C0XXXXXXXXX --data '{...}'
```

Add `--theme '#2eb67d'` to set an accent color (see Limits & gotchas for the caveat). The template catalog defaults to `./templates` and can be overridden with `--catalog <path>` or the `SLACK_CATALOG` env var.

### Update and live-morph

`update` rewrites a message in place by its timestamp. The canonical CI pattern is to post a "running" card, capture its `ts`, then morph it to "passed" or "failed" when the job finishes:

```sh
# post the running card and capture the timestamp (first tab-separated field)
TS=$(slackwire post --channel C0XXXXXXXXX --template ci-cd@1.0.0 \
       --data '{"status":"running"}' | cut -f1)

# later, morph the same message
slackwire update --channel C0XXXXXXXXX --ts "$TS" --template ci-cd@1.0.0 \
  --data '{"status":"passed"}'
```

`update` also prints `<ts>\t<permalink>` on success. See [docs/gitlab-integration.md](docs/gitlab-integration.md) for the full pipeline flow.

### Delete

```sh
slackwire delete --channel C0XXXXXXXXX --ts 1718900000.123456
```

Prints `deleted\t<ts>` on success.

### React

```sh
slackwire react --channel C0XXXXXXXXX --ts 1718900000.123456 --emoji white_check_mark
```

Use the emoji name without colons. Prints `reacted\t<emoji>` on success.

### Upload a file

```sh
slackwire upload --channel C0XXXXXXXXX --file ./report.txt \
  --title "Coverage report" --comment "Latest run"
```

`--title` and `--comment` (Slack's initial comment) are optional. Prints `uploaded\t<path>` on success.

## Authentication and config

The token is read from the environment, never from argv, and is never logged. Errors that echo a token have it redacted. The token is resolved in this order, first match wins:

1. `SLACK_TOKEN`
2. `SLACK_TOKEN_BASE64` (base64-decoded at runtime)
3. `SLACK_TOKEN_FILE` (a path to a file containing the token; the trimmed file contents are used). This is the Docker-secret pattern.

A bot token (`xoxb-...`) or a user token (`xoxp-...`) both work.

| Variable | Purpose |
|---|---|
| `SLACK_TOKEN` | Slack token, highest precedence. |
| `SLACK_TOKEN_BASE64` | Base64-encoded token, used if `SLACK_TOKEN` is unset. |
| `SLACK_TOKEN_FILE` | Path to a file holding the token, used if the two above are unset. |
| `SLACK_ATTRIBUTION` | Set to `true` to render the colored accent bar (rides on a legacy attachment). Off by default. |
| `SLACK_CATALOG` | Template catalog directory. Defaults to `./templates`. |
| `SLACK_TEAM_ID` | Team ID used when resolving channel and user names. Defaults to `T000`. |
| `HTTPS_PROXY` / `NO_PROXY` | Standard proxy passthrough for egress-restricted runners. |

## Templates (optional)

Templates are a convenience for cards you post repeatedly, such as CI/CD status or incident updates. You do not need them for ad hoc messages; `--text` and `--blocks` cover most usage.

Each template is a versioned directory with three files:

- `skeleton.json`: Block Kit JSON with `{{kind:key}}` placeholder tokens.
- `schema.json`: a map of each field name to its placeholder kind.
- `meta.json`: name, version, description, and morph states.

Placeholders are typed, and each kind is escaped for its position. The kinds include `text_plain`, `text_mrkdwn`, `link_url`, `image_url`, and `date`. Per-kind escaping is why `< > &` and values like `Name <email>` render safely instead of breaking the markup.

Templates are byte-parity tested against hand-authored reference cards so the engine cannot drift. See [docs/parity-evals.md](docs/parity-evals.md) for the parity harness, and [templates/README.md](templates/README.md) plus the example at [templates/ci-cd/1.0.0/](templates/ci-cd/1.0.0/) for the catalog layout.

## Using it in CI / GitLab

slackwire is designed to run inside a pipeline: a `running` card on the `.pre` stage, captured `ts` handed forward through a dotenv artifact, and a morph to `passed` or `failed` on completion. The Docker image or `npx slackwire` both work as CI steps. The full pattern, including the `needs:` vs `dependencies:` gotcha on the failure path and proxy handling for egress-restricted runners, is documented in [docs/gitlab-integration.md](docs/gitlab-integration.md).

## Exit codes and --fail-mode

| Code | Meaning |
|---|---|
| 0 | Success. |
| 2 | Validation error (bad input, missing required flag, schema, structural, or limit error). |
| 3 | Slack API error. |
| 4 | Network or timeout error. |
| 5 | Rate-limited and gave up. |

`--fail-mode` controls what happens when a Slack call fails:

- `non-blocking` (default): a Slack, network, or rate-limit failure prints a warning to stderr and exits 0, so a notification step never breaks your pipeline. Validation errors always exit 2 regardless of fail mode.
- `block`: those failures exit with the non-zero code from the table above.

```sh
slackwire post --channel C0XXXXXXXXX --text "hi" --fail-mode block
```

## Limits and gotchas

- Slack hard limits are enforced before sending: 50 blocks max per message, section text 3000 characters, header 150, button label 75, image blocks require `alt_text`. Exceeding any of these is a validation error (exit 2), not a silent truncation.
- The colored accent bar uses a legacy Slack attachment. Setting `--theme` plus `SLACK_ATTRIBUTION=true` enables it, but because it is a legacy attachment Slack may render an "Added by &lt;app&gt;" footer on the message. A native Alert block is the planned footer-free path.
- `attachments[].blocks` are not yet structurally validated by the engine. Only top-level blocks are length- and `alt_text`-checked. If you move a block tree into an attachment (the house-style colored-card pattern), respect Slack's limits yourself.
- The Docker image contains only the bundled CLI, not the `templates/` catalog. To use templates in a container, mount your catalog and point `SLACK_CATALOG` (or `--catalog`) at the mount.

## MCP server

slackwire has two faces over one core. The CLI is the terminal/CI front end; the MCP server (`@slackwire/mcp`) is the front end for MCP-capable assistants. Both call the same `@slackwire/core` engine, so escaping, limit guards, and fallback derivation apply identically no matter which face you use.

The MCP package now ships a runnable stdio server, not just a library. Installing it provides a `slackwire-mcp` bin (entry `dist/main.js`) that starts a Model Context Protocol server over stdio. It resolves the Slack token from the environment in the same order the CLI uses, first match wins: `SLACK_TOKEN`, then `SLACK_TOKEN_BASE64` (base64-decoded), then `SLACK_TOKEN_FILE` (a path to a token file). Diagnostic logs go to stderr, prefixed `[slackwire-mcp]`.

### Run it

```sh
export SLACK_TOKEN=xoxb-...
slackwire-mcp           # once @slackwire/mcp is installed

# or without installing
npx -y slackwire-mcp
```

### Wire it into an MCP client

Point a Claude Desktop / Claude Code style MCP client at the bin and feed it a token through the environment:

```json
{
  "mcpServers": {
    "slackwire": {
      "command": "npx",
      "args": ["-y", "slackwire-mcp"],
      "env": { "SLACK_TOKEN_FILE": "/absolute/path/to/.slack_token" }
    }
  }
}
```

### Tools it exposes

| Tool | Purpose |
|---|---|
| `post_card` | Render a template card and post it to a channel. |
| `update_card` | Render a template card and morph an existing message in place. |
| `post` | Send a plain-text message or raw blocks. |
| `react` | Add a reaction emoji to a message. |
| `upload` | Upload a file to a channel. |
| `resolve` | Resolve a channel or user name to its Slack ID. |

Same core as the CLI, so per-kind escaping, structural and Slack limit guards, and the non-blocking fallback behave identically through the tools. See [packages/mcp/README.md](packages/mcp/README.md).

## Project layout

```
packages/
  core/      @slackwire/core  : render engine, escaping, limit guards, Slack client, resolver
  cli/       slackwire        : the command-line front end (bundled to dist/bundle.cjs)
  mcp/       @slackwire/mcp    : runnable stdio MCP server over the core (slackwire-mcp bin)
templates/   versioned template catalog + shared partials + parity/golden fixtures
docs/        gitlab-integration.md, parity-evals.md, and this index
```

## Deploying and releasing

GitLab CI runs lint, test, and build plus managed security scans (SAST, secret detection, dependency and container scanning) on every push, then builds and pushes the distroless image to the GitLab Container Registry. The pipeline dogfoods slackwire by posting and morphing its own Slack build card. On a version tag it publishes `slackwire`, `@slackwire/core`, and `@slackwire/mcp` to npm with provenance via OIDC trusted publishing (no stored token), and GitLab Pages deploys `docs/site/` from the default branch. A GitLab to GitHub push mirror keeps GitHub a read-only mirror of the canonical GitLab repo. See [`.gitlab-ci.yml`](.gitlab-ci.yml) and [docs/deployment.md](docs/deployment.md) for the full setup.

## License

MIT. See [LICENSE](./LICENSE).
