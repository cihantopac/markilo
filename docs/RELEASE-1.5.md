# Markilo 1.5.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the first two full identity runs on 1.4.0 showed. A round's letters must be unique even when
designers start at the same moment. A product joining a family whose words are custom-drawn should get tools for the
family's letters: split a member's word into glyphs, measure them, and assemble a new word from them, with baseline and
cap height recorded. Research should tell the current family system from the old one. The colour a user chose for a
ground must reach every file made for that ground. The kit should not name a stand-in font. Time should be estimated
before a round. The skill should ask the family questions that the users answered by interrupting.

**Architecture:** One new module, `src/design/glyphs.ts` (glyph split, metrics, word assembly) on the existing SVG
parser (`svg/xml.ts`) and PathKit helpers (`geom/pathkit.ts`: `transformPath`, `boundsOf`, `booleanOp`), behind a new
`family glyphs` / `family word` command pair. Everything else is a small change in existing modules: `concept new`,
`rounds.ts`, `proposals`, `research/site.ts` and `research/family.ts`, `render/sheet.ts`, the exporter's logo variants,
`export/kit.ts`, `report/cost.ts`, and skill and agent text. No new dependencies.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, esbuild bundle in
`plugin/dist/markilo.mjs`.

**Spec:** two field reports on 1.4.0, both from products joining one existing family whose words are custom-drawn (one
renewed member taking a part of the parent word exactly, one member whose own site still carried the old system). Each
claim was checked against the code at `100cfa5`. The findings are summarized in [Sources](#sources).

## Global Constraints

- No new runtime or dev dependencies; no i18n framework.
- Everything runs offline except commands given `--allow-network`; generated HTML keeps its CSP (nonce for the
  gallery, `sha256-` hash for the kit and guidelines pages).
- Locked identities are reproduced byte-for-byte; no task may change a locked brand's artwork.
- Every CLI command prints JSON on stdout; progress and diagnostics go to stderr.
- Tests, fixtures and examples use synthetic brands only (Acme, Tidepool, Lumen, Ledger, Nimbra); no real product names.
  Glyph fixtures are drawn for the tests (simple geometric letters), never copied from a real logo.
- Files, reports and code stay in English. New interface strings in the HTML pages get a Turkish entry in
  `src/ui/tr.ts`; the `tests/ui.test.ts` key scan enforces it.
- After every task, `npm run ci` passes (biome, typecheck, tests, build, dist check). `plugin/dist/markilo.mjs` is rebuilt
  and committed with any source change. Run `npm run build` before the CLI tests that use the bundle.
- Commits stage explicit paths only (never `git add -A`) and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- At most one subagent at a time. One whole-branch review at the end replaces per-task reviews if the machine is under
  memory pressure.
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 11).

## Review Focus

1. **A kit finalized before 1.5.0** exports exactly as before: the `old kits export unchanged apart from the new files`
   hash test passes unchanged. Only a kit that sets `palette.onLight` / `onDark` gets different `*-color` logo files
   (Task 6), and that is the fix.
2. **A locked brand** is never recoloured; its `*-color` files stay "as provided" (Task 6).
3. **Letters.** A round written by 1.3.0 or 1.4.0 reads the same letters as before unless two concepts share one; then
   the later-created one moves to the next free letter and `proposals` says so (Task 1).
4. **Glyph split is advisory.** `family glyphs` never edits a reference; it writes new files under `work/family/`. A
   word it cannot split cleanly reports the ambiguous groups instead of guessing (Task 2).
5. **Inline SVG from websites** stays sanitized before it is parsed for glyphs (Tasks 2, 5).

---

### Task 1: Round letters stay unique when designers start together

Two designers ran `concept new --round 1` in the same millisecond and both concepts got "A"; `proposals.order` read A, A,
B. `concept new` reads the next free letter and then writes (`commands.ts:1421`) with nothing in between.
`roundLetters` only assigns letters to concepts _without_ one (`rounds.ts:55-70`), so a stored duplicate is shown twice.

**Files:**

- Modify: `src/cli/commands.ts` (`concept new` :1358-1430), `src/design/rounds.ts` (`roundLetters`, `nextLetter`),
  `src/core/workspace.ts` (a small exclusive lock helper), `src/cli/commands.ts` (`proposals` order note)
- Test: `tests/rounds.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `withBrandLock(w, slug, fn)`: creates `brands/<slug>/.lock` with `fs.openSync(path, 'wx')` (O_EXCL), retries every
    25 ms for up to 5 s, removes it in `finally`; a lock older than 30 s is treated as stale and replaced. `concept new`
    reads the round, picks the letter and writes `concept.json` inside it.
  - `roundLetters` treats a stored letter already taken by an earlier-created concept of the same round as missing and
    gives the later one the next free letter. `proposals` gains `letterConflicts?: { id, stored, shown }[]` and a note
    "two concepts stored the same letter; <id> is shown as <letter> — run `concept update --letter` to keep it".
  - `concept update --letter <L>` sets a concept's letter (refused if another concept of the round has it).

- [ ] **Step 1: Write the failing tests.**
  - `parallel concept new gets distinct letters`: start three `concept new --round 1` child processes at once on the
    built CLI; letters are A, B, C in some order, no repeats.
  - `a stored duplicate letter is shown once`: two concepts saved with letter A → the later-created shows B,
    `proposals.letterConflicts` names it.
  - `a stale lock is replaced`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(rounds): allocate round letters under a lock and show a stored duplicate once`.

### Task 2: `family glyphs` — split a family word into measured glyphs

Three runs (one on 1.3.0, two on 1.4.0) needed letters from a family member's custom-drawn word. Each session wrote its
own script: parse paths, flatten nested `matrix` transforms, group subpaths into letters, measure cap height and stems,
rewrite in absolute coordinates. One brief was wrong because the ratio was measured by hand.

**Files:**

- Create: `src/design/glyphs.ts`
- Modify: `src/cli/commands.ts` (new `family glyphs`), `plugin/skills/design/references/cli.md`
- Test: `tests/glyphs.test.ts`, `tests/fixtures/glyphs/` (a synthetic word "NIMBRA" drawn as outlines inside nested
  `<g transform>` groups, one letter with a counter, one with a separate dot)

**Interfaces:**

- Produces: `family glyphs --brand <slug> --ref <reference id | svg path> --text <letters> [--part word|auto]`.
  1. Read the SVG (sanitized), walk the tree composing `transform` attributes (matrix, translate, scale, rotate) and
     apply them with `transformPath`; rects, circles and polygons become paths.
  2. `--part auto` (default): when the file is a lockup, drop the group the word does not belong to — the shapes whose
     union bbox is separated from the rest by the largest horizontal gap, on the side away from the baseline row of
     the others. `--part word`: the file is a word.
  3. Group subpaths into glyphs: a subpath whose bbox lies inside another's (a counter) or overlaps its x-range by more
     than 50 % joins it; then merge groups left to right until the count equals `--text` length (smallest gap first). If
     the count still differs, return `INVALID_INPUT` with `groups: [{ x0, x1 }]` so the caller can pass `--text` again.
  4. Metrics, in units where cap height = 100: `capHeight` (median top of glyphs without overshoot), `baseline` (median
     bottom), `overshoot` (round glyph excess above/below), per glyph `advance`, `left`/`right` sidebearing, `stem`
     (thinnest vertical run at mid cap height measured on a 1000-unit raster), `bar` (thinnest horizontal run), and
     `terminals: 'flat' | 'flared'` (stem wider at the free end than at mid height by ≥ 10 %).
  5. Writes `work/family/glyphs/<ref>/<char>.svg` (normalized to cap 100, baseline 0, `data-baseline`/`data-cap-height`
     set) and `work/family/glyphs/<ref>/glyphs.json`; prints `{ ref, text, capHeight, baseline, glyphs: [...], dir }`.
  6. A reference word with no `data-baseline` gets them written onto a copy `work/family/<ref>-word.svg`.

- [ ] **Step 1: Write the failing tests.**
  - `splits a transformed word into its letters`: NIMBRA fixture → 6 glyphs, counter kept with its letter.
  - `metrics are in cap units`: stem and bar of the fixture match the drawn values within 1 unit; flared I reports
    `flared`.
  - `an ambiguous split returns the groups`: `--text NIMBR` on the fixture → `INVALID_INPUT` with 6 groups.
  - `a lockup's symbol is dropped in auto mode`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(family): split a family word into measured glyphs`.

### Task 3: `family word` — assemble a word from family glyphs

"Take the parent word's ending exactly, draw the new part in the same style": the take part was copied by hand from two
members, then spaced by eye; the shared word had no baseline, so a proposal lockup put the icon above it.

**Files:**

- Modify: `src/design/glyphs.ts`, `src/cli/commands.ts` (new `family word`), `src/cli/commands.ts` (`proposals`, `lint`
  warning), `plugin/skills/design/references/cli.md`
- Test: `tests/glyphs.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  `family word --brand <slug> --text <WORD> --take <ref>:<LETTERS>[,<ref>:<LETTERS>…] [--draw <char>=<file.svg>…]
  [--tracking <units>] [-o work/family/wordmark.svg]`.
  - Letters come from `--take` (by position of the run inside that reference's `--text`, so a taken run keeps its own
    spacing as one block) or from `--draw` files (a designer's glyph at cap 100, baseline 0).
  - Blocks taken together keep their original spacing; between blocks and single letters the gap is the mean of the
    two sidebearings from `glyphs.json`, plus `--tracking`.
  - Output carries `data-markilo-role="wordmark"`, `data-lettering="family"`, `data-baseline`, `data-cap-height`.
  - Letters with no source are listed in `missing: ['A','I']` with a grey placeholder box; the command succeeds so the
    designer sees the spacing.
- `proposals` and `lint`: a wordmark or lockup used by a concept whose word has no `data-baseline`/`data-cap-height`
  gets the warning "the word has no baseline; lockups will guess its position — run `family glyphs` on it".

- [ ] **Step 1: Write the failing tests.**
  - `takes a block with its own spacing`: `--take nimbra:BRA` → the three glyphs' relative positions equal the source.
  - `mixes taken and drawn letters`; `missing letters are listed`.
  - `the word carries baseline and cap height`, and `composeLockup` aligns the symbol to it.
  - `proposals warns for a word without a baseline`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(family): assemble a word from family glyphs with a recorded baseline`.

### Task 4: Comparison sheets the user needs

The user said "the new part does not look like the parent"; the cause (two letters) only showed with both words large
at the same cap height, rasterized outside Markilo. A palette-options sheet was scripted by hand and lost its labels
(`render` draws no `<text>`, `resvg.ts:39`). An icon-options sheet listed the same three icons twice (as marks and as
tiles) under six letters.

**Files:**

- Modify: `src/render/sheet.ts`, `src/cli/commands.ts` (`render --family`, `palette --sheet`, `render --compare --tile`),
  `plugin/skills/design/references/cli.md`, `plugin/agents/concept-designer.md`
- Test: `tests/sheet.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `render <new-word.svg> --family <ref-word.svg>[,<ref-word.svg>] -o <out.png> [--width 1600]`: each word on its own
    row, scaled to the same cap height (from `data-cap-height`, else the glyph metrics of Task 2), parent rows first,
    labels drawn as outlines (`label()`); a faint cap and baseline guide across all rows.
  - `palette --sheet --brand <slug> --concept <id> --palettes '#hex,#hex[,…]' -o <out.png>`: for each palette the symbol
    on its tile, the lockup on paper and on dark, labelled "1 · #hex" in outlines.
  - `render a.svg b.svg … --compare --tile [--primary <#hex>]`: adds a tile row per option labelled "<label> · tile"
    instead of taking tiles as separate options.
  - `render --help` and `cli.md` say `--width` sets the output size (default 512).

- [ ] **Step 1: Write the failing tests.**
  - `family sheet scales words to one cap height`: two fixture words at different sizes → equal cap rows in the SVG.
  - `palette sheet has one labelled column per palette` (label outlines present, no `<text>`).
  - `compare --tile labels tiles by option`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(render): word-vs-family and palette sheets; tiles labelled by option`.

### Task 5: Research tells the current family system from the old one

One product's own site set its name as live text in the site font — the family's old system — and it was taken as the
family lettering until the user interrupted. Another run proposed downloading the site font although every member's
word is custom-drawn. `research family` reports `scan.fonts` per member (`family.ts:122`) and names a saved mark after
the page's organization, so one member's mark was saved under another member's name (`family.ts:66-89`).

**Files:**

- Modify: `src/research/site.ts` (logo/name scan), `src/research/family.ts`, `src/research/profile.ts`
  (`existingIdentity`)
- Test: `tests/family.test.ts`, `tests/site.test.ts` (local fixture pages)

**Interfaces:**

- Produces:
  - Per site and per member: `nameRendering: 'outlined' | 'live-text' | 'image' | 'unknown'` — `outlined` when the header
    or home-link logo is an inline/linked SVG with paths and no `<text>`, `live-text` when the name is a text node
    styled by a web font.
  - `research family` adds `systems: { outlined: string[]; liveText: string[] }` and, when both are present, a finding
    "members differ: <outlined> draw their name, <live-text> set it in <font> — the drawn one is likely the current
    system; ask the user which members are current". When all members are `outlined`, the fonts line says "site font
    <font> (UI text; the words are custom-drawn — do not substitute it)".
  - A family reference is named after the member host it was found on (`<host>-<n>`), not the JSON-LD organization.
  - `research site` with a `sameAs` hub or a `data-lockup` sibling sets `familyHint: { hub, siblings }` so the skill
    asks the family questions (Task 10).

- [ ] **Step 1: Write the failing tests.**
  - `outlined vs live-text members are reported`: two local pages, one with an SVG word, one with a styled text name.
  - `all-outlined family does not offer the site font as the typeface`.
  - `family references are named after the member host`.
  - `sameAs hub sets familyHint`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(research): tell drawn from typed family names; name family marks by member`.

### Task 6: The colour chosen for a ground reaches every file for that ground

A palette set `onLight` (the primary was 1.99:1 on paper). The social image used it, but `logos/*/…-color.svg` — the
files made for paper and shown on paper in `overview.png` — kept the primary: the `color` variant writes the art as
drawn (`exporter.ts:165-168`). In another run a designer recoloured the master lockup to `onLight`, and `proposals`
showed that file on dark, dim.

**Files:**

- Modify: `src/export/exporter.ts` (logo variants), `src/export/variants.ts` (`adaptToGround`: on a dark ground an
  `onLight` colour maps to `onDark` or the primary, and the reverse), `src/cli/commands.ts` (`verify`)
- Test: `tests/export.test.ts`, `tests/variants.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - The `color` variant of every logo is `markOnGround(art, native ground, palette)` when the palette has the colour for
    that ground (`onLight` for a light-first brand, `onDark` for a dark-first one); otherwise unchanged. Locked brands
    unchanged.
  - `adaptToGround` maps the ground colours both ways: a master drawn in `onLight` shows `onDark` (or the primary when it
    passes 3:1) on dark.
  - `verify` warns "the master <file> uses the <ground> colour <hex>; keep masters in the primary and let exports pick
    the ground colour" when a symbol/wordmark/lockup master uses `onLight`/`onDark` but not the primary.

- [ ] **Step 1: Write the failing tests.**
  - `color logos use onLight on paper`: palette primary #e0a22a, onLight #a86f00 → `primary-color.svg` contains
    #a86f00, not #e0a22a; `overview.png` row matches.
  - `old kits export unchanged` (hash test) still passes.
  - `an onLight master shows onDark on dark`; `verify warns for a ground colour in a master`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(export): colour logos use the colour chosen for their ground`.

### Task 7: The kit does not name a stand-in font

Both runs: `brand.json` kept `typography.fontId` (the site font a designer recorded) with `lettering: family`.
Guidelines and tokens were right (`drawnLettering`, `kit.ts:82-99`), but the kit JSON reads as if the font were the
brand's.

**Files:**

- Modify: `src/export/kit.ts` (`typography`), `src/cli/commands.ts` (`finalize`), every reader of
  `kit.typography.fontId` (`grep -rn "typography" src/export`)
- Test: `tests/export.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces: with `lettering` `family` or `custom`, finalize writes `typography: { lettering, standIn?: { fontId, weight },
  supporting? }` — `fontId`/`weight` move under `standIn` (used only for previews that need a face). Readers use
  `standIn` where they used `fontId`. Kits without `lettering` keep `fontId` exactly; a 1.4 kit with `lettering` and
  `fontId` is read as before.

- [ ] **Step 1: Write the failing tests.** `a family-lettered kit has no top-level fontId`; `a 1.4 family kit still
  exports`; old-kit hash test unchanged.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(kit): keep a stand-in font out of the kit's typography`.

### Task 8: The gate and finalize say where the critique is

After a critic ran and its fixes were applied, `finalize` said `not-reviewed — No critique recorded yet`. The gate goes
`stale` only when the critique was recorded on that concept (`gate.ts:166`); export already points at a critique on
another concept (`commands.ts:2086`), finalize does not.

**Files:**

- Modify: `src/cli/commands.ts` (`finalize`, `proposals`), `src/report/gate.ts` (reason text)
- Test: `tests/cli.test.ts`, `tests/gate.test.ts`

**Interfaces:**

- Produces: `finalize` and `proposals` add `critiqueElsewhere` and the same hint as export when the concept is
  `not-reviewed`. When the cost log has a `verify`-phase critic entry after the concept's last change but no critique is
  recorded on any concept, the reason becomes "a critic ran (<agent>, <time>) but its scores were not recorded — record
  them with `concept update --blind … --present …`".

- [ ] **Step 1: Write the failing tests.** `finalize points at a critique on another concept`; `finalize says the
  critic's scores were not recorded`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(finalize): say where the critique is, or that it was not recorded`.

### Task 9: Time estimate before a round, and small CLI hints

The recommended 60 agent-minutes did not cover a family job: explore alone took 36.6 and 45 agent-minutes; both users
raised or dropped the budget mid-run. `research app --competitor` without `--as-reference` saved nothing and returned
`reference: null` with no hint (`commands.ts:792`).

**Files:**

- Modify: `src/report/cost.ts`, `src/cli/commands.ts` (`cost --plan`, `research app`)
- Test: `tests/cost.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `cost --brand <slug> --plan explore:3,develop:1,critic:1` prints `estimate: { agentMinutes: [lo, hi], wallMinutes:
    [lo, hi], usd: [lo, hi] }` from this brand's recorded agents when there are ≥ 2 of a kind, else defaults per agent
    (explore 10–16, develop 12–20, critic 4–8 agent-minutes; wall = the longest parallel agent), and says which.
    With a budget set, it adds `fits: boolean` and the shortfall.
  - `research app … --competitor` without `--as-reference` adds `hint: "nothing stored as a reference — add
    --as-reference to keep the icon for similarity checks"`.

- [ ] **Step 1: Write the failing tests.** `plan estimate uses defaults, then this brand's history`; `plan says whether it
  fits the budget`; `research app hints at --as-reference` (stubbed network).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(cost): estimate a round before it starts; research app hint`.

### Task 10: Skill and agent text from the two runs

Both users stepped in with family knowledge the first questions could have asked for: which members are current, that
the words are custom-drawn and which part is shared, and (once a wrong letter was shown) an unpublished lockup with the
letters needed. A develop request was reinterpreted ("read clearly" → pebbles, the user meant equal waves). Icon and
wordmark were asked together on a sheet that doubled the options.

**Files:**

- Modify: `plugin/skills/design/SKILL.md`, `plugin/skills/design/references/workflow.md`,
  `plugin/skills/design/references/cli.md`, `plugin/skills/refine/SKILL.md`, `plugin/agents/concept-designer.md`,
  `plugin/agents/design-critic.md`
- Test: `tests/plugin.test.ts` (string checks)

**Content:**

- **Family first questions** (when `familyHint` is set or the user names a family) replace two of the four standard
  questions: "Which members show the current system?" (multiple choice from `research family` members, `systems`
  pre-selected) and "Is the family word custom-drawn, and which part does this product share (parent word, suffix,
  none)?". After the answers: "Do you have a newer lockup that contains the letters this word needs?" when
  `family glyphs` finds letters missing.
- **Family lettering workflow:** `family glyphs` on each current member → `family word --take …` → designers draw only
  the `missing` letters at cap 100 using the measured stem, bar and terminals → `render --family` sheet before any
  proposal shows the word. Never download or substitute the site font when `systems` says the words are drawn.
- **Develop requests:** when the user's change can be read two ways, ask one multiple-choice question first (e.g. keep
  the form / equal sizes / more space) or run a probe; never spend a develop pass on a guess.
- **Ask icon and wordmark separately**, each on its own sheet. Designers pass tile renders with `--tile`, never as
  extra options.
- **Masters stay in the primary;** ground colours go in the palette (`onLight`/`onDark`), never into the master files.
- **Time:** run `cost --plan` before each round and show the estimate with the budget question; say that parallel agents
  add up agent-minutes while wall time follows the longest.
- **Resumed agents:** the usage notification after a resume is cumulative; record the part as the difference from the
  previous notification.
- **References:** name the category leader in the research brief and, if its logo cannot be collected, tell the user the
  originality check does not cover it. `render --width <px>` for large comparisons. In shell examples, quote answers
  with single quotes (`$` is expanded inside double quotes).

- [ ] **Step 1: Write the string checks** in `tests/plugin.test.ts` for each bullet's key phrase.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Edit the skill and agent files.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `docs(skills): family questions and lettering workflow, develop clarification, separate icon and word choices`.

### Task 11: Release 1.5.0

- [ ] **Step 1: Run the full checks.** `npm run ci`, `node scripts/smoke.mjs`, `claude plugin validate plugin`.
- [ ] **Step 2: Run one real check on a synthetic family product** ("Nimbra Mail" in the Nimbra family) with the built
  CLI against two local member pages (one with a drawn word, one with a live-text name). Expected:
  - three parallel `concept new --round 1` get A, B, C;
  - `research family` reports `systems` and names references by member host;
  - `family glyphs` splits the drawn word; `family word --take … --draw …` assembles a word with a baseline and lists
    missing letters; `render --family` shows both words at one cap height;
  - a palette with `onLight` yields `primary-color.svg` in `onLight`; `brand.json` has no top-level `fontId`;
  - `cost --plan explore:3` prints an estimate.

  Record the result here.
- [ ] **Step 3: Re-export Markilo's own kit** (`--only logos,web,social,tokens,guidelines --clean`); logo files must stay
  byte-identical.
- [ ] **Step 4: Write the CHANGELOG** 1.5.0 entry (Added / Changed / Fixed), bump the four version files, commit
  `release: 1.5.0 — family lettering tools and field-report fixes`, push, and fast-forward `main` locally and on origin.
- [ ] **Step 5: Ask the user** before tagging, before the GitHub release and before `npm publish`; the user publishes.
  Then verify from the registry: `latest`, `gitHead`, the shasum, and that `npx markilo@1.5.0 --version` prints `1.5.0`.

---

## Not in 1.5.0

| Request                                                            | Why not now                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A construction helper that draws missing letters (flare, brackets) | Needs calibration against real family letters; one run's rule was "too extreme" when applied fully. Task 2 measures stems, bars and terminals; designers draw. |
| `render --size`                                                    | `render --width` already sets the size; Task 4 makes it visible.                                                                                               |
| Automatic category-leader detection in `verify`                    | Markilo has no list of leaders per category. Task 10 has the research brief name one and the user told when it is missing.                                     |
| App Store (`research app --store ios`) NETWORK error               | Not reproduced; may be the iTunes API's rate limit. Revisit with a captured error.                                                                             |
| `brief update` accepting "#hex (note)"                             | The error message was clear; notes go in `--note`.                                                                                                             |

## Sources

Two field reports on 1.4.0 (2026-11-13), both products joining one family whose words are custom-drawn. Together: 6
explore agents, 3 develop passes, 2 critics, ≈ 129 agent-minutes, ≈ 6.5 h wall (mostly user wait), two family words
built by hand-written scripts, one duplicate round letter. Each claim was checked against the code at `100cfa5`.

| Finding                                                                                  | Hits | Task  |
| ---------------------------------------------------------------------------------------- | ---- | ----- |
| Two designers got the same round letter                                                  | 1    | 1     |
| No glyph tools for family lettering; words built by hand (also asked on 1.3.0)           | 2    | 2, 3  |
| Shared family word without baseline; lockup misplaced                                    | 1    | 3     |
| No word-vs-family or palette sheet; `<text>` dropped; tiles counted as options           | 2    | 4     |
| Old live-text system taken as the family rule; site font offered for drawn words; names  | 2    | 5, 10 |
| `*-color` logos ignore `onLight`; a master in a ground colour                            | 1    | 6     |
| Stand-in font in the kit's typography                                                    | 2    | 7     |
| Finalize said "no critique recorded" after a critic ran                                  | 1    | 8     |
| Time budget too small, no estimate; resumed usage is cumulative; `--as-reference` silent | 2    | 9, 10 |
| Develop request reinterpreted; icon and word asked together                              | 1    | 10    |

The reports also praised parts that should stay as they are:

- `research site` (`nameCase`, `sameAs` to the hub, inline logo, dark colours) and `research family` (`takenColors`
  found a near-collision the user did not know; robots respected).
- The four-question first dialog with recommended answers first.
- One designer per proposal, three kinds of mark, honest weakest points; the first finished proposal shown early.
- `proposals`, `chosen-vs-now.png`, `verify`, the cheap palette step without a designer, the critic's measurable fixes.
- Finalize showing a stale critique without blocking; `export --all` clean; "custom (family) lettering — do not retype
  it" in the guidelines.

## Progress record

- Tasks 1–10 implemented by parallel agents (worktrees for 2+3, 5, 6+7, 9, 10) and merged on `v1.5`; one whole-branch
  review (0 Critical, 3 Important, 14 Minor) and one fix wave, all 17 confirmed fixed by a scoped re-review.
- Release check (Task 11, 2026-11-13), built CLI against two local member pages: `research family` reported
  `systems { outlined: [Nimbra Loop], liveText: [Nimbra Dock] }` and the "members differ" finding (the check first
  found an icon beside a typed name read as `unknown`; fixed in `220a058`); three parallel `concept new --round 1` got
  C, A, B (distinct); `family glyphs` split the drawn word into 6 glyphs (stem 14, bar 21.23 in cap units);
  `family word --text BRAVO --take <ref>:BRA` wrote a word with baseline and `missing: [V, O]`; `render --family` drew
  both words; `cost --plan explore:3,develop:1,critic:1` estimated 46–76 agent-min, 26–44 wall-min, $0.38–0.77.
  `onLight` in colour logos and the kit typography were checked by their tests (Tasks 6, 7), not in this run.
- `npm run ci` 381/381, `node scripts/smoke.mjs` passed, `claude plugin validate plugin` passed. Markilo's own kit
  re-exported: logo files byte-identical; the manifest changed.

**Released 2026-11-13.** Tag `markilo--v1.5.0` at `8f8ddf7`, GitHub release published; `npm pack` shasum
`08b369c42fba742e24b869d5184e8d575cea6b7d` (287 files). npm publish by the user.
