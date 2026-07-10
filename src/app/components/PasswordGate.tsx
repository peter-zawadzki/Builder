import { ReactNode, useEffect, useState } from "react";
import { useAuth as useClerkAuthState, useClerk, RedirectToSignIn } from "@clerk/clerk-react";

// ─── Auth context shim ────────────────────────────────────────────────────────
// The app previously exposed a `useAuth()` hook from this module that returned a
// `logout` function. Clerk now owns auth, so this is a thin adapter that keeps
// the same call site contract (MountainsList uses `const { logout } = useAuth()`)
// while delegating to Clerk's sign-out.

const WAS_SIGNED_IN_KEY = "builder_wasSignedIn";

export function useAuth() {
  const { signOut } = useClerk();
  return {
    logout: () => {
      try { localStorage.removeItem(WAS_SIGNED_IN_KEY); } catch { /* ignore */ }
      return signOut();
    },
  };
}

// ─── Loading shell ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: "#ff5c39", borderTopColor: "transparent" }}
        />
        <p className="text-sm font-medium text-[#6a7282]">
          Loading…
        </p>
      </div>
    </div>
  );
}

function readWasSignedIn(): boolean {
  try { return localStorage.getItem(WAS_SIGNED_IN_KEY) === "1"; } catch { return false; }
}

// Clerk needs a live network round-trip to confirm a session. On a weak or
// absent connection that round-trip can hang indefinitely — after a short
// grace period we fall back to trusting a previously-confirmed local session
// rather than stranding an offline field user on a spinner. Explicit logout
// is the only thing that clears the flag, per "stay logged in until you log
// out" — a fresh sign-in still requires reaching Clerk at least once.
const OFFLINE_FALLBACK_MS = 6000;

// ─── PasswordGate ─────────────────────────────────────────────────────────────
// Name and `{ children }` shape are unchanged so RootLayout is untouched. Signed-
// out users are redirected to the /sign-in route (branded) rather than shown an
// inline form, so there is a single canonical sign-in surface.

export function PasswordGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuthState();
  const [offlineFallback, setOfflineFallback] = useState(false);

  useEffect(() => {
    if (isLoaded || !readWasSignedIn()) return;
    const t = setTimeout(() => setOfflineFallback(true), OFFLINE_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (isSignedIn) localStorage.setItem(WAS_SIGNED_IN_KEY, "1");
      else localStorage.removeItem(WAS_SIGNED_IN_KEY);
    } catch { /* ignore */ }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return offlineFallback ? <>{children}</> : <LoadingScreen />;
  }

  return isSignedIn ? <>{children}</> : <RedirectToSignIn />;
}
