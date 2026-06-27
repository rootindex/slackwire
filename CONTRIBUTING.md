# Contributing to slackwire

Thanks for your interest in slackwire. This guide covers the local setup, the
day-to-day workflow, and what a merge request needs to pass review.

The project is hosted on GitLab at
[gitlab.com/slackwire/slackwire](https://gitlab.com/slackwire/slackwire) and
mirrored read-only to GitHub. GitLab is canonical: open issues and merge
requests there.

## Prerequisites

- **Node.js 22.** This is the version CI runs on. The packages declare a floor
  of Node 20 in their `engines`, but develop against 22 to match the pipeline.
- **Corepack.** It ships with Node and pins the package manager for you. Enable
  it once:

  ```sh
  corepack enable
  ```

- **pnpm 9.15.9.** Pinned in the root `package.json` (`packageManager`). With
  Corepack enabled you do not install pnpm globally; the commands below invoke
  the exact pinned version.

## Getting started

Clone the repo and install with the frozen lockfile so your tree matches CI
exactly:

```sh
git clone https://gitlab.com/slackwire/slackwire.git
cd slackwire
corepack pnpm@9.15.9 install --frozen-lockfile
```

`--frozen-lockfile` must succeed without modifying `pnpm-lock.yaml`. If it wants
to change the lockfile, your dependency edits are out of sync; fix the
`package.json` change rather than hand-editing the lockfile.

## Repository layout

This is a pnpm workspace monorepo. Source lives under `packages/`:

| Path             | Package            | What it is                                                                        |
| ---------------- | ------------------ | --------------------------------------------------------------------------------- |
| `packages/core/` | `@slackwire/core`  | Render engine, per-kind escaping, Slack-limit guards, Slack Web API client, resolver. |
| `packages/cli/`  | `slackwire`        | The command-line front end, bundled to `dist/bundle.cjs`.                          |
| `packages/mcp/`  | `@slackwire/mcp`   | Runnable stdio MCP server over the core (`slackwire-mcp` bin).                     |

Supporting directories: `templates/` (default catalog plus parity/golden
fixtures), `examples/` (extra example templates), and `docs/`
(`gitlab-integration.md`, `parity-evals.md`, `deployment.md`, and the docs
site). The CLI and MCP server are two faces over the one `@slackwire/core`
engine, so most behavioral changes start in `core`.

## Build, lint, and test

All scripts run recursively across every workspace package with `pnpm -r`:

```sh
corepack pnpm@9.15.9 -r lint           # ESLint over each package's src
corepack pnpm@9.15.9 -r build          # tsc per package; the CLI also esbuild-bundles
corepack pnpm@9.15.9 -r test           # vitest run in each package
corepack pnpm@9.15.9 -r test:coverage  # vitest with v8 coverage gate
```

Notes:

- Run **build before `test:coverage`**. The CLI entry test bundles
  `src/main.ts` with esbuild against the compiled core, so `core` must be built
  first or the bundle (and the job) fails. The CI coverage job builds first for
  this reason.
- `test:coverage` enforces per-package thresholds declared in each
  `vitest.config.ts`. A drop below the floor fails the job.
- Templates are byte-parity tested against hand-authored reference cards. If you
  touch the render engine or a template, expect the parity tests to catch any
  drift. See [docs/parity-evals.md](docs/parity-evals.md).

Run the full set before you push:

```sh
corepack pnpm@9.15.9 -r lint
corepack pnpm@9.15.9 -r build
corepack pnpm@9.15.9 -r test
```

## Workflow: ticket first

We work ticket-first. Every change is tied to a GitLab issue.

1. **Open or claim an issue** at
   [the issue tracker](https://gitlab.com/slackwire/slackwire/-/issues). Use the
   Bug or Feature template. Agree on scope before writing code.
2. **Branch from `main`**, named `<issue-number>-short-slug`. The number is the
   issue it closes; the slug is a few kebab-case words. Examples from history:
   `9-test-coverage`, `8-packaging-metadata`, `10-oss-scaffolding`.

   ```sh
   git switch -c 10-oss-scaffolding main
   ```

3. **Make the change** with tests. Keep the diff focused on the issue.
4. **Run lint, build, and test locally** (commands above). Do not push red.
5. **Open a merge request into `main`.** Use the default MR template and fill in
   the checklist. The description must reference the issue with `Closes #N` so
   merging closes it automatically.
6. **Keep the pipeline green.** A merge request needs a passing pipeline to be
   merged: lint, build, test, the coverage gate, the dependency audit, the
   security scans, and the commit-authorship guard all have to pass.

Merges land on `main` as merge commits (for example
`Merge branch '9-test-coverage' into 'main'`).

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/). The subject is
`type(scope): summary` in the imperative mood. Types seen in this repo include
`feat`, `fix`, `docs`, `test`, `chore`, and `refactor`; common scopes are `ci`,
`core`, `cli`, and `mcp`. Examples:

```
feat: runnable MCP server (slackwire-mcp) and real live-parity test
fix(ci): read forbidden email from masked variable; add package author (no email)
docs: correct CLI, MCP, template, and CI docs to match current code
```

Reference the issue from the commit or MR body with `Closes #N`.

## Privacy and secrets

- **Never commit a token or any secret.** Local Slack tokens belong in
  `.slack_token`, which is gitignored. The token is read from the environment at
  runtime (`SLACK_TOKEN`, `SLACK_TOKEN_BASE64`, `SLACK_TOKEN_FILE`), never from
  argv, and never logged.
- **Do not add personal email addresses** to commits, docs, or package metadata.
  CI runs a commit-authorship guard that fails the pipeline if a forbidden
  personal address appears in any author or committer field. For contact, open a
  GitLab issue (mark it confidential when appropriate) or mention the maintainer
  [@rootindex](https://gitlab.com/rootindex).

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). By contributing you agree to uphold it.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow the process in
[SECURITY.md](SECURITY.md): open a **confidential** GitLab issue.
