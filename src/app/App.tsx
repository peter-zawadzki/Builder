import { RouterProvider } from 'react-router';
import { router } from './routes';
import { DataProvider } from './context/DataContext';
import { Toaster } from './components/ui/sonner';
import { PWASetup } from './components/PWASetup';

// DataProvider is placed here (outside RouterProvider) AND inside RootLayout
// (inside the router tree) so the context is available regardless of React
// Router's internal rendering order.  The globalThis-persisted context object
// in DataContext.tsx ensures both providers share the exact same context
// identity, so nesting them is safe — the inner provider simply shadows the
// outer one with fresher state.
export default function App() {
  // ClerkProvider now lives inside the router (see ClerkRoot) so Clerk can
  // navigate via React Router. DataProvider stays outside the router here, as
  // before, to keep the globalThis-shared context identity.
  return (
    <DataProvider>
      <PWASetup />
      <RouterProvider router={router} />
      <Toaster />
    </DataProvider>
  );
}