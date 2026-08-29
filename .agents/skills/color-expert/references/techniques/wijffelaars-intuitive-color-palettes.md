# Generating Color Palettes using Intuitive Parameters

**Authors:** Martijn Wijffelaars, Roel Vliegen, Jarke J. van Wijk, Erik-Jan van der Linden
**Affiliations:** MagnaView BV / Eindhoven University of Technology (the Netherlands)
**Published:** Computer Graphics Forum 28(3), 743–750 — EuroVis 2009
**DOI:** [10.1111/j.1467-8659.2009.01342.x](https://doi.org/10.1111/j.1467-8659.2009.01342.x)
**PDF:** [local](pdfs/wijffelaars-2009-intuitive-color-palettes.pdf) (gitignored)

## What It Is

The foundational algorithm for **synthesizing lightness-ordered data-visualization palettes from a handful of intuitive parameters**, instead of hand-picking color keys. It produces palettes with the perceptual quality of hand-made Brewer (ColorBrewer) palettes, but as *exact specifications* for any number of colors — including continuous ramps. Implemented in MagnaView and the companion **PaletteView** color-space explorer.

## The Three Requirements (Trumbo / Levkowitz / Brewer)

A proper univariate ordered palette must satisfy all three — the rainbow colormap fails all of them:

1. **Perceived ordering** — colors read as a sequence.
2. **Representative distances** — perceived color distances match the intended data distances.
3. **Equal importance** — no color jumps out as more salient than its neighbors.

## Key Ideas

- **Work in CIELUV (LCHuv), not HSV/HSL.** HSL is perceptually non-uniform: equal-lightness colors don't look equally light; equal hue steps aren't equal. CIELUV is recommended for additive/light viewing; CIELAB for reflected light.
- **Curves, not line segments.** Sampling straight lines through color space can't use the full lightness range (max contrast forces a gray axis), and bent segments create first-derivative discontinuities that violate equal importance. A smooth Bézier curve avoids both.
- **MSC — Most Saturated Color of a hue.** Every hue's most saturated displayable color lies on an edge of the RGB cube (one channel at 0, one at 1, one variable). The triangle spanned by **black, white, and the MSC** approximates the displayable color slice of that hue. Building the path inside this triangle keeps colors in gamut with little clamping — and clamping is what causes the irregularities the method avoids.

## The Model

**Single-hue sequential** (paper Table 1): the path `C_seq` is two quadratic Bézier curves through control points derived from `p0 = LCHuv(0,0,h)` (black), `p1 = MSC(h)`, `p2 = LCHuv(100,0,h)` (white). Sampled at uniform color-distance intervals to get N colors.

Intuitive control parameters:

| Param | Meaning | Default |
| ----- | ------------------------------ | ------------------------ |
| **N** | number of colors (∞ = continuous) | — |
| **h** | main hue | — |
| **s** | saturation (curve tension: 0 = straight black→white, 1 = bends through MSC) | 0.6 |
| **b** | brightness (start position of the curve) | 0.75 |
| **c** | lightness contrast (length of the curve) | min(0.88, 0.34 + 0.06·N) |

**Multi-hue & diverging** (paper Table 2): extends the single-hue model by shifting the top point `p2` toward a **bright point `p_b`** (defined as yellow). A **`w` (cold/warm)** parameter controls how close `p2` moves to `p_b` — because yellows can be saturated only at high lightness, pulling toward yellow makes light colors warmer/brighter. Out-of-triangle results are projected back to the displayable surface preserving lightness and hue. Diverging palettes = two sequential palettes concatenated at a shared neutral point (white/gray, or moving toward `p_b` as `w` grows).

## The Custom Distance Function `L`

CIE's standard distance metrics (ΔE*uv, CIE94, CIEDE2000) did **not** give satisfactory uniform sampling for this palette definition. The authors introduce a distance function **`L`** that uses only the **L (lightness) component** — the dominant perceptual cue for ordering — and warps space so palette colors are pulled closer together in CIELUV when their lightness is high and pushed apart when lightness is low. This matches the observation that Brewer palettes don't increase linearly in CIELUV lightness: their lighter colors sit closer together than the darker ones.

## Why It Matters

- **Exact specs, not guidelines** — most prior work (PRAVDAColor, Brewer, Zhang & Montag) gave rules or finite sets; this gives a parametric model that adapts to any N and any visualization constraint (e.g. guarantee white text stays legible by restricting the lightness range).
- **Foundational** for parametric perceptual-palette tooling that came after it; same lineage as ColorBrewer (hand-made reference) and viz colormap research.
- A **user study** rated generated palettes as aesthetically equivalent to hand-picked Brewer palettes; a low `w` (~0.25) scored best, and blue palettes rated highest.

## Connection to Other References

- **[CuspHanger](cusphanger-gamut-triangle-palettes.md)** — a faithful implementation of this exact model re-expressed in OKLCH (instead of CIELUV), targeting sRGB and Display-P3, with a RampenSau-compatible API.
- **[Cubehelix](cubehelix-color-scheme.md)** — same goal (monotonic-lightness ordered colormaps) via a helix in RGB; Wijffelaars instead builds Bézier curves in perceptual CIELUV with intuitive knobs.
- **[Gao — Palette Generation Review](../contemporary/gao-color-palette-generation-review.md)** — surveys the broader image-derived palette field this method predates.
- **[HSLuv](hsluv-better-than-hsl.md)** — also normalizes CIELUV chroma per hue/lightness; shares the "HSL is non-uniform, fix it in CIELUV" premise.
- **[Bruce Lindbloom — Color Math](brucelindbloom-color-math.md)** — the RGB↔XYZ↔LUV conversion math the model relies on.
