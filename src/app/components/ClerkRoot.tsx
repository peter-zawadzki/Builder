import { Outlet, useNavigate } from "react-router";
import { ClerkProvider } from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env.local (see Clerk dashboard → API Keys)"
  );
}

// Root layout route: mounts ClerkProvider *inside* the router so Clerk performs
// in-app navigation via React Router (routerPush/routerReplace) instead of hard
// browser redirects. This keeps sign-in, sign-up, invitation acceptance, and
// post-auth redirects entirely within the app — no detour through Clerk's
// hosted Account Portal. logoPlacement:"none" drops Clerk's logo slot globally
// (we render our own BUILDER mark); the "Secured by Clerk" badge is turned off
// at the instance level.
export function ClerkRoot() {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
      appearance={{ layout: { logoPlacement: "none" } }}
    >
      <Outlet />
    </ClerkProvider>
  );
}
