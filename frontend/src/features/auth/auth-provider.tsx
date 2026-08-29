import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { setAccessTokenProvider, setUnauthorizedHandler } from '@/services/api-client';
import { AuthContext, type AuthContextValue } from './auth-context';
import {
  fetchCurrentUser,
  getAccessToken,
  signIn as signInWithSupabase,
  signOut as signOutOfSupabase,
} from './services/auth-service';
import type { AuthStatus, AuthUser, SessionEndReason } from './types/auth.types';

/**
 * Owns the application's authentication state.
 *
 * The flow it implements is: Supabase reports a session → the backend resolves
 * the role for it → the user is authenticated. A session alone is never enough,
 * because a session says who someone is and not what they may do.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason>(null);

  // Guards against a slow /auth/me response landing after the user has already
  // signed out, which would otherwise resurrect a dead session.
  const generationRef = useRef(0);

  const clearAuthenticatedState = useCallback((reason: SessionEndReason) => {
    generationRef.current += 1;
    setUser(null);
    setStatus('unauthenticated');
    setSessionEndReason(reason);
  }, []);

  /**
   * Resolves the role for the current Supabase session.
   *
   * A failure here means the backend will not authorize this session, so the
   * user is treated as unauthenticated rather than shown a half-signed-in UI.
   */
  const resolveSession = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current;
    const token = await getAccessToken();

    if (!token) {
      if (generation === generationRef.current) {
        setUser(null);
        setStatus('unauthenticated');
      }
      return;
    }

    try {
      const currentUser = await fetchCurrentUser();

      // A newer sign-in or sign-out happened while this was in flight.
      if (generation !== generationRef.current) return;

      setUser(currentUser);
      setStatus('authenticated');
      setSessionEndReason(null);
    } catch {
      if (generation !== generationRef.current) return;

      // The session did not survive backend validation — drop it on both sides
      // so a stale Supabase session cannot keep re-triggering this.
      await signOutOfSupabase();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // Give the API client its credentials and its 401 response, once.
  useEffect(() => {
    setAccessTokenProvider(getAccessToken);
    setUnauthorizedHandler(() => {
      clearAuthenticatedState('expired');
      void signOutOfSupabase();
    });
  }, [clearAuthenticatedState]);

  /**
   * Restores an existing session on start-up and follows it from then on.
   *
   * `onAuthStateChange` covers token refreshes, sign-outs triggered in another
   * tab, and expiry — the cases a one-off check at mount would miss.
   */
  useEffect(() => {
    // Deferred to a microtask so the subscription below is registered first:
    // an auth event that fires during the initial resolve is then observed
    // rather than missed. (It also keeps the effect body free of a synchronous
    // state update.)
    void Promise.resolve().then(() => resolveSession());

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearAuthenticatedState('signed-out');
        return;
      }

      // TOKEN_REFRESHED carries a still-valid session; re-resolving would fire
      // a needless /auth/me on every refresh.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void resolveSession();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [clearAuthenticatedState, resolveSession]);

  const signIn = useCallback(
    async (email: string, password: string, rememberMe = true): Promise<void> => {
      await signInWithSupabase(email, password, rememberMe);
      // Resolved here rather than left to the SIGNED_IN listener so the caller
      // can await a fully authenticated state before navigating.
      await resolveSession();
    },
    [resolveSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    clearAuthenticatedState('signed-out');
    await signOutOfSupabase();
  }, [clearAuthenticatedState]);

  const clearSessionEndReason = useCallback(() => setSessionEndReason(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionEndReason, signIn, signOut, clearSessionEndReason }),
    [status, user, sessionEndReason, signIn, signOut, clearSessionEndReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
