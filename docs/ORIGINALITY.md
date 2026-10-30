# Originality method

Markilo's originality engine answers two questions: _does this concept look like a mark that already exists?_ and
_are our concepts actually different from each other?_ It is a design tool, not a legal opinion.

## Inputs

- The concept's symbol (or wordmark when there is no symbol), rendered with resvg at 256 px.
- Reference marks collected during research (`markilo reference add`): SVG, PNG or JPEG, any background.
- The other concepts for the same brand.
- Competitor names from the brief and references.

## Signals

| Signal            | How                                                                                                                         | Why                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Silhouette        | Ink masks cropped to their bounding box, fitted into 64×64, compared with soft IoU under all 8 rotations/reflections        | Catches copies that were moved, scaled, mirrored or rotated |
| Perceptual hashes | DCT pHash (best over the 8 transforms) and dHash, rescaled so chance agreement is 0                                         | Robust to small edits, color and rendering differences      |
| Structure         | Fill ratio, negative space, holes, components, symmetry (3 axes), compactness, aspect                                       | Same construction with different details                    |
| Color             | Mean best-match CIEDE2000 between dominant palettes                                                                         | Raises risk only when shapes already match                  |
| Genericity        | Silhouette against stock primitives (circle, ring, square, rounded square, triangle, diamond, hexagon, star, shield, cross) | Stock shapes are hard to own and easy to confuse            |
| Name              | Edit distance, Jaro-Winkler, a language-neutral sound key, consonant skeleton, shared stems                                 | Spelling and sound confusion                                |

Visual similarity = weighted shape score (silhouette 0.5, hashes 0.25, structure 0.25) × (0.92 + 0.08 × color).
Every pair is also compared without minor parts (ink regions under 6 % of the mark), so a copy that adds a small
dot or badge is still found. Risk: **high ≥ 0.78**, **review ≥ 0.62**.

## Calibration

`markilo similarity calibrate --brand <slug>` (or a folder of logos) measures the engine on real marks: every mark is
copied with six edits a copier might make and compared with its original, and every pair of different marks is
compared as a negative. Measured on the 24 distinct brands collected while Markilo researched its own identity
(Claude, Cursor, GitHub Copilot, Figma, Canva, Looka, Linear, Vercel and others; 141 copies, 276 different-mark pairs):

|                                                            | Result                                     |
| ---------------------------------------------------------- | ------------------------------------------ |
| Separation (AUC: a copy scores above a different mark)     | 0.99                                       |
| Different marks wrongly flagged review / high              | 1.1 % / 0.4 %                              |
| Copies caught at review — mirrored, rotated 90°, recolored | 100 %                                      |
| — rescaled and moved                                       | 92 %                                       |
| — small element added next to the mark                     | 75 % (was 38 % before minor-part matching) |
| — 14 % of the mark cut away                                | 50 %                                       |
| Thresholds that keep false alarms ≤ 1 % / ≤ 5 %            | 0.64 / 0.46                                |

So the review threshold (0.62) sits at about a 1 % false-alarm rate. Known blind spots: copies that cut away part of a
mark, and copies that add a large separate element (which changes the composition). Conceptual copies — the same
idea drawn differently — are not measured at all; the critic agent judges those. The reference logos are not part of
this repository; run the command on your own research to reproduce.

## Optional embedding comparator

No neural model ships with Markilo: a usable image embedder is hundreds of megabytes, platform-specific and carries its
own license. Set `MARKILO_EMBEDDER` to an executable (or a `.js`/`.mjs` script) that takes two PNG paths and prints a
similarity between 0 and 1 — for example a small local CLIP script — and it joins the combined score with weight
`MARKILO_EMBEDDER_WEIGHT` (default 0.3). Run `markilo similarity calibrate` with and without it before relying on it.
Other comparators can be registered in code with `registerComparator()` in `src/analyze/similarity.ts`.

## Evidence and verdicts

A verdict is only as good as the research behind it, so every report measures that research first
(`src/report/evidence.ts`, `EVIDENCE_CRITERIA`):

| Dimension | Minimal                      | Adequate                                                                                           |
| --------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Visual    | 3 brands, at least 1 direct  | 8 brands: ≥ 3 direct competitors, ≥ 2 category leaders or similar forms, ≥ 75 % from known sources |
| Registry  | 1 logged search for the name | 2 registries, one international (WIPO Global Brand Database or TMview), suggested classes          |
| Names     | 1 competitor name compared   | 3 competitor names compared                                                                        |

Reference marks are counted as **distinct brands**, not files: "Cursor", "Cursor icon" and "cursor (2)" are one brand
(`src/report/references.ts`). Each brand's best source is rated: the brand's own site or the competitor URL in the
brief (official), an app store listing (store), a logo catalog such as Simple Icons, svgl or Wikimedia (catalog), or
unverified. `markilo reference list` shows the grouping; `markilo reference dedupe` finds files that add nothing (near
identical files of one brand, or one artwork under two names) and `--apply` removes them, keeping the best-sourced
file. Reports list the closest file per brand.

Registry searches count only when logged with `markilo profile add-source --type registry --registry <id> --query …`.
Confidence is **high** when all three are adequate, **medium** when none is missing, otherwise **low**.

| Verdict                 | When                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `redesign`              | A reference reaches high visual similarity, or the mark is a generic stock shape                               |
| `needs-review`          | Review-level visual similarity, a review/high name risk, a logged registry conflict, or a near-primitive shape |
| `insufficient-evidence` | No conflict found, but visual or registry coverage is below minimal                                            |
| `no-conflicts-found`    | No conflict among what was collected, with at least minimal coverage                                           |

`no-conflicts-found` means exactly that: nothing conflicting was found in the evidence listed in the report.
`markilo finalize` refuses `redesign`, and accepts the other non-clear verdicts only with `--accept-risk`.

## Report

`reports/originality-<concept>.md|json` (schema `markilo/originality@2`): verdict and confidence, the evidence table
with what is missing for the next level, research scope with sources and retrieval dates, per-reference signal
breakdown, side-by-side overlay images for flagged pairs, genericity, concept diversity, name comparison with
pronunciation notes and logged registry conflicts, Nice class suggestions and official registry entry points, and
limitations.

## Limitations

- Only references that were collected are compared. Coverage is listed in every report.
- Conceptual similarity (the same idea drawn differently) is not measured. The critic agent and the user judge it.
- No results is not evidence of uniqueness or registrability.
- Registry searches are not automated (terms of service); they are planned and logged.
- Not legal advice. Consult a trademark attorney before adopting a brand.
