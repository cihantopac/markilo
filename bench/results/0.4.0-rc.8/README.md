# Markilo 0.4.0-rc.8 benchmark

9 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| B2B platform (holdout) | 1 | 0 of 1 | 0 of 1 | 9.7 | $2.04 |
| Developer tool | 2 | 0 of 2 | 0 of 2 | 15.8 | $3.22 |
| Online shop | 2 | 0 of 2 | 0 of 2 | 8.7 | $2.22 |
| Learning app (holdout) | 1 | 0 of 1 | 0 of 1 | 8.4 | $2.01 |
| Multi-product family | 1 | 0 of 1 | 0 of 1 | 13.0 | $3.47 |
| Mobile app | 1 | 0 of 1 | 0 of 1 | 8.6 | $1.91 |
| Independent SaaS | 1 | 0 of 1 | 0 of 1 | 16.0 | $3.48 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | Portwise | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Learning app | Quillnest | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Independent SaaS | Tallyline | no | 1/3 | 0/3 | — | — | — | — | 0 |

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
| Portwise | quay-p | dropped at sketch review | — | — | — | sketches: s6 a frying pan / magnifier / power-off button in a square; s7 a plain geometric P in a stock font, nothing of a quay; s8 the brick-wall icon the brief bans (also a firewall icon - wrong for a visibility product); s9 a letter M in a rounded square (an M-initial app icon) | — |
| Portwise | tolerance | dropped at sketch review | — | — | — | sketches: s6 a staircase in a rounded square (app-icon cliché, stockShape 0 | — |
| Portwise | waypoints | dropped at sketch review | — | — | — | sketches: s6 a window/copy UI icon with an orange tab (or a price tag); s7 Greek-key meander / square spiral, a stock ornament; s8 a split pill sliced and offset, the banned cut device, also a pause/D initial; s9 a step-function / single stair, the brief's banned staircase | — |
| Seamline | overlap | dropped at sketch review | — | — | — | sketches: s1 a generic app tile with a stepped line (toggle/slider glyph; stock 83%); s2 the letter L in a rounded square (wrong letter, stock 84%); s3 a git-branch/fork UI icon or a letter E (UI icon cliche); s4 a cracked circle / null sign (a break through a solid, exactly the tear/weak point the brief says to avoid; stock 84%) | — |
| Seamline | railstitch | rejected | 5.9 | not passed | 5.0 · not as is | a bold letter D (or sideways P) led by a dash, '-D'; a magnet / U-shaped pipe bend turned sideways; a ':D' / '=D' grin emoticon or plug connector — unfortunate: a 'D' monogram for a brand named Seamline | a horizontal U-turn rail or hairpin, like a sideways magnet; a blocky letter D or P with a notch cut out; a track loop ending at a cursor-like orange block |
| Seamline | split-s | dropped at sketch review | — | — | — | sketches: s1 a blocky stepped S / mirrored Z / 5: the name's initial with a step, the stock monogram device; s2 the same S as a dashed outline: a broken or perforated S (reads as a tear line, which the brief forbids) and turns to noise at 16 px; s3 a script D or slashed O with a comet tail, i | — |
| Seamline | handoff | dropped at sketch review | — | — | — | sketches: s5 a paperclip end or magnet hook; s6 a hamburger menu or the glyph 王 with rounded bars; s7 a loading spinner or donut, the generic ring device | — |
| Seamline | reversible-s | dropped at sketch review | — | — | — | sketches: s5 a square cut on its diagonal and slid apart (the stock cut device); s6 a letter N or a ribbon knot, a different letter; s7 a lightning zigzag or broken bar, thin and diagonal, which leaves the avatar mostly empty and turns to a scribble at 16 px | — |
| Seamline | running-stitch | rejected | 6.0 | not passed | 5.6 · not as is | a road seen from above with dashed lane markings; a perforated ticket or coupon tear line; a two-column split-view UI icon (unfortunate: a ticket/coupon or generic layout toggle in a GitHub UI) | road or highway lane marking seen from above; perforated ticket or tear-off coupon; dashed seam or stitch line through a rounded square |
| Kilnroom | maker-seal | dropped at sketch review | — | — | — | sketches: s1 a bitten cookie / Pac-Man blob, at 16 px an eye; s2 a triangle in a blob, warning sign or guitar pick, the cone is too stiff to read as a cone; s3 a fat letter C / croissant, wrong letter; s4 three white wedges in a rounded box, fries, candles or teeth, at 16 px a crown | — |
| Kilnroom | room-k | dropped at sketch review | — | — | — | sketches: s1 a rounded K with a notch bitten from the stem, the initial with a cut; s2 a K in a rounded geometric sans with a slightly offset leg, the initial with an offset; s3 a plain rounded-sans K, a stock font letter | — |
| Kilnroom | threshold | dropped at sketch review | — | — | — | sketches: s1 a lowercase r, also a cane or question mark, wrong letter; s2 an underscore plus r, a terminal prompt; s3 the registered-trademark sign (r in a circle), a fatal known mark; s4 two bars and an r, at 16 px 'llr' or a bar chart | — |
| Kilnroom | firing-load | dropped at sketch review | — | — | — | sketches: s1 a baby-bottle/bowling-ball/three-dot icon in an app squircle; s2 a door or mailbox icon - a red ball in an arch, also tombstone-adjacent, 83% stock; s3 wifi/podcast/broadcast signal icon; s4 tally marks or a battery/equalizer (tally is the banned plain-object move) | — |
| Kilnroom | kiln-k | dropped at sketch review | — | — | — | sketches: s1 a rounded-font K (Nunito-style), nothing more; s2 a K that reads as a fish/bird head with an eye - the dimple is an eye, not a thumb; s3 a bold soft K, stock; s4 a slab K, stock; s5 a K split into stem plus chevron - a back button / less-than sign, and the split-initial device | — |
| Kilnroom | threshold | dropped at sketch review | — | — | — | sketches: s1 Santa/gnome hat on a bar; s2 three chess pieces or a hat row, too many parts for 16 px; s3 chess knight/pawn in a circle (worst, also 79% stock); s4 party hat or traffic cone with a chipped tip; s5 Santa hat / chess knight with a bite | — |
| Quillnest | cradle | dropped at sketch review | — | — | — | sketches: s1 crescent moon and star (religious/sleep symbol); s2 pen nib dipped in an inkwell / sailboat (near the banned quill); s3 winking smiley face (childish); s4 origami tulip or fox head, three loose parts; s5 smiley face / ear | — |
| Quillnest | layers | dropped at sketch review | — | — | — | sketches: s1 app-grid/Windows tile icon; s2 target/egg-in-rings; s3 target or vinyl record with a tab; s4 crop/frame UI icon; s5 the stock 'layers' stack icon | — |
| Quillnest | turn | dropped at sketch review | — | — | — | sketches: s1 lowercase n / 'rn' (a different letter); s2 awareness ribbon or dancing stick figure; s3 'c-' / toggle switch; s4 'D' or a pill toggle; s5 Tetris S/L pieces or stair/progress steps | — |
| Lumenfold | crease | dropped at sketch review | — | — | — | sketches: s1 a page with a dog-eared corner (brief explicitly avoids it; Docs and Sign members are the plain folded-corner page); s2 a letter L split by a 45-degree cut, the initial-with-a-cut device, and nearly identical to folded-l s1; s3 a speaker/volume icon (rectangle + trapezoid), Sign member a square plus sliver | — |
| Lumenfold | folded-l | dropped at sketch review | — | — | — | sketches: s1 a letter L cut by a diagonal (initial with a cut), same drawing as crease s2; members at 16 px differ only by foot length; s2 a stepped L holding a cup, reads as a sink/tray or toaster, the inset is a nested copy and goes muddy at 16 px; s3 a square nested in an L frame, a crop/picture-frame icon, near-primitive (0 | — |
| Lumenfold | lightfall | dropped at sketch review | — | — | — | sketches: n1 an open door or two standing panels/book spread; Docs and Sign are near identical at 16 px; n2 tilted stacked bars, speed lines or stairs; Sheets member is literally a hamburger menu, Sign a lone slash, Docs two rectangles, so the members do not belong together; n3 two pennants / fast-forward arrows, Sheets member is a sailboat, Sign reads as play arrows | — |
| Dozeline | handover | dropped at sketch review | — | — | — | sketches: s6 two parallelograms, a fast-forward or chevron arrow; s7 the letter L; s8 the letter Z, the Zzz sleep cliché; s9 a folded page corner or dog-ear (a struck product-object cliché) plus a play/forward arrow | — |
| Dozeline | horizon-d | dropped at sketch review | — | — | — | sketches: s1 a D on an underline (initial plus bar, stock monogram); s3 an open D/backwards c with a dot, an eye or a Pac-Man; s4 a cake or a head on a pillow emoji; s5 a bowl/eye with a lid, a sunrise; s6 a lowercase d or mirrored J; s7 a bib or half-disc; s8 a U or magnet; s9 a tipped A or a flag | — |
| Dozeline | steps | dropped at sketch review | — | — | — | sketches: s1 a left-aligned text/list icon (UI); s3 a staircase/step chart; s6 a backslash or tilde swoosh, generic; s7 a cursive e or awareness-ribbon loop, mushy at 16 px; s8 a smiley mouth or a ball in a cup (closest, but the sinking-sun-in-valley reading is a sunset cliché next door to the banned moon); s9 a hook or pigtail curl, no eyelid reading | — |
| Tallyline | handover | dropped at sketch review | — | — | — | sketches: s1 a smiley face / u-umlaut; s2 two slabs and a dot, generic; s3 a percent sign (finance cliche); s4 a pause/volume glyph l | — |
| Tallyline | runway | dropped at sketch review | — | — | — | sketches: s5 the dark-mode/contrast toggle icon (half-filled circle); s6 the same contrast icon in a squircle, generic diagonal split; s7 a medicine capsule broken open, or a padlock shackle | — |
| Tallyline | tl-line | rejected | 4.5 | not passed | 5.0 · not as is | lowercase tl typed in a terminal followed by an underscore cursor and a period (tl_.); two rising bars of unequal height on a shared base, a small bar chart; a cross on a plinth beside a post, like a grave marker. Unfortunate for this audience: a rising-bars finance chart, which the brief explicitly bans | a lowercase 'tl' ligature sharing one baseline; a squat bar chart or a 'u' shape beside a stray dot and dash; a typing cursor or a status indicator |

## Critic vs blind judge

3 concepts reached the critique. The gate and the blind judge agreed on 3 of them (gate passed ↔ judge would present as is). Mean critic score 5.5, mean judge score 5.2.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | ok | 9.69 | 4 | 9 | 3691k / 73k | $2.04 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Developer tool | ok | 14.09 | 5 | 11 | 6734k / 106k | $3.14 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Developer tool | ok | 17.52 | 3 | 13 | 6927k / 120k | $3.31 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Online shop | ok | 8.65 | 7 | 6 | 4015k / 67k | $2.00 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Online shop | ok | 8.69 | 4 | 9 | 4347k / 98k | $2.43 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Learning app | ok | 8.36 | 4 | 9 | 3713k / 74k | $2.01 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Multi-product family | ok | 12.99 | 6 | 6 | 7840k / 141k | $3.47 of $25 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Mobile app | ok | 8.62 | 5 | 9 | 3461k / 67k | $1.91 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Independent SaaS | ok | 16.01 | 1 | 12 | 7821k / 109k | $3.48 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
