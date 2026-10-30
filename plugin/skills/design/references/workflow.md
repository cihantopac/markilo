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

## Monorepos

1. `markilo research monorepo <repo>` lists packages with `kind` (site, app, client, library, service) and whether they
   are `brandable` (user-facing). Libraries and services are not brands.
2. Agree with the user on: the master brand, which packages get their own identity, which are locked (preserved), and
   the parent of each (e.g. apps living inside a platform product).
3. `markilo research monorepo <repo> --register --groups products,apps --parent <master> --lock <slugs> --scan` creates the
   brands, stores each package folder in the brief's `codePaths`, and scans each one into its own profile. Run it once
   per parent if different groups have different parents.
4. Read the design-system docs and icon sets the scans report before proposing anything — an existing system is
   equity.
5. Scale the work: master + family system first; sites one at a time; many apps (10+) are usually best served by a
   shared **app icon system** (one grid, one container shape, one color logic, a distinct glyph per app) rather than
   separate identities. Do apps in batches of 4–6 concept-designer agents.
6. To place exports back into the repo from a separate brand folder:
   `markilo install-assets --brand <slug> --group web --into public --project <repo>/<package>` (dry run, then `--apply`
   after the user agrees).

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
