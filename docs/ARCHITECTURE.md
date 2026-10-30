# Markilo architecture

Markilo has two halves that are deliberately kept apart:

1. **A deterministic toolchain** (`src/`, bundled into `plugin/dist/markilo.mjs`). It parses, lints, optimizes,
   renders, measures, compares and exports SVG. It never "decides" what a brand should look like; it gives
   facts: pixels, hashes, contrast ratios, similarity scores, file inventories.
2. **A Claude Code plugin** (`skills/`, `agents/`). Skills hold the creative and strategic process
   (research → brief → directions → SVG authoring → critique → refinement). They call the toolchain for
   every claim that can be measured, and they look at rendered PNGs before judging a design.

That split is what keeps Markilo honest: anything presented as a measurement comes from code, and
anything presented as judgment is labeled as judgment.

```
┌──────────────────────────── Claude Code ─────────────────────────────┐
│ /markilo  /markilo:design  /markilo:research  /markilo:originality … │
│        skills/*  ──spawn──▶  agents/* (researcher, analyst, critic)  │
└───────────────┬──────────────────────────────────────────────────────┘
                │ node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs <command>
┌───────────────▼──────────────────────────────────────────────────────┐
│ CLI (src/cli)                                                        │
├──────────┬──────────┬───────────┬───────────┬───────────┬────────────┤
│ research │ name     │ svg       │ render    │ analyze   │ design     │
│ repo/site│ phonetic │ xml/lint  │ resvg-wasm│ hashes    │ fonts      │
│ profile  │ registry │ optimize  │ png codec │ features  │ wordmark   │
│          │ links    │ recolor   │ resize    │ similarity│ lockup     │
│          │          │ compose   │ sheets    │ color/a11y│ palette    │
├──────────┴──────────┴───────────┴───────────┴───────────┴────────────┤
│ originality report · quality report · export (web, iOS, Android,     │
│ macOS, Windows, social, marketing) · ICO/ICNS · gallery · guidelines │
├──────────────────────────────────────────────────────────────────────┤
│ core: workspace layout, safe paths, safe writes, schemas, errors     │
└──────────────────────────────────────────────────────────────────────┘
```

## Design constraints

| Constraint                       | How it is met                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| No servers, no paid APIs         | Pure CLI. Rendering uses `@resvg/resvg-wasm` (no native build).                                                                                   |
| Works right after plugin install | `plugin/dist/` is a committed single-file bundle + `resvg.wasm`; CI checks it is fresh.                                                           |
| Windows, macOS, Linux            | Node ≥ 20 only. No shell-outs, no platform binaries, `path` APIs everywhere.                                                                      |
| Low token use                    | Commands print compact JSON summaries; large data goes to files the agent can open on demand.                                                     |
| No hidden network access         | Only `research site` fetches, and only with `--allow-network`. It honours `robots.txt`.                                                           |
| No silent edits to user projects | All output goes into the brand workspace. `install-assets` is a dry run unless `--apply`. Existing files are never overwritten without `--force`. |
| Real vectors                     | Lint fails on embedded raster images, scripts, external references and missing `viewBox`. Wordmarks are converted to outlines.                    |

## The brand workspace

Everything Markilo learns or makes is stored on disk, so later sessions reuse it instead of re-asking.

```
brand/                          # default; override with --workspace
  markilo.json                  # workspace manifest (schema version, family, brands)
  shared/                       # family-level system for multi-product work
    system.json                 # shared tokens: palette, type, grid, motifs
  brands/<slug>/
    brief.json                  # strategy brief (goals, audience, constraints, locked assets)
    profile.json                # Brand Intelligence Profile (findings with source + date + status)
    answers.json                # questions already asked and their answers
    decisions.md                # append-only design decision log
    research/
      references/               # competitor marks gathered for comparison only (never shipped)
      cache/                    # raw fetches (git-ignored inside the workspace)
    concepts/<id>/
      concept.json              # direction, rationale, colors, fonts, status
      symbol.svg                # author-written mark
      wordmark.svg              # outlined wordmark
      review/                   # rendered contact sheets for visual critique
    reports/
      originality-<id>.md|json
      quality-<id>.md|json
    final/                      # approved masters
    exports/                    # generated asset kit + asset-manifest.json
  gallery/index.html            # self-contained Brand Preview Gallery
```

Findings in `profile.json` always carry a `status` of `observed` (seen directly in a source),
`inferred` (reasoned from observations), `verified` (confirmed by an authoritative source or the user),
or `user-provided`. Every finding has a `source` and a `retrievedAt` date.

Brands can be marked `locked` (for example an existing product mark that must be preserved). Locked
brands are rendered in galleries and exports as-is and are never sent through concept generation.

## Originality engine

`markilo originality` compares concepts against (a) reference marks collected during research and
(b) each other. Signals:

- **Silhouette IoU** after normalizing each mark to its bounding box, tested under the 8 dihedral
  transforms (rotation/flip), so mirrored copies are caught.
- **Perceptual hashes** (aHash, dHash, DCT pHash) on a normalized 64 px alpha mask.
- **Shape descriptors**: coverage, negative-space ratio, hole count, connected components, symmetry,
  radial profile, edge density.
- **Color distance** (CIEDE2000 between dominant palettes).
- **Name similarity**: edit distance, Jaro-Winkler, phonetic keys, shared stems, Nice class overlap.

Each pair gets a 0–1 similarity and a risk level (`low`, `review`, `high`) with the reasons that drove
it. The report lists the research scope (which references were compared, from which sources and dates)
and states its limits: no matches found is not proof of uniqueness, and the report is not legal advice.
Trademark pre-screening produces official registry search links plus a log of what was searched.

An embedding-based comparator can be added through the `Comparator` interface in
`src/analyze/similarity.ts`; none ships by default to keep the toolchain local and free.

## Quality scorecard

`markilo score` produces measured metrics with pass/warn/fail thresholds:

- small-size fidelity (16/32 px renders vs. a 256 px reference),
- detail survival (thin strokes and gaps that vanish below 32 px),
- optical balance (visual centroid offset, bounding-box fill),
- complexity (path/node counts, edge density),
- monochrome viability (single-color silhouette still reads),
- contrast of palette pairs (WCAG 2.x ratios) on light and dark grounds,
- distinctiveness among concepts.

Subjective criteria (brand fit, memorability, cultural fit, timelessness) are scored by the critic
agent after viewing the renders, and are stored separately with written rationale.

## Asset export

`markilo export` turns approved masters into a complete kit. Platform targets and their sizes live in
`src/export/targets.ts` with the official source for each requirement. The asset manifest records
every file with purpose, pixel size, SHA-256 and the master it was derived from.

## Composition

Lockups, icons, sheets and social images place artwork with `<g transform="matrix(…)">` groups (see
`src/svg/compose.ts`) rather than nested `<svg>` viewports, so exported files survive optimizers and design tools.
Placement is content-aware: `src/export/geometry.ts` measures where the ink actually is and fits it to a box or to a
safe circle (maskable and adaptive icons), so marks with different artboard padding get the same optical size.

## Extending

- New export target: add an entry to `src/export/targets.ts` and a test.
- New comparator: implement `Comparator` and register it in `src/analyze/similarity.ts`.
- New font: add it to `scripts/vendor-fonts.mjs` (OFL or equivalent only) and run `npm run fonts`.
- New skill: add `skills/<name>/SKILL.md`; keep instructions declarative and call the CLI for facts.
