import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiClientModule from '@/services/api-client';

/**
 * Exercises the session lifecycle the provider owns: restoration on load,
 * sign-in, sign-out, and rejection of a session the backend will not accept.
 *
 * Supabase and the backend are both stubbed; what is under test is how the
 * provider reacts to what they say.
 */

const getSession = vi.fn();
const signInWithPassword = vi.fn();
const supabaseSignOut = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

const setSessionStorageMode = vi.fn();

vi.mock('@/lib/supabase', () => ({
  setSessionStorageMode,
  supabase: {
    auth: {
      getSession,
      signInWithPassword,
      signOut: supabaseSignOut,
      onAuthStateChange,
    },
  },
}));

const apiRequest = vi.fn();
const setAccessTokenProvider = vi.fn();
const setUnauthorizedHandler = vi.fn();

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('@/services/api-client');
  return { ...actual, apiRequest, setAccessTokenProvider, setUnauthorizedHandler };
});

const { AuthProvider } = await import('@/features/auth/auth-provider');
const { useAuth } = await import('@/features/auth/hooks/use-auth');

const CITIZEN_ME = {
  user: { id: 'citizen-1', email: 'citizen@example.com' },
  profile: { role: 'CITIZEN', onboardingStatus: 'COMPLETED' },
};

/** Surfaces the provider's state so assertions can read it from the DOM. */
function AuthProbe() {
  const { status, user, sessionEndReason, signIn, signOut } = useAuth();

  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="role">{user?.role ?? 'none'}</p>
      <p data-testid="reason">{sessionEndReason ?? 'none'}</p>
      <button onClick={() => void signIn('citizen@example.com', 'pw')}>sign in</button>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );

const withSession = (accessToken: string | null): void => {
  getSession.mockResolvedValue({
    data: { session: accessToken ? { access_token: accessToken } : null },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  supabaseSignOut.mockResolvedValue({ error: null });
});

describe('AuthProvider', () => {
  it('starts in a loading state and settles to unauthenticated with no session', async () => {
    withSession(null);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    // No session means the backend is never asked who the user is.
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('restores an existing session and resolves the role from the backend', async () => {
    withSession('stored-token');
    apiRequest.mockResolvedValue(CITIZEN_ME);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('CITIZEN');
    // The role came from /auth/me, not from anything held locally.
    expect(apiRequest).toHaveBeenCalledWith('/auth/me');
  });

  it('signs in and becomes authenticated with the server-resolved role', async () => {
    const user = userEvent.setup();
    withSession(null);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    signInWithPassword.mockResolvedValue({ error: null });
    withSession('fresh-token');
    apiRequest.mockResolvedValue(CITIZEN_ME);

    await user.click(screen.getByRole('button', { name: 'sign in' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('CITIZEN');
    // The persistence choice is applied before the session is written.
    expect(setSessionStorageMode).toHaveBeenCalledWith(true);
  });

  it('rejects a session the backend will not accept, rather than half-authenticating', async () => {
    withSession('rejected-token');
    apiRequest.mockRejectedValue(new Error('401'));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
    // The unusable Supabase session is discarded too, so it cannot retrigger.
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it('clears the authenticated state on sign-out', async () => {
    const user = userEvent.setup();
    withSession('stored-token');
    apiRequest.mockResolvedValue(CITIZEN_ME);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await user.click(screen.getByRole('button', { name: 'sign out' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it('reports an expiry when the API client signals the session is no longer valid', async () => {
    withSession('stored-token');
    apiRequest.mockResolvedValue(CITIZEN_ME);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    // Invoke the handler the provider registered with the API client.
    const handler = setUnauthorizedHandler.mock.calls.at(-1)?.[0] as () => void;
    act(() => handler());

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('reason')).toHaveTextContent('expired');
  });

  it('drops the authenticated state when Supabase reports a sign-out elsewhere', async () => {
    withSession('stored-token');
    apiRequest.mockResolvedValue(CITIZEN_ME);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    // Replay the SIGNED_OUT event, as another tab signing out would.
    const listener = onAuthStateChange.mock.calls.at(-1)?.[0] as (event: string) => void;
    act(() => listener('SIGNED_OUT'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
  });
});
