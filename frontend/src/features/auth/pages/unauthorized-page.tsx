import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '../hooks/use-auth';
import { landingPathForUser } from '@/features/onboarding';

/**
 * Shown when a signed-in user opens a route their role does not admit.
 *
 * It states that access was denied and offers a way back, without naming the
 * role that would have been required — the same reticence the backend shows in
 * its 403 responses (Phase 3 §18).
 */
export function UnauthorizedPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" aria-hidden />
      </span>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          Your SetuX account does not have permission to open this page.
        </p>
      </div>

      <Button asChild>
        <Link to={user ? landingPathForUser(user) : '/login'}>
          {user ? 'Back to your dashboard' : 'Go to sign in'}
        </Link>
      </Button>
    </div>
  );
}
