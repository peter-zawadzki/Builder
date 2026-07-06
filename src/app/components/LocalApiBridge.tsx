import { useAuth } from "@clerk/clerk-react";
import { registerLocalTokenGetter } from "../context/DataContext";

// Registers the Clerk session-token getter with the data layer so that, when the
// local-DB toggle is on, DataContext can authenticate its calls to the local
// API. Rendered inside ClerkProvider, before DataProvider, so the getter is set
// before the initial data load runs. Renders nothing.
export function LocalApiBridge() {
  const { getToken } = useAuth();
  registerLocalTokenGetter(() => getToken());
  return null;
}
