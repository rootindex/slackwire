# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-24

### Added

- Initial release of slackwire, a command-line tool for sending and managing rich Slack messages from a terminal or CI pipeline, talking to the Slack Web API rather than send-only webhooks.
- CLI verbs: `post`, `update`, `delete`, `react`, and `upload`, plus a `card` alias for `post --template`. Message bodies come from `--text`, raw Block Kit `--blocks`, or an optional template.
- Live-morph flow: post a `running` card, capture its timestamp, then `update` it in place to `passed` or `failed`, the canonical CI pipeline pattern.
- Typed template engine with per-kind escaping (`text_plain`, `text_mrkdwn`, `link_url`, `image_url`, `date`) and structural limit guards, so `< > &`, values like `Name <email>`, and oversized payloads are escaped or rejected as validation errors rather than silently corrupting or truncating the card.
- Byte-parity testing of templates against hand-authored reference cards to keep the render engine from drifting.
- CI-friendly behavior: predictable exit codes, a token-from-file secret pattern (`SLACK_TOKEN`, `SLACK_TOKEN_BASE64`, `SLACK_TOKEN_FILE`), `--dry-run` previews, and a `--fail-mode` switch (`non-blocking` by default, `block` to surface failures).
- Distroless Docker image built from the bundled CLI.
- Optional Model Context Protocol server (`@slackwire/mcp`) exposing the same core engine as tool calls.

[Unreleased]: https://gitlab.com/REPLACE-ME/slackwire/-/compare/v0.1.0...HEAD
[0.1.0]: https://gitlab.com/REPLACE-ME/slackwire/-/releases/v0.1.0
