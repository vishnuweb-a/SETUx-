import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/app/layouts/root-layout';
import { NotFoundPage } from '@/components/feedback/not-found-page';
import { FoundationPage } from '@/components/common/foundation-page';

/**
 * Application routes.
 *
 * Phase 0 registers only the foundation page; feature routes are added by
 * their own phases.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <FoundationPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
