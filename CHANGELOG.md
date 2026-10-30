# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0-rc.4] - 2026-10-30

### Fixed

- Context sheets drew a blank white app icon for every home-screen slot without a collected competitor, which made the
  concept look more distinctive than it was.

### Added

- Benchmark results for rc.3: two of three products got an identity that passed the gate and the blind judge (rc.2:
  one, which the judge would not present; rc.1: none).

## [0.4.0-rc.3] - 2026-10-30

### Added

- `sketches` says which sketches are `ready` for the sketch review and gives each problem a `fix` in construction
  units (hairline gaps, failing checks, a near-copy of a collected reference); the critic reviews ready sketches only.
- `construction.md` has a worked example: Markilo's own symbol, which passed the gate and the blind judge, annotated.

### Changed

- The concept designer lists 6–8 ideas before drawing, writes each sketch's idea as the hook the eye catches at 32 px
  and what it means, and looks at its board and redraws at least once before handing it over. Directions name their
  visual hook.

### Fixed

- The construction guide asked for gaps of 1/24 of the artboard (0.67 px at 16 px), below verify's own failing
  threshold (0.7 px); it now asks for ≥ 80 units on 1024 (1.2 px). In the rc.1 and rc.2 benchmarks 69 % of the sketches
  the critic struck carried this failure; 22 % of the picked ones did.

## [0.4.0-rc.2] - 2026-10-30

### Added

- The critic gate is applied in code: the critic records its yes/no to "would a senior designer present it as is?"
  (`concept update --present yes|no:<reason>`); `concept list`, `concept update` and the gallery show `gate`
  (`passed`, `failed`, `not-reviewed`); `finalize` refuses a concept that failed it unless the user chose it anyway
  (`--user-choice "<reason>"`), and `brand.json` records the gate. Found by the benchmark: critics computed the gate
  by hand and their "no" had nowhere to go.
- `scripts/smoke.mjs`: an empty folder to installed assets with the bundle alone; CI runs it on every OS and on the copy
  that `claude plugin install` produces from the marketplace.
- `bench.mjs refresh` re-measures a kept run folder, `--model` and `--budget` set the run's model and cost cap, and the
  report lists every concept — including directions dropped at sketch review — with the critic's and the blind
  judge's first readings.
- Benchmark results for rc.1 and rc.2 (`bench/results/`) and a "Measured quality" section in the README: one of seven
  unattended runs passed the gate; the gate and a blind judge agreed on 8 of 9 critiqued concepts.

### Changed

- Sketch review is a procedure: read every sketch before knowing its idea, strike UI icons, clichés and the product's
  own object drawn plainly, and pick only a sketch with no reading the critic had to name as a risk. Directions name
  what a stranger would see first, and at most one may draw the product's own object or the name's literal noun.
  The design principles list those category objects (pages and folded corners for documents, charts and tally marks
  for finance, moons for sleep…) and no longer use a folded page as their example idea. In the benchmark every
  rejected concept had passed sketch review with exactly such a named risk. The skills also say that the sketch pick
  is the critic's: the main agent never overrides a `none` (it did once in the benchmark).
- Judgment criteria are checked against the critic's list and stored under one spelling (`brandFit` → `brand-fit`,
  `premium` → `premium-perception`); unknown criteria are refused with the list. Older concepts are read the same way.
- The brief's `constraints.colors` accepts color directions in words as well as hex values.

### Fixed

- `research repo .` failed ("Cannot derive a slug").
- `construct`'s usage line shows `--role symbol|wordmark`.

- An absolute path that reaches the workspace under another name (macOS `/var` and `/private/var`, a symlinked home)
  was refused as outside the workspace, so `concept update --wordmark /var/…` failed in temporary folders.

## [0.4.0-rc.1] - 2026-10-30

### Added

- Benchmark: `scripts/bench.mjs` runs the installed plugin end to end on realistic scenarios (`bench/scenarios/`: an
  independent SaaS, a mobile app, a multi-product family) in headless Claude Code, measures success, the quality gate,
  checks, originality, exports, tokens and cost, has a blind judge rate every critiqued concept and writes the report
  to `bench/results/<version>/`.
- Context sheets: `verify` shows the mark in browser tabs, on a home screen next to the collected competitors, in site
  headers and as avatars; the critic starts with a blind first impression (`concept update --reads-as`) that caps
  scores when the idea does not read or the mark reads as a UI icon or cliché.
- Originality evidence counts distinct brands and rates sources (official, store, catalog, unverified);
  `reference dedupe`; reports keep the closest file per brand; copies that add a small element are found by
  comparing marks without minor parts; `similarity calibrate` measures the engine on real logos (24 real brands:
  AUC 0.99, 1.1 % false alarms at review); optional `MARKILO_EMBEDDER` hook.
- Product understanding: `research repo` and `research site` extract value proposition, features, audience, surfaces,
  platforms, languages and pricing with sources (stated vs inferred); `profile understanding`; unknowns become gaps.
- Gallery: pins with notes on the mark, side-by-side comparison with a preferred concept, `gallery --serve`
  (127.0.0.1, token) so "Send to Claude" saves decisions; `feedback` reads them (`--import`, `--apply`).
- `install-assets --framework auto|next|laravel|flutter|static` with backups; `agent-setup` for Codex, Cursor and other
  agents; `web/favicon-32.png` export.

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
