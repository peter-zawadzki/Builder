import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const STORAGE_KEY = "builder_session_token";

// ─── Auth context ─────────────────────────────────────────────────────────────

interface AuthCtx {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ logout: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

// ─── PasswordGate ─────────────────────────────────────────────────────────────

export function PasswordGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // On mount: verify any stored token
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      setStatus("locked");
      return;
    }
    fetch(`${BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((data: any) => {
        if (data.valid) {
          setStatus("unlocked");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setStatus("locked");
        }
      })
      .catch(() => {
        // If we can't reach the server (offline), trust the stored token
        setStatus("unlocked");
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        setError(data.error || "Incorrect password");
        setLoading(false);
        return;
      }
      localStorage.setItem(STORAGE_KEY, data.token);
      setStatus("unlocked");
    } catch (err) {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    setPassword("");
    setStatus("locked");
    if (token) {
      try {
        await fetch(`${BASE}/auth/logout`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ token }),
        });
      } catch {
        // best-effort
      }
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#1D2930" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#F95C39", borderTopColor: "transparent" }}
          />
          <p className="text-sm font-medium" style={{ color: "#F2F3F5", opacity: 0.6 }}>
            Checking session…
          </p>
        </div>
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: "#1D2930" }}>
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ backgroundColor: "#F95C39" }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="14" width="20" height="14" rx="2" fill="white" />
              <path d="M10 14V10a6 6 0 1 1 12 0v4" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="16" cy="21" r="2" fill="#F95C39" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#F2F3F5", fontFamily: "Inter, sans-serif" }}>
            BUILDER
          </h1>
          <p className="text-sm mt-1" style={{ color: "#F2F3F5", opacity: 0.5, fontFamily: "Inter, sans-serif" }}>
            Yullr Field App
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <label
              htmlFor="builder-password"
              className="block text-sm font-semibold mb-2"
              style={{ color: "#F2F3F5", fontFamily: "Inter, sans-serif" }}
            >
              Password
            </label>
            <input
              id="builder-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter access password"
              className="w-full rounded-xl px-4 py-3 text-base outline-none transition-all"
              style={{
                backgroundColor: "rgba(255,255,255,0.08)",
                border: `1.5px solid ${error ? "#ef4444" : "rgba(255,255,255,0.15)"}`,
                color: "#F2F3F5",
                fontFamily: "Inter, sans-serif",
                caretColor: "#F95C39",
              }}
            />
            {error && (
              <p className="text-sm mt-2 font-medium" style={{ color: "#ef4444", fontFamily: "Inter, sans-serif" }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl py-3.5 text-base font-bold tracking-wide transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#F95C39", color: "#fff", fontFamily: "Inter, sans-serif" }}
          >
            {loading ? "Verifying…" : "Unlock App"}
          </button>
        </form>

        <p className="text-xs mt-6" style={{ color: "#F2F3F5", opacity: 0.3, fontFamily: "Inter, sans-serif" }}>
          Sessions last 30 days
        </p>
      </div>
    );
  }

  // Unlocked — render the app with logout available via context
  return (
    <AuthContext.Provider value={{ logout }}>
      {children}
    </AuthContext.Provider>
  );
}
