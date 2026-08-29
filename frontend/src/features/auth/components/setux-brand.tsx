import { cn } from '@/lib/utils';

export interface SetuxBrandProps {
  /** `dark` renders for the deep-blue panel; `light` for white surfaces. */
  readonly tone?: 'light' | 'dark';
  readonly className?: string;
}

/**
 * The SetuX wordmark and tagline from the approved authentication screen.
 *
 * Drawn with type and an inline SVG glyph rather than the source PNG: the
 * artwork is a 1254px square weighing ~800KB, which would be the heaviest asset
 * on a screen that renders it at 40px. Text also stays sharp at any density and
 * is readable by assistive technology.
 */
export function SetuxBrand({ tone = 'light', className }: SetuxBrandProps) {
  const isDark = tone === 'dark';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2.5">
        <BridgeGlyph className={cn('size-9 shrink-0', isDark ? 'text-white' : 'text-primary')} />
        <span
          className={cn(
            'text-3xl leading-none font-bold tracking-tight',
            isDark ? 'text-white' : 'text-foreground',
          )}
        >
          Setu
          <span className={isDark ? 'text-sky-300' : 'text-primary'}>X</span>
        </span>
      </div>
      <p className={cn('text-sm', isDark ? 'text-blue-100' : 'text-muted-foreground')}>
        One Platform. Connected Government.
      </p>
    </div>
  );
}

/**
 * The SetuX mark: an arc bridging two nodes — the "setu" (bridge) that connects
 * a citizen to government systems.
 */
function BridgeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden focusable="false">
      <path
        d="M5 23a11 11 0 0 1 22 0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="5" cy="23" r="3" fill="currentColor" />
      <circle cx="27" cy="23" r="3" fill="currentColor" />
      <circle cx="16" cy="9" r="2.5" fill="currentColor" />
    </svg>
  );
}
