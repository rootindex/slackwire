# GitLab Integration: Slack Card Engine

This document shows the canonical pattern for posting a Slack card from a GitLab CI pipeline, live-morphing it from running to passed (or failed) when the job finishes.

## How it works

1. The `notify:running` job posts the initial card and writes the Slack `ts` (message timestamp) to a dotenv artifact.
2. A downstream `notify:success` job reads the `ts` from the dotenv and calls `update` to morph the card.
3. A parallel `notify:failure` job does the same on failure, but uses `dependencies:` instead of `needs:` to avoid the amber "blocked" state that `needs:` causes when the monitored job fails.

The dotenv `ts` is the handoff between jobs: `notify:running` writes it, and the morph jobs read it. The `slackwire` CLI verbs (`card`, `post`, `update`) act purely on the `channel` + `ts` you pass them; they do not stamp dedupe metadata or re-find a prior card. (Metadata-based idempotent re-find exists as a `@slackwire/core` library function, `findOrCreate`, but is not wired into the CLI today.) Keep the dotenv artifact intact across the pipeline; if the `ts` is lost, the morph jobs have nothing to update and you would post a fresh card.

## Prerequisites

- Docker image `slackwire:dev` available in your registry, or use `npx slackwire` in a Node environment.
- A Slack bot token (`xoxb-...`) or user token (`xoxp-...`) stored as a CI variable `SLACK_TOKEN`.
- A template in your catalog, e.g. the bundled `ci-cd@1.0.0` (point `SLACK_CATALOG` or `--catalog` at the directory that holds it). Every field in the template's `schema.json` is required, so the `--data` object must supply them all.

## Basic pipeline snippet

The `--data` objects below use literal example values so the commands run as-is. To stamp in pipeline values, substitute CI variables (e.g. `$CI_COMMIT_REF_NAME`, `$CI_COMMIT_SHORT_SHA`, `$CI_PIPELINE_URL`) into the JSON. The three states share the same 16 `ci-cd` fields; only the status-flavored values change.

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
        --template ci-cd@1.0.0 \
        --channel "$SLACK_CHANNEL" \
        --data '{"title":"CI running: healthcart-v2 #2451","ref":"feature/checkout-fix","short_sha":"a1b9f2c","description":"Fix Stitch amount overflow","author":"Naledi","icon_url":"https://placehold.co/72x72/ecb22e/ffffff/png?text=RUN","icon_alt":"running","steps_text":"Install -> Lint -> Test -> Build -> Deploy","progress_bar":"3 of 5 - running","runner":"ci-3","test_count":"142","coverage":"84.2%","finished_at":{"epoch":1750000000,"format":"{time}","fallback":"now"},"primary_label":"Open pipeline","primary_url":"https://ci.example.com/healthcart-v2/2451","logs_url":"https://ci.example.com/healthcart-v2/2451/logs"}' \
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
        --template ci-cd@1.0.0 \
        --data '{"title":"CI passed: healthcart-v2 #2451","ref":"feature/checkout-fix","short_sha":"a1b9f2c","description":"Fix Stitch amount overflow","author":"Naledi","icon_url":"https://placehold.co/72x72/2eb67d/ffffff/png?text=PASS","icon_alt":"passed","steps_text":"Install -> Lint -> Test -> Build -> Deploy","progress_bar":"5 of 5 - deployed to staging","runner":"ci-3","test_count":"142","coverage":"84.2%","finished_at":{"epoch":1750000000,"format":"{time}","fallback":"now"},"primary_label":"Open staging","primary_url":"https://staging.example.com/healthcart-v2","logs_url":"https://ci.example.com/healthcart-v2/2451/logs"}'
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
        --template ci-cd@1.0.0 \
        --data '{"title":"CI failed: healthcart-v2 #2451","ref":"feature/checkout-fix","short_sha":"a1b9f2c","description":"Fix Stitch amount overflow","author":"Naledi","icon_url":"https://placehold.co/72x72/e01e5a/ffffff/png?text=FAIL","icon_alt":"failed","steps_text":"Install -> Lint -> Test -> Build -> Deploy","progress_bar":"2 of 5 - test stage failed","runner":"ci-3","test_count":"142","coverage":"84.2%","finished_at":{"epoch":1750000000,"format":"{time}","fallback":"now"},"primary_label":"View failure","primary_url":"https://ci.example.com/healthcart-v2/2451","logs_url":"https://ci.example.com/healthcart-v2/2451/logs"}'
  when: on_failure
```

## `needs:` vs `dependencies:` on the failure path

Use `dependencies:` (not `needs:`) on `notify:failure`.

When a job fails, any downstream job that declares `needs: [failed-job]` enters the **amber "blocked"** state and never runs. `dependencies:` only controls artifact download, not execution ordering, so the failure notification job still triggers on `when: on_failure` even when the upstream job has failed.

## Egress-restricted runners

For runners without direct internet access, pass standard proxy settings:

```yaml
notify:running:
  variables:
    HTTPS_PROXY: "http://proxy.internal:8080"
    NO_PROXY: "169.254.0.0/16,.internal,slack.com"
  ...
```

`NO_PROXY` should include `slack.com` only if your proxy terminates HTTPS for the Slack API; otherwise omit it. Include the AWS metadata range if your runners run on EC2. Any icon or image URLs come straight from your `--data` (the `image_url` fields), so host them wherever your Slack clients can reach them.

## ISO timestamp to Slack `<!date>` epoch

Slack's `<!date>` token requires a Unix epoch (seconds). slackwire's `date` placeholder kind renders one for you: a `date`-kind field takes an object `{ "epoch": <seconds>, "format": "<slack date format>", "fallback": "<plain text>" }`, and the engine emits `<!date^<epoch>^<format>|<fallback>>`. The `ci-cd` template's `finished_at` field is exactly this kind, so you never hand-write the `<!date>` token.

To turn a GitLab ISO timestamp (`$CI_PIPELINE_CREATED_AT`, format `2026-06-24T15:30:00Z`) into the epoch:

```bash
EPOCH=$(date -d "$CI_PIPELINE_CREATED_AT" +%s 2>/dev/null \
  || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CI_PIPELINE_CREATED_AT" +%s)
```

The first form works on glibc/Debian runners (`date -d`); the fallback works on macOS/BSD (`date -j -f`). Pass `$EPOCH` into the `date`-kind field of your `--data`:

```json
"finished_at": { "epoch": 1750000000, "format": "{date_short_pretty} at {time}", "fallback": "2026-06-24T15:30:00Z" }
```

Slack renders the token in the viewer's local timezone; the `fallback` string is shown by clients that do not support the `<!date>` construct. The epoch must be integer seconds (millisecond values are rejected).

## Dotenv handoff between jobs

The `notify.env` dotenv artifact carries the `SLACK_TS` from the `notify:running` job to the morph jobs. That handoff is what lets the same Slack message be updated rather than duplicated, so keep the artifact flowing (via `needs:` / `dependencies:`) to every job that morphs the card.

Do **not** add a `dedupeKey` (or any other extra key) to the `--data` JSON for the bundled templates. Each template schema marks every key required and sets `additionalProperties: false`, so an unknown field fails validation and exits 2.

Metadata-based idempotent re-find, re-locating a card from Slack when the `ts` is unavailable (a retry, or a separate release pipeline morphing a deploy notification), exists in `@slackwire/core` as `findOrCreate`. It stamps and reads a dedupe key in Slack message metadata (bot tokens via `conversations.history`, user tokens via `search.messages`). It is a library capability and is **not** exposed by the `slackwire` CLI verbs today; a CLI pipeline relies on the dotenv `ts` handoff above.

## npx usage (local development)

For local testing without the Docker image:

```bash
npx slackwire card \
  --template ci-cd@1.0.0 \
  --catalog ./templates \
  --channel C0EXAMPLE123 \
  --dry-run \
  --data '{"title":"CI running: healthcart-v2 #2451","ref":"feature/checkout-fix","short_sha":"a1b9f2c","description":"Fix Stitch amount overflow","author":"Naledi","icon_url":"https://placehold.co/72x72/ecb22e/ffffff/png?text=RUN","icon_alt":"running","steps_text":"Install -> Lint -> Test -> Build -> Deploy","progress_bar":"3 of 5 - running","runner":"ci-3","test_count":"142","coverage":"84.2%","finished_at":{"epoch":1750000000,"format":"{time}","fallback":"now"},"primary_label":"Open pipeline","primary_url":"https://ci.example.com/healthcart-v2/2451","logs_url":"https://ci.example.com/healthcart-v2/2451/logs"}'
```

`--dry-run` renders the block payload to stdout without posting, so no `SLACK_TOKEN` is required.
