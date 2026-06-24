# Deployment and Release Guide

This is the project owner's checklist for the external, one-time setup that the
`.gitlab-ci.yml` pipeline assumes. The pipeline file itself is committed and
correct; the steps below wire up the GitLab project, secrets, security
features, npm Trusted Publishing, and Pages so those jobs actually do something.

The pipeline degrades gracefully: before any of this is done, pushes still run
the test stage, the dogfood jobs are skipped (no `SLACK_TOKEN`), the release job
only runs on tags, and the managed security jobs are inert until the matching
GitLab features are enabled.

## 1. Create the GitLab project

1. Create a new project on GitLab (gitlab.com or self-managed) named `slackwire`.
2. If you want npm provenance (recommended), make the project **public**.
   Provenance attestations are only accepted by npm for public repositories.
3. Push the existing history to GitLab as the canonical remote.

### GitLab to GitHub push mirror

The intended topology is: GitLab is canonical, GitHub is a read-only mirror.

1. Create an empty GitHub repository (for example `your-org/slackwire`).
2. Generate a GitHub Personal Access Token (PAT) with `repo` scope on GitHub.
3. In GitLab: **Settings -> Repository -> Mirroring repositories**.
4. Add a mirror:
   - Git repository URL: `https://github.com/your-org/slackwire.git`
   - Mirror direction: **Push**
   - Authentication method: **Password**
   - Username: your GitHub username
   - Password: the GitHub PAT
5. Save. GitLab now pushes branches and tags to GitHub automatically, keeping
   GitHub a read-only mirror of GitLab.

## 2. CI/CD variables

Set these in **Settings -> CI/CD -> Variables**:

| Variable | Value | Flags | Used by |
|---|---|---|---|
| `SLACK_TOKEN` | Slack bot (`xoxb-`) or user (`xoxp-`) token | Masked, Protected | dogfood stage |
| `SLACK_CHANNEL` | Target channel ID (e.g. `C0EXAMPLE123`) or name | (plain) | dogfood stage |

Notes:

- The **Container Registry** and **GitLab Pages** are built-in. You do not set
  any variables for them. The registry credentials (`$CI_REGISTRY`,
  `$CI_REGISTRY_IMAGE`, `$CI_REGISTRY_USER`, `$CI_REGISTRY_PASSWORD`) are
  injected automatically by GitLab for the project's own registry.
- npm publishing uses OIDC, so there is **no `NPM_TOKEN`** to set here. See
  section 4.
- Mark `SLACK_TOKEN` as **Masked** (so it never prints in logs) and
  **Protected** (so it is only exposed to protected branches and tags).
- The dogfood jobs are gated on `rules: - if: '$SLACK_TOKEN'`. Until this
  variable exists, those jobs are simply not created and the pipeline runs
  cleanly without them.

## 3. Enable the security features

The pipeline includes GitLab's managed security templates (SAST/Semgrep, Secret
Detection, Dependency Scanning, Container Scanning). They are inert until the
corresponding features are enabled and (for some) licensed on the project.

1. Go to **Settings -> Security & Compliance** (and **Security configuration**).
2. Enable:
   - **SAST** (Semgrep-based static analysis)
   - **Secret Detection** (leaked credential scanning)
   - **Dependency Scanning** (vulnerable dependency detection)
   - **Container Scanning** (scans the image built in the `build` stage)
3. Some scanners require a GitLab Ultimate tier for full reporting. The jobs run
   regardless; the merge-request security widgets and vulnerability dashboard
   are the tier-gated parts.

Container scanning is pointed at the per-commit image
`$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA` produced by the `build:image` job, so
it scans exactly what was built in this pipeline.

## 4. npm Trusted Publishing (OIDC, no stored token)

The release job publishes with **Trusted Publishing**: short-lived OIDC tokens
instead of a stored npm token, with provenance attestations emitted
automatically. This must be configured once per package on npmjs.com before the
first tag.

Reference: https://docs.npmjs.com/trusted-publishers/

For **each** of the three published packages:

- `slackwire`
- `@slackwire/core`
- `@slackwire/mcp`

do the following on npmjs.com:

1. Open the package settings (or create the package placeholder if it does not
   exist yet, then configure publishing access).
2. Add a **Trusted Publisher** with provider **GitLab**.
3. Point it at:
   - The GitLab namespace/project for `slackwire` (the canonical GitLab repo).
   - The CI/CD job that publishes: **`release:npm`**.
   - The top-level pipeline / default ref as required by the npm form.
4. Save.

Requirements that the pipeline already satisfies, but that you must keep true:

- **npm CLI >= 11.5.1** and **Node >= 22.14**. The release job starts from
  `node:22` and runs `npm install -g npm@latest` to guarantee a recent enough
  npm. It also prints `node --version` and `npm --version` so you can verify in
  the job log.
- The GitLab repo must be **public** for provenance to be accepted (see
  section 1).
- The job mints the OIDC token via the `id_tokens:` block with audience
  `npm:registry.npmjs.org`. npm reads `$NPM_ID_TOKEN` automatically during
  `publish`; you do not pass any provenance flag by hand.

If a trusted publisher is not configured for a package, `pnpm -r publish` will
fail authentication for that package. Configure all three before tagging.

## 5. Release flow

A release is driven entirely by pushing a version tag.

1. Bump versions in the package manifests (`packages/cli/package.json`,
   `packages/core/package.json`, `packages/mcp/package.json`) to the new
   `X.Y.Z`.
2. Update `CHANGELOG.md` with the release notes.
3. Commit, then tag with a `v`-prefixed semver tag and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

4. The tag pipeline:
   - Runs the `test` stage (lint, build, test across the workspace).
   - Builds and pushes the Docker image tagged with the commit SHA, the tag
     name (`vX.Y.Z`), and `latest` to the GitLab Container Registry.
   - Runs the `release:npm` job, which publishes `@slackwire/core`,
     `@slackwire/mcp`, and `slackwire` to npm with provenance via OIDC.
   - If `SLACK_TOKEN` is set, posts and morphs a Slack status card for the run.

5. **Docs deploy separately**: GitLab Pages publishes `docs/site/` on every push
   to the default branch (not on tags). Merge your docs changes to the default
   branch to update the published site.

The push mirror (section 1) then mirrors the tag and commit to GitHub
automatically.

## 6. Replace the placeholder repository URLs

The package manifests currently use placeholder URLs:

```
https://gitlab.com/REPLACE-ME/slackwire
```

Once the GitLab project exists, replace every `REPLACE-ME` occurrence in
`packages/cli/package.json`, `packages/core/package.json`, and
`packages/mcp/package.json` with the real GitLab namespace/project path. These
URLs feed the npm package `repository`, `homepage`, and `bugs` fields, and
provenance ties attestations to the source repo, so they must be accurate
before the first publish.
