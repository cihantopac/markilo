# Markilo 0.4.0-rc.7 benchmark

11 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| B2B platform (holdout) | 1 | 0 of 1 | 0 of 1 | 6.4 | $1.93 |
| Developer tool | 3 | 0 of 3 | 0 of 3 | 11.2 | $2.42 |
| Online shop | 3 | 0 of 3 | 0 of 3 | 10.5 | $2.29 |
| Learning app (holdout) | 1 | 0 of 1 | 0 of 1 | 13.1 | $2.68 |
| Multi-product family | 1 | 0 of 1 | 0 of 1 | 15.5 | $3.16 |
| Mobile app | 1 | 0 of 1 | 0 of 1 | 15.8 | $3.30 |
| Independent SaaS | 1 | 0 of 1 | 0 of 1 | 9.1 | $1.98 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | Portwise | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Learning app | Quillnest | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Independent SaaS | Tallyline | no | 0/3 | 0/3 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: claude-opus-5-5.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Portwise | harbour-gate | dropped at sketch review | — | — | — | sketches: s1 two plain rectangles, generic; s2 square split on the diagonal (cut device); s3 Pac-Man/C disc with a bite; s4 P with an open bowl (initial plus cut) | — |
| Portwise | pillar | dropped at sketch review | — | — | — | sketches: s1 hamburger/menu with a purple pill; s2 blocky P with a bite; s3 P from pill+disc, generic; s4 plain P with a loop | — |
| Portwise | range | dropped at sketch review | — | — | — | sketches: s1 bell-curve chart icon; s2 wifi/signal icon; s3 copy/duplicate UI icon; s4 sliced dome, sunrise cliche with a cut | — |
| Seamline | lane-shift | dropped at sketch review | — | — | — | sketches: s6 split disc; s7 app tile with notch (UI icon); s8 striped disc (vent grille/barcode); s9 tile with diagonal slash (slash, S with cut) | — |
| Seamline | split-s | dropped at sketch review | — | — | — | sketches: s6 sheared disc (cut disc); s7 two overlapping squares (generic, UI/layers); s8 two stepped blocks (Tetris/layers); s9 two offset petals (S monogram with offset, generic leaf) | — |
| Seamline | stitch-steps | dropped at sketch review | — | — | — | sketches: s5 stepped blob/Tetris-like block; s6 chevron or K / arrow; s7 needle (explicitly banned); s8 slashed disc (stock disc/slash, weak at 16px) | — |
| Seamline | split-s | dropped at sketch review | — | — | — | sketches: s1 letter S with a cut; s2 Z/S glyph sliced by a slash; s3 generic split tile or Yin-Yang-like pill | — |
| Seamline | step-seam | dropped at sketch review | — | — | — | sketches: s6 a house-pentagon over a shield/pennant, or a split gem; s7 a big square with a small square/pill stuck on (app tile, two windows); s8 two triangles tip to tip, an hourglass or sort/expand toggle | — |
| Seamline | stitched-join | rejected | 5.9 | not passed | 6.2 · present | two offset panels with a twisted rope or DNA helix between; a coil spring or bolt thread; a stylised S/H letter | two offset slabs laced together by diagonal stitches, like a seam or zipper; a stylised S coiled like a spring or helix through a split block; a binding or shoelace cinching two panels |
| Seamline | overlap | rejected | 5.9 | not passed | 5.0 · not as is | tilted H / I-beam on its side; two slanted bars with a connector (equals or Z-like list glyph); a generic UI list or text-align icon | three tilted rounded bars, like a skewed equals sign or hamburger menu; a stepped, abstract S or a zigzag; a mid-gap spacer between two slabs, a loose hint at a seam |
| Seamline | s-join | dropped at sketch review | — | — | — | sketches: s1 blocky S or 5; s2 S or 5 with a notch; s3 S app-icon sticker; s4 S or dollar sign from half-rings | — |
| Seamline | stitch | dropped at sketch review | — | — | — | sketches: s1 two orange panels with a pill (toggle / UI control / sofa); s2 circle with a bar (no-entry, minus-in-circle, pizza); s3 square cut on a diagonal (the generic split-square, the cut device); s4 broken fragments, an S or a pipe, illegible at 16px | — |
| Kilnroom | batch | dropped at sketch review | — | — | — | sketches: s1 glossy bean/egg/pebble; s2 arched door or tombstone icon; s3 stacked bowls, burger-like layers; s4 basket or cat face with drips | — |
| Kilnroom | hinge-k | dropped at sketch review | — | — | — | sketches: s1 K in a tilted square (K app/Kik-like tile); s2 slanted-cut K; s3 wobbly K; s4 K with a dot (K | — |
| Kilnroom | threshold | dropped at sketch review | — | — | — | sketches: s1 postage stamp with a hole (stamp icon/cookie); s2 K app icon in a notched square; s3 bucket/card with drips; s4 star or cookie with a dash; s5 hamburger/stack bars | — |
| Kilnroom | doorway | rejected | 6.3 | not passed | 6.6 · present | arched building facade with windows; cabinet or shelf with a lit door; Roman arcade / church window | arched building facade or kiln with a glowing doorway; stacked arched kiln shelves beside a lit kiln door; a small chapel or colonnade window |
| Kilnroom | k-gate | dropped at sketch review | — | — | — | sketches: s1 K in app-icon slab; s2 K in disc badge; s4 split-K, stem detached from wedge arms (also back/rewind feel) | — |
| Kilnroom | maker-stamp | dropped at sketch review | — | — | — | sketches: s1 bubbles/pebbles cluster; s2 ring with notification dot; s3 eclipse/lens or O; s4 caterpillar/loading dots | — |
| Kilnroom | chop | dropped at sketch review | — | — | — | sketches: s1 fingerprint/target (security icon); s2 tally slashes or barcode in a badge; s3 water/wave icon; s4 bomb with fuse, garlic or a vase/pot (owner exclusion); s5 hypnosis spiral or cinnamon roll | — |
| Kilnroom | kfold | dropped at sketch review | — | — | — | sketches: s1-s3 a K built from rounded bars, i | — |
| Kilnroom | opening | dropped at sketch review | — | — | — | sketches: s1 three bars, list/hamburger menu; s2 brick grid, dots at 16px, generic wall icon; s3 pie chart or Pac-Man, clock wedge; s4 target or nested UI frame | — |
| Quillnest | insert-mark | dropped at sketch review | — | — | — | sketches: s5 slanted tag or eye; s6 face or mouth with teeth; s7 rock or Pac-Man-like bite; s8 letter C or E bracket with a dot (initial-like, plug/face risk) | — |
| Quillnest | next-step | dropped at sketch review | — | — | — | sketches: s5 bent pipe or quarter-arc; s6 leaf with hole (nature/eco cliché); s7 letter S or squiggle; s8 peanut or gourd blob | — |
| Quillnest | q-nest | rejected | 6.1 | not passed | 5.4 · not as is | Q-shaped helmet or bowl-cut face with a single orange eye; a fishbowl or bowl with an egg/yolk; a chat bubble or magnifier | a Q shaped like a cartoon face with bangs and one eye or open mouth; a magnifying glass or search icon; a bowl or nest holding an egg |
| Lumenfold | crease | dropped at sketch review | — | — | — | sketches: s5 split diamond/kite, a cut shape; s6 two thin spikes, M/Y or rabbit ears, dies at 16 px; s7 fragmented bird/shards, docs reads as a 7, sign as S/Z, not calm | — |
| Lumenfold | lightcut | dropped at sketch review | — | — | — | sketches: s4 slanted bars over an underline, like !! or a typographic H/i, members barely differ at 16 px; s5 split diamond, left-pointing play/back arrow; s6 table lamp or traffic cone on a plinth, a literal light cliché, and the family adds only a bar or a split | — |
| Lumenfold | threshold | dropped at sketch review | — | — | — | sketches: s1 door or horseshoe magnet, sign adds a bell; s2 split arched door, sheets/sign muddled; s3 rainbow or wifi arches, sheets unreadable at 16 px; s4/s5 split half-disc and split diamond, DocuSign/yin-yang-like cuts; s6 sliced disc, burger or dial | — |
| Dozeline | heavy-lid | rejected | 6.0 | not passed | 3.8 · not as is | a candle with a flame; a pump bottle or lipstick with a leaf; a bowling pin or chess pawn | a candle or bottle with a detached, oddly shaped flame; a perfume or sauce bottle with a hooked drip above it; a thumbs-up hand shape under a floating blob |
| Dozeline | lit-arch | dropped at sketch review | — | — | — | sketches: s1 a lamp icon; s2 a flask or a lamp app tile; s3 the letter D with a cut-out; s4 a speaker or video-camera/play glyph | — |
| Dozeline | step-down | dropped at sketch review | — | — | — | sketches: s1 two stacked blocks, a lamp or pendant; s2 a donut or egg in a bowl; s3 a bucket or jar; s4 a stock table-lamp icon | — |
| Tallyline | fanline | dropped at sketch review | — | — | — | sketches: s1 a bar chart (finance cliché) or comb; s2 a squiggle or 'mn' worm; s3 a ruler or comb; s4 the letters 'NL' with a strike, which is not legible at 16 px | — |
| Tallyline | runway | dropped at sketch review | — | — | — | sketches: s1 a stair/step icon or squared S; s2 a 'P' with a note; s3 a UI block with a search slot; s4 a bent pipe or letter S | — |
| Tallyline | settled | dropped at sketch review | — | — | — | sketches: s1 a lowercase 'e'/'2' blob; s2 a UI tab or toggle; s3 a horseshoe/pill U; s4 two stacked UI cards | — |

## Critic vs blind judge

5 concepts reached the critique. The gate and the blind judge agreed on 3 of them (gate passed ↔ judge would present as is). Mean critic score 6.0, mean judge score 5.4.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | ok | 6.4 | 4 | 9 | 3985k / 67k | $1.93 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Developer tool | ok | 8.23 | 5 | 9 | 3928k / 68k | $1.84 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Developer tool | ok | 11.22 | 4 | 11 | 5646k / 91k | $2.42 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Developer tool | ok | 15.47 | 3 | 12 | 6018k / 100k | $2.58 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 10.52 | 5 | 9 | 4828k / 93k | $2.29 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 14.97 | 3 | 12 | 7172k / 115k | $2.99 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 8.21 | 3 | 8 | 3539k / 65k | $1.66 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Learning app | ok | 13.11 | 3 | 12 | 6585k / 96k | $2.68 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Multi-product family | ok | 15.54 | 5 | 9 | 6014k / 138k | $3.16 of $25 | claude-sonnet-5-5, claude-haiku-5-5 |
| Mobile app | ok | 15.78 | 16 | 13 | 8616k / 121k | $3.30 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Independent SaaS | ok | 9.06 | 5 | 9 | 4494k / 68k | $1.98 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
