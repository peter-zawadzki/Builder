import { Outlet } from 'react-router';
import { ScenarioProvider } from './lib/scenario-context';
import { AppModeProvider } from './lib/app-mode-context';
import { Nav } from './components/shell/Nav';
import { AppShellBody } from './components/shell/AppShellBody';
import './design-system.css';

// Ported from a standalone Next.js app (see PORTING notes) — this is the
// direct equivalent of that app's src/app/(app)/layout.tsx, adapted to a
// React Router layout route (Outlet instead of `children`). `.fp-scope`
// contains this design system's global-looking rules (see the top of
// design-system.css) so they don't leak onto the rest of Builder.
export function FinancialPlanningLayout() {
  return (
    <div className="fp-scope">
      <AppModeProvider>
        <ScenarioProvider>
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Nav />
            <AppShellBody>
              <Outlet />
            </AppShellBody>
          </div>
        </ScenarioProvider>
      </AppModeProvider>
    </div>
  );
}
