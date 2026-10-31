# Markilo 1.0.0 on the sealed 1.0 holdouts (commit 560ecfc, before the version bump)

5 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| AI assistant (holdout) | 1 | 1 of 1 | 0 of 1 | 24.9 | $8.39 |
| Coffee roaster (holdout) | 1 | 0 of 1 | 0 of 1 | 27.1 | $10.31 |
| Energy cooperative (holdout) | 1 | 0 of 1 | 0 of 1 | 27.6 | $8.11 |
| Outdoor gear (Turkish name) (holdout) | 1 | 0 of 1 | 0 of 1 | 31.7 | $9.46 |
| Health app (holdout) | 1 | 0 of 1 | 0 of 1 | 20.9 | $7.69 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI assistant | Quorvo | yes | 3/4 | 1/4 | knot · 6.2 | 5.7 · not as is | 15/0/0 | insufficient-evidence | 155 |
| Coffee roaster | Emberwick | no | 5/6 | 0/6 | — | — | — | — | 0 |
| Energy cooperative | Sunvale | no | 4/5 | 0/5 | — | — | — | — | 0 |
| Outdoor gear (Turkish name) | Göçebe | no | 5/5 | 0/5 | — | — | — | — | 0 |
| Health app | Kinetra | no | 3/5 | 0/5 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: panel opus:2,sonnet:2.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quorvo | circled | rejected | 5.1 | not passed | 5.1 · not as is | the word quorvo with two hand-circled clay o's; a refresh/reload arrow glyph in each o; the icon reads VO / v0 (Vercel's AI product) - unfortunate: a loading or retry spinner | a lowercase grotesk wordmark with two terracotta o's drawn as looping refresh/undo arrows; a cycle or 'loop back' symbol, possibly hinting at recurring meetings; a 'vo' monogram that reads as a syllable rather than as Quorvo |
| Quorvo | handoff | rejected | 5.5 | not passed | 5.4 · not as is | a lowercase n fused to a v (the letters rv, or a stylised N); Greek nu / an N monogram for a brand starting with N; a stock geometric-sans wordmark with one ligature - unfortunate: 'RV' or an N-brand, i.e. the icon names a letter that is not in the brand's initial | geometric lowercase sans wordmark with a joined 'rv' ligature; the icon reads as 'nv' or 'rv' letters, or maybe a stylised 'N'; a warm terracotta tech brand, calm but generic |
| Quorvo | knot | approved | 6.2 | passed | 5.7 · not as is | a lowercase q drawn as a looped cord with the stem passing under; a shepherd's crook or cane with a curled tail; a rotated question mark or a 9 (unfortunate: at 16 px a smudged '?' or pig's-tail squiggle) | a lowercase q tied as a loop of rope; a cane, or a hook with a decorative curl; a calligraphic swash or ampersand-like flourish |
| Quorvo | pushed-in | dropped at sketch review | — | — | — | sketches: s6 a hat brim with a crown, or a sunrise over a sagging horizon; 16 px a dash with a dot | — |
| Emberwick | counters | rejected | 5.3 | not passed | 5.8 · not as is | a stock bold serif wordmark (Fraunces/Young Serif style) with nothing visible at 12-24 px; a lowercase e with a rock or pebble lodged in its eye; a lowercase e whose counter holds a little hill/mound (unfortunate: mountain, which the brief bans, or a stain/rendering glitch) | heavy, warm serif wordmark with a small rust-coloured pebble sitting in the eye of the e; a glowing coal or ember lodged in the letter; a rock or gemstone in a letter, which could just as easily be a geology or jewellery brand |
| Emberwick | inktrap | dropped at sketch review | — | — | — | sketches: s1 a W split by a slot, a VV or a W with a keyhole; s2 a W with an egg-shaped hole punched in the joint; s3 a W with a diamond bitten out; s4 a dripping or stencilled W with paint drops at the joints | — |
| Emberwick | ligature | rejected | 5.5 | not passed | 5.5 · not as is | the word emberwick set in a soft display serif (Fraunces/Recoleta family), ligature barely noticed; the letters 'rw' as an icon, read as unexplained initials or 'IW'; a Unix read-write flag / .rw (Rwanda) domain - unfortunate: initials that are not the brand's | a sturdy bookish serif wordmark with a strange ink-blot where the r and w meet; melted wax or a dripping join, a loose nod to 'wick'; a lowercase 'rw' monogram that doesn't match the brand's initials |
| Emberwick | plait | rejected | 5.5 | not passed | 5.2 · not as is | a W monogram with interlaced gaps; V and J overlapping (VJ); two checkmarks / tick strokes | interlaced W monogram; V and J letters (or VW) overlapping; folded ribbon or strap |
| Emberwick | sort | rejected | 5.8 | not passed | 5.8 · not as is | a numeral 9 (or a schwa) knocked out of a rectangle; a price tag or luggage ticket with a notch; a document/clip-art label icon | the number 9 on a terracotta tag; a rotated lowercase e (schwa ə) on a bag label; a notched coffee-bag or price tag |
| Emberwick | wickmark | rejected | 4.5 | not passed | 4.7 · not as is | the word 'emberwr-ck' / 'ember wreck' - the i reads as an r plus a dash; a candy cane or walking-stick hook next to a pebble; a lowercase r and a rock | the word 'emberwrck': the hooked 'i' reads as an 'r'; a candy cane or walking-stick hook beside an orange rock chip; a bent candle wick with an ember |
| Sunvale | daylight-ring | dropped at sketch review | — | — | — | sketches: s1 letter O / donut; s2 same O, off-centre counter invisible at 16 px; s3 C-clip / omega / ring with a slot (horseshoe-ish), the only non-O but reads as a hardware clip; s4 squircle washer / app-icon donut; s5 thick O, counter shift unreadable | — |
| Sunvale | held-light | rejected | 6.4 | not passed | 6.2 · not as is | a V cradling a dot / a person with arms raised cheering; a funnel or cup holding a ball; a down-pointing chevron with a bead | a stick figure with raised arms, the stock 'community/charity' person icon; an orange sun or ball held in a cupped V, like hands or a valley; a clean navy-and-orange geometric sans wordmark with one special letter |
| Sunvale | many-suns | rejected | 5.3 | not passed | 6.0 · not as is | a wifi / broadcast signal icon in a disc; a snail shell or ear; an eclipsing planet with rings | orange disc with a signal/broadcast ripple in the corner; eye or target peeking out of a ball; sunrise of nested suns |
| Sunvale | sun-s | rejected | 5.0 | not passed | 5.4 · not as is | a head over a squiggle - a user/person glyph; the bottom half of an S or a 3 with a ball on top; a lowercase i with a curled tail (or a script glyph) | generic person/user icon (orange head over a navy swoosh body); sun setting into a cupped hand or valley curve; awkward backwards 'S' or '3' glyph |
| Sunvale | sunk-u | rejected | 5.6 | not passed | 5.5 · not as is | a heavy bold 'sunvale' with one orange filled u, like a bowl or horseshoe magnet; symbol: a notched block with a smile bar beneath, a cartoon face or robot/mask; a tooth or a toilet seen head-on (unfortunate) | a chunky rounded wordmark with one orange letter swapped in as a filled bowl, like a sun sinking into a valley; the standalone symbol reads as a notched block over a smile curve, like a toilet, a monitor on a stand or a cartoon face; a friendly startup or delivery-app logotype |
| Göçebe | dikis | rejected | 5.6 | not passed | 5.7 · not as is | a startled cartoon face with eyebrows (owl/emoji); a bold geometric ö; a bagel or donut with two sprinkles. Unfortunate: a shocked/angry face emoji | a rounded geometric lowercase sans wordmark in rust red with oversized hexagonal diacritics; an ö symbol that reads like a surprised face with eyebrows, or a cartoon character; the diacritics read as rivets or leather patches, not stitches |
| Göçebe | dugum | rejected | 5.2 | not passed | 5.3 · not as is | a steaming bowl / hot-spring sign; interlaced rings or a Celtic-style knot; a coiled snake. Unfortunate: the onsen/hot-food steam symbol - reads like a restaurant or spa | a tied rope or cord knot; a loose interlaced 'ç/ö' or 'G' monogram; a stylised hook or snake coiling |
| Göçebe | heybe | rejected | 6.0 | not passed | 5.5 · not as is | a domino/eye mask or pair of goggles; a bra (unfortunate for an apparel brand); an old telephone handset / balance scale, with playing-card diamonds | a pair of eyeglasses or goggles; a saddlebag (heybe) with two pouches and kilim diamonds; an old telephone receiver or a bull's head/mask |
| Göçebe | iplik | rejected | 6.1 | not passed | 5.7 · not as is | a stethoscope; a C with a curled tail (ç cedilla flourish); a fish hook or shepherd's crook. Unfortunate: a stethoscope - reads as a health/clinic brand | a monoline letter ç whose cedilla is drawn out into a looping tail; a C sitting on top of a lowercase b or the number 6; a hook or a loose piece of thread |
| Göçebe | kordon | rejected | 4.7 | not passed | 5.9 · not as is | a lowercase g with its descender cut off (split-g monogram); a hook or S-hook / carabiner; a geometric-sans fintech or app logo | a geometric lowercase 'a' with a separate S-shaped hook below, like 'a6' or an ampersand; a loose cord or rope loop hanging off the g; a generic geometric-sans tech wordmark with one quirky letter |
| Kinetra | joined-it | rejected | 5.4 | not passed | 5.6 · not as is | a geometric-sans 'kinetra' whose i-dot has become a ball at the end of a thrown arc (bouncing-ball tittle); the detached icon as a lowercase 'r' or desk lamp; a little figure bending forward in a stretch (stick-figure/body imagery the brief avoids) | an 'i' whose dot leaps up in a bouncing arc; a ball being thrown or a comet trail; a tadpole or sperm shape over a separate stem |
| Kinetra | pendulum-k | dropped at sketch review | — | — | — | sketches: s1 a rounded k whose leg kicks a ball - a footballer's leg (body imagery, sporty) and a stock k with dot terminal; s2 'I/' or 'l,' - the k split into stem and detached arm, the name's initial with a cut; s3 a checkmark / letter v with a dot (UI check, different letter); s4 a plain rounded K in a stock font, generic monogram | — |
| Kinetra | stride | dropped at sketch review | — | — | — | sketches: s1 two scattered rounded tiles (a window/app-grid fragment); s2 the duplicate/copy icon - two identical rounded squares on a diagonal, a UI glyph; s3 a tombstone with a smaller tombstone - flat-based dome is a gravestone, fatal for a physio audience; s4 a lid popping off a box / unboxing - the only one with motion, but it reads as burst-open, not a reassuring step; s5 two capsules/pills - medication, the clinical cue the brief avoids | — |
| Kinetra | swing | rejected | 5.9 | not passed | 5.8 · not as is | a letter K broken into three pieces (stem plus two petal strokes); a figure in a lunge or kneeling stride, close to a stick-figure body; a sprouting leaf or flower opening from a stem. Unfortunate: a person collapsing onto a knee / falling, which for injury recovery is the wrong picture | abstract K built from three rounded capsule strokes; a leg bending at the knee, like a progressive range-of-motion sequence; lowercase 'lk' letters or toppling dominoes |
| Kinetra | tempo | rejected | 5.5 | not passed | 5.6 · not as is | a metronome (music-app icon); a UI slider/fader knob on a track; at 16-32 px a warning triangle with an exclamation mark -- the unfortunate one for an injury-recovery app | metronome with its pendulum swung to one side; audio fader or mixer slider; a dumbbell or knob on a rod against a tilted pyramid |

## Critic vs blind judge

20 concepts reached the critique. The gate and the blind judge agreed on 19 of them (gate passed ↔ judge would present as is). Mean critic score 5.5, mean judge score 5.6.

## Gate precision and recall

- Precision (gate passes the judge would present): 0 of 1 (95 % interval 0–79 %)
- Recall (judge-presentable concepts the gate passed): —

### Judge panel

| Judge | Concepts | Would present (majority of its looks) | Agrees with the gate |
| --- | --- | --- | --- |
| opus | 20 | 0 | 19 of 20 |
| sonnet | 20 | 1 | 18 of 20 |

The two judges agree with each other on 19 of 20 concepts.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AI assistant | ok | 24.87 | 13 | 22 | 14823k / 192k | $8.39 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Coffee roaster | ok | 27.1 | 9 | 21 | 20017k / 293k | $10.31 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Energy cooperative | ok | 27.63 | 8 | 16 | 15160k / 221k | $8.11 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Outdoor gear (Turkish name) | ok | 31.72 | 9 | 17 | 18375k / 278k | $9.46 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Health app | ok | 20.87 | 6 | 20 | 12355k / 197k | $7.69 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
