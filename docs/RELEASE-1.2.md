# Markilo 1.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what real use of 1.1.3 showed to be wrong or missing. Every promised output should exist, wordmark-only
identities should export correctly, costs should be honest, letter problems should be caught, and the design and
construct tools should be easier to use.

**Architecture:** Small, independent changes in the existing modules: deliverables, exporter, kit, construct, letters,
cost, and the CLI command table. Each task carries its own vitest tests. Skill and agent text changes ride with the code
they describe. There are no new dependencies and no new subsystems.

**Tech Stack:** TypeScript (Node ≥ 20.10, ESM), vitest, biome, resvg-wasm, CanvasKit/PathKit, esbuild bundle in
`plugin/dist/markilo.mjs`.

**Spec:** two field reports on 1.1.3, collected from 2026-11-02 and checked against the code at `b8b9567`. One is a
full identity run (understand → export), the other a study of the code. Their findings are summarized in
[Sources](#sources).

## Global Constraints

- No new runtime or dev dependencies; no i18n framework.
- Everything runs offline; generated HTML keeps its CSP (nonce for the gallery, `sha256-` hash for the kit and
  guidelines pages).
- Locked identities are reproduced byte-for-byte; no task may change a locked brand's artwork.
- Every CLI command prints JSON on stdout; progress and diagnostics go to stderr.
- Tests, fixtures and examples use synthetic brands only (Acme, Tidepool, Lumen, Ledger); no real product names.
- Files, reports and code stay in English; new interface strings in the HTML pages get a Turkish entry in
  `src/ui/tr.ts` (the `tests/ui.test.ts` key scan enforces it).
- `npm run ci` (biome, typecheck, tests, build, dist check) passes after every task; `plugin/dist/markilo.mjs` is
  rebuilt and committed with any source change.
- Commits stage explicit paths only (never `git add -A`) and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tags, GitHub releases and npm publish need the user's explicit approval at the time (Task 13).

## Review Focus

1. **A kit finalized before 1.2.0** (brand.json without the new fields) must export exactly as before, apart from the
   intended changes (tokens.css additions, the Tailwind file, the TV banner, theme-color for dark-first brands). Pinned
   in Task 3 by `old kits export unchanged apart from the new files`.
2. **A locked brand** must not accept `finalize --wordmark-only` and must not be re-centred or recoloured. Pinned in
   Task 5 by `refuses --wordmark-only on a locked brand`.
3. **`export --out` pointing at a dangerous place**, such as a non-empty folder, the brand's `final/` folder or the
   workspace root, must be refused, never overwritten. Pinned in Task 6 by `refuses unsafe --out targets`.
4. **"mobile app" on its own** still means iOS + Android. Only a web word next to it turns "mobile" into mobile web.
   Pinned in Task 1 by `mobile without web still suggests native icon sets`.
5. **`cost --session-usd` lower than the last recorded total** (a new Claude Code session) must not record a negative
   cost. Pinned in Task 10 by `treats a lower session total as a new session`.

---

### Task 1: "mobile" next to "web" means mobile web, not native apps

**Files:**

- Modify: `src/export/deliverables.ts:47-52`
- Test: `tests/deliverables.test.ts`

**Interfaces:**

- Produces: no signature change; `suggestDeliverables(brief)` changes behaviour only.

- [ ] **Step 1: Write the failing tests**

```ts
it('reads "web (mobile first)" as a website', () => {
  const s = suggestDeliverables(brief({ platforms: ['web (mobile first)'] }));
  expect(s.groups).toContain('web');
  expect(s.groups).not.toContain('ios');
  expect(s.groups).not.toContain('android');
});
it('mobile without web still suggests native icon sets', () => {
  const s = suggestDeliverables(brief({ platforms: ['mobile'] }));
  expect(s.groups).toEqual(expect.arrayContaining(['ios', 'android']));
});
it('an explicit platform still counts next to web', () => {
  const s = suggestDeliverables(brief({ platforms: ['web', 'iOS'] }));
  expect(s.groups).toEqual(expect.arrayContaining(['web', 'ios']));
  expect(s.groups).not.toContain('android');
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/deliverables.test.ts`. Expected: the
  first test fails, because `ios` is suggested.
- [ ] **Step 3: Implement.**
  - Compute `web = has(text, /\b(web|site|saas|browser|online|pwa)\b/)` once.
  - Drop `mobile` from the iOS and Android patterns.
  - Add `const mobile = has(text, /\bmobile\b/) && !web;` and OR it into `ios` and `android`.
  - `onlyNative` reuses `web`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run tests/deliverables.test.ts`. Expected:
  PASS.
- [ ] **Step 5: Commit** `src/export/deliverables.ts tests/deliverables.test.ts` with the message
  `fix(deliverables): "web (mobile first)" no longer suggests iOS and Android icons`.

### Task 2: Export what `deliverables` promises — Tailwind theme and Android TV banner

`GROUP_INFO` promises "Tailwind" (`deliverables.ts:14`) and "TV banners" (`deliverables.ts:9`). Neither is emitted.

**Files:**

- Modify: `src/export/exporter.ts` (`exportTokens`, the Android export), `src/export/specs.ts` (Android block)
- Modify: `docs/OUTPUTS.md` (rows for both files, with official sources), `plugin/skills/export/SKILL.md` (file list)
- Test: `tests/export.test.ts`

**Interfaces:**

- Produces:
  - `SPECS.android.tvBanner = { width: 320, height: 180, source: '<official Android TV banner URL>' }`.
  - The new kit files `tokens/tailwind.css` and `android/tv-banner.png`.

- [ ] **Step 1: Write the failing tests** in the `export kit` describe:

```ts
it('emits a Tailwind v4 theme with the brand colours and font', () => {
  const css = readFileSync(join(out, 'tokens/tailwind.css'), 'utf8');
  expect(css).toMatch(/^@theme \{/m);
  expect(css).toContain(`--color-${slug}-primary-500:`);
  expect(css).toContain(`--color-${slug}-neutral-500:`);
});
it('emits an Android TV banner at 320×180', async () => {
  expect(pngSize(readFileSync(join(out, 'android/tv-banner.png')))).toEqual({
    width: 320,
    height: 180,
  });
  expect(manifest.files.some((f) => f.path === 'android/tv-banner.png')).toBe(true);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/export.test.ts`. Expected: ENOENT on both
  files.
- [ ] **Step 3: Implement.**
  - **`tokens/tailwind.css`:** an `@theme { … }` block. It holds `--color-<slug>-<scale>-<step>` for every brand
    scale and the neutral scale, `--color-<slug>-ink`, `--color-<slug>-paper`, and `--font-<slug>` when
    `kit.typography` is set.
  - **Check the syntax first:** confirm the `@theme` syntax against the current Tailwind v4 docs (Context7) before
    writing it.
  - **`android/tv-banner.png`:** the primary logo (`ctx.primary`) placed with `fitArt` on the native ground, inside
    a 320×180 canvas. Take the exact size and the source URL from the official Android TV banner page.
  - **OUTPUTS.md:** add a row for each file.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run tests/export.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** the touched paths with the message
  `feat(export): Tailwind v4 theme and Android TV banner, as deliverables promised`.

### Task 3: A complete tokens.css

`tokens.json` already has semantic colours, spacing and the brand font, but `tokens.css` drops them. A dark-first or
light-first brand also gets no surface/text pair for the other scheme.

**Files:**

- Modify: `src/export/exporter.ts` (`exportTokens`)
- Modify: `docs/OUTPUTS.md` (token names; explain that type scale and radii are not generated)
- Test: `tests/export.test.ts`

**Interfaces:**

- Consumes: `grounds(kit)` (`exporter.ts:131`) for the native and opposite grounds.
- Produces: these CSS custom properties.
  - `--<slug>-<semantic>`, for every key of `pal.semantic`.
  - `--<slug>-space-<n>`, the same steps as `tokens.json`.
  - `--<slug>-font-brand`.
  - `--<slug>-surface` and `--<slug>-text`, plus a `@media (prefers-color-scheme: dark)` (or `light` for dark-first
    brands) block that swaps them.

- [ ] **Step 1: Write the failing tests**

```ts
it('tokens.css carries everything tokens.json has', () => {
  const css = readFileSync(join(out, 'tokens/tokens.css'), 'utf8');
  expect(css).toContain(`--${slug}-success:`);
  expect(css).toContain(`--${slug}-space-4: 16px;`);
  expect(css).toContain(`--${slug}-font-brand:`);
  expect(css).toMatch(/@media \(prefers-color-scheme: (dark|light)\)/);
});
it('old kits export unchanged apart from the new files', () => {
  // Export the synthetic brand with a brand.json that lacks every 1.2.0 field. Every logo, icon and social file
  // keeps the sha256 it had before; only tokens/*, android/tv-banner.png and (dark-first only) web/* differ.
});
```

For the second test, record the 1.1.3 hashes once: export the synthetic brand at `b8b9567` into a fixture
`tests/fixtures/kit-1.1.3-hashes.json`.

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/export.test.ts`. Expected: the first test
  fails on `--<slug>-success`.
- [ ] **Step 3: Implement** the additions in `exportTokens`.
  - Keep the semantic hues as they are: success, warning and danger must stay recognisable whatever the brand colour.
    Document this in OUTPUTS.md.
  - Do not invent a type scale or radii. Markilo does not design them, and generic values would be noise. Say so in
    OUTPUTS.md.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run tests/export.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message
  `feat(tokens): tokens.css carries semantic colours, spacing, font and a scheme swap`.

### Task 4: theme-color follows the brand's ground

**Files:**

- Modify: `src/export/exporter.ts:369,384`, `src/cli/commands.ts` (`export` options and usage)
- Test: `tests/export.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `exportBrand(ws, brand, opts)` gains `themeColor?: 'primary' | 'paper' | string`, where a string is a hex colour.
  - The exporter's `Ctx` gains `themeColor: string`, resolved once.
  - Default: `paper` when `grounds(kit).darkFirst`, otherwise `primary` (unchanged for light brands).
  - CLI: `export --theme-color primary|paper|#hex`.

- [ ] **Step 1: Write the failing tests**
  - A dark-first synthetic brand (paper `#0b1220`): `web/head-snippet.html` contains
    `<meta name="theme-color" content="#0b1220">`, and `site.webmanifest` has `theme_color` `#0b1220`.
  - A light brand still gets its primary.
  - `--theme-color #123456` wins.
  - `--theme-color blue` → error code `USAGE`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/export.test.ts tests/cli.test.ts`.
- [ ] **Step 3: Implement.** Resolve `ctx.themeColor` in `exportBrand`, use it in both places, and validate
  `--theme-color` with `normalizeColor`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `fix(export): theme-color follows the brand's ground; --theme-color to override`.

### Task 5: Wordmark-only identities

When the user wants the word alone, its icon is only the favicon and app icon. Today `finalize` still composes the
horizontal, stacked and compact lockups (`kit.ts:181-205`). Social cards put a large tinted symbol behind the word
(`exporter.ts:745-748`), and the watermarks use the symbol. A `--note` does not change any of this.

**Files:**

- Modify: `src/export/kit.ts` (`BrandKit`, `finalizeConcept`), `src/export/exporter.ts` (`socialCard`, marketing
  watermarks), `src/export/guidelines.ts` (usage rule), `src/cli/commands.ts` (`finalize`)
- Modify: `plugin/skills/refine/SKILL.md`, `plugin/skills/design/SKILL.md` (when the user asks for the word alone,
  finalize with `--wordmark-only`)
- Test: `tests/export.test.ts`, `tests/cli.test.ts`

**Interfaces:**

- Produces:
  - `BrandKit.wordmarkOnly?: true`.
  - `finalizeConcept(ws, brand, id, opts)` gains `wordmarkOnly?: boolean`.
  - CLI: `finalize --wordmark-only`. It requires the concept to have a wordmark, and errors with code `USAGE`
    otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
it('a wordmark-only kit has no symbol lockups and no symbol behind social images', async () => {
  // finalize the synthetic brand with { wordmarkOnly: true }, export
  expect(existsSync(join(out, 'logos/secondary'))).toBe(false);
  expect(existsSync(join(out, 'logos/compact'))).toBe(false);
  expect(readFileSync(join(out, 'social/og-image.svg'), 'utf8')).not.toMatch(/<g opacity="0\.(08|16)">/);
  expect(existsSync(join(out, 'web/favicon.svg'))).toBe(true); // the symbol still makes the icons
  expect(guidelinesMd).toContain('never set next to the wordmark');
});
it('refuses --wordmark-only on a locked brand', () => {
  /* lock, then finalize --wordmark-only → code LOCKED */
});
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - **finalize:** with `wordmarkOnly`, `finalizeConcept` composes no lockups. Hand-made lockup files named in the
    concept are still used, because the user drew them. It also stores `wordmarkOnly: true`.
  - **socialCard:** skips the supergraphic when `kit.wordmarkOnly`.
  - **Watermarks:** use the wordmark instead of the symbol.
  - **Guidelines:** add the rule "The symbol is the app icon and favicon only; it is never set next to the wordmark."
    Add its Turkish entry to `tr.ts`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run tests/export.test.ts tests/cli.test.ts tests/ui.test.ts`.
- [ ] **Step 5: Commit** with the message
  `feat(finalize): --wordmark-only — no symbol lockups, no symbol behind social images`.

### Task 6: `export --out <dir>` and `--progress`

**Files:**

- Modify: `src/export/exporter.ts` (`exportBrand`, `emit`), `src/cli/commands.ts` (`export`)
- Modify: `docs/USAGE.md` (export section)
- Test: `tests/cli.test.ts`

**Interfaces:**

- Produces: `exportBrand` opts gain these two fields.
  - `outDir?: string`, an absolute path. It defaults to `ws.exportsDir(brand)`.
  - `onProgress?: (e: { group: ExportGroup; done: number; total: number; files: number }) => void`, called after
    each group.
- CLI:
  - `export --out <dir>`: the path is resolved against cwd.
  - `export --progress`: writes one line per group to stderr, `{"progress":{"group":"web","done":2,"total":6,"files":19}}`.

- [ ] **Step 1: Write the failing tests**
  - `--out <tmp>/kit` writes `asset-manifest.json` there and leaves `brand/brands/<slug>/exports` absent.
  - `--progress` prints one parsable stderr line per group, and the last line has `done === total`.
  - `refuses unsafe --out targets`: a non-empty folder without `--clean`, the brand's `final/` folder, the workspace
    root and any ancestor of it each give error code `USAGE`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - `--clean` with `--out` deletes only a folder that holds an `asset-manifest.json`. Markilo made such a folder, and
    nothing else is ever deleted.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message `feat(export): --out <dir> and --progress (ndjson on stderr)`.

### Task 7: construct takes colours and says when it used its defaults

**Files:**

- Modify: `src/construct/compile.ts` (`resolveFill`, the compile result), `src/cli/commands.ts:2557-2562` (`--set`)
- Modify: `plugin/skills/design/references/construction.md` (colours section)
- Test: `tests/construct.test.ts`

**Interfaces:**

- Produces:
  - The compile result gains `defaultColors: string[]`: the palette roles that fell back to `ROLE_DEFAULTS` (for
    example `['primary']`).
  - `construct --set` accepts `role=#hex` for `primary|secondary|accent|ink|paper`, next to `name=number`.
  - The command output gains `defaultColors` and, when it is non-empty, the hint
    `Placeholder colours used for: primary. Pass --brand and --concept to use the concept palette, or --set primary=#rrggbb.`

- [ ] **Step 1: Write the failing tests**
  - `--set primary=#ff9d3a` fills primary layers with `#ff9d3a`.
  - `--set primary=orange` → error code `USAGE`.
  - A spec that uses `primary` compiled with `-o`, without a concept, reports `defaultColors: ['primary']`.
  - With `--brand` and `--concept`, `defaultColors` is `[]`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** `resolveFill` records each role it took from `ROLE_DEFAULTS`. `--set` splits number pairs
  from palette pairs, validates the hex with `normalizeColor` and merges the colours into `palette`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message
  `feat(construct): --set role=#hex, and report placeholder colours`.

### Task 8: `markilo center` — optical centring as a command

The balance check (`quality.ts:121-135`) says a mark sits off-centre but offers no fix, so designers shift path
coordinates by hand.

**Files:**

- Create: `src/geom/center.ts`
- Modify: `src/cli/commands.ts` (new `center` command), `src/analyze/quality.ts` (the balance message names the
  command when the check fails)
- Test: `tests/geom.test.ts`

**Interfaces:**

- Produces:
  - `centerOptically(svg: string): Promise<{ svg: string; dx: number; dy: number; before: number; after: number }>`.
    `dx` and `dy` are in viewBox units. `before` and `after` are the balance values the quality check reports.
  - CLI: `center <in.svg> -o <out.svg> [--force]`, printing `{ out, dx, dy, before, after }`.

- [ ] **Step 1: Write the failing test.** Take a fixture mark whose ink sits 10 % right and low of centre. After
  `centerOptically`, the `balance` check in `assessQuality` is `pass`, and `after < before`.
- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run tests/geom.test.ts`.
- [ ] **Step 3: Implement.**
  - Measure `shapeFeatures(...).centroidOffset`. It is a fraction of the rendered square; convert it to viewBox units
    with the viewBox size.
  - Target `x = 0` and `y = -0.02`, slightly high, which the check reads as optically centred.
  - Wrap the drawing's children in `<g transform="translate(dx dy)">`. Path data is not rewritten.
  - Refuse an SVG whose ink would leave the viewBox, with code `INVALID_INPUT`.
- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** with the message `feat: markilo center — optical centring for a mark`.

### Task 9: The letter check catches split letters and says when it did not run

An "h" whose shoulder came loose read as "ln", and nothing flagged it. Two gaps let it through.

- **The check was skipped silently.** `wordmarkLetters` (`src/report/quality.ts:71-91`) runs only when the drawn
  `d=` strings equal the recipe's character for character. Any reformatting (int vs float, optimizer rounding) or a
  hand edit turns it off without a word.
- **No verdict exists for a letter that broke into two shapes.**

**Files:**

- Modify: `src/analyze/letters.ts` (`LetterReading.verdict`, `checkLetters`, `letterAdvice`), `src/report/quality.ts`
  (`wordmarkLetters`)
- Modify: `plugin/agents/design-critic.md` and `plugin/skills/refine/SKILL.md`. Freeform wordmarks have no recipe, so
  the critic reads the 32 px render letter by letter and writes down what it reads, before reading the brand name.
- Test: `tests/letters.test.ts`, `tests/quality.test.ts`

**Interfaces:**

- Produces:
  - `LetterReading.verdict` gains `'split'`, and `LetterReading.parts?: { before: number; after: number }`.
  - The quality report's letters entry is either the advice or
    `{ checked: false, reason: 'the wordmark on disk differs from its recipe' | 'no recipe (freeform wordmark)' }`.

- [ ] **Step 1: Write the failing tests**
  - `letters.test.ts`: compile a synthetic "Acme hub" spec with a cut that detaches the shoulder of the "h". The "h"
    gets verdict `split` with `parts.after > parts.before`, and `letterAdvice` names the letter.
  - `quality.test.ts`: a wordmark whose numbers were reformatted (`10` → `10.0`, via `optimizeSvg`) is still checked.
    A hand-moved wordmark reports `checked: false` with the first reason.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - **Split verdict:** in `checkLetters`, compare `topology(alone).parts` with `topology(mine).parts`. More parts than
    the original gives `split`, checked before `lost-counter`.
  - **Normalized compare:** in `wordmarkLetters`, compare paths after `normalizePath` (parse, round to 2 decimals,
    re-serialize). This normalizer lives next to `transformPath` in `src/construct/compile.ts`. Add it if none exists.
  - **No silent skip:** return the `checked: false` entry instead of `undefined`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run tests/letters.test.ts tests/quality.test.ts`.
- [ ] **Step 5: Commit** with the message
  `feat(letters): catch letters that split in two; report when the check could not run`.

### Task 10: Honest cost — the orchestrator's share and a clear lower bound

The skills record only subagent tokens, at the 1.0-measured $0.60/M. The main session's own work (small edits,
finalize, export) is not recorded, so a run with a $25 budget reported $0.24.

**Files:**

- Modify: `src/report/cost.ts`, `src/cli/commands.ts` (`cost`)
- Modify: `plugin/skills/design/SKILL.md`, `plugin/skills/refine/SKILL.md`, `plugin/skills/concepts/SKILL.md` (at the
  end of each phase, record the session total from Claude Code's cost display with `--session-usd`)
- Modify: `README.md` (one line in the cost section), `docs/USAGE.md`
- Create: `tests/cost.test.ts`

**Interfaces:**

- Produces:
  - `CostEntry.source?: 'agent' | 'session'`.
  - `CostLog.sessionUsd?: number`, the last cumulative session total recorded.
  - `costSummary(log)` gains `basis: 'measured' | 'estimated' | 'mixed'` and `lowerBound: boolean`. `lowerBound` is
    true when no `session` entry exists.
  - `costSummary(log)` also gains `note`, set when `lowerBound` is true:
    `Only agent work is recorded; the main session's own work is missing, so the real cost is higher. Record it with markilo cost --phase <p> --session-usd <total shown by Claude Code>.`
  - CLI: `cost --phase <p> --session-usd <x>` records `x - log.sessionUsd` (or `x` the first time) as a `session`
    entry with measured `usd`, and stores `sessionUsd = x`.

- [ ] **Step 1: Write the failing tests**
  - `costSummary` of agent-only entries has `lowerBound: true` and the note.
  - Two `--session-usd` calls with 2.5 and 4.0 record 2.5 and 1.5.
  - `treats a lower session total as a new session`: after 4.0, a value of 1.2 records 1.2 (not −2.8) and stores 1.2.
  - `--session-usd -1` → error code `USAGE`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run tests/cost.test.ts`.
- [ ] **Step 3: Implement** in `cost.ts` and the `cost` command.
  - Do not add a per-model price table. Prices change and would go stale in the bundle; measured session dollars are
    better than any table. `--rate` stays for estimates.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message
  `feat(cost): record the main session's share; say when the total is a lower bound`.

### Task 11: Design to the craft a direction names

A neon direction's first proposal was "neither real neon nor a normal word". It only worked once development applied
neon's construction rules.

**Files:**

- Modify: `plugin/skills/design/references/design-principles.md` (new section after "Symbols: drawn, not assembled")
- Modify: `plugin/agents/concept-designer.md` (explore mode)
- Test: `tests/plugin.test.ts`

**Interfaces:** none (skill and agent text).

- [ ] **Step 1: Write the failing test.** `plugin.test.ts` asserts that `design-principles.md` has a heading
  `## When the direction names a craft`, and that `concept-designer.md` explore mode mentions `craft`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Write the section.** It should be short and positive in tone, like the rest of the file. It sets one
  rule: when a direction names a physical craft, the designer writes that craft's construction rules into
  `work/notes.md` before drawing, draws to them, and states in the pitch which rule gives the word its character.
  Then give four or five rules each for:
  - neon: one constant tube width, blockouts where the tube passes behind, electrode ends, minimum bend radius, no
    closed counters without a break;
  - sign painting: brush-stroke entry and exit, consistent stroke contrast, a sign-writer's spacing;
  - stencil: bridges that hold every counter, with a consistent bridge width;
  - engraving and letterpress: a consistent line weight for hatching, and ink spread at small sizes.

  In `concept-designer.md` explore mode, add one line that points to this section.

- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** with the message `docs(design): design to the construction rules of a named craft`.

### Task 12: Small fixes found in use

**Files:**

- Modify: `src/cli/commands.ts:1263` (`concept update` usage), `src/export/kit.ts` (finalize result),
  `plugin/skills/design/references/svg-authoring.md`
- Test: `tests/cli.test.ts`

**Interfaces:**

- Produces: when originality is `insufficient-evidence` with zero references, the `finalize --accept-risk` result
  gains `originality.note`:
  `No competitor marks were compared, so this verdict says nothing about similarity. Run research (with the user's OK to use the network) before relying on the mark.`

- [ ] **Step 1: Write the failing tests**
  - `help concept update` lists `--title`, `--direction`, `--rationale` and the palette options. They already work
    (`commands.ts:1366`) but are not in the usage line.
  - `finalize --accept-risk` on a brand with no references returns the note.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement both.** Then add one line to `svg-authoring.md`: the renderer has no system fonts, so text in
  mockups and previews must be outlined with `markilo wordmark` or drawn as paths.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with the message
  `fix: concept update usage lists title/direction; clearer originality note without references`.

### Task 13: Release 1.2.0

**Files:**

- Modify: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  (version `1.2.0`)
- Modify: `CHANGELOG.md`, `docs/OUTPUTS.md`, `docs/USAGE.md`, this file (the progress record below)
- Modify: `branding/brands/markilo/exports/**` (re-export with `--only logos,web,social,tokens,guidelines --clean`;
  logo files must stay byte-identical)

- [ ] **Step 1: Run the full checks.**
  - Run `npm run ci`, then `node scripts/smoke.mjs`. Expected: all pass.
  - Run `claude plugin validate plugin`. Expected: valid.
- [ ] **Step 2: Do one real check run** on a synthetic brand, set up as a wordmark-only, dark-first website. Expected:
  - deliverables suggests no iOS or Android;
  - `finalize --wordmark-only` works;
  - the export has no symbol lockups, theme-color is the paper colour, and `tailwind.css` and `tv-banner.png` exist
    when those groups are selected;
  - `cost` reports `lowerBound` until `--session-usd` is recorded.

  Record the result here.

- [ ] **Step 3: Write the CHANGELOG** 1.2.0 entry (Added / Changed / Fixed) and commit
  `release: 1.2.0 — field-report fixes`, then push.
- [ ] **Step 4: Ask the user** before tagging (`claude plugin tag plugin --push`) and before `npm publish` (the user
  supplies the OTP). After publishing, verify from the registry: `latest`, `gitHead`, checksum, and that
  `npx markilo@1.2.0 --version` prints `1.2.0`.

---

## Not in 1.2.0

| Request                                                        | Why not now                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| UI icon set in the brand's style                               | A new design product (a dozen glyphs on one grid), not a fix. It needs its own design and validation round.               |
| Programmatic API (`main`/`exports`)                            | It would freeze internal signatures as public API. `export --out` covers the asked-for use (kit generation from scripts). |
| Published JSON Schemas for `markilo/*` files                   | Worth doing together with a programmatic API. For now the files carry a `schema` version string.                          |
| Browser-extension, VS Code and email-client dark-favicon sizes | No user has needed them yet; they add export groups and preview text.                                                     |
| Type scale and radii tokens                                    | Markilo does not design them, and generic values would be noise (Task 3 documents this).                                  |
| Per-model price table                                          | Prices change and would go stale in the bundle; measured session dollars are recorded instead (Task 10).                  |
| Interface languages beyond EN/TR; localized files and reports  | Asked for once, from a code study. It can wait for demand from real use.                                                  |
| `gallery --serve` idle shutdown                                | By design: it closes after 120 idle minutes. Feedback is also possible as a downloaded file.                              |

## Sources

Two field reports on 1.1.3. One is a personal-site identity run through every stage: understand, explore, develop,
finalize with `--accept-risk`, then export. The other is a product team's study of the code before using Markilo. Each
claim was checked against the code at `b8b9567` before it went into this plan.

| Finding                                                   | Seen in    | Task |
| --------------------------------------------------------- | ---------- | ---- |
| "web (mobile first)" suggested iOS and Android            | run        | 1    |
| Tailwind and TV banners promised but not emitted          | study      | 2    |
| tokens.css thinner than tokens.json                       | study      | 3    |
| theme-color always primary, wrong on dark sites           | run, study | 4    |
| Wordmark-only identity got symbol lockups and a watermark | run, study | 5    |
| No export target folder, no progress                      | study      | 6    |
| construct painted placeholder blue; `--set` numbers only  | run        | 7    |
| Optical centring done by hand                             | run        | 8    |
| A split "h" read as "ln" and was not caught               | run        | 9    |
| Reported cost far below the real cost                     | run, study | 10   |
| A craft direction drawn without the craft's rules         | run        | 11   |
| Concept title/direction thought uneditable                | run        | 12   |
| Unclear originality message without references            | run        | 12   |
| Mockup text not rendered                                  | run        | 12   |

A reported typo in the design skill (a mangled "$3.47") is not in the repository or the published plugin. It came from
the reporting session's shell expanding `$3`.

## Progress record

_(Filled in during implementation.)_
