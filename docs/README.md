# slackwire docs

Reference and integration guides for [slackwire](../README.md). Start with the [root README](../README.md) for install, verbs, authentication, and exit codes.

## Guides

- [gitlab-integration.md](gitlab-integration.md): the canonical CI pattern. Post a `running` card, hand its `ts` forward through a dotenv artifact, and morph it to `passed` / `failed` on completion. Covers the `needs:` vs `dependencies:` gotcha on the failure path, proxy and icon-host handling for egress-restricted runners, ISO-to-epoch conversion for `<!date>` tokens, and dedupe-key re-finds for cross-pipeline morphs.
- [parity-evals.md](parity-evals.md): the byte-parity eval harness that proves the `@slackwire/core` template engine renders output structurally identical to hand-authored reference cards. Covers fixture layout, normalization rules, how to add a new card pair, how to run the suite, and the gated live tier.

## Package READMEs

- [slackwire (CLI)](../packages/cli/README.md): the command-line tool.
- [@slackwire/core](../packages/core/README.md): the render engine and Slack client.
- [@slackwire/mcp](../packages/mcp/README.md): the MCP server over the core.
- [templates/README.md](../templates/README.md): the template catalog layout and included templates.
