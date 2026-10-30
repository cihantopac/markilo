# Markilo 0.4.0-rc.2 benchmark (--model opus)

1 end-to-end run of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Independent SaaS | Tallyline | no | 1/3 | 0/3 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tallyline | horizon | dropped at sketch review | — | — | — | — | — |
| Tallyline | ledger-loop | dropped at sketch review | — | — | — | — | — |
| Tallyline | signature | rejected | 6.2 | not passed | 6.2 · not as is | a hamburger menu icon knocked askew; fanned stack of planks or papers (Stack Overflow-like bars over an orange base); speed or motion lines | three stacked bars settling to a flat baseline, like a pile of sticks or a fanned stack; a tally mark or ledger lines flattening out, a forecast curve resolving; a menu or hamburger icon, slightly tilted |

## Critic vs blind judge

1 concept reached the critique. The gate and the blind judge agreed on 1 of them (gate passed ↔ judge would present as is). Mean critic score 6.2, mean judge score 6.2.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Independent SaaS | ok | 16.51 | 2 | 10 | 5718k / 111k | $5.23 of $9 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
