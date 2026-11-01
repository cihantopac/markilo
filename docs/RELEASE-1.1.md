# Markilo 1.1.0 — creative quality rebuild (progress record)

Goal: three visually developed, genuinely different proposals the user chooses from; then a professionally finished
identity. Less process, fewer model calls, lower cost. Not released until the maintainer approves the creative results.

## Diagnosis (from the 1.0 instructions and the 1.0 evaluation: 0 of 81 judged concepts presentable)

| Cause in 1.0                                                                                      | Effect seen by the judges                        | 1.1 change                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| "Do not hand-type path coordinates" — every mark assembled from primitives in construct specs     | primitive geometry, UI icons                     | freeform SVG and Bézier paths first-class; construct is an optional tool             |
| Wordmark recipe: "a good typeface with one or two letters changed"                                | "a stock grotesque with one changed letter"      | the whole word is designed: face for character, whole-word treatment, custom letters |
| Ideas and sketches judged by "what a stranger sees at 32 px"                                      | designs started from favicon-sized pictograms    | design at display size; 16 px is a check, not the starting point                     |
| Long rule lists and score caps; critic gate in front of the user                                  | designers avoided rejection instead of designing | short positive guidance; the user chooses; critic is advice at the end only          |
| Ideas longlist → idea critic → parallel sketchers → sketch critic → develop → gate → second looks | ~$8.40 and ~25–30 min per run, nothing shown     | one designer run → three proposals → user → one develop run → one critique           |

## What changed (implementation)

- Skills and agents rewritten: `design`, `concepts`, `refine`, `gallery`, `research`; `concept-designer` (`explore`,
  `develop`), `design-critic` (`final`, optional `compare`); `design-principles.md` rewritten; `construction.md` and
  `svg-authoring.md` made tool references; `agent-setup` guide for other agents follows the same workflow.
- `concept new --round n`: at most three proposals per round, no skipped rounds, a round beyond two needs
  `--directed "<user's words>"`.
- `concept update --idea --strengths --weaknesses`: the pitch shown with each proposal.
- `markilo proposals`: per-concept preview (identity on its paper and reversed, icon as app tile, avatar, 32/16 px)
  and the round side by side.
- Gallery: rounds grouped, Select / Change / Drop, "combine with another", "Reject all three" with a note; no concept is
  hidden because of a critic score. `feedback --apply` records round rejections.
- `finalize` requires `--user-choice`: a critic's pass alone never finalizes.
- `markilo cost`: per-phase tokens, minutes and USD (measured or estimated at $0.60/M tokens, the rate measured on
  1.0's real-project runs) against a budget (default $6); `status: over` stops paid work.
- `reference add --category inspiration|dislike|existing`: the user's own references, compared for originality,
  never shown as competitors.
- `status` stages: review (proposals waiting for the user), refine, next round, ask for direction.
- Bench: `run … --stage concepts` stops after one round of proposals (validation without a broad campaign).

## Fonts

The 24 bundled families were reviewed. About a third are neutral interface sans (Inter, Manrope, DM Sans, Plus Jakarta
Sans, Atkinson Hyperlegible, Schibsted, Archivo) — good for UI, rarely the right logo face; the characterful sans,
the seven serifs and the two monos cover most stances. The fontsource subsets carry no stylistic alternates. No font
is added until a proposal shows a real gap that custom lettering cannot fill.

## Validation log

| Date       | Product  | Round                                                                                            | Result                                                                                                                                                                                                                                                                                                                 | Cost (measured) | Minutes | Owner's verdict |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- | --------------- |
| 2026-11-01 | Relivaro | 1 (one designer for all three)                                                                   | 3 proposals; 2 words untouched typefaces (likeness 0.99), 1 a stock face with a square i-dot (0.985); icons: stacked bars, "li", underlined R. Not shown as final: the process was corrected first                                                                                                                     | $1.61           | 4.9     | —               |
| 2026-11-01 | Relivaro | 1, rerun (directions by the orchestrator, one designer each)                                     | 3 proposals: a redrawn lowercase word (typeset 0.63), a plumb-bob symbol with wedge-cut letters (0.91), serif capitals with straightened R legs (0.948)                                                                                                                                                                | $3.07           | 7.3     | awaiting        |
| 2026-11-01 | Relivaro | develop B (Ledger), owner's choice                                                               | consistent custom grotesque (typeset 0.56), flat terminals throughout, lockups and small icon; verify 36/0/0. Critic (advice): distinctiveness 4, memorability 4 — quiet, icon reads as 'r_' in a tile. The icon carried its own tile (tile inside a tile): now detected by `proposals` and ruled out for the designer | $1.73           | 28      | awaiting        |
| 2026-11-01 | Relivaro | refine (owner: free-standing icon from the arm gesture, one signature detail)                    | icon is the word's flat-cut r alone (no tile); a thin baseline bar joins a and r; verify 36/0/0, nothing missing. Critic (advice, one look): distinctiveness 5 — a bare r is a common move                                                                                                                             | $1.00           | 29      | awaiting        |
| 2026-11-01 | Relivaro | 1, same prompt, designer on Opus (owner-approved trial)                                          | 3 proposals, all words redrawn: serif capitals with a shared V–A stroke (typeset 0.40), engineered lowercase sans (0.58), softened humanist with a pebble-stack symbol (0.79); icons remain the weakest part (a plain R, an 'r.' and a stack that can read as a person icon)                                           | $5.81           | 12.6    | awaiting        |
| 2026-11-01 | Relivaro | develop A (Cairn), owner's choice; Sonnet designer                                               | word kept (typeset 0.77); the stones were flattened into tilted pills to avoid a person-icon reading and now read as a menu/pill stack (critic, advice: distinctiveness 5). Develop on Sonnet flattened the chosen idea twice (Ledger, Cairn)                                                                          | $1.76           | 28.8    | awaiting        |
| 2026-11-01 | Relivaro | icon-only refine on Opus (owner-approved), with the round-1 Ledger icon as the owner's reference | three options: refined round stones; the same cairn with the top stone drawn only as an outline (the unverified step, from Ledger's outlined bar) — recommended; a two-stone small version. Word untouched; nothing missing. Plugin ledger reached $6.29 of $6 and asked for a budget raise                            | $1.59           | 6.9     | awaiting        |
| 2026-11-01 | Relivaro | finalize + export (owner: Cairn, icon B)                                                         | approved by the owner; 81 files (logos, web, social, tokens, guidelines); originality: low visual similarity (max 0.38 of 5 competitors), no registry search — risk accepted by the owner. Total measured for Relivaro across all runs ≈ $15                                                                           | —               | —       | approved        |

Corrections after round 1 (before showing the owner anything):

- `markilo proposals` measures how close each word still is to its typeface set plainly (`typeset`, 1 = untouched;
  ≥ 0.95 is listed in `missing`). Calibrated on round 1: untouched and dotted words 0.985–0.995, a cut through every
  letter 0.895, another grotesque 0.79, a serif 0.51.
- The main session writes the three directions, including the move it sees in the name's letters; one designer per
  proposal draws it (three in parallel). Reason: the single designer spent about eight tool calls per proposal.
- The designer sets the word plainly first as a baseline, compares against it, and is not done while `typeset` ≥ 0.95.
- Plugin-side cost records are a lower bound: an agent's reported tokens do not include the orchestrating session.
  Round 1 recorded $0.29 against $1.61 measured by Claude Code. The bench's measured cost is the reference.
