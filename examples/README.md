# Example template catalog

`examples/` is a second, richer template catalog that ships alongside the default [`templates/`](../templates/README.md). These are fuller, real-world cards (Sentry alerts, Kubernetes rollouts, Jira tickets, CVE advisories, and more) you can copy into your own catalog or render directly.

It is **not** loaded by default. Point the CLI at it with `--catalog examples` (or set `SLACK_CATALOG=examples`):

```sh
node packages/cli/dist/bundle.cjs card \
  --template cicd-live@1.0.0 \
  --catalog examples \
  --data '{"status":"PASSED","accent":"#2eb67d","repo":"healthcart-v2","branch":"feature/checkout-fix","commit":"a1b9f2c","triggered_by":"Naledi","stage_checklist":"Install Lint Test Build Deploy","progress_bar":"#####","progress_text":"5 of 5","runner":"ci-3","pipeline_url":"https://ci.example.com/healthcart-v2/2451","logs_url":"https://ci.example.com/healthcart-v2/2451/logs"}' \
  --dry-run
```

Each template is a versioned directory holding `meta.json`, `schema.json`, and `skeleton.json`, the same shape as the default catalog. These examples are self-contained: none reference shared partials, so the catalog needs no `partials/` directory.

As with every slackwire template, the payload is validated against a JSON Schema built from `schema.json` with **every key required** and `additionalProperties: false`. So the `--data` object must supply each listed field exactly, with no extras, or the render exits 2. `color` fields set the accent (combine with `--theme` / `SLACK_ATTRIBUTION=true`); `date`-style timestamps in these examples are passed as plain `text_plain` epoch/fallback fields and composed in the skeleton.

## Templates

### `cicd-live@1.0.0`

Rich status-driven CI/CD pipeline live card. Morph states: `running`, `passed`, `failed`.

Required fields (12): `status` (text_plain), `accent` (color), `repo` (text_plain), `branch` (text_plain), `commit` (text_plain), `triggered_by` (text_mrkdwn), `stage_checklist` (text_mrkdwn), `progress_bar` (text_plain), `progress_text` (text_plain), `runner` (text_plain), `pipeline_url` (link_url), `logs_url` (link_url).

### `cve-advisory@1.0.0`

Security CVE advisory card with CVSS gauge, scoring fields, and remediation links. State: `disclosed`.

Required fields (13): `cve_id` (text_plain), `accent` (color), `package` (text_plain), `affected_versions` (text_plain), `fixed_version` (text_plain), `cvss_score` (text_plain), `severity` (text_plain), `cwe` (text_plain), `gauge` (text_plain), `summary` (text_mrkdwn), `source` (text_mrkdwn), `advisory_url` (link_url), `patch_url` (link_url).

### `deploy-approval@1.0.0`

Deploy approval card: release summary, change list, deadline, and approve/reject/diff actions. State: `pending`.

Required fields (14): `title` (text_plain), `accent` (color), `service` (text_plain), `version` (text_plain), `environment` (text_plain), `requested_by` (user_mention), `change_count` (text_plain), `window` (text_plain), `changes` (text_mrkdwn), `deadline` (code), `deadline_icon` (image_url), `approve_url` (link_url), `reject_url` (link_url), `diff_url` (link_url).

### `incident-live@1.0.0`

Rich on-call incident live card. Morph states: `TRIGGERED`, `MITIGATING`, `RESOLVED`.

Required fields (14): `severity_emoji` (text_plain), `title` (text_plain), `accent` (color), `incident_id` (text_plain), `service` (text_plain), `severity` (text_plain), `status` (text_plain), `on_call` (text_mrkdwn), `started` (text_plain), `impact` (text_mrkdwn), `source` (text_plain), `runbook_url` (link_url), `dashboard_url` (link_url), `statuspage_url` (link_url).

### `jira-ticket@1.0.0`

Jira ticket card with key/summary/status fields, assignee, created time, and Jira action buttons. State: `open`.

Required fields (15): `title` (text_plain), `accent` (color), `jira_key` (text_plain), `summary` (text_mrkdwn), `status` (text_plain), `priority` (text_plain), `story_points` (text_plain), `assignee` (text_plain), `icon_url` (image_url), `created_epoch` (text_plain), `created_fallback` (text_plain), `reporter` (text_mrkdwn), `view_url` (link_url), `transition_url` (link_url), `transition_label` (text_plain).

### `k8s-rollout@1.0.0`

Kubernetes canary rollout live card. Morph states: `canary-10`, `canary-50`, `promoted-100`.

Required fields (14): `title` (text_plain), `status` (text_plain), `accent` (color), `cluster` (text_plain), `namespace` (text_plain), `deployment` (text_plain), `image_tag` (text_plain), `replicas` (text_plain), `weight` (text_plain), `progress_bar` (text_mrkdwn), `healthy_pods` (text_plain), `total_pods` (text_plain), `grafana_url` (link_url), `argo_url` (link_url).

### `pr-review@1.0.0`

GitHub pull request review card with fields, a checks checklist, reviewer context, and review action buttons. State: `open`.

Required fields (20): `accent` (color), `header_title` (text_plain), `repo` (text_plain), `pr_number` (text_plain), `pr_title` (code), `author` (text_mrkdwn), `additions` (text_plain), `deletions` (text_plain), `branch` (text_plain), `check_lint` (text_mrkdwn), `check_test` (text_mrkdwn), `check_build` (text_mrkdwn), `check_coverage` (text_mrkdwn), `reviewer_avatar` (image_url), `reviewer_avatar_alt` (text_plain), `reviewer` (text_mrkdwn), `opened_at` (code), `review_url` (link_url), `files_url` (link_url), `ci_url` (link_url).

### `release-notes@1.0.0`

Release-notes announcement card with highlights, stats, and action buttons. No morph states.

Required fields (12): `version` (text_plain), `name` (text_plain), `accent` (color), `highlights` (text_mrkdwn), `released` (text_plain), `commits` (text_plain), `contributors` (text_plain), `downloads` (text_plain), `icon_url` (image_url), `changelog_url` (link_url), `download_url` (link_url), `docs_url` (link_url).

### `sentry-error@1.0.0`

Sentry error alert card with stack trace, metadata grid, and triage actions. State: `unresolved`.

Required fields (13): `accent` (color), `error_type` (text_plain), `error_message` (text_mrkdwn), `project` (text_plain), `environment` (text_plain), `events_count` (text_plain), `users_affected` (text_plain), `level` (text_plain), `first_seen` (text_plain), `stack_trace` (code_block), `culprit` (text_mrkdwn), `sentry_url` (link_url), `assign_url` (link_url).

### `slo-budget@1.0.0`

SLO / error-budget burn card with budget bar, status fields, and dashboard actions. Morph states: `healthy`, `burning`, `exhausted`.

Required fields (14): `title` (text_plain), `accent` (color), `service` (text_plain), `slo_target` (text_plain), `current_sli` (text_plain), `window` (text_plain), `burn_rate` (text_plain), `status` (text_plain), `budget_bar` (text_plain), `budget_consumed` (text_plain), `budget_remaining` (text_mrkdwn), `alert_policy` (text_mrkdwn), `dashboard_url` (link_url), `alerts_url` (link_url).
