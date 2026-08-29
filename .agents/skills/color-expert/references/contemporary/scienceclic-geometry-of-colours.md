# The "Geometry" of Colours — ScienceClic

**Source:** [ScienceClic English — "The 'Geometry' of Colours"](https://www.youtube.com/watch?v=7KYwi2F5Ce4) (Alessandro Roussel, narrated by Octave Masson, ~20 min, 2025)
**Companion experiment:** [colors2.alessandroroussel.com](http://colors2.alessandroroussel.com/) — crowdsourced "which of these three is different?" game that reconstructs MacAdam-style discrimination ellipses from 1M+ samples.

A single cohesive narrative that walks the entire history of color spaces as a *geometry* problem: from the 1D spectrum, through Newton's circle and the cone, to Helmholtz's distortion, CIE XYZ, the optimal solid, opponent/perceptual atlases (Munsell), CIELAB, and OKLab — closing on non-Euclidean proposals (Schrödinger) and OLO. Excellent "spine" reference that ties together many of the standalone files below.

## The progression of color spaces (the through-line)

The video's organizing idea: each historical color space is a *geometry* that tries to make perceptual facts into spatial relationships (distance, direction, mixing). Each one fixes a flaw in the previous.

1. **Visible spectrum — 1D.** The only "pure" colors: one wavelength each, red→blue-violet. Infrared/ultraviolet lie just outside human detection.
2. **Add saturation — 2D.** Mixing spectral *lights* (additive synthesis, superimposing — not paint) makes colors "less pure, closer to white." Saturation = how vibrant/close to the spectrum a color is. Purples are *non-spectral*: only obtainable by mixing the two ends.
3. **Newton's circle (1666→).** Close the diagram into a ring with white at center; mixing two lights lands *halfway between* the points; complementaries sit opposite across white (yellow + indigo → white). A clean predictive model — but only an approximation.
4. **The cone — 3D.** Add a light-intensity axis (white→black) to get grays and "dark" colors (gray = dark white, brown = dark orange). Hue, brightness, saturation become geometric. Other 20th-c. variants: spheres, cubes, triangles, double cones.
5. **Helmholtz's distortion.** Newton's circle is geometrically wrong: red+yellow gives an *almost pure* orange (not pale), and equal-intensity yellow+indigo doesn't make white (needs *more yellow*, since the eye is more sensitive to medium wavelengths — yellow looks brighter than indigo). Stretching/flattening the diagram to fix mixing accuracy yields the **horseshoe** shape. → see [macadam-ellipses-jnd](macadam-ellipses-jnd.md), [bujack-non-riemannian-color-geometry](bujack-non-riemannian-color-geometry.md)
6. **CIE XYZ (1931).** A vector space where colors *add like vectors* to compute mixtures; extends to infinity for arbitrarily intense light. → see [cie-1931-standard-observer](cie-1931-standard-observer.md)
7. **The optimal color solid.** Cap each wavelength's energy → a finite volume containing every observable color up to a luminosity. Its boundary holds the most vivid shade of each hue. Two sharp black↔white edges: **black–red–yellow–white** ("warm") and **white–cyan–blue–black** ("cool") — the gradients you see at a prism's fringes where wavelengths aren't fully separated. → see [pointers-gamut-real-surface-colors](pointers-gamut-real-surface-colors.md) for the realizable-surface subset.

## Why physical spaces ≠ perception

XYZ and the optimal solid are mathematically faithful for *mixing*, but their **distances do not match perceived differences** — blue/yellow hues look more compressed than greens; colors that are far apart can look nearly identical.

- **MacAdam ellipses (1942).** The video crowdsourced a reproduction (the companion game) on 1M+ samples: regions of statistically indistinguishable colors plot as **ellipses of varying size and orientation** across the diagram — direct proof XYZ isn't perceptually uniform. Around blue it's easier to discriminate in one direction than another. → see [macadam-ellipses-jnd](macadam-ellipses-jnd.md)
- **Opponent / psychological approach (Goethe, Hering).** Organize color directly from sensation via fundamental *oppositions*: black↔white, red↔green, yellow↔blue. Now considered valid — retinal cells really do transform R/G/B cone signals into opponent signals. → see [opponent-process-color-blindness](opponent-process-color-blindness.md)
- **Munsell atlas (early 20th c.).** Irregular geometry that models perception: different hues peak in saturation at different brightness levels (yellow reads lighter, blue darker), and some hues max out more vivid than others (magenta > turquoise). → see [munsell-hue-value-chroma](../historical/munsell-hue-value-chroma.md)

## Psychophysics → CIELAB → OKLab

- **Weber–Fechner law.** A linear physical black→white gradient looks *non-linear*: equal physical steps are more noticeable in dark regions than light. Perceived brightness is a non-linear (compressive) function of physical luminance.
- **Apply the correction per-axis** → a perceptually uniform distribution; gradients become smoother and more regular. This is the founding principle of **CIELAB (CIE, 1976)** — built on the opponent interpretation (black/white, red/green, yellow/blue). → see [bjorn-ottosson-oklab-articles](bjorn-ottosson-oklab-articles.md)
- **OKLab (Björn Ottosson, 2020).** A more precise alternative; geometry resembles a *deformed droplet / inclined double cone*, designed to match perceived distances. A subset corresponds to what a standard screen can display. A color picker in OKLab vs a traditional one: varying hue at fixed lightness keeps text readability roughly constant — the practical payoff of a perceptual space. → see [oklab-perceptual-color-space-minecraft](oklab-perceptual-color-space-minecraft.md)

## Vision, displays, and individual differences (the "your colors aren't accurate" parenthesis)

- **3 cones → 3 dimensions.** L/M/S cones react to long/medium/short wavelength ranges (roughly R/G/B); the brain builds perceived color from 3 signals — which is *why every color space is 3D* (RGB, or HSB). → see [how-eyes-turn-light-into-color](how-eyes-turn-light-into-color.md)
- **Displays can't show everything.** A monitor mixes 3 primaries → an sRGB triangle/cube; fine for most images but misses very vivid colors (e.g. a sunset). Surroundings (day vs night) also shift perception.
- **Color blindness (~5%, mostly men, genetic).** Missing/deficient receptors collapse the perceived space to 2D or even 1D, each CVD type its own reduced space. → see [opponent-process-color-blindness](opponent-process-color-blindness.md)
- **Ladd-Franklin's evolutionary theory.** Color vision built up in stages: light/dark first → yellow/blue (long vs short) → red/green (long vs medium); distant ancestors had a 4th UV dimension (kept by many animals). Mammals lost two dimensions hiding under the dinosaurs (a tiger stays camouflaged to dichromatic prey); trichromacy re-emerged in primates. A few **tetrachromat** humans (a 4th cone between R and G) exist — notably some women in northern England. → see [elizabeth-lewis-1931-color-wheel](../historical/elizabeth-lewis-1931-color-wheel.md), [bird-color-theory-hue-circuits](bird-color-theory-hue-circuits.md)

## Open frontier

- **Non-Euclidean color space.** Schrödinger (early 20th c.) and others argue the color metric is *curved* — like spacetime in general relativity — or needs an entirely new kind of geometry. → see [bujack-non-riemannian-color-geometry](bujack-non-riemannian-color-geometry.md), [koenderink-3d-metric-field-rgb](koenderink-3d-metric-field-rgb.md)
- **OLO (April 2025).** Lasers stimulate *only* M-cones — impossible under natural light, since no wavelength activates M alone (the ranges overlap). Reported as a brand-new, hyper-saturated turquoise outside the normal space. → see [olo-newly-discovered-color](olo-newly-discovered-color.md)

## Useful corrections / non-obvious points

- "Mixtures" in this whole framing means **additive** light superposition; subtractive paint/dye mixing depends on pigment chemistry + ambient light and is deliberately set aside.
- **Gray and brown are not separate hues** — gray = dark white, brown = dark orange. They only exist once the brightness axis is added.
- **Purples/magentas are non-spectral by construction** — they require both ends of the spectrum at once; this is *why* the line must be closed into a circle.
- The black↔white edges of the optimal solid (red-yellow vs cyan-blue) are a clean physical grounding for the artists' **warm/cool** split. → see [koenderink-warm-cool-chromatic-gestalt](koenderink-warm-cool-chromatic-gestalt.md)

## Links

- Video (EN): <https://www.youtube.com/watch?v=7KYwi2F5Ce4>
- ScienceClic channel (EN): <https://www.youtube.com/ScienceClicEN> · Français: <https://youtube.com/ScienceClic> · Español: <https://youtube.com/ScienceClicES>
- Alessandro Roussel: <http://www.alessandroroussel.com/en>
- **Companion MacAdam-ellipse experiment/game:** <http://colors2.alessandroroussel.com/>
- Interactive Munsell explorer (cited in sources): <https://pteromys.melonisland.net/munsell/>

### Bibliography (from the video description)

- Helmholtz and the geometry of color space — <https://www.researchgate.net/publication/367216474>
- Helmholtz, Schrödinger and the First Non-Euclidean Model of Perceptual Color Space — <https://www.researchgate.net/publication/377372066>
- Springer (Helmholtz line element, open PDF) — <https://link.springer.com/content/pdf/10.1007/s00407-023-00317-x.pdf>
- Young 1802, "On the Theory of Light and Colours" (Royal Society) — <https://royalsocietypublishing.org/doi/epdf/10.1098/rstl.1802.0004>
- Lowengard, *The Creation of Color in 18th-Century Europe* — <http://www.gutenberg-e.org/lowengard/A_Chap03.html>
- Color theory phenomena (van Beek) — <http://www.color-theory-phenomena.nl/08.00.html>
- RMIT Colour Theory — modern era c.1850–1980 — <https://rmit.pressbooks.pub/colourtheory1/chapter/modern-era-c-1850-to-1980/>
- WebExhibits — retinal ganglion / opponent cells — <https://www.webexhibits.org/colorart/ganglion.html>
- JCGT color paper — <https://www.jcgt.org/published/0014/01/01/paper.pdf>
- EIZO color-handling appendix (PDF) — <https://www.eizo.com.cn/global/library/EIZO_DCH_APPENDIXA.pdf>
- **PNAS 2022 — perceptual color space is non-Riemannian** — <https://www.pnas.org/doi/full/10.1073/pnas.2119753119>
- **Science Advances 2025 — OLO / direct cone stimulation** — <https://www.science.org/doi/10.1126/sciadv.adu1052>
