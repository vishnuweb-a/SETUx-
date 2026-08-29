# Where to Find the Colors Your Screen Can't Show You

**Author:** Ryan Moulton
**Published:** June 19, 2026
**Source:** <https://moultano.wordpress.com/2026/06/19/where-to-find-the-colors-your-screen-cant-show-you/>
**Categories:** Art, Outdoors, Technical

A field guide to **out-of-gamut colors** — real-world colors (mostly intense cyans, greens, and blues) that exist in nature but fall outside the sRGB and Display-P3 gamuts, so no screen, camera, or game can reproduce them. Combines a clear explanation of why screen gamuts are limited with a practical "atlas" of where to see these colors in person.

## Why Screens Can't Show Them (the cone/gamut argument)

- **You don't see light, you see how loud your cones yell.** Three cone types respond to wavelengths with an intensity, but *they don't register which wavelength they're seeing*. The brain reconstructs color purely from contrasting the three cones' response intensities. → Any two spectra that produce the same triple of cone responses are **indistinguishable** (the basis of metamerism).
- **Three cones ≈ three primaries is not a coincidence.** If you can independently drive the three cones, you can make any human see any color a human can see — regardless of whether the screen emits real object spectra.
- **CIE 1931 chromaticity diagram:** outer rim = pure single wavelengths (spectral locus); enclosed area = all colors makeable by mixing them. Points combine linearly, so a color between two wavelengths is a mix of those wavelengths.
- **The fundamental gap:** a triangle of three real primaries leaves a **giant lobe of green/cyan/blue outside it**. To hit the most saturated cyans you'd need **negative red** in the color-matching functions — and negative light doesn't exist. This is intrinsic, not an engineering oversight.
- **Phosphors made it worse.** CIE used a **monochromator** (prism + slit) to make pure spectral test wavelengths — too big/wasteful for a TV. Color TV used **phosphors**, which don't glow at pure wavelengths, so the primaries couldn't be pushed to the spectral locus. CRTs inherited TV phosphors → the small **sRGB gamut** (1996 standard; PC monitors, the whole internet, mass-market photography).
  - *Aside:* matplotlib only supports sRGB, so the author's own graphs **cannot display** any of the out-of-gamut colors they describe.
- **Display-P3** (Apple, now standard on essentially all smartphones + Macs) is a slightly wider triangle, but still far short of human vision — and only if the *entire* source-to-eye chain preserves the colorspace.
- **Lights deprive us of cyans too.** White LEDs = blue LED + yellow phosphor; **cyan falls in the gap between them**. High-CRI bulbs add phosphors but cyan is still their weakest emission.

## Color Atlas — Where the Colors Actually Are

### Natural Filters (repeated filtering pushes color to the gamut edge)

- **Foliage / deciduous forests:** Leaf *transmittance* curves are far more selective than *reflectance* curves, so light passing **through** a leaf is far more saturated than light bouncing off it (why a backlit leaf "glows"). Effects stack exponentially across repeated transmission/reflection, purifying toward the spectral peak (~550 nm). **A green leaf lit by light that already passed through one other leaf is already out of gamut — "greener than green."**
- **Water:** Aggressively absorbs reds, slowly absorbs greens, barely touches blues. Sand seen through increasing water depth traces a curve through colorspace: white/yellow sand → **unrepresentable cyans → unrepresentable blues** → converges near the sRGB blue primary in deep dark water.
- **Water + life (phytoplankton):** Real water = mix of pure water + "forest." Phytoplankton density sets the spectral path with depth. From **above**, scattering dominates and caps saturation; the real intensity appears once you **dive past the scattering layer**, where water + plankton repeatedly filter light to their combined peak. Can fill nearly the whole gamut — "more vivid than video can capture." (Underwater photographers add blue-blocking filters to avoid clipping their sensors.)
- **Key principle:** Most natural materials reflect *some* opposite-side light, which pulls color toward the center. Only **repeated filtering** purifies a color out to the gamut edge — *unless* a single-step structural process does it (→ birds).

### Birds, Butterflies, and Structural Color

- **Mammals barely see color.** Descended from nocturnal Cretaceous survivors — great noses, good low-light vision, lost most color vision. Only primates re-evolved red/green discrimination. (Tigers are orange because deer can't distinguish tiger-orange from grass-green; melanin makes orange more easily than green.) **Screens were designed for impoverished mammal vision.**
- **Birds descend from day-active dinosaurs** with cones evenly spaced across the spectrum **plus a 4th UV cone** → their fully-saturated color space is **3-dimensional** (you'd need a chromaticity *volume*, not a diagram). A human screen can't even approximate bird vision — to a bird it'd look like "black and white with one added color."
  - *Aside:* the Jurassic Park "T-Rex can't see you if you hold still" scene is implausible — T-Rex had some of the largest eyes in the animal kingdom, far bigger than an owl's.
- **Pigment colors:** Yellows/oranges/reds come from **carotenoids** taken straight from diet (birds can't synthesize them) — same chemicals as tomatoes/carrots.
- **Structural color** (blues/greens, and the most intense colors): Light's wavelength (~½–¾ µm, ~1/10 the thickness of spider silk) is comparable to physical microstructures, so nano-scale patterns interact with light **physically, not chemically** (same effect as soap-bubble/oil-slick rainbows). Feathers are **fractal hairs** four levels deep: rachis → barbs → barbules → barbicels.
  - **Flat/omnidirectional color** (e.g. bluejays): bubbles ~½ wavelength wide inside the **barbs**.
  - **Iridescent color** (hummingbirds, peacocks): stacked dark **melanin** layers spaced ~½ wavelength apart in the **barbules** — right-sized light weaves between them; other sizes hit melanin and are absorbed. **Grind an iridescent feather to powder and it's dark brown** — the color is structure, not pigment.
  - Iridescence is the *most saturated* structural color because consistent gap-width selection only works at specific angles (hence the angle-dependent shimmer).
- **Peacock:** one melanin geometry makes ~6 colors; chest/neck blue and eyespot cyan are **both out of gamut**, all from the same brown melanin. ("Spreads its train → going super saiyan super cyan.")
- **Counts:** ~**500 bird species** have colors outside sRGB; ~**100 outside Display-P3** (non-exhaustive dataset). The male **golden-tailed sapphire** hummingbird has nearly the whole spectrum in one bird. Featured: **Andean Cock-of-the-Rock**, **Emperor Fairywren**, **Paradise Tanager**.
- **Butterflies** evolved iridescence dozens of times (warning coloration toward bird predators). **Ornithoptera croesus** (birdwing) has an orange too saturated for Display-P3. **Papilio palinurus** sweeps green↔blue with viewing angle, yellow↔blue with polarization. **Morpho rhetenor** in person "looks nothing like the photograph… somehow both more blue and more green."

### Luminescence and Fluorescence

- **Deep ocean bioluminescence** must be blue/green to travel any distance (water absorbs the rest) → cyan glow is abundant in the deep.
- **Dinoflagellate blooms** light crashing waves cyan at the surface; permanent **bioluminescent bays** (e.g. Vieques, Puerto Rico) glow cyan off a kayak paddle at night.
- **NZ glowworms** speckle cave ceilings over water with cyan "stars" (independent chemistry from ocean bioluminescence; light lures prey into their mucus strands).
- **Scorpions** fluoresce intense cyan/teal under UV blacklight — nearly every species. Leading hypothesis: tail photoreceptors let the scorpion "see" whether any part of its body is exposed from hiding.

### Man-Made Color

- **Green traffic lights are not green — they're an intense turquoise/cyan.** The author calls this the most acute **Sapir-Whorf** example he knows: *calling* it "green" made him ignore his own eyes for life. They're out-of-gamut and beautiful; we owe their spectral character to **red-green colorblind** drivers — the spectral requirements that make green distinguishable from red for them make it beautiful for everyone. (You never *stare* at a green light, only red ones — they're "anti-memetic.") NIST traffic-light standard barely overlaps display gamuts; LEDs (without added phosphor) emit nearly pure spectral colors — the cheapest practical way to fill the colorspace.
- **Lasers** are the purest source: stimulated emission duplicates one winning wavelength until the output is essentially monochromatic. For the most intense possible colors, use lasers.
- **The 520 nm "white whale":** one region — pure ~520 nm green at full purity — the author couldn't fill with any natural source. **Geometric explanation:** along most of the spectral locus the boundary is nearly straight, so averaging two nearby wavelengths stays on the edge (a wider band doesn't desaturate). But **520 nm is the top of the curve**, so *any* symmetric spread around it immediately pulls chromaticity inward toward white. → A color at exactly 520 nm is very hard for natural broadband emitters to make. Hence the most "artificial"-looking color, the clearest sign of advanced technology, is a **green laser beam**.

## Qualia (the closing argument)

- The author didn't *notice* these colors until he knew to look — then couldn't believe he'd missed them. Attention raises a sensation's prominence (compared to meditators' reports about attending to the self).
- Vision is intermediated not just by screens but by **our own attention** — what we deem important. Color intensity often doesn't "make the cut." Naming/telling can help you notice colors that were there all along; "your screens are duller than you thought." But don't photograph the green light — it won't work; everyone has to see it themselves.

## Methodology

- All object colors rendered under the **D65** standard illuminant from **measured reflectance data**. Where data existed only in a paper's figure, the author had **Gemini 3.1 Pro** extract it at 10 nm intervals, then re-plotted to check against the source.
- Physical simulations of leaves/water aimed to be naturalistic rather than exact — included all major desaturating terms so as not to overstate achievable intensities.
- Unexplored (possible part 2): flowers and synthetic pigments.

## Connections to Other References

- **Bird tetrachromacy / 3D color** — see [Bird Hue Circuits & Tetrahedra](bird-color-theory-hue-circuits.md) and [Bird Complementary Colors](bird-complementary-colors-tetrachromacy.md).
- **CIE 1931 / standard observer / color matching functions** — see [CIE 1931 — Standard Observer](cie-1931-standard-observer.md).
- **Pointer's Gamut** (real surface colors, smaller than the optimal solid) — see [Pointer's Gamut](pointers-gamut-real-surface-colors.md).
- **Color spaces / gamuts (sRGB, P3, Rec2020)** — see [Color Spaces](colorandcontrast/color-spaces.md).
- **Pure-wavelength generation tech** — see [NIST "Any-Wavelength" Laser Chip](nist-any-wavelength-laser-photonic-chip.md).
- **Iridescence / thin-film interference** — see [Iridescence / Thin-Film Interference](iridescence-thin-film-interference.md) and [Iridescent Color Math](iridescent-color-math.md).
- **Structural color is metameric-impossible to capture** — connects to [How Eyes Turn Light into Color](how-eyes-turn-light-into-color.md).

## Links

### Tools & Datasets

- [colour — Python color science package](https://www.colour-science.org/) — the toolkit used for all the spectral→color rendering in this article ([Colour 0.4.7, Zenodo](https://www.colour-science.org/))
- [Bird Color Base — Avian Coloration Database](https://github.com/BirdColorBase/home) (Gluckman & Endler 2017) — spectral reflectance collection that made the bird analysis possible
- [Birds outside the sRGB gamut — ~500 species (Google Sheet)](https://docs.google.com/spreadsheets/d/1N-Tz9Z6pDg4PBEIoSeik95H_4kKHmsLCKpowAQdwgLg/edit?usp=drivesdk)
- [Birds outside Display-P3 — ~100 species (Google Sheet)](https://docs.google.com/spreadsheets/d/1LjDMPAquyxpMIFnXhfhJT4GniI5VClpwI14d3SvBndE/edit?usp=drivesdk)
- [The Blue Morpho Butterfly — structural color explainer (UVM)](https://www.uvm.edu/~dahammon/Structural_Colors/Structural_Colors/The_Blue_Morpho_Butterfly.html)

### Species referenced

- [Bird color space is 3-dimensional — PNAS (Stoddard et al.)](https://www.pnas.org/doi/10.1073/pnas.1919377117)
- [Golden-tailed sapphire (hummingbird)](https://en.wikipedia.org/wiki/Golden-tailed_sapphire)
- [Ornithoptera croesus (birdwing butterfly)](https://en.wikipedia.org/wiki/Ornithoptera_croesus)
- [Papilio palinurus](https://en.wikipedia.org/wiki/Papilio_palinurus)
- [Morpho rhetenor](https://en.wikipedia.org/wiki/Morpho_rhetenor)

## References (as cited in the article)

- Anderson, M., Motta, R., Chandrasekar, S., & Stokes, M. (1996). *Proposal for a standard default color space for the Internet – sRGB.* Proc. IS&T/SID 4th Color Imaging Conference, 238–245.
- Mansencal, T., et al. (2025). [Colour 0.4.7](https://www.colour-science.org/). Zenodo.
- Serbin, S. (2014). [Fresh Leaf Spectra to Estimate Leaf Morphology and Biochemistry for Northern Temperate Forests](https://ecosis.org/package/fresh-leaf-spectra-to-estimate-leaf-morphology-and-biochemistry-for-northern-temperate-forests). EcoSIS.
- Serbin, S., Meng, R., Wu, J., & Ely, K. (2019). [NGEE Tropics GLiHT Puerto Rico Campaign: Leaf Spectral Reflectance and Transmittance, March 2017](https://ecosis.org/package/ngee-tropics-gliht-puerto-rico-campaign-leaf-spectral-reflectance-and-transmittance-march-2017). EcoSIS.
- Pope, R. M., & Fry, E. S. (1997). [Absorption spectrum (380–700 nm) of pure water](https://omlc.org/spectra/water/data/pope97.txt). Applied Optics, 36(33), 8710–8723.
- Ong, C., & Daniels, P. (2019). [Reflectance Spectral Data of Australian Beach Sands](https://doi.org/10.25919/5c7e431416819). v1. CSIRO.
- Bricaud, A., Babin, M., Morel, A., & Claustre, H. (1995). Variability in the chlorophyll-specific absorption coefficients of natural phytoplankton. J. Geophysical Research: Oceans, 100(C7), 13321–13332.
- Mobley, C. D. (1994). [Light and Water: Radiative Transfer in Natural Waters / The Oceanic Optics Book](https://www.oceanopticsbook.info). Ocean Optics Web Book.
- Gluckman, T., & Endler, J. (2017). [Bird Color Base: Avian Coloration Database](https://github.com/BirdColorBase/home). GitHub. *(aggregates Stoddard & Prum 2011, Eaton 2005, Dunn et al. 2015, Dunning et al. 2025, and others)*
- Freyer, P., Wilts, B. D., & Stavenga, D. G. (2018). [Reflections on iridescent neck and breast feathers of the peacock, Pavo cristatus](https://pmc.ncbi.nlm.nih.gov/articles/PMC6304014/). Interface Focus, 9, 20180043.
</content>
</invoke>
