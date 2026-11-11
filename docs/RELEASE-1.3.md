# Markilo 1.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what a full identity run on 1.2.0 showed. The first round should aim at a beautiful icon rather than a
clever one. The first questions should be the ones that cost a round when skipped. Development should offer word
options as well as icon options. A small version should carry the small sizes. Each ground should get its own colour.
Cost and time should be measured from what the harness reports.

**Architecture:** Small changes in existing modules: research/site, the proposals and concept commands, report/quality,
the palette and exporter, guidelines and cost. Skill and agent text changes are grouped in two tasks. No new
dependencies or subsystems.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, esbuild bundle in
`plugin/dist/markilo.mjs`.

**Spec:** one field report on 1.2.0. It is a full run of an identity for a company website through every stage, from
understand to export: 2 explore rounds, 2 development passes and 5 user decisions, giving a 190-file kit. Each claim was
checked against the code at `7672aa7`. The findings are summarized in [Sources](#sources).

## Global Constraints

- No new runtime or dev dependencies; no i18n framework.
- Everything runs offline; generated HTML keeps its CSP (nonce for the gallery, `sha256-` hash for the kit and
  guidelines pages).
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
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 10).
- Bundle no third-party logos or trademarks; see [Not in 1.3.0](#not-in-130).

## Review Focus

1. **A kit finalized before 1.3.0** has a brand.json without `onDark` or `onLight`. It must export exactly as before.
   The existing `old kits export unchanged apart from the new files` hash test must keep passing unchanged (Task 4).
2. **A locked brand** with `onDark`/`onLight` set must never be recoloured. Pinned in Task 4 by
   `does not recolour a locked brand`.
3. **A concept without a small version** keeps failing the 16 px checks (status `needs-work`). Only a concept that has
   `files.small` hands them over. Pinned in Task 3 by `without a small version the main symbol still fails at 16 px`.
4. **`concept update --symbol` with a path outside the concept folder** must still be refused, whether written relative
   to cwd or as `../`. Pinned in Task 5 by `refuses a cwd-relative path outside the concept folder`.
5. **A cost log without `budgetMinutes`** (written by 1.2.0) must read, summarise and report its status exactly as
   before. Pinned in Task 7 by `a 1.2 log without a time budget reads unchanged`.

---

### Task 1: `research site` reports how the name is cased

The site wrote the name in capitals everywhere. The run guessed "lower or mixed case is fine", got a lower-case
proposal, and lost a round.

**Files:**

- Modify: `src/research/site.ts` (`SiteScan` at :124, the return literal at ~:480-514)
- Test: `tests/research-net.test.ts` (local HTTP server fixture, main test at :97)

**Interfaces:**

- Produces: `SiteScan.nameCase?: { name: string; case: 'upper' | 'lower'; seenIn: ('og:site_name' | 'json-ld' | 'title')[] }`.

- [ ] **Step 1: Write the failing tests.** Add pages to the local server:

```ts
it('reports a name written in capitals everywhere', async () => {
  // og:site_name "TIDEPOOL", JSON-LD Organization name "TIDEPOOL", <title>"TIDEPOOL — tide tables"
  const scan = await scanSite(`${base}/caps`, opts);
  expect(scan.nameCase).toEqual({
    name: 'TIDEPOOL',
    case: 'upper',
    seenIn: ['og:site_name', 'json-ld', 'title'],
  });
});
it('says nothing when the name is mixed case or the sources disagree', async () => {
  // og:site_name "Tidepool", JSON-LD "TIDEPOOL"
  expect((await scanSite(`${base}/mixed`, opts)).nameCase).toBeUndefined();
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/research-net.test.ts`.
- [ ] **Step 3: Implement.**
  - Candidates: `siteName`, `organization.name`, and the first segment of the first page title before `—`, `|`,
    `-` or `: `.
  - Take the name from `siteName`, or else from `organization.name`.
  - A candidate counts when it equals the name case-insensitively.
  - Report `upper` or `lower` only when the name has at least two letters and every counted candidate has that same
    case. Otherwise omit the field.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(research): site scan reports how the name is cased`.

### Task 2: `proposals` names the `typeset` base

A word scored 0.715 (far from typeset) and the user still said "it looks like an ordinary font". The scorer had also
changed the base weight. The number means nothing without its base.

**Files:**

- Modify: `src/cli/commands.ts` (`proposals`, `typeset` at :1828 and :1846-1856, the result at :1905-1915)
- Test: `tests/rounds.test.ts` (near :132 and :225)

**Interfaces:**

- Produces:
  - `proposals` output gains `typesetBase: Record<string, { font: string; weight: number; case: 'as-is' | 'lower' | 'upper' }>`
    next to `typeset`.
  - `typeset` keeps its shape (`Record<string, number>`).

- [ ] **Step 1: Write the failing test.** In the existing typeset test, assert
  `expect(r.typesetBase.p1).toEqual({ font: <the concept's fontId>, weight: <its weight>, case: expect.any(String) })`.
- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run tests/rounds.test.ts`.
- [ ] **Step 3: Implement.** Fill `typesetBase[cpt.id]` from `wordmarkFont(...)` and `typesetLikeness(...).case`.
  Also name the base in the existing `missing` message.
- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** with the message `feat(proposals): name the font and weight typeset likeness is measured against`.

### Task 3: A small version carries the small sizes

Export already uses the small version at ≤ 32 px (`exporter.ts:299,319`). Even so, `verify` still failed the main
symbol at 16 px, so the concept stayed `needs-work`. Designers had to leave checks failing on purpose.

**Files:**

- Modify: `src/report/quality.ts` (`verifyConcept`, the small block at :128-150, status at :243-245)
- Test: `tests/small.test.ts`

**Interfaces:**

- Produces: when `concept.files.small` exists, the main symbol's `fidelity-16`, `fidelity-32` and `thin-detail` checks
  with status `warn` or `fail` become `info`. Their message gets the suffix ` — the small version carries this size.`
  The small version's own checks are unchanged and still count.

- [ ] **Step 1: Write the failing tests.**
  - `a small version takes over the 16 px checks`: a symbol with hairline points (fails `thin-detail`) plus a small
    version that passes. Expect `symbol:thin-detail` to be `info`, `small:thin-detail` to be `pass`, and the status not
    to be `needs-work` because of them.
  - `without a small version the main symbol still fails at 16 px`: the same symbol without `files.small`. Expect
    `symbol:thin-detail` to be `fail` and the status `needs-work`.
  - `a failing small version still blocks`: the small version itself fails `thin-detail`, so the status is
    `needs-work`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/small.test.ts`.
- [ ] **Step 3: Implement.** Downgrade those checks in `verifyConcept` after the symbol is assessed, before merging.
  `assessQuality` stays as it is. Recompute `summary` from the checks.
- [ ] **Step 4: Run the tests and confirm they pass.** Also run `tests/quality.test.ts`.
- [ ] **Step 5: Commit** with the message `fix(verify): the small version carries the 16 and 32 px checks`.

### Task 4: A colour for each ground

The brand rule was "mint on dark, deep green on light". `primary/ink/paper` cannot say that, so the designer turned
`paper` black. Export then lightened the green by itself for the light ground (`adaptToGround`).

**Files:**

- Modify: `src/core/types.ts` (`ConceptPalette` :130), `src/export/kit.ts` (`BrandKit.palette` :15, finalize copies
  the fields), `src/cli/commands.ts` (`concept new` :1190, `concept update` :1355-1365 and its usage),
  `src/export/exporter.ts` (call sites :166, :648, :766, :1064 and :421, and `exportTokens`),
  `src/export/variants.ts`
- Modify: `docs/OUTPUTS.md`, `plugin/skills/design/references/cli.md`, the colour step in
  `plugin/agents/concept-designer.md` (develop step 6)
- Test: `tests/export.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `ConceptPalette.onDark?: string` and `ConceptPalette.onLight?: string` are the brand colour that replaces `primary`
    on a dark or a light ground. The same two fields go on `BrandKit.palette`.
  - CLI: `concept new|update --on-dark <#hex|none> --on-light <#hex|none>`, validated like `--secondary`.
  - `recolorPrimary(svg: string, primary: string, to: string): string` in `src/export/variants.ts`. It replaces fill
    and stroke values equal to `primary` (compared after `normalizeColor`).
  - tokens: `--<slug>-on-dark`/`--<slug>-on-light` in tokens.css and `onDark`/`onLight` in tokens.json, only when set.

- [ ] **Step 1: Write the failing tests.**
  - `uses onLight on light grounds and onDark on dark grounds`: a dark-first brand (paper `#0b1220`, primary
    `#3ddc97`, onLight `#007044`).
    - Reversed logos on the light ground, the light social card and the guidelines' reversed tile contain `#007044`.
    - They contain neither `#3ddc97` nor an `adaptToGround`-lightened shade.
  - `does not recolour a locked brand`: the same palette with `kit.locked`. Every logo hash equals the export without
    `onDark`/`onLight`.
  - The existing `old kits export unchanged apart from the new files` passes unchanged.
  - CLI: `concept update --on-light #007044` stores it. `--on-light green` → `USAGE`. `--on-light none` removes it.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/export.test.ts tests/cli.test.ts`.
- [ ] **Step 3: Implement.**
  - At each listed call site, when the kit is not locked and the target ground has a matching field, apply
    `recolorPrimary` before `adaptToGround`.
  - `adaptToGround` then leaves the brand colour alone if it already passes 3:1, and still fixes everything else.
  - Without the fields, the code path is the same as before.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(palette): onDark and onLight brand colours, used by every ground in the export`.

### Task 5: `concept update` takes paths from where you are, and a chat choice keeps the chosen drawing

Two problems:

- `concept update --wordmark brand/brands/x/concepts/a/wordmark.svg` failed with `NOT_FOUND`, because paths resolve
  against the concept folder only (commands.ts:1344-1356). An absolute path inside the folder is also stored as given.
- A choice made in chat with `concept update --status shortlisted` never runs `keepChosen` (rounds.ts:57). So
  `proposals` cannot draw `chosen-vs-now.png`.

**Files:**

- Modify: `src/cli/commands.ts` (`concept update` file options and `--status`)
- Modify: `plugin/skills/refine/SKILL.md` (step 1: a decision given in chat is recorded with
  `concept update --status shortlisted`, which keeps the chosen drawing)
- Test: `tests/cli.test.ts` (near :484), `tests/rounds.test.ts`

**Interfaces:**

- Produces:
  - A file option value resolves first against the concept folder. If no file exists there, it resolves against the
    cwd, and it must then be inside the concept folder.
  - The stored value is always relative to the concept folder.
  - `--status shortlisted` calls `keepChosen(ws, slug, concept)` and returns `kept: string[]`, the same as the
    `feedback --apply` path.

- [ ] **Step 1: Write the failing tests.**
  - `accepts a cwd-relative path inside the concept folder and stores it relative`.
  - `refuses a cwd-relative path outside the concept folder`, e.g. another concept's `symbol.svg`: `UNSAFE_PATH`.
  - `--status shortlisted keeps the chosen drawing`: `chosen/` exists afterwards. A later `proposals --concepts <id>`
    after changing `symbol.svg` writes `review/chosen-vs-now.png`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Reuse `resolveInsideReal`.
  - `keepChosen` already refuses to overwrite an existing `chosen/`, so a second shortlisting keeps the first choice.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message
  `fix(concept): paths from the cwd; a shortlist made in chat keeps the chosen drawing`.

### Task 6: The guidelines say when originality was not verified

The run finalized with `--accept-risk` at `insufficient-evidence`, after 0 competitor marks. The guidelines page
mentions that only inside a line of the originality section.

**Files:**

- Modify: `src/export/guidelines.ts` (md :106-112, html :204-211), `src/ui/tr.ts`
- Test: `tests/export.test.ts` (near :99-101), `tests/ui.test.ts`

**Interfaces:**

- Produces:
  - When `kit.originality.verdict === 'insufficient-evidence'`, both pages open the originality section with this
    sentence:
    `Originality not verified: no competitor marks were compared. Run research (with network access) before relying on this mark.`
  - In html, the sentence is a `<p class="band warn">`, styled with the page's existing warn colour token.
  - The Turkish entry is added to `tr.ts`.
  - Other verdicts are unchanged.

- [ ] **Step 1: Write the failing test.** Finalize the synthetic brand with `--accept-risk` and no references. Both
  guidelines files contain the sentence, and a verified brand's guidelines do not.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and confirm they pass**, including `tests/ui.test.ts`.
- [ ] **Step 5: Commit** with the message `feat(guidelines): a visible band when originality was not verified`.

### Task 7: Cost from the harness, and a time budget

The agents cannot see their own tokens, so all eight sent estimates. The harness's task notification had the real
figures: `subagent_tokens` 1,215,698, and `duration_ms` adding up to 131 minutes. The desktop app shows no session
total for `--session-usd`. The cost the user felt was time.

**Files:**

- Modify: `src/report/cost.ts` (`CostLog`, `costSummary` :107), `src/cli/commands.ts` (`cost`)
- Modify: `plugin/skills/design/SKILL.md` (item 8 :44-48 and :73), `plugin/skills/concepts/SKILL.md` (:24-25),
  `plugin/skills/refine/SKILL.md` (:16, :26), `plugin/skills/design/references/cli.md` (:92),
  `plugin/skills/design/references/workflow.md` (:15-16), `docs/USAGE.md`
- Test: `tests/cost.test.ts`

**Interfaces:**

- Produces:
  - `CostLog.budgetMinutes?: number`, set with `cost --budget-minutes <m>` (finite, > 0, else `USAGE`).
  - `costSummary` gains `minutesBudget?: number` and `minutesRemaining?: number`.
  - `status` becomes the worse of the USD status and the minutes status, using the same `WARN_AT` (0.8) and `over`
    rules. Without `budgetMinutes`, it is exactly the 1.2.0 status.
  - Skills: after each agent, record `--tokens <subagent_tokens> --minutes <duration_ms / 60000>` from the harness's
    task notification, not the agent's own estimate. Record `--session-usd` only when Claude Code shows a session
    total. Otherwise leave the total marked as a lower bound and say so to the user. At understand, ask the user's time
    budget along with the money budget (Task 8's question set) and record it with `--budget-minutes`.

- [ ] **Step 1: Write the failing tests.**
  - `a time budget turns the status to warn and over`: budget 60 minutes. Entries of 50 minutes give `warn`, and 61
    minutes give `over`, while the USD stays far below its budget.
  - `a 1.2 log without a time budget reads unchanged`: the existing 1.2 fixture gives the same summary as before, with
    no `minutesBudget` key.
  - `--budget-minutes 0` and `--budget-minutes -5` give `USAGE`.
  - `plugin.test.ts`: `concepts/SKILL.md` mentions `subagent_tokens` and `duration_ms`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/cost.test.ts tests/plugin.test.ts`.
- [ ] **Step 3: Implement.** Do not change `DEFAULT_RATE` and do not add a per-model price table (see Not in 1.3.0).
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(cost): a time budget, and cost recorded from the harness's figures`.

### Task 8: Understand and Explore aim at a beautiful icon

All three round-1 icons were rejected. The skill's mix pushed the round toward a clever idea: an icon derived from the
word and a "warmer" direction. A good-looking mark mattered more to the user. The user said originality was fine, but
how the mark looks matters more.

**Files:**

- Modify: `plugin/skills/design/SKILL.md` (understand question :69, the mix rule :78-82, explore :90-92)
- Modify: `plugin/skills/concepts/SKILL.md` (:16)
- Modify: `plugin/skills/design/references/design-principles.md` (:35-45, :127-128, :131-142)
- Modify: `plugin/agents/concept-designer.md` (explore mode :40-77)
- Test: `tests/plugin.test.ts`

**Interfaces:** none (skill and agent text). Keep each file's tone and density. Add rules, not essays.

- [ ] **Step 1: Write the failing tests** in `plugin.test.ts`:
  - `design/SKILL.md` has the heading `### First questions`. Under it are the three questions: `letter case`, `icon or
    word first` and `network`. It also has the sentence `If the user is away or asked not to be asked`.
  - `design-principles.md` has `## The icon stands on its own`.
  - `design/SKILL.md` no longer contains `at least one is warmer or more human than the category expects`.
  - The concept-designer explore slice (`## Mode \`explore`…`## Mode \`develop`) contains `at least four variants`and
   `First read:`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/plugin.test.ts`.
- [ ] **Step 3: Write.**
  - **First questions** (design/SKILL.md understand step, mirrored in concepts/SKILL.md). Ask them together, each with a
    suggested answer and buttons:
    1. Letter case: CAPITALS / lower case / Mixed. Suggest what `research site` reports in `nameCase` (Task 1).
    2. Icon or word first.
    3. May research use the network for competitors and registries?

    Ask the time and money budget in the same message.
  - **Unattended runs.** If the user is away or asked not to be asked, take the suggested answers. Write them into
    the brief as `assumptions`, list them at the top of the first round's message, and ask them again with that round.
  - **The mix rule.** Keep "at least one wordmark-led unless the brief says otherwise". Demote "warmer or more human"
    to a suggestion, used when the brief's personality asks for it.
  - **The icon stands on its own** (design-principles.md, replacing the "derived from the word" default at :40-41):
    - Every icon must work alone as an app tile at 180 px and 32 px before it is clever.
    - A letter, pair or monogram is allowed only when it passes that test. The validation note at :139-140 is the
      reason.
    - A well-known mark it recalls counts against it.
  - **Explore draw-and-cull** (concept-designer explore, step 4):
    - Draw at least four variants of the icon.
    - Render them together with `markilo render … --compare` as tiles.
    - Keep the best, and list the readings you discarded in `work/notes.md`.
  - **First read** (concept-designer explore, pitch):
    - Add a line `First read: …` giving what a stranger sees at first glance.
    - Name any well-known mark or symbol it recalls, letter by letter for an O, a C or a circle.
    - The orchestrator reads these lines on the round board before showing it.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `docs(design): first questions, a stand-alone icon, draw-and-cull and a first read`.

### Task 9: Develop offers word options; the process is explicit

Develop drew icon options when the icon was already chosen. The word went from thin to extra bold, then to four options
before the user picked one. The critic, the gallery and the family path are unclear in the skills.

**Files:**

- Modify: `plugin/agents/concept-designer.md` (develop mode :79-115)
- Modify: `plugin/skills/refine/SKILL.md`, `plugin/skills/design/SKILL.md` (verify :126-135, family)
- Modify: `plugin/skills/design/references/cli.md` (:31, and the `wordmarks` row), `plugin/skills/design/references/workflow.md`
- Test: `tests/plugin.test.ts`

**Interfaces:** none (skill and agent text).

- [ ] **Step 1: Write the failing tests** in `plugin.test.ts`:
  - The develop slice contains `review/wordmark-options.png` and `weight ladder`.
  - `design/SKILL.md` contains `### Family` and `Record a skipped critic`.
  - `cli.md` has no table row with more cells than its header.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Write.**
  - **Develop priorities.** Draw options for what the user's feedback is about:
    - Icon options when the icon is open.
    - `review/wordmark-options.png` when the word is open: three or four different ideas, set with the approved icon on
      both grounds and at small size, rendered with `markilo render … --compare`.
  - **Weight ladder.** For "too thin" or "too bold" feedback, render three to five weights in one sheet instead of one
    jump.
  - **Housekeeping.**
    - When the mark changes meaning (6 petals → 7), update the concept title with `concept update --title`.
    - Delete outdated review files you made yourself.
  - **Critic.**
    - After a development pass the critic is required. Skip it only if the user declines.
    - `Record a skipped critic` in the brief's notes, so `gate.status: not-reviewed` has a reason.
  - **Family.** Add a `### Family` step in design/SKILL.md that points to workflow.md:51-71, for briefs that list a
    product family.
  - **Gallery.** Choices given in chat are recorded with `concept update --status` (Task 5). The gallery is optional.
  - **cli.md.** Escape the pipes on line 31 (`\|`). Add `--on-dark`/`--on-light` (Task 4), `--budget-minutes` (Task 7)
    and `typesetBase` (Task 2) where those rows are.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `docs(develop): word options, a weight ladder, and an explicit critic and family step`.

### Task 10: Release 1.3.0

**Files:**

- Modify: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
  (version `1.3.0`)
- Modify: `CHANGELOG.md`, `docs/OUTPUTS.md`, `docs/USAGE.md`, and this file (the progress record below)
- Modify: `branding/brands/markilo/exports/**`. Re-export with `--only logos,web,social,tokens,guidelines --clean`;
  the logo files must stay byte-identical.

- [ ] **Step 1: Run the full checks.**
  - `npm run ci` and `node scripts/smoke.mjs` must pass.
  - `claude plugin validate plugin` must report the plugin valid.
- [ ] **Step 2: Run one real check on a synthetic brand.** Use a dark-first website named in capitals, with a small
  version and `onLight` set. Expected:
  - `research site` on a local page returns `nameCase: upper`.
  - `verify` hands the 16 px checks to the small version.
  - Reversed and light-ground files use `onLight`.
  - `proposals` shows `typesetBase`.
  - `cost` warns on the time budget.

  Record the result here.
- [ ] **Step 3: Write the CHANGELOG** 1.3.0 entry (Added / Changed / Fixed). Commit `release: 1.3.0 — field-report fixes`
  and push.
- [ ] **Step 4: Ask the user** before tagging (`claude plugin tag plugin --push`), before the GitHub release and before
  `npm publish`; the user logs in and publishes or gives the OTP. Then verify from the registry: `latest`,
  `gitHead`, the shasum, and that `npx markilo@1.3.0 --version` prints `1.3.0`.

---

## Not in 1.3.0

| Request                                                  | Why not now                                                                                                                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bundled set of famous marks to compare against         | Shipping third-party logos in an open-source package raises trademark and licensing questions. Task 8's "First read" catches the common case at no cost. `markilo reference add` already takes marks the user collects. |
| A second typeset signal (closeness to geometric sans)    | It needs a reference set and calibration. Naming the base (Task 2) removes most of the confusion first.                                                                                                                 |
| A per-model price table or a new default rate            | Prices change and would go stale in the bundle. Task 7 records the harness's real tokens and minutes, and a time budget gives a working brake.                                                                          |
| Using designer-made `lockup-*-light.svg` files in export | `onLight` (Task 4) gives export the colour the designer wanted, with no second set of files to keep in sync.                                                                                                            |
| A tool that prunes `review/`                             | Automatic deletion in a user's workspace is risky. Designers delete what they made (Task 9).                                                                                                                            |
| Custom-drawn words keep the setup `typography.fontId`    | Not reproduced in code yet; it needs a check of how custom lettering is recorded.                                                                                                                                       |
| The small version stops reading as the same mark         | Not reproduced; `same-mark` already warns below 0.62. Watch the next report.                                                                                                                                            |
| Open minors deferred from the 1.2.0 reviews              | They stay in the field-report backlog. None has been hit in real use.                                                                                                                                                   |

## Sources

One field report on 1.2.0 (2026-11-11). It is a full run of a company website identity: research, 2 explore rounds
(6 agents), 2 development passes, finalize with `--accept-risk`, and export (190 files). Agent time was 131 minutes,
with 1.2 M agent tokens. Each claim was checked against the code at `7672aa7`.

| Finding                                                                                            | Task |
| -------------------------------------------------------------------------------------------------- | ---- |
| The name's capitals were not asked about, which cost a round                                       | 1, 8 |
| `typeset` 0.715, but the user said it looked like a font, and the base was not shown               | 2    |
| Main symbol fails 16 px although a small version exists                                            | 3    |
| "Mint on dark, green on light" could not be expressed; export lightened the green                  | 4    |
| `concept update` relative path `NOT_FOUND`; no `chosen-vs-now.png` after a chat choice             | 5    |
| Originality never verified, and the guidelines barely said so                                      | 6    |
| Cost from agent estimates; $0.71 recorded on a $12 budget; time was the felt cost                  | 7    |
| Round 1 rejected: clever icons, letter-derived icon, "warmer" direction; one read as a famous mark | 8    |
| No word options in development; weight swung between extremes                                      | 9    |
| Critic, gallery and family steps unclear; cli.md table broken                                      | 9    |

The report also praised parts that should stay as they are:

- `research site` as the one-command start.
- One agent per proposal.
- The round board as the decision tool.
- Carrying the rejection note into the next round.
- The honest finalize gate.
- A clean `export --all`.

## Progress record

_(Filled in during implementation.)_
