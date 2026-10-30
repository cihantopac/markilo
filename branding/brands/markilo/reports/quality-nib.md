# Quality report — Nib

## nib/symbol.svg (symbol)

12 pass · 1 warn · 0 fail

| | Check | Value | Notes |
| --- | --- | --- | --- |
| ✓ | Clean vector master | 0 errors, 0 warnings | Pure vector, self-contained, scalable. |
| ✓ | Legibility at 16 px | 0.88 | 88% of the shape survives at 16 px (≥ 85% reads clearly). |
| ✓ | Legibility at 32 px | 0.94 | 94% of the shape survives at 32 px (≥ 85% reads clearly). |
| ! | Thinnest detail at 16 px | 0.75 | Thin strokes/gaps are ~0.75 px wide at 16 px (≥ 1.2 px stays crisp). |
| ✓ | Optical balance | 0.02 | Visual centroid sits 6% from center, slightly high, which reads as optically centered. |
| ✓ | Artboard fit | 0.88 | Mark spans 88% of the artboard (80–98% keeps icon exports consistent). |
| ✓ | Distinct from stock primitives | 0.339 | Closest stock shape is a rounded square at 34% overlap. |
| ✓ | Construction complexity | 53 | 2 paths, 53 path commands, compactness 8.63. |
| ✓ | One-color reproduction | 0 | Shapes stay separable in a single color. |
| ✓ | Visible on its paper (#f7f5f0) | 16.55:1 | Reads on its own background (strongest color ≥ 3:1). |
| i | Contrast of #14161f | 18.04:1 light / 1.03:1 dark | Works on light grounds; use a reversed variant on the other. |
| ✓ | Contrast of #e4510b | 3.83:1 light / 4.85:1 dark | Meets the 3:1 non-text contrast guideline (WCAG 1.4.11) on light and dark grounds. |
| ✓ | Palette separation | 49.44 | Closest pair of colors differs by ΔE₀₀ 49.44. Under 20, shapes separated only by these colors blur together for many viewers; vary lightness too. |
| ✓ | Lightness contrast inside the mark | 95 | Lightness difference between brand colors (matters for grayscale print and color-vision deficiencies). |

## nib/wordmark.svg (wordmark)

4 pass · 0 warn · 0 fail

| | Check | Value | Notes |
| --- | --- | --- | --- |
| ✓ | Clean vector master | 0 errors, 0 warnings | Pure vector, self-contained, scalable. |
| ✓ | Construction complexity | 141 | 1 paths, 141 path commands, compactness 24.89. |
| ✓ | One-color reproduction | 0 | Shapes stay separable in a single color. |
| ✓ | Visible on its paper (#f7f5f0) | 16.55:1 | Reads on its own background (every color ≥ 3:1). |
| i | Contrast of #14161f | 18.04:1 light / 1.03:1 dark | Works on light grounds; use a reversed variant on the other. |

_Measured technical checks. Brand fit, memorability, cultural fit and timelessness require visual review and are recorded as judgment._
