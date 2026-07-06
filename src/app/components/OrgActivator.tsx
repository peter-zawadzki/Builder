import { ReactNode, useEffect } from "react";
import { useOrganization, useOrganizationList } from "@clerk/clerk-react";

// The app operates inside a single Clerk organization (the YULLR team). Clerk
// doesn't automatically make an org "active" for a session, so this activates
// the user's first (only) membership if none is active yet. That gives the Team
// screen and any role checks a concrete organization to read from.
export function OrgActivator({ children }: { children: ReactNode }) {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });

  useEffect(() => {
    if (!isLoaded || !orgLoaded || organization || !setActive) return;
    const first = userMemberships?.data?.[0];
    if (first) {
      setActive({ organization: first.organization.id });
    }
  }, [isLoaded, orgLoaded, organization, userMemberships?.data, setActive]);

  return <>{children}</>;
}
