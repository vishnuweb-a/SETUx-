import { FileText, Grid2x2, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SetuxBrand, useAuth } from '@/features/auth';
import { GovernmentSkyline } from '@/features/onboarding/components/government-skyline';
import { cn } from '@/lib/utils';

/**
 * The signed-in citizen shell from the approved reference screens
 * (`reference/dashboard.png`, `reference/service.png`).
 *
 * Both references show the same chrome: a deep-blue sidebar carrying the
 * wordmark and primary navigation, a white header strip with the page title and
 * the account control, and a tinted content ground. Everything a citizen screen
 * renders sits inside that frame, so the frame lives here rather than being
 * repeated by each page.
 *
 * Navigation lists only destinations that exist. The references also show
 * Consents, Notifications and Profile; those belong to Phase 7 and later, and
 * a link to a route that is not built yet is a broken promise, not a preview.
 */

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** `end` so the dashboard link is not left active on every nested route. */
  readonly end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/citizen', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/citizen/services', label: 'Services', icon: Grid2x2 },
  { to: '/citizen/applications', label: 'My Applications', icon: FileText },
];

/**
 * Tracks Tailwind's `lg` breakpoint, where the drawer becomes a permanent rail.
 *
 * Needed because a closed drawer is only translated off-screen, and off-screen
 * is not hidden: without this the rail's links stay focusable and exposed to
 * assistive technology at phone and tablet widths.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}

export function CitizenLayout() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();

  // Following a link on a phone must close the drawer, or the destination
  // renders underneath it. Adjusted during render rather than in an effect so
  // the drawer is already closed on the first paint of the new route, instead
  // of being visible for a frame and then dismissed.
  const [lastPathname, setLastPathname] = useState(pathname);

  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setIsNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-accent/30">
      {/* Backdrop, drawer-only. Hidden from assistive tech: the close control
          in the drawer header is the labelled way out. */}
      {isNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setIsNavOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar isOpen={isNavOpen} isDesktop={isDesktop} onClose={() => setIsNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <CitizenHeader onOpenNav={() => setIsNavOpen(true)} />

        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * The blue navigation rail.
 *
 * A permanent column from `lg` up, as both references show it, and a slide-in
 * drawer below that — at phone widths a 260px rail would leave nothing for the
 * content it exists to navigate to.
 */
function Sidebar({
  isOpen,
  isDesktop,
  onClose,
}: {
  readonly isOpen: boolean;
  readonly isDesktop: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div
      // A closed drawer is only slid out of view, so below `lg` it must also be
      // taken out of the tab order — otherwise Tab moves focus to links the
      // user cannot see.
      inert={!isDesktop && !isOpen}
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col overflow-hidden bg-primary transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-start justify-between gap-2 px-5 pt-6 pb-5">
        <SetuxBrand tone="dark" />
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white lg:hidden"
          onClick={onClose}
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close navigation</span>
        </Button>
      </div>

      <nav aria-label="Primary" className="px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none',
                    isActive
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-blue-100 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* The trust panel and skyline the reference anchors to the foot of the
          rail. The skyline sits *behind* the panel and is clipped to the space
          left below it, so the illustration never runs through the text —
          which is what the reference shows and what keeps the copy legible. */}
      <div className="mt-auto hidden min-h-0 flex-col justify-end sm:flex">
        <div className="relative z-10 mx-3 rounded-2xl bg-primary/80 p-4 ring-1 ring-white/15 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-sky-300" aria-hidden />
            <p className="text-sm font-semibold text-white">Secure &amp; Trusted</p>
          </div>
          <p className="mt-1 text-xs text-blue-100">
            Your data is protected and shared only with your consent.
          </p>
        </div>

        <div className="relative h-32 overflow-hidden">
          <GovernmentSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-sky-200/70" />
        </div>
      </div>
    </div>
  );
}

/**
 * The white header strip.
 *
 * Carries the drawer trigger on small screens and the account control on all of
 * them. The reference also shows a global search field here; it searches
 * applications and documents as well as services. Cross-resource search is not
 * part of Phase 6, so the catalogue's own search remains on that screen.
 */
function CitizenHeader({ onOpenNav }: { readonly onOpenNav: () => void }) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenNav}>
          <Menu className="size-5" aria-hidden />
          <span className="sr-only">Open navigation</span>
        </Button>

        {/* The section name, as the reference's header carries it. Derived from
            the route rather than passed down by each page: it names the area of
            the app, which is exactly what the nav rail already knows. Not a
            heading element — the page's own <h1> is the document's heading, and
            a second one here would compete with it. */}
        <p className="truncate text-base font-semibold tracking-tight">
          {sectionTitleFor(pathname)}
        </p>

        <div className="ml-auto">
          <AccountControl />
        </div>
      </div>
    </header>
  );
}

/**
 * The section a path belongs to.
 *
 * Longest-prefix first, so a detail route is still "Scholarships" rather than
 * falling through to the dashboard.
 */
const sectionTitleFor = (pathname: string): string =>
  // Consent first: it is nested under an application, so the broader
  // `/citizen/applications` test would otherwise swallow it.
  pathname.endsWith('/consent')
    ? 'Review and Grant Consent'
    : pathname.startsWith('/citizen/applications')
      ? 'My Applications'
      : pathname.startsWith('/citizen/services')
        ? 'Scholarships'
        : 'Dashboard';

/**
 * Who is signed in, and the way out.
 *
 * The reference renders an avatar, the citizen's name and a menu. The name
 * comes from the citizen profile, which this phase does not fetch, so the
 * account is identified by the address it authenticated with — accurate rather
 * than invented — and the menu's one implemented action is offered directly.
 */
function AccountControl() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async (): Promise<void> => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    // No `finally`: signing out unmounts this shell, so clearing the flag
    // afterwards would be a no-op at best.
    await signOut();
  };

  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
        aria-hidden
      >
        {user.email.slice(0, 1).toUpperCase()}
      </span>
      <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">
        {user.email}
      </span>
      <Button variant="outline" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
        <LogOut className="size-4" aria-hidden />
        <span className="hidden sm:inline">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
      </Button>
    </div>
  );
}
