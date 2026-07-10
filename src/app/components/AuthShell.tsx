import { ReactNode } from "react";
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";

// Shared branded wrapper for the Clerk sign-in / sign-up screens, matching the
// light theme used across the rest of the app (BUILDER's chrome is light, not
// dark — only the pre-auth loading spinner uses the dark shell).

export const clerkAppearance = {
  layout: { logoPlacement: "none" as const },
  variables: {
    colorPrimary: "#ff5c39",
    colorBackground: "#ffffff",
    colorText: "#0a0a0a",
    colorTextSecondary: "#6a7282",
    colorInputBackground: "#f3f3f5",
    colorInputText: "#0a0a0a",
    fontFamily: "Inter, sans-serif",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid rgba(0,0,0,0.1)" },
    headerTitle: { color: "#0a0a0a" },
    headerSubtitle: { color: "#6a7282" },
  },
} as const;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <img src={imgImageYullrLogo} alt="Yullr" className="h-10 mx-auto" />
      </div>
      {children}
    </div>
  );
}
