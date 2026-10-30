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
Risk: **high ≥ 0.78**, **review ≥ 0.62**. Calibration fixtures live in `tests/fixtures/marks/`: a mirrored copy scores
0.99, a recolored and re-proportioned copy ~0.81, unrelated marks 0.12–0.34.

Extra comparators (for example an embedding model) can be registered with `registerComparator()` in
`src/analyze/similarity.ts` and are weighted into the shape score.

## Evidence and verdicts

A verdict is only as good as the research behind it, so every report measures that research first
(`src/report/evidence.ts`, `EVIDENCE_CRITERIA`):

| Dimension | Minimal                              | Adequate                                                                                  |
| --------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Visual    | 3 reference marks, at least 1 direct | 8 references: at least 3 direct competitors and 2 category leaders or similar-form marks  |
| Registry  | 1 logged search for the name         | 2 registries, one international (WIPO Global Brand Database or TMview), suggested classes |
| Names     | 1 competitor name compared           | 3 competitor names compared                                                               |

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
