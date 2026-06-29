import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";

export const useOnboardingStepGuard = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) return;

    // If onboarding is already completed, redirect to dashboard
    if (user?.onboardingCompleted && !pathname.includes("/onboarding/complete")) {
      router.replace("/dashboard");
      return;
    }

    const hasTeam = !!user?.teamId;

    // Prerequisite: user must have a team to visit subsequent steps
    if (!hasTeam && (
      pathname.includes("/invite-team") ||
      pathname.includes("/connect-calendar") ||
      pathname.includes("/complete")
    )) {
      router.replace("/onboarding/create-team");
    }
  }, [user, isLoading, isAuthenticated, pathname, router]);

  return { isLoading };
};
