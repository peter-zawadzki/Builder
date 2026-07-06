import { ReactNode } from "react";

// Shared branded wrapper for the Clerk sign-in / sign-up screens, plus the
// Clerk appearance tokens so both screens match the dark BUILDER look.

export const clerkAppearance = {
  layout: { logoPlacement: "none" as const },
  variables: {
    colorPrimary: "#F95C39",
    colorBackground: "#243139",
    colorText: "#F2F3F5",
    colorTextSecondary: "rgba(242,243,245,0.6)",
    colorInputBackground: "rgba(255,255,255,0.06)",
    colorInputText: "#F2F3F5",
    fontFamily: "Inter, sans-serif",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid rgba(255,255,255,0.08)" },
    headerTitle: { color: "#F2F3F5" },
    headerSubtitle: { color: "rgba(242,243,245,0.6)" },
  },
} as const;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ backgroundColor: "#1D2930" }}
    >
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
      {children}
    </div>
  );
}
