# Markilo 1.8.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the refresh of an existing mark a first-class path, and clear what is still open. A real refresh on
1.7.0 started from a raster logo with no vector original. The agent had to install a tracer, write its own curve fitter
and geometric rebuild, skip the proposal path, and write its own 182-file export. Originality evidence gated the
owner's own mark. `verify` could never pass an intentional metallic rendering. The simplified small version was
rejected at the very end. In 1.8.0:

- `trace` turns a PNG or JPEG into SVG.
- `rebuild` fits clean lines, arcs and curves under a fidelity gate.
- A refresh has its own stage and an equity mode.
- A rich (gradient) rendering rides on a flat master.
- The small-size question comes early.
- TV and store surfaces export.
- Android projects get their own resource names.

The items parked from 1.6.0 and the minors deferred from 1.7.0 are closed in the same release.

**Architecture:** Three new modules:

- `src/geom/trace.ts`: raster to contours to curves.
- `src/geom/rebuild.ts`: segment fitting and angle snapping.
- `src/export/tv.ts`: TV and store surfaces.

The rest changes existing code:

- `cli/commands.ts`: `trace`, `rebuild`, `score`, `render`, `concept update`, `finalize`, `install-assets`,
  `reference add`.
- `analyze/quality.ts`
- `export/exporter.ts`, `export/kit.ts`, `export/specs.ts`, `export/guidelines.ts`
- `cli/frameworks.ts`
- `construct/compile.ts`
- `render/sheet.ts`
- `research/site.ts`
- `gallery/*`
- skill text

No new dependencies. PNG and JPEG decoding already exist (`render/png.ts:55`). WebP stays unsupported, with a clear
message.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, pngjs, jpeg-js, esbuild
bundle in `plugin/dist/markilo.mjs`.

**Spec:** the field report on 1.7.0 (a single-agent refresh of a raster TV-app logo, saved privately with a
verification table), the items parked in `docs/RELEASE-1.6.md` → Progress record, and the minors deferred in
`docs/superpowers/plans/2026-11-16-gallery-redesign.md` → Progress. Each claim was checked against the code at
`9668f72`. See [Sources](#sources).

## Global Constraints

- No new runtime or dev dependencies; no native modules; everything runs offline except commands given
  `--allow-network`.
- Generated HTML keeps its CSP (nonce for the gallery, `sha256-` hash for the kit and guidelines pages) and the
  three-colour interface rule of 1.7.0 (`INTERFACE_COLOURS`).
- Locked identities are reproduced byte-for-byte. A kit finalized before 1.8.0 exports byte-identical logo files: the
  `old kits export unchanged apart from the new files` hash test passes unchanged.
- Every CLI command prints JSON on stdout and exits non-zero on failure (1.6.0 rule); progress goes to stderr.
- Tests, fixtures and examples use synthetic brands only (Acme, Tidepool, Lumen, Ledger, Nimbra). Raster fixtures are
  rendered from the repository's own synthetic SVG fixtures, never copied from a real logo.
- Files, reports and code stay in English. New interface strings in HTML pages and boards get a Turkish entry in
  `src/ui/tr.ts`; the `tests/ui.test.ts` key scan enforces it.
- After every task `npm run ci` passes. Run `npm run build` before the CLI tests that use the bundle. Commit the rebuilt
  `plugin/dist/markilo.mjs` with any source change.
- Commits stage explicit paths only and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Parallel agents work in worktrees and do not stage `plugin/dist`; the controller merges and rebuilds it. One
  whole-branch review at the end, then one fix wave.
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 15).

## Review Focus

1. **Trace on real-world rasters (Task 1).** These inputs must trace without hanging or producing thousands of nodes:
   - anti-aliased edges and JPEG noise;
   - a transparent background versus a solid one;
   - a mark touching the image edge;
   - holes (counters);
   - a 4000 × 4000 image.

   The pixel cap (`MAX_IMAGE_PIXELS`) still applies.
2. **Rebuild never silently changes the form (Task 2).** Below `--min-iou` the command fails. Snapping angles must not
   flip a contour's winding or open a hole.
3. **Equity mode cannot hide a real conflict (Task 3).** A `redesign` originality verdict still blocks finalize. Only
   `insufficient-evidence` and `needs-review` stop gating, and the kit says why.
4. **Rich renderings (Task 4)** are checked against their flat master's silhouette. A rich file whose silhouette drifts
   from the master must fail, not warn quietly.
5. **Android install profile (Task 7)** writes only into resource folders it read, in dry-run unless `--apply`, and
   never overwrites a file without `--force`. This is the existing install-assets rule.

---

### Task 1: `markilo trace` — a raster mark to SVG, and `score` on rasters

Legacy logos are usually PNG or WebP. `score` only takes SVG (`commands.ts:4290`), yet the audit skill tells agents to
score the existing assets (`audit/SKILL.md:17`). There is no way to get a vector of the same form; the field run
installed potrace + OpenCV.

**Files:**

- Create: `src/geom/trace.ts`
- Modify: `src/cli/commands.ts` (new `trace`; `score` accepts PNG/JPEG), `plugin/skills/audit/SKILL.md`,
  `plugin/skills/design/references/cli.md`
- Test: `tests/trace.test.ts`

**Interfaces:**

- `traceRaster(img: Raster, opts: { colors?: number; threshold?: number; turdSize?: number; tolerance?: number }):
  { svg: string; faces: { color: string; area: number }[]; nodes: number }`.
  - Faces: with `colors` > 1, k-means in Lab on opaque pixels, one face per colour, so a two-tone mark keeps its
    parts. Otherwise one silhouette from alpha (or luminance, when the image is opaque, with the background colour taken
    from the border).
  - Contours: marching squares at 2× supersampling, with holes as even-odd subpaths.
  - Curves: polygon simplification, then a Schneider cubic fit within `tolerance` (default 0.25 px at source scale).
  - Specks: areas below `turdSize` (default 0.05 % of the image) are dropped.
- CLI: `trace <in.png|jpg> -o <out.svg> [--colors n] [--threshold 0-255] [--tolerance px]`. It prints
  `{ out, faces, nodes, iou }`, where `iou` is `silhouetteIoU` of the result against the raster's own mask.
- `score <file.png|jpg>` traces internally and adds `tracedFrom: { file, iou }` to its result. WebP gives
  `INVALID_INPUT` with "convert to PNG first".

- [ ] **Step 1: Failing tests.**
  - Render the synthetic `fold-n` fixture to a 552 px PNG with resvg; trace it; `silhouetteIoU` against the original
    SVG is ≥ 0.97 and `nodes` ≤ 60.
  - A two-colour fixture with `--colors 2` gives two faces whose colours are within ΔE 5 of the source fills.
  - A ring (with a hole) keeps its hole: the inside pixel is unpainted.
  - A JPEG of the same mark at quality 60 still reaches IoU ≥ 0.95.
  - `score` on the PNG returns `tracedFrom.iou ≥ 0.97`.
  - A 4000 × 4000 PNG traces in under 10 s.
- [ ] **Step 2: Run them; confirm they fail.** **Step 3: Implement.** **Step 4: `npm run ci`.**
- [ ] **Step 5:** Audit skill step 2: trace a raster asset first and score the trace, saying it is a trace (with its
  IoU). Commit `feat(trace): raster marks to SVG; score reads PNG and JPEG`.

### Task 2: `markilo rebuild` — clean geometry with a fidelity gate

A refresh needs "the same form, cleanly drawn". The field run wrote its own rebuild:

- circular and elliptical arcs and tangent points;
- one shared cut angle;
- IoU checks after each round: 0.98 for the trace, 0.97 for the clean rebuild, 0.94 for the geometric one.

`compare` was the fidelity meter, and the run called it the most useful command.

**Files:**

- Create: `src/geom/rebuild.ts`
- Modify: `src/cli/commands.ts` (new `rebuild`), `plugin/skills/design/references/cli.md`,
  `plugin/skills/design/references/construction.md`
- Test: `tests/rebuild.test.ts`

**Interfaces:**

- `rebuildPath(d: string, opts: { tolerance: number; angles?: number[] | 'auto'; arcs?: boolean }):
  { d: string; segments: { lines: number; arcs: number; cubics: number }; snapped: { angle: number; count: number }[] }`.
  - Split each contour at corners (turn above 35°) and fit each run as a line, then a circular arc, then a cubic: the
    first that fits within `tolerance`.
  - `angles: 'auto'` clusters line directions (within 3°) and snaps every line in a cluster of three or more to the
    cluster's mean. Explicit angles snap to the nearest given value within 4°.
  - Re-solve shared endpoints so contours stay closed and keep their winding.
- CLI: `rebuild <in.svg> -o <out.svg> [--against <orig.svg|png>] [--min-iou 0.95] [--tolerance px] [--angles
  auto|32,90] [--no-arcs]`. It prints `{ out, iou, nodesBefore, nodesAfter, segments, snapped }`. With `--against`
  and an IoU below `--min-iou` it writes nothing and exits 1 with the measured IoU.

- [ ] **Step 1: Failing tests.**
  - A traced circle (Task 1) rebuilds to one or two arcs and IoU ≥ 0.99.
  - The `fold-n` trace rebuilds with fewer nodes and IoU ≥ 0.96 against the original SVG.
  - Lines at 31.2°, 32.6° and 31.9° snap to one angle (`snapped[0].count === 3`).
  - `--min-iou 0.999` on a lossy input exits 1 and leaves no output file.
  - A ring keeps its hole and its winding (even-odd render unchanged).
- [ ] **Step 2–4.** **Step 5: Commit** `feat(rebuild): fit lines, arcs and curves, snap shared angles, gate on IoU`.

### Task 3: A refresh path — its own stage, and an equity mode for originality

The design skill explores three new proposals, then the user chooses, then it develops. A refresh only has one line
(`workflow.md:26`) and no stage, so the field run skipped proposals, gallery and critic. `finalize` was gated on
`insufficient-evidence` for the owner's own mark, in use for years (`kit.ts:333,340`). `lock` (`commands.ts:2583`) only
preserves unchanged files.

**Files:**

- Modify: `src/core/types.ts` (concept `equity`), `src/cli/commands.ts` (`concept update --equity`), `src/export/kit.ts`
  (originality gate), `src/export/guidelines.ts` (originality section wording), `plugin/skills/design/SKILL.md`,
  `plugin/skills/design/references/workflow.md`, `plugin/skills/audit/SKILL.md`
- Test: `tests/export.test.ts`, `tests/plugin.test.ts`

**Interfaces:**

- `concept update --equity "<since when and where the mark is in use>"` sets `concept.equity = { note, since? }`.
  `--equity none` clears it.
- `finalize` on a concept with `equity`:
  - `insufficient-evidence` or `needs-review` does not need `--accept-risk`;
  - `redesign` still fails;
  - the kit records `originality.equity: <note>`;
  - the guidelines say: "Continues an existing mark in use since …; originality was reported, not used as a gate."
- Workflow `refresh` stage (skill and `workflow.md`): audit → `trace` (or the existing SVG) → `rebuild` with
  `--against` and `--min-iou` → small-size question (Task 5) → layout options (`lockup`, `render --compare`) → rich
  rendering if the identity is metallic or gradient (Task 4) → verify → finalize with `--equity` → export. There are no
  three proposals and no critic unless the user asks. The gallery shows the rebuild beside the original.

- [ ] **Step 1: Failing tests.**
  - A concept with `equity` and `insufficient-evidence` finalizes without `--accept-risk` and the kit carries the note.
  - The same concept with a `redesign` verdict fails.
  - The guidelines HTML has the equity sentence.
  - Plugin text: the design skill and `workflow.md` name the refresh stage and `--equity`.
- [ ] **Step 2–5.** Commit `feat(refresh): a refresh stage and an equity mode for the owner's own mark`.

### Task 4: A rich rendering on a flat master

An intentional metallic identity (gradients, highlights, shadows) never passes `verify`:

- 54 % of edges are colour changes, so it fails one-colour reproduction;
- gradient stops 0.94 ΔE apart fail palette separation;
- a shadow stop "disappears on dark";
- 20+ colours are "not a palette role";
- the lockup is "complex".

These are not defects of the identity.

**Files:**

- Modify: `src/core/types.ts` (`files.rich: { symbol?, lockupHorizontal?, lockupStacked? }`), `src/cli/commands.ts`
  (`concept update --rich-symbol|--rich-lockup-horizontal|--rich-lockup-stacked <file|none>`), `src/analyze/quality.ts`
  (rich files: lint + `silhouette-match`), `src/export/exporter.ts` (rich variants in `logos/` and as icon art),
  `src/export/kit.ts`
- Test: `tests/quality.test.ts`, `tests/export.test.ts`

**Interfaces:**

- Every quality check runs on the flat masters, as today. A rich file gets `svg lint` plus `silhouette-match`
  (`silhouetteIoU` against its flat master):
  - pass at ≥ 0.97;
  - fail below 0.93;
  - warn between.

  Its colours do not count as palette roles.
- Export:
  - `logos/<role>/<role>-rich.svg|png` for each rich file;
  - `export --icon-art rich|flat` (default `flat`) chooses the art for app icons, banners and OG images;
  - `kit.files.rich` records it.

- [ ] **Step 1: Failing tests.**
  - A gradient copy of the `fold-n` symbol as rich art: `verify` on the concept has no new failures, and
    `silhouette-match` passes.
  - A rich file moved 15 % off the master fails `silhouette-match`.
  - Export writes `symbol-rich.svg/png`.
  - `--icon-art rich` puts the rich art in the iOS 1024 icon, `AppIcon-1024.png` (the pixel at the centre differs from the flat
    export).
- [ ] **Step 2–5.** Commit `feat(rich): a rich rendering checked against its flat master, exported beside it`.

### Task 5: Small sizes — ask early, show both

The default is the simplified small version. The question comes only at finalize (`design/SKILL.md:256`), and the owner
rejected it at the very end. Related 1.5.0 items, a stale `symbol-small` and `--small none`, were fixed in 1.6.0.

**Files:**

- Modify: `src/cli/commands.ts` (`render --small-compare`), `src/render/sheet.ts`, `plugin/skills/design/SKILL.md`,
  `plugin/skills/refine/SKILL.md`
- Test: `tests/sheet-labels.test.ts` (or `tests/small.test.ts`), `tests/plugin.test.ts`

**Interfaces:**

- `render --brand <slug> --concept <id> --small-compare -o <out.png>` draws two rows: "main symbol" and "small version".
  Each row shows 16 / 24 / 32 / 48 px on light and dark, with the labels the sheets use.
- Skill: when a develop or refresh pass makes a small version, show this board and ask `small|main` **before** any
  export or finalize. Record the answer with `concept update --small-sizes`. Never assume `small`.

- [ ] Failing test (board has both rows and the four sizes in its labels; skill text names `--small-compare` before
  finalize) → implement → commit `feat(small): show the main and small symbol side by side and ask before export`.

### Task 6: TV and store surfaces

The project needed several surfaces 1.7.0 does not make:

- Android TV banner 640×360 (xxhdpi);
- Play feature graphic 1024×500;
- Fire TV app icon 1280×720 and background 1920×1080;
- Samsung Tizen 512;
- LG webOS icons 80/130 and a 1920×1080 splash.

The rest are already made: iOS dark/tinted, the Android monochrome layer, Windows Square/Wide/Store/Splash tiles, the TV
banner at 320×180, `.ico` and `.icns`.

**Files:**

- Create: `src/export/tv.ts`
- Modify: `src/export/specs.ts` (sizes, each with the official source URL, as today), `src/export/exporter.ts` (a new
  `tv` group; Android TV xxhdpi banner and Play feature graphic join `android`), `src/export/deliverables.ts`,
  `docs/OUTPUTS.md`
- Test: `tests/export.test.ts`, `tests/deliverables.test.ts`

**Interfaces:**

- `EXPORT_GROUPS` gains `tv`, which contains:
  - `tv/firetv/` (icon 1280×720 and background 1920×1080);
  - `tv/tizen/icon-512.png`;
  - `tv/webos/` (icon 80, large icon 130, splash 1920×1080).
- `android` adds:
  - `res/drawable-xxhdpi/banner.png` (640×360);
  - `android/play-feature-graphic-1024x500.png`.
- Banners and splash screens use the primary lockup on the tile ground, inside a 10 % safe area. The lockup's text must
  stay at least 8 % of the banner height; if it cannot, the result carries a warning.
- `suggestDeliverables` proposes `tv` when the brief says TV, Fire, Tizen, webOS or Android TV.
- Before writing `specs.ts`, verify every size against the platform's current documentation and record the URL. If a
  size cannot be confirmed, leave it out and say so in the Progress record.

- [ ] Failing tests (each file exists at its exact pixel size; the text-height warning fires on a long wordmark; the
  `old kits export unchanged` test still passes) → implement → commit `feat(export): TV and store surfaces`.

### Task 7: `install-assets --framework android` reads the project's own resources

Android needs its exact names and densities:

- `ic_launcher_foreground` at 108 dp per density;
- the manifest's `android:banner`;
- the app's own `brand_lockup_wide` 240×87 dp.

`install-assets` knows next, laravel, flutter and static (`frameworks.ts:46`).

**Files:**

- Modify: `src/cli/frameworks.ts` (`android` framework: detect `app/src/main/AndroidManifest.xml` or `res/`),
  `src/cli/commands.ts` (`install-assets`), `docs/INTEGRATIONS.md`
- Test: `tests/frameworks.test.ts`

**Interfaces:**

- The profile reads:
  - `AndroidManifest.xml` for `android:icon`, `android:roundIcon` and `android:banner`;
  - every `res/{mipmap,drawable}-*dpi/` file whose name the manifest or `ic_launcher*` references.

  It maps each to the matching exported file and density. Same name, same pixel size from the density table.
- Unknown project drawables (e.g. `brand_lockup_wide`) are listed under `unmatched` with their current pixel size, and
  `--map <name>=<export path>` renders that export at that size.
- Dry run by default. `--apply` writes. Existing files are replaced only with `--force` (current rule).

- [ ] Failing tests on a synthetic Android project fixture (manifest + mipmaps + a custom drawable) → implement →
  commit `feat(install): an Android profile that keeps the project's names and densities`.

### Task 8: `render` for batch work, padding and zoomed before/after

Several gaps slowed the run:

- **Batch rendering.** The pre-approved one-command-per-call form forbids loops, yet the run had to render 17 masters,
  or 3 sizes × 4 colourways.
- **Edge-tight renders.** A plain render of a wordmark touches the image edge, because the viewBox is the tight ink
  box (`wordmark.ts:145`).
- **Annotated feedback.** The owner's notes were screenshots with arrows, and the run built a PIL board by hand every
  round.

**Files:**

- Modify: `src/cli/commands.ts` (`render`, `wordmark`), `src/render/sheet.ts`
- Test: `tests/sheet-labels.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- `render <a.svg> <b.svg>… --out-dir <dir> [--width] [--bg]` writes one PNG per input (same base name). It returns
  `{ files: [...] }`. `-o` with several inputs and without `--compare` is an error naming `--out-dir`.
- `render --pad <percent>` and `wordmark --pad <units>` add margin. The default is 0, so existing output stays
  byte-identical.
- `render <before.svg> <after.svg> --compare --zoom x,y,w,h[:label]` (repeatable; coordinates in the before file's
  viewBox) adds a row per zoom: the same crop of before and after side by side at 4×, with the label.

- [ ] Failing tests (three inputs → three PNGs; `--pad 10` grows the PNG and keeps the art centred; `--zoom` adds a
  labelled row) → implement → commit `feat(render): batch output, padding and zoomed before/after crops`.

### Task 9: Lettering operations on outlines

"Draw, don't typeset" is right, but there is no tool for it. The run used shapely to:

- cut free terminals at a shared angle;
- open a slit at a bowl join;
- point an apex;
- clean up slivers.

**Files:**

- Modify: `src/construct/compile.ts` (new ops), `plugin/skills/design/references/construction.md`, `cli.md`
- Test: `tests/construct.test.ts`

**Interfaces:**

- `{ "op": "cut-terminals", "of": "<glyph or path id>", "angle": 32, "where": "top|bottom|both", "minLength": 4 }`.
  Finds horizontal end segments of stems within 2 % of the cap line or baseline and replaces each with a cut at
  `angle`. It keeps the stem's area within ±3 % and never cuts a bowl.
- `{ "op": "slit", "of": "<id>", "from": [x, y], "to": [x, y], "width": 3 }`. Subtracts a thin rotated rectangle, so a
  designer can detach a bowl or open a join at a point they choose.
- Results drop contours under 0.05 % of the glyph's area (slivers).

- [ ] Failing tests (an "H" from the bundled Sora gets four cut ends at 32°, area within ±3 %; a slit across a "P" bowl
  leaves two contours) → implement → commit `feat(construct): cut-terminals and slit for custom lettering`.

### Task 10: Turkish boards and guidelines, in-situ photos, single-agent cost

**i18n:** the HTML pages switch to Turkish, but the PNG boards (`render --sheet/--compare`, proposal and sketch boards)
and `guidelines.md` are English only. **Audit:** the run's best evidence was a photo of the real TV home screen, and
Markilo has no place for it. **Cost:** the cost steps assume agent runs.

**Files:**

- Modify: `src/render/sheet.ts`, `src/design/rounds.ts` (board labels via `TR`), `src/export/guidelines.ts`
  (`guidelines.md` in the brief's language), `src/cli/commands.ts` (`--lang en|tr` on `render`, `proposals`,
  `sketches`, `export`; the default is `tr` when the brief's first `audience.languages` entry is Turkish), `reference add --category in-situ`,
  `plugin/skills/audit/SKILL.md`, `plugin/skills/design/SKILL.md` (cost for single-agent sessions:
  `cost --session-usd`)
- Test: `tests/sheet-labels.test.ts`, `tests/export.test.ts`, `tests/research.test.ts`

**Interfaces:**

- Board labels come from the same `TR` dictionary as the HTML pages; a label without an entry stays English.
- In-situ photos:
  - `in-situ` references are stored and listed;
  - originality never compares them;
  - the audit skill reads them and asks the agent to measure the mark's real size and contrast in them (`analyze`
    on a crop).

- [ ] Failing tests (a `--lang tr` sheet contains Turkish labels; `guidelines.md` in Turkish for a `tr` brief; an
  `in-situ` reference is excluded from `originality`) → implement → commit
  `feat: Turkish boards and guidelines, in-situ references, single-agent cost`.

### Task 11: Research and family items parked from 1.6.0

Four items are still open:

- **Loose family-hint stem matching.** `familyHintOf`, `site.ts:599`, matches sibling names by a loose stem.
- **Non-Latin mark names drop a family lockup.**
- **Nested hidden-text tags.** `withoutHiddenText`, `site.ts:517`, removes only innermost matching tags, so `<span
  class="sr-only"><b>Name</b></span>` leaves the name.
- **The I4 residual.** Tightly kerned overlapping pairs can still read as a form change in `wordmarkIoU`.

**Files:** `src/research/site.ts`, `src/research/family.ts`, `src/core/paths.ts`, `src/analyze/silhouette.ts`

- [ ] Failing tests:
  - `acme-mail` and `acme-maps` siblings of `acme`, but `acmeco` is not;
  - a family whose member name is `Ναύς` keeps its lockup (slug from the transliteration or an explicit `--slug`);
  - nested hidden spans are removed;
  - a word whose `r`+`n` overlap after kerning does not warn when only the kerning changed.

  Then implement and commit `fix(research): family stems, non-Latin members, nested hidden text; kerned pairs`.

### Task 12: Colour and gate items parked from 1.6.0

- **Colours inside `<style>` blocks** are missed by recolouring (`recolorSvgText`, `commands.ts:233`) and by palette
  checks.
- **A palette-only change makes the critique stale.** `artHash` hashes the files after recolouring, and a pure recolour
  is not a form change.
- **A navy icon with a black word still warns** palette separation. The single-colour rule at `quality.ts:253` needs
  ΔE < 10 or all neutral, and navy against black is about 12.

**Files:** `src/cli/commands.ts`, `src/analyze/color.ts`, `src/analyze/quality.ts`, `src/report/gate.ts`

**Interfaces:**

- Recolour and palette checks read `<style>` rules (`fill:`/`stroke:`/`stop-color:` hex values).
- The gate keeps a critique when the artwork changed only by an exact colour map recorded in `paletteHistory`. Compare
  the hash of the art with colours normalized to their roles.
- Single-colour rule: dark (L* < 30) and neutral, or within ΔE 15 of each other.

- [ ] Failing tests for each (style block recoloured; critique kept after `--primary` change; navy + black passes) →
  implement → commit `fix(colour): style blocks, recolours keep the critique, dark lockups read as one colour`.

### Task 13: Gallery minors deferred from 1.7.0

- **Arrow keys.** They switch the first group, not the focused one, and do not move focus or update the hash.
- **Duplicate proposal ids.** `slug-key` can collide across brands (`acme` + `pro-x` vs `acme-pro` + `x`).
- **Tile "!" flag.** It has no accessible name.
- **Colour test.** It trusts the token table instead of checking that each token is paper, ink or oxblood, or a mix of
  them.
- **Missing tests.** No test runs the client's copied text against `feedbackText`. None covers the originality flag,
  and none covers rejected and older rounds on the board.

**Files:** `src/gallery/client.ts`, `src/gallery/cards.ts`, `src/ui/chrome.ts`, `tests/ui.test.ts`,
`tests/gallery-feedback.test.ts`

**Interfaces:**

- Proposal ids become `<slug>--<key>`. `--` cannot occur in a slug or a concept id. Keep a redirect: the client also
  accepts the old `#slug-key` hash.
- Arrows act on the group containing `document.activeElement` (else the group nearest the viewport top). They move
  focus to the new proposal's `h3`, which gets `tabindex="-1"`, and update the hash.
- `.tile-flag` gets `role="img"` and an `aria-label` from `ta('aria-label', …)`.
- Colour test: every token is paper, ink or oxblood, or lies within ΔE 3 of the paper–ink line.
- The copied-text test evaluates `GALLERY_SCRIPT`'s `requests` and `text` in a `vm` sandbox, with a stub
  `document`/`location`, and compares them with `feedbackText` for the same decisions.

- [ ] Failing tests → implement → commit `fix(gallery): focus-aware arrows, unique ids, flag label, stricter tests`.

### Task 14: Skill and agent text

- **Design skill:** the refresh stage (Task 3); ask about small sizes early (Task 5); `rich` art (Task 4); `--lang`
  (Task 10); `render --out-dir` instead of loops (Task 8).
- **Audit skill:** trace rasters, then score (Task 1); read in-situ photos (Task 10).
- **`cli.md`:** the new commands and flags. Table rows keep their cell count (existing test).
- **concept-designer agent, develop mode:** `rebuild` for geometric clean-ups, and `cut-terminals`/`slit` for
  whole-word treatments.

- [ ] Plugin test asserting each mention, then commit `docs(skills): refresh stage, trace and rebuild, rich art, early
  small-size question`.

### Task 15: Release 1.8.0

- [ ] Version 1.8.0 in `package.json`, `package-lock.json` (lines 3 and 9), `plugin/.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`; a CHANGELOG entry.
- [ ] Release check with the built CLI:
  - trace a PNG of a synthetic mark, rebuild it with `--against` and `--min-iou 0.95`;
  - finalize with `--equity`;
  - add a rich symbol;
  - export `--all` with `tv`;
  - run `install-assets --framework android` on the fixture project (dry run).

  Re-export Markilo's own kit: its logo files must be byte-identical.
- [ ] `npm run ci`, `node scripts/smoke.mjs`, `claude plugin validate plugin`.
- [ ] Ask the user before the tag, the GitHub release and `npm publish` (the user publishes).

## Not in 1.8.0

| Request                                                          | Why not now                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `detach-bowl` and `point-apex` as automatic lettering operations | They need glyph-structure detection that is not calibrated; Task 9's `slit` and `cut-terminals` let a designer do both at a chosen spot. |
| WebP input                                                       | No decoder without a new dependency; the error says to convert to PNG.                                                                   |
| A full refresh run without a designer (one command)              | Every step needs the owner's eye (fidelity, small sizes, layout); Task 3 makes them a stage with commands, not an automation.            |
| Measuring contrast inside an in-situ photo automatically         | Needs locating the mark in a photo; the audit crops it with `analyze` instead.                                                           |
| The three cosmetic nits from the 1.6.0 review                    | Not recorded in detail when parked; they return if they show up again.                                                                   |

## Sources

- **Field report on 1.7.0 (2026-11-18).** A single agent refreshed a raster logo for a TV and mobile media app. The
  owner approved the result and got a 182-file kit, built by the agent's own script. Its findings map to tasks:
  1 → Task 1, 2 → Tasks 1–2, 3 → Task 3, 4 → Task 4, 5 → Task 3, 6 → Task 5, 7 → Task 6, 8 → Task 7, 9–10 and 12 →
  Task 8, 11 → Task 9, 13 and the small notes → Task 10.
- **Parked from 1.6.0** (`docs/RELEASE-1.6.md`, Progress record) → Tasks 11–12.
- **Deferred from 1.7.0** (`docs/superpowers/plans/2026-11-16-gallery-redesign.md`, Progress) → Task 13.

## Execution

Dependency waves (at most four parallel worktrees):

- **Wave 1:** Task 1, Task 6, Task 7, Task 11.
- **Wave 2:** Task 2 (needs Task 1), Task 8, Task 12, Task 13.
- **Wave 3:** Task 3 (needs 1–2), Task 4, Task 5, Task 9, Task 10.
- **Then:** Task 14, one whole-branch review, one fix wave, Task 15.

## Progress record

(filled in during the work)
