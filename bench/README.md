# Benchmark

End-to-end runs of the installed Markilo plugin on realistic products, to measure design quality, success rate,
effort and cost release by release. Each scenario is a fixture project (a README, manifests and screens, no real
company) plus the owner's preferences:

| Scenario                                             | Product                                                                              | What it tests                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [saas-invoicing](scenarios/saas-invoicing)           | Tallyline — invoicing and cash-flow forecasting for freelancers (Next.js)            | A crowded category (fintech blue and green), web-only deliverables                                  |
| [mobile-sleep](scenarios/mobile-sleep)               | Dozeline — wind-down and sleep journal app (Flutter, iOS + Android, EN + TR)         | Clichés to avoid (moons, stars), home-screen legibility, mobile exports                             |
| [family-workspace](scenarios/family-workspace)       | Lumenfold — office suite with Docs, Sheets and Sign (monorepo)                       | A master brand and three product icons that belong together                                         |
| [devtool-cli](scenarios/devtool-cli) (holdout)       | Seamline — zero-downtime PostgreSQL migrations, an open-source CLI (Rust, docs site) | A developer audience, GitHub avatar and README, no category clichés (cylinders, elephants, prompts) |
| [ecommerce-shop](scenarios/ecommerce-shop) (holdout) | Kilnroom — online shop for small-batch ceramics (Laravel, TR + EU)                   | Warm without folksy, labels and stickers, Laravel asset install                                     |

## Results

| Run                                         | Model      | Passed the gate | Blind judge would present | Developed / directions | Gate agrees with the judge | Minutes (total) | Cost (API equivalent) |
| ------------------------------------------- | ---------- | --------------- | ------------------------- | ---------------------- | -------------------------- | --------------- | --------------------- |
| [0.4.0-rc.1](results/0.4.0-rc.1)            | Sonnet 5.5 | 0 of 3          | —                         | 7 / 9                  | 7 of 7                     | 48              | $9.76                 |
| [0.4.0-rc.2](results/0.4.0-rc.2)            | Sonnet 5.5 | 1 of 3          | 0 of 1                    | 1 / 9                  | 0 of 1                     | 32              | $6.10                 |
| [0.4.0-rc.2, Opus](results/0.4.0-rc.2-opus) | Opus 5.5   | 0 of 1          | —                         | 1 / 3                  | 1 of 1                     | 17              | $5.23                 |
| [0.4.0-rc.3](results/0.4.0-rc.3)            | Sonnet 5.5 | 2 of 3          | 2 of 2                    | 6 / 9                  | 5 of 6                     | 54              | $10.85                |

What changed, and why:

- **rc.1 → rc.2.** In rc.1 every concept the gate rejected had passed the sketch review with a cliché the critic had
  named itself ("may read as a barcode", "a folded page corner"), and the critic's "would not present it" had nowhere
  to be recorded. rc.2 made the sketch review a procedure that strikes such sketches, counted the product's own
  object as a cliché and applied the gate in code. Runs that could not succeed stopped at the sketch review — 8 of 9
  directions — and the one identity that passed was marginal; the blind judge would not present it. Opus 5.5 on the
  SaaS brief did no better, so the model was not the bottleneck.
- **rc.2 → rc.3.** 69 % of the sketches the critic had struck (22 % of the picked ones) failed verify's 16 px
  thinnest-detail check: the construction guide asked for gaps of 1/24 of the artboard, below verify's own failing
  threshold. rc.3 fixed the rule (≥ 80 units on 1024), made `markilo sketches` say which sketches are not ready and
  how to fix them in construction units, had the designer redraw before handing over and name the visual hook a
  stranger sees at 32 px, and gave the construction guide a worked example. Developed concepts went from 1 to 6 of 9;
  the SaaS and mobile app identities passed the gate and the blind judge. The family brief is still unsolved.

Benchmarking so far (four runs of the three briefs plus judging) cost $33.80 in API-equivalent terms. Each run counts
against a Claude subscription's usage limits instead of being billed; the costs are what the same tokens would cost
on the API.

Holdout scenarios were written before the changes they test and were never run while Markilo was being tuned;
they show whether an improvement generalizes beyond the briefs it was found on.

## Run

```bash
node scripts/bench.mjs run all          # or one id; each run uses a temporary copy of the project
node scripts/bench.mjs judge            # blind judge for every concept that reached the critique
node scripts/bench.mjs report           # bench/results/<version>/README.md
```

Runs use headless Claude Code (`claude -p`) with the plugin installed, web search and fetch allowed and a budget cap
per scenario (`budgetUsd`). The owner is not available: Markilo records its own recommended answers and continues.
`node scripts/bench.mjs measure <workspace>` prints the same metrics for any Markilo workspace.

## What is measured

- **Success**: a concept passed the quality gate, was finalized with no failing check and exported.
- **Gate**: concepts that passed Markilo's critic gate (brand fit, distinctiveness and memorability ≥ 6, average ≥ 6.5).
- **Checks**: Markilo's automated checks on the finalized concept (pass / warn / fail).
- **Originality**: the verdict of the Originality & Similarity Report.
- **Blind judge**: a separate model call that sees only the brief and rendered images — no rationale, no scores — and
  rates distinctiveness, memorability, brand fit, craft and versatility. Agreement with the gate shows whether the
  critic is calibrated.
- **Effort and cost**: minutes, turns, sub-agents, tokens and the API-price equivalent Claude Code reports. On a Claude
  subscription the work counts against the plan's usage limits instead of being billed.

Results keep Markilo's own outputs (final masters, symbol sheets, decisions) and metrics only; research captures and
third-party reference marks never leave the temporary run folder.
