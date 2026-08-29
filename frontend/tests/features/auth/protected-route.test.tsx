import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ProtectedRoute } from '@/features/auth/components/protected-route';
import type { AuthUser, UserRole } from '@/features/auth/types/auth.types';

const userWithRole = (role: UserRole): AuthUser => ({
  id: `${role}-1`,
  email: 'user@example.com',
  role,
  onboardingStatus: 'COMPLETED',
});

const buildAuth = (overrides: Partial<AuthContextValue>): AuthContextValue => ({
  status: 'unauthenticated',
  user: null,
  sessionEndReason: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  clearSessionEndReason: vi.fn(),
  ...overrides,
});

/** Renders a guarded `/government` route and reports where the user ends up. */
const renderGuard = (auth: AuthContextValue, allowedRoles?: readonly UserRole[]) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/government']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
            <Route path="/government" element={<p>Officer dashboard</p>} />
          </Route>
          <Route path="/login" element={<p>Sign in</p>} />
          <Route path="/unauthorized" element={<p>Access denied</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe('ProtectedRoute', () => {
  it('waits while the session is still resolving', () => {
    renderGuard(buildAuth({ status: 'loading' }), ['GOVERNMENT_OFFICER']);

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    // Crucially, the protected content is not rendered while undecided.
    expect(screen.queryByText('Officer dashboard')).not.toBeInTheDocument();
  });

  it('sends an unauthenticated visitor to sign in', () => {
    renderGuard(buildAuth({ status: 'unauthenticated' }), ['GOVERNMENT_OFFICER']);

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Officer dashboard')).not.toBeInTheDocument();
  });

  it('admits the role the route allows', () => {
    renderGuard(
      buildAuth({ status: 'authenticated', user: userWithRole('GOVERNMENT_OFFICER') }),
      ['GOVERNMENT_OFFICER'],
    );

    expect(screen.getByText('Officer dashboard')).toBeInTheDocument();
  });

  it('diverts a citizen away from a government route', () => {
    renderGuard(buildAuth({ status: 'authenticated', user: userWithRole('CITIZEN') }), [
      'GOVERNMENT_OFFICER',
    ]);

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Officer dashboard')).not.toBeInTheDocument();
  });

  it('admits any authenticated user when no role is required', () => {
    renderGuard(buildAuth({ status: 'authenticated', user: userWithRole('CITIZEN') }));

    expect(screen.getByText('Officer dashboard')).toBeInTheDocument();
  });

  it('treats an authenticated status with no user as unauthenticated', () => {
    // A state that should not occur, but must fail closed if it ever does.
    renderGuard(buildAuth({ status: 'authenticated', user: null }), ['CITIZEN']);

    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });
});
