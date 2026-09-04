import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ProtectedRoute } from '@/features/auth/components/protected-route';
import type { AuthUser, OnboardingStatus, UserRole } from '@/features/auth/types/auth.types';
import {
  RequireIncompleteOnboarding,
  RequireOnboarding,
} from '@/features/onboarding/components/require-onboarding';
import { landingPathForUser } from '@/features/onboarding/utils/onboarding-path';

/**
 * The Phase 4 routing state machine (§13, §38–§40).
 *
 * These guards are user-experience controls, not security boundaries — the
 * backend authorizes every request independently. What is tested here is that
 * an authenticated user always ends up on exactly one correct screen, and never
 * ping-pongs between two.
 */

const userWith = (role: UserRole, onboardingStatus: OnboardingStatus): AuthUser => ({
  id: `${role}-1`,
  email: 'user@example.com',
  role,
  onboardingStatus,
});

const buildAuth = (overrides: Partial<AuthContextValue>): AuthContextValue => ({
  status: 'authenticated',
  user: null,
  sessionEndReason: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

/**
 * Renders the full Phase 4 route tree for both roles and reports which screen
 * the user lands on from `initialPath`.
 */
const renderRoutes = (auth: AuthContextValue, initialPath: string) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['CITIZEN']} />}>
            <Route element={<RequireIncompleteOnboarding />}>
              <Route path="/onboarding/citizen" element={<p>Citizen onboarding</p>} />
            </Route>
            <Route element={<RequireOnboarding />}>
              <Route path="/citizen" element={<p>Citizen dashboard</p>} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['GOVERNMENT_OFFICER']} />}>
            <Route element={<RequireIncompleteOnboarding />}>
              <Route path="/onboarding/government" element={<p>Officer onboarding</p>} />
            </Route>
            <Route element={<RequireOnboarding />}>
              <Route path="/government" element={<p>Officer dashboard</p>} />
            </Route>
          </Route>

          <Route path="/login" element={<p>Sign in</p>} />
          <Route path="/unauthorized" element={<p>Access denied</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('onboarding route guards', () => {
  it.each<[OnboardingStatus]>([['NOT_STARTED'], ['IN_PROGRESS']])(
    'sends a %s citizen from the dashboard URL to onboarding',
    (status) => {
      renderRoutes(buildAuth({ user: userWith('CITIZEN', status) }), '/citizen');

      // Phase 4 §39: typing the dashboard URL does not skip onboarding.
      expect(screen.getByText('Citizen onboarding')).toBeVisible();
      expect(screen.queryByText('Citizen dashboard')).toBeNull();
    },
  );

  it.each<[OnboardingStatus]>([['NOT_STARTED'], ['IN_PROGRESS']])(
    'sends a %s officer from the dashboard URL to onboarding',
    (status) => {
      renderRoutes(buildAuth({ user: userWith('GOVERNMENT_OFFICER', status) }), '/government');

      expect(screen.getByText('Officer onboarding')).toBeVisible();
      expect(screen.queryByText('Officer dashboard')).toBeNull();
    },
  );

  it('lets a completed citizen reach the dashboard', () => {
    renderRoutes(buildAuth({ user: userWith('CITIZEN', 'COMPLETED') }), '/citizen');

    expect(screen.getByText('Citizen dashboard')).toBeVisible();
  });

  it('lets a completed officer reach the dashboard', () => {
    renderRoutes(
      buildAuth({ user: userWith('GOVERNMENT_OFFICER', 'COMPLETED') }),
      '/government',
    );

    expect(screen.getByText('Officer dashboard')).toBeVisible();
  });

  it('redirects a completed citizen away from the onboarding form', () => {
    renderRoutes(buildAuth({ user: userWith('CITIZEN', 'COMPLETED') }), '/onboarding/citizen');

    // Phase 4 §40: an onboarded user is not trapped in a form whose submission
    // the backend would answer with 409.
    expect(screen.getByText('Citizen dashboard')).toBeVisible();
    expect(screen.queryByText('Citizen onboarding')).toBeNull();
  });

  it('redirects a completed officer away from the onboarding form', () => {
    renderRoutes(
      buildAuth({ user: userWith('GOVERNMENT_OFFICER', 'COMPLETED') }),
      '/onboarding/government',
    );

    expect(screen.getByText('Officer dashboard')).toBeVisible();
  });

  it('lets an incomplete citizen open their own onboarding form', () => {
    renderRoutes(buildAuth({ user: userWith('CITIZEN', 'NOT_STARTED') }), '/onboarding/citizen');

    expect(screen.getByText('Citizen onboarding')).toBeVisible();
  });

  it('denies a citizen the officer onboarding route', () => {
    renderRoutes(
      buildAuth({ user: userWith('CITIZEN', 'NOT_STARTED') }),
      '/onboarding/government',
    );

    // The role guard fires before the onboarding guard.
    expect(screen.getByText('Access denied')).toBeVisible();
  });

  it('denies an officer the citizen onboarding route', () => {
    renderRoutes(
      buildAuth({ user: userWith('GOVERNMENT_OFFICER', 'NOT_STARTED') }),
      '/onboarding/citizen',
    );

    expect(screen.getByText('Access denied')).toBeVisible();
  });

  it('sends an anonymous visitor to sign in rather than to onboarding', () => {
    renderRoutes(buildAuth({ status: 'unauthenticated', user: null }), '/onboarding/citizen');

    expect(screen.getByText('Sign in')).toBeVisible();
  });

  it('renders nothing protected while the session is still resolving', () => {
    renderRoutes(buildAuth({ status: 'loading', user: null }), '/onboarding/citizen');

    // Phase 4 §35: no dashboard, no form and no login screen flashes before
    // the trusted state is known.
    expect(screen.queryByText('Citizen onboarding')).toBeNull();
    expect(screen.queryByText('Citizen dashboard')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
  });
});

describe('landingPathForUser', () => {
  /**
   * The two guards must be exact complements, or a user could be redirected
   * back and forth forever. `landingPathForUser` names the one screen each
   * state belongs on, and this asserts it agrees with the guards above.
   */
  it.each<[UserRole, OnboardingStatus, string]>([
    ['CITIZEN', 'NOT_STARTED', '/onboarding/citizen'],
    ['CITIZEN', 'IN_PROGRESS', '/onboarding/citizen'],
    ['CITIZEN', 'COMPLETED', '/citizen'],
    ['GOVERNMENT_OFFICER', 'NOT_STARTED', '/onboarding/government'],
    ['GOVERNMENT_OFFICER', 'IN_PROGRESS', '/onboarding/government'],
    ['GOVERNMENT_OFFICER', 'COMPLETED', '/government'],
  ])('routes a %s with status %s to %s', (role, status, expected) => {
    expect(landingPathForUser(userWith(role, status))).toBe(expected);
  });

  it('never sends a user to a route its own guard would reject', () => {
    const roles: readonly UserRole[] = ['CITIZEN', 'GOVERNMENT_OFFICER'];
    const statuses: readonly OnboardingStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];

    for (const role of roles) {
      for (const status of statuses) {
        const user = userWith(role, status);
        const { unmount } = renderRoutes(buildAuth({ user }), landingPathForUser(user));

        const expectedScreen =
          status === 'COMPLETED'
            ? role === 'CITIZEN'
              ? 'Citizen dashboard'
              : 'Officer dashboard'
            : role === 'CITIZEN'
              ? 'Citizen onboarding'
              : 'Officer onboarding';

        expect(screen.getByText(expectedScreen)).toBeVisible();

        // Unmounted between cases so the next assertion queries a clean tree.
        unmount();
      }
    }
  });
});
