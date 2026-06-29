export interface OnboardingStep {
  path: string;
  order: number;
  label: string;
  optional: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { path: "/onboarding", order: 1, label: "Welcome", optional: false },
  { path: "/onboarding/create-team", order: 2, label: "Create team", optional: false },
  { path: "/onboarding/invite-team", order: 3, label: "Invite team", optional: true },
  { path: "/onboarding/connect-calendar", order: 4, label: "Connect calendar", optional: true },
] as const;
