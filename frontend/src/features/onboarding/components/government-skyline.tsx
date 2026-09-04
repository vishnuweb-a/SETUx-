/**
 * The government-building illustration from the approved onboarding brand
 * panel (`reference/user-onboard.png`, `reference/gov-employee-onboard.png`).
 *
 * Drawn as inline SVG rather than exported from the reference PNGs for the same
 * reason `SetuxBrand` is: the references are 1536px screenshots, and cropping
 * one would ship a large raster that blurs on scaling. Vector geometry stays
 * sharp at any density, costs no network request, and inherits `currentColor`
 * so it tracks the panel rather than being pinned to one blue.
 *
 * Purely decorative — `aria-hidden`, with no text of its own, since everything
 * it conveys is already stated by the capability cards beside it.
 */
export function GovernmentSkyline({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 320 150"
      className={className}
      fill="none"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Ground plane: converging lines suggesting a plaza in perspective. */}
      <g stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.6">
        <path d="M160 118 L20 150" />
        <path d="M160 118 L80 150" />
        <path d="M160 118 L140 150" />
        <path d="M160 118 L180 150" />
        <path d="M160 118 L240 150" />
        <path d="M160 118 L300 150" />
        <path d="M0 132 H320" strokeOpacity="0.16" />
      </g>

      {/* Flanking blocks, behind the capitol. */}
      <g fill="currentColor" fillOpacity="0.16">
        <rect x="18" y="88" width="46" height="30" rx="1.5" />
        <rect x="256" y="82" width="48" height="36" rx="1.5" />
        <rect x="70" y="96" width="26" height="22" rx="1.5" />
        <rect x="228" y="94" width="24" height="24" rx="1.5" />
      </g>
      {/* Lit windows on the flanking blocks. */}
      <g fill="currentColor" fillOpacity="0.34">
        {[24, 34, 44, 54].map((x) => (
          <rect key={`l${x}`} x={x} y="95" width="4" height="6" rx="0.5" />
        ))}
        {[262, 272, 282, 292].map((x) => (
          <rect key={`r${x}`} x={x} y="90" width="4" height="6" rx="0.5" />
        ))}
      </g>

      {/* Capitol: steps, colonnade, pediment, drum and dome. */}
      <g fill="currentColor" fillOpacity="0.55">
        <rect x="98" y="112" width="124" height="6" rx="1" />
        <rect x="104" y="106" width="112" height="6" rx="1" />
      </g>
      <g fill="currentColor" fillOpacity="0.72">
        {[114, 128, 142, 156, 170, 184, 198].map((x) => (
          <rect key={x} x={x} y="80" width="7" height="26" rx="1" />
        ))}
        {/* Pediment over the colonnade. */}
        <path d="M108 78 L160 58 L212 78 Z" />
        <rect x="106" y="76" width="108" height="4" rx="1" />
      </g>
      <g fill="currentColor" fillOpacity="0.82">
        {/* Drum and dome. */}
        <rect x="142" y="44" width="36" height="14" rx="1" />
        <path d="M142 44 A18 20 0 0 1 178 44 Z" />
        {/* Lantern and flag. */}
        <rect x="157" y="18" width="6" height="8" rx="1" />
        <rect x="159" y="6" width="1.6" height="13" rx="0.8" />
        <path d="M160.6 6 H176 L176 13 H160.6 Z" />
      </g>

      {/* Data points along the plaza — the interoperability motif. */}
      <g fill="currentColor" fillOpacity="0.5">
        {[
          [46, 140],
          [104, 146],
          [214, 143],
          [274, 137],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" />
        ))}
      </g>
    </svg>
  );
}
