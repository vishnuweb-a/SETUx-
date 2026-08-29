import { Outlet } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';

/**
 * Application shell shared by every route.
 *
 * Provides the header/main/footer regions and landmark structure that feature
 * screens render into. Navigation links are added by the phases that introduce
 * the screens they point to.
 */
export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-6">
          <span className="text-base font-semibold tracking-tight text-primary">SetuX</span>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">Connected Government</span>
          {/* Primary navigation is added by the phases that introduce routes. */}
          <nav aria-label="Primary" className="ml-auto" />
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-muted-foreground">
          SetuX — SIH prototype. Government systems are simulated with synthetic data.
        </div>
      </footer>
    </div>
  );
}
