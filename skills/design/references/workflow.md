# Workflow details

## Stage gates

| Stage    | Done when                                                                            | Saved in                          |
| -------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| Discover | Sources scanned, existing identity seen, mode chosen (new/refresh/redesign/evaluate) | profile.json, brief.json `mode`   |
| Research | Each topic covered or listed as a gap; references collected                          | profile.json, research/references |
| Brief    | Brief validates; user confirmed the key trade-offs                                   | brief.json, answers.json          |
| Explore  | 3–5 directions, each with idea sentence, form language, type, color, risk            | decisions.md                      |
| Design   | Each direction has symbol.svg (+ wordmark.svg) and concept.json                      | concepts/<id>/                    |
| Verify   | No `fail` checks, originality not `redesign`, diversity low, critic scores recorded  | reports/, concept.json `judgment` |
| Review   | User has seen the gallery and chosen                                                 | answers.json, concept status      |
| Refine   | Chosen concept re-verified after every change; finalized                             | final/                            |
| Export   | Export ran without skipped groups the user needs                                     | exports/                          |
| Deliver  | User has paths, guidelines, quality + originality summary, limitations               | —                                 |

Append one dated line per significant decision to `brand/brands/<slug>/decisions.md` (Edit the file):
what was decided, why, and the evidence.

## Choosing the mode

- **evaluate**: the user wants an opinion or the brand is locked. Run `markilo score` / `analyze` /
  `compare` on existing files, then report strengths, risks and recommendations without designing.
- **refresh**: equity is strong but craft is weak → keep the idea, rebuild geometry, wordmark, palette.
- **redesign**: the mark fails measurably or contradicts the strategy → new directions.
- **new**: no identity exists.

Recommend a mode with evidence (measurements of the current mark + findings) and let the user decide.

## Partial requests

- "Research X": Discover + Research + Brief, then stop with a summary of the profile.
- "Check this logo": evaluate mode (`score`, `analyze`, `compare` against references, `name check`).
- "Make variations of concept A": Refine.
- "Export / give me favicons": Export (+ `install-assets` dry run).
- "Show me": `markilo gallery`.

## Multi-product families

1. `markilo init --family "<Family>"`, then `brand add` for the master brand and each product
   (`--role product --parent <master>`). Locked members: `brand add "<Name>" --locked` then
   `markilo lock --brand <slug> --symbol … --primary …`.
2. Research the family once (master brand), then product-specific facts per product.
3. Define the shared system in `shared/system.json` before product concepts.
4. Design products in parallel with the concept-designer agent, all following the shared system.
5. Verify each product, then `markilo compare` across products: siblings should be related (shared
   construction) but not confusable (similarity < 0.62 between products).

## Using Markilo from another project

The workspace lives in the user's project at `./brand` (add it to their VCS or not — their choice; raw
research captures are git-ignored automatically). Nothing outside `./brand` changes unless the user
approves `install-assets --apply`.
