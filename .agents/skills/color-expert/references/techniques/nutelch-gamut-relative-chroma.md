# nutelch — Gamut-Relative Chroma in OKLCH / LCH

**Source:** [GitHub — meodai/nutelch](https://github.com/meodai/nutelch)
**Author:** meodai
**License:** MIT
**Credit:** Core idea (chroma relative to the gamut cusp) and guidance by Matt DesLauriers (mattdesl)

## What It Does

Chroma relative to the gamut **shell** (the cusp) in OKLCH / LCH: say "halfway to the boundary" (`relC: 0.5`) at any lightness and hue. A *nut* is a "Schalenfrucht" — it has a hull; so does a perceptual color space.

**Dependency-free at runtime**: gamut boundaries are precomputed into compact **adaptive LUTs** (culori is a build-time dependency only) and looked up with bilinear interpolation. It is the gamut engine behind [CuspHanger](cusphanger-gamut-triangle-palettes.md).

## Where It Sits: Between OKLCH and OkHSL

OkHSL/OkHSV (Ottosson's picker spaces) solve a real problem: in raw OKLCH, the same chroma value means different things at different lightnesses and hues, and there's no way to say "as saturated as this hue can get here" without computing the gamut boundary. But they solve it by defining a whole new space — toe-remapped lightness, a curved saturation model (C₀/C_mid/C_max), runtime gamut math, sRGB-only, and output you must convert out of.

nutelch borrows **one** idea from OkHSL — chroma measured as a fraction of the per-lightness gamut boundary — and keeps **everything else** from OKLCH:

|                  | OKLCH                | **nutelch**                               | OkHSL                              |
| ---------------- | -------------------- | ----------------------------------------- | ---------------------------------- |
| **Chroma**       | absolute `C` (gamut-blind) | **`relC` × cusp — boundary-relative, _linear_** | `s` — boundary-relative, _curved_ (C₀/C_mid/C_max) |
| **Lightness**    | raw OKLab `L`        | **raw OKLab `L`**                          | toe-remapped (`Lr`)                |
| **Hue**          | raw `H`              | **raw `H`**                               | raw `H`                            |
| **Output**       | CSS `oklch()`        | **CSS `oklch()`**                         | needs conversion                   |
| **Gamuts**       | gamut-agnostic       | **sRGB + Display-P3** (OKLCH & LCH LUTs)  | sRGB only                          |
| **Speed**        | instant (gamut-blind) | **fast (LUT lookup)**                    | slowest (runtime gamut math)       |
| **Out of gamut** | allowed              | **allowed (overshoot)**                   | clamped to `[0, 1]`                |

So nutelch is **OKLCH with exactly one OkHSL property grafted on**: "saturation" that means the same thing at every L and H, and never *accidentally* lands out of gamut — without OkHSL's other opinions (the lightness toe, the nonlinear saturation curve, the picker geometry).

**Why it's faster and lighter than OkHSL/OkHSV:**

- **Precomputed, not solved at runtime** — OkHSL/OkHSV run gamut math (cusp finding, the curved saturation model) per conversion; nutelch does a bilinear LUT lookup plus a small binary search.
- **No conversion layer** — a nutelch result *is* `{ mode: 'oklch', l, c, h }`; hand it straight to CSS `oklch()`. OkHSL/OkHSV values must be converted out through the full transform chain.
- **Zero runtime dependencies**, side-effect-free, tree-shakeable — import only the LUTs you use (the adaptive OKLCH/sRGB LUT is ~19 KB).
- **Opt-in complexity** — OkHSL's toe and curved response are available when wanted (`toe`/`toeInv`, easing), rather than baked in.

## API

```js
import { cusp, relch, peak, reach, toCss, toLab, oklchSrgb, lchP3 } from 'nutelch';

// Max in-gamut chroma at L=0.6, H=30 in OKLCH/sRGB — the shell point:
cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.12…, h: 30 }

// Chroma as a fraction of the way to the shell:
relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 });

// CSS out:
toCss(relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 })); // "oklch(0.6 0.06 30)"

// The cusp — most chromatic color of a hue (peak of the shell over all L):
peak({ lut: oklchSrgb, h: 30 }); // carries its own .l

// reach: the OkHSV-flavored complement — slides L and C together along the
// ray from a gray anchor toward the cusp (a perceptual "shade line"):
reach({ lut: oklchSrgb, l: 0.3, reach: 1, h: 30 });   // === peak (the cusp)
reach({ lut: oklchSrgb, l: 0.3, reach: 0.5, h: 30 }); // halfway from gray L=0.3 to the cusp
```

- `cusp({ lut, l, h })` — shell color at `(l, h)`; `.c` is the max in-gamut chroma **at that lightness**.
- `relch({ lut, l, relC, h })` — resolves `relC` (0..1 to the shell; overshoot allowed). Holds `l`, scales chroma. This is the OkHSL-saturation analog.
- `peak({ lut, h })` — the hue's **cusp** over all lightness (distinct from `cusp()` at one `l`).
- `reach({ lut, l, reach, h })` — saturation along the gray→cusp ray; moves `l` and `c` together. The OkHSV-flavored analog. **Not a strict gamut guarantee**: constant-hue slices aren't perfectly convex, so the straight ray can bulge slightly out (worst measured ≈ 0.024 chroma near white) — check `cusp()` at the result's `L` if you need one.
- `toCss(color)` / `toLab({l,c,h})` — CSS string in the color's own space / rectangular `{l,a,b}`.
- `toe(x)` / `toeInv(x)` — Ottosson's lightness toe and inverse (the OkHSL `Lr` remap), opt-in. Feed `toeInv(Lr)` to `l` for OkHSL-aligned, perceptually even lightness ramps (raw OKLab `L` is not perceptually even for picking lightness, especially in the darks).
- `smoothstep(x)` — the one shipped easing curve; responses are linear by design, remap inputs yourself for curved feels.

LUTs are named `<space><Gamut>`: `oklchSrgb`, `oklchP3` (L 0..1), `lchSrgb`, `lchP3` (L 0..100). The LUT carries the space and gamut; input is always cylindrical, `H` wraps.

## Adaptive LUTs — Why the Grid Is Non-Uniform

The gamut shell isn't equally complex everywhere: constant-hue slices rise to a sharp cusp; max chroma spikes near the primaries. A uniform grid **overshoots across sharp cusps** — at OKLCH/sRGB blue (L≈0.45, H≈264) a uniform 65×256 grid reported C≈0.288 where the true boundary is ≈0.261. The adaptive LUT places grid lines by boundary curvature (dense at cusps, sparse where near-linear), measured against culori ground truth:

| representation               | worst overshoot | worst undershoot | size   | lookup speed |
| ---------------------------- | --------------: | ---------------: | -----: | -----------: |
| uniform 65×256 (old)         | ~8.5%           | ~−10.7%          | 33 KB  | 1.00×        |
| cusp-triangle (Ottosson)     | ~9.7%           | safe             | 2 KB   | 6× faster    |
| uniform 129×1024             | ~1.8%           | ~−5.9%           | 264 KB | 1.00×        |
| **adaptive 49×192 (chosen)** | **~2.9%**       | **~−2.4%**       | **19 KB** | **~1.1×** |

Adaptive cuts the dangerous overshoot ~3× **and** shrinks the LUT; matching that accuracy uniformly would take ~8× the bytes. CIE LCH keeps a uniform grid (its gamut is broadly curved everywhere, so adaptivity starves the smooth bulk). Honest caveat: sRGB is slightly non-convex at the blue corner — the true max chroma is near-discontinuous over a <0.02° hue band that no finite linear LUT (or OkHSL) resolves; nutelch leaves it as a tiny safe *undershoot*. Practical worst-case boundary error for the OKLCH LUTs: **±0.009**.

## When to Reach for It

- **"75% saturated" that means the same thing everywhere** — perceptually consistent chroma knobs in generative art, ramps, theming — while staying in plain `oklch()`.
- **Avoiding the classic OKLCH clipping mistake** (asking for chroma the gamut doesn't have) *by construction* instead of by after-the-fact gamut mapping.
- **P3-aware saturation** — OkHSL can't; nutelch just takes the `oklchP3` LUT.
- As the gamut engine for palette models — see [CuspHanger](cusphanger-gamut-triangle-palettes.md).
- Not for: color interchange/conversion (use [Culori](culori-color-spaces-api.md)) or contrast math.

## Connection to Other References

- **[CuspHanger](cusphanger-gamut-triangle-palettes.md)** — builds Wijffelaars-model palettes on nutelch's LUTs (`cusp`/`maxChromaAt`).
- **Ottosson's OKLAB / OkHSL-OkHSV articles** (`contemporary/`) — the source of the boundary-relative-saturation idea, the toe, and the cusp-triangle approximation nutelch benchmarks against.
- **[Culori](culori-color-spaces-api.md)** — build-time ground truth for the LUTs; runtime companion for hex/gamut checks.
- **[HSLuv](hsluv-better-than-hsl.md)** — the same "normalized saturation" goal a generation earlier, in CIELUV.
