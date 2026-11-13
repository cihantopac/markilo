# Markilo 1.6.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep what the user chose. Two full identity runs on 1.5.0 ended with the user going back to the drawing
they first picked, after a develop pass and the critic's fixes changed its form without asking. One shipped 71 files in
a colour the user had replaced. Arcs drawn by a designer came out bent. Research read drawn family words as typed text
and missed the family's sibling sites. In 1.6.0 colour changes reach the master files and stale colours fail
finalize. Form changes are measured and shown to the user before they are applied. A rejected pass can be reverted
with one command. Critiques survive a revert. Arcs are exact. A third source, a headless integration, needs exit codes
and non-Latin names.

**Architecture:** No new modules except one small one, `src/analyze/silhouette.ts` (silhouette IoU on resvg alpha
masks). Everything else changes existing code:

- `geom/refit.ts` (conics)
- `concept update` / a new `concept revert` in `cli/commands.ts`
- `design/rounds.ts` (`chosen/`, `chosen-vs-now`)
- `analyze/gate.ts`, `analyze/quality.ts`
- `research/site.ts`, `research/family.ts`, `research/competitors` logo picking
- `design/glyphs.ts`
- `export/kit.ts`, `report/cost.ts`, `report/evidence.ts`, `core/paths.ts`, `cli/main.ts`
- skill and agent text

No new dependencies.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, esbuild bundle in
`plugin/dist/markilo.mjs`.

**Spec:** the field reports on 1.5.0 and one set of integration notes, summarized in [Sources](#sources):

- Two products joining one family whose words are custom-drawn: a publishing brand and a developer-tool brand.
- One headless integration that drives the CLI without designer agents (written on 1.2.0, rechecked on 1.5.0).

Each claim was checked against the code at `b18d85d`.

## Global Constraints

- No new runtime or dev dependencies; no i18n framework.
- Everything runs offline except commands given `--allow-network`; generated HTML keeps its CSP (nonce for the
  gallery, `sha256-` hash for the kit and guidelines pages).
- Locked identities are reproduced byte-for-byte; no task may change a locked brand's artwork.
- Every CLI command prints JSON on stdout; progress and diagnostics go to stderr.
- Tests, fixtures and examples use synthetic brands only (Acme, Tidepool, Lumen, Ledger, Nimbra); no real product names.
  Fixtures are drawn for the tests, never copied from a real logo or site.
- Files, reports and code stay in English. New interface strings in the HTML pages get a Turkish entry in
  `src/ui/tr.ts`; the `tests/ui.test.ts` key scan enforces it.
- After every task, `npm run ci` passes (biome, typecheck, tests, build, dist check). `plugin/dist/markilo.mjs` is rebuilt
  and committed with any source change. Run `npm run build` before the CLI tests that use the bundle.
- Commits stage explicit paths only (never `git add -A`) and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Parallel agents work in worktrees and do not stage `plugin/dist`; the controller merges and rebuilds it. One
  whole-branch review at the end, then one fix wave.
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 12).

## Review Focus

1. **Arcs (Task 1)** change the outlines of any new drawing that goes through PathKit with arcs; that is the fix. A kit
   finalized before 1.6.0 must still export byte-identical logos: the `old kits export unchanged apart from the new
   files` hash test passes unchanged. If it fails, export is re-processing finished masters through PathKit, and that
   path must keep the stored outlines.
2. **Recolouring (Task 2)** touches only an unlocked concept's own files, replaces exact colour matches only, and
   reports every file it changed. A locked brand is never recoloured.
3. **Revert (Task 4)** restores files from `chosen/` and never deletes the user's other drawings; it only unregisters
   them.
4. **Gate wording (Task 5)** renames a status value in `brand.json`. Readers of older kits must accept both
   `failed` and the new value.
5. **Research (Task 6)** still reads only the given page and its cached same-site pages; outbound links are recorded,
   never fetched without `--allow-network` and an explicit command.
6. **Exit codes (Task 10)**: `svg lint` exits 1 on a failing file but still prints the full JSON on stdout.

---

### Task 1: Arcs are drawn exactly

A designer's letter C, given as two SVG arcs, came out of `family word --draw` bulging into the next letter; the same
shape as a polyline was right. Reproduced on `b18d85d`: `drawnGlyph` returns a top of −107 for a C whose arcs stay
within −100…0, and an on-curve point 61.8 from the circle's centre instead of 50. PathKit's own bounds are right
(−100…0). The fault is `refitPath` (`geom/refit.ts:261-265`): Skia emits arcs as **conics** (a quadratic with a weight;
w ≈ 0.707 for a quarter circle). `refitPath` drops the weight and writes them as plain quadratics, which bulge
outward. Every PathKit output with arcs is affected: `booleanOp`, `transformPath`, the construct compiler and preview.

**Files:**

- Modify: `src/geom/refit.ts` (the conic branch)
- Test: `tests/refit.test.ts` (new or extended), `tests/glyphs.test.ts`

**Interfaces:**

- Conic verbs are split into quadratics with Skia's rule, or converted to cubics within the existing tolerance (~0.05 %
  of the diagonal): subdivide at t = 0.5 until the rational curve is within tolerance. Read the weight from `c[5]`.
  Quad verbs stay as they are.

- [ ] **Step 1: Write the failing tests.**
  - `a circle through booleanOp stays a circle`: `M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z` after `booleanOp('union')`.
    Sample 64 points on the output; every point is within 0.1 of radius 50, and the bounds are 0…100.
  - `drawnGlyph keeps an arc C inside its cap`: the reported C (`M74 -93.86A50 50 0 1 0 74 -6.14L74 -31.17A33.6 33.6 0 1 1
    74 -68.83Z`, viewBox `-1 -100 78 100`) gives `top ≥ −100.5` and `bottom ≤ 0.5`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all tests.** Fix any snapshot that changes only because an arc is now exact. Name each changed
  snapshot in the commit body.
- [ ] **Step 5: Commit** `fix(geom): convert PathKit conics with their weight so arcs stay round`.

### Task 2: A colour change reaches the master files, and stale colours fail finalize

`concept update --primary '#2b3a52'` changed the palette, but `symbol.svg` and the lockups kept `fill="#3d5a80"`.
`finalize` and `export` produced 71 files in the old colour without a warning, and the session found it in
`overview.png`. `groundColourWarnings` (`commands.ts:139-163`) only looks for ground colours in the masters, never for
a colour that is no longer in the palette. A second run asked for one rule for the family word's colour:

- `family glyphs` writes `#111111` from `currentColor`.
- The designers moved the word to the primary colour, against the brief.
- The user wanted the dark ink.

**Files:**

- Modify: `src/cli/commands.ts` (`concept update`, `verify`, `finalize`, `family word`), `src/design/glyphs.ts`
  (fill), `plugin/skills/design/references/cli.md`
- Test: `tests/cli.test.ts`, `tests/glyphs.test.ts`

**Interfaces:**

- **Recolouring.** `concept update` with `--primary|--secondary|--accent|--ink <#hex>` on an unlocked concept rewrites
  that role's old colour to the new one in every registered concept file (symbol, wordmark, small, wordmark-small,
  lockups):
  - exact matches only, after `normalizeColor`;
  - fill, stroke and stop-color attributes and style declarations.
  - The result gains `recolored: { file, from, to, count }[]`.
  - `--no-recolor` keeps the files as they are.
  - When two roles share the old colour, only the role being changed moves, and a warning names the files it changed.
- **Colour check.** `masterColourCheck(w, brand, id)` lists the colours used in each master that are not in the
  allowed set. The allowed set is:
  - the palette roles: primary, secondary, accent, ink, paper, onDark, onLight, onBrand, tile;
  - `currentColor`, `none`, white and black;
  - stops inside a gradient whose end colours are in the palette.
- **Where it applies.**
  - `verify` reports the colour check as a warning.
  - `finalize` fails with `INVALID_INPUT` and the list ("symbol.svg uses #3d5a80, which is not in the palette — run
    `concept update --primary <#hex>` to recolour, or add it as a role").
  - `--accept-colours` finalizes anyway and records the colours in the kit's `warnings`.
- **Family word colour.** `family word` takes `--fill <#hex>` (default `#111111`) and writes it on the word. The skill
  says to pass the concept's ink (Task 11), so the family word follows the family's dark ink, not the primary. The
  colour check then flags a word left in `#111111` when ink differs.

- [ ] **Step 1: Write the failing tests.**
  - `primary change recolours the masters`: concept with symbol and lockup in `#3d5a80` → `concept update --primary
    #2b3a52` → both files use `#2b3a52`; `recolored` lists them.
  - `--no-recolor keeps files`.
  - `finalize fails on a stale master colour`, passes with `--accept-colours` and lists it in `warnings`.
  - `family word --fill` writes the given fill.
- [ ] **Step 2: Confirm they fail. Step 3: Implement. Step 4: Confirm they pass.**
- [ ] **Step 5: Commit** `fix(concept): recolour masters with the palette; finalize refuses colours outside it`.

### Task 3: Develop keeps the chosen form unless the user agrees to change it

The worst moment in both runs:

- **Run 1.** The user said "develop", meaning craft fixes. The develop agent changed the form. The skill's "apply the
  critic's fixes once" then made a second form change (a page fold, different cut ends) without showing the user. The
  ±10 % ink rule did not catch it (ink ratio 0.396 vs 0.397, a different mark).
- **Run 2.** The critic's five fixes improved every measure but turned a flowing tail into an angular ribbon and a drop
  into a ring. The user reverted, and about 16 agent-minutes were lost.

The user in the second run also answered "what is missing?" questions twice with "I can't tell without seeing — draw
three".

**Files:**

- Create: `src/analyze/silhouette.ts`
- Modify: `src/design/rounds.ts` (where `review/chosen-vs-now.png` is written), `src/cli/commands.ts` (the commands that
  return it), skill text in `plugin/skills/refine/SKILL.md` and `plugin/skills/design/SKILL.md`, agent text in
  `plugin/agents/design-critic.md` and `plugin/agents/concept-designer.md`
- Test: `tests/silhouette.test.ts`, `tests/rounds.test.ts`

**Interfaces:**

- **`silhouetteIoU(a, b)`.** Takes two SVGs, renders each with resvg at 256 px on transparent, fitted to its own ink
  box, and returns the intersection over union of the alpha > 0.5 masks (0…1).
- **`formChange`.** Wherever `chosen-vs-now.png` is made, the result gains `formChange: { symbol?: number,
  wordmark?: number }`, one IoU per file in `chosen/`.
  - Below **0.85**, `warnings` reads: "the symbol's form changed from what the user chose (IoU 0.72) — show
    chosen-vs-now and ask before going on".
  - Calibrate the threshold on the test fixtures: a 5 % stroke-weight change stays above 0.9, and a cut moved or a
    terminal reshaped falls below 0.85. Record the calibration in the test.
- **Skill: before develop, ask the scope as one multiple-choice question.** The options are:
  - craft only (optics, spacing, small sizes; form unchanged) — the recommended option;
  - a small revision of named parts;
  - the form may change.
    When the user cannot say what is missing, offer three visual probes instead of a diagnosis question.
- **Critic fixes are labelled.**
  - The critic labels each fix `craft` (invisible at a glance) or `silhouette` (changes what the mark is).
  - Craft fixes may be applied once, as now.
  - Silhouette fixes are shown one by one as before/after probes and applied only on the user's yes.
  - Traits the user named as liked (the skill records them in `answers` as "protect: …") go to the critic and the
    designer as protected.
- **Forbidden readings.** A reading the user forbade (e.g. "no letter as the icon") is passed to the critic. If the
  critic's first read matches it, the presentation names it.

- [ ] **Step 1: Write the failing tests.** IoU of a shape with itself = 1. A 5 % thicker stroke ≥ 0.9. A moved cut
  < 0.85. `chosen-vs-now` returns `formChange` and the warning.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Edit the skill and agent text as above. Keep the "advice, never a gate" stance: the user still
  decides.
- [ ] **Step 6: Commit** `feat(develop): measure form change against the chosen drawing; critic fixes labelled craft or silhouette`.

### Task 4: `concept revert --to chosen` and `--small none`

Both sessions reverted by hand (`cp chosen/symbol.svg …`). A rejected pass's `symbol-small.svg` stayed registered and
was listed in the kit with `smallSizes: main` (`kit.ts:272`; export ignores it, but the kit is misleading). One
session also found it copied to `final/`. `concept update --small none` fails with `NOT_FOUND: none is not in the
concept folder`.

**Files:**

- Modify: `src/cli/commands.ts` (new `concept revert`; `--small`/`--wordmark-small none`), `src/design/rounds.ts`,
  `src/export/kit.ts`, finalize's copy into `final/`, `plugin/skills/refine/SKILL.md`, `references/cli.md`
- Test: `tests/cli.test.ts`, `tests/kit.test.ts`

**Interfaces:**

- **`concept revert --brand <slug> --concept <id> --to chosen [--note "<the user's words>"]`.** It does these, in
  order:
  1. Copies every file in `chosen/` back over the concept's registered file of the same name.
  2. Unregisters the files `chosen/` does not have: small, wordmark-small and lockups made after the choice. It never
     deletes them; it moves them to `rejected/<timestamp>/`.
  3. Removes `review/chosen-vs-now.png` and appends a dated entry to `decisions.md` with the note.
  4. Restores an earlier critique when the artwork matches it again (Task 5).
  5. Returns `{ restored: [], unregistered: [], movedTo }`.
- **`--small none` / `--wordmark-small none`** unregister the file.
- **The kit.** It lists `files.symbolSmall` only when `smallSizes !== 'main'`, and finalize does not copy the small
  file in that case.

- [ ] **Step 1: Failing tests:** revert restores the symbol byte-for-byte and unregisters the small file; `--small none`;
  a kit with `smallSizes: main` has no `symbolSmall` and `final/` has no small file.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Commit** `feat(concept): revert to the chosen drawing; --small none; kit drops the unused small file`.

### Task 5: A critique survives a revert, and the gate says "below threshold"

The critic scored V1. The fixes made the gate `stale`. The user went back to V1, which was byte-identical (checked with
`cmp`), yet finalize said "a critic ran … but its scores were not recorded". The session re-entered the scores by
hand. The kit also says `gate.status: "failed"` with `next: "present-with-notes"`, which reads as a rejection; the
skill calls the critique advice. The same complaint came on 1.3.0. In one run the critic agent said it had recorded
its scores, but the gate stayed `not-reviewed`.

**Files:**

- Modify: `src/analyze/gate.ts`, `src/core/types.ts`, `src/cli/commands.ts` (critique recording, the `:327` warning),
  `src/export/kit.ts`, the gallery and guidelines readers, `plugin/agents/design-critic.md`
- Test: `tests/gate.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- **Critique history.** Recording a critique keeps the previous ones in `concept.critiques[]`, each with its
  `reviewedArt` hash. When the current artwork hash equals an earlier entry's hash, that critique becomes current
  again (status from `stale` back to its value), and the result says "restored the critique of <date>".
- **Gate wording.** The gate status `failed` becomes `below-threshold`. Readers accept `failed` from older kits as
  the same thing, and the CHANGELOG notes the rename under Changed. `next` is unchanged.
- **The critic records its own scores.** The critic agent ends by running `concept update --blind … --present …` and
  checks that it exits 0 with `changed` and a `gate` that is not `not-reviewed` (there is no `ok` field; errors go to
  stderr as `{ error }`). If the check fails, it reports the error instead
  of saying "recorded".

- [ ] **Step 1: Failing tests:** score → change art → stale → restore the identical art → the gate is back with the old
  scores; a kit has `below-threshold`; an old kit with `failed` still reads.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Commit** `fix(gate): restore a critique when the art returns to it; below-threshold instead of failed`.

### Task 6: Research sees drawn family words and the family's sibling sites

- **Both runs: drawn words read as typed text.** `research family` returned `nameRendering: live-text` and
  `systems.outlined: []` for every member, although each member draws its word as `<path fill="currentColor">`
  (per-letter paths in transformed `<g>`). The likely cause is `textBesideSvg` (`site.ts:504`). It counts any letters
  beside the SVG in the home link or logo wrapper, including a visually hidden name for screen readers.
- **Both runs: no family hint.** `familyHint` was not set. One page had a `data-lockup-art` mark and five sibling
  domains in the footer. The other had a "family" heading, a JSON-LD organization named after the parent and six
  sibling domains. `familyHintOf` (`site.ts:529-552`) uses only `sameAs` or ≥ 2 `data-lockup*` SVGs. Both sessions
  found the siblings with curl.
- **Reference ids.** Ids are `<host>-<n>` from the page where a mark was found, so another member's lockup can carry the
  parent's host.

**Files:**

- Modify: `src/research/site.ts` (`nameRenderingOf`, `textBesideSvg`, `familyHintOf`, the cached page record),
  `src/research/family.ts` (reference ids)
- Test: `tests/research-net.test.ts`, `tests/research-family.test.ts`, fixtures under `tests/fixtures/site/` (synthetic
  Nimbra pages)

**Interfaces:**

- **Hidden text does not count.**
  - Text inside an element with a visually-hidden class (`sr-only`, `visually-hidden`, `screen-reader-text`,
    `u-hidden-visually`) or an inline style that clips it (`clip`, `clip-path: inset(50%)`, 1 px size) does not count
    as text beside the SVG.
  - Neither does `aria-label` / `title` on the link.
  - An SVG with `data-lockup*` or `role="img"` and filled paths inside the home link is `outlined`.
- **Outbound links.** The cached page record keeps the outbound link hosts it saw: `outboundHosts: string[]`, with
  social hosts filtered as now.
- **More family hints.** `familyHintOf` also returns a hint when either holds:
  - 2 or more outbound hosts share a name stem of at least 3 letters with the page's host or the JSON-LD organization
    name (e.g. `nimbra-loop.test`, `nimbradock.test` for `nimbramail.test`);
  - the JSON-LD organization name differs from the product name and matches an outbound host.
    `siblings` lists those hosts. `hub` is the organization's host when known, else the first sibling.
- **Reference ids.** An id is taken from the mark itself when it has a name (`data-lockup-art`, `aria-label`, `<title>`,
  the file name), slugged, then `-<n>` when taken. The host form remains the fallback. Existing references keep their
  ids.

- [ ] **Step 1: Failing tests:**
  - a home link with an outlined word SVG and an `sr-only` name → `outlined`;
  - a footer with three `nimbra*` hosts → `familyHint.siblings`;
  - `data-lockup-art="nimbra-loop"` → reference id `nimbra-loop-1`.
- [ ] **Step 2–4:** fail, implement, pass. The live-text tests from 1.5.0 still pass.
- [ ] **Step 5: Commit** `fix(research): hidden names do not make a drawn word live-text; family hint from sibling links; ids from the mark`.

### Task 7: Glyph checks — outliers and stems that differ between sources

- **Silent bad split.** `family glyphs` merged a symbol into one member's word: the O got an advance of 163, another
  letter 214, and V a left sidebearing of 51 (cap = 100). The command still succeeded, because the number of groups
  matched the letters.
- **Stem differences.** `family word` took letters from three members without reporting that the parent's O stem was
  ≈ 12.6 and the siblings' stems ≈ 17.

**Files:**

- Modify: `src/design/glyphs.ts`, `src/cli/commands.ts` (`family glyphs`, `family word`), `references/cli.md`
- Test: `tests/glyphs.test.ts`

**Interfaces:**

- **`family glyphs` warns about outliers.** A glyph whose advance is more than 1.8× the median advance of the word, or
  whose sidebearing is more than 0.35 cap, gets a `warnings` line naming the letter. When `--part auto` was used, the
  line adds "the symbol may be merged into the word — try `--part word`". The split is still written.
- **`family word` reports stems per source.** The result gains `sources: { ref, letters, stem, bar }[]`. When the stems
  of two sources differ by more than 15 %, `warnings` reads "stems differ between <ref> (12.6) and <ref> (17.0) — 26 %".

- [ ] **Step 1: Failing tests:** a fixture word with a merged circle → an outlier warning; two fixture sources with
  stems 12 and 17 → a stem warning.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Commit** `feat(family): warn on glyph outliers and stem differences between sources`.

### Task 8: Competitor logos, early proposal letters, and small verify messages

**Competitor logos.** These were picked as logos:

- a menu close (X) icon;
- a social icon (TikTok) for a category leader;
- a review-site badge (`…/otherbrandlogos/g2.svg`).

One "icon" was a person's photo. Leaders without a usable logo are not reported, and originality stayed
`insufficient-evidence`.

**Proposal letters.** The early-shown `proposal.png` prints the round letter before `proposals` fixes the order.

**Verify messages.**

- "Artboard fit 80 %" warns at the stated 80–98 boundary, because the message rounds 79.6 up to 80.
- A one-colour lockup (dark icon + black family word) gets "palette separation" and "lightness contrast" warnings.

**The tile row.** One session said `render --compare --tile --primary '#d4561c'` drew the tile row navy. The code
passes `--primary` to `tileGround` (`variants.ts:149`), so this is not reproduced yet.

**Files:**

- Modify: the competitor logo picker (`src/research/` — the candidate filter used by `research competitors`),
  `src/cli/commands.ts` (`research competitors` result, `proposals`), the `proposal.png` renderer,
  `src/analyze/quality.ts` (artboard fit message, palette separation), `src/render/sheet.ts`
- Test: `tests/research-net.test.ts`, `tests/quality.test.ts`, `tests/sheet.test.ts`

**Interfaces:**

- **Candidate filter.** The logo candidate filter rejects:
  - paths or names containing `g2`, `capterra`, `trustpilot`, `badge`, `otherbrandlogos`, `partners`, `clients`;
  - social names (`tiktok`, `facebook`, `instagram`, `linkedin`, `youtube`, `x-twitter`, `twitter`);
  - SVGs whose `aria-label`, `title` or class says close, menu, hamburger, chevron or arrow.
    `research competitors` returns `missingLogos: string[]` for competitors left without a candidate, and a warning that
    names them.
- **Proposal letters.** `proposal.png` written before `proposals` runs is titled "Round <n>" without a letter;
  `proposals` re-renders it with the letter.
- **Artboard fit.** The message prints one decimal ("79.6 %").
- **One-colour lockups.** Palette separation and lightness contrast are skipped for a lockup whose colours are all
  neutral or one hue (ΔE00 < 10 between them), with a `pass` line "single-colour lockup".
- **The tile row.** Write a test that renders `--compare --tile --primary #d4561c` and samples the tile ground pixel. If
  it is not `#d4561c`, fix it. If it is, record "not reproduced" here.

- [ ] **Step 1–4:** failing tests for each point, implement, pass.
- [ ] **Step 5: Commit** `fix(research,verify): skip badges, social and UI icons as logos; quiet one-colour lockups; letters after proposals`.

### Task 9: Cost — working time apart from waiting, and trademark searches

- **Wall time includes waiting.** `wallMinutes` runs from the first entry to the last (`cost.ts:109-117`). In one run
  it was 136 minutes, mostly the user's thinking time, so a 90-minute budget warned falsely.
- **Resumed agents.** An agent's reported tokens are cumulative while `duration_ms` is per part, and the skill only
  says "cumulative".
- **Trademark searches.** A trademark search done with WebSearch was logged as a `search` source, so the kit said "no
  registry searches logged" (`evidence.ts:97`).

**Files:**

- Modify: `src/report/cost.ts`, `src/report/evidence.ts`, `plugin/skills/design/SKILL.md` (usage recording),
  `references/cli.md`
- Test: `tests/cost.test.ts`, `tests/evidence.test.ts`

**Interfaces:**

- **Two time figures.**
  - `busyMinutes` is the union of the entries' intervals `[at − minutes, at]`.
  - `elapsedMinutes` is the old first-to-last span.
  - The budget compares `busyMinutes`.
  - `wallMinutes` stays as an alias of `elapsedMinutes` for one release, marked deprecated in `cli.md`.
- **Registry sources.** A `search` source whose URL host is a trademark registry (USPTO, EUIPO, WIPO, TÜRKPATENT,
  UKIPO, and the JPO and CNIPA hosts) counts as a registry search.
- **Skill: recording a resumed agent.** Record minutes per part. Record tokens as the difference from the previous
  part, or the total once at the end — never both.

- [ ] **Step 1–4:** failing tests (two entries 60 min apart, 10 min each → busy 20, elapsed 70; a WIPO URL as
  `search` → registry counted), implement, pass.
- [ ] **Step 5: Commit** `fix(cost,evidence): busy time apart from waiting; registry hosts count as trademark searches`.

### Task 10: Headless use — exit codes, `lock` colours, non-Latin names, a large symbol

Integration notes from an engine that drives the CLI without agents (on 1.2.0, rechecked on 1.5.0):

- `svg lint` exits 0 with `ok:false` (`main.ts:118`).
- `lock` has no `--secondary`.
- A locked kit without `--lockup` used the bare wordmark as the primary logo (not yet rechecked on 1.5.0).
- A name without Latin letters or digits gives no slug (`core/paths.ts:6`).
- A 250 KB symbol took about 20 s against about 1 s for a typical one.

**Files:**

- Modify: `src/cli/main.ts`, `src/cli/commands.ts` (`svg lint`, `lock`, `brand add`), `src/core/paths.ts`,
  `references/cli.md`
- Test: `tests/cli.test.ts`, `tests/paths.test.ts`, a perf test kept out of the default run

**Interfaces:**

- **Exit codes.** A command result may carry `exitCode`. `svg lint` sets 1 when any file is not ok; the JSON is
  printed as before. `cli.md` documents it.
- **`lock` colours.** `lock` takes `--secondary` and `--accent`.
- **`lock` without a lockup.** Recheck this on 1.5.0. When `--symbol` and `--wordmark` are given without `--lockup`,
  the locked kit builds its lockups the way finalize does, without changing either file. Otherwise record "already
  fixed".
- **Slugs.**
  - `brand add` takes `--slug <slug>`.
  - When `slugify` gives an empty string, the slug is `brand-<first 6 hex of sha1(name)>` and the result says so.
  - Non-Latin names need a supplied wordmark. The error says so, and names `--wordmark`.
- **Large symbols.** Profile `export --all` on a synthetic 250 KB symbol (many small paths). Fix the hot spot when it
  is in Markilo's code, otherwise record the finding here.

- [ ] **Step 1–4:** failing tests (lint exit 1; `lock --secondary` in the kit; `brand add "日本語"` gets a hash slug),
  implement, pass; the profile run is recorded.
- [ ] **Step 5: Commit** `feat(cli): svg lint exit code; lock secondary/accent; slugs for non-Latin names`.

### Task 11: Skill and agent text from the runs

**Files:**

- Modify: `plugin/skills/design/SKILL.md`, `plugin/skills/refine/SKILL.md`, `plugin/agents/concept-designer.md`,
  `plugin/agents/design-critic.md`, `plugin/skills/design/references/cli.md`

**Changes:**

- **Family first question.** Offer the users' own pattern as a ready option: "the parent's letters exactly · the
  letters the siblings already have · draw the rest in the same style". Both users typed this rule themselves.
- **Form and probes.** Develop scope question, probes instead of diagnosis questions, critic fix labels, protected
  traits and forbidden readings, as in Task 3.
- **Family word colour.** Pass the concept's ink to `family word --fill` (Task 2). Masters stay in the primary, except
  for a family word, which keeps the family ink.
- **After a palette change.** Check the `recolored` list; never edit SVG colours by hand.
- **Reverting.** Use `concept revert --to chosen` with the user's words when they reject a pass.
- **Recommended options.** Keep "(Recommended)" on the first option, and say in one line that the user's choice
  overrides it. Both users chose against the designer twice; that is expected.
- **Usage recording for resumed agents** (Task 9). `typography.standIn` is documented in `cli.md` as "a font for text
  set near the logo; the logo's lettering is drawn".
- [ ] **Step 1:** Edit the files. `tests/skills.test.ts` still passes (frontmatter, the links to `cli.md`).
- [ ] **Step 2: Commit** `docs(skill): develop scope, critic fix labels, revert, family word colour`.

### Task 12: Release 1.6.0

- [ ] **Step 1: Run the full checks.** `npm run ci`, `node scripts/smoke.mjs`, `claude plugin validate plugin`.
- [ ] **Step 2: Real check on a synthetic family product** ("Nimbra Mail") with the built CLI against local member pages
  (drawn word with an `sr-only` name, footer sibling links). Expected:
  - `research site` → `familyHint.siblings`, `nameRendering: outlined`; reference ids from `data-lockup-art`.
  - `family word --draw` with an arc C stays within the cap; `--fill` sets the ink.
  - `concept update --primary` lists `recolored`; finalize with a hand-edited stale colour fails.
  - A develop change with a moved cut → `formChange` < 0.85 and a warning; `concept revert --to chosen` restores it
    and the critique comes back.
  - `svg lint` on a bad file exits 1; `cost` shows `busyMinutes`.

  Record the result here.
- [ ] **Step 3: Re-export Markilo's own kit** (`--only logos,web,social,tokens,guidelines --clean`); logo files must stay
  byte-identical (Review Focus 1).
- [ ] **Step 4: Release commit.**
  - Write the CHANGELOG 1.6.0 entry (Added / Changed / Fixed; under Changed, the `below-threshold` rename and the
    `wallMinutes` deprecation).
  - Bump the four version files.
  - Commit `release: 1.6.0 — keep the chosen form, exact arcs, colour follows the palette`.
  - Push, and fast-forward `main` locally and on origin.
- [ ] **Step 5: Ask the user** before tagging, before the GitHub release and before `npm publish`; the user publishes.
  Then verify from the registry: `latest`, `gitHead`, the shasum, and that `npx markilo@1.6.0 --version` prints `1.6.0`.

---

## Not in 1.6.0

| Request                                           | Why not now                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Detecting a person's photo as a competitor "icon" | Needs image classification; the filter in Task 8 covers named UI and badge files, and low confidence is already shown.     |
| Automatic trademark search                        | Registries have no common offline API; Task 9 counts the searches the session makes.                                       |
| Recolouring a locked brand                        | Locked artwork is reproduced byte-for-byte by design.                                                                      |
| A construction helper that draws missing letters  | Still needs calibration (deferred from 1.5.0); Task 7 measures stems so designers can match them.                          |
| A 3-probe default for every develop request       | One user wanted probes, another wanted a scope question; Task 3 asks the scope and offers probes when the user cannot say. |

## Sources

Two identity runs on 1.5.0, both for products joining a family whose words are custom-drawn, and one headless
integration. Every claim was checked against `b18d85d`; reproduced items are marked.

| Finding                                                                                                      | Runs | Task  |
| ------------------------------------------------------------------------------------------------------------ | ---- | ----- |
| Arc commands in a drawn letter bulge (reproduced; conic weight dropped in `refit.ts`)                        | 1    | 1     |
| Palette change not applied to masters; 71 files shipped in the old colour; family word colour rule           | 2    | 2     |
| Develop and critic fixes changed the chosen form; user reverted both times                                   | 2    | 3, 11 |
| No revert; `--small none` fails; unused small file in the kit and `final/`                                   | 2    | 4     |
| Critique lost on a byte-identical revert; "failed" with "present-with-notes"; critic did not record          | 2    | 5     |
| Drawn family words read as live-text; no family hint from sibling links; reference ids by page host          | 2    | 6     |
| Symbol merged into a word without a warning; stem difference between sources not reported                    | 1    | 7     |
| Close icon, social icon and review badge picked as logos; early letter; fit message; one-colour lockup noise | 2    | 8     |
| Wall time counts the user's wait; resumed usage unclear; registry searches not counted                       | 2    | 9, 11 |
| `svg lint` exit 0; `lock` lacks secondary; non-Latin slug; slow large symbol                                 | 1    | 10    |

The reports also praised parts that should stay as they are:

- `family glyphs` + `family word` (letter sources, `missing`, `--draw`) and `render --family`.
- `research site` `nameCase` and lockup detection; `takenColors` and `color compare`.
- The proposals board, `chosen-vs-now.png` and `palette --sheet`: both users decided from these pictures.
- The four-question first dialog; one designer per proposal with honest weaknesses.
- `--small-sizes main`; `export --all` complete; "do not retype it" in the guidelines.
- `cost --plan` estimates matched (30–48 estimated, 33 actual).
- The headless toolchain: deterministic, offline, sha256 manifest, `svg lint --master`.

## Progress record

- (empty)
