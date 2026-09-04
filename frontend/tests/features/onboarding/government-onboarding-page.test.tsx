import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types/auth.types';
import { ApiError } from '@/services/api-client';

const submitGovernmentOnboarding = vi.fn();
const fetchOrganizationDepartments = vi.fn();

vi.mock('@/features/onboarding/services/onboarding-service', () => ({
  submitGovernmentOnboarding,
  fetchOrganizationDepartments,
  submitCitizenOnboarding: vi.fn(),
  fetchOnboardingStatus: vi.fn(),
  fetchOnboardingProfile: vi.fn(),
}));

const { GovernmentOnboardingPage } = await import(
  '@/features/onboarding/pages/government-onboarding-page'
);

const OFFICER: AuthUser = {
  id: 'officer-1',
  email: 'officer@example.gov.in',
  role: 'GOVERNMENT_OFFICER',
  onboardingStatus: 'NOT_STARTED',
};

const refreshUser = vi.fn();

const buildAuth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'authenticated',
  user: OFFICER,
  sessionEndReason: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshUser,
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

const renderPage = (auth: AuthContextValue = buildAuth()) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/onboarding/government']}>
        <Routes>
          <Route path="/onboarding/government" element={<GovernmentOnboardingPage />} />
          <Route path="/government" element={<p>Officer dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

/**
 * Types the organization code and waits for the debounced lookup to populate
 * the department picker, then fills the rest of the form.
 */
const fillValidForm = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText(/organization id \/ code/i), 'EDU');

  // The organization name arrives from the lookup, not from the user.
  await waitFor(() =>
    expect(screen.getByLabelText(/organization name/i)).toHaveValue('Department of Education'),
  );

  await user.selectOptions(screen.getByLabelText(/department \/ ministry/i), 'Higher Education');
  await user.type(screen.getByLabelText(/official mobile number/i), '9876543210');
  await user.type(screen.getByLabelText(/full name/i), 'Amit Kumar');
  await user.type(screen.getByLabelText(/employee id/i), 'EMP-1024');
  await user.type(screen.getByLabelText(/designation \/ role/i), 'Application Officer');
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchOrganizationDepartments.mockResolvedValue({
    organizationName: 'Department of Education',
    departments: ['Higher Education'],
  });
  submitGovernmentOnboarding.mockResolvedValue({
    onboardingStatus: 'COMPLETED',
    role: 'GOVERNMENT_OFFICER',
    redirect: '/government',
  });
});

describe('GovernmentOnboardingPage', () => {
  it('renders the approved officer fields', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: /complete your organization profile/i }),
    ).toBeVisible();
    expect(screen.getByLabelText(/organization name/i)).toBeVisible();
    expect(screen.getByLabelText(/organization id \/ code/i)).toBeVisible();
    expect(screen.getByLabelText(/department \/ ministry/i)).toBeVisible();
    expect(screen.getByLabelText(/official mobile number/i)).toBeVisible();
    expect(screen.getByLabelText(/full name/i)).toBeVisible();
    expect(screen.getByLabelText(/employee id/i)).toBeVisible();
    expect(screen.getByLabelText(/designation \/ role/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /continue to review/i })).toBeEnabled();
  });

  it('shows the authenticated official email as verified', () => {
    renderPage();

    // The email appears twice: once in the session strip that lets the user
    // sign out, once in the read-only verified row. Selecting by the "Verified"
    // marker picks the row this test is about — and the brand panel's
    // "Verified Identity" card is why the match is scoped to the row's parent
    // rather than the page.
    const emailRow = screen
      .getAllByText(OFFICER.email)
      .find((node) => /verified/i.test(node.parentElement?.textContent ?? ''));

    expect(emailRow).toBeVisible();
    expect(emailRow?.parentElement).toHaveTextContent(/verified/i);
  });

  it('offers departments only after an organization code resolves', async () => {
    const user = userEvent.setup();
    renderPage();

    const departmentPicker = screen.getByLabelText(/department \/ ministry/i);
    expect(departmentPicker).toBeDisabled();

    await user.type(screen.getByLabelText(/organization id \/ code/i), 'EDU');

    await waitFor(() => expect(departmentPicker).toBeEnabled());
    expect(screen.getByRole('option', { name: 'Higher Education' })).toBeInTheDocument();
  });

  it('submits the code and names, never an organization or department id', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    await waitFor(() => expect(submitGovernmentOnboarding).toHaveBeenCalledTimes(1));

    const payload = submitGovernmentOnboarding.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual({
      organizationName: 'Department of Education',
      organizationCode: 'EDU',
      department: 'Higher Education',
      fullName: 'Amit Kumar',
      employeeId: 'EMP-1024',
      designation: 'Application Officer',
      officialMobileNumber: '9876543210',
    });
    // Nothing resembling a foreign key leaves the browser.
    expect(payload).not.toHaveProperty('organizationId');
    expect(payload).not.toHaveProperty('departmentId');
    expect(payload).not.toHaveProperty('role');
  });

  it('refreshes the trusted state before routing to the officer dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Officer dashboard')).toBeVisible();
  });

  it('rejects an empty form client-side without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    expect(await screen.findByText(/enter your organization name/i)).toBeVisible();
    expect(submitGovernmentOnboarding).not.toHaveBeenCalled();
  });

  it('surfaces a rejected organization code on that field', async () => {
    const user = userEvent.setup();
    submitGovernmentOnboarding.mockRejectedValue(
      new ApiError({
        code: 'ONBOARDING_VALIDATION_ERROR',
        message: 'Please correct the highlighted fields.',
        status: 422,
        details: { organizationCode: 'This organization code is not registered with SetuX.' },
      }),
    );

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    expect(await screen.findByText(/not registered with setux/i)).toBeVisible();
    expect(screen.queryByText('Officer dashboard')).toBeNull();
  });

  it('shows a safe message when the officer flow is refused', async () => {
    const user = userEvent.setup();
    submitGovernmentOnboarding.mockRejectedValue(
      new ApiError({ code: 'FORBIDDEN', message: 'nope', status: 403 }),
    );

    renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    expect(await screen.findByText(/not available for your account/i)).toBeVisible();
  });

  it('does not submit twice while a request is in flight', async () => {
    const user = userEvent.setup();
    submitGovernmentOnboarding.mockImplementation(() => new Promise(() => {}));

    renderPage();
    await fillValidForm(user);

    const submitButton = screen.getByRole('button', { name: /continue to review/i });
    await user.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    await user.click(submitButton);

    expect(submitGovernmentOnboarding).toHaveBeenCalledTimes(1);
  });
});
