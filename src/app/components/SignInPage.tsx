import { SignIn } from "@clerk/clerk-react";
import { AuthShell, clerkAppearance } from "./AuthShell";

// Public route (/sign-in). Where the auth gate and Clerk-initiated redirects
// send signed-out users. Path routing so Clerk's multi-step sub-paths resolve
// under /sign-in.
export function SignInPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path="/sign-in" appearance={clerkAppearance} />
    </AuthShell>
  );
}
