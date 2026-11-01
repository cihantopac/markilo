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

| Date | Product | Round | Result | Cost (measured) | Minutes | Owner's verdict |
| ---- | ------- | ----- | ------ | --------------- | ------- | --------------- |
