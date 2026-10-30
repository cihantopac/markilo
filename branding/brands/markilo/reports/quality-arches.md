# Quality report — Arches

## arches/symbol.svg (symbol)

11 pass · 1 warn · 0 fail

|     | Check                              | Value                       | Notes                                                                                                                                             |
| --- | ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✓   | Clean vector master                | 0 errors, 0 warnings        | Pure vector, self-contained, scalable.                                                                                                            |
| ✓   | Legibility at 16 px                | 0.93                        | 93% of the shape survives at 16 px (≥ 85% reads clearly).                                                                                         |
| ✓   | Legibility at 32 px                | 0.95                        | 95% of the shape survives at 32 px (≥ 85% reads clearly).                                                                                         |
| ✓   | Thinnest detail at 16 px           | 1.88                        | Thin strokes/gaps are ~1.88 px wide at 16 px (≥ 1.2 px stays crisp).                                                                              |
| ✓   | Optical balance                    | 0.04                        | Visual centroid sits 4% of the artboard from center.                                                                                              |
| !   | Artboard fit                       | 0.78                        | Mark spans 78% of the artboard (80–98% keeps icon exports consistent).                                                                            |
| ✓   | Distinct from stock primitives     | 0.38                        | Closest stock shape is a square at 38% overlap.                                                                                                   |
| ✓   | Construction complexity            | 16                          | 1 paths, 16 path commands, compactness 5.96.                                                                                                      |
| ✓   | One-color reproduction             | 0                           | Shapes stay separable in a single color.                                                                                                          |
| i   | Contrast of #14161f                | 18.04:1 light / 1.03:1 dark | Works on light grounds; use a reversed variant on the other.                                                                                      |
| ✓   | Contrast of #f45d2c                | 3.26:1 light / 5.71:1 dark  | Meets the 3:1 non-text contrast guideline (WCAG 1.4.11) on light and dark grounds.                                                                |
| ✓   | Palette separation                 | 52.74                       | Closest pair of colors differs by ΔE₀₀ 52.74. Under 20, shapes separated only by these colors blur together for many viewers; vary lightness too. |
| ✓   | Lightness contrast inside the mark | 110                         | Lightness difference between brand colors (matters for grayscale print and color-vision deficiencies).                                            |

_Measured technical checks. Brand fit, memorability, cultural fit and timelessness require visual review and are recorded as judgment._
