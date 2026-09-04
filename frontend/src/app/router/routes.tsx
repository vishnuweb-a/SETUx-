import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/app/layouts/root-layout';
import { FoundationPage } from '@/app/pages/foundation-page';
import { NotFoundPage } from '@/components/feedback/not-found-page';
import {
  CitizenDashboardPage,
  GovernmentDashboardPage,
  LoginPage,
  ProtectedRoute,
  RegisterPage,
  USER_ROLES,
  UnauthorizedPage,
} from '@/features/auth';
import {
  CitizenOnboardingPage,
  GovernmentOnboardingPage,
  RequireIncompleteOnboarding,
  RequireOnboarding,
} from '@/features/onboarding';
import { HomeRedirect } from '@/app/pages/home-redirect';

/**
 * Application routes.
 *
 * `/login` and `/register` are public. Everything else sits behind
 * `ProtectedRoute`, which resolves the session before rendering and admits only
 * the listed role.
 *
 * Phase 4 adds a second gate inside the first. Each role now has two
 * authenticated destinations and the guards decide between them:
 *
 *   ProtectedRoute (session + role)
 *          │
 *          ├── RequireOnboarding ──────────► dashboard   (COMPLETED only)
 *          └── RequireIncompleteOnboarding ► onboarding   (not COMPLETED only)
 *
 * The two are exact complements, which is what makes a redirect loop
 * impossible: a user satisfies precisely one of them, so whichever branch
 * redirects, the other accepts (Phase 4 §38–§40).
 *
 * The onboarding screens own the full viewport, like the auth screens, so they
 * sit outside the app shell rather than inside `RootLayout`.
 *
 * These guards decide what renders; they are not what secures the data. Every
 * protected API call is independently authorized by the backend, so bypassing a
 * guard in the browser yields an empty screen, not access
 * (authentication-and-rbac.md §32).
 */
export const router = createBrowserRouter([
  {
    // The auth screens own the full viewport, so they sit outside the app shell.
    path: '/login',
    element: <LoginPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
    errorElement: <NotFoundPage />,
  },

  // Onboarding — authenticated, role-scoped, and only while incomplete.
  {
    element: <ProtectedRoute allowedRoles={[USER_ROLES.CITIZEN]} />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <RequireIncompleteOnboarding />,
        children: [{ path: '/onboarding/citizen', element: <CitizenOnboardingPage /> }],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[USER_ROLES.GOVERNMENT_OFFICER]} />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <RequireIncompleteOnboarding />,
        children: [{ path: '/onboarding/government', element: <GovernmentOnboardingPage /> }],
      },
    ],
  },

  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'foundation', element: <FoundationPage /> },

      // Dashboards require a completed profile, so a user cannot skip
      // onboarding by typing the dashboard URL (Phase 4 §39).
      {
        element: <ProtectedRoute allowedRoles={[USER_ROLES.CITIZEN]} />,
        children: [
          {
            element: <RequireOnboarding />,
            children: [{ path: 'citizen', element: <CitizenDashboardPage /> }],
          },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={[USER_ROLES.GOVERNMENT_OFFICER]} />,
        children: [
          {
            element: <RequireOnboarding />,
            children: [{ path: 'government', element: <GovernmentDashboardPage /> }],
          },
        ],
      },

      // Authenticated, but not for this route. Behind ProtectedRoute with no
      // role restriction so a signed-out visitor is sent to sign in instead.
      // Deliberately NOT behind RequireOnboarding: a user who lands here needs
      // to be told why, not bounced into a form.
      {
        element: <ProtectedRoute />,
        children: [{ path: 'unauthorized', element: <UnauthorizedPage /> }],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
