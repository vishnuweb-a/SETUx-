import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser, UserRole } from '@/features/auth/types/auth.types';
import { CitizenOnboardingPage } from '@/features/onboarding/pages/citizen-onboarding-page';
import { GovernmentOnboardingPage } from '@/features/onboarding/pages/government-onboarding-page';

/**
 * Regression: the onboarding screens must offer a way out.
 *
 * Every account begins at `onboarding_status = NOT_STARTED`, so the first
 * screen behind a successful sign-in is an onboarding form, not a dashboard.
 * Those screens sit outside `RootLayout` and originally rendered no sign-out
 * control, while `RequireOnboarding` sent any attempt to reach a dashboard
 * straight back to the form. The result was a signed-in user with no way to
 * leave the screen or change account — which reads, from the outside, as
 * "authentication is broken".
 *
 * The guards themselves were correct, so the guard tests passed. What was
 * missing was an affordance on the screen those guards route to, which is what
 * these tests pin down.
 */

const userWith = (role: UserRole): AuthUser => ({
  id: `${role}-1`,
  email: 'user@example.com',
  role,
  onboardingStatus: 'NOT_STARTED',
});

const buildAuth = (overrides: Partial<AuthContextValue>): AuthContextValue => ({
  status: 'authenticated',
  user: null,
  sessionEndReason: null,
  signIn: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  refreshUser: vi.fn(),
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

const renderOnboarding = (auth: AuthContextValue, role: UserRole) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        {role === 'CITIZEN' ? <CitizenOnboardingPage /> : <GovernmentOnboardingPage />}
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('onboarding screens offer an escape from the flow', () => {
  it.each<UserRole>(['CITIZEN', 'GOVERNMENT_OFFICER'])(
    'renders a sign-out control for %s onboarding',
    (role) => {
      renderOnboarding(buildAuth({ user: userWith(role) }), role);

      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    },
  );

  it.each<UserRole>(['CITIZEN', 'GOVERNMENT_OFFICER'])(
    'signs %s out of the session when that control is pressed',
    async (role) => {
      const signOut = vi.fn().mockResolvedValue(undefined);
      renderOnboarding(buildAuth({ user: userWith(role), signOut }), role);

      await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

      expect(signOut).toHaveBeenCalledTimes(1);
    },
  );

  it('shows the signed-in identity so the user can see which account is stuck', () => {
    renderOnboarding(buildAuth({ user: userWith('CITIZEN') }), 'CITIZEN');

    // Rendered more than once (the verified-email row also shows it), so the
    // assertion is on presence rather than uniqueness.
    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0);
  });
});
