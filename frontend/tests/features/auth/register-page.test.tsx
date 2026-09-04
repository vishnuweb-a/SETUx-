import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types/auth.types';

const signUp = vi.fn();
vi.mock('@/features/auth/services/auth-service', () => ({ signUp }));

const { RegisterPage } = await import('@/features/auth/pages/register-page');

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
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

/** Renders the register page; `/login` reports the state handed to it. */
const renderRegister = (auth: AuthContextValue = buildAuth()) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<p>Sign in screen</p>} />
          <Route path="/citizen" element={<p>Citizen dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

/** Fills the form with valid values. */
const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText(/full name/i), 'Asha Rao');
  await user.type(screen.getByPlaceholderText(/email address/i), 'asha@example.com');
  await user.type(screen.getByPlaceholderText(/^password$/i), 'StrongPassword123!');
  await user.type(screen.getByPlaceholderText(/confirm password/i), 'StrongPassword123!');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('renders the SetuX registration screen', () => {
    renderRegister();

    expect(screen.getByRole('heading', { name: /join setux/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/full name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/confirm password/i)).toBeInTheDocument();
  });

  it('registers a citizen and sends them to sign in', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ userId: 'new-1', email: 'asha@example.com', role: 'CITIZEN' });
    renderRegister();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    await waitFor(() => expect(screen.getByText('Sign in screen')).toBeInTheDocument());
    expect(signUp).toHaveBeenCalledWith({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    });
  });

  it('never sends a role in the registration request', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ userId: 'new-1', email: 'asha@example.com', role: 'CITIZEN' });
    renderRegister();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('offers no officer form — those accounts are provisioned, not self-served', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('tab', { name: /government organization/i }));

    expect(screen.queryByPlaceholderText(/full name/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create citizen account/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/provisioned by your administrator/i);
  });

  it('rejects mismatched passwords before calling the API', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByPlaceholderText(/full name/i), 'Asha Rao');
    await user.type(screen.getByPlaceholderText(/email address/i), 'asha@example.com');
    await user.type(screen.getByPlaceholderText(/^password$/i), 'StrongPassword123!');
    await user.type(screen.getByPlaceholderText(/confirm password/i), 'Different123!');
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/passwords do not match/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('rejects a short password before calling the API', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByPlaceholderText(/full name/i), 'Asha Rao');
    await user.type(screen.getByPlaceholderText(/email address/i), 'asha@example.com');
    await user.type(screen.getByPlaceholderText(/^password$/i), 'short');
    await user.type(screen.getByPlaceholderText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('shows a safe message when the account already exists', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/services/api-client');
    signUp.mockRejectedValue(
      new ApiError({
        code: 'CONFLICT',
        message: 'An account with this email already exists.',
        status: 409,
      }),
    );
    renderRegister();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    // Still on the register screen, not navigated away.
    expect(screen.queryByText('Sign in screen')).not.toBeInTheDocument();
  });

  it('does not submit twice while a request is in flight', async () => {
    const user = userEvent.setup();
    signUp.mockReturnValue(new Promise(() => {}));
    renderRegister();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create citizen account/i }));

    const submit = await screen.findByRole('button', { name: /creating account/i });
    expect(submit).toBeDisabled();

    await user.click(submit);
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it('sends an already-authenticated visitor to their dashboard', () => {
    renderRegister(buildAuth({ status: 'authenticated', user: CITIZEN }));

    expect(screen.getByText('Citizen dashboard')).toBeInTheDocument();
  });
});
