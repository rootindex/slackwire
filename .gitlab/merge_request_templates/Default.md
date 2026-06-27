<!--
Thanks for contributing to slackwire. Fill in the sections below and tick the
checklist. A green pipeline is required to merge.
-->

## What and why

<!-- Summarize the change and the motivation. What does this MR do, and why? -->

## Linked issue

<!-- We work ticket-first. Reference the issue this closes so merging closes it
automatically. -->

Closes #

## How it was tested

<!-- Commands you ran, new tests added, manual verification. -->

```sh
corepack pnpm@9.15.9 -r lint
corepack pnpm@9.15.9 -r build
corepack pnpm@9.15.9 -r test
```

## Checklist

- [ ] This MR is linked to an issue with `Closes #` above.
- [ ] Branch is named `<issue-number>-short-slug`.
- [ ] Commits follow Conventional Commits (`type(scope): summary`).
- [ ] `corepack pnpm@9.15.9 -r lint` passes.
- [ ] `corepack pnpm@9.15.9 -r build` passes.
- [ ] `corepack pnpm@9.15.9 -r test` passes (and coverage gate where relevant).
- [ ] `pnpm-lock.yaml` is unchanged, or the change is intentional and explained.
- [ ] Docs updated (README, `docs/`, CHANGELOG) if behavior or usage changed.
- [ ] No secrets, tokens, or personal email addresses are committed.
- [ ] The pipeline is green.

/label ~mr
