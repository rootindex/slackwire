# Template catalog

The `templates/` directory is the default catalog loaded by `@slack-cards/core` and `@slack-cards/cli`. Each template is a self-contained directory versioned by semver. Partials are shared block fragments referenced from skeletons.

## Catalog structure

```
templates/
  <template-name>/
    <version>/
      meta.json      # name, version, description, overflow, states[]
      schema.json    # field -> PlaceholderKind map
      skeleton.json  # Block Kit JSON with {{kind:key}} tokens and $use directives
      __golden__/    # golden-file snapshots (test-only, not loaded at runtime)
  partials/
    <partial-name>.json   # reusable block arrays
```

The loader (`loadTemplate`) requires all three of `meta.json`, `schema.json`, and `skeleton.json` to be present. Missing or invalid files throw a `StructuralError`.

## Skeleton token syntax

Tokens follow the `{{kind:key}}` pattern. Bare `{{key}}` tokens (without a kind prefix) are rejected with a `SchemaError` at render time.

Partials are embedded with a `{ "$use": "<partial-name>" }` directive inside the `blocks` array. The `assemble` step replaces each directive with the contents of the matching file in `templates/partials/`.

## Included templates

### `incident` (1.0.0)

On-call incident card with morph states: `TRIGGERED`, `MITIGATING`, `RESOLVED`.

Schema fields:

| Field | Kind |
|---|---|
| `title` | `text_plain` |
| `severity` | `text_plain` |
| `accent` | `color` |
| `incident_id` | `text_plain` |
| `service` | `text_plain` |
| `runbook_url` | `link_url` |
| `assigned_to` | `text_plain` |

### `ci-cd` (1.0.0)

CI/CD pipeline live card with morph states: `running`, `passed`, `failed`.

Schema fields:

| Field | Kind |
|---|---|
| `status` | `text_plain` |
| `accent` | `color` |
| `short_sha` | `text_plain` |
| `ref` | `text_plain` |
| `pipeline_url` | `link_url` |
| `author` | `text_mrkdwn` |

## Included partials

| File | Contents |
|---|---|
| `header.json` | Single `header` block with "Pipeline Status" |
| `footer.json` | Context block for attribution/timestamps |
| `button-row.json` | Actions block with a single button |
| `field-grid.json` | Section block with a two-column field grid |
| `icon-section.json` | Section block with an accessory image |

## Attribution footer

The attribution footer is **off by default**. It is rendered only when `attribution: true` is passed in `RenderOptions` (or `SLACK_ATTRIBUTION=true` in the CLI/config). The footer is appended by the `applyAccent` step during interpolation.

## Adding a new template

1. Create `templates/<name>/<version>/`.
2. Write `meta.json`, `schema.json`, and `skeleton.json`.
3. Add `__golden__/` snapshots for each morph state by running the golden test suite.
4. Reference the template via `{ catalogPath: './templates', name: '<name>', version: '<version>' }`.

## Limits and gotchas

- **50 blocks per message** (Slack hard limit). The render pipeline throws `LimitError` if exceeded.
- **3000 characters** max for a `section` text field; 150 for `header`; 75 for button labels.
- **~38 000 characters** soft total payload limit checked against the JSON-serialised block array.
- Skeleton tokens that reference a key absent from the payload render as empty string (no error).
- The `__golden__` directory is ignored by the loader but read by the golden test suite. Do not delete it.
- Partial names must match the filename without `.json` extension. Unresolved `$use` directives throw `StructuralError`.
