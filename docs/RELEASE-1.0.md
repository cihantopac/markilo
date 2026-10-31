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

## Real-project validation protocol

Three of the maintainer's own developer products (search intelligence, product experience, release engineering)
serve as realistic test subjects. They are test environments, not branding assignments:

- Work happens only on disposable copies outside every repository; the products' own repositories, logos, favicons,
  sites and documents are never modified, and nothing generated is committed to them.
- Results stay out of this public repository except as anonymized, aggregate findings ("a release-engineering CLI").
- Installation tests run against disposable copies only.
- No concept from these runs is an approved identity.

## Progress log

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
