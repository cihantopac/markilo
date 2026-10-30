# Markilo 0.4.0-rc.9 benchmark

9 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| B2B platform (holdout) | 1 | 1 of 1 | 0 of 1 | 15.2 | $3.48 |
| Developer tool | 2 | 0 of 2 | 0 of 2 | 15.3 | $3.53 |
| Online shop | 2 | 0 of 2 | 0 of 2 | 16.0 | $3.97 |
| Learning app (holdout) | 1 | 0 of 1 | 0 of 1 | 16.8 | $4.15 |
| Multi-product family | 1 | 0 of 1 | 0 of 1 | 27.7 | $7.13 |
| Mobile app | 1 | 1 of 1 | 0 of 1 | 16.0 | $3.81 |
| Independent SaaS | 1 | 0 of 1 | 0 of 1 | 16.4 | $4.18 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | Portwise | yes | 2/3 | 1/3 | porta · 6.3 | 6.2 · not as is | 14/1/0 | insufficient-evidence | 81 |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 2/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 2/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 3/3 | 0/3 | — | — | — | — | 0 |
| Learning app | Quillnest | no | 3/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold | no | 3/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | yes | 3/3 | 1/3 | settle · 6.3 | 5.2 · not as is | 16/0/0 | insufficient-evidence | 105 |
| Independent SaaS | Tallyline | no | 3/3 | 0/3 | — | — | — | — | 0 |

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
| Portwise | confidence-band | dropped at sketch review | — | — | — | sketches: s6 a notification-bell UI icon (dome over base line), second read a chart bell curve, so a UI icon plus the product's own object drawn plainly; s7 a traffic cone at first glance, which signals construction or hazard, the opposite of calm and dependable; s8 a letter A, then a tombstone or arch window: a different letter plus a grim misreading | — |
| Portwise | one-thread | rejected | 6.1 | not passed | 5.0 · not as is | a letter H with its crossbar floating loose (or a sideways I-beam); a bracketed minus / collapse toggle [-] or a UI range-slider handle; a brick or dumbbell between two posts. Most unfortunate for ops teams: a 'minus / remove / collapsed' UI control | a block suspended between two posts, like a progress or loading indicator; a dimension or measurement bracket; a container berthed between quay walls |
| Portwise | porta | approved | 6.3 | passed | 6.2 · not as is | a round-topped doorway split down the middle; two mirrored stepped Art Deco towers (skyline, real-estate developer); a ziggurat or mirrored bar chart. Unfortunate: a pair of headstones / twin towers, or a property-developer logo | a split stepped arch, like a temple or cathedral doorway; a gateway or harbour gate opening down the middle; a stepped tower or rocket silhouette |
| Seamline | c1-step | rejected | 6.2 | not passed | 5.0 · not as is | a git commit node on a line (GitHub's commit icon); a fuse / schematic component on a wire; a bypass lane splitting and rejoining. Unfortunate: a generic git-commit/branch-merge UI glyph, which this exact audience sees all day | a branch-and-merge path diagram (two lanes splitting and rejoining); an eye or lens outline on a horizontal line; an electronics schematic symbol such as a fuse or inline component |
| Seamline | c2-seam | dropped at sketch review | — | — | — | sketches: s1 a staircase or step-line chart, really a stepped S with a color split (initial plus step, struck); s2 a square spiral or Greek-key S, or interlocking brackets: stock interlock, 58% stock-shape (struck); s3 the git-merge or road-merge icon, also a > chevron (UI icon, struck); s4 audio-mixer sliders or a fence/HH; the over-under thread is invisible because the navy is drawn as two separate bars (UI icon, struck; one-color merges the layers) | — |
| Seamline | c3-s | dropped at sketch review | — | — | — | sketches: s1 the numeral 8 or an ampersand; the S only comes through once you are told (a different letter, struck); s4 a cursive S or a script 8, closer to a signature or handwriting than a tool: it contradicts precise and developer-native, and at 16 px it is an 8 (struck) | — |
| Seamline | join | rejected | 5.8 | not passed | 5.4 · not as is | an orange pipe elbow running between two black brackets (plumbing fitting); the letters C and U side by side ('CU'); a cable connector or bracket clamp from a UI icon set | two bracket-like blocks (a C and a U) joined by an orange pipe or route; a stylized 'S' or a plumbing elbow joint; a data-join or merge diagram |
| Seamline | s-weave | rejected | 5.0 | not passed | 5.6 · not as is | a chain-link / broken-link icon (two blocks with a diagonal bar across the gap); a pixel-font 8 or a split S; a hinge or bolted bracket with a slash through it | two stacked square blocks pinned together by a slanted stitch; a blocky S or 8 with a slash through it; a chain link or bolted joint |
| Seamline | steps | dropped at sketch review | — | — | — | sketches: s1 a tilted pause icon / double slash (and a sliced block, the cut cliche); s2 a hamburger menu in a circle, the stock striped-disc logo; s3 a flattened Tetris S piece or a step-line chart glyph; s4 a Tetris Z tetromino | — |
| Kilnroom | countdown-ring | rejected | 5.8 | not passed | 4.8 · not as is | a breaking wave crest; a shepherd's crook or walking-cane handle; a bent nail or hooded figure (unfortunate: a cane, i.e. age and frailty) | a breaking wave or curling hook; a question mark or shepherd's crook; a desk lamp or chimney stack |
| Kilnroom | door-light | rejected | 5.1 | not passed | 4.6 · not as is | paint or slime drip (dripping-text cliche); a table or pi sign with drips; a dripping lowercase m | dripping paint or melting caramel/chocolate drip; a slime/horror 'drip' graphic or a melting table; a stylised lowercase 'm' or a lintel with three hanging bulbs |
| Kilnroom | kiln-k | dropped at sketch review | — | — | — | sketches: s1 a K cut into an arch tile - the name's initial with cuts, struck; s2 an E / comb / stepped bar chart, different letter, struck; s3 a stock-font K knocked out of a tombstone-shaped app tile - generic monogram-in-container (stock 0 | — |
| Kilnroom | doorway | rejected | 5.5 | not passed | 5.6 · not as is | a sail beside a dark panel (sailing/yacht brand); a door swung open - the generic exit/log-out UI icon; an open book or folded leaflet. Unfortunate: a marine or travel-booking mark, or a 'sign out' button | an open door with a wedge of light spilling out; a glowing kiln door ajar; an abstract sail or flag beside a panel |
| Kilnroom | glaze-tiles | rejected | 5.2 | not passed | 5.2 · not as is | paint dripping over a globe (Sherwin-Williams 'Cover the Earth'); a circuit trace with pin terminals; a melting ice-cream scoop or a face - unfortunate: a paint brand or a melting/damaged item for a breakage-insured shop | blue glaze dripping over a terracotta disc; paint-drip or melting icon; circuit-board traces or puzzle-piece knobs |
| Kilnroom | maker-stamp | rejected | 5.6 | not passed | 5.2 · not as is | a camera lens or webcam app icon; a record button / ring-in-squircle UI glyph; a fried egg or a stone with a pebble. Unfortunate: an Instagram-style camera icon on the very Instagram avatar it must work as | a camera lens or record button inside a rounded square; a peephole or kiln spyhole; a generic app icon or an eye |
| Quillnest | growing-rings | rejected | 6.2 | not passed | 5.6 · not as is | a hand-drawn single-stroke letter Q; a magnifying-glass search icon (ring plus handle), strongest in the 16 px tab; an eye or fried egg with a coral yolk. Unfortunate: a search/find app icon | a hand-drawn letter Q with an orange dot in its counter; a fried egg or an eyeball; a location pin or target lying on its side |
| Quillnest | next-step | rejected | 5.8 | not passed | 5.0 · not as is | speed stripes / sportswear or motorsport slashes; a fast-forward or progress-loading glyph; a '//' code-comment or URL slash. Unfortunate: an energy-drink or racing brand, nothing about writing or encouragement | three slanted bars accelerating to the right, like a fast-forward or progress glyph; a block thinning into strokes, like a page turning into a pen nib or a signal bar; generic sporty speed lines, the kind used by fitness and delivery brands |
| Quillnest | q-caret | rejected | 6.4 | not passed | 6.8 · present | a geometric Q built from a disc with a notched-out corner and a lifted red tab; a Pac-Man / pie chart with a slice removed; a red correction tag or eraser. Unfortunate: teacher's red-pen mark, school grading | a bold Q with a block tail; a disc with a right-angle notch cut out and a red bar; a caret or nib-tip wedge biting into a circle |
| Lumenfold | aperture | rejected | 5.4 | not passed | 4.6 · not as is | a megaphone / loudspeaker (volume icon); a flashlight or projector beam; a stencil D or a price tag | megaphone or loudspeaker seen side-on; flashlight casting a beam of light; rounded open bracket holding an orange trapezoid |
| Lumenfold | crease | rejected | 5.1 | not passed | 4.2 · not as is | the numeral 7; a flag on a pole (golf hole marker); a bookmark or folded page corner drawn as two loose blocks | a blocky numeral 7 or Γ shape; a rectangle beside an angled bar with no clear relation; faintly a folded corner, only once told |
| Lumenfold | shared-ground | rejected | 5.9 | not passed | 5.6 · not as is | a split square / two interlocking L-blocks (an L with a stepped cut); a Z or 2; a staircase or bar chart (Sheets) and a split pie (Sign) | two interlocking L-shaped blocks in a rounded square; a stepped Z or the digit 2 cut through a tile; a puzzle or construction joint rather than a fold or light |
| Dozeline | descend | rejected | 5.0 | not passed | 3.8 · not as is | a worm or squiggle; a declining line chart / drop-off graph; a stair-rail or bent pipe. Unfortunate: a falling chart ('your sleep is crashing') or a worm in a bedtime app | a descending wavy line or path settling flat; a worm or a squiggly brushstroke; a sleep-stage graph stepping down |
| Dozeline | lamplit | rejected | 5.8 | not passed | 5.8 · not as is | a small house or cabin with a sloped roof and a tall rounded door; the digit 0 (or letter O) set in a pentagon tag; a generic home/door UI icon, or a price tag. Unfortunate: a big zero, i.e. a score of 0, for an app whose promise is no scores | a slanted-roof block or lampshade with an oval hole; a stylised letter D or zero cut out of a wedge; a house or tag icon with a window |
| Dozeline | settle | approved | 6.3 | passed | 5.2 · not as is | a soft slumped pebble or creature with one closed eye; a mouse-hole or slot in a soft blob; a capital D sagging onto its back. Unfortunate: a piggy-bank coin slot or a toaster | a lumpy blob with a pill-shaped slot, like a toaster, a wall socket or a piece of cheese; a slumped letter D settling down like a pillow; a cartoon mouse or a creature peeking from a mound |
| Tallyline | cairn | rejected | 5.4 | not passed | 4.2 · not as is | a zen stacked-stone cairn (spa, meditation, wellness); a stack of coins; at 16 px a three-bar hamburger-menu-like stack | stacked balancing stones (spa/wellness cairn); three floating pebbles or beans; a loose stack of coins |
| Tallyline | horizon | rejected | 5.5 | not passed | 4.4 · not as is | a swoosh/curve dropping down and trailing off into an ellipsis (loading or 'to be continued'); a hockey stick or ski-jump; a reclined L followed by two dots | a descending line flattening into an ellipsis, like 'L...' or loading; a falling cash curve that bottoms out, then dotted projection; a hockey stick or a lazy checkmark trailing off |
| Tallyline | post | rejected | 4.9 | not passed | 5.8 · not as is | a text-input cursor between two dashes (-|-); a timeline scrubber / slider handle; a minus sign, an l and a dash - a ruler tick | a lowercase t or a cross built from three loose rounded bars; a tally stroke standing on a broken baseline, with a gold segment for what comes next; a minimal chart or timeline tick marker |

## Critic vs blind judge

22 concepts reached the critique. The gate and the blind judge agreed on 19 of them (gate passed ↔ judge would present as is). Mean critic score 5.6, mean judge score 5.2.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | ok | 15.2 | 8 | 12 | 7724k / 111k | $3.48 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Developer tool | ok | 13.67 | 3 | 12 | 5687k / 100k | $3.00 of $20 | claude-sonnet-5-5, claude-opus-5-5 |
| Developer tool | ok | 16.99 | 4 | 14 | 8749k / 139k | $4.06 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Online shop | ok | 17.07 | 2 | 13 | 8810k / 140k | $3.99 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Online shop | ok | 14.86 | 4 | 14 | 8715k / 129k | $3.95 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Learning app | ok | 16.8 | 5 | 13 | 9483k / 138k | $4.15 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Multi-product family | ok | 27.74 | 7 | 15 | 16734k / 253k | $7.13 of $25 | claude-sonnet-5-5, claude-opus-5-5 |
| Mobile app | ok | 16.03 | 8 | 13 | 8876k / 118k | $3.81 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Independent SaaS | ok | 16.36 | 4 | 15 | 9616k / 123k | $4.18 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
