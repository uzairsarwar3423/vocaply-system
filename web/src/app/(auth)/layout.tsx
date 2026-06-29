import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In",
};

/**
 * Auth layout — Login/Register pages shell.
 * Centers content, full-height, light background from design system.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="onboarding-theme">{children}</div>;
}
