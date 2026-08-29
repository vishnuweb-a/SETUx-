# Design Book — Procedural Tokens: Encode the Decision, Not the Color

**Source:** [GitHub — meodai/design-book](https://github.com/meodai/design-book)
**Author:** meodai
**License:** AGPL-3.0 (commercial license available, see repo)
**Article:** https://meodai.github.io/design-book/article/ ("Procedural Tokens")
**Demo / editor:** https://meodai.github.io/design-book/
**Install:** `npm install design-book`

## The Core Idea

Design systems are usually stored as **fixed answers** — a color picked here, a spacing value decided there, each maintained by hand. Design Book stores **how values are chosen** instead:

- A text color isn't `#ffffff` — it's *"the highest-contrast color from this palette against this background."*
- A hover state isn't a second hex to maintain — it's *"primary mixed 15% toward black."*
- An accent isn't a one-off pick — it's *"the most vivid color that still clears contrast, excluding the tokens reserved for error and success."*

You don't maintain tokens anymore — you maintain **rules**. When inputs change, the system re-runs the decisions, updates dependents, and lets you inspect *why* a value won. It's a small reactive query engine (selection, constraints, search, resolution) over a token system.

The article's framing: static token systems freeze exploration — "once the system was set up, exploration moved elsewhere — back into Figma, back into a script." Procedural tokens reverse that: change a fundamental and coherent outcomes cascade. **"Consistency turns into discovery."**

**Why this matters for agents applying generated colors:** when wiring a generated palette into a UI, don't freeze one manual mapping into literals (`buttonText: #fff`). Emit the *decision* (`bestContrastWith(buttonBg, palette)`, `nth(ramp, -1)`) so the mapping survives palette regeneration, theme swaps, and accessibility audits. The intent stays in the system instead of in design-review folklore.

## Built-in Decision Functions

**Selection (search a scope, pick the winner):**

```typescript
bestContrastWith(target, scope)             // Highest WCAG contrast
minContrastWith(target, scope, { ratio })   // Meets minimum ratio (default 4.5)
closestColor(target, scope)                 // Perceptually closest
furthestFrom(scope)                         // Most distant from others
mostVivid(scope, { against, minContrast })  // Highest OKLCH chroma, optionally gated by readability
leastVivid(scope, { against, minContrast }) // Lowest OKLCH chroma — the muted counterpart
```

`mostVivid` uses OKLCH chroma, not HSL saturation, so a pale pink and a vivid mid-red don't score the same. `against` + `minContrast` gate the winner by a WCAG threshold — the "pick a link color from a generated palette without it turning unreadable" function. All scope-iterating functions accept `not: [ref('palette.error'), …]` to exclude tokens whose *role* shouldn't be reused (the error red shouldn't become the accent just because it's the most chromatic).

**Transforms:**

```typescript
colorMix(c1, c2, { ratio, colorSpace })            // Interpolate
lighten(c, { amount }) / darken(c, { amount })
shade(c, { amount })                               // Adaptive: darkens light input, lightens dark input
relativeTo(c, 'oklch', [null, null, '+180'])       // Per-channel modification
```

`shade` solves a real theming bug: `darken(surface)` collapses to black on an already-dark surface; `shade` flips direction based on OKLCH lightness (> 0.5 darkens, ≤ 0.5 lightens), so the variation is *always* visible.

**Positional (for generated ramps):**

```typescript
nth(ramp, 0)     // lightest      nth(ramp, -1)   // darkest (Array.at semantics)
nth(ramp, 0.5)   // midtone (floats 0–1 = relative position)
```

`nth` pins roles to *positions* instead of names — `"the darkest one"` stays correct when the ramp is regenerated with a different number of stops.

Also: dimension selectors (`nextLarger`/`nextSmaller` in a spacing/type/motion scale), `spacingScale`/`typographyScale`/`timing`, seeded `random(scope, { type, seed, not })`, and custom functions via `createFunctionToken` + `book.registerFunction`.

## Reactive Graph, Scopes, Inheritance

```typescript
const book = new DesignBook('my-system');
const brand = book.addScope('brand');
brand.set('primary', color('#0066cc'));

const ui = book.addScope('ui');
ui.set('background', ref('brand.white'));
ui.set('text', bestContrastWith(ref('ui.background'), brand));
ui.set('hover', colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.15 }));

brand.set('white', color('#f5f5f5')); // ui.text recomputes automatically
```

- **Scope inheritance:** `book.addScope('dark', { extends: 'light' })` — dark overrides a few tokens, inherits the rest; deleting an override falls back to the inherited token. Inherited tokens stay in the dependency graph.
- **Introspection:** `book.inspect('ui.hover')` returns resolved value, the function + args that produced it, dependencies, dependents, inheritance source — the system can *explain* every value.
- **Dependency graph API:** `getDependentsOf`, `getPrerequisitesFor`, `getEvaluationOrderFor`, `hasCycles`.
- **Events:** `book.watch('brand.primary', cb)`, `book.on('change', …)`; batch mode with `flush()`.
- **Typography:** `addTypography('heading-lg', {...})` — composite scopes that render as CSS classes or W3 `typography` tokens.

## Rendering — Decisions Survive Into CSS

The same graph renders to `css-variables`, `json`, `w3-design-tokens`, `svg` (dependency visualization), an HTML table view, or custom renderers (e.g. a Tailwind config). Notably, the CSS renderer keeps decisions **native** where possible instead of freezing resolved values:

```css
:root {
  --ui-background: var(--brand-white);
  --ui-hover: color-mix(in lab, var(--brand-primary) 85%, #000000);
  --ui-complement: color(from var(--brand-primary) oklch l c calc(h + 180));
}
```

References → `var()`, mixes → `color-mix()`, channel edits → relative color syntax — so the browser itself re-runs the decision (see [W3C CSS Color 4 and 5](w3c-css-color-4-and-5.md)).

## The Recommended Workflow (generation → rules → UI)

1. **Generate primitives** with a palette tool — [Poline](poline-esoteric-palette-generator.md), [RampenSau](rampensau-palette-generation.md), [CuspHanger](cusphanger-gamut-triangle-palettes.md)…
2. **Define semantic tokens as relationships** over those primitives: `text = bestContrastWith(surface, primitives)`, `surface = nth(ramp, 0)`, `hover = colorMix(accent, ink, 0.12)`.
3. **Feed components from the semantic layer** — components depend on meaning, not palette coordinates.

Regenerate the palette and the semantic + component layers recompute. The palette stays exploratory; product tokens stay stable and meaningful. Design Book is strongest in that middle layer: not generating colors, but turning a generated palette into a maintainable, explainable system.

## Agent Integration

The npm package ships a Claude Code skill (`skills/design-book.md`) that teaches migrating/retrofitting a static design system onto Design Book — discovering tokens, classifying them into value / reference / procedural layers, generating the code, verifying. Includes a Figma path (Dev Mode MCP or REST API) mapping Figma variables/collections/modes to scopes, refs, and `extends`.

## Relation to Other References

- **[CuspHanger](cusphanger-gamut-triangle-palettes.md)** / **[Poline](poline-esoteric-palette-generator.md)** / **[RampenSau](rampensau-palette-generation.md)** — the generation layer this consumes.
- **[W3C CSS Color 4 and 5](w3c-css-color-4-and-5.md)** — the native CSS decision primitives the renderer targets.
- **[APCA & Myndex](apca-myndex-contrast.md)** — contrast selection is WCAG-based today; APCA is the natural upgrade path for the `bestContrastWith` idea.
- **[Culori](culori-color-spaces-api.md)** — color-space machinery for custom functions.
