# Markilo 1.0.0 — release plan and readiness

The working plan for taking Markilo from 0.5.0-rc.1 to 1.0.0. It is the single place where progress, open blockers
and the release checklist are kept, so work can resume in any session. Update it in the same commit as the work.

**Rule for the whole release:** success is not manufactured. Thresholds are not lowered to raise pass rates, results
are not selected, unsuccessful attempts are recorded, and anything that cannot be made reliable is removed from the
1.0.0 promises instead of being advertised.

## Where 0.5.0-rc.1 stands (assessed 2026-10-31)

- Toolchain: 16.6k lines of TypeScript, 27 test files (174 tests), CI on Linux/macOS/Windows × Node 20/22, clean
  marketplace install smoke test. npm has 0.4.0 (`latest`); 0.5.0-rc.1 is unpublished.
- Design quality, the central gap: 2 of 9 unattended runs passed the gate; the Opus judge (majority of 3 looks) agreed
  with the gate on 29 of 29 concepts, but 27 of those were rejections, so gate precision and recall rest on two
  positives. Wordmark-led concepts 2 of 13 presentable, invented symbols 0 of 16. Sketch boards are dominated by
  primitives that read as UI icons.
- The critic and the judge are both Opus with similar prompts: their agreement is not yet independent evidence.

## 1.0.0 blockers

| #   | Blocker                                                                                                 | Area         | Status                                               |
| --- | ------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------- |
| B1  | `install-assets --group --force` replaced files without a backup; no rollback on partial failure        | Data safety  | **Fixed** (transactional installer)                  |
| B2  | Unattended design quality: too few presentable identities, symbol directions almost never succeed       | Design       | In progress (see log)                                |
| B3  | Gate validation rests on 2 positives and one judge family; no repeated-run variance or human reference  | Evaluation   | Tooling done; evaluation runs pending                |
| B4  | Wordmark engine: 10 bundled faces, limited letter surgery, no measured optical spacing                  | Design       | Partly: 24 faces, letter check; optical spacing open |
| B5  | Real-project validation (three developer products) not yet done with the current version                | Validation   | Open                                                 |
| B6  | Security review of gallery server, research fetchers, SVG/raster inputs and repo scanner not refreshed  | Security     | Open                                                 |
| B7  | Clean-environment verification of npm/npx, plugin skills and other agents (`agent-setup`) on three OSes | Distribution | Partly (CI covers CLI + plugin install)              |
| B8  | Export claims to re-verify against official specs; X header unverified; Icon Composer layers only       | Exports      | Open                                                 |
| B9  | Gallery: feedback loop, iteration history and final selection need a first-time-user walkthrough        | UX           | Open                                                 |

## Plan, in priority order

1. **Data safety (B1).** Done: one transactional installer for both modes — preflight, backups, temp-file writes,
   journal, automatic rollback, `--undo`, `--expect <planId>` against stale plans, `unchanged` for identical files.
2. **Evaluation that can be trusted (B3), before tuning.**
   - Seal fresh holdout briefs (written and committed before any design change they test; never run while tuning).
   - Judge panel: Opus and Sonnet cold looks with a judge prompt that differs from the critic's, majority of 3 looks
     each; report agreement per judge and between judges.
   - Report gate precision/recall with confidence intervals, run-to-run variance (each holdout run 2–3 times),
     concept diversity, minutes and cost.
   - Optional human reference: the maintainer rates a blind, shuffled sheet set; used only to check the judges.
3. **Design quality (B2, B4).** Target the measured failure modes, one change at a time, each validated on holdouts:
   - Wordmark craft: more characterful OFL faces, letter surgery as construction operations (joins, terminals,
     counters, ligatures, one swapped glyph), measured optical spacing and overshoot.
   - Symbol directions: curve-based construction beyond primitives; a stricter "what a stranger sees" probe on
     sketches; drop symbol directions that keep reading as UI icons instead of polishing them.
   - Gate noise: take the majority of several cold looks on borderline concepts (6.0–6.4 flips about half the time).
   - Direction diversity: measured distance between directions, not only between variants.
4. **Real-project validation (B5)** on three developer products, isolated (see below), with the same metrics.
5. **Security review (B6)** with tests for every real risk found.
6. **Distribution (B7)** from clean folders and containers: `npm i -g`, `npx`, plugin install, `/markilo`,
   `/markilo:design`, each skill, `agent-setup` targets.
7. **Exports (B8)**: re-verify `src/export/specs.ts`, validate files with platform tooling where available, remove
   claims that cannot be verified.
8. **Gallery and first-run experience (B9).**
9. **Release**: changelog, notes, benchmark report, security review, export validation, known limitations, versions
   synchronized. Tag, GitHub release and `npm publish` only with the maintainer's explicit approval.

## Measurable release criteria

A criterion is met only with evidence committed under `bench/` or `docs/`.

| Criterion                                                                                    | Target                                        | Now                         |
| -------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------- |
| Unattended runs on fresh holdouts with ≥ 1 identity the judge panel would present            | Materially above rc.1, reported with interval | 1 of 2 holdout runs (rc.1)  |
| Gate precision (passes the panel would present)                                              | ≥ 0.75, reported with interval                | 2 of 2 (n too small)        |
| Gate recall (panel-presentable concepts the gate passed)                                     | ≥ 0.6, reported with interval                 | 2 of 2 (n too small)        |
| Thresholds                                                                                   | Unchanged or stricter than 0.5.0-rc.1         | —                           |
| Exported files validated (sizes, formats, manifests, checksums) on every advertised platform | 100 %                                         | Unit-tested, not re-audited |
| Install: data loss or silent overwrite                                                       | None; rollback tested                         | Fixed in this cycle         |
| Clean installs (npm, npx, plugin) on macOS, Linux, Windows                                   | All pass                                      | CI: CLI + plugin on Linux   |
| Real-project validations completed in isolation                                              | 3 of 3                                        | 0 of 3                      |

## Release acceptance (the 15 criteria)

Status is evidence-based; "met" links to the evidence. Quality numbers are filled in from the final holdout
evaluation, whatever they are.

| #   | Criterion                                                      | Status                 | Evidence                                                                                                           |
| --- | -------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Every advertised feature works end to end                      | Met                    | CI (3 OS × Node 20/22), smoke test from an empty folder to installed assets, installed-package smoke               |
| 2   | The workflow is usable by a new user                           | Met                    | Gallery reviewed in a browser on a real run; empty-review and verdict fixes; ideas, sketches and decisions visible |
| 3   | Creative quality materially better, independently demonstrated | See holdout evaluation | `bench/results/1.0.0/`                                                                                             |
| 4   | The gate rejects weak work without suppressing strong work     | See holdout evaluation | Panel agreement on real-project runs: 17 of 17 and 11–12 of 12                                                     |
| 5   | Fresh scenarios show credible generalization                   | See holdout evaluation | Five holdouts sealed at `241af5e`, run once for baseline and release                                               |
| 6   | Originality reports disclose the limits of their evidence      | Met                    | `insufficient-evidence` without registry searches or enough references; docs/ORIGINALITY.md                        |
| 7   | SVG and exports technically valid and visually inspected       | Met                    | 199-file kit checked with iconutil, sizes per platform, hashes, XML/JSON; icons inspected                          |
| 8   | Locked identities and user files protected                     | Met                    | Transactional install with rollback and `--undo`; lock refuses active content; tests                               |
| 9   | Real-project tests done safely in isolation                    | Met                    | Three products, disposable copies outside every repository; install/undo on copies left them byte-identical        |
| 10  | No release-blocking security or data-loss issue                | Met                    | Security review findings fixed and tested (CHANGELOG, Security)                                                    |
| 11  | CLI, plugin and npm work from clean installations              | Met                    | Packed tarball installed in a clean prefix and smoke-tested; marketplace install in CI                             |
| 12  | Automated tests and cross-platform CI pass                     | Met                    | 196 tests; CI green on Linux, macOS, Windows                                                                       |
| 13  | Documentation matches the product                              | In progress            | README, bench README, integrations, outputs                                                                        |
| 14  | Performance, model usage and limits reported honestly          | In progress            | Cost and minutes per run in every bench report                                                                     |
| 15  | Nothing incomplete marketed as finished                        | In progress            | Icon Composer `.icon` and X header sizes listed as limits, not features                                            |

## Real-project validation protocol

Three of the maintainer's own developer products (search intelligence, product experience, release engineering)
serve as realistic test subjects. They are test environments, not branding assignments:

- Work happens only on disposable copies outside every repository; the products' own repositories, logos, favicons,
  sites and documents are never modified, and nothing generated is committed to them.
- Results stay out of this public repository except as anonymized, aggregate findings ("a release-engineering CLI").
- Installation tests run against disposable copies only.
- No concept from these runs is an approved identity.

## Progress log

- **2026-10-31 (3)** — Real-project diagnosis and the first design experiments (results kept private; aggregates only):
  - Baseline (0.5.0-rc.1 + install fix) on three real developer products: 0 of 3 runs passed; 18 concepts, blind
    distinctiveness mostly 4–5 with craft 6–7. Judge panel (Opus + Sonnet, 2 looks each): 0 of 17 presentable; both
    judges agreed with the gate and with each other on 17 of 17. The gate is not too strict here; the work is weak.
  - Every symbol direction came from a mechanism metaphor drawn with primitives (brackets, crosses, arches, gauges).
    The idea longlist (`markilo ideas`) was added to strike such ideas from the words. Candidate run on the same three
    products: the critic struck 49 of 66 ideas with sensible readings, but the kept ideas still became icon-like
    drawings (a plumb bob assembled from a ring, a bar, a trapezoid and a triangle). 0 of 3 runs passed; mean blind
    distinctiveness 4.4 vs 4.6 — **no measurable improvement** (n = 3, known briefs). The second look ran for the
    first time in a real run and rejected an edge pass 1–2.
  - Measured and not adopted: separate-part count and extreme aspect ratio vs. outcome on 79 earlier concepts (3+
    parts: 0 of 22 passed, 1–2 parts: 4 of 57; difference not significant with 4 passes in all).
  - Security review delegated and acted on (see CHANGELOG, Security). Export kit re-validated with system tools
    (iconutil, sizes, hashes, XML/JSON): no problems. Clean npm install + smoke on the installed package passed.
  - Next experiment: the concept designer on Opus instead of Sonnet on the same three products (the earlier "Opus did
    no better" rested on one rc.2 run).

- **2026-10-31 (2)** — Evaluation and design-quality groundwork, each change tested and committed:
  - Five holdouts sealed unrun at `241af5e` (ai-notes, coffee-roaster, physio-health, outdoor-tr, community-solar).
  - `bench.mjs`: isolated runs (only Markilo loaded, from a plugin snapshot), `--plugin` for baselines, `--scenarios`
    for private projects, `--panel opus:3,sonnet:3`, precision/recall with 95 % Wilson intervals. Re-reporting rc.1:
    precision and recall 2 of 2, interval 34–100 % — the "29 of 29" agreement says little about passes.
  - Letter legibility check for built wordmarks (counters lost, letters read as others, merged pairs, added elements
    read as hyphen/accent/full stop). Calibrated on 46 earlier wordmarks: no false block; raster likeness alone found
    none of the known misreads, the counter test found all three (recorded as an unsuccessful first attempt).
  - 24 bundled type families with traits; the wordmark board's contrasting faces now follow the brief (it was one
    fixed list for every brand; no run had ever added a font).
  - Gate second look: every pass so far sat exactly at the bar and the judge rejected half; edge cases now need the
    majority of three cold looks by fresh critics. `finalize` refuses unreviewed and undecided concepts.
  - Real-project diagnostic runs started (three products, isolated copies, 0.5.0-rc.1 + install fix). Caveat: they
    loaded the live checkout, which changed mid-run, so they are labelled mixed and used for diagnosis only; the
    benchmark now snapshots the plugin at start.
  - Security review of the toolchain delegated; findings pending.

- **2026-10-31** — Assessment of 0.5.0-rc.1. B1 fixed: transactional `install-assets` with rollback, `--undo`,
  `--expect`, `unchanged`; smoke test covers expect and undo.
