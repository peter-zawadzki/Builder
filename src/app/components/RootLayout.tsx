import { useEffect } from 'react';
import { useLocation, Outlet } from 'react-router';
import { DataProvider } from '../context/DataContext';
import { OfflineBanner } from './OfflineBanner';

/** Root layout for every route.
 *  - Wraps all children in DataProvider so context is always inside the router tree.
 *  - Scrolls to the top on every navigation.
 *  - Shows the offline / pending-sync banner at the top of every screen.
 */
export function RootLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <DataProvider>
      <OfflineBanner />
      <Outlet />
    </DataProvider>
  );
}