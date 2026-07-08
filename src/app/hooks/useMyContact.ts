import { useUser } from '@clerk/clerk-react';
import { useData } from '../context/DataContext';
import type { CRMContact } from '../context/DataContext';

// Resolves the signed-in login to its YULLR-org contact by email match, so the
// app knows "who am I" for owner/ambassador-scoped views.
export function useMyContact(): CRMContact | undefined {
  const { user } = useUser();
  const { contacts } = useData();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return undefined;
  return contacts.find(c => c.email?.toLowerCase() === email);
}

// Ambassadors are locked to their own stuff; everyone else (Employees / unset)
// can flip a dashboard to "all".
export function useCanSeeAll(): boolean {
  const me = useMyContact();
  return me?.affiliation !== 'Ambassador';
}
