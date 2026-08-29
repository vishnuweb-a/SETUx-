import { ArrowRight, Loader2, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountTypeTabs } from '../components/account-type-tabs';
import { AuthScreenLayout } from '../components/auth-screen-layout';
import { PasswordInput } from '../components/password-input';
import { useAuth } from '../hooks/use-auth';
import { toAuthErrorMessage } from '../utils/auth-error-message';
import { USER_ROLES, type UserRole } from '../types/auth.types';
import { landingPathForRole } from '../utils/landing-path';

/**
 * The SetuX authentication screen.
 *
 * Reproduces the approved reference in `reference/setux-auth-sceen.png`.
 *
 * The Citizen / Government Organization selector is presentation only. It
 * changes the button label and the framing, nothing else — the same endpoint
 * authenticates both, and the role that decides where the user lands is the one
 * the backend resolves from `profiles` (auth-api.md §2, §17).
 */
export function LoginPage() {
  const { status, user, signIn, sessionEndReason, clearSessionEndReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedContext, setSelectedContext] = useState<UserRole>(USER_ROLES.CITIZEN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expiredNotice = sessionEndReason === 'expired';
  const registeredEmail = (location.state as { registeredEmail?: string } | null)?.registeredEmail;

  // The expiry notice belongs to the session that just ended, not to the next
  // sign-in attempt, so it is cleared as soon as the user starts over.
  useEffect(() => clearSessionEndReason, [clearSessionEndReason]);

  // Someone already signed in has no business on the login screen.
  if (status === 'authenticated' && user) {
    return <Navigate to={landingPathForRole(user.role)} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    // Guards against a double submit from a fast second click or an Enter press
    // while the first request is still in flight.
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    clearSessionEndReason();

    try {
      await signIn(email, password, rememberMe);

      // The destination comes from the role the backend resolved, never from
      // the selector above.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (error) {
      setErrorMessage(toAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCitizenContext = selectedContext === USER_ROLES.CITIZEN;

  return (
    <AuthScreenLayout
      title={
        <>
          Welcome to <span className="text-primary">SetuX</span>
        </>
      }
      subtitle="Secure access to integrated government services"
    >
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Sign in to your account</h2>
        <AccountTypeTabs
          selected={selectedContext}
          onSelect={setSelectedContext}
          disabled={isSubmitting}
        />
      </div>

      {registeredEmail && (
        <Alert variant="success">
          <AlertDescription>
            Account created for {registeredEmail}. You can sign in now.
          </AlertDescription>
        </Alert>
      )}

      {expiredNotice && (
        <Alert variant="warning">
          <AlertDescription>Your session has expired. Please sign in again.</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              className="h-12 rounded-xl bg-secondary/40 pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              disabled={isSubmitting}
              className="size-4 rounded border-input accent-primary"
            />
            Remember me
          </label>

          {/* Recovery is a documented Supabase flow (auth-api.md 21-22) that
              Phase 3 does not implement, so this is not offered as a dead
              link. */}
          <span className="text-xs text-muted-foreground">
            Contact your administrator for access help
          </span>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-12 w-full rounded-xl text-base"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              {isCitizenContext ? 'Sign In as Citizen' : 'Sign In as Government Officer'}
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to SetuX?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthScreenLayout>
  );
}
