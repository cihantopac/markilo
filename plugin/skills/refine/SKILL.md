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
   A choice given in chat is recorded with `markilo concept update --brand <slug> --concept <id> --status shortlisted`,
   which keeps the chosen drawing for the later side-by-side. Never develop a concept the user dropped. `markilo cost --brand <slug>` before spending.
2. If the user selected without changes and `markilo proposals --brand <slug> --concepts <id>` lists nothing missing
   and `verify` has no failing check, ask whether to finish as chosen; on yes, skip to step 5 without a designer or
   critic. Read the choice back first (`<letter> · <title> · <id>`, from `proposals.order`). When they want to continue
   from another concept's drawing, `markilo concept adopt --brand <slug> --concept <id> --from <other> --files
   symbol,wordmark` copies it and re-pins the chosen state. To undo a rejected pass, `markilo concept revert --brand <slug> --concept <id> --to chosen --note "<their words>"` restores `chosen/` and unregisters the small version and lockups made since (kept in `rejected/`); `concept update --small none` drops a small version alone. A small, precise change they describe is done directly with the toolchain (`construct`, `lockup`,
   `verify`). Otherwise: one `markilo:concept-designer` agent in `develop <concept id>` mode with the user's changes, pinned spots, or the
   combination (it creates a new concept for a combination). Record `--phase refine` with its usage.
   **Before any develop pass, ask the scope as one multiple-choice question** (record it with `markilo answers`):
   (a) craft only: optics, spacing, small sizes, the form stays exactly as chosen (recommended); (b) a small revision
   of named parts (which); (c) the form may change. When the user cannot say what is missing ("I can't tell without
   seeing"), do not ask a diagnosis question again: offer three visual probes (`render --compare` of three small
   variants) and let them point. Traits the user said they like are recorded in `answers` as `protect: <trait>` and
   passed to the designer and the critic as protected. A reading the user forbade ("no letter as the icon") is passed to
   the critic; if the critic's first read matches it, say so when you present the result.
   When the change can be read two ways ("read clearly" could mean pebbles or equal waves), ask one multiple-choice
   question first (keep the form / equal sizes / more space) or run a probe; never spend a develop pass on a guess.
   A resumed agent's usage notification is cumulative: record the part as the difference from the previous one.
3. `markilo verify --brand <slug> --concept <id>` until nothing fails; `Read` the review, wordmark and context sheets. When the `letters` check says it did not run (a freeform or hand-edited wordmark), read the 32 px wordmark render letter by letter and write down what you read before the brand name; a split or misread letter is fixed before the critic. When `balance` says the mark leans, `markilo center in.svg -o out.svg` shifts it to the optical centre (never run on a locked brand's masters).
   A transformation the user asked for is shown to them before you send the designer back on taste; "character lost"
   applies only to changes nobody asked for.
4. After a development pass only, one `markilo:design-critic` agent in `final <concept id>` mode. Each fix comes labelled `craft`
   (invisible at a glance) or `silhouette` (changes what the mark is). Apply the `craft` fixes once, then verify again;
   do not critique an unchanged image twice. Show each `silhouette` fix as a before/after probe and apply it only on the
   user's yes. `proposals` measures the form against the chosen drawing (`formChange`); below 0.85 it warns: show
   `chosen-vs-now` and ask before going on. This is advice, never a gate: the user decides. Record
   `--phase verify` from the agent's task notification (`subagent_tokens`, `duration_ms` / 60000). When Claude Code
   shows a session total, record it at the end of each phase: `markilo cost --brand <slug> --phase <p> --session-usd
   <total>` (it covers the agents; Markilo subtracts what they recorded). Without one (an app with no session total: use its usage view or tool if it has one), the figure is
   subagents only — the session itself is not counted. An agent interrupted by a usage limit and resumed is recorded per
   part under one name: `markilo cost --brand <slug> --phase <p> --tokens <n> --minutes <m> --agent <name> --part <n>`.
5. Show the user the refined identity (`markilo proposals --brand <slug> --concepts <id>`, the gallery), the measured
   checks, the originality verdict and the critic's notes labelled as judgment. Further changes go back to step 2.
6. When the user approves: `markilo finalize --brand <slug> --concept <id> --user-choice "<their words>" --tagline "<tagline>"`
   (`--accept-risk` only on their explicit yes to an `insufficient-evidence` or `needs-review` verdict; add
   `--wordmark-only` when they want the word alone: no symbol lockups, the symbol only makes the app icon and favicon), append the
   decision to `decisions.md`, then offer the export.
