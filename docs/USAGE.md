# Using Markilo

The README shows what Markilo makes. This page is the reference: commands, a typical session, monorepos, what ends up
on disk, the toolchain on its own, and what Markilo can and cannot do.

## Commands in Claude Code

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

`/markilo` is the same as `/markilo:design`. Requests can be written in any language; files and reports are produced
in English. The Gallery, the asset kit preview and the brand guidelines page switch between English and Turkish and
between light, dark and system themes; the choice is remembered in the browser.

If another command already uses the name `/markilo` on your machine, Markilo can install a tiny personal skill that
forwards to the plugin. It never touches files it did not create:

```bash
node ~/.claude/plugins/marketplaces/markilo/plugin/dist/markilo.mjs shortcut install --yes
```

(`shortcut status` and `shortcut uninstall --yes` are available too.) To update the plugin:
`claude plugin marketplace update markilo`, then `claude plugin update markilo@markilo`, and restart Claude Code.

## A typical session

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

## The Brand Preview Gallery

`markilo gallery` writes one offline HTML file. A round of proposals is shown as A, B and C, each with its word, a
compact icon, light and dark grounds, small sizes, the idea in one sentence, strengths and honest weaknesses, measured
checks and the originality verdict. For each one you can:

- **Select** it, **request changes** (pick what to change, add a note, or click on the large mark to pin a spot), or
  **drop** it; "combine with another" mixes two;
- **add it to the comparison** and open two or more side by side, then mark the one you prefer and why;
- **reject the whole round** with a note on what is missing.

`gallery --serve` serves the page on `127.0.0.1` with a random token so "Send to your agent" saves the decisions for
`markilo feedback`; opened as a file, the page downloads them as `markilo-feedback.json` for
`markilo feedback --import`. Once an identity is approved the gallery leads with it, its variants and links to the
exported kit.

## Monorepos and product families

```text
/markilo:research This is our product family monorepo at ./ — sites in products/, apps in apps/. The Ledger app's existing identity is locked.
```

Markilo runs `research monorepo`, shows you the packages it considers brands, and after you confirm registers them
(with their folders) and scans each one. Work then proceeds family-first: shared system, master brand, sites one by one,
and many apps as one coherent app-icon system. Locked identities are reproduced byte-for-byte and never redesigned.
Exports can be copied into any package with `install-assets --project <folder>` (dry run first);
`install-assets --framework auto` puts files where Next.js, Laravel, Flutter or a static site expects them, with backups
before anything is replaced.

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

A web app gets web, social, tokens and guidelines by default; app and desktop icon sets are one question away. Sizes,
safe zones and their official sources are in [OUTPUTS.md](OUTPUTS.md).

## What Markilo does

- **Brand intelligence, with receipts.** Repository and website scans, competitor and market research, and a persistent
  Brand Intelligence Profile where every finding is `observed`, `inferred`, `verified` or `user-provided` and carries a
  source and a date. Unknowns are recorded as gaps instead of guesses.
- **Originality engine.** Silhouette overlap under rotation and mirroring, perceptual hashes, structural descriptors,
  palette distance (CIEDE2000), stock-primitive detection, concept-to-concept diversity, name confusion and trademark
  pre-screening plans for WIPO, TMview, USPTO, TÜRKPATENT and UKIPO. Verdicts say how much evidence they rest on; with
  too few references or no logged registry searches the answer is `insufficient-evidence`, never "clear". See
  [ORIGINALITY.md](ORIGINALITY.md).
- **Drawn, not assembled.** Designers draw freely: Bézier contours, custom letterforms built from real font outlines,
  ligatures and treatments that run through the whole word. `proposals` measures how close each word still is to its
  typeface set plainly, so "a stock font with a coloured dot" is caught before you see it.
- **Real design output.** Construction specs compiled with Skia's path engine when they help, freeform SVG when it is
  better. Wordmarks outlined from 24 bundled OFL families with real kerning (Turkish and other Latin-extended letters
  checked in every weight). Lockups aligned to cap height, OKLCH tonal palettes with WCAG pairs.
- **Looks before it talks.** Every concept is rendered to a review sheet (16–256 px, light, dark, black, white) and a
  context sheet. One independent critic reads the developed identity cold — as advice for you, never as a gate in front
  of you.
- **Costs in the open.** `markilo cost` records each phase against a budget (default $12) and stops paid work when it is
  reached.
- **Not tied to one AI.** The toolchain is a plain CLI: `agent-setup` gives VS Code with Copilot, Codex and Cursor the
  same workflow ([INTEGRATIONS.md](INTEGRATIONS.md)).

## How it works

```text
Claude Code  ──  skills/ (process: research, strategy, design, critique)  ──  agents/ (researcher, designer, critic)
                       │  node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs …
                       ▼
Toolchain (src/ → plugin/dist/): XML/SVG lint & optimize · resvg-wasm rendering · shape features & perceptual hashes ·
similarity & genericity · quality scorecard · fontkit wordmarks · lockups · OKLCH palettes · research scanners ·
originality & quality reports · exporters (ICO/ICNS encoders) · gallery · guidelines
```

The rule that keeps it honest: **anything measurable comes from code; anything judged is labeled as judgment.** See
[ARCHITECTURE.md](ARCHITECTURE.md).

## The toolchain on its own

The same CLI runs without Claude Code — in CI, scripts or other coding agents. It needs no account and no paid
service:

```bash
npx markilo help
```

```bash
npx markilo compare my-logo.svg competitor.png
```

Examples: `wordmark --text "Acme" --font sora --weight 600 -o acme.svg`, `score logo.svg`, `palette "#f45d2c"`,
`render logo.svg -o sheet.png --sheet`, `name check Acme --against Acmo,Akme`. Every command prints JSON.

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
  would present ([BENCHMARKS.md](BENCHMARKS.md)). 1.1 is built to be steered: icons remain the hardest part (they still
  tend to be letters); expect to choose between options.
- The interface of the HTML pages is in English and Turkish; files, reports and the designers' notes are in English.
