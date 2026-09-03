import { useEffect } from 'react';
import { useLocation, Outlet } from 'react-router';
import { DataProvider } from '../context/DataContext';
import { RoleOverrideProvider } from '../context/RoleOverrideContext';
import { OfflineBanner } from './OfflineBanner';
import { PasswordGate } from './PasswordGate';
import { OrgActivator } from './OrgActivator';
import { LocalApiBridge } from './LocalApiBridge';
import { AppHeader } from './AppHeader';
import { ViewAsBanner } from './ViewAsBanner';
import { ViewerBanner } from './ViewerBanner';

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
    <RoleOverrideProvider>
      <PasswordGate>
        <OrgActivator>
          <LocalApiBridge />
          <DataProvider>
            <ViewAsBanner />
            <ViewerBanner />
            <OfflineBanner />
            <AppHeader />
            <Outlet />
          </DataProvider>
        </OrgActivator>
      </PasswordGate>
    </RoleOverrideProvider>
  );
}