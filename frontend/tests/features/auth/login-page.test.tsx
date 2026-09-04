import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { LoginPage } from '@/features/auth/pages/login-page';
import type { AuthUser } from '@/features/auth/types/auth.types';

const CITIZEN: AuthUser = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
};

const buildAuth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'unauthenticated',
  user: null,
  sessionEndReason: null,
  signIn: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  refreshUser: vi.fn().mockResolvedValue(undefined),
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

const renderLogin = (auth: AuthContextValue) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/citizen" element={<p>Citizen dashboard</p>} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the approved SetuX authentication screen', () => {
    renderLogin(buildAuth());

    expect(screen.getByRole('heading', { name: /welcome to setux/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /citizen/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /government organization/i })).toBeInTheDocument();
  });

  it('masks the password until the visibility toggle is pressed', async () => {
    const user = userEvent.setup();
    renderLogin(buildAuth());

    const password = screen.getByPlaceholderText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('switches the submit label with the selected account type', async () => {
    const user = userEvent.setup();
    renderLogin(buildAuth());

    expect(screen.getByRole('button', { name: /sign in as citizen/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /government organization/i }));

    expect(
      screen.getByRole('button', { name: /sign in as government officer/i }),
    ).toBeInTheDocument();
  });

  it('submits the credentials and nothing else — no role travels with them', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    renderLogin(buildAuth({ signIn }));

    // Pick the government context to prove it does not reach signIn.
    await user.click(screen.getByRole('tab', { name: /government organization/i }));
    await user.type(screen.getByPlaceholderText(/email address/i), CITIZEN.email);
    await user.type(screen.getByPlaceholderText(/^password$/i), 'correct-password');
    await user.click(screen.getByRole('button', { name: /sign in as government officer/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    // Only the credentials and the persistence choice travel — no role.
    expect(signIn).toHaveBeenCalledWith(CITIZEN.email, 'correct-password', true);
  });

  it('passes the Remember me choice through to sign-in', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    renderLogin(buildAuth({ signIn }));

    const remember = screen.getByLabelText(/remember me/i);
    expect(remember).toBeChecked();

    await user.click(remember);
    await user.type(screen.getByPlaceholderText(/email address/i), CITIZEN.email);
    await user.type(screen.getByPlaceholderText(/^password$/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(CITIZEN.email, 'pw', false),
    );
  });

  it('shows a safe message on invalid credentials and never the raw error', async () => {
    const user = userEvent.setup();
    const signIn = vi
      .fn()
      .mockRejectedValue(new Error('AuthApiError: Invalid login credentials at line 42'));
    renderLogin(buildAuth({ signIn }));

    await user.type(screen.getByPlaceholderText(/email address/i), CITIZEN.email);
    await user.type(screen.getByPlaceholderText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    expect(alert).not.toHaveTextContent(/AuthApiError|line 42/);
  });

  it('disables the submit control while the request is in flight', async () => {
    const user = userEvent.setup();
    let release = (): void => {};
    const signIn = vi.fn().mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    renderLogin(buildAuth({ signIn }));

    await user.type(screen.getByPlaceholderText(/email address/i), CITIZEN.email);
    await user.type(screen.getByPlaceholderText(/^password$/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const submit = await screen.findByRole('button', { name: /signing in/i });
    expect(submit).toBeDisabled();

    // A second click while pending must not start another sign-in.
    await user.click(submit);
    expect(signIn).toHaveBeenCalledTimes(1);

    // Settle the pending request so the component finishes updating inside the
    // test rather than after it.
    await act(async () => {
      release();
    });
  });

  it('explains an expired session when the user is sent back here', () => {
    renderLogin(buildAuth({ sessionEndReason: 'expired' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('links to registration', () => {
    renderLogin(buildAuth());

    const link = screen.getByRole('link', { name: /create an account/i });
    expect(link).toHaveAttribute('href', '/register');
  });

  it('confirms a freshly registered account so the user knows to sign in', () => {
    render(
      <AuthContext.Provider value={buildAuth()}>
        <MemoryRouter
          initialEntries={[{ pathname: '/login', state: { registeredEmail: 'asha@example.com' } }]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/account created for asha@example.com/i);
  });

  it('sends an already-authenticated visitor to their own dashboard', () => {
    renderLogin(buildAuth({ status: 'authenticated', user: CITIZEN }));

    expect(screen.getByText('Citizen dashboard')).toBeInTheDocument();
  });
});
