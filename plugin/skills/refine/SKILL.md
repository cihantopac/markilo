---

name: refine
description: Markilo development — turn the concept the user chose (or a combination of two) into a professional identity (letterforms, spacing, optical balance, icon, small version, lockups, colour), verify it, get one independent critique, and finalize it on the user's approval. Use when the user picks a concept or asks for changes to one.
argument-hint: "[brand slug, concept id and the feedback]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Develop, verify and finalize

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts. Craft rules: `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md`, `${CLAUDE_PLUGIN_ROOT}/skills/design/references/svg-authoring.md`.

1. Collect the user's decision (`markilo feedback --brand <slug>`, or their words) and log it with `markilo answers`.
   Never develop a concept the user dropped. `markilo cost --brand <slug>` before spending.
2. If the user selected without changes and `markilo proposals --brand <slug> --concepts <id>` lists nothing missing
   and `verify` has no failing check, ask whether to finish as chosen; on yes, skip to step 5 without a designer or
   critic. A small, precise change they describe is done directly with the toolchain (`construct`, `lockup`,
   `verify`). Otherwise: one `markilo:concept-designer` agent in `develop <concept id>` mode with the user's changes, pinned spots, or the
   combination (it creates a new concept for a combination). Record `--phase refine` with its usage.
3. `markilo verify --brand <slug> --concept <id>` until nothing fails; `Read` the review, wordmark and context sheets.
4. After a development pass only, one `markilo:design-critic` agent in `final <concept id>` mode. Apply the fixes that improve the work without
   changing what the user chose — once, then verify again; do not critique an unchanged image twice. Record
   `--phase verify`.
5. Show the user the refined identity (`markilo proposals --brand <slug> --concepts <id>`, the gallery), the measured
   checks, the originality verdict and the critic's notes labelled as judgment. Further changes go back to step 2.
6. When the user approves: `markilo finalize --brand <slug> --concept <id> --user-choice "<their words>" --tagline "<tagline>"`
   (`--accept-risk` only on their explicit yes to an `insufficient-evidence` or `needs-review` verdict), append the
   decision to `decisions.md`, then offer the export.
