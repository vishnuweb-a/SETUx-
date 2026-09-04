import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types/auth.types';
import { ApiError } from '@/services/api-client';

const submitCitizenOnboarding = vi.fn();
const submitGovernmentOnboarding = vi.fn();
const fetchOrganizationDepartments = vi.fn();

vi.mock('@/features/onboarding/services/onboarding-service', () => ({
  submitCitizenOnboarding,
  submitGovernmentOnboarding,
  fetchOrganizationDepartments,
  fetchOnboardingStatus: vi.fn(),
  fetchOnboardingProfile: vi.fn(),
}));

const { CitizenOnboardingPage } = await import(
  '@/features/onboarding/pages/citizen-onboarding-page'
);

const CITIZEN: AuthUser = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'NOT_STARTED',
};

const refreshUser = vi.fn();

const buildAuth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'authenticated',
  user: CITIZEN,
  sessionEndReason: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshUser,
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

/** Renders the form; `/citizen` stands in for the dashboard it leads to. */
const renderPage = (auth: AuthContextValue = buildAuth()) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/onboarding/citizen']}>
        <Routes>
          <Route path="/onboarding/citizen" element={<CitizenOnboardingPage />} />
          <Route path="/citizen" element={<p>Citizen dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

/** Fills every required field with values the schema accepts. */
const fillValidForm = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText(/full name/i), 'Rahul Sharma');
  await user.type(screen.getByLabelText(/government id/i), 'GOV123456');
  await user.type(screen.getByLabelText(/mobile number/i), '9876543210');
  await user.type(screen.getByLabelText(/date of birth/i), '2002-08-15');
};

beforeEach(() => {
  vi.clearAllMocks();
  submitCitizenOnboarding.mockResolvedValue({
    onboardingStatus: 'COMPLETED',
    role: 'CITIZEN',
    redirect: '/citizen',
  });
});

describe('CitizenOnboardingPage', () => {
  it('renders the approved citizen fields', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /complete your setux profile/i })).toBeVisible();
    expect(screen.getByLabelText(/full name/i)).toBeVisible();
    expect(screen.getByLabelText(/government id/i)).toBeVisible();
    expect(screen.getByLabelText(/mobile number/i)).toBeVisible();
    expect(screen.getByLabelText(/date of birth/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /continue to setux/i })).toBeEnabled();
  });

  it('shows the authenticated email as verified and does not collect it again', () => {
    renderPage();

    // The email appears twice on this screen: once in the session strip that
    // lets the user sign out, and once in the read-only verified row. This
    // assertion is about the latter, so it selects the occurrence that carries
    // the "Verified" marker rather than requiring the page to hold only one.
    const verifiedRow = screen
      .getAllByText(CITIZEN.email)
      .find((node) => /verified/i.test(node.parentElement?.textContent ?? ''));

    expect(verifiedRow).toBeVisible();
    // No editable email control: the backend reads it from the session.
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('submits only the four profile fields — no user id, role or email', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    await waitFor(() => expect(submitCitizenOnboarding).toHaveBeenCalledTimes(1));

    expect(submitCitizenOnboarding).toHaveBeenCalledWith({
      fullName: 'Rahul Sharma',
      governmentId: 'GOV123456',
      mobileNumber: '9876543210',
      dateOfBirth: '2002-08-15',
    });
  });

  it('refreshes the trusted state before routing to the dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    // The order matters: navigating on a stale NOT_STARTED would bounce the
    // user straight back to this form.
    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Citizen dashboard')).toBeVisible();
  });

  it('rejects an empty form client-side without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    expect(await screen.findByText(/enter your full name/i)).toBeVisible();
    expect(submitCitizenOnboarding).not.toHaveBeenCalled();
  });

  it('reports an invalid mobile number on the field itself', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/full name/i), 'Rahul Sharma');
    await user.type(screen.getByLabelText(/government id/i), 'GOV123456');
    await user.type(screen.getByLabelText(/mobile number/i), '12345');
    await user.type(screen.getByLabelText(/date of birth/i), '2002-08-15');
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    expect(await screen.findByText(/valid 10-digit mobile number/i)).toBeVisible();
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute('aria-invalid', 'true');
    expect(submitCitizenOnboarding).not.toHaveBeenCalled();
  });

  it('clears a field error once the user corrects it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /continue to setux/i }));
    expect(await screen.findByText(/enter your full name/i)).toBeVisible();

    await user.type(screen.getByLabelText(/full name/i), 'R');

    await waitFor(() => expect(screen.queryByText(/enter your full name/i)).toBeNull());
  });

  it('does not submit twice while a request is in flight', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    submitCitizenOnboarding.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ onboardingStatus: 'COMPLETED', role: 'CITIZEN', redirect: '/citizen' });
        }),
    );

    renderPage();
    await fillValidForm(user);

    const submitButton = screen.getByRole('button', { name: /continue to setux/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    await user.click(submitButton);

    expect(submitCitizenOnboarding).toHaveBeenCalledTimes(1);
    release?.();
  });

  it('shows a loading label while saving', async () => {
    const user = userEvent.setup();
    submitCitizenOnboarding.mockImplementation(() => new Promise(() => {}));

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    expect(await screen.findByText(/saving your profile/i)).toBeVisible();
  });

  it('attaches a server-reported field error to the input that caused it', async () => {
    const user = userEvent.setup();
    submitCitizenOnboarding.mockRejectedValue(
      new ApiError({
        code: 'ONBOARDING_DUPLICATE_IDENTIFIER',
        message: 'This government ID is already registered with SetuX.',
        status: 409,
        details: { governmentId: 'This government ID is already registered with SetuX.' },
      }),
    );

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/government id/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.queryByText('Citizen dashboard')).toBeNull();
  });

  it('shows a safe message for an unexpected server failure', async () => {
    const user = userEvent.setup();
    submitCitizenOnboarding.mockRejectedValue(
      new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'relation "citizen_profiles" violates constraint 23505',
        status: 500,
      }),
    );

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    expect(await screen.findByText(/could not save your profile/i)).toBeVisible();
    // The raw database wording never reaches the screen.
    expect(screen.queryByText(/citizen_profiles/)).toBeNull();
  });

  it('tells the user to sign in again when the session expired mid-form', async () => {
    const user = userEvent.setup();
    submitCitizenOnboarding.mockRejectedValue(
      new ApiError({
        code: 'AUTH_SESSION_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
        status: 401,
      }),
    );

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to setux/i }));

    expect(await screen.findByText(/session has expired/i)).toBeVisible();
  });
});
