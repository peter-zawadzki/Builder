import { ReactNode } from "react";
import {
  ClerkLoading,
  ClerkLoaded,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  useClerk,
} from "@clerk/clerk-react";

// ─── Auth context shim ────────────────────────────────────────────────────────
// The app previously exposed a `useAuth()` hook from this module that returned a
// `logout` function. Clerk now owns auth, so this is a thin adapter that keeps
// the same call site contract (MountainsList uses `const { logout } = useAuth()`)
// while delegating to Clerk's sign-out.

export function useAuth() {
  const { signOut } = useClerk();
  return { logout: () => signOut() };
}

// ─── Loading shell ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#1D2930" }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: "#F95C39", borderTopColor: "transparent" }}
        />
        <p className="text-sm font-medium" style={{ color: "#F2F3F5", opacity: 0.6 }}>
          Loading…
        </p>
      </div>
    </div>
  );
}

// ─── PasswordGate ─────────────────────────────────────────────────────────────
// Name and `{ children }` shape are unchanged so RootLayout is untouched. Signed-
// out users are redirected to the /sign-in route (branded) rather than shown an
// inline form, so there is a single canonical sign-in surface.

export function PasswordGate({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkLoading>
        <LoadingScreen />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>{children}</SignedIn>
        <SignedOut>
          <RedirectToSignIn />
        </SignedOut>
      </ClerkLoaded>
    </>
  );
}
