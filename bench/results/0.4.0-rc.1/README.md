# Markilo 0.4.0-rc.1 benchmark

3 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | Lumenfold | no | 2/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | no | 3/3 | 0/3 | — | — | — | — | 0 |
| Independent SaaS | Tallyline | no | 2/3 | 0/3 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lumenfold | aperture | rejected | 6.0 | not passed | 5.0 · not as is | arch-topped door or tombstone; mail slot or ticket; rounded tab with a slash | tombstone or arched doorway with a slash; a mailbox or capsule with a diagonal cut; a generic app-icon blob |
| Lumenfold | crease | rejected | 6.8 | not passed | 6.0 · not as is | dog-eared page / file icon; sticky note with peeled corner; folded paper corner | folded page corner; sticky note or paper sheet; document or app tile |
| Lumenfold | ribbon | dropped at sketch review | — | — | — | — | — |
| Dozeline | bedside-glow | rejected | 5.6 | not passed | 5.2 · not as is | table lamp icon; witch or bowler hat on a plate; furniture/UI lamp pictogram | a bedside table lamp on a pool of warm light; a lamp or lighting-shop icon; a hat or a mushroom on a plate |
| Dozeline | dimming-steps | rejected | 6.2 | not passed | 6.0 · not as is | letter m (or m/h glyph); fingers or dripping arches; stepped hill silhouette | a letter m made of descending arches; a stepped waterfall or staircase of rounded pipes; a hand or a melting, dripping shape |
| Dozeline | one-line-d | rejected | 6.4 | not passed | 5.8 · not as is | lowercase d; ring or hook; keyring or eyelet loop | a lowercase 'd' as a soft, chunky rounded letterform; a looped ribbon or hook, like a sage-green rounded 'd' or loop; a generic friendly app/lifestyle monogram |
| Tallyline | soft-fold | rejected | 5.4 | not passed | 5.6 · not as is | orange document or sticky note with folded corner; letter F / flag shape; sliced page with a stray stripe | kıvrık köşeli bir belge/fatura, üzerinden geçen çapraz bir çizgiyle; kalem ya da fırça darbesi ile çizilmiş bir sayfa; kesilmiş ya da yırtılmış not kâğıdı |
| Tallyline | steady-t | dropped at sketch review | — | — | — | — | — |
| Tallyline | tally-run | rejected | 6.8 | not passed | 6.6 · not as is | tally marks; strike-through / cancelled bars; barcode-comb with slash | tally marks (five-bar gate); counting or tallying; a crossed-out or struck-through set of bars |

## Critic vs blind judge

7 concepts reached the critique. The gate and the blind judge agreed on 7 of them (gate passed ↔ judge would present as is). Mean critic score 6.2, mean judge score 5.7.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | ok | 16.62 | 3 | 12 | 8634k / 153k | $3.67 of $25 | claude-sonnet-5-5, claude-haiku-5-5 |
| Mobile app | ok | 20.54 | 2 | 14 | 9167k / 127k | $3.48 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Independent SaaS | ok | 10.7 | 4 | 13 | 6720k / 87k | $2.61 of $20 | claude-sonnet-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
