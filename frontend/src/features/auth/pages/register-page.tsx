import { ArrowRight, Info, Loader2, Mail, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountTypeTabs } from '../components/account-type-tabs';
import { AuthScreenLayout } from '../components/auth-screen-layout';
import { PasswordInput } from '../components/password-input';
import { useAuth } from '../hooks/use-auth';
import { signUp } from '../services/auth-service';
import { USER_ROLES, type UserRole } from '../types/auth.types';
import { toAuthErrorMessage } from '../utils/auth-error-message';
import { landingPathForUser } from '@/features/onboarding';

/** Mirrors the backend minimum so the user is told before a round trip. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The SetuX registration screen.
 *
 * Shares the approved authentication layout with the sign-in screen, so the two
 * read as one flow.
 *
 * **Citizen accounts only.** The Government Organization tab deliberately
 * offers no form: a role that grants government access must not be selectable
 * by the person requesting it, so officers are provisioned through the
 * controlled process instead (auth-api.md §11, authentication-and-rbac.md §16).
 * The backend enforces this independently — it assigns CITIZEN whatever the
 * request contains, so hiding the form is convenience, not the control.
 */
export function RegisterPage() {
  const { status, user } = useAuth();
  const navigate = useNavigate();

  const [selectedContext, setSelectedContext] = useState<UserRole>(USER_ROLES.CITIZEN);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Someone already signed in has no business registering.
  if (status === 'authenticated' && user) {
    return <Navigate to={landingPathForUser(user)} replace />;
  }

  const isCitizenContext = selectedContext === USER_ROLES.CITIZEN;

  /**
   * Client-side checks that only save a round trip. The backend validates the
   * same rules, and it is the backend's answer that decides.
   */
  const validationError = (): string | null => {
    if (fullName.trim().length === 0) return 'Enter your full name.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    // Guards against a double submit creating two accounts.
    if (isSubmitting) return;

    const problem = validationError();
    if (problem) {
      setErrorMessage(problem);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await signUp({ fullName, email, password, confirmPassword });

      // Straight to sign-in rather than signing them in automatically: the
      // session must come from the credentials, exercising the same path every
      // other user takes.
      navigate('/login', { replace: true, state: { registeredEmail: created.email } });
    } catch (error) {
      setErrorMessage(toAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenLayout
      title={
        <>
          Join <span className="text-primary">SetuX</span>
        </>
      }
      subtitle="Create your account to access integrated government services"
    >
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Create an account</h2>
        <AccountTypeTabs
          selected={selectedContext}
          onSelect={setSelectedContext}
          disabled={isSubmitting}
        />
      </div>

      {isCitizenContext ? (
        <>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fullName" className="sr-only">
                Full name
              </label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-secondary/40 pl-10"
                />
              </div>
            </div>

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
                autoComplete="new-password"
                required
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="px-1 text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm password
              </label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSubmitting}
              />
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
                  Creating account…
                </>
              ) : (
                <>
                  Create Citizen Account
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
          </form>
        </>
      ) : (
        /* No officer form by design — see the component doc comment. */
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertDescription>
            Government officer accounts are provisioned by your administrator and cannot be
            created here. Contact your SetuX administrator to request access.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthScreenLayout>
  );
}
