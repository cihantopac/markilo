# Gallery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A calm, visual, three-colour review gallery shown by default (also in the desktop app), with decisions
pasted back from chat, and a rewritten README with fresh screenshots.

**Architecture:** The shared interface tokens in `src/ui/chrome.ts` drop to Markilo's three colours. The gallery's
markup, CSS and client script are split out of the 749-line `src/gallery/gallery.ts` into focused files and rebuilt as
a board of proposals plus one large proposal with folded details. `feedback --import` learns to read a pasted text.
Skills show the gallery by default. README and screenshots are redone from Markilo's own `branding/` workspace.

**Tech Stack:** TypeScript ESM, vitest, biome, esbuild bundle (`plugin/dist/markilo.mjs`), offline single-file HTML.

**Spec:** `docs/superpowers/specs/2026-11-16-gallery-redesign-design.md`

## Global Constraints

- Interface colours: paper `#f2ece1` (60 %, cards `#fbf8f2`), ink `#16120f` (30 %), oxblood `#7e1d2a` (10 %: primary
  buttons, hover, focus, active, selected). Greys are ink tints (`rgba(22,18,15,a)` or mixes), no other hue. Dark
  theme swaps paper/ink and lifts oxblood for AA contrast. Brand artwork keeps its own colours.
- No green/amber status colours in gallery, kit preview or guidelines interface CSS. A problem = "!" glyph + word in
  oxblood; never colour alone.
- Visible by default per proposal: marks, letter + title, one-line idea (first sentence of `pitch.idea`, else
  `direction`), decision buttons. Everything else inside one `<details>` "Details". Nothing removed from the file.
- Pages stay offline single files; CSP with per-build nonce unchanged; no network, no new fonts.
- Every new interface string marked with `t()`/`ta()` and translated in `src/ui/tr.ts` (the TR test enforces it).
- EN/TR, light/dark/system, 375 px mobile without horizontal scroll, print, keyboard + visible focus keep working.
- No private product names in code, tests, docs, commits; synthetic brands only (Acme, Tidepool, Lumen, Ledger,
  Nimbra). Stage explicit paths; never `git add -A`. Run `npm run build` before `npm run ci`; commit the rebuilt bundle.
- Tag, GitHub release and npm publish wait for the owner's approval.

## Review Focus

1. **No script** (side panel or blocked JS): every proposal must still be readable — the board links to anchors and
   all proposals render stacked; only switching needs JS. Test in Task 3.
2. **Round sizes 1, 2 and 4+, plus rejected and older rounds**: board and switcher must not assume three. Test in
   Task 3.
3. **Long titles and Turkish labels** (longer than English) on a 375 px viewport: no overflow. Checked by eye in Task 6
   screenshots (mobile TR dark).
4. **Pasted text with chat noise** (text before/after, quotes, two blocks, a block edited by hand): `--import` takes the
   last valid `markilo-feedback` block and rejects garbage with a clear error. Test in Task 2.
5. **A failing check or originality `redesign`** must stay visible without opening Details. Test in Task 3.

---

### Task 1: Three-colour interface tokens

**Files:**
- Modify: `src/ui/chrome.ts` (LIGHT/DARK tokens, `.mk-*` chrome CSS: quieter top bar, steps as a thin line)
- Modify: `src/export/guidelines.ts:214-215`, `src/export/preview.ts` (replace `--good/--warn/--bad`, `#fff6db`,
  `#f0d27a` uses with ink/oxblood tokens)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Produces: tokens `--bg --card --sunk --ink --muted --line --accent --accent-ink --link --shadow` and `--problem`
  (= oxblood). `--good`, `--warn`, `--bad` are removed.

- [ ] **Step 1: Write the failing test** `it('uses only Markilo’s three colours in interface CSS')` in
  `tests/ui.test.ts`: for `review`, `approved`, `kit`, `guidelines`, take every `<style>` block, drop `style="…"`
  attributes (brand artwork), collect hex colours; each must be in the allowed set
  `{#f2ece1,#fbf8f2,#16120f,#7e1d2a,#fff,#ffffff}` plus the dark-theme set defined in `chrome.ts` (export it as
  `INTERFACE_COLOURS`); `rgba(` values must use `22,18,15` or `242,236,225` or `0,0,0`. Also assert no
  `var(--good)`, `var(--warn)`, `var(--bad)` in any page.
- [ ] **Step 2:** `npx vitest run tests/ui.test.ts -t "three colours"` → FAIL listing the extra hues.
- [ ] **Step 3:** Rewrite tokens and chrome CSS; export `INTERFACE_COLOURS: readonly string[]`; replace status hues in
  guidelines/preview CSS (problem bands: oxblood text + "!" prefix, notes: ink-tint background).
- [ ] **Step 4:** `npm run build && npx vitest run tests/ui.test.ts` → PASS.
- [ ] **Step 5: Commit** `src/ui/chrome.ts src/export/guidelines.ts src/export/preview.ts tests/ui.test.ts` —
  `feat(ui): three-colour interface tokens`.

### Task 2: Paste decisions back from chat

**Files:**
- Modify: `src/gallery/feedback.ts` (add `extractFeedback`)
- Modify: `src/cli/commands.ts` (`feedback --import`: description "A markilo-feedback.json or a text with a pasted
  markilo-feedback block")
- Test: `tests/gallery-feedback.test.ts`

**Interfaces:**
- Produces: `extractFeedback(text: string): unknown` — returns the parsed JSON of a whole-JSON text, else of the
  **last** fenced block whose info string is `markilo-feedback` (` ```markilo-feedback ` … ` ``` `);
  throws `MarkiloError('INVALID_INPUT', 'No markilo-feedback block found in the pasted text.')` otherwise. The result
  still goes through `parseFeedback`.
- Produces (used by Task 3's client): `feedbackText(f: GalleryFeedback): string` = `feedbackRequests(f)` lines as
  `- …`, a blank line, then the fenced block with `JSON.stringify(f)`.

- [ ] **Step 1: Failing tests:** `extractFeedback` on (a) plain JSON file text → object; (b) chat text with prose
  before/after and one block → that block; (c) two blocks → the last; (d) no block → throws with the message above;
  (e) a block with invalid JSON → throws `INVALID_INPUT`; round trip `parseFeedback(extractFeedback(feedbackText(f)))`
  keeps decisions equal.
- [ ] **Step 2:** `npx vitest run tests/gallery-feedback.test.ts` → FAIL (not exported).
- [ ] **Step 3:** Implement both; `--import` reads the file text through `extractFeedback`.
- [ ] **Step 4:** `npx vitest run tests/gallery-feedback.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(feedback): import decisions pasted from chat`.

### Task 3: Presentation-layout gallery

**Files:**
- Create: `src/gallery/style.ts` (`GALLERY_CSS: string`), `src/gallery/client.ts` (`galleryScript(opts: {
  served: boolean }): string`), `src/gallery/cards.ts` (`boardHtml`, `proposalHtml`, `detailsHtml`,
  `approvedHtml`, `sketchBoardHtml`, moved from `subjectCard`/`approvedPanel`/`sketchCards`)
- Modify: `src/gallery/gallery.ts` (data + page assembly only), `src/ui/tr.ts`
- Test: `tests/ui.test.ts`, `tests/rounds.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens; Task 2 `feedbackText` format (the client builds the same text: summary lines + fenced
  `markilo-feedback` block).
- Produces: page anatomy other tasks and screenshots rely on —
  `<nav class="board">` with one `<a class="tile" href="#<slug>-<key>">` per proposal (letter, title, word mark on
  paper, icon on ink); `<article class="proposal" id="<slug>-<key>">` holding `.hero` (pinnable large mark),
  `.icon` (on ink), `.lockup`, `.sizes`, `p.idea`, `.flags`, `.decide`, `<details class="more">`; action bar
  buttons `#copy` "Copy decisions", `#send`, `#cmpbtn`, `#clear`.

Layout rules: board tiles in one row (wrap on mobile, 2 per row at ≤640 px); one proposal shown at a time with JS
(`[data-active]`), all stacked without JS; ←/→ and the board switch proposals; Compare opens a side-by-side view of
2–3 ticked proposals with the same restraint. Instructions: one sentence under the title
("Pick one, ask for changes, or compare. The choice is yours."). Steps stay in the top bar as a thin line. Spacing
and tone separate surfaces; borders only where needed. `.flags` shows at most two oxblood "!" words (failing checks,
originality `redesign`/`review`, critic below the bar) — nothing when all is well. Decision buttons: Select
(oxblood fill when on), Request changes, Drop (outline); chips/note/pins appear only for Request changes.
Approved identity: the large view with its kit links; explored concepts folded. Sketch rounds: the board shows the
sketch grid; picking unchanged. Family: one board per member.

- [ ] **Step 1: Failing tests** in `tests/ui.test.ts` / `tests/rounds.test.ts`:
  - review page has `class="board"` with one `.tile` per proposal and matching `article.proposal` ids;
  - each proposal's visible part (outside `details.more`) contains no `class="pitch"`, `class="checks"`,
    rationale or swatch codes; those are inside `details.more`;
  - `p.idea` text is one sentence (no second `. `) and ≤ 140 characters;
  - a concept with a failing check shows `.flags` with "!" outside `details.more`;
  - rounds of 1, 2 and 4 proposals build with that many tiles (rounds.test helper);
  - without script: every `article.proposal` is present in the HTML and none has `hidden`;
  - action bar has `#copy` labelled "Copy decisions" and no "Copy request".
- [ ] **Step 2:** `npm run build && npx vitest run tests/ui.test.ts tests/rounds.test.ts` → FAIL on the new
  assertions.
- [ ] **Step 3:** Split the file (move, no behaviour change), then rebuild markup, CSS and client script to the
  anatomy above; add TR strings.
- [ ] **Step 4:** `npm run build && npm run ci` → all pass (update existing tests that asserted removed markup, e.g.
  `.how`, `.pill.good`, to the new anatomy — never delete a behaviour assertion without a replacement).
- [ ] **Step 5: Look at it.** Build `branding/` gallery (`node plugin/dist/markilo.mjs gallery --workspace branding`)
  and a synthetic review round; open both in the browser pane at 1440 px and 375 px, light and dark, EN and TR; fix
  what looks off. Then copy decisions and confirm the text round-trips through `feedback --import`.
- [ ] **Step 6: Commit** gallery files, `src/ui/tr.ts`, tests, rebuilt `plugin/dist/markilo.mjs` —
  `feat(gallery): calm presentation layout with folded details`.

### Task 4: Show the gallery by default

**Files:**
- Modify: `plugin/skills/design/SKILL.md` (C. The user chooses; Choices given in chat), `plugin/skills/gallery/SKILL.md`,
  `plugin/skills/concepts/SKILL.md` step 5, `docs/USAGE.md` (feedback import)
- Test: `tests/plugin.test.ts` (if it checks skill text) — add: design and gallery skills no longer say the gallery
  is optional and mention "Copy decisions".

Skill rule (exact intent): regenerate the gallery each round and **show it**: when the session has a tool that sends
a file to the user for display, send `brand/gallery/index.html` with it; else give the `file://` link (terminal:
`gallery --serve` URL). Also send `proposals/round-<n>.png` for a quick look. The user answers in chat or with
**Copy decisions**; save pasted text to a file and run `markilo feedback --import <file>`; still record chat answers
with `concept update --status` and `answers`.

- [ ] **Step 1:** Failing test asserting the new wording; run → FAIL.
- [ ] **Step 2:** Edit the skills and USAGE.
- [ ] **Step 3: Spike (manual):** in this desktop session, send the new gallery file with the file sender
  (render) and check: page renders, theme/lang switches, proposal switching, Copy decisions (or the selectable
  fallback). Record the result in the plan's Progress section; adjust the skill text if the panel blocks scripts.
- [ ] **Step 4:** `npx vitest run tests/plugin.test.ts && claude plugin validate plugin` → PASS.
- [ ] **Step 5: Commit** — `docs(skills): show the gallery by default and read pasted decisions`.

### Task 5: Version and changelog

**Files:** `package.json`, `package-lock.json` (lines 3, 9), `plugin/.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, `CHANGELOG.md`

- [ ] **Step 1:** Bump to `1.7.0`; CHANGELOG `## [1.7.0] - <date>`: Changed (gallery layout, three-colour interface,
  gallery shown by default), Added (`feedback --import` reads pasted text, Copy decisions).
- [ ] **Step 2:** `npm run build && npm run ci` → pass. Commit — `chore: 1.7.0`.

### Task 6: README showcase and screenshots

**Files:**
- Modify: `README.md`, `plugin/README.md` (if it mirrors), `assets/screens/*.png`, `assets/social-preview.png`
- Modify: `scripts/readme-assets.mjs` only if new exported files are copied

- [ ] **Step 1: Screenshots.** Rebuild `branding/` exports and gallery with the new bundle
  (`export --workspace branding --brand markilo --clean`, `node scripts/readme-assets.mjs`, `gallery --workspace
  branding`). For the review shots use a copy of `branding/` in the scratchpad with the round's three concepts
  un-finalized (so the page shows the board), never edit `branding/` itself. Capture in the browser pane at
  device-scale 2: `gallery.png` (1440 px, light, board + proposal A), `gallery-detail.png` (Details open),
  `gallery-compare.png`, `gallery-request.png` (Request changes with a pin), `gallery-mobile-tr-dark.png` (375 px),
  `kit-preview.png`. Check each image by eye (Review Focus 3).
- [ ] **Step 2: Rewrite README.** Order: hero logo + one-line promise + badges; one large gallery screenshot; three
  steps (Proposals → Choose → Kit) each with one short sentence and one image; Made with Markilo (keep the three
  public tools and their recorded costs); The kit (overview image + one line of contents); Install; Cost and limits
  (substance of today's section, shorter; numbers only from `docs/BENCHMARKS.md` and release logs); Learn more;
  License. Short sentences, no claim without a source. Image URLs pinned to `markilo--v1.7.0`.
- [ ] **Step 3:** Check every link and image path exists (`grep -o 'assets/[^")]*' README.md | xargs ls`), lint
  markdown by eye on GitHub preview after push.
- [ ] **Step 4: Commit** README and assets — `docs(readme): showcase rewrite with the new gallery`.
- [ ] **Step 5:** Final `npm run build && npm run ci && node scripts/smoke.mjs && claude plugin validate plugin`;
  push `main`; ask the owner before tag/release/publish; tell them to upload `assets/social-preview.png` in GitHub
  settings.

## Progress

(executor records rulings, spike result and verification here)
