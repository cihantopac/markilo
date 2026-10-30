---

name: concepts
description: Markilo creative exploration and concept design — turn a brief into 3–5 genuinely different creative directions and original, verified SVG logo concepts (symbol + outlined wordmark). Use when the user wants logo concepts or design directions for a brand that already has research or a brief.
argument-hint: "[brand slug and any direction notes]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Explore and design concepts

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts. Read `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md` and `${CLAUDE_PLUGIN_ROOT}/skills/design/references/svg-authoring.md`.

1. `markilo brief show --brand <slug>` and `markilo profile show --brand <slug>`. If the brief is thin, run the
   research skill first or ask the user. Refuse concept work for locked brands.
2. Write 3–5 directions (idea sentence, metaphor, form language, typeface from `markilo fonts`, palette, why it fits,
   risks). Share them briefly; proceed with the ones the user prefers (or all, if they said "just go").
3. Sketch first: for each direction, a `markilo:concept-designer` agent in `sketch` mode (brand slug, concept id,
   direction text, brief summary, palette, typeface), in parallel. Then one `markilo:design-critic` agent does a
   **sketch review** of every board and records `--sketch-pick <id|none>`. Directions with `none` get one more sketch
   pass with the critic's suggested move, or are dropped. Then a concept-designer in `develop <sketch id>` mode
   finishes each picked sketch.
4. After the agents finish: `markilo diversity --brand <slug>`. Merge or replace directions that are too similar.
5. Ask the `markilo:design-critic` agent to review all concepts (it reads the review sheets and records judgment).
   Apply the quality gate: brand-fit, distinctiveness and memorability each ≥ 6, average ≥ 6.5 and the critic's
   "would a senior designer present this?" is yes (`markilo concept list` shows `gate` per concept); else back to a
   concept-designer with the critique and a request
   for a different move (max 2 rounds). What still misses is set to `rejected` so the gallery hides it; if fewer than
   two pass, tell the user plainly and propose new directions instead of showing weak work.
6. `markilo gallery` and present: per concept, two lines (idea + measured strengths/risks) and the gallery path.
   Ask the user which to refine.
