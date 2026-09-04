import { createContext } from 'react';
import type { AuthStatus, AuthUser, SessionEndReason } from './types/auth.types';

/**
 * The application's single authentication state.
 *
 * One context, one source of truth — `docs/PHASES/phase.md` Phase 3 and the
 * Phase 3 brief both forbid parallel auth states, because two of them
 * inevitably disagree about whether the user is still signed in.
 */
export interface AuthContextValue {
  readonly status: AuthStatus;
  /** The authenticated user, or `null` in any non-authenticated state. */
  readonly user: AuthUser | null;
  /** Why the previous session ended, so the login screen can explain it. */
  readonly sessionEndReason: SessionEndReason;
  /**
   * Signs in and resolves the role. Throws on failure so the form can react.
   *
   * `rememberMe` selects session persistence: `true` keeps the session across
   * browser restarts, `false` ends it with the tab.
   */
  readonly signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /**
   * Re-reads the authenticated user from the backend.
   *
   * Needed when a server-side fact about the user changes during the session —
   * completing onboarding is the Phase 4 case. The guard routes on
   * `user.onboardingStatus`, so it has to be refreshed from `/auth/me` rather
   * than patched locally: a locally edited status would be exactly the
   * client-controlled onboarding state the trust model forbids.
   */
  readonly refreshUser: () => Promise<void>;
  /** Clears the "session expired" notice once it has been shown. */
  readonly clearSessionEndReason: () => void;
}

// Undefined by default so `useAuth` can detect a missing provider rather than
// silently handing out an unauthenticated state.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
