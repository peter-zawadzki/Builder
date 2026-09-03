// Lets a real super admin preview the app as a lower role ("View as") without
// needing a second account — e.g. to check what a regular user sees before
// the team grows past what's practical to test with throwaway logins. Purely
// a client-side rendering concern: it only ever narrows what useUserRole()
// (src/app/hooks/useRole.ts) reports, never grants anything, and nothing
// server-side trusts it — API routes that do enforce roles still check the
// real Clerk session. Persisted to localStorage (per-browser) so it survives
// a refresh but isn't something you'd forget was on across devices.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '../hooks/useRole';

const STORAGE_KEY = 'builder:viewAsRoleOverride';

type Override = UserRole | null;

function readStored(): Override {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'admin' || stored === 'user' || stored === 'super_admin' ? stored : null;
  } catch {
    return null;
  }
}

const RoleOverrideContext = createContext<{
  override: Override;
  setOverride: (role: Override) => void;
}>({ override: null, setOverride: () => {} });

export function RoleOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<Override>(readStored);

  useEffect(() => {
    try {
      if (override) localStorage.setItem(STORAGE_KEY, override);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, [override]);

  return (
    <RoleOverrideContext.Provider value={{ override, setOverride: setOverrideState }}>
      {children}
    </RoleOverrideContext.Provider>
  );
}

export function useRoleOverride() {
  return useContext(RoleOverrideContext);
}
