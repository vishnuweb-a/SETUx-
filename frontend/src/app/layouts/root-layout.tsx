import { Outlet } from 'react-router-dom';

/** Shell shared by every route. Navigation is added by the phases that need it. */
export function RootLayout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Outlet />
    </div>
  );
}
