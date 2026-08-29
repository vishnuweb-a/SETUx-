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
import { HomeRedirect } from '@/app/pages/home-redirect';

/**
 * Application routes.
 *
 * `/login` and `/register` are public. `/citizen/*` and `/government/*` sit behind
 * `ProtectedRoute`, which resolves the session before rendering and admits only
 * the listed role.
 *
 * Those guards decide what renders; they are not what secures the data. Every
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
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'foundation', element: <FoundationPage /> },

      {
        element: <ProtectedRoute allowedRoles={[USER_ROLES.CITIZEN]} />,
        children: [{ path: 'citizen', element: <CitizenDashboardPage /> }],
      },
      {
        element: <ProtectedRoute allowedRoles={[USER_ROLES.GOVERNMENT_OFFICER]} />,
        children: [{ path: 'government', element: <GovernmentDashboardPage /> }],
      },

      // Authenticated, but not for this route. Behind ProtectedRoute with no
      // role restriction so a signed-out visitor is sent to sign in instead.
      {
        element: <ProtectedRoute />,
        children: [{ path: 'unauthorized', element: <UnauthorizedPage /> }],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
