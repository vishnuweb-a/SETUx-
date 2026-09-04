import { Building2, FileCheck2, Lock, LogOut, ShieldCheck, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SetuxBrand, useAuth } from '@/features/auth';
import { GovernmentSkyline } from './government-skyline';

export interface OnboardingScreenLayoutProps {
  /** Large heading; the highlighted span is supplied by the caller. */
  readonly title: ReactNode;
  readonly subtitle: string;
  /** The two-step indicator. */
  readonly steps: ReactNode;
  /** The reassurance panel above the fields, as in both references. */
  readonly notice: string;
  /** Footnote under the submit button. */
  readonly footnote: string;
  /** Form-level error, rendered above the fields when present. */
  readonly errorMessage?: string | null;
  readonly children: ReactNode;
  /**
   * Capability cards on the brand panel. Four, in the reference's order, each
   * paired with its own glyph — the wording differs between the citizen and
   * officer references.
   */
  readonly capabilities: readonly [string, string, string, string];
}

/**
 * The split-panel shell of the approved onboarding screens.
 *
 * Deliberately a sibling of `AuthScreenLayout` rather than a fork of it. The
 * two share a silhouette — white form panel left, deep-blue brand panel right,
 * one rounded card centred on a tinted ground — but onboarding adds a step
 * indicator, a notice panel and a footnote, and its brand panel carries
 * role-specific capability wording. Parameterising the auth layout for all of
 * that would have left one component serving two screens badly; the shared
 * pieces that *are* identical (`SetuxBrand`, the UI primitives) are imported,
 * not copied.
 */
/**
 * Glyphs for the four capability cards, in the order both references show
 * them: identity, documents/verification, department integration, trust.
 */
const CAPABILITY_ICONS = [User, FileCheck2, Building2, ShieldCheck] as const;

export function OnboardingScreenLayout({
  title,
  subtitle,
  steps,
  notice,
  footnote,
  errorMessage,
  children,
  capabilities,
}: OnboardingScreenLayoutProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-accent/40 p-3 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl bg-card shadow-xl sm:rounded-3xl lg:grid-cols-2">
        {/* Form panel */}
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-8 lg:p-10">
          <div className="flex items-center gap-3">
            <SetuxBrandHeader />
            <OnboardingSessionControl />
          </div>

          <div className="space-y-1">
            {/* Slightly tighter than the auth screen's heading so the longer
                officer title ("Complete your organization profile") holds one
                line at the reference width, as it does in the reference. */}
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {steps}

          <div className="flex items-start gap-3 rounded-xl bg-accent/60 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-foreground/80">{notice}</p>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {children}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {footnote}
          </p>
        </div>

        {/* Brand panel — decorative, so it is dropped on narrow viewports
            rather than stacked below a form the user came here to fill in. */}
        <div className="relative hidden flex-col justify-center gap-8 overflow-hidden bg-primary p-12 lg:flex">
          <SetuxBrandHeader tone="dark" />

          <ul className="grid grid-cols-2 gap-4">
            {capabilities.map((label, index) => {
              const Icon = CAPABILITY_ICONS[index] ?? ShieldCheck;

              return (
                <li
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-4 text-center"
                >
                  <Icon className="size-6 text-primary" aria-hidden />
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                </li>
              );
            })}
          </ul>

          <p className="text-center text-xs text-blue-100/80">
            Government systems are simulated with synthetic data for this SIH prototype.
          </p>

          {/* Anchored to the bottom of the panel, as in the reference, and
              allowed to bleed past the padding so it reads as a horizon. */}
          <GovernmentSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full text-sky-200" />
        </div>
      </div>
    </div>
  );
}

/**
 * The signed-in identity and the way out of the onboarding flow.
 *
 * Onboarding is the first screen behind a successful sign-in — every account
 * starts at NOT_STARTED — and it sits outside `RootLayout`, so none of the
 * shell's chrome reaches it. Without this control a signed-in user has no way
 * to leave: `RequireOnboarding` returns any attempt at a dashboard to the form,
 * and the form is the only screen they can see. That dead end is
 * indistinguishable, from the outside, from a broken login.
 *
 * `SignedInHeader` is not reused here because its bordered strip belongs to the
 * dashboards' stacked layout; this screen needs the same two facts —who is
 * signed in, and how to stop being signed in — inline beside the wordmark.
 */
function OnboardingSessionControl() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async (): Promise<void> => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    // No `finally`: signing out unmounts this screen, so clearing the flag
    // afterwards would be a no-op at best.
    await signOut();
  };

  return (
    <div className="ml-auto flex min-w-0 items-center gap-2">
      <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:inline">
        {user.email}
      </span>
      <Button variant="outline" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
        <LogOut className="size-4" aria-hidden />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}

/**
 * The SetuX wordmark, in the tone the surrounding panel needs.
 *
 * Reuses the auth feature's `SetuxBrand` — the brand is one asset shared by
 * both screens, and a second copy of it would drift the moment either changed.
 */
function SetuxBrandHeader({ tone }: { readonly tone?: 'light' | 'dark' }) {
  return (
    <SetuxBrand
      tone={tone}
      className={tone === 'dark' ? 'items-center text-center [&>div]:justify-center' : undefined}
    />
  );
}
