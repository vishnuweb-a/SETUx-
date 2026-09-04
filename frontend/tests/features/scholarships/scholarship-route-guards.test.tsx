import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ProtectedRoute } from '@/features/auth/components/protected-route';
import type { AuthUser, OnboardingStatus, UserRole } from '@/features/auth/types/auth.types';
import { RequireOnboarding } from '@/features/onboarding/components/require-onboarding';

/**
 * The guards protecting the Phase 5 catalogue routes (§19, §20, §44).
 *
 * The catalogue is mounted behind the same two Phase 4 guards as the citizen
 * dashboard, in the same order. What is checked here is that adding the new
 * routes did not open a way past either of them.
 *
 * These are user-experience controls, not the security boundary: the backend
 * authorizes every catalogue request independently, so a user who defeats a
 * guard in the browser still gets nothing.
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

/** Mirrors the citizen branch of the real router, with stand-in screens. */
const renderRoutes = (auth: AuthContextValue, initialPath: string) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<p>Sign in</p>} />
          <Route path="/onboarding/citizen" element={<p>Citizen onboarding</p>} />
          <Route path="/unauthorized" element={<p>Not authorized</p>} />
          <Route path="/government" element={<p>Officer dashboard</p>} />

          <Route element={<ProtectedRoute allowedRoles={['CITIZEN']} />}>
            <Route element={<RequireOnboarding />}>
              <Route path="/citizen/services" element={<p>Catalogue</p>} />
              <Route path="/citizen/services/:id" element={<p>Detail</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('catalogue route guards', () => {
  it('admits a completed citizen', async () => {
    renderRoutes(
      buildAuth({ user: userWith('CITIZEN', 'COMPLETED') }),
      '/citizen/services',
    );

    expect(await screen.findByText('Catalogue')).toBeInTheDocument();
  });

  it('admits a completed citizen to a detail route', async () => {
    renderRoutes(
      buildAuth({ user: userWith('CITIZEN', 'COMPLETED') }),
      '/citizen/services/a1111111-1111-4111-8111-111111111111',
    );

    expect(await screen.findByText('Detail')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in', async () => {
    renderRoutes(
      buildAuth({ status: 'unauthenticated', user: null }),
      '/citizen/services',
    );

    expect(await screen.findByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument();
  });

  it.each(['NOT_STARTED', 'IN_PROGRESS'] as const)(
    'returns a %s citizen to onboarding rather than the catalogue',
    async (status) => {
      renderRoutes(buildAuth({ user: userWith('CITIZEN', status) }), '/citizen/services');

      expect(await screen.findByText('Citizen onboarding')).toBeInTheDocument();
      expect(screen.queryByText('Catalogue')).not.toBeInTheDocument();
    },
  );

  it('keeps an incomplete citizen out of a detail route too', async () => {
    renderRoutes(
      buildAuth({ user: userWith('CITIZEN', 'NOT_STARTED') }),
      '/citizen/services/a1111111-1111-4111-8111-111111111111',
    );

    expect(await screen.findByText('Citizen onboarding')).toBeInTheDocument();
    expect(screen.queryByText('Detail')).not.toBeInTheDocument();
  });

  it('does not admit an officer to the citizen catalogue', async () => {
    renderRoutes(
      buildAuth({ user: userWith('GOVERNMENT_OFFICER', 'COMPLETED') }),
      '/citizen/services',
    );

    expect(await screen.findByText('Not authorized')).toBeInTheDocument();
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument();
  });
});
