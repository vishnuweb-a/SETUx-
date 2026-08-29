import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <Link to="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Return to start
      </Link>
    </main>
  );
}
