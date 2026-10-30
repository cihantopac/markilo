# Markilo CLI reference

`markilo` = `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs"`. All commands print JSON. Add `--help` to any
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

| Command                                                                                                                                                        | Purpose                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `research repo <path> --brand s`                                                                                                                               | Local scan: package.json, README, logos, manifests, CSS colors, fonts. Skips secret-like files. |
| `research site <url> --brand s --allow-network [--download-assets]`                                                                                            | One page + ≤3 same-origin stylesheets; honours robots.txt. Ask first.                           |
| `profile show --brand s [--full] [--topic t]`                                                                                                                  | Brand Intelligence Profile summary.                                                             |
| `profile add-source --brand s --type url\|search\|registry\|file\|user --ref R [--notes N]`                                                                    | Log a source with date. Returns its id (S1…).                                                   |
| `profile add-finding --brand s --topic T --status observed\|inferred\|verified\|user-provided --statement "…" --source S1,S2 [--confidence low\|medium\|high]` | Record a finding. observed/verified need sources.                                               |
| `profile add-gap --brand s --text "…"`                                                                                                                         | Record an unknown.                                                                              |
| `answers --brand s [--question Q --answer A]`                                                                                                                  | Questions already asked; record new ones.                                                       |
| `reference add --brand s --file F --name "Brand" --source URL [--category direct\|indirect\|category]`                                                         | Add a reference mark (SVG/PNG/JPG) for similarity checks.                                       |

Topics: product, audience, market, competitor, visual-identity, typography, color, naming, trend, culture, trademark, platform.

## Design

| Command                                                                                                                                                          | Purpose                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `concept new --brand s --id ID --title T --direction D --rationale R --semantics a,b --primary #hex [--secondary --accent --ink --paper] [--font id --weight n]` | Create `concepts/ID/`; then write `symbol.svg` there.                                                                                  |
| `wordmark --text T --font id --weight n -o out.svg [--tracking=-10] [--case lower] [--color #hex] [--locale tr]`                                                 | Outlined wordmark with real kerning. Negative tracking needs `=`.                                                                      |
| `lockup --symbol a.svg --wordmark b.svg --layout horizontal\|stacked -o out.svg`                                                                                 | Cap-height aligned lockup.                                                                                                             |
| `concept update --brand s --concept ID [--wordmark wordmark.svg] [--status shortlisted\|rejected] [--judgment memorability=8:"reason"]`                          | Update files/status/judgment.                                                                                                          |
| `palette #primary [--secondary #] [--accent #]`                                                                                                                  | OKLCH scales, neutrals, semantic colors, WCAG pairs.                                                                                   |
| `fonts`                                                                                                                                                          | Bundled OFL fonts (inter, manrope, space-grotesk, sora, dm-sans, outfit, plus-jakarta-sans, fraunces, ibm-plex-serif, jetbrains-mono). |

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

| Command                                                                                                      | Purpose                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `finalize --brand s --concept ID [--tagline T] [--force]`                                                    | Freeze masters, build lockups (horizontal/stacked/compact), write `final/brand.json`. |
| `lock --brand s --primary #hex [--symbol f] [--wordmark f] [--lockup f]`                                     | Register an existing identity to preserve byte-for-byte.                              |
| `export --brand s [--only logos,web,ios,macos,android,windows,social,marketing,tokens,guidelines] [--clean]` | Full asset kit + `asset-manifest.json`.                                               |
| `gallery [--brand s]`                                                                                        | `brand/gallery/index.html`.                                                           |
| `install-assets --brand s --group web --into public [--apply] [--force]`                                     | Dry run unless `--apply`. Never overwrites without `--force`.                         |
| `shortcut install\|uninstall\|status [--yes]`                                                                | Optional personal `/markilo` skill.                                                   |
| `doctor`                                                                                                     | Environment check.                                                                    |

Error codes: USAGE, NOT_FOUND, EXISTS, UNSAFE_PATH, INVALID_INPUT, INVALID_SVG, NETWORK_DISABLED, NETWORK,
ROBOTS_DISALLOWED, LOCKED, NO_WORKSPACE, INTERNAL.
