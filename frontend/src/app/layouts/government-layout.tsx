import { FileText, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SetuxBrand, useAuth } from '@/features/auth';
import { GovernmentSkyline } from '@/features/onboarding/components/government-skyline';
import { cn } from '@/lib/utils';

/**
 * The signed-in officer shell, from `reference/review.png`.
 *
 * The reference shows the same chrome the citizen area uses — a deep-blue rail
 * carrying the wordmark and navigation, a white header strip, a tinted content
 * ground — so this shell mirrors `CitizenLayout` deliberately rather than
 * inventing a second visual language for the same product.
 *
 * Navigation lists only what exists. The reference also shows Review Queue,
 * Notifications and Audit as separate destinations; notifications and audit
 * belong to Phase 12 and later, and the review queue IS the applications list,
 * so it is one item rather than two names for one screen. A link to a route
 * that is not built is a broken promise, not a preview.
 */

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/government', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/government/applications', label: 'Applications', icon: FileText },
];

/** Tracks Tailwind's `lg` breakpoint, where the drawer becomes a permanent rail. */
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

export function GovernmentLayout() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();

  // Following a link on a phone must close the drawer, or the destination
  // renders underneath it. Adjusted during render so the drawer is already
  // closed on the first paint of the new route.
  const [lastPathname, setLastPathname] = useState(pathname);

  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setIsNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-accent/30">
      {isNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setIsNavOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar isOpen={isNavOpen} isDesktop={isDesktop} onClose={() => setIsNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <GovernmentHeader onOpenNav={() => setIsNavOpen(true)} />

        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

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
      // taken out of the tab order — otherwise Tab reaches links nobody can see.
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

      <div className="mt-auto hidden min-h-0 flex-col justify-end sm:flex">
        <div className="relative z-10 mx-3 rounded-2xl bg-primary/80 p-4 ring-1 ring-white/15 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-sky-300" aria-hidden />
            <p className="text-sm font-semibold text-white">Official Use</p>
          </div>
          <p className="mt-1 text-xs text-blue-100">
            Decisions you record are attributed to you and retained.
          </p>
        </div>

        <div className="relative h-32 overflow-hidden">
          <GovernmentSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-sky-200/70" />
        </div>
      </div>
    </div>
  );
}

function GovernmentHeader({ onOpenNav }: { readonly onOpenNav: () => void }) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenNav}>
          <Menu className="size-5" aria-hidden />
          <span className="sr-only">Open navigation</span>
        </Button>

        {/* Names the area, not the document. The page's own <h1> is the
            heading; a second one here would compete with it. */}
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

const sectionTitleFor = (pathname: string): string =>
  pathname.startsWith('/government/applications') ? 'Applications' : 'Overview';

function AccountControl() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async (): Promise<void> => {
    if (isSigningOut) return;
    setIsSigningOut(true);
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
