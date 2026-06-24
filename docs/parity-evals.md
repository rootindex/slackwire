# Parity Evals

The parity eval harness proves that the `@slackwire/core` template engine produces output that is structurally identical to the hand-authored, raw-API house-style Slack cards. It is the regression net that keeps the engine honest as it evolves.

## 1. What parity means here

Parity is a comparison between two payloads for the same card and state:

- **before**: a hand-authored raw Block Kit fixture. The canonical source of truth is the house-style exemplar JSON in `HANDOVER.md` §11. A human transcribes that exemplar into a `.raw.json` fixture. This is the "known good" Slack payload.
- **after**: the engine's `render()` output for the same card, state, payload, and render options.

The harness asserts that **after** equals **before** once both have been normalized (see section 3). Comparison is structural and order-independent, not byte-for-byte string equality.

The critical non-circularity rule: **raw fixtures are NEVER generated from engine output.** The raw fixture is authored by hand from §11 and is the fixed target. The engine adapts to the fixture, never the other way around. The harness has no "bless" / "update" / "write" path for raw fixtures (contrast with the golden suite's `UPDATE_GOLDEN=1`); there is deliberately no `UPDATE_PARITY` mechanism. If the engine drifts, the test fails and a human closes the gap by changing the template, not the fixture.

## 2. Fixture layout

Raw fixtures live co-located with templates, mirroring the existing `__golden__/` convention. Per card, per version, per state there are three files:

```
templates/<card>/<version>/__parity__/<state>.raw.json
templates/<card>/<version>/__parity__/<state>.data.json
templates/<card>/<version>/__parity__/<state>.opts.json
```

Example:

```
templates/ci-cd/1.0.0/__parity__/passed.raw.json
templates/ci-cd/1.0.0/__parity__/passed.data.json
templates/ci-cd/1.0.0/__parity__/passed.opts.json
```

What each file holds:

- **`<state>.raw.json`** — the authored "before" Slack payload, shaped `{ "blocks": [...], "attachments": [...], "text": "..." }`. For house-style colored cards, `blocks` is empty (`[]`) and the real block tree lives under `attachments[0].blocks`, with the accent color on `attachments[0].color`. `text` is the plain fallback string.
- **`<state>.data.json`** — the engine input payload (the data object passed to `render()`). Values may be plain strings or typed objects: the ci-cd `finished_at` field is a typed `date` kind, shaped `{ "epoch": 1750000000, "format": "{time}", "fallback": "now" }`.
- **`<state>.opts.json`** — the render options, shaped `{ "themeToken": "#rrggbb", "attribution": true }`. These cannot be inferred from the payload alone, so they are stored explicitly. When the file is absent, the harness defaults to `{}`, which means no `themeToken` and `attribution: false`.

House-style colored cards REQUIRE `attribution: true` plus a per-state `themeToken`. The `themeToken` is the accent color that gets moved onto the colored attachment, and it varies by state (for example the incident card uses `#e01e5a` triggered, `#ecb22e` mitigating, `#2eb67d` resolved).

Discovery is automatic via `discoverParityCases(catalogPath)` in `packages/core/src/parity-cases.ts`. It returns `ParityCase[]` where each case is:

```ts
interface ParityCase {
  card: string;
  version: string;
  state: string;
  rawPath: string;
  dataPath: string;
  optsPath: string | null; // null when no <state>.opts.json exists
}
```

Discovery walks `templates/`, skips the `partials/` directory and any `__golden__/` directory, and only collects fixtures inside directories literally named `__parity__`. It pairs each `.raw.json` with its `.data.json` and throws a loud error if either half of the pair is missing (an orphan raw without data, or data without raw).

## 3. Normalization rules

Normalization neutralizes volatile fields that legitimately differ between a hand-authored fixture and a freshly rendered payload, so the comparison only fails on real structural divergence. The implementation lives in `packages/core/src/parity-normalize.ts`.

What gets neutralized:

- **`block_id`** — dropped from every object.
- **`action_id`** — dropped from every object.
- **`ts`** — any string `ts` value is replaced with the sentinel `__TS__`.
- **The EPOCH inside date tokens** — in any string, `<!date^<digits>^fmt|fallback>` has its numeric epoch replaced with `__EPOCH__`, preserving the format and fallback (matched by `/<!date\^(\d+)\^([^|>]+)\|([^>]+)>/g`).
- **Archive permalinks** — any `https://slack.com/archives/<id>/p<digits>` URL is replaced with the sentinel `__PERMALINK__` (matched by `/https:\/\/slack\.com\/archives\/[A-Z0-9]+\/p\d+/g`).

Comparison is **order-independent deep-equal**: two objects match if they have the same key set and recursively-equal values regardless of key order; arrays must have equal length and equal elements at each index.

Exported functions and signatures:

- `normalize(value: unknown): unknown` — recursively strips `block_id`/`action_id`, replaces string `ts` with `__TS__`, and applies the date-epoch and permalink string substitutions. Returns the neutralized structure.
- `parityDiff(expected: unknown, actual: unknown): string | null` — normalizes both inputs, compares them order-independently, and returns `null` when they match or a single human-readable string describing the first divergence (with a JSON path and the expected vs actual values) when they do not.

A test asserting parity reads the raw fixture, renders the engine output, calls `parityDiff(raw, result)`, and expects `null`.

## 4. How to add a new card parity pair

The harness auto-discovers fixtures, so adding a card requires **no code change** to the harness:

1. Confirm the card's house-style exemplar in `HANDOVER.md` §11. That is your "before" source of truth.
2. For each state, author the three files under `templates/<card>/<version>/__parity__/`:
   - `<state>.raw.json` — transcribe the §11 exemplar payload exactly (blocks, attachments, text). For colored cards put the block tree under `attachments[0].blocks` with `attachments[0].color` set and top-level `blocks: []`.
   - `<state>.data.json` — the input payload the engine will render.
   - `<state>.opts.json` — `{ "themeToken": "#rrggbb", "attribution": true }` for house-style colored cards, or omit the file to default to `attribution: false` and no theme token.
3. Run the parity suite (section 5).
4. If the engine output diverges, `parityDiff` prints the first divergence. **Close the gap by adjusting the template** (skeleton, partials, schema), NOT by editing the raw fixture. The raw fixture is the target; do not move the goalposts.
5. Repeat until `parityDiff` returns `null` for every state.

Optionally add a dedicated focused test file (the anchors do this: `parity-cicd.test.ts`, `parity-incident.test.ts`) to assert state-specific behavior such as the typed date token or the per-state accent color. The generic table-driven harness in `parity.test.ts` will already cover every discovered case.

## 5. How to run

Run the whole core test suite (parity tests included):

```sh
pnpm --filter @slackwire/core test
```

Run a single parity file:

```sh
pnpm --filter @slackwire/core test parity.test.ts
pnpm --filter @slackwire/core test parity-cicd.test.ts
pnpm --filter @slackwire/core test parity-incident.test.ts
pnpm --filter @slackwire/core test parity-live.test.ts
```

Goldens are a separate mechanism. Golden snapshots are re-blessed with `UPDATE_GOLDEN=1`. The parity harness has no equivalent flag by design (see section 1): there is no `UPDATE_PARITY`.

## 6. Live tier

The live tier (`packages/core/src/parity-live.ts` and `parity-live.test.ts`) optionally posts to a real Slack workspace and compares what Slack actually stored. It is **skipped by default with zero network access**.

Gating, in `parity-live.ts`:

- `shouldRunParityLive()` returns `true` only when `SLACK_PARITY_LIVE=1` AND a token resolves.
- `resolveParityToken()` resolves a token in order: `SLACK_TOKEN`, then `SLACK_TOKEN_BASE64` (base64-decoded), then the file at `SLACK_TOKEN_FILE` (default `./.slack_token`). It throws if none resolve.

The true-live `describe` block uses `describe.skipIf(!liveCondition)`, so without both the flag and a resolvable token it never runs and never touches the network. The mock-driven tests in the same file always run and exercise the post / history / compare / delete flow against a fake client.

When enabled, the flow is: post the raw fixture, post the engine render, fetch both back via `history()`, compare the stored payloads with `parityDiff`, then clean up both messages via `delete`. The test channel is `C0EXAMPLE123`.

`SlackClient.history()` was extended to surface `blocks` and `attachments` (previously it returned only `{ ts, text?, metadata? }`), which is what makes block-level live comparison possible.

NEVER print a token. Do not log resolved token values anywhere.

## 7. Engine fixes this plan delivered

Three engine fixes were required to make true parity possible:

- **Bug #1 — typed date schema.** `buildJsonSchema` in `render.ts` previously forced every schema field to `{ type: "string" }`, which broke validation of the object-valued `date` kind under Ajv `coerceTypes`. It now maps each placeholder kind to a correct subschema: the `date` kind maps to an object subschema (`{ epoch: number, format: string, fallback: string }`, `additionalProperties: false`), all other kinds map to `{ type: "string" }`. Typed dates now validate and render to a `<!date^...>` token.
- **Bug #2 — attachment-derived fallback.** `deriveFallback(blocks, attachments?)` in `fallback.ts` now derives fallback text from `attachments[].blocks` when top-level `blocks` is empty. Colored / attribution cards move all blocks into the attachment, so before this fix they produced empty fallback text; now they produce a non-empty fallback matching the raw fixture.
- **Bug #4 — assemble before accent, unknown `$use` throws.** The `render.ts` pipeline was reordered so `assemble()` runs on the interpolated blocks BEFORE `applyAccent` moves them into the colored attachment. Previously, with `attribution: true`, accent emptied the top-level blocks before partials could resolve, leaving residual `{"$use":...}` markers. Now partials resolve fully into house-style blocks regardless of attribution. Additionally, an unknown `$use` partial name now throws a `StructuralError` instead of silently passing through.

## 8. Known limitations

These are documented gaps, intentionally not fixed in this plan:

- **`validateStructural` does not walk `attachments[].blocks`.** It validates top-level `blocks` (block count ≤ 50, image `alt_text`, mrkdwn token balance) and only shallow-walks attachments. For house-style colored cards, where the entire block tree lives inside the attachment, the block tree is NOT length- or `alt_text`-validated by the engine. Fixtures must respect Slack limits manually.
- **`buildJsonSchema` marks all schema keys required.** There is no optional-field support yet; every key in a template schema is added to `required`. This is why the incident card has no icon accessory: an optional icon cannot currently be expressed in the schema.
