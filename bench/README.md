# Benchmark

End-to-end runs of the installed Markilo plugin on realistic products, to measure design quality, success rate,
effort and cost release by release. Each scenario is a fixture project (a README, manifests and screens, no real
company) plus the owner's preferences:

| Scenario                                       | Product                                                                      | What it tests                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [saas-invoicing](scenarios/saas-invoicing)     | Tallyline — invoicing and cash-flow forecasting for freelancers (Next.js)    | A crowded category (fintech blue and green), web-only deliverables      |
| [mobile-sleep](scenarios/mobile-sleep)         | Dozeline — wind-down and sleep journal app (Flutter, iOS + Android, EN + TR) | Clichés to avoid (moons, stars), home-screen legibility, mobile exports |
| [family-workspace](scenarios/family-workspace) | Lumenfold — office suite with Docs, Sheets and Sign (monorepo)               | A master brand and three product icons that belong together             |

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
