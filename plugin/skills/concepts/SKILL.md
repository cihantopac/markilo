---

name: concepts
description: Markilo exploration — turn a brief into exactly three genuinely different, visually developed identity proposals (wordmark, compact icon, idea, strengths and weaknesses, light and dark previews) for the user to choose from. Use when the user wants logo concepts or design directions for a brand that already has research or a brief.
argument-hint: "[brand slug and any direction notes]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Three proposals

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts. Read `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md`.

1. `markilo brief show --brand <slug>` and `markilo profile show --brand <slug>`. If the brief is thin, run the
   research skill first or ask the user (at most three questions, plus the optional one about references). Refuse
   concept work for locked brands. `markilo cost --brand <slug>`: at `status: over`, ask before spending more.
2. Round number: 1, or the next one after a round the user rejected (`markilo status`). After two rounds the user
   rejected, ask for direction instead; a third round needs `--directed "<their words>"`.
3. Write the three directions yourself (stance, what leads, typeface class or lettering approach, the move you see in
   these letters, icon idea, colour — different in kind; at least one wordmark-led), then start three
   `markilo:concept-designer` agents in parallel, one per direction, in `explore <concept id>` mode with the round,
   the direction, the brief summary, what to avoid, existing interface colours, the user's references and their
   feedback on earlier rounds. Record their usage: `markilo cost --brand <slug> --phase explore --tokens <n> --minutes
   <m>`.
4. `markilo proposals --brand <slug>` and `Read` `proposals/round-<n>.png`. Send back once only a proposal that
   `missing` flags (a word still its typeface as set, no icon, no pitch) or that has a drafting error. No critic at
   this stage.
5. Open the gallery (gallery skill) and present the three: per proposal one sentence on the idea, one strength, one
   risk; ask the user to select, change, combine or reject all three. Do not develop anything before they choose.
