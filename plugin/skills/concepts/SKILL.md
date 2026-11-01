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
3. One `markilo:concept-designer` agent in `explore` mode: brand slug, round, brief summary and stance, what to avoid,
   existing interface colours, the user's references (paths and what they said), and the user's feedback on earlier
   rounds. It creates three proposals and renders `markilo proposals --brand <slug>`. Record its usage:
   `markilo cost --brand <slug> --phase explore --tokens <n> --minutes <m>`.
4. `Read` `proposals/round-<n>.png`. If two proposals are the same idea or one has a drafting error, send only that
   one back once with the fix. No critic at this stage.
5. Open the gallery (gallery skill) and present the three: per proposal one sentence on the idea, one strength, one
   risk; ask the user to select, change, combine or reject all three. Do not develop anything before they choose.
