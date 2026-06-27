# Security Policy

We take the security of slackwire seriously. slackwire handles Slack API tokens
and sends content to Slack on a user's behalf, so we appreciate reports that
help keep it safe.

## Supported versions

slackwire is at `0.1.x`. Security fixes target the latest `0.1.x` release.
Older pre-release builds are not maintained; please reproduce on the current
version before reporting.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a vulnerability

**Do not open a public issue, merge request, or comment for a security
vulnerability.** A public report can expose users before a fix is available.

Instead, report it privately:

1. Go to <https://gitlab.com/slackwire/slackwire/-/issues/new>.
2. **Tick the "Confidential" checkbox** so the issue is visible only to
   project maintainers.
3. Describe the issue with enough detail to reproduce it.

Alternatively, contact the maintainer [@rootindex](https://gitlab.com/rootindex)
on GitLab.

Please include, as far as you can:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept.
- The slackwire version and environment (Node version, install method: npm,
  bundled binary, or Docker image).
- Any relevant logs, with secrets redacted.

## What to expect

- **Acknowledgement** within a few business days of your report.
- An initial assessment and severity triage shortly after.
- Coordinated disclosure: we will work with you on a fix and a release, and will
  credit you in the release notes if you would like.

Please give us a reasonable window to release a fix before any public
disclosure.

## Handling secrets

slackwire never reads tokens from argv and never logs them; errors that would
echo a token have it redacted. When reporting, do the same: redact any
`xoxb-`/`xoxp-` token or other secret from logs and reproductions. Never attach
a real, live token to a report.
