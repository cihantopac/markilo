<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="Markilo" width="360">
  </picture>
</p>

<p align="center">
  <b>The open-source brand identity studio for Claude Code.</b><br>
  Research a brand, design original SVG identities, check them against the marks and names you collected, and export every asset you need.
</p>

<p align="center">
  <a href="https://github.com/cihantopac/markilo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/cihantopac/markilo/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-d12c12"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.1.1-101218">
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-101218">
</p>

---

Markilo is not a "generate a logo" prompt. It is a Claude Code plugin plus a deterministic toolchain that
**researches** a product, **designs** original vector marks, **measures** them (small-size legibility,
balance, contrast, one-color reproduction), **compares** them against competitors and each other, and
**exports** a complete, platform-correct asset kit — all locally, with no servers, paid APIs or accounts.

![Markilo's own identity: every logo file, exported by Markilo](assets/kit-overview.png)

<sub>Markilo's identity was made by running Markilo 1.1 on itself, with its owner choosing: one round of three proposals
by the Opus designer ($9.57, 18 min), from which the owner kept one word, a monograph-style serif cut with one 45-degree
chisel and dotted with an oxblood lozenge; three new icon options for it ($4.11), of which the owner chose the M and
asked for it symmetric, redrawn with Markilo's own `construct` toolchain; then finalize and export. Every image in this
README and the plugin icon is an unedited Markilo export (`branding/`). No trademark registry search has been done
yet; the guidelines say so.</sub>

## Made with Markilo

Three open-source tools from the same author got their brand identities from Markilo 1.1. Each came from one round of
three proposals with its owner choosing; the logos below are the files Markilo exported, unedited.

<table>
  <tr>
    <td align="center" width="33%"><a href="https://github.com/cihantopac/relivaro"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/made-with/relivaro-dark.svg"><img src="assets/made-with/relivaro-light.svg" alt="Relivaro" height="44"></picture></a><br><a href="https://github.com/cihantopac/relivaro"><b>Relivaro</b></a><br><sub>Software quality, security, reliability and release engineering</sub></td>
    <td align="center" width="33%"><a href="https://github.com/cihantopac/searvex"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/made-with/searvex-dark.svg"><img src="assets/made-with/searvex-light.svg" alt="Searvex" height="44"></picture></a><br><a href="https://github.com/cihantopac/searvex"><b>Searvex</b></a><br><sub>Search intelligence: technical SEO and GEO audits with safe fixes</sub></td>
    <td align="center" width="33%"><a href="https://github.com/cihantopac/jourilo"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/made-with/jourilo-dark.svg"><img src="assets/made-with/jourilo-light.svg" alt="Jourilo" height="44"></picture></a><br><a href="https://github.com/cihantopac/jourilo"><b>Jourilo</b></a><br><sub>Product experience and conversion engineering</sub></td>
  </tr>
</table>

How each one was made, what it cost and what the owner chose at every step is in
[docs/RELEASE-1.1.md](docs/RELEASE-1.1.md) (products A, B and C, in this order).

## Highlights

- **Brand intelligence, with receipts.** Repository and website scans, competitor and market research, and a persistent
  Brand Intelligence Profile where every finding is `observed`, `inferred`, `verified` or `user-provided` and carries a
  source and a date. Markilo reads what the product actually does — value proposition, features, audience, surfaces,
  platforms, languages, pricing — and keeps what the product states apart from what it inferred. Unknowns are recorded
  as gaps instead of guesses.
- **Originality engine.** Silhouette overlap under rotation and mirroring, perceptual hashes (aHash/dHash/DCT pHash),
  structural descriptors, palette distance (CIEDE2000), stock-primitive detection, concept-to-concept diversity, name
  confusion (spelling, sound, stems) and trademark pre-screening plans for WIPO, TMview, USPTO, TÜRKPATENT and UKIPO —
  written up as an Originality & Similarity Report with side-by-side overlays. Verdicts say how much evidence they rest
  on — counted in distinct brands, with official, store and catalog sources rated apart: with too few references or no
  logged registry searches the answer is `insufficient-evidence`, never "clear". Calibrated on 24 real brands' logos
  (AUC 0.99; mirrored, rotated and recolored copies always caught; see [docs/ORIGINALITY.md](docs/ORIGINALITY.md)). It
  finds conflicts among what was collected; it cannot prove a mark is unique or registrable.
- **Three proposals, your choice.** Markilo reads the product, writes a short brief, and shows three genuinely
  different, visually developed identities side by side — each with its word, a compact icon, light and dark previews,
  the idea in one sentence, strengths and honest weaknesses. You select one, ask for changes, combine two, or reject
  all three with a note; after two rounds it asks you for direction instead of guessing on. Nothing is finalized
  without your choice.
- **Drawn, not assembled.** Designers draw freely: Bézier contours, custom letterforms built from real font outlines
  and their own strokes, ligatures and treatments that run through the whole word. Wordmark-led by default for coined
  names. `proposals` measures how close each word still is to its typeface set plainly, so "a stock font with a
  coloured dot" is caught before you see it; it also flags an icon drawn on its own tile.
- **Development keeps what you chose.** The drawing you picked is kept; after development you see it next to the
  result, with two or three icon options to choose from in the same decision.
- **Real design output.** Construction specs (primitives, booleans, gaps, fillets, repeats and real letterforms,
  compiled with Skia's path engine) when they help, freeform SVG when it is better. Wordmarks outlined from 24 bundled
  OFL families with real kerning (Turkish and other Latin-extended letters checked in every weight); changed letters
  are measured against the font's own alphabet, so a word that would be misread is caught. Lockups aligned to cap
  height, OKLCH tonal palettes with WCAG pairs.
- **Looks before it talks.** Every concept is rendered to a review sheet (16–256 px, light, dark, black, white) and a
  context sheet (a browser tab, a home screen next to the competitors, a site header, an avatar). One independent
  critic reads the developed identity cold — what a stranger sees first, scores and concrete craft fixes — as advice
  for you, never as a gate in front of you.
- **Costs in the open.** `markilo cost` records each phase against a budget (default $12) and stops paid work when it
  is reached. Your references — logos, screenshots, mood boards, sketches you like or dislike — guide the design and are
  checked for originality like any competitor mark.
- **Complete asset kit.** Logo variants, favicons, PWA + maskable icons, iOS (incl. dark/tinted and Icon Composer
  layers), macOS `.icns`, Android adaptive + themed icons, Windows ICO + MSIX assets, Open Graph and social images,
  marketing templates, design tokens and brand guidelines, with a manifest of sizes and hashes. You get what the
  product needs: a web app gets web, social, tokens and guidelines; app and desktop icon sets are one question away.
- **Brand Preview Gallery.** One offline HTML file comparing concepts on realistic surfaces (browser tab, home screen,
  Dock, store listing, link preview, business card). Pin notes on the mark itself, compare two concepts side by side,
  mark a preferred one, and send the decisions straight back to Claude (`gallery --serve`, local only) or paste them.
- **Monorepo-aware.** Finds the sites, apps and packages of a monorepo, registers the user-facing ones as brands of a
  family, and researches each separately — including existing icon sets and design-system docs.
- **Families and locked brands.** Multi-product families share a system; existing identities can be **locked** so they
  are reproduced byte-for-byte and never redesigned.
- **Fits your stack.** `install-assets --framework auto` puts the files where Next.js (App Router metadata files),
  Laravel, Flutter (Android, iOS and web) or a static site expects them — a dry run first, backups before anything is
  replaced.
- **Not tied to one AI.** Claude Code is home, but the toolchain is a plain CLI: `agent-setup` gives VS Code with
  Copilot, Codex and Cursor the same workflow, with the researcher, designer and critic as sub-agents on the models
  you choose (see [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)).

## Measured quality

**1.1, steered (validation on three real products).** The 1.1 workflow was validated on three real developer tools
with their owner choosing at each step, and measured with Claude Code's own cost report. All three reached an identity
the owner accepted. The first took about $15 across seven runs while the process was being corrected; with its lessons
adopted, the second took $11.27 (one round, one development, one change made directly) and the third $5.29 (one round,
finished as chosen). Every step, its cost and what it taught is in [docs/RELEASE-1.1.md](docs/RELEASE-1.1.md). 1.0
spent $6.85 on the first product unattended and showed nothing. This is three products and one owner's judgment, not a
benchmark.

**1.0 and earlier, unattended (benchmark).** Markilo is benchmarked end to end with nobody steering, on nine realistic products (an independent SaaS, a mobile
app, a multi-product family, a developer tool, an online shop, a B2B platform, a learning app, a feature-flag service
and a team secrets manager). Six of them were **holdouts** for a while: written before the changes they test and
never used for tuning until those results were in. The plugin researches, writes the brief, designs, critiques, and
finalizes only what passes its own gate. Blind judges then rate every critiqued concept from the brief and the images
alone. Every run, image and score is in [bench/](bench).

| Version      | Runs                                        | Passed the gate          | Opus 5.5 judge would present (of concepts it judged) | Time per run | Cost per run (API equivalent) |
| ------------ | ------------------------------------------- | ------------------------ | ---------------------------------------------------- | ------------ | ----------------------------- |
| 0.4.0-rc.1   | 3                                           | 0                        | —                                                    | 11–21 min    | $2.61–3.67                    |
| 0.4.0-rc.2   | 3                                           | 1                        | —                                                    | 8–15 min     | $1.60–2.68                    |
| 0.4.0-rc.3   | 3                                           | 2                        | 0 of 2 (the two that passed)                         | 14–24 min    | $3.15–4.37                    |
| 0.4.0-rc.5   | 9 (6 on holdouts)                           | 2                        | 0 of 12                                              | 10–19 min    | $2.29–4.41                    |
| 0.4.0-rc.7   | 11 (2 new holdouts)                         | 0                        | 2 of 5 — both rejected by the gate                   | 6–16 min     | $1.66–3.30                    |
| 0.4.0-rc.8   | 9                                           | 0                        | 0 of 3 — the recalibrated gate agreed on all 3       | 8–18 min     | $1.91–3.48                    |
| 0.4.0 (rc.9) | 9                                           | 2                        | Portwise 2 of 4 looks, Dozeline 0 of 4               | 14–28 min    | $3.00–7.13                    |
| 0.5.0-rc.1   | 9 (4 on new holdouts)                       | 2                        | 2 of 29, the two that passed (3/3 and 2/3 looks)     | 14–36 min    | $3.37–5.86                    |
| **1.0.0**    | **14 (5 sealed holdouts, 9 on real tools)** | **2, both false passes** | **0 of 43 (Opus + Sonnet panel)**                    | 21–35 min    | $6.85–13.87                   |

What this shows, plainly:

- **1.0 did not make unattended work better, and says so.** On five briefs sealed before any 1.0 change and on three
  real developer tools, an independent panel (Opus and Sonnet, blind) would present none of the 1.0 concepts; it would
  not have presented the 0.5.0-rc.1 ones either. The two 1.0 gate passes were edge passes the panel rejected; the
  gallery now marks such passes "at the edge". What 1.0 did improve is everything around the design: safety, the
  install transaction, letter checks, typefaces, the critique process and the evidence. See
  [bench/results/1.0.0](bench/results/1.0.0).

- **Unattended, Markilo still rarely reaches its own gate** — 6 of the 47 validation runs since rc.5, 2 of 12 on
  briefs that were still untouched holdouts when they ran.
- **For the first time, what passes is what a strict judge would present.** In 0.5.0-rc.1 the gate and the Opus judge
  (the majority of three looks per concept) agreed on all 29 critiqued concepts, and both identities that passed —
  Quillnest, and Pinehold on a brief written for this round — were presentable to the judge. In 0.4.0 the two that
  passed split it 2 of 4 and 0 of 4.
- **Words beat invented symbols.** Both passes were wordmark-led: the name drawn from a real typeface with one letter
  changed, the icon cut from it (2 of 13 judged presentable; invented symbols 0 of 16). Symbols assembled from
  rectangles, circles and polygons keep reading as UI icons or objects — a power button, a wallet, an eye.
- **Reworking a failed idea does not work, so Markilo stopped doing it.** Of 34 concepts sent back after a failed gate
  in earlier rounds, one passed later, after three rounds. The gate now says `fix` once or `reject`; in rc.1 one
  concept got a fix round, and the budget went to more directions instead (43, up from 27).
- **How the gate got here was measured.** The critic's scores given after reading the rationale barely tracked the
  strict judge (Spearman 0.20 on 32 concepts), a cold look did much better (0.51); the gate rests on the cold look.
  Across all runs the gate and the judges agreed on 77 of 86 critiqued concepts. When nothing passes, Markilo says
  so and nothing is finalized or exported.
- **What moved the needle was measured, not guessed.** Hairline gaps came from Markilo's own guide; clichés reached
  development because the sketch review picked the best of weak boards; the name's initial with a cut became the
  default move once objects were ruled out; same-colour layers left seams. Each was found in the runs and fixed in
  the plugin. The model was not the bottleneck (Opus 5.5 as designer did no better on the SaaS brief).

Markilo is built to work with you: you pick the sketch to develop, react in the gallery and decide. Unattended runs
measure the floor. The two that passed in 0.5.0-rc.1, as exported (fictional products, no human edits):

<table>
  <tr>
    <td><img src="bench/results/0.5.0-rc.1/edu-app/quillnest/overview.png" alt="Quillnest logo files made by Markilo unattended"></td>
    <td><img src="bench/results/0.5.0-rc.1/secrets-team-r2/pinehold/overview.png" alt="Pinehold logo files made by Markilo unattended"></td>
  </tr>
  <tr>
    <td><sub>Quillnest (writing coach for teenagers): passed the gate; Opus judge "present" in 3 of 3 looks, 6.3 — "a
    smiling face built from a q, with the orange dot as a nose".</sub></td>
    <td><sub>Pinehold (secrets manager for small teams, a fresh holdout): passed the gate; Opus judge "present" in 2 of 3
    looks, 6.3 — "an arch or doorway sheltering an orange seed".</sub></td>
  </tr>
</table>

## Install

Requirements: [Claude Code](https://code.claude.com) and Node.js ≥ 20.10. Nothing else — the toolchain ships prebuilt
(pure JavaScript + WebAssembly) and works on macOS, Linux and Windows.

In Claude Code:

```text
/plugin marketplace add cihantopac/markilo
/plugin install markilo@markilo
```

Or from a terminal:

```bash
claude plugin marketplace add cihantopac/markilo
```

```bash
claude plugin install markilo@markilo
```

To update later: `claude plugin marketplace update markilo`, then `claude plugin update markilo@markilo` and restart
Claude Code.

Without Claude Code — for other coding agents ([docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)) and scripts — the same
toolchain is on npm:

```bash
npm install -g markilo
```

Then `markilo help`; to run without a global install, use `npx markilo <command>`.

### `/markilo` and `/markilo:design`

After installing, both `/markilo` and `/markilo:design` start the studio (verified with Claude Code 2.1.308). If another
command already uses the name `/markilo` on your machine, Markilo can install a tiny personal skill that forwards to the
plugin. It never touches files it did not create:

```bash
node ~/.claude/plugins/marketplaces/markilo/plugin/dist/markilo.mjs shortcut install --yes
```

(`shortcut status` and `shortcut uninstall --yes` are available too.)

## Use

| Command                                        | What it does                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/markilo:design <url, repo, name or task>`    | The full studio: understand → three proposals → your choice → develop → verify → export           |
| `/markilo:research <url or repo>`              | Brand Intelligence Profile and brief only                                                         |
| `/markilo:concepts <brand>`                    | One round of three visually developed proposals for you to choose from                            |
| `/markilo:originality <concept, file or name>` | Similarity analysis, name check and trademark pre-screening plan                                  |
| `/markilo:refine <brand> <concept> <feedback>` | Develop the concept you chose, with icon options and one critique, then finalize on your approval |
| `/markilo:export <brand>`                      | Generate the asset kit (optionally install web assets into your project)                          |
| `/markilo:gallery`                             | Build the Brand Preview Gallery                                                                   |
| `/markilo:audit <logo or brand>`               | Evaluate an existing identity: keep, refresh or redesign                                          |

Requests can be written in any language; files and reports are produced in English.

### A typical session

```text
you  › /markilo:design ./ — we're launching this as a product, it needs an identity
     › Understand: README, interface colours and type, five competitor marks (with your OK), a short brief,
       two questions with suggested answers, and "any logos, screenshots or sketches you like or dislike?"
     › Explore: three designers draw three directions in parallel — a worked wordmark, a symbol with a matching
       word, a warmer route — rendered side by side (proposals/round-1.png) with strengths and risks
     › You, in the gallery: "the second one, but the icon should come from the first"
     › Develop: the chosen word refined, three icon options, your choice shown next to the result
     › Verify: checks clean, one cold critique ("option C reads as a person icon at 32 px"), originality report
     › You: "icon B, approved" → Finalize → Export: 81 files → Next.js detected (dry run, 0 overwrites)
```

### Monorepos and product families

```text
/markilo:research This is our product family monorepo at ./ — sites in products/, apps in apps/. The Ledger app's existing identity is locked.
```

Markilo runs `research monorepo`, shows you the packages it considers brands, and after you confirm registers them
(with their folders) and scans each one. Work then proceeds family-first: shared system, master brand, sites one by one,
and many apps as one coherent app-icon system. Exports can be copied into any package with
`install-assets --project <folder>` (dry run first).

## What you get

```text
brand/
├── markilo.json                    # workspace: brands, family
├── brands/<slug>/
│   ├── brief.json · profile.json · answers.json · decisions.md
│   ├── research/references/        # competitor marks for comparison (git-ignored)
│   ├── concepts/<id>/              # concept.json, symbol.svg, wordmark.svg, review/*.png
│   ├── reports/                    # originality-<id>.md|json, quality-<id>.md|json
│   ├── final/                      # approved masters + brand.json
│   └── exports/
│       ├── index.html              # open first: a preview of every file on the background it is made for
│       ├── README.md               # the files most people need, what each folder holds
│       ├── logos/                  # primary, secondary, compact, symbol, wordmark × color/reversed/black/white (SVG + PNG), appmark
│       ├── web/                    # favicon.svg (dark-mode aware), favicon.ico, apple-touch-icon, icon-*/maskable-*, site.webmanifest, head-snippet.html
│       ├── ios/                    # AppIcon.appiconset (default, dark, tinted), icon-composer/ layers
│       ├── macos/                  # AppIcon.icns, .iconset, full-bleed 1024 for macOS 26+
│       ├── android/                # mipmap-* legacy + adaptive foreground/background/monochrome, anydpi-v26 XML, Play icon
│       ├── windows/                # app.ico, MSIX Assets (scales, target sizes, unplated variants)
│       ├── social/                 # og-image (+dark), GitHub social preview, X header, LinkedIn cover, avatar
│       ├── marketing/              # watermarks, email signature, title slide, business card
│       ├── tokens/                 # tokens.json (W3C DTCG), tokens.css, palette.json
│       ├── guidelines/             # brand-guidelines.md, index.html
│       └── asset-manifest.json     # every file: purpose, size, sha256, source master
└── gallery/index.html              # Brand Preview Gallery
```

Platform sizes and safe zones are kept in [`src/export/specs.ts`](src/export/specs.ts) with the official source for
each requirement (Apple HIG and Xcode docs, Android Developers, Microsoft Learn, W3C/MDN/web.dev, OGP, GitHub, LinkedIn).
See [docs/OUTPUTS.md](docs/OUTPUTS.md).

## How it works

```text
Claude Code  ──  skills/ (process: research, strategy, design, critique)  ──  agents/ (researcher, designer, critic)
                       │  node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs …
                       ▼
Toolchain (src/ → plugin/dist/): XML/SVG lint & optimize · resvg-wasm rendering · shape features & perceptual hashes ·
similarity & genericity · quality scorecard · fontkit wordmarks · lockups · OKLCH palettes · research scanners ·
originality & quality reports · exporters (ICO/ICNS encoders) · gallery · guidelines
```

The rule that keeps it honest: **anything measurable comes from code; anything judged is labeled as judgment.**
Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ORIGINALITY.md](docs/ORIGINALITY.md).

## The toolchain on its own

The same CLI runs without Claude Code — useful in CI or scripts:

```bash
node plugin/dist/markilo.mjs help
```

```bash
node plugin/dist/markilo.mjs compare my-logo.svg competitor.png
```

Examples: `wordmark --text "Acme" --font sora --weight 600 -o acme.svg`, `score logo.svg`, `palette "#f45d2c"`,
`render logo.svg -o sheet.png --sheet`, `name check Acme --against Acmo,Akme`. Every command prints JSON.

## Privacy and permissions

- Everything runs locally, with no accounts, servers or paid APIs. The toolchain reaches the network only in the
  research and font commands (`research site`, `research competitors`, `research app`, `fonts search/add`), which require
  `--allow-network`; the skills ask you first, and before web searches that would reveal unreleased names. Site
  research honours `robots.txt`.
- The repository scanner never opens secret-like files (`.env*`, keys, credentials), and profiles store project-relative
  paths, never your user name or folder layout.
- Markilo writes only inside the brand workspace (`./brand`). Copying assets into your project is a dry run until you
  approve `--apply`; existing files are never overwritten without `--force` and are backed up first.
- `gallery --serve` listens on `127.0.0.1` only, with a random token, and serves only the gallery and approved artwork.
- Raw research captures and competitor references are git-ignored inside the workspace.

Details: [docs/PRIVACY.md](docs/PRIVACY.md) · [SECURITY.md](SECURITY.md).

## Limitations

- **Not legal advice.** Similarity analysis and registry pre-screening do not clear a trademark. No results ≠ unique.
  Use a trademark attorney before adopting a brand.
- Automated similarity measures form, composition, structure and color. **Conceptual** similarity (the same idea drawn
  differently) is judged by the critic agent and by you.
- Reference comparison covers only the marks collected for the brand; collecting good references matters.
- Raster images (PNG/JPEG) are analyzed for similarity; vector tracing of raster logos is not included.
- Icon Composer (`.icon`) files are not written directly; Markilo exports the layer sources to import.
- X (Twitter) image sizes could not be verified against x.com documentation (blocked to automated readers).
- Design quality depends on the model and on your direction. Unattended, 1.0 produced no identity an independent panel
  would present ([bench/results/1.0.0](bench/results/1.0.0)). 1.1 is built to be steered: in its validation three real
  products reached identities their owner accepted, each from one round of proposals — judged by their owner, not a
  benchmark ([docs/RELEASE-1.1.md](docs/RELEASE-1.1.md)). Icons remain the hardest part (they still tend to be
  letters); expect to choose between options.

## Develop

```bash
npm ci
```

```bash
npm run ci
```

`npm run ci` runs Biome, TypeScript, Vitest (unit, integration and bundled-CLI tests), the build and a check that the
committed `plugin/dist/` matches the sources. `node scripts/smoke.mjs` takes an empty folder to installed assets with
the bundle alone (CI also runs it on the copy `claude plugin install` produces). `node scripts/bench.mjs` runs the
end-to-end benchmark ([bench/](bench)). Plugin evals live in [`plugin/evals/`](plugin/evals) (`claude plugin eval plugin`).
See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/MAINTAINING.md](docs/MAINTAINING.md).

## License

[Apache-2.0](LICENSE). Bundled fonts are SIL OFL 1.1; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
