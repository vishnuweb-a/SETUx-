import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '../hooks/use-auth';

const ROLE_LABELS = {
  CITIZEN: 'Citizen',
  GOVERNMENT_OFFICER: 'Government Officer',
} as const;

/**
 * Identity strip shown on authenticated destinations.
 *
 * The role it displays is the one the backend resolved; the badge is a label,
 * not a permission.
 */
export function SignedInHeader() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async (): Promise<void> => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    // Deliberately no `finally`: signing out unmounts this component, and
    // clearing the flag on an unmounted component would be a no-op at best.
    await signOut();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.email}</p>
        <p className="text-xs text-muted-foreground">Signed in to SetuX</p>
      </div>

      <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>

      <Button
        variant="outline"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="ml-auto"
      >
        <LogOut className="size-4" aria-hidden />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}
