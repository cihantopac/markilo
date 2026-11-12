# Markilo 1.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what three full identity runs on 1.3.0 showed. The user must never develop a concept other than the one
they named. What a round shows must be what the export ships, and the user must be able to say which colour a mark has
on a brand-filled tile. A product inside an existing family should get a real path. Research should read the evidence a
site actually carries. The gate should advise and never say "reject". Cost and time should say what they measure.

**Architecture:** Small changes in existing modules: the proposals and concept commands, the round order in the
workspace, render/proposal and the exporter's tile, report/gate, research/site and research/competitors, a new
`research family` command next to `research site`, export/kit and guidelines, report/cost. Skill and agent text
changes are grouped in two tasks. No new dependencies or subsystems.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, esbuild bundle in
`plugin/dist/markilo.mjs`.

**Spec:** three field reports on 1.3.0, all from products inside one existing product family: two family members that
share a parent wordmark plus a suffix, and one product whose family rule lived on other domains. Each claim was checked
against the code at `89d2214`. The findings are summarized in [Sources](#sources).

## Global Constraints

- No new runtime or dev dependencies; no i18n framework.
- Everything runs offline except commands given `--allow-network`; generated HTML keeps its CSP (nonce for the
  gallery, `sha256-` hash for the kit and guidelines pages).
- Locked identities are reproduced byte-for-byte; no task may change a locked brand's artwork.
- Every CLI command prints JSON on stdout; progress and diagnostics go to stderr.
- Tests, fixtures and examples use synthetic brands only (Acme, Tidepool, Lumen, Ledger, Nimbra); no real product names.
- Files, reports and code stay in English. New interface strings in the HTML pages get a Turkish entry in
  `src/ui/tr.ts`; the `tests/ui.test.ts` key scan enforces it.
- After every task, `npm run ci` passes (biome, typecheck, tests, build, dist check). `plugin/dist/markilo.mjs` is rebuilt
  and committed with any source change. `npm run ci` runs the tests before the build, so run `npm run build` before the
  CLI tests that use the bundle.
- Commits stage explicit paths only (never `git add -A`) and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- At most one subagent at a time (a 16 GB machine froze during 1.3.0). One whole-branch review at the end replaces
  per-task reviews if the machine is under memory pressure.
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 13).
- Bundle no third-party logos or trademarks; see [Not in 1.4.0](#not-in-140).

## Review Focus

1. **A kit finalized before 1.4.0** has no `palette.onBrand`, `palette.tile`, `smallSizes` or `typography.lettering`.
   It must export exactly as before: the `old kits export unchanged apart from the new files` hash test passes
   unchanged (Tasks 2, 6, 7).
2. **A locked brand** is never recoloured, re-tiled or re-lettered. Pinned by `a locked brand ignores onBrand and tile`
   (Task 2).
3. **Round order.** Board letters, single proposal captions, the gallery and the `proposals` JSON use one order. A
   workspace written by 1.3.0 (concepts without a `letter`) gets the same letters it showed before only when its
   creation order equals its id order; otherwise the new order wins and `proposals` says so. Pinned in Task 1.
4. **Gate wording.** No gate result may contain `reject`. A concept with no recorded critique still reads
   `not-reviewed` (Task 3).
5. **A cost log written by 1.3.0** reads, summarises and reports its status exactly as before; only new fields are
   added (Task 11).
6. **Inline SVG from websites** stays sanitized before it is written anywhere (Tasks 8, 9).

---

### Task 1: One order for a round: letters the user can say back

The board lettered concepts by folder id (alphabetical); the orchestrator listed them in launch order. Twice a user
said a letter or a title by position and got the wrong concept developed (256 k tokens once), finalized and exported
(once). With `--concepts <one id>` every single `proposal.png` says "A".

**Files:**

- Modify: `src/core/types.ts` (`Concept`: add `letter?: string`), `src/cli/commands.ts` (`concept new` assigns the
  letter; `proposals` :1884-1990 orders by letter and returns `order`), `src/core/workspace.ts` (`concepts()` :245
  stays alphabetical; add `roundOrder(concepts)` in `src/design/rounds.ts`), `src/gallery/gallery.ts` (:529),
  `src/render/sheet.ts` (`renderCompareSheet` :95-112 and the `'Sketch comparison'` title at :115)
- Test: `tests/rounds.test.ts`, `tests/gallery-feedback.test.ts`

**Interfaces:**

- Produces:
  - `Concept.letter?: string`. `concept new --round <n>` sets the next free letter in that round (A, B, C…), in the
    order the concepts are created.
  - `roundOrder(concepts: Concept[]): Concept[]` — by `letter`, then `createdAt`, then id (1.3.0 workspaces).
  - `proposals` output gains `order: { letter: string; id: string; title: string; status: string }[]`. Each
    `proposal.png` caption uses the concept's own letter, so `--concepts <one id>` keeps it.
  - `renderCompareSheet(items, paper, title = 'Options')`; labels come from the caller unchanged (no A–D prefix when
    the caller already numbers them).

- [ ] **Step 1: Write the failing tests.**
  - `letters follow creation order, not ids`: create concepts `zeta`, `alpha`, `mid` in round 1. Expect letters
    A/B/C in that order, the board captions `Round 1 · A …` for `zeta`, and `order` to list zeta, alpha, mid.
  - `a single proposal keeps its letter`: `proposals --concepts mid` → caption contains `· C ·`.
  - `a 1.3.0 round without letters orders by creation time`.
  - Gallery: cards carry the same letters as the board.
  - Sheet: the icon-options sheet's title is not `Sketch comparison`, and the row labels are the ones passed in.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/rounds.test.ts tests/gallery-feedback.test.ts`.
- [ ] **Step 3: Implement** as in Interfaces. Keep `concepts()` itself alphabetical (other callers rely on it); only
  round presentation goes through `roundOrder`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(rounds): letters follow the order concepts were proposed in, and proposals returns it`.

### Task 2: What the round shows is what the export ships, and the tile mark is the user's choice

Previews ignore `onDark`/`onLight` on the opposite ground (`render/proposal.ts:94`). On a brand-filled tile both
previews and export take the mark colour from `onFillVariant` (`export/variants.ts:100-116`), which accepts an adapted
tint at a bare 3:1 before trying white or black: a rose tint at 3.09:1 where white gives 5.66:1, on 41 export files
and the `.icns`. The tile ground is always `primary` (`exporter.ts:253-259`). Nothing lets the user override either.

**Files:**

- Modify: `src/core/types.ts` (`ConceptPalette`: `onBrand?`, `tile?`), `src/export/kit.ts` (copy them at finalize),
  `src/cli/commands.ts` (`concept new|update --on-brand <#hex|auto|none> --tile <#hex|none>`), `src/export/variants.ts`
  (one resolver), `src/export/exporter.ts` (`appmarkSvg` :248 and every tile call site), `src/render/proposal.ts`
  (:94 and :106), the chosen-vs-now and sheet renderers that draw an opposite ground
- Modify: `docs/OUTPUTS.md`, `plugin/skills/design/references/cli.md`
- Test: `tests/grounds.test.ts`, `tests/export.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `ConceptPalette.tile?: string` (tile ground; default `primary`) and `ConceptPalette.onBrand?: string` (the mark
    colour on that tile; `auto` = the higher-contrast of paper and ink/black).
  - `markOnGround(svg, ground, palette, { locked }): string` in `src/export/variants.ts` — the one resolver for
    previews and export. Order: `onDark`/`onLight` for a dark/light ground when set, `onBrand` on the tile when set,
    otherwise today's behaviour unchanged (`adaptToGround` / `onFillVariant`).
  - `proposals` and export call `markOnGround`; a locked kit always takes today's path.

- [ ] **Step 1: Write the failing tests.**
  - `previews use onDark on the dark panel`: primary `#c2255c`, onDark `#f783ac` → the proposal's opposite panel
    contains `#f783ac`, not `#c2255c`.
  - `onBrand puts a white mark on every brand tile`: `--on-brand #ffffff` → appmark, apple-touch-icon, Android launcher
    and the proposal tile carry `#ffffff` and no adapted tint.
  - `tile sets the tile ground`: `--tile #1a1a1a` → the same files fill with `#1a1a1a`.
  - `a locked brand ignores onBrand and tile`: hashes equal the export without the fields.
  - The old-kit hash test passes unchanged.
  - CLI: `--on-brand auto` stores `auto`; `--tile red` → `USAGE`; `none` removes the field.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/grounds.test.ts tests/export.test.ts tests/cli.test.ts`.
- [ ] **Step 3: Implement** `markOnGround` and route every listed call site through it. Without the new fields, each
  call site must produce the same bytes as before.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(palette): onBrand and tile colours, one ground resolver for previews and export`.

### Task 3: The gate advises; it never says reject, and finalize says where the critique is

A critic called a concept presentable; one score of 5 made the gate say `failed, next: reject` (`gate.ts:159`), which
contradicts "advice, not a gate on the user's choice". After a hand re-base, the kit said `not-reviewed` although a
critique existed — on another concept.

**Files:**

- Modify: `src/report/gate.ts` (`GateResult.next` :83 and :159), `src/export/kit.ts` (:123, :280), `src/cli/commands.ts`
  (`finalize`), every reader of `next` (`grep -rn "next ===\|'reject'" src`)
- Test: `tests/gate.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `GateResult.next: 'present' | 'fix' | 'present-with-notes'`. Below the bar with `critique.present === true` →
    `present-with-notes`; below the bar with `present === false` → `fix`.
  - `finalize` output gains `critiqueElsewhere?: string[]` (ids of other concepts in the brand that carry a critique)
    and a warning line when the finalized concept is `not-reviewed` and that list is not empty.

- [ ] **Step 1: Write the failing tests.**
  - `presentable with one low score is present-with-notes`: distinctiveness 5, others ≥ 7, present → status
    `failed`, `next: 'present-with-notes'`, reasons name distinctiveness.
  - `no gate result says reject`: run the existing gate fixtures and assert `JSON.stringify(r)` has no `reject`.
  - `finalize warns when the critique is on another concept`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/gate.test.ts tests/cli.test.ts`.
- [ ] **Step 3: Implement.** Update the gallery and guidelines texts that print `next`; add Turkish strings.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(gate): advise present, fix or present with notes; finalize points at a critique on another concept`.

### Task 4: Adopt a drawing from another concept

The user chose one concept and said "continue from that other drawing". The move was done by hand: `chosen/` kept the
old choice, `chosen-vs-now.png` showed the wrong left panel, and both panels had the same title.

**Files:**

- Modify: `src/cli/commands.ts` (new `concept adopt`), `src/design/rounds.ts` (`keepChosen` :57 gains a `repin`
  option), `src/cli/commands.ts` chosen-vs-now (:1952-1972: the left caption names the source concept)
- Modify: `plugin/skills/design/references/cli.md`, `plugin/skills/refine/SKILL.md`
- Test: `tests/rounds.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces: `concept adopt --brand <slug> --concept <id> --from <other id> [--files symbol,wordmark,small,lockup]`.
  It copies the named files into `<id>`, records `adoptedFrom: { concept, files, at }` on the concept and in the
  decision log, re-pins `chosen/` from the adopted files, and returns `{ concept, copied, chosen }`. Paths stay inside
  the concept folders (same guard as `concept update`).

- [ ] **Step 1: Write the failing tests.**
  - `adopt copies the drawing and re-pins chosen`: after adopt, `chosen/symbol.svg` equals `<other>/symbol.svg` and
    `chosen-vs-now.png` is not produced until the drawing changes.
  - `adopt refuses an approved concept and an unknown --from`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(concept): adopt a drawing from another concept and re-pin the chosen state`.

### Task 5: Family products: family references, shared lettering, no meaningless typeset

Three runs were products inside an existing family. The parent wordmark (custom lettering) is locked by the family;
only a suffix and an icon are new. Each designer redrew the same suffix. `typeset` measured the family's drawing
against a stand-in font. The kit, tokens and guidelines then printed the stand-in as "Brand typeface".

**Files:**

- Modify: `src/core/types.ts` (`Concept.typography.lettering?: 'font' | 'custom' | 'family'`,
  `typography.supporting?: { fontId; weight }`; `ReferenceCategory` gains `family`), `src/cli/commands.ts`
  (`concept update --lettering <kind> [--supporting-font <id> --supporting-weight <n>]`; `proposals` typeset),
  `src/analyze/` similarity readers (a `family` reference is reported as family likeness, never as a risk),
  `src/export/guidelines.ts` (:103-108, :206), `src/export/exporter.ts` (`exportTokens`)
- Modify: `plugin/skills/design/SKILL.md` (Family), `plugin/skills/design/references/workflow.md`
  ("Multi-product families": a product joining an existing family), `plugin/agents/concept-designer.md`
- Test: `tests/family.test.ts`, `tests/similarity.test.ts`, `tests/export.test.ts`

**Interfaces:**

- Produces:
  - `lettering: 'family'` or `'custom'` → `proposals` reports `typeset[id] = null` and
    `typesetBase[id] = { skipped: 'family lettering' | 'custom lettering' }`; no typeset `missing` line.
  - Guidelines and tokens: "Wordmark: custom (family) lettering — do not retype it"; a supporting typeface when given,
    labelled "Supporting typeface"; no "Brand typeface" line for lettering ≠ `font`.
  - `reference add --category family`: excluded from the originality risk score; `compare` lists family likeness
    separately.
  - Skill: before launching designers for a family product, draw the shared parts (suffix, lockup metrics) once in
    `work/family/` and give every designer the same files.

- [ ] **Step 1: Write the failing tests.**
  - `family lettering skips typeset`.
  - `guidelines do not call a stand-in the brand typeface`: lettering `custom`, typography Outfit 600 → no
    `Brand typeface: **Outfit**`; "Supporting typeface" only when set.
  - `a family reference is not an originality risk`: a near-identical `family` reference leaves the verdict as it was
    without it, and `compare` lists it under family.
  - The old-kit hash test passes unchanged (no `lettering` → today's text).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement**, then the skill and agent text.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(family): family references and lettering; typeset and guidelines respect custom lettering`.

### Task 6: Small sizes: the user can choose fidelity, and a small wordmark has a place

One user preferred the main symbol at 16/32 px over a simplified one; nothing could switch the small version off. A
critic recommended `wordmark-small.svg`; it had no slot and was added to the kit by hand.

**Files:**

- Modify: `src/core/types.ts` (`Concept.smallSizes?: 'small' | 'main'`, `files.wordmarkSmall?`), `src/cli/commands.ts`
  (`concept update --small-sizes small|main --wordmark-small <file>`), `src/report/quality.ts` (the 1.3.0 hand-over
  block), `src/export/kit.ts` (:202), `src/export/exporter.ts` (:299, :319 small-size switch; logos group),
  `src/export/guidelines.ts`
- Test: `tests/small.test.ts`, `tests/export.test.ts`

**Interfaces:**

- Produces:
  - `smallSizes: 'main'` → export draws ≤ 32 px from the main symbol even when `files.small` exists; `verify` turns
    the main symbol's 16/32 px failures into `warn` with ` — the user chose the main symbol at small sizes.`
  - `files.wordmarkSmall` → `logos/wordmark-small.svg` + `.png`, with a guidelines line on when to use it.

- [ ] **Step 1: Write the failing tests.** `main at small sizes ignores the small version`; `the user's choice turns
  16 px failures into warnings`; `a small wordmark is exported`; old-kit hash test unchanged.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(small): choose the main symbol at small sizes; export a small wordmark`.

### Task 7: `research site` keeps the identity it finds

`--download-assets` aborts on one malformed inline SVG (`sanitizeSvg` outside the try, `commands.ts:529-534`).
Inline SVG logos are counted but never reach `existingIdentity.logos` (`mergeSiteScan` only merges colours and fonts).
A product colour set only as the favicon's `color` attribute is missed, and `oklch()` colours are not converted.

**Files:**

- Modify: `src/cli/commands.ts` (:529-534), `src/research/profile.ts` (`mergeSiteScan` :219-325),
  `src/research/site.ts` (icon `color` attribute at :451; CSS colour parsing), the colour parser (`oklch()`/`oklab()`
  → hex)
- Test: `tests/research-net.test.ts`, `tests/color.test.ts`

**Interfaces:**

- Produces:
  - `--download-assets` skips an unusable SVG with an `issues` entry and keeps going.
  - `mergeSiteScan` adds each inline logo to `existingIdentity.logos` (`kind: 'inline-svg'`); with
    `--download-assets` the saved file is also added as an `existing` reference.
  - `SiteScan.iconColors` from `<link rel="mask-icon" color>` and similar, merged as identity colours.
  - `oklch()`/`oklab()` parsed to hex.
  - A finding when favicon, header logo and og:image clearly disagree in colour (`identity inconsistency`).

- [ ] **Step 1: Write the failing tests** on the local server: a page with one broken and one good inline SVG; a
  `mask-icon` colour; an `oklch(0.62 0.2 25)` colour; a purple favicon with an orange header logo.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(research): site research keeps inline logos and icon colours, and survives a broken SVG`.

### Task 8: `research family` reads the family where it lives

A family's rule lived on other domains (the hub and two redesigned members). `research site` reads one domain, so the
lockups were pulled out by hand with curl and Python.

**Files:**

- Create: `src/research/family.ts`
- Modify: `src/cli/commands.ts` (new `research family`), `src/research/site.ts` (`inlineLogoSvgs`: also hint on
  `data-lockup*`, `data-logo*`)
- Modify: `plugin/skills/design/SKILL.md` (Understand), `plugin/skills/design/references/cli.md`
- Test: `tests/research-net.test.ts`

**Interfaces:**

- Produces: `research family --brand <slug> --member <url> [--member <url>]… --allow-network`. For each member it
  runs the site scan (robots respected), saves inline lockups and logos as `family` references named after the member,
  and returns `{ members: [{ url, name, colors, fonts, lockups }], takenColors }`, where `takenColors` are the members'
  brand colours (for picking a free one).

- [ ] **Step 1: Write the failing test**: two local member sites with `data-lockup-art` SVGs → two `family`
  references and `takenColors` from both.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement**, reusing `scanSite` and `addReference`.
- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** with the message `feat(research): research family scans the members that define a family`.

### Task 9: Competitor logos: pick the logo, not a menu icon or a customer's logo

In a header, any inline SVG is taken without a hint (`site.ts:291-310`), so a menu icon and an info icon became two
competitors' "logos"; one similarity score was measured against an info icon. Another run took a customer logo from a
clients folder (named in Turkish).

**Files:**

- Modify: `src/research/site.ts` (`inlineLogoSvgs`), `src/research/competitors.ts` (:226-262)
- Modify: `plugin/skills/research/SKILL.md` and `plugin/skills/design/SKILL.md` (Read every collected reference
  before using it)
- Test: `tests/research-net.test.ts`

**Interfaces:**

- Produces:
  - `inlineLogoSvgs` scores each candidate: inside a home link (`<a href="/">`), brand name or `logo` in
    class/id/aria-label/title, not tiny (both viewBox sides ≤ 24 with one path → skip), not a known UI glyph name
    (`menu`, `search`, `close`, `info`, `arrow`, `chevron`). Returns candidates sorted by score with
    `confidence: 'high' | 'low'`.
  - Competitor logo images skip paths and alt text that say clients, customers, partners, references (also `logolar`,
    `referans`, `musteri`).
  - `research competitors` result marks `logo.confidence`; a low-confidence logo is saved with notes
    `low confidence — check it`.

- [ ] **Step 1: Write the failing tests**: a header with a hamburger SVG and the logo inside `<a href="/">` → the logo
  is picked; an `/img/clients/acme.png` candidate is skipped.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(research): competitor logos prefer the home-link mark and skip UI glyphs and client logos`.

### Task 10: CLI frictions

Small things every run hit: `answers` cannot amend and prints the whole list; no batch entry; `concept update` cannot
change `semantics` and prints the whole concept; a one-proposal round has `board: null` (`commands.ts:1976`);
`finalize`/`verify` show name risk `high` without reasons (`commands.ts:1616`).

**Files:**

- Modify: `src/cli/commands.ts` (`answers` :896-931, `concept update` :1304, `proposals` :1976, name-risk output
  :1616)
- Test: `tests/cli.test.ts`, `tests/rounds.test.ts`

**Interfaces:**

- Produces:
  - `answers --amend <Qn> --answer <text>`; `answers --file <json>` (an array of `{question, answer}`); a write returns
    `{ recorded: [...] , count }` instead of the whole log (a plain `answers` still lists everything).
  - `concept update --semantics "<a>; <b>"`; `concept update` returns `{ id, status, changed: [...] }` unless `--show`.
  - A one-proposal round still writes its board.
  - Name risk lines carry the reasons that produced them.

- [ ] **Step 1: Write the failing tests** for each bullet.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Update `cli.md` for the changed output shapes.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(cli): amend and batch answers, semantics and compact concept updates, one-proposal boards`.

### Task 11: Cost says what it measures

All three reports: `--budget-minutes` sums agent minutes across parallel agents and does not say so (`cost.ts:48`);
the dollar figure covers subagents only and looks like the cost; the desktop app showed no session total; an agent
stopped by a usage limit and resumed had no recording rule.

**Files:**

- Modify: `src/report/cost.ts`, `src/cli/commands.ts` (`cost`), `plugin/skills/design/SKILL.md` (cost lines)
- Test: `tests/cost.test.ts`

**Interfaces:**

- Produces:
  - Summary fields `agentMinutes` (today's `minutes`, kept as an alias) and `wallMinutes` (first entry `at` to last
    entry's `at` + its minutes). The time-budget message names agent minutes and shows wall minutes.
  - `subagentUsd` replaces nothing; the summary text says "subagents only — the session itself is not counted" whenever
    `lowerBound` is true.
  - `cost --agent <name> --part <n>`: parts of one interrupted agent add up under one name; a part without minutes is
    recorded with `minutesUnknown: true` and counted in a `minutesIncomplete` flag.
  - Skill: in an app without a session total, record `--session-usd` from the app's usage view or tool when one
    exists; otherwise say the figure is subagents only.

- [ ] **Step 1: Write the failing tests**: wall vs agent minutes for two overlapping agents; a two-part agent; a 1.3
  log reads unchanged (`a 1.3 log reads unchanged`).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(cost): agent and wall minutes, interrupted agents, a plain subagents-only label`.

### Task 12: Skill and agent text from the three runs

No code; the wording the runs asked for. Each bullet names its source finding.

**Files:**

- Modify: `plugin/skills/design/SKILL.md`, `plugin/skills/design/references/workflow.md`,
  `plugin/skills/refine/SKILL.md`, `plugin/agents/concept-designer.md`, `plugin/agents/design-critic.md`,
  `plugin/skills/gallery/SKILL.md`
- Test: `tests/plugin.test.ts` (string checks for the key rules)

- [ ] **Step 1: First questions** fit one 4-question dialog, in this order: scope (for a product with an existing or
  family identity: refresh, product icon or new?) with earlier work and references; which family members define the
  rule and which are out of date; money and time; then two separate network consents — collecting competitor marks,
  and sending the name to trademark registries.
- [ ] **Step 2: Presenting a round**: present in the board's order as `A · <title>`, quote `proposals.order`, and read
  the choice back (`letter · title · id`) before develop or finalize.
- [ ] **Step 3: Explore**: when the name holds an object or idea (loop, link, dock…), one of the three directions treats
  it directly and boldly; the cliché filter does not drop it. A letter-becomes-figure idea is allowed. A reference is
  for measure and context, not form; one direction per round stays independent of it, and the orchestrator reads back
  its interpretation. Board captions carry the idea name. Each designer keeps its scripts under
  `concepts/<id>/work/`.
- [ ] **Step 4: Develop**: a transformation the user asked for is shown to the user before any taste-based send-back;
  "character lost → send back" applies only to unrequested change. Small sizes go to the small version; the main
  weight stays within ±10 % of the chosen drawing unless the user asked otherwise. Colour is offered as its own cheap
  decision (the chosen mark in 3–4 palettes via `palette` and `render`), and `--on-brand`/`--tile` are asked at
  finalize. Colour rules said in `finalize --note` reach the output only through palette fields — set them.
- [ ] **Step 5: Gallery in the desktop app**: send the round's PNGs into the chat; `gallery --serve` is optional and
  stops when the session ends; record chat answers yourself (as today). Regenerate the gallery each round. Show the
  first finished proposal early in a long round.
- [ ] **Step 6: Research**: Read every collected competitor reference before using it; delete wrong ones
  (`reference remove`). Use `research family` for a product inside an existing family.
- [ ] **Step 7:** Add the `tests/plugin.test.ts` checks, run `npm run ci`, commit with the message
  `docs(skills): first questions, round letters, name ideas, requested change, desktop gallery`.

### Task 13: Release 1.4.0

- [ ] **Step 1: Run the full checks.** `npm run ci`, `node scripts/smoke.mjs`, `claude plugin validate plugin`.
- [ ] **Step 2: Run one real check on a synthetic family product** ("Nimbra Loop" in the Nimbra family) with the built
  CLI against two local member pages. Expected:
  - `research family` saves two `family` references and `takenColors`; `research site` keeps the inline logo in
    `existingIdentity.logos`.
  - `concept new` ×3 in creation order `c`, `a`, `b` → board letters A, B, C in that order, `proposals.order` matches.
  - `concept adopt` re-pins `chosen/`.
  - `--on-dark`, `--on-brand #ffffff`, `--tile` show in `proposal.png` and in every exported tile.
  - Gate prints no `reject`; `lettering family` skips typeset and the guidelines print no stand-in typeface.
  - `cost` shows agent and wall minutes.

  Record the result here.
- [ ] **Step 3: Re-export Markilo's own kit** (`--only logos,web,social,tokens,guidelines --clean`); logo files must stay
  byte-identical.
- [ ] **Step 4: Write the CHANGELOG** 1.4.0 entry (Added / Changed / Fixed), bump the four version files, commit
  `release: 1.4.0 — field-report fixes`, push, and fast-forward `main` locally and on origin.
- [ ] **Step 5: Ask the user** before tagging (`claude plugin tag plugin --push`), before the GitHub release and before
  `npm publish`; the user publishes. Then verify from the registry: `latest`, `gitHead`, the shasum, and that
  `npx markilo@1.4.0 --version` prints `1.4.0` (run outside the repo).

---

## Not in 1.4.0

| Request                                                                      | Why not now                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A "family lettering" tool that builds new words from existing outlines       | Needs glyph segmentation of arbitrary outlines. Task 5 lets the shared parts be drawn once and reused; Task 8 brings the outlines into the workspace.                                |
| Computed-style sampling and theme detection in `research site`               | Needs a real browser; Markilo reads HTML and CSS offline. Task 7 adds icon colours and an identity-inconsistency finding; the skill says to ask for screenshots.                     |
| A registry-search step (trademark databases)                                 | Registries have no common open API and their terms vary. The skill asks for the consent separately (Task 12) and the links stay as today.                                            |
| `research site --from-html` / owner-confirmed robots override                | Respecting robots.txt stays absolute. A user can save the page and add its logo with `reference add --category existing`.                                                            |
| A measured develop delta (ink, stroke, silhouette vs the chosen)             | Needs calibration across runs. Task 12 sets a ±10 % weight rule and keeps `chosen-vs-now.png`.                                                                                       |
| `proposals --palettes` (one mark in several palettes)                        | `palette` and `render` already do it in two calls; Task 12 tells the orchestrator to offer it.                                                                                       |
| Per-part letter case ("NAME iD") and `concept import` from another workspace | One report each; the first questions (Task 12) ask about case and earlier work. Revisit if a second run hits them.                                                                   |
| A new default token rate                                                     | The rate matches measured agent runs; the gap is the uncounted session. Task 11 labels it.                                                                                           |
| `export --zip`                                                               | Needs a zip writer (no dependency allowed). The kit folder can be zipped by the OS.                                                                                                  |
| Discord TLS failure in `research competitors`                                | A site certificate problem; the issue line already reports it.                                                                                                                       |
| Finalize losing a designer's lockup scale                                    | Not reproduced: finalize keeps a lockup the concept records in `files.lockupHorizontal` (`kit.ts:210`); only `lockup-compact` is composed. Task 12 tells designers to record theirs. |
| Open minors deferred from the 1.2.0 reviews                                  | Still never hit in real use; they stay in the field-report backlog.                                                                                                                  |

## Sources

Three field reports on 1.3.0 (2026-11-12), all from products in one family: two members that keep the parent's
custom wordmark and add a suffix, and a product joining the family from its own domain. Together: 7 explore agents,
4 develop passes, 3 critics, one wrong concept developed and one wrong concept finalized and exported. Each claim was
checked against the code at `89d2214`.

| Finding                                                                                            | Hits | Task  |
| -------------------------------------------------------------------------------------------------- | ---- | ----- |
| Board letters follow ids; a wrong concept was developed, another finalized; single proposal says A | 2    | 1, 12 |
| Previews ignore onDark; tile mark is a bare-3:1 tint; tile ground fixed to primary                 | 2    | 2     |
| Gate says reject on a presentable concept; kit `not-reviewed` after a critique elsewhere           | 2    | 3     |
| No way to build on another concept's drawing                                                       | 1    | 4     |
| Family product: locked parent wordmark + suffix; typeset vs stand-in; stand-in printed as typeface | 3    | 5, 8  |
| Small version cannot be switched off; no small wordmark slot                                       | 2    | 6     |
| `--download-assets` aborts; inline logos and icon colours lost; oklch                              | 2    | 7     |
| Family rule on other domains; extracted by hand                                                    | 2    | 8     |
| Menu/info icons and a client logo taken as competitor logos                                        | 2    | 9     |
| answers amend/batch, semantics, verbose updates, one-proposal board, name risk reasons             | 2    | 10    |
| Agent vs wall minutes, subagent-only dollars, interrupted agents                                   | 3    | 11    |
| First questions order and consents; name idea filtered as cliché; requested vs unrequested change  | 3    | 12    |

The reports also praised parts that should stay as they are:

- `research site` → profile → brief, and `nameCase`.
- Early first questions.
- One designer per proposal, with eliminated variants and an honest First read.
- `proposals`, `verify`, `compare` and `color compare` as the measured basis for a decision.
- The independent critic's numbered fixes.
- finalize requiring the user's words and `--accept-risk`; `export --all` with `logos/overview.png`.

## Progress record

(filled in during implementation)
