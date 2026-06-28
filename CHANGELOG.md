# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-06-28

### Fixed

- The CLI now ships its template catalog inside the published `slackwire` package (and the Docker image), so `--template` works out of the box. Previously a fresh `npm install` of `slackwire` shipped no templates, so `slackwire card --template ci-cd@1.0.0` failed with `ENOENT` (exit 2) unless you pointed `--catalog` or `SLACK_CATALOG` at your own copy of the catalog.

### Changed

- The `audit:dependencies` CI job is now a passing, blocking gate (no longer `allow_failure`). The single remaining advisory it would otherwise trip on, GHSA-fx2h-pf6j-xcff, is a dev-only vite advisory pulled transitively by vitest, never shipped in a published package and unfixable without a vitest major bump. It is explicitly suppressed via `pnpm.auditConfig.ignoreGhsas` in the root `package.json`.

## [0.1.1] - 2026-06-28

### Added

- Released to npm via OIDC Trusted Publishing with signed provenance, so no long-lived npm token is stored anywhere.

### Changed

- The `@slackwire/mcp` server now lists its tools (`tools/list`) without a Slack token configured; a token is required only when a tool is actually called.

## [0.1.0] - 2026-06-28

### Added

- Initial public release of slackwire, a command-line tool for sending and managing rich Slack messages from a terminal or CI pipeline, talking to the Slack Web API rather than send-only webhooks.
- `@slackwire/core`: a Block Kit rendering engine with versioned templates, strict live-parity rendering, per-kind escaping (`text_plain`, `text_mrkdwn`, `link_url`, `image_url`, `date`), structural and Slack-limit validation, fallback-text derivation, and TLS proxy support via `https-proxy-agent`.
- CLI verbs: `post`, `card`, `update`, `delete`, `react`, `upload`, `search`, `read`, and `schedule`. Message bodies come from `--text`, raw Block Kit `--blocks` (including blocks piped from stdin), or a template; `card` is an alias for `post --template`.
- Live-morph flow: post a `running` card, capture its timestamp, then `update` it in place to `passed` or `failed`, the canonical CI pipeline pattern.
- Byte-parity testing of templates against hand-authored reference cards to keep the render engine from drifting.
- CI-friendly behavior: predictable fail-mode exit codes, a token-from-file secret pattern (`SLACK_TOKEN`, `SLACK_TOKEN_BASE64`, `SLACK_TOKEN_FILE`), `--dry-run` previews, and a `--fail-mode` switch (`non-blocking` by default, `block` to surface failures).
- Distroless Docker image built from the bundled CLI.
- `@slackwire/mcp`: a Model Context Protocol server exposing the same core engine as tool calls.
- Published to npm.

[Unreleased]: https://gitlab.com/slackwire/slackwire/-/compare/v0.1.2...HEAD
[0.1.2]: https://gitlab.com/slackwire/slackwire/-/releases/v0.1.2
[0.1.1]: https://gitlab.com/slackwire/slackwire/-/releases/v0.1.1
[0.1.0]: https://gitlab.com/slackwire/slackwire/-/releases/v0.1.0
