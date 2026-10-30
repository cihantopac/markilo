# Quality report — Check M

## check-m/symbol.svg (symbol)

7 pass · 1 warn · 2 fail

|     | Check                          | Value                      | Notes                                                                                                    |
| --- | ------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| ✓   | Clean vector master            | 0 errors, 0 warnings       | Pure vector, self-contained, scalable.                                                                   |
| ✓   | Legibility at 16 px            | 0.95                       | 95% of the shape survives at 16 px (≥ 85% reads clearly).                                                |
| ✓   | Legibility at 32 px            | 0.97                       | 97% of the shape survives at 32 px (≥ 85% reads clearly).                                                |
| ✗   | Thinnest detail at 16 px       | 0.5                        | Thin strokes/gaps are ~0.5 px wide at 16 px (≥ 1.2 px stays crisp).                                      |
| ✗   | Optical balance                | 0.1                        | Visual centroid sits 10% of the artboard from center (slightly high, which reads as optically centered). |
| !   | Artboard fit                   | 0.72                       | Mark spans 72% of the artboard (80–98% keeps icon exports consistent).                                   |
| ✓   | Distinct from stock primitives | 0.583                      | Closest stock shape is a square at 58% overlap.                                                          |
| ✓   | Construction complexity        | 11                         | 1 paths, 11 path commands, compactness 3.03.                                                             |
| ✓   | One-color reproduction         | 0                          | Shapes stay separable in a single color.                                                                 |
| ✓   | Contrast of #f45d2c            | 3.26:1 light / 5.71:1 dark | Meets the 3:1 non-text contrast guideline (WCAG 1.4.11) on light and dark grounds.                       |

_Measured technical checks. Brand fit, memorability, cultural fit and timelessness require visual review and are recorded as judgment._
