# Markilo CLI reference

`markilo` = `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs"`. All commands print JSON. Run each command as its own Bash call with the full `node "…/markilo.mjs"` prefix — no shell variables, `cd` or `&&` chains (they defeat the plugin's pre-approved permission). Add `--help` to any
command for its options. `--workspace <dir>` selects a workspace (default: `./brand` or the nearest
`markilo.json` above the current directory).

## Workspace

| Command                                                                                       | Purpose                                                          |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `init [--name N] [--family F]`                                                                | Create `./brand`. `--family` enables a shared family system.     |
| `brand add "<Name>" [--role master\|product\|sub-brand\|endorsed] [--parent slug] [--locked]` | Register a brand. `--locked` = preserve exactly, never redesign. |
| `brand list`                                                                                  | Brands, concept states, approval/export state.                   |
| `brief show --brand s` / `brief update --brand s --file patch.json`                           | Read/merge the strategy brief (validated).                       |

Brief fields: `oneLiner`, `mode` (new/refresh/redesign/evaluate), `product{type,category,features[],platforms[]}`,
`audience{primary[],secondary[],markets[],languages[]}`, `positioning{values[],personality[],tone,differentiators[]}`,
`competitors[{name,url,notes}]`, `constraints{mustKeep[],avoid[],colors[],typography[]}`, `lockedAssets[]`,
`deliverables[]`, `niceClasses[]`, `notes`.

## Research

| Command                                                                                                                                                        | Purpose                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research site <url> --brand s --allow-network [--pages 8] [--download-assets] [--allow-private]`                                                              | Multi-page read: robots, sitemap, brand pages, JSON-LD, colors/fonts, logo candidates; access gaps recorded.                                                          |
| `research competitors --brand s --allow-network [--url U --name N]… [--pages 3]`                                                                               | Competitor findings + logos/icons collected as reference marks.                                                                                                       |
| `research app "<name                                                                                                                                           | id                                                                                                                                                                    | url>" --brand s --allow-network [--store ios\|android] [--competitor] [--as-reference]` | App Store (iTunes Search API) / Google Play listing. |
| `research monorepo <repo> [--register --groups products,apps --parent p --lock a,b --scan]`                                                                    | Find sites/apps/packages; register brandable ones with `codePaths`; scan each.                                                                                        |
| `research repo [<path>] --brand s [--full]`                                                                                                                    | Local scan: package.json, README, logos, icon sets, design-system docs, manifests, CSS colors, fonts. Summary by default (full scan cached). Skips secret-like files. |
| `profile understanding --brand s`                                                                                                                              | What the product does, for whom, where and at what price — with sources, stated vs inferred, and what is unknown.                                                     |
| `profile tidy --brand s`                                                                                                                                       | Rewrite the profile without absolute local paths (before committing a workspace).                                                                                     |
| `profile show --brand s [--full] [--topic t]`                                                                                                                  | Brand Intelligence Profile summary.                                                                                                                                   |
| `profile add-source --brand s --type url\|search\|registry\|file\|user --ref R [--notes N]`                                                                    | Log a source with date. Returns its id (S1…).                                                                                                                         |
| `profile add-finding --brand s --topic T --status observed\|inferred\|verified\|user-provided --statement "…" --source S1,S2 [--confidence low\|medium\|high]` | Record a finding. observed/verified need sources.                                                                                                                     |
| `profile add-gap --brand s --text "…"`                                                                                                                         | Record an unknown.                                                                                                                                                    |
| `answers --brand s [--question Q --answer A]`                                                                                                                  | Questions already asked; record new ones.                                                                                                                             |
| `reference remove --brand s --id ID[,ID]`                                                                                                                      | Remove wrong or duplicate reference marks.                                                                                                                            |
| `reference dedupe --brand s [--apply]`                                                                                                                         | Find (and remove) files that add no evidence: near-identical files of one brand, one artwork under two names.                                                         |
| `reference list --brand s`                                                                                                                                     | References grouped by brand, with source quality (official, store, catalog, unverified).                                                                              |
| `similarity calibrate (--brand s \| <folder>)`                                                                                                                 | Measure how well copies are caught and different marks kept apart on real logos.                                                                                      |
| `reference add --brand s --file F --name "Brand" --source URL [--category direct\|indirect\|category]`                                                         | Add a reference mark (SVG/PNG/JPG) for similarity checks.                                                                                                             |

Topics: product, audience, market, competitor, visual-identity, typography, color, naming, trend, culture, trademark, platform.

## Design

| Command                                                                                                                                                                             | Purpose                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `concept new --brand s --id ID --title T --direction D --rationale R --semantics a,b --primary #hex [--secondary --accent --ink --paper] [--font id --weight n]`                    | Create `concepts/ID/`; then write `symbol.svg` there.                                                                                  |
| `sketches --brand s --concept ID`                                                                                                                                                   | Build `sketches/*.json` in the concept palette into `sketches/board.png` for the critic's sketch review.                               |
| `construct spec.json -o out.svg [--guides c.png] [--set k=v,…]`                                                                                                                     | Build a mark from a construction spec (see construction.md).                                                                           |
| `construct spec.json --brand s --concept ID [--vary [--max 24]] [--set k=v,…]`                                                                                                      | Into the concept: `symbol.svg`, `construction.json`, `review/construction.png`; `--vary` ranks variants in `sketches/variants/`.       |
| `wordmark --text T --font id --weight n -o out.svg [--tracking=-10] [--case lower] [--color #hex] [--locale tr]`                                                                    | Outlined wordmark with real kerning. Negative tracking needs `=`.                                                                      |
| `lockup --symbol a.svg --wordmark b.svg --layout horizontal\|stacked -o out.svg`                                                                                                    | Cap-height aligned lockup.                                                                                                             |
| `concept update --brand s --concept ID [--wordmark wordmark.svg] [--status shortlisted\|rejected] [--judgment memorability=8:"reason"] [--sketch-pick s3\|none --sketch-notes "…"]` | Update files/status/judgment.                                                                                                          |
| `color compare #a #b [#c…]`                                                                                                                                                         | ΔE00 and WCAG contrast between colors (e.g. an accent vs a well-known brand color).                                                    |
| `palette #primary [--secondary #] [--accent #]`                                                                                                                                     | OKLCH scales, neutrals, semantic colors, WCAG pairs.                                                                                   |
| `fonts`                                                                                                                                                                             | Bundled OFL fonts (inter, manrope, space-grotesk, sora, dm-sans, outfit, plus-jakarta-sans, fraunces, ibm-plex-serif, jetbrains-mono). |

## Verify

| Command                                                                             | Purpose                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `verify --brand s --concept ID`                                                     | All checks; writes reports + `concepts/ID/review/symbol-sheet.png`. **Read the PNG.** |
| `diversity --brand s`                                                               | Pairwise similarity of active concepts.                                               |
| `originality --brand s --concept ID [--names a,b]`                                  | Originality & Similarity Report only.                                                 |
| `score file.svg [--role symbol\|wordmark\|lockup]` / `analyze file` / `compare a b` | Standalone measurements.                                                              |
| `svg lint file.svg [--master]`                                                      | Master-file rules.                                                                    |
| `name check "Name" --against a,b,c` / `name trademark "Name" --describe "…"`        | Name confusion and registry pre-screen plan.                                          |
| `render file.svg -o out.png [--sheet]`                                              | PNG or review contact sheet.                                                          |

## Deliver

| Command                                                                                                              | Purpose                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `finalize --brand s --concept ID [--tagline T] [--note "usage rule"]... [--accept-risk] [--force]`                   | Freeze masters, build lockups (horizontal/stacked/compact), write `final/brand.json`. |
| `lock --brand s --primary #hex [--symbol f] [--wordmark f] [--lockup f]`                                             | Register an existing identity to preserve byte-for-byte.                              |
| `deliverables --brand s [--set g,…] [--add g,…] [--remove g,…]`                                                      | Which groups this brand needs; suggests from product type and platforms.              |
| `export --brand s [--only logos,web,ios,macos,android,windows,social,marketing,tokens,guidelines] [--all] [--clean]` | Chosen groups (deliverables) + `asset-manifest.json`.                                 |
| `gallery [--brand s]`                                                                                                | `brand/gallery/index.html`.                                                           |
| `install-assets --brand s --group web --into public [--project <dir>] [--apply] [--force]`                           | Dry run unless `--apply`. Never overwrites without `--force`.                         |
| `shortcut install\|uninstall\|status [--yes]`                                                                        | Optional personal `/markilo` skill.                                                   |
| `doctor`                                                                                                             | Environment check.                                                                    |

Error codes: USAGE, NOT_FOUND, EXISTS, UNSAFE_PATH, INVALID_INPUT, INVALID_SVG, NETWORK_DISABLED, NETWORK,
ROBOTS_DISALLOWED, LOCKED, NO_WORKSPACE, INTERNAL.
