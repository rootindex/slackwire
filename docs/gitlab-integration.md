# GitLab Integration: Slack Card Engine

This document shows the canonical pattern for posting a Slack card from a GitLab CI pipeline, live-morphing it from running to passed (or failed) when the job finishes.

## How it works

1. The `notify:running` job posts the initial card and writes the Slack `ts` (message timestamp) to a dotenv artifact.
2. A downstream `notify:success` job reads the `ts` from the dotenv and calls `update` to morph the card.
3. A parallel `notify:failure` job does the same on failure, but uses `dependencies:` instead of `needs:` to avoid the amber "blocked" state that `needs:` causes when the monitored job fails.

The dotenv `ts` is a cache. If the artifact is lost (e.g. retry, cross-pipeline morph), the CLI re-finds the existing card via the dedupe key stored in Slack message metadata (see idempotency, task 011). The metadata is the truth; the dotenv is a convenience.

## Prerequisites

- Docker image `slackwire:dev` available in your registry, or use `npx slackwire` in a Node environment.
- A Slack bot token (`xoxb-...`) or user token (`xoxp-...`) stored as a CI variable `SLACK_TOKEN`.
- A template in your catalog, e.g. `cicd-live@1.0.0`.

## Basic pipeline snippet

```yaml
variables:
  SLACK_CHANNEL: "C0EXAMPLE123"
  SLACK_CATALOG: "$CI_PROJECT_DIR/templates"
  SLACK_TEAM_ID: "T0YOURTEAM"

notify:running:
  stage: .pre
  image: slackwire:dev
  script:
    - |
      slackwire card \
        --template cicd-live@1.0.0 \
        --channel "$SLACK_CHANNEL" \
        --data "{\"pipeline\":\"$CI_PIPELINE_ID\",\"job\":\"$CI_JOB_NAME\",\"status\":\"running\",\"ref\":\"$CI_COMMIT_REF_NAME\"}" \
        | tee slack.env
    - echo "SLACK_TS=$(awk '{print $1}' slack.env)" >> notify.env
  artifacts:
    reports:
      dotenv: notify.env

notify:success:
  stage: .post
  image: slackwire:dev
  needs:
    - job: notify:running
      artifacts: true
  script:
    - |
      slackwire update \
        --channel "$SLACK_CHANNEL" \
        --ts "$SLACK_TS" \
        --template cicd-live@1.0.0 \
        --data "{\"pipeline\":\"$CI_PIPELINE_ID\",\"status\":\"passed\",\"ref\":\"$CI_COMMIT_REF_NAME\"}"
  when: on_success

notify:failure:
  stage: .post
  image: slackwire:dev
  dependencies:
    - notify:running
  script:
    - |
      slackwire update \
        --channel "$SLACK_CHANNEL" \
        --ts "$SLACK_TS" \
        --template cicd-live@1.0.0 \
        --data "{\"pipeline\":\"$CI_PIPELINE_ID\",\"status\":\"failed\",\"ref\":\"$CI_COMMIT_REF_NAME\"}"
  when: on_failure
```

## `needs:` vs `dependencies:` on the failure path

Use `dependencies:` (not `needs:`) on `notify:failure`.

When a job fails, any downstream job that declares `needs: [failed-job]` enters the **amber "blocked"** state and never runs. `dependencies:` only controls artifact download, not execution ordering, so the failure notification job still triggers on `when: on_failure` even when the upstream job has failed.

## Egress-restricted runners

For runners without direct internet access, pass proxy settings and point the CLI at your internal icon host:

```yaml
notify:running:
  variables:
    HTTPS_PROXY: "http://proxy.internal:8080"
    NO_PROXY: "169.254.0.0/16,.internal,slack.com"
    SLACK_ICON_BASE_URL: "https://assets.internal/slack-icons"
  ...
```

`NO_PROXY` should include `slack.com` only if your proxy terminates HTTPS for the Slack API; otherwise omit it. Include the AWS metadata range if your runners run on EC2.

## ISO timestamp to Slack `<!date>` epoch

Slack's `<!date>` token requires a Unix epoch (seconds). To convert the GitLab ISO timestamp (`$CI_PIPELINE_CREATED_AT`, format `2026-06-24T15:30:00Z`) to an epoch in the shell:

```bash
EPOCH=$(date -d "$CI_PIPELINE_CREATED_AT" +%s 2>/dev/null \
  || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CI_PIPELINE_CREATED_AT" +%s)
```

The first form works on glibc/Debian runners (`date -d`). The fallback works on macOS/BSD (`date -j -f`). Pass `$EPOCH` into the `--data` JSON and use it in your template as:

```
<!date^{{epoch}}^{date_short_pretty} at {time}|{{isoTs}}>
```

Slack renders this in the viewer's local timezone; the raw ISO string is the fallback for clients that do not support the `<!date>` construct.

## Dotenv handoff and cross-pipeline morphs

The `notify.env` dotenv artifact carries the `SLACK_TS` for convenience. If the artifact is unavailable (pipeline retry, separate release pipeline morphing a deploy notification), the CLI re-finds the message via the dedupe key stored in Slack message metadata:

- Bot token (`xoxb`): re-find via `conversations.history` scanning `metadata.event_payload`.
- User token (`xoxp`): re-find via `search.messages` on the dedupe key.

Set a consistent dedupe key across all jobs that touch the same card:

```yaml
variables:
  SLACK_DEDUPE_KEY: "pipeline-$CI_PIPELINE_ID"
```

Pass it as `dedupeKey` in your `--data` JSON. The CLI stamps it into Slack message metadata on the first post and uses it to re-find the message on every subsequent morph.

## npx usage (local development)

For local testing without the Docker image:

```bash
npx slackwire card \
  --template cicd-live@1.0.0 \
  --channel C0EXAMPLE123 \
  --dry-run \
  --data '{"pipeline":"42","status":"running","ref":"main"}'
```

`--dry-run` renders the block payload to stdout without posting, so no `SLACK_TOKEN` is required.
