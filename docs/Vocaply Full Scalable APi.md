# Vocaply — Full Scalable Industry-Level File Structure
> Frontend + Backend | Turborepo Monorepo | Production-Grade | 1M+ Users
> Stack: Next.js 14 · Node.js · Python FastAPI · PostgreSQL · MongoDB · Redis
> Version: 1.0 | May 2026

---

## Table of Contents

1. [Monorepo Root Structure](#1-monorepo-root-structure)
2. [Frontend — Next.js 14 App (Dashboard + Landing)](#2-frontend--nextjs-14-app)
3. [Backend — Node.js Express API](#3-backend--nodejs-express-api)
4. [AI Pipeline — Python FastAPI](#4-ai-pipeline--python-fastapi)
5. [Shared Packages](#5-shared-packages)
6. [Infrastructure & DevOps](#6-infrastructure--devops)
7. [Database Layer](#7-database-layer)
8. [File-by-File Purpose Reference](#8-file-by-file-purpose-reference)

---

## 1. Monorepo Root Structure

```
vocaply/                                         ← Turborepo monorepo root
│
├── apps/                                        ← All deployable applications
│   ├── web/                                     ← Next.js 14 (dashboard + landing)
│   └── docs/                                    ← Nextra documentation site
│
├── services/                                    ← Backend services
│   ├── api/                                     ← Node.js Express (main API)
│   └── ai-pipeline/                             ← Python FastAPI (AI extraction)
│
├── packages/                                    ← Shared internal packages
│   ├── shared-types/                            ← TypeScript types across all apps
│   ├── ui-kit/                                  ← Shared React component library
│   ├── validators/                              ← Shared Zod schemas
│   ├── analytics/                               ← PostHog / analytics abstraction
│   └── config/                                  ← Shared tooling configs
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── infra/                                       ← Infrastructure as Code
│   ├── docker/                                  ← Local dev containers
│   ├── k8s/                                     ← Kubernetes manifests
│   ├── terraform/                               ← AWS/cloud resources
│   ├── nginx/                                   ← Reverse proxy config
│   └── github-actions/                          ← CI/CD workflows
│
├── docs/                                        ← Internal documentation
│   ├── architecture/                            ← ADRs (Architecture Decision Records)
│   ├── api/                                     ← OpenAPI specs
│   ├── runbooks/                                ← Incident runbooks
│   └── onboarding/                              ← New engineer guide
│
├── scripts/                                     ← Developer utility scripts
│   ├── seed.ts                                  ← Database seed data
│   ├── migrate.ts                               ← Migration helper
│   ├── generate-types.ts                        ← Auto-generate shared types
│   └── check-env.ts                             ← Validate all env vars present
│
├── turbo.json                                   ← Turborepo pipeline config
├── pnpm-workspace.yaml                          ← pnpm workspaces definition
├── package.json                                 ← Root workspace (dev tools only)
├── .env.example                                 ← Master env template (all services)
├── .gitignore                                   ← Root gitignore
├── .eslintrc.js                                 ← Root ESLint (extends packages/config)
├── prettier.config.js                           ← Shared Prettier config
├── commitlint.config.js                         ← Conventional commit enforcement
└── README.md                                    ← Monorepo setup + getting started
```

---

## 2. Frontend — Next.js 14 App

```
apps/web/
│
├── src/
│   │
│   ├── app/                                     ← Next.js App Router (routing layer ONLY)
│   │   │                                           Rule: No business logic in app/ directory.
│   │   │                                           app/ = thin shell that imports from features/
│   │   │
│   │   ├── (marketing)/                         ← Route group: public pages (no auth)
│   │   │   ├── layout.tsx                       ← Marketing layout (no sidebar/topbar)
│   │   │   ├── page.tsx                         ← Landing page → imports <LandingPage />
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx                     ← /pricing
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx                     ← /blog (list)
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx                 ← /blog/[slug] (article)
│   │   │   └── compare/
│   │   │       └── [competitor]/
│   │   │           └── page.tsx                 ← /compare/vs-otter, /compare/vs-fireflies
│   │   │
│   │   ├── (auth)/                              ← Route group: auth pages (no sidebar)
│   │   │   ├── layout.tsx                       ← Centered card layout
│   │   │   ├── login/
│   │   │   │   ├── page.tsx                     ← /login
│   │   │   │   └── loading.tsx
│   │   │   ├── register/
│   │   │   │   ├── page.tsx                     ← /register
│   │   │   │   └── loading.tsx
│   │   │   ├── verify-email/
│   │   │   │   └── page.tsx                     ← /verify-email?token=xxx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   └── reset-password/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (dashboard)/                         ← Route group: protected app (with sidebar)
│   │   │   ├── layout.tsx                       ← Dashboard shell (sidebar + topbar + providers)
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx                     ← /dashboard (home feed)
│   │   │   │   ├── loading.tsx                  ← Skeleton while RSC data loads
│   │   │   │   └── error.tsx                    ← Error boundary with retry
│   │   │   │
│   │   │   ├── meetings/
│   │   │   │   ├── page.tsx                     ← /meetings (list)
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   └── [meetingId]/
│   │   │   │       ├── page.tsx                 ← /meetings/[id] (overview tab)
│   │   │   │       ├── loading.tsx
│   │   │   │       ├── error.tsx
│   │   │   │       ├── transcript/
│   │   │   │       │   ├── page.tsx             ← /meetings/[id]/transcript
│   │   │   │       │   └── loading.tsx
│   │   │   │       ├── action-items/
│   │   │   │       │   └── page.tsx             ← /meetings/[id]/action-items
│   │   │   │       └── commitments/
│   │   │   │           └── page.tsx             ← /meetings/[id]/commitments
│   │   │   │
│   │   │   ├── commitments/
│   │   │   │   ├── page.tsx                     ← /commitments (team tracker)
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   └── [commitmentId]/
│   │   │   │       ├── page.tsx                 ← /commitments/[id] (detail + history)
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── action-items/
│   │   │   │   ├── page.tsx                     ← /action-items (all items)
│   │   │   │   ├── loading.tsx
│   │   │   │   └── error.tsx
│   │   │   │
│   │   │   ├── team/
│   │   │   │   ├── page.tsx                     ← /team (health dashboard)
│   │   │   │   ├── loading.tsx
│   │   │   │   └── [memberId]/
│   │   │   │       ├── page.tsx                 ← /team/[id] (member profile)
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── page.tsx                     ← /analytics (charts + trends)
│   │   │   │   └── loading.tsx
│   │   │   │
│   │   │   ├── intelligence/                    ← AI assistant workspace
│   │   │   │   ├── page.tsx                     ← /intelligence
│   │   │   │   └── loading.tsx
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── layout.tsx                   ← Settings sidebar tabs layout
│   │   │       ├── page.tsx                     ← /settings (redirect to /settings/profile)
│   │   │       ├── profile/
│   │   │       │   └── page.tsx                 ← /settings/profile
│   │   │       ├── team/
│   │   │       │   └── page.tsx                 ← /settings/team
│   │   │       ├── members/
│   │   │       │   └── page.tsx                 ← /settings/members
│   │   │       ├── integrations/
│   │   │       │   └── page.tsx                 ← /settings/integrations
│   │   │       ├── billing/
│   │   │       │   └── page.tsx                 ← /settings/billing
│   │   │       ├── notifications/
│   │   │       │   └── page.tsx                 ← /settings/notifications
│   │   │       └── security/
│   │   │           └── page.tsx                 ← /settings/security (sessions, 2FA)
│   │   │
│   │   ├── onboarding/
│   │   │   ├── layout.tsx                       ← Progress bar, no sidebar
│   │   │   ├── page.tsx                         ← Step 1: Welcome
│   │   │   ├── create-team/
│   │   │   │   └── page.tsx                     ← Step 2: Team name + slug
│   │   │   ├── invite-team/
│   │   │   │   └── page.tsx                     ← Step 3: Invite members
│   │   │   └── connect-calendar/
│   │   │       └── page.tsx                     ← Step 4: Google Calendar OAuth
│   │   │
│   │   ├── invite/
│   │   │   └── [token]/
│   │   │       └── page.tsx                     ← /invite/[token] accept team invite
│   │   │
│   │   ├── api/                                 ← Next.js Route Handlers (BFF layer)
│   │   │   ├── auth/
│   │   │   │   ├── refresh/
│   │   │   │   │   └── route.ts                 ← Silent token refresh proxy
│   │   │   │   └── logout/
│   │   │   │       └── route.ts                 ← Clear cookie + invalidate session
│   │   │   ├── ai/
│   │   │   │   ├── stream/
│   │   │   │   │   └── route.ts                 ← AI streaming proxy (SSE → FastAPI)
│   │   │   │   └── summarize/
│   │   │   │       └── route.ts                 ← On-demand meeting summary
│   │   │   ├── og/
│   │   │   │   └── route.tsx                    ← Dynamic OG image generation
│   │   │   └── health/
│   │   │       └── route.ts                     ← Frontend health check
│   │   │
│   │   ├── layout.tsx                           ← Root layout (fonts, metadata, providers)
│   │   ├── not-found.tsx                        ← Global 404 page (branded)
│   │   ├── error.tsx                            ← Global error boundary
│   │   ├── loading.tsx                          ← Global loading (rare use)
│   │   ├── robots.ts                            ← robots.txt generator
│   │   ├── sitemap.ts                           ← sitemap.xml generator
│   │   └── globals.css                          ← Design tokens + Tailwind imports
│   │
│   │
│   ├── features/                                ← FEATURE MODULES (vertical slices)
│   │   │                                           Rule: Each feature owns its own:
│   │   │                                           components, hooks, store, api, types
│   │   │                                           Features CANNOT import from other features.
│   │   │                                           Cross-feature communication via events or URL.
│   │   │
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── RegisterForm.tsx
│   │   │   │   ├── OAuthButton.tsx              ← Google / GitHub button
│   │   │   │   ├── AuthCard.tsx                 ← Centered card wrapper
│   │   │   │   ├── PasswordStrengthBar.tsx
│   │   │   │   ├── VerifyEmailPrompt.tsx
│   │   │   │   ├── ForgotPasswordForm.tsx
│   │   │   │   ├── ResetPasswordForm.tsx
│   │   │   │   ├── AuthGuard.tsx                ← Redirect if not authenticated
│   │   │   │   └── SessionExpiredModal.tsx      ← Auto-shown when token expires
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts                   ← Current user + isAuthenticated
│   │   │   │   ├── useLogin.ts                  ← Login mutation
│   │   │   │   ├── useRegister.ts               ← Register mutation
│   │   │   │   ├── useLogout.ts                 ← Logout + clear tokens
│   │   │   │   ├── useRefreshToken.ts           ← Silent refresh on app load
│   │   │   │   └── useOAuth.ts                  ← Google / GitHub OAuth helpers
│   │   │   ├── store/
│   │   │   │   └── auth.store.ts                ← Zustand: accessToken (memory) + user
│   │   │   ├── api/
│   │   │   │   └── auth.api.ts                  ← All auth API call functions
│   │   │   ├── types/
│   │   │   │   └── auth.types.ts                ← LoginInput, RegisterInput, Session
│   │   │   └── index.ts                         ← Public API of auth feature module
│   │   │
│   │   ├── meetings/
│   │   │   ├── components/
│   │   │   │   ├── MeetingCard/
│   │   │   │   │   ├── MeetingCard.tsx
│   │   │   │   │   ├── MeetingCard.test.tsx
│   │   │   │   │   └── MeetingCard.stories.tsx
│   │   │   │   ├── MeetingList/
│   │   │   │   │   ├── MeetingList.tsx
│   │   │   │   │   └── MeetingListSkeleton.tsx
│   │   │   │   ├── MeetingDetail/
│   │   │   │   │   ├── MeetingDetail.tsx
│   │   │   │   │   ├── MeetingOverviewTab.tsx
│   │   │   │   │   ├── MeetingTranscriptTab.tsx
│   │   │   │   │   ├── MeetingActionItemsTab.tsx
│   │   │   │   │   └── MeetingCommitmentsTab.tsx
│   │   │   │   ├── TranscriptViewer/
│   │   │   │   │   ├── TranscriptViewer.tsx     ← Virtualized (react-virtual)
│   │   │   │   │   ├── TranscriptTurn.tsx       ← Single speaker turn
│   │   │   │   │   └── TranscriptSearch.tsx     ← In-transcript search
│   │   │   │   ├── MeetingFilters.tsx           ← Status + platform + date filters
│   │   │   │   ├── MeetingStatusBadge.tsx       ← SCHEDULED/RECORDING/DONE badge
│   │   │   │   ├── MeetingPlatformIcon.tsx      ← Zoom/Meet/Teams icon
│   │   │   │   ├── MeetingTimeline.tsx          ← Bot lifecycle event timeline
│   │   │   │   ├── AddMeetingModal.tsx
│   │   │   │   ├── BotStatusBanner.tsx          ← "Recording live" banner
│   │   │   │   └── MeetingEmptyState.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useMeetings.ts               ← List (TanStack Query + filters)
│   │   │   │   ├── useMeeting.ts                ← Single meeting detail
│   │   │   │   ├── useCreateMeeting.ts          ← Create mutation + optimistic
│   │   │   │   ├── useDeleteMeeting.ts
│   │   │   │   ├── useMeetingFilters.ts         ← URL search param filter state
│   │   │   │   └── useRealtimeMeeting.ts        ← Socket.io bot status listener
│   │   │   ├── store/
│   │   │   │   └── meetings.store.ts            ← Zustand: live bot statuses
│   │   │   ├── api/
│   │   │   │   ├── meetings.queries.ts          ← TanStack Query queryFns
│   │   │   │   └── meetings.mutations.ts        ← TanStack Query mutations
│   │   │   ├── types/
│   │   │   │   └── meetings.types.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── commitments/
│   │   │   ├── components/
│   │   │   │   ├── CommitmentTracker/
│   │   │   │   │   ├── CommitmentTracker.tsx    ← Main tracker view
│   │   │   │   │   └── CommitmentTrackerSkeleton.tsx
│   │   │   │   ├── CommitmentCard/
│   │   │   │   │   ├── CommitmentCard.tsx
│   │   │   │   │   └── CommitmentCard.test.tsx
│   │   │   │   ├── CommitmentTimeline/
│   │   │   │   │   └── CommitmentTimeline.tsx   ← Cross-meeting history
│   │   │   │   ├── CommitmentScore/
│   │   │   │   │   └── CommitmentScore.tsx      ← SVG donut gauge
│   │   │   │   ├── CommitmentFilters.tsx
│   │   │   │   ├── CommitmentStats.tsx          ← Summary counts row
│   │   │   │   ├── MarkFulfilledModal.tsx
│   │   │   │   ├── DeferModal.tsx               ← Date picker + note
│   │   │   │   ├── OverdueAlert.tsx             ← Red banner for overdue
│   │   │   │   └── CommitmentEmptyState.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCommitments.ts
│   │   │   │   ├── useMyCommitments.ts
│   │   │   │   ├── useCommitment.ts
│   │   │   │   ├── useCommitmentStats.ts
│   │   │   │   ├── useMarkFulfilled.ts          ← Optimistic update pattern
│   │   │   │   ├── useDeferCommitment.ts
│   │   │   │   ├── useCommitmentFilters.ts
│   │   │   │   └── useRealtimeCommitments.ts    ← Socket.io listener
│   │   │   ├── store/
│   │   │   │   └── commitments.store.ts
│   │   │   ├── api/
│   │   │   │   ├── commitments.queries.ts
│   │   │   │   └── commitments.mutations.ts
│   │   │   ├── types/
│   │   │   │   └── commitments.types.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── action-items/
│   │   │   ├── components/
│   │   │   │   ├── ActionItemList/
│   │   │   │   │   ├── ActionItemList.tsx
│   │   │   │   │   └── ActionItemListSkeleton.tsx
│   │   │   │   ├── ActionItemCard.tsx
│   │   │   │   ├── ActionItemFilters.tsx
│   │   │   │   ├── ActionItemPriorityBadge.tsx
│   │   │   │   └── SyncToJiraButton.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useActionItems.ts
│   │   │   │   ├── useUpdateActionItem.ts
│   │   │   │   └── useSyncToJira.ts
│   │   │   ├── api/
│   │   │   │   └── action-items.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── team/
│   │   │   ├── components/
│   │   │   │   ├── TeamHealthDashboard/
│   │   │   │   │   └── TeamHealthDashboard.tsx
│   │   │   │   ├── MemberTable/
│   │   │   │   │   ├── MemberTable.tsx
│   │   │   │   │   ├── MemberRow.tsx
│   │   │   │   │   └── MemberTableSkeleton.tsx
│   │   │   │   ├── MemberProfile/
│   │   │   │   │   └── MemberProfile.tsx
│   │   │   │   ├── CommitmentRateBar.tsx
│   │   │   │   ├── TrendIndicator.tsx           ← ↑↓→ trend arrow
│   │   │   │   ├── InviteMemberModal.tsx
│   │   │   │   ├── ChangeMemberRoleModal.tsx
│   │   │   │   └── RemoveMemberModal.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useTeam.ts
│   │   │   │   ├── useTeamMembers.ts
│   │   │   │   ├── useInviteMembers.ts
│   │   │   │   ├── useChangeMemberRole.ts
│   │   │   │   └── useRemoveMember.ts
│   │   │   ├── store/
│   │   │   │   └── team.store.ts
│   │   │   ├── api/
│   │   │   │   └── team.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── analytics/
│   │   │   ├── components/
│   │   │   │   ├── AnalyticsDashboard/
│   │   │   │   │   └── AnalyticsDashboard.tsx
│   │   │   │   ├── charts/
│   │   │   │   │   ├── FulfillmentRateChart.tsx ← Recharts line chart
│   │   │   │   │   ├── MeetingsPerWeekChart.tsx ← Recharts bar chart
│   │   │   │   │   ├── MemberComparisonChart.tsx
│   │   │   │   │   └── TrendLineChart.tsx
│   │   │   │   ├── StatCard.tsx                 ← Single metric card
│   │   │   │   └── AnalyticsSkeleton.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAnalyticsOverview.ts
│   │   │   │   ├── useAnalyticsTrends.ts
│   │   │   │   └── useMemberAnalytics.ts
│   │   │   ├── api/
│   │   │   │   └── analytics.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── integrations/
│   │   │   ├── components/
│   │   │   │   ├── IntegrationCard.tsx          ← Connect/disconnect card
│   │   │   │   ├── IntegrationSettings.tsx      ← Per-provider settings form
│   │   │   │   ├── CalendarEventsPreview.tsx    ← Detected upcoming meetings
│   │   │   │   └── providers/
│   │   │   │       ├── SlackIntegration.tsx
│   │   │   │       ├── JiraIntegration.tsx
│   │   │   │       ├── LinearIntegration.tsx
│   │   │   │       ├── NotionIntegration.tsx
│   │   │   │       ├── GoogleCalendarIntegration.tsx
│   │   │   │       └── OutlookCalendarIntegration.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useIntegrations.ts
│   │   │   │   ├── useOAuthConnect.ts
│   │   │   │   ├── useDisconnectIntegration.ts
│   │   │   │   └── useCalendarEvents.ts
│   │   │   ├── api/
│   │   │   │   └── integrations.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── billing/
│   │   │   ├── components/
│   │   │   │   ├── PricingTable.tsx
│   │   │   │   ├── PricingCard.tsx
│   │   │   │   ├── UpgradeModal.tsx             ← Shown when plan limit hit
│   │   │   │   ├── BillingPortalButton.tsx
│   │   │   │   ├── CurrentPlanCard.tsx
│   │   │   │   └── InvoiceTable.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useBilling.ts
│   │   │   │   ├── usePlans.ts
│   │   │   │   ├── useCheckout.ts
│   │   │   │   └── useInvoices.ts
│   │   │   ├── api/
│   │   │   │   └── billing.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── intelligence/                        ← AI assistant + streaming
│   │   │   ├── components/
│   │   │   │   ├── AIChatPanel/
│   │   │   │   │   ├── AIChatPanel.tsx
│   │   │   │   │   ├── ChatMessage.tsx
│   │   │   │   │   ├── ChatInput.tsx
│   │   │   │   │   └── StreamingCursor.tsx      ← Blinking cursor during stream
│   │   │   │   ├── MeetingSummaryStream/
│   │   │   │   │   └── MeetingSummaryStream.tsx ← SSE-streamed summary
│   │   │   │   └── InsightsPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAIStream.ts               ← Core ReadableStream hook
│   │   │   │   ├── useMeetingSummary.ts
│   │   │   │   └── useAIChat.ts
│   │   │   ├── atoms/
│   │   │   │   └── ai.atoms.ts                  ← Jotai atoms for stream state
│   │   │   └── index.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── components/
│   │   │   │   ├── NotificationSection.tsx
│   │   │   │   ├── NotificationToggle.tsx
│   │   │   │   └── TestNotificationButton.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useNotificationPrefs.ts
│   │   │   ├── api/
│   │   │   │   └── notifications.api.ts
│   │   │   └── index.ts
│   │   │
│   │   └── onboarding/
│   │       ├── components/
│   │       │   ├── OnboardingProgress.tsx       ← Step indicator 1/2/3
│   │       │   ├── WelcomeStep.tsx
│   │       │   ├── CreateTeamStep.tsx
│   │       │   ├── InviteTeamStep.tsx
│   │       │   └── ConnectCalendarStep.tsx
│   │       ├── hooks/
│   │       │   └── useOnboarding.ts
│   │       └── index.ts
│   │
│   │
│   ├── shared/                                  ← SHARED (no feature affiliation)
│   │   │                                           Rule: shared/ NEVER imports from features/
│   │   │
│   │   ├── components/
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx                 ← RSC main shell (sidebar + topbar)
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── SidebarNav.tsx
│   │   │   │   │   ├── SidebarNavItem.tsx
│   │   │   │   │   ├── SidebarTeamSwitcher.tsx
│   │   │   │   │   └── SidebarUser.tsx
│   │   │   │   ├── Topbar/
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── GlobalSearch.tsx         ← Cmd+K command palette
│   │   │   │   │   └── NotificationBell.tsx
│   │   │   │   ├── MobileNav.tsx                ← Bottom nav (mobile)
│   │   │   │   ├── MobileDrawer.tsx             ← Slide-in sidebar (mobile)
│   │   │   │   ├── PageContainer.tsx            ← Max-width + padding
│   │   │   │   ├── PageHeader.tsx               ← Title + subtitle + actions slot
│   │   │   │   └── SettingsSidebar.tsx          ← Settings tab navigation
│   │   │   │
│   │   │   ├── feedback/
│   │   │   │   ├── EmptyState.tsx               ← Generic icon + title + CTA
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── DataLoadingError.tsx         ← Error + retry button
│   │   │   │   ├── ConfirmModal.tsx             ← Generic confirm/cancel dialog
│   │   │   │   ├── OfflineBanner.tsx            ← Network lost banner
│   │   │   │   ├── Toast/
│   │   │   │   │   ├── Toast.tsx
│   │   │   │   │   └── Toaster.tsx              ← Toast container/portal
│   │   │   │   └── GlobalLoadingBar.tsx         ← Top-of-page progress bar
│   │   │   │
│   │   │   └── data-display/
│   │   │       ├── VirtualList.tsx              ← @tanstack/react-virtual wrapper
│   │   │       ├── InfiniteScroll.tsx
│   │   │       ├── DataTable/
│   │   │       │   ├── DataTable.tsx            ← TanStack Table
│   │   │       │   ├── DataTableHeader.tsx
│   │   │       │   ├── DataTableRow.tsx
│   │   │       │   └── DataTablePagination.tsx
│   │   │       ├── RelativeTime.tsx             ← "2 hours ago"
│   │   │       ├── StatusDot.tsx                ← Green/amber/red dot
│   │   │       └── CopyButton.tsx               ← Copy to clipboard
│   │   │
│   │   ├── providers/
│   │   │   ├── Providers.tsx                    ← Root client providers wrapper
│   │   │   ├── QueryProvider.tsx                ← TanStack Query client
│   │   │   ├── AuthProvider.tsx                 ← Auth state + silent refresh
│   │   │   ├── WebSocketProvider.tsx            ← Socket.io connection
│   │   │   ├── ThemeProvider.tsx                ← next-themes (light/dark)
│   │   │   └── AnalyticsProvider.tsx            ← PostHog + Sentry init
│   │   │
│   │   └── hooks/
│   │       ├── useDebounce.ts
│   │       ├── useMediaQuery.ts
│   │       ├── useOnClickOutside.ts
│   │       ├── useLocalStorage.ts
│   │       ├── useCopyToClipboard.ts
│   │       ├── useKeyboardShortcut.ts
│   │       ├── useIntersectionObserver.ts
│   │       ├── useScrollReveal.ts
│   │       └── useNetworkStatus.ts              ← Online/offline detection
│   │
│   │
│   ├── store/                                   ← Global Zustand stores
│   │   ├── auth.store.ts                        ← accessToken (memory) + user
│   │   ├── ui.store.ts                          ← Sidebar, modals, toasts
│   │   ├── realtime.store.ts                    ← WS connection status, presence
│   │   └── index.ts                             ← Typed useStore hook exports
│   │
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                        ← Axios instance + interceptors
│   │   │   └── query-client.ts                  ← TanStack Query client config
│   │   ├── websocket/
│   │   │   ├── socket.ts                        ← Socket.io client singleton
│   │   │   ├── socket.events.ts                 ← Event name constants
│   │   │   └── socket.middleware.ts             ← Auth + reconnect logic
│   │   ├── streaming/
│   │   │   ├── ai-stream.ts                     ← ReadableStream SSE decoder
│   │   │   └── stream-parser.ts                 ← SSE chunk parser
│   │   ├── cache/
│   │   │   ├── query-keys.ts                    ← All TanStack Query key factories
│   │   │   └── cache-config.ts                  ← staleTime/gcTime per query type
│   │   └── utils/
│   │       ├── cn.ts                            ← clsx + tailwind-merge
│   │       ├── format-date.ts
│   │       ├── format-duration.ts
│   │       ├── slugify.ts
│   │       └── platform-detect.ts              ← Detect Zoom/Meet/Teams URL
│   │
│   │
│   └── types/
│       ├── global.d.ts                          ← Window + process augmentations
│       └── env.d.ts                             ← process.env type safety
│
│
├── public/
│   ├── icons/                                   ← Integration + platform SVGs
│   │   ├── zoom.svg
│   │   ├── google-meet.svg
│   │   ├── teams.svg
│   │   ├── slack.svg
│   │   ├── jira.svg
│   │   ├── linear.svg
│   │   ├── notion.svg
│   │   ├── google-calendar.svg
│   │   ├── google.svg
│   │   └── github.svg
│   ├── fonts/                                   ← Self-hosted fonts (performance)
│   ├── images/
│   │   └── og-image.png                         ← 1200×630 social share image
│   ├── manifest.json                            ← PWA manifest
│   ├── sw.js                                    ← Service Worker (generated)
│   ├── offline.html                             ← Offline fallback page
│   └── robots.txt                               ← (generated by app/robots.ts)
│
│
├── tests/
│   ├── unit/                                    ← Vitest unit tests
│   │   └── features/
│   │       ├── auth/
│   │       ├── commitments/
│   │       └── meetings/
│   ├── integration/                             ← Vitest integration tests
│   └── e2e/                                     ← Playwright end-to-end
│       ├── auth.spec.ts
│       ├── onboarding.spec.ts
│       ├── meetings.spec.ts
│       └── commitments.spec.ts
│
│
├── next.config.ts                               ← Next.js config (images, headers, CSP)
├── tailwind.config.ts                           ← Design tokens + typography scale
├── tsconfig.json                                ← Strict mode + path aliases
├── vitest.config.ts                             ← Unit test config
├── playwright.config.ts                         ← E2E test config
├── .env.example                                 ← All required env vars documented
└── package.json
```

---

## 3. Backend — Node.js Express API

```
services/api/
│
├── src/
│   │
│   ├── modules/                                 ← Feature modules
│   │   │                                           Pattern: controller → service → repository
│   │   │                                           controller: HTTP only (req/res)
│   │   │                                           service:    Business logic
│   │   │                                           repository: DB queries only
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.controller.ts               ← HTTP handlers (req/res only)
│   │   │   ├── auth.service.ts                  ← All auth business logic
│   │   │   ├── auth.repository.ts               ← All DB queries for auth
│   │   │   ├── auth.validator.ts                ← Zod request schemas
│   │   │   ├── auth.types.ts                    ← TypeScript interfaces
│   │   │   ├── auth.routes.ts                   ← Express route definitions
│   │   │   └── oauth/
│   │   │       ├── google.oauth.ts              ← Google OAuth 2.0 flow
│   │   │       └── github.oauth.ts              ← GitHub OAuth flow
│   │   │
│   │   ├── meetings/
│   │   │   ├── meetings.controller.ts
│   │   │   ├── meetings.service.ts              ← CRUD + Recall.ai bot trigger
│   │   │   ├── meetings.repository.ts
│   │   │   ├── meetings.validator.ts
│   │   │   ├── meetings.types.ts
│   │   │   └── meetings.routes.ts
│   │   │
│   │   ├── commitments/
│   │   │   ├── commitments.controller.ts
│   │   │   ├── commitments.service.ts           ← CRUD + score recalculation
│   │   │   ├── commitments.repository.ts
│   │   │   ├── commitments.validator.ts
│   │   │   ├── commitments.types.ts
│   │   │   ├── commitments.routes.ts
│   │   │   ├── commitment-resolver.service.ts   ← CORE: cross-meeting matching
│   │   │   └── owner-resolver.service.ts        ← Speaker name → userId mapping
│   │   │
│   │   ├── action-items/
│   │   │   ├── action-items.controller.ts
│   │   │   ├── action-items.service.ts
│   │   │   ├── action-items.repository.ts
│   │   │   ├── action-items.validator.ts
│   │   │   ├── action-items.types.ts
│   │   │   └── action-items.routes.ts
│   │   │
│   │   ├── teams/
│   │   │   ├── teams.controller.ts
│   │   │   ├── teams.service.ts                 ← Team CRUD + invite members
│   │   │   ├── teams.repository.ts
│   │   │   ├── teams.validator.ts
│   │   │   ├── teams.types.ts
│   │   │   ├── teams.routes.ts
│   │   │   └── team-health.service.ts           ← Compute team health score
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── analytics.repository.ts          ← Aggregation queries
│   │   │   ├── analytics.types.ts
│   │   │   └── analytics.routes.ts
│   │   │
│   │   ├── integrations/
│   │   │   ├── integrations.controller.ts
│   │   │   ├── integrations.service.ts          ← OAuth token management
│   │   │   ├── integrations.repository.ts
│   │   │   ├── integrations.validator.ts
│   │   │   ├── integrations.types.ts
│   │   │   ├── integrations.routes.ts
│   │   │   └── providers/
│   │   │       ├── google-calendar.provider.ts  ← Google Calendar API client
│   │   │       ├── jira.provider.ts             ← Jira REST API client
│   │   │       ├── linear.provider.ts           ← Linear GraphQL client
│   │   │       ├── slack.provider.ts            ← Slack Web API client
│   │   │       └── notion.provider.ts           ← Notion API client
│   │   │
│   │   ├── billing/
│   │   │   ├── billing.controller.ts
│   │   │   ├── billing.service.ts               ← Stripe subscription logic
│   │   │   ├── billing.repository.ts
│   │   │   ├── billing.validator.ts
│   │   │   ├── billing.types.ts
│   │   │   ├── billing.routes.ts
│   │   │   └── plans.config.ts                  ← Plan limits per tier (FREE/GROWTH/etc)
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts         ← Route to email / Slack / push
│   │   │   ├── notifications.repository.ts      ← Prefs storage
│   │   │   ├── notifications.types.ts
│   │   │   ├── notifications.routes.ts
│   │   │   ├── email.service.ts                 ← Resend SDK wrapper
│   │   │   ├── slack-notify.service.ts          ← Slack Block Kit messages
│   │   │   └── templates/                       ← React Email templates
│   │   │       ├── CommitmentMissed.tsx
│   │   │       ├── ManagerAlert.tsx
│   │   │       ├── DeadlineReminder.tsx
│   │   │       ├── MeetingSummary.tsx
│   │   │       ├── WeeklyDigest.tsx
│   │   │       ├── TeamInvite.tsx
│   │   │       ├── VerifyEmail.tsx
│   │   │       └── PasswordReset.tsx
│   │   │
│   │   ├── webhooks/
│   │   │   ├── recall.webhook.ts                ← Recall.ai bot event handler
│   │   │   ├── stripe.webhook.ts                ← Stripe billing event handler
│   │   │   ├── jira.webhook.ts                  ← Jira reverse sync handler
│   │   │   ├── slack.webhook.ts                 ← Slack interactive actions
│   │   │   ├── webhooks.validator.ts            ← HMAC signature verification
│   │   │   └── webhooks.routes.ts               ← No JWT auth, signature only
│   │   │
│   │   ├── api-keys/
│   │   │   ├── api-keys.controller.ts
│   │   │   ├── api-keys.service.ts              ← Key generation + hashing
│   │   │   ├── api-keys.repository.ts
│   │   │   ├── api-keys.types.ts
│   │   │   └── api-keys.routes.ts
│   │   │
│   │   ├── jobs/                                ← Async job management module
│   │   │   ├── jobs.controller.ts               ← GET /jobs/:id, SSE stream
│   │   │   ├── jobs.repository.ts               ← Job status in PostgreSQL
│   │   │   └── jobs.routes.ts
│   │   │
│   │   └── health/
│   │       └── health.routes.ts                 ← GET /health + GET /ready
│   │
│   │
│   ├── queues/                                  ← Bull queue setup + workers
│   │   ├── queue.client.ts                      ← Bull + Redis connection + queue defs
│   │   ├── scheduler.ts                         ← All cron job definitions
│   │   │
│   │   ├── workers/
│   │   │   ├── transcribe.worker.ts             ← Store transcript → push to extract
│   │   │   ├── extract.worker.ts                ← Call FastAPI → save to DB
│   │   │   ├── notify.worker.ts                 ← Route + send all notifications
│   │   │   ├── integrate.worker.ts              ← Sync to Jira/Linear/Notion
│   │   │   ├── deadline.worker.ts               ← Check overdue commitments (cron)
│   │   │   └── calendar-sync.worker.ts          ← Hourly calendar scan (cron)
│   │   │
│   │   └── jobs/                                ← Job type + payload definitions
│   │       ├── transcribe.job.ts
│   │       ├── extract.job.ts
│   │       ├── notify.job.ts
│   │       ├── integrate.job.ts
│   │       └── deadline.job.ts
│   │
│   │
│   ├── realtime/
│   │   ├── socket.server.ts                     ← Socket.io server + JWT auth middleware
│   │   ├── socket.events.ts                     ← All event name constants (shared with FE)
│   │   └── rooms.manager.ts                     ← Room isolation per team
│   │
│   │
│   ├── services/                                ← Shared infrastructure services
│   │   │                                           (used by multiple modules)
│   │   ├── recall.service.ts                    ← Recall.ai REST API client
│   │   ├── ai-pipeline.client.ts                ← HTTP client → FastAPI service
│   │   ├── calendar-sync.service.ts             ← Google Calendar scan + dedup logic
│   │   ├── crypto.service.ts                    ← AES-256-GCM encrypt/decrypt tokens
│   │   ├── cache.service.ts                     ← Redis cache-aside helpers
│   │   ├── usage.service.ts                     ← Track usage events + quota check
│   │   ├── score.service.ts                     ← Commitment score calculation
│   │   └── mongo.service.ts                     ← MongoDB transcript operations
│   │
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts                   ← Verify JWT access token
│   │   ├── api-key.middleware.ts                ← Verify API key (M2M)
│   │   ├── tenant.middleware.ts                 ← Inject teamId from JWT
│   │   ├── plan-limits.middleware.ts            ← Enforce meeting/member quotas
│   │   ├── role.middleware.ts                   ← requireRole() factory
│   │   ├── scope.middleware.ts                  ← requireScope() for API keys
│   │   ├── validate.middleware.ts               ← Zod request body validation
│   │   ├── idempotency.middleware.ts            ← X-Idempotency-Key handling
│   │   ├── rate-limit.middleware.ts             ← Redis sliding window rate limiter
│   │   ├── deprecation.middleware.ts            ← Deprecation + Sunset headers
│   │   ├── request-logger.middleware.ts         ← Pino structured request logging
│   │   └── error.middleware.ts                  ← Global error handler (MUST be last)
│   │
│   │
│   ├── db/
│   │   ├── client.ts                            ← Prisma client singleton
│   │   └── mongo.client.ts                      ← MongoDB Atlas connection singleton
│   │
│   │
│   ├── config/
│   │   ├── env.ts                               ← Zod env validation (fail-fast on startup)
│   │   ├── redis.ts                             ← ioredis connection
│   │   ├── logger.ts                            ← Pino logger instance
│   │   └── cors.ts                              ← CORS origin config per environment
│   │
│   │
│   ├── utils/
│   │   ├── errors.ts                            ← Custom error class hierarchy
│   │   ├── response.ts                          ← success() / error() response helpers
│   │   ├── async-handler.ts                     ← asyncHandler Express wrapper
│   │   ├── pagination.ts                        ← buildPaginationMeta() + cursor encode/decode
│   │   ├── filters.ts                           ← Query filter DSL parser
│   │   └── date.ts                              ← Date helpers (addDays, subDays, etc.)
│   │
│   │
│   ├── app.ts                                   ← Express app factory (no listen call)
│   └── server.ts                                ← Entry point + graceful shutdown
│
│
├── prisma/
│   ├── schema.prisma                            ← Full PostgreSQL schema (15 tables)
│   ├── migrations/                              ← Auto-generated Prisma migrations
│   │   ├── 20260501000000_init/
│   │   │   └── migration.sql
│   │   ├── 20260510000000_add_api_keys/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── seed.ts                                  ← Dev seed data (1 team, 2 users, meetings)
│
│
├── tests/
│   ├── unit/
│   │   ├── commitment-resolver.test.ts          ← Core logic unit tests
│   │   ├── owner-resolver.test.ts
│   │   ├── team-health.test.ts
│   │   ├── score.test.ts
│   │   ├── crypto.test.ts
│   │   ├── pagination.test.ts
│   │   └── filters.test.ts
│   │
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── meetings.test.ts
│   │   ├── commitments.test.ts
│   │   ├── billing.test.ts
│   │   ├── webhooks.test.ts
│   │   └── rate-limiting.test.ts
│   │
│   ├── e2e/
│   │   ├── auth-flow.test.ts                    ← Register → verify → login
│   │   ├── meeting-flow.test.ts                 ← Create → bot → extract
│   │   └── commitment-flow.test.ts              ← Extract → track → alert
│   │
│   └── fixtures/
│       ├── users.fixture.ts
│       ├── teams.fixture.ts
│       ├── meetings.fixture.ts
│       └── transcripts.fixture.ts               ← Sample transcript JSON
│
│
├── .env.example
├── tsconfig.json
├── jest.config.ts
├── Dockerfile
├── Dockerfile.dev
└── package.json
```

---

## 4. AI Pipeline — Python FastAPI

```
services/ai-pipeline/
│
├── src/
│   │
│   ├── api/
│   │   ├── main.py                              ← FastAPI app, lifespan, CORS, middleware
│   │   ├── deps.py                              ← FastAPI dependency injection
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py                        ← GET /health
│   │       ├── extract.py                       ← POST /extract (main AI endpoint)
│   │       ├── summarize.py                     ← POST /summarize
│   │       └── resolve.py                       ← POST /resolve (cross-meeting)
│   │
│   │
│   ├── services/
│   │   │
│   │   ├── extraction/
│   │   │   ├── __init__.py
│   │   │   ├── extractor.py                     ← Main extraction orchestrator
│   │   │   ├── commitment_parser.py             ← Post-process + confidence calibration
│   │   │   ├── action_item_parser.py            ← Priority assignment + dedup
│   │   │   ├── decision_parser.py
│   │   │   └── blocker_parser.py
│   │   │
│   │   ├── resolution/
│   │   │   ├── __init__.py
│   │   │   ├── commitment_resolver.py           ← Cross-meeting matching (CORE)
│   │   │   ├── similarity.py                    ← TF-IDF cosine similarity
│   │   │   └── resolution_detector.py           ← Is this a completion statement?
│   │   │
│   │   ├── claude_client.py                     ← Anthropic SDK wrapper + retry logic
│   │   ├── transcript_processor.py              ← Clean + chunk large transcripts
│   │   └── date_parser.py                       ← NLP date → ISO (by Friday → 2026-05-15)
│   │
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── request_models.py                    ← All Pydantic input schemas
│   │   └── response_models.py                   ← All Pydantic output schemas
│   │
│   │
│   ├── prompts/
│   │   ├── extraction_system.txt                ← Main Claude system prompt
│   │   ├── extraction_user.txt                  ← User prompt template
│   │   ├── summary_system.txt                   ← Meeting summary prompt
│   │   ├── summary_user.txt
│   │   ├── resolution_system.txt                ← Resolve commitment prompt
│   │   └── followup_email.txt                   ← Follow-up email draft prompt
│   │
│   │
│   └── config/
│       ├── settings.py                          ← Pydantic BaseSettings (all env vars)
│       └── logging.py                           ← Structured JSON logging setup
│
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                              ← pytest fixtures
│   ├── test_extractor.py
│   ├── test_commitment_parser.py
│   ├── test_action_item_parser.py
│   ├── test_commitment_resolver.py
│   ├── test_similarity.py
│   ├── test_date_parser.py
│   ├── test_resolution_detector.py
│   └── fixtures/
│       ├── sample_transcript_standup.json       ← 15-min standup fixture
│       ├── sample_transcript_sprint.json        ← 45-min sprint review fixture
│       ├── sample_transcript_large.json         ← 2-hour meeting (chunking test)
│       ├── expected_extraction_standup.json     ← Expected output for standup
│       └── expected_extraction_sprint.json
│
│
├── requirements.txt                             ← Production dependencies
├── requirements-dev.txt                         ← Dev + test dependencies
├── pyproject.toml                               ← Project metadata
├── pytest.ini                                   ← Test config
├── Dockerfile
├── Dockerfile.dev
└── .env.example
```

---

## 5. Shared Packages

```
packages/
│
├── shared-types/                                ← @vocaply/types
│   ├── src/
│   │   ├── user.ts                              ← User, UserRole, Session
│   │   ├── team.ts                              ← Team, TeamMember, PlanType
│   │   ├── meeting.ts                           ← Meeting, MeetingStatus, Platform
│   │   ├── commitment.ts                        ← Commitment, CommitmentStatus
│   │   ├── action-item.ts                       ← ActionItem, Priority
│   │   ├── integration.ts                       ← Integration, Provider, OAuthToken
│   │   ├── billing.ts                           ← Plan, Subscription, Usage, Invoice
│   │   ├── analytics.ts                         ← AnalyticsOverview, MemberStats, Trend
│   │   ├── notification.ts                      ← NotificationPreferences
│   │   ├── api-key.ts                           ← ApiKey, ApiKeyScope
│   │   ├── job.ts                               ← AsyncJob, JobStatus
│   │   ├── webhook.ts                           ← WebhookRegistration, WebhookEvent
│   │   ├── api.ts                               ← ApiResponse, PaginatedResponse, Error
│   │   └── index.ts                             ← Re-export everything
│   ├── package.json
│   └── tsconfig.json
│
│
├── validators/                                  ← @vocaply/validators
│   ├── src/
│   │   ├── auth.validators.ts                   ← registerSchema, loginSchema
│   │   ├── meeting.validators.ts
│   │   ├── commitment.validators.ts
│   │   ├── team.validators.ts
│   │   ├── billing.validators.ts
│   │   ├── query.validators.ts                  ← Filter, pagination, sort schemas
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
│
├── ui-kit/                                      ← @vocaply/ui (design system primitives)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Switch.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Drawer.tsx
│   │   │   ├── Dropdown.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Popover.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Progress.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── Separator.tsx
│   │   │   ├── Alert.tsx
│   │   │   ├── DatePicker.tsx
│   │   │   └── CommandPalette.tsx               ← Cmd+K global search
│   │   ├── tokens/
│   │   │   ├── colors.ts                        ← All brand color tokens
│   │   │   ├── typography.ts                    ← Font families + scale
│   │   │   └── spacing.ts                       ← Base unit + scale
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
│
├── analytics/                                   ← @vocaply/analytics
│   ├── src/
│   │   ├── posthog.ts                           ← PostHog client setup
│   │   ├── events.ts                            ← All event name constants
│   │   ├── track.ts                             ← trackEvent() helper
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
│
└── config/                                      ← Shared tooling configs
    ├── eslint/
    │   ├── base.js                              ← Base ESLint rules
    │   ├── nextjs.js                            ← Next.js-specific rules
    │   └── node.js                              ← Node.js-specific rules
    ├── typescript/
    │   ├── base.json                            ← Base tsconfig (strict mode)
    │   ├── nextjs.json                          ← Next.js extends base
    │   └── node.json                            ← Node.js extends base
    └── tailwind/
        └── index.js                             ← Shared Tailwind preset + tokens
```

---

## 6. Infrastructure & DevOps

```
infra/
│
├── docker/
│   ├── docker-compose.yml                       ← Local dev: Postgres + MongoDB + Redis
│   └── docker-compose.prod.yml                  ← Production multi-service compose
│
│
├── k8s/                                         ← Kubernetes (scale phase, 100K+ users)
│   ├── namespaces/
│   │   └── vocaply.yaml
│   ├── deployments/
│   │   ├── api-deployment.yaml
│   │   ├── ai-pipeline-deployment.yaml
│   │   └── worker-deployment.yaml               ← Separate deployment for Bull workers
│   ├── services/
│   │   ├── api-service.yaml
│   │   └── ai-pipeline-service.yaml
│   ├── ingress/
│   │   └── ingress.yaml                         ← Nginx ingress + TLS
│   ├── configmaps/
│   │   └── app-config.yaml
│   ├── secrets/
│   │   └── app-secrets.yaml                     ← Gitignored, use Sealed Secrets
│   └── hpa/
│       ├── api-hpa.yaml                         ← Horizontal Pod Autoscaler
│       └── ai-pipeline-hpa.yaml
│
│
├── terraform/                                   ← AWS Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── modules/
│   │   ├── rds/                                 ← AWS RDS PostgreSQL
│   │   ├── elasticache/                         ← AWS ElastiCache Redis
│   │   ├── s3/                                  ← Audio file storage
│   │   ├── cloudfront/                          ← CDN for static assets
│   │   └── vpc/                                 ← Network configuration
│   └── environments/
│       ├── staging/
│       │   ├── main.tf
│       │   └── variables.tfvars
│       └── production/
│           ├── main.tf
│           └── variables.tfvars
│
│
├── nginx/
│   ├── nginx.conf                               ← Global Nginx config
│   └── vocaply.conf                             ← Reverse proxy: api.vocaply.com
│
│
└── github-actions/
    ├── ci.yml                                   ← Lint + test on every PR
    ├── deploy-web.yml                           ← Deploy Next.js → Vercel
    ├── deploy-api.yml                           ← Deploy Node.js → Railway/ECS
    ├── deploy-ai.yml                            ← Deploy FastAPI → Railway/ECS
    ├── database-migrate.yml                     ← Run prisma migrate deploy
    └── release.yml                              ← Semantic version tag + release
```

---

## 7. Database Layer

```
Database Files (distributed across services):

services/api/prisma/
│
├── schema.prisma                                ← Complete PostgreSQL schema
│   Defines 15 models:
│   ├── User                    (auth + profile)
│   ├── RefreshToken            (JWT rotation)
│   ├── EmailVerificationToken  (email verify)
│   ├── PasswordResetToken      (password reset)
│   ├── Team                    (billing unit)
│   ├── Meeting                 (recording records)
│   ├── MeetingParticipant      (speaker tracking)
│   ├── Commitment              ← THE CORE TABLE
│   ├── ActionItem              (tasks)
│   ├── Decision                (meeting decisions)
│   ├── Blocker                 (blockers mentioned)
│   ├── TeamIntegration         (Jira/Slack tokens - encrypted)
│   ├── UserIntegration         (Calendar tokens - encrypted)
│   ├── Subscription            (Stripe subscription)
│   └── UsageEvent              (quota tracking)
│
├── migrations/                                  ← Prisma auto-generated SQL migrations
│   └── [timestamp]_[name]/migration.sql
│
└── seed.ts                                      ← Dev seed (teams + users + meetings)


MongoDB Collections (managed via mongo.client.ts):
│
└── Collection: transcripts
    └── Document structure:
        ├── meeting_id         ← FK to PostgreSQL
        ├── team_id
        ├── raw_transcript[]   ← Speaker turns with timestamps
        ├── full_text          ← Concatenated for Atlas Search
        ├── ai_extraction{}    ← Claude AI output
        └── processing_status


Redis Key Spaces (managed via cache.service.ts):
│
├── Bull Queue Keys            ← Bull managed (auto)
├── oauth:state:{hex}          ← OAuth CSRF protection
├── ratelimit:login:{hash}     ← Login brute force
├── ratelimit:api:{userId}     ← API rate limit
├── bot:scheduled:{p}:{id}    ← Bot deduplication
├── cache:team:*               ← Team data cache
├── cache:user:*               ← User profile cache
├── notif:sent:*               ← Notification dedup
└── idempotency:*              ← Idempotency keys
```

---

## 8. File-by-File Purpose Reference

### Frontend Key Files

```
FILE                                    PURPOSE
─────────────────────────────────────────────────────────────────────────────────────────
app/layout.tsx                          Root HTML, fonts, metadata, OG tags, providers
app/globals.css                         Design tokens as CSS vars, Tailwind base, resets
app/(dashboard)/layout.tsx             Dashboard shell: sidebar + topbar + WebSocket init
features/auth/store/auth.store.ts      ACCESS TOKEN IN MEMORY ONLY — never localStorage
features/auth/hooks/useAuth.ts         Current user + isAuthenticated (consumed everywhere)
shared/lib/api/client.ts               Axios base with auto-refresh interceptor on 401
shared/lib/cache/query-keys.ts         ALL TanStack Query keys (centralized, tenant-scoped)
shared/lib/websocket/socket.ts         Socket.io singleton: connect once, use everywhere
shared/providers/WebSocketProvider.tsx Connects socket, joins team room, registers events
shared/providers/AuthProvider.tsx      Calls /auth/refresh on app load (silent auth check)
app/api/auth/refresh/route.ts          BFF: proxies token refresh (keeps secret server-side)
app/api/ai/stream/route.ts             BFF: streams AI responses (edge runtime, no buffering)
```

### Backend Key Files

```
FILE                                    PURPOSE
─────────────────────────────────────────────────────────────────────────────────────────
src/app.ts                             Express app factory (all middleware registered here)
src/server.ts                          Entry point: listen() + graceful shutdown handler
src/config/env.ts                      Zod env validation: app crashes at startup if missing
src/modules/auth/auth.service.ts       All auth logic: register, login, token rotation
src/modules/commitments/
  commitment-resolver.service.ts       MOST IMPORTANT: cross-meeting matching algorithm
src/modules/webhooks/
  recall.webhook.ts                    Recall.ai event → update status → queue extraction
src/queues/workers/extract.worker.ts   Transcript → FastAPI → save all results → notify
src/queues/workers/deadline.worker.ts  Daily cron: find PENDING past due → mark MISSED → alert
src/services/crypto.service.ts         AES-256-GCM: encrypts all OAuth tokens before storage
src/services/recall.service.ts         Schedules Recall.ai bots via REST API
src/middleware/auth.middleware.ts       JWT verify: attaches req.user to every request
src/middleware/tenant.middleware.ts     Extracts teamId from JWT: attaches req.teamId
src/middleware/idempotency.middleware.ts X-Idempotency-Key: cache+replay response from Redis
src/realtime/socket.server.ts          Socket.io: JWT auth, team rooms, all event emitters
prisma/schema.prisma                   Complete PostgreSQL schema — source of truth for DB
```

### AI Pipeline Key Files

```
FILE                                    PURPOSE
─────────────────────────────────────────────────────────────────────────────────────────
src/api/main.py                        FastAPI app: CORS, middleware, route registration
src/services/extraction/extractor.py  Orchestrates: preprocess → chunk → Claude → postprocess
src/services/claude_client.py         Anthropic SDK: retry logic, JSON parsing, cost tracking
src/services/transcript_processor.py  Formats turns, builds speaker map, chunks > 120K tokens
src/services/date_parser.py           NLP: "by Friday" → "2026-05-15T23:59:59Z"
src/services/resolution/
  commitment_resolver.py              CORE: TF-IDF similarity matching across meetings
  similarity.py                       Cosine similarity + keyword overlap ratio
  resolution_detector.py             Two-stage: keyword check → Claude binary (YES/NO)
src/prompts/extraction_system.txt     MOST IMPORTANT PROMPT: defines all extraction rules
src/models/request_models.py          Pydantic: all input schemas (strict validation)
src/models/response_models.py         Pydantic: all output schemas (typed responses)
```

---

## Summary — Scale Numbers

```
LAYER                  FILES     PURPOSE
───────────────────────────────────────────────────────────────────────────────
Frontend (Next.js)
  app/ (routes)          45+    Routing only — no business logic
  features/ (modules)     8     Vertical feature slices: meetings, commitments, etc.
  shared/ (common)       30+    Layout, providers, hooks, utilities
  Total components       90+    UI + feature + layout components

Backend (Node.js)
  modules/ (features)    11     Feature modules: controller → service → repository
  queues/ (workers)       6     Async job processing workers
  middleware/            12     Auth, tenant, rate limit, idempotency, validation
  services/               8     Shared infrastructure (recall, AI, crypto, score)

AI Pipeline (Python)
  api/ (routes)           4     Extract, resolve, summarize, health
  services/               9     Extractor, Claude client, resolver, similarity, dates
  prompts/                5     Claude system + user prompts

Shared Packages          4     types, validators, ui-kit, analytics, config

Infrastructure           3     docker-compose, k8s manifests, terraform, CI/CD

Total approximate:      250+   Source files across the entire monorepo

SUPPORTS:
  ✓ 1,000,000+ users       (horizontal scaling, read replicas)
  ✓ Multi-tenancy          (team_id on every query, RLS backup)
  ✓ Real-time updates      (Socket.io + Redis adapter)
  ✓ AI streaming           (ReadableStream + SSE)
  ✓ Async processing       (Bull queues, 6 worker types)
  ✓ Zero-downtime deploys  (graceful shutdown, health checks)
  ✓ Type safety end-to-end (shared-types package, no 'any')
  ✓ Feature isolation      (eslint-plugin-boundaries enforcement)
  ✓ Full observability     (Pino logging, Sentry, PostHog, metrics)
```

---

*Document: FILE-STRUCTURE-001 | Vocaply | Version 1.0 | May 2026*
*Full Scalable Industry-Level Monorepo: Frontend + Backend + AI Pipeline*
