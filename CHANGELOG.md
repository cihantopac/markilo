# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.2...HEAD
[0.3.0-beta.2]: https://github.com/cihantopac/markilo/compare/markilo--v0.3.0-beta.1...markilo--v0.3.0-beta.2
[0.3.0-beta.1]: https://github.com/cihantopac/markilo/compare/markilo--v0.2.0...markilo--v0.3.0-beta.1
[0.2.0]: https://github.com/cihantopac/markilo/compare/markilo--v0.1.0...markilo--v0.2.0
[0.1.0]: https://github.com/cihantopac/markilo/releases/tag/markilo--v0.1.0
