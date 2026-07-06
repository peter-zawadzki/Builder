import { SignUp } from "@clerk/clerk-react";
import { AuthShell, clerkAppearance } from "./AuthShell";

// Public route (/sign-up). With sign-ups restricted, this is reached only via a
// Clerk invitation link, which arrives with a `__clerk_ticket` query param that
// <SignUp/> consumes automatically so the invited user can set their password.
export function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path="/sign-up" appearance={clerkAppearance} />
    </AuthShell>
  );
}
