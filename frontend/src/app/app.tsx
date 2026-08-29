import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers/app-providers';
import { router } from '@/app/router/routes';

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
