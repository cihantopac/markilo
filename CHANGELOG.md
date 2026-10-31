# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Markilo is on npm (`npm install -g markilo`, `npx markilo`), from 0.4.0: the same toolchain for other coding agents
  and scripts. The package installs no dependencies (everything is bundled) and `prepublishOnly` runs CI and the smoke
  test.

## [0.4.0] - 2026-10-31

Quality and trust: Markilo's design quality is measured instead of claimed. A benchmark runs the installed plugin end
to end on seven realistic products with nobody steering, blind judges rate every critiqued concept from the brief and
the images alone, and the critic's quality gate is applied in code and calibrated against those judges. Every run,
image and score is in `bench/`; the README's "Measured quality" section reports them as they are.

### Known limitations

- Unattended, Markilo rarely reaches its own gate: 4 of the 38 validation runs since rc.5 (on briefs that were still
  untouched holdouts when they ran, 1 of 8). Its best unattended work sits on the line of "presentable": the strict
  Opus judge called the two identities that passed in the last round presentable in 2 of 4 and 0 of 4 looks. Markilo
  is built for working with you; unattended runs measure the floor.
- Around 6.0–6.4 of 10 a single judgment flips about half the time; the gate agrees with the Opus judge about as
  often as the judge agrees with itself (19 of 22 concepts in the last round, 48 of 57 across all runs).
- The design critic asks for Opus. Where an organization's model allowlist blocks it, Claude Code substitutes an
  allowed model and says so; the gate's calibration was measured on Opus only.

### Added

- Benchmark: `scripts/bench.mjs` runs the installed plugin in headless Claude Code on fixture projects
  (`bench/scenarios/`: an independent SaaS, a mobile app, a multi-product family, a developer tool, an online shop, a
  B2B platform and a learning app; holdouts are written before the changes they test). It measures success, the gate,
  checks, originality, exports, time, tokens and cost; `judge` rates every critiqued concept blind (`--times N` takes
  the majority of N looks), `report` writes `bench/results/<version>/`, `refresh` re-measures a kept run and `measure`
  prints the metrics for any workspace. Results for every release candidate are committed.
- The critic's quality gate is applied in code: blind brand fit, distinctiveness and memorability ≥ 6 and a yes to
  "would a senior identity designer present it as is?" (`concept update --blind …`, `--present yes|no:<reason>`).
  `concept list`, `concept update`, `concept show` and the gallery report `gate` (`passed`, `failed`, `not-reviewed`)
  and a `nearMiss`; `finalize` refuses a concept that failed unless the user chose it (`--user-choice "<reason>"`),
  and `brand.json` records the gate.
- Context sheets: `verify` shows the mark in browser tabs, on a home screen next to the collected competitors, in site
  headers and as avatars; the critic's first readings are recorded (`concept update --reads-as`).
- Sketch readiness: `markilo sketches` says which sketches are `ready` for review and gives each problem a `fix` in
  construction units (hairline gaps, failing checks, a near-copy of a collected reference).
- Families sketched as one system: a spec's `members` block gives each product its parameters and colours;
  `sketches` draws master and members on `sketches/family.png` and flags members that read as the same mark;
  `construct --member <name>` builds a product from the same spec.
- `markilo wordmarks`: the name in the concept's face and contrasting ones next to the symbol, measured; `--pick`
  commits one.
- A small version of the symbol for 32 px and below (`construct … --role small`): verify checks it still reads as the
  main symbol; favicons, Windows ICO and target sizes ≤ 32 use it.
- `markilo status` (where the work stands and the next step) and `concept show`.
- Decisions are logged by the toolchain to `decisions.md`: sketch picks, critiques with the gate result, rejections,
  deliverables, approvals and locks.
- `Fits a square icon` check for symbols twice as wide as they are tall.
- Originality evidence counts distinct brands and rates sources (official, store, catalog, unverified);
  `reference dedupe`; copies that add a small element are found by comparing marks without minor parts;
  `similarity calibrate` measures the engine on real logos (24 brands: AUC 0.99, 1.1 % false alarms at review);
  optional `MARKILO_EMBEDDER` hook.
- Product understanding: `research repo` and `research site` extract value proposition, features, audience, surfaces,
  platforms, languages and pricing with sources (stated vs inferred); `profile understanding`; unknowns become gaps.
- Gallery: pins with notes on the mark, side-by-side comparison, `gallery --serve` (127.0.0.1, token) so "Send to
  Claude" saves decisions; `feedback` reads them (`--import`, `--apply`).
- `install-assets --framework auto|next|laravel|flutter|static` with backups; `agent-setup` for Codex, Cursor and other
  agents; `web/favicon-32.png` export.
- `scripts/smoke.mjs`: an empty folder to installed assets with the bundle alone; CI runs it on every OS and on the
  copy that `claude plugin install` produces from the marketplace.

### Changed

- The critic gate rests on a cold look: the critic scores each concept from the brief and the images before reading
  the designer's rationale, then adds informed scores as feedback. On 32 benchmark concepts the informed scores
  tracked the Opus judge at Spearman 0.20, a cold look at 0.51 (`bench/results/calibration-rc.7/`). A measured problem
  may still turn a yes into a no; reading the rationale never turns a no into a yes. Concepts reviewed before this
  keep the previous rule (required criteria ≥ 6, average ≥ 6.5).
- The design critic runs on Opus (`model: opus`).
- The sketch review reads every sketch before knowing its idea, strikes clear failures (UI icons, known logos,
  clichés, the product's own object drawn plainly, the name's initial with a cut, a form language that contradicts
  the brief, sketches that do not survive 16 px or are not ready) and sends the strongest sketch left to development;
  `none` only when every sketch is struck. The main agent never overrides a `none`.
- The concept designer lists 6–8 ideas before drawing, names each sketch's visual hook, looks at its board and redraws
  at least once; directions may use the product's own object or the name's initial with a cut at most once each, and
  at least one has no letter and no object. Form language follows the brief's adjectives (warm and handmade, precise,
  calm, bold, premium).
- The construction guide asks for gaps of at least 80 units on 1024 (it asked for 1/24 of the artboard, below verify's
  own failing threshold), frames its worked example as structure rather than a model idea and checks offsets and
  matching widths.
- Judgment criteria are checked against the critic's list and stored under one spelling (`brandFit` → `brand-fit`);
  unknown criteria are refused with the list.
- The brief's `constraints.colors` accepts colour directions in words as well as hex values.

### Fixed

- Same-colour layers that touch are merged into one shape instead of leaving a hairline seam; `construct` says so.
- Context sheets no longer draw blank app icons for empty home-screen slots, and light reference marks are shown on a
  dark tile.
- A changed mark no longer keeps the critique, first readings and present-as-is answer of the previous drawing.
- A colour typed without quotes (`--primary #1d4e89`) starts a shell comment; the error now says to quote colours, and
  every example is quoted.
- `research repo .` failed ("Cannot derive a slug"); a concept id that is not a slug gets a suggestion
  (`--id split-s`).
- An absolute path that reaches the workspace under another name (macOS `/var` and `/private/var`, a symlinked home)
  was refused as outside the workspace.
- `construct`'s usage line shows `--role symbol|wordmark|small`.

## [0.3.0-beta.7] - 2026-10-30

### Fixed

- Workspaces git-ignore every `research/` capture folder (third-party logos and pages), and older workspaces get the
  new rules the next time Markilo opens them; the research guidance says where downloads belong.

### Changed

- Markilo's own identity was redone by running Markilo on itself (`branding/`); README images and the plugin icon are
  unedited exports.

## [0.3.0-beta.6] - 2026-10-30

### Fixed

- Privacy: research profiles no longer store absolute local paths (they leaked the user name and folder layout when a
  workspace was committed); paths are kept relative to the project, and `profile tidy` rewrites older profiles.

## [0.3.0-beta.5] - 2026-10-30

### Fixed

- Horizontal lockups stand an ink-placed symbol on the wordmark baseline (it no longer hangs below it).

### Added

- `color compare <#hex> <#hex>…`: CIEDE2000 difference and WCAG contrast between colors.

## [0.3.0-beta.4] - 2026-10-30

### Fixed

- Lockups place the symbol by its ink rather than its artboard, so the artboard margin no longer widens the gap or
  shrinks the symbol next to the type (horizontal, stacked, compact and social images).

### Added

- `finalize --note "<usage rule>"` (repeatable): usage rules decided at approval appear in the guidelines.

## [0.3.0-beta.3] - 2026-10-30

### Fixed

- App marks on a dark brand fill keep the brand's colors (adapted to the fill) instead of dropping to one color.
- Guidelines state what the originality verdict rests on and say plainly when no trademark registry search was done
  (Markdown and HTML).
- A relative `--workspace` is also found from folders inside the workspace.

### Added

- `reference remove`; PNG-in-ICO favicons are accepted as reference marks.
- `lockup --brand --concept` composes a concept's own symbol and wordmark.

## [0.3.0-beta.2] - 2026-10-30

### Fixed

- The installed plugin could not load the path engine (`pathkit-wasm` was required at run time from `node_modules`,
  which a plugin install does not have); it is now bundled. A test runs the bundle from a folder with no
  `node_modules` above it.

### Added

- Construction kit: `markilo construct` builds marks from JSON construction specs (primitives, booleans, gaps,
  offsets, fillets, repeats, mirrors, font glyphs, parameter expressions) with Skia PathKit geometry and curve
  refitting; `--vary` builds and ranks parameter variants; construction drawings and `construction.json` are saved
  with the concept.
- Early sketch gate: `markilo sketches` builds a concept's sketch specs onto one board; the critic reviews boards
  before any concept is developed and records `--sketch-pick <id|none>`; designers run in `sketch` and `develop`
  modes, so weak ideas are dropped before the expensive finishing work.
- `markilo deliverables`: suggests the asset groups a product needs from its type and platforms; `export` produces
  the chosen groups by default (`--all` for everything).

### Changed

- The concept designer builds every mark from construction specs, explores 3–5 different moves and tunes the winner
  by measured variants; the critic answers "would a senior designer present this?" and concepts that miss the gate
  are rejected instead of shown.
- Review sheets show colors adapted to the dark ground, as exports ship them.
- The balance check allows the optical-centre lift (up to 5 % high) and says which way a mark leans.
- `concept update` takes `--construction`, `--title`, `--direction`, `--rationale` and every palette role
  (`--secondary/--accent none` removes one); committing a new mark clears the previous critic scores.
- Construction specs: params may be expressions over earlier params, `{expr}` works inside `path` data, and
  wordmarks drawn without a font take explicit `metrics` for lockup alignment, and `repeat` exposes the copy index `i`.

## [0.3.0-beta.1] - 2026-10-30

### Added

- Evidence-based originality verdicts (`insufficient-evidence`, `no-conflicts-found`) with confidence levels and a list
  of what would raise them; structured registry search records; finalize gates on originality and failing checks.
- Multi-page site research, `research competitors` (logos/icons collected as references) and `research app`.
- `fonts search` / `fonts add`: ~1,800 open-licensed families from Fontsource into the workspace.
- `render … --compare`: side-by-side sketch comparison; designer agents explore 3–5 sketches before refining.
- Dark-first brands: grounds follow the brand's paper color across gallery, exports, guidelines and checks
  ("Visible on its paper").
- Compact review gallery: decision cards with Keep / Refine / Drop, revision tags and a copyable request for Claude.
- Critic quality gate and calibrated scoring in the design workflow.
- Gallery switches to an approved-identity view after finalize; explored concepts are folded away for reference.
- `logos/overview.png` shows every logo file on the background it is made for, with a `logos/README.md` guide
  (white and black variants are transparent and look empty in file previews).
- Name similarity compares word by word and ignores generic category words ("play", "app", "cloud"…).

### Security

- SSRF-safe HTTP client, symlink-safe file access, SVG sanitizer, XML/image/render limits, kit path containment,
  broader secret patterns, untrusted web text handling.


## [0.2.0] - 2026-10-30

### Added

- `research monorepo`: detects workspace globs (npm/yarn/pnpm/lerna) and conventional folders (products, apps, sites,
  clients, packages…), classifies packages as site/app/client/library/service and brandable or not, and with
  `--register --scan` creates the brands (with `codePaths`) and researches each one in a single call.
- `research repo` without a path scans the brief's `codePaths`; `--max-files` budget (default 25,000, was 6,000) and an
  explicit `truncated` flag.
- Scanner finds icon sets (folders of small SVGs), `*-icon.*` files, icon/logo/brand folders, and design-system / brand
  docs with the colors they mention; these become profile findings.
- `install-assets --project <dir>` installs into another project folder (still a dry run unless `--apply`).

### Changed

- CLI prints compact JSON when piped (fewer tokens for Claude); `MARKILO_PRETTY=1` restores indentation.
- `research repo` and `research site` print a digest; the full scan is cached in the workspace (`--full` to print it).
- The `brand-researcher` agent runs on Sonnet.
- Examples are fully synthetic (Tidepool, Lumen, Acme); the repository contains no real customer or product data.
- Skills require each toolchain command as one full `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" …` call (pre-approved),
  and never offer to unlock or redesign a locked brand.

## [0.1.0] - 2026-10-30

### Added

- Claude Code plugin with the `design` workflow skill plus `research`, `originality`, `concepts`, `refine`,
  `export`, `gallery` and `audit` stage skills, and `brand-researcher`, `concept-designer` and `design-critic` agents.
- Self-contained marketplace (`/plugin marketplace add cihantopac/markilo`).
- Bundled `markilo` CLI (no install step): workspace and brief management, repository and website research with
  sourced findings, SVG lint/optimize, WASM rendering, outlined wordmarks with real kerning, lockups, OKLCH palettes.
- Originality engine: silhouette IoU under rotation/mirroring, perceptual hashes, structural descriptors, color
  distance, stock-primitive genericity, concept diversity, name similarity and trademark pre-screening plans.
- Quality scorecard: small-size legibility, thin detail, balance, artboard fit, complexity, one-color reproduction,
  contrast and palette separation.
- Asset export for logos, web/PWA, iOS (incl. dark/tinted and Icon Composer layers), macOS (.icns), Android
  (adaptive + themed), Windows (ICO + MSIX assets), social, marketing, design tokens and guidelines.
- Self-contained HTML Brand Preview Gallery with mockups and a feedback export.
- Locked identities that are reproduced byte-for-byte and never redesigned.

[Unreleased]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.7...HEAD
[0.3.0-beta.7]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.6...markilo--v0.3.0-beta.7
[0.3.0-beta.6]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.5...markilo--v0.3.0-beta.6
[0.3.0-beta.5]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.4...markilo--v0.3.0-beta.5
[0.3.0-beta.4]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.3...markilo--v0.3.0-beta.4
[0.3.0-beta.3]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.2...markilo--v0.3.0-beta.3
[0.3.0-beta.2]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.1...markilo--v0.3.0-beta.2
[0.3.0-beta.1]: https://github.com/cihantopac/markilo/compare/markilo--v0.2.0...markilo--v0.3.0-beta.1
[0.2.0]: https://github.com/cihantopac/markilo/compare/markilo--v0.1.0...markilo--v0.2.0
[0.1.0]: https://github.com/cihantopac/markilo/releases/tag/markilo--v0.1.0
