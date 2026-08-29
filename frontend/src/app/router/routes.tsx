import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/app/layouts/root-layout';
import { FoundationPage } from '@/app/pages/foundation-page';
import { NotFoundPage } from '@/components/feedback/not-found-page';

/**
 * Application routes.
 *
 * Only the foundation route exists at this stage; feature routes are added by
 * their own phases under this same root layout.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <FoundationPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
