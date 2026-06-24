# Vocaply — 100-Day Build Plan
> Senior Software Engineer Edition | Full-Stack Production-Grade SaaS
> Stack: Next.js 14 · Node.js · Python FastAPI · PostgreSQL · MongoDB · Redis
> Document: BUILD-PLAN-001 | Version 1.0 | June 2026

---

## Table of Contents

1. [Project Philosophy](#1-project-philosophy)
2. [Full File Structure — Frontend](#2-full-file-structure--frontend)
3. [Full File Structure — Backend](#3-full-file-structure--backend)
4. [Full File Structure — AI Pipeline](#4-full-file-structure--ai-pipeline)
5. [Full File Structure — Shared & Infra](#5-full-file-structure--shared--infra)
6. [100-Day Sprint Overview](#6-100-day-sprint-overview)
7. [Day 1 — Detailed Plan](#7-day-1--detailed-plan)
8. [Day 2 — Detailed Plan](#8-day-2--detailed-plan)

---

## 1. Project Philosophy

### Build Order Principle

```
NEVER build UI before the foundation.
NEVER build features before auth.
NEVER build features before the database schema.
NEVER build integrations before core features work.

ORDER:
  Foundation → Auth → Database → Core API → Core UI → Features → Integrations → Polish → Deploy
```

### 100-Day Breakdown (High Level)

```
PHASE 1 — Foundation (Days 1–10):
  Monorepo setup, design system, database schema, auth system

PHASE 2 — Core Backend (Days 11–25):
  All API endpoints, queue workers, webhook handlers

PHASE 3 — Core Frontend (Days 26–45):
  Dashboard shell, meetings, commitments, action items

PHASE 4 — AI Pipeline (Days 46–55):
  FastAPI service, Claude extraction, cross-meeting memory

PHASE 5 — Integrations (Days 56–70):
  Jira, Slack, Linear, Notion, Google Calendar

PHASE 6 — Landing Page (Days 71–80):
  Full 20-section landing page (already planned in docs)

PHASE 7 — Billing & Analytics (Days 81–88):
  Stripe, subscription management, analytics dashboard

PHASE 8 — Polish & Production (Days 89–100):
  Performance, testing, SEO, accessibility, deployment
```

---

## 2. Full File Structure — Frontend

```
apps/web/
│
├── src/
│   │
│   ├── app/                                           # Next.js App Router (routing only)
│   │   │
│   │   ├── (marketing)/                               # Public marketing pages
│   │   │   ├── layout.tsx                             # Marketing shell — Nav + Footer
│   │   │   ├── page.tsx                               # Landing page (20 sections)
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   └── compare/
│   │   │       └── [competitor]/page.tsx              # SEO comparison pages
│   │   │
│   │   ├── (auth)/                                    # Auth pages — no sidebar
│   │   │   ├── layout.tsx                             # Centered card layout
│   │   │   ├── login/
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   ├── register/
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   ├── verify-email/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   └── reset-password/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (dashboard)/                               # Protected app — sidebar + topbar
│   │   │   ├── layout.tsx                             # RSC: fetch user+team → AppShell
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx                           # Home feed
│   │   │   │   ├── loading.tsx
│   │   │   │   └── error.tsx
│   │   │   │
│   │   │   ├── meetings/
│   │   │   │   ├── page.tsx                           # Meetings list
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   └── [meetingId]/
│   │   │   │       ├── page.tsx                       # Meeting detail — overview tab
│   │   │   │       ├── loading.tsx
│   │   │   │       ├── error.tsx
│   │   │   │       ├── transcript/
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── loading.tsx
│   │   │   │       ├── action-items/
│   │   │   │       │   └── page.tsx
│   │   │   │       └── commitments/
│   │   │   │           └── page.tsx
│   │   │   │
│   │   │   ├── commitments/
│   │   │   │   ├── page.tsx                           # Team commitment tracker
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   └── [commitmentId]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── action-items/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   └── error.tsx
│   │   │   │
│   │   │   ├── team/
│   │   │   │   ├── page.tsx                           # Team health dashboard
│   │   │   │   ├── loading.tsx
│   │   │   │   └── [memberId]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── loading.tsx
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   │
│   │   │   ├── intelligence/                          # AI chat workspace
│   │   │   │   ├── page.tsx
│   │   │   │   └── loading.tsx
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── layout.tsx                         # Settings sidebar tabs
│   │   │       ├── page.tsx                           # Redirect to /settings/profile
│   │   │       ├── profile/page.tsx
│   │   │       ├── team/page.tsx
│   │   │       ├── members/page.tsx
│   │   │       ├── integrations/page.tsx
│   │   │       ├── billing/page.tsx
│   │   │       ├── notifications/page.tsx
│   │   │       └── security/page.tsx
│   │   │
│   │   ├── onboarding/
│   │   │   ├── layout.tsx                             # Full-screen, progress bar
│   │   │   ├── page.tsx                               # Step 1: Welcome
│   │   │   ├── create-team/page.tsx                   # Step 2: Team creation
│   │   │   ├── invite-team/page.tsx                   # Step 3: Invite members
│   │   │   └── connect-calendar/page.tsx              # Step 4: Google Calendar OAuth
│   │   │
│   │   ├── invite/
│   │   │   └── [token]/page.tsx                       # Accept team invite link
│   │   │
│   │   ├── api/                                       # Next.js Route Handlers (BFF)
│   │   │   ├── auth/
│   │   │   │   ├── refresh/route.ts                   # Silent token refresh
│   │   │   │   └── logout/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── stream/route.ts                    # AI streaming proxy (edge)
│   │   │   │   └── summarize/route.ts
│   │   │   └── og/route.tsx                           # Dynamic OG image
│   │   │
│   │   ├── layout.tsx                                 # Root: fonts, metadata, providers
│   │   ├── globals.css                                # Design tokens + Tailwind
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── robots.ts
│   │   └── sitemap.ts
│   │
│   │
│   ├── features/                                      # FEATURE MODULES (vertical slices)
│   │   │                                              # Rule: no cross-feature imports
│   │   │
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── RegisterForm.tsx
│   │   │   │   ├── OAuthButton.tsx                    # Google / GitHub button
│   │   │   │   ├── AuthCard.tsx                       # Centered card wrapper
│   │   │   │   ├── PasswordStrengthBar.tsx
│   │   │   │   ├── VerifyEmailPrompt.tsx
│   │   │   │   ├── ForgotPasswordForm.tsx
│   │   │   │   ├── ResetPasswordForm.tsx
│   │   │   │   ├── AuthGuard.tsx                      # Redirect if not authenticated
│   │   │   │   └── SessionExpiredModal.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts                         # Read auth state
│   │   │   │   ├── useLogin.ts
│   │   │   │   ├── useRegister.ts
│   │   │   │   ├── useLogout.ts
│   │   │   │   ├── useRefreshToken.ts
│   │   │   │   └── useOAuth.ts
│   │   │   ├── store/
│   │   │   │   └── auth.store.ts                      # Access token in MEMORY ONLY
│   │   │   ├── api/
│   │   │   │   └── auth.api.ts
│   │   │   ├── types/
│   │   │   │   └── auth.types.ts
│   │   │   └── index.ts                               # Public API of this module
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
│   │   │   │   │   ├── TranscriptViewer.tsx           # Virtualized
│   │   │   │   │   ├── TranscriptTurn.tsx
│   │   │   │   │   └── TranscriptSearch.tsx
│   │   │   │   ├── MeetingFilters.tsx
│   │   │   │   ├── MeetingStatusBadge.tsx
│   │   │   │   ├── MeetingPlatformIcon.tsx
│   │   │   │   ├── MeetingTimeline.tsx                # Bot lifecycle events
│   │   │   │   ├── AddMeetingModal.tsx
│   │   │   │   ├── BotStatusBanner.tsx                # Live "Recording..." banner
│   │   │   │   └── MeetingEmptyState.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useMeetings.ts                     # Cursor paginated
│   │   │   │   ├── useMeeting.ts
│   │   │   │   ├── useCreateMeeting.ts                # With plan limit error handling
│   │   │   │   ├── useDeleteMeeting.ts
│   │   │   │   ├── useMeetingFilters.ts               # URL searchParam state
│   │   │   │   └── useRealtimeMeeting.ts              # WebSocket listener
│   │   │   ├── store/
│   │   │   │   └── meetings.store.ts                  # Live bot statuses
│   │   │   ├── api/
│   │   │   │   ├── meetings.queries.ts
│   │   │   │   └── meetings.mutations.ts
│   │   │   ├── types/
│   │   │   │   └── meetings.types.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── commitments/
│   │   │   ├── components/
│   │   │   │   ├── CommitmentTracker/
│   │   │   │   │   ├── CommitmentTracker.tsx
│   │   │   │   │   └── CommitmentTrackerSkeleton.tsx
│   │   │   │   ├── CommitmentCard/
│   │   │   │   │   ├── CommitmentCard.tsx
│   │   │   │   │   └── CommitmentCard.test.tsx
│   │   │   │   ├── CommitmentTimeline/
│   │   │   │   │   └── CommitmentTimeline.tsx         # Cross-meeting history
│   │   │   │   ├── CommitmentScore/
│   │   │   │   │   └── CommitmentScore.tsx            # SVG donut gauge 0–100
│   │   │   │   ├── CommitmentFilters.tsx
│   │   │   │   ├── CommitmentStats.tsx
│   │   │   │   ├── MarkFulfilledModal.tsx
│   │   │   │   ├── DeferModal.tsx
│   │   │   │   ├── OverdueAlert.tsx
│   │   │   │   └── CommitmentEmptyState.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCommitments.ts
│   │   │   │   ├── useMyCommitments.ts
│   │   │   │   ├── useCommitment.ts
│   │   │   │   ├── useCommitmentStats.ts
│   │   │   │   ├── useMarkFulfilled.ts                # Optimistic update
│   │   │   │   ├── useDeferCommitment.ts
│   │   │   │   ├── useCommitmentFilters.ts
│   │   │   │   └── useRealtimeCommitments.ts
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
│   │   │   │   ├── TrendIndicator.tsx                 # ↑↓→ with color
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
│   │   │   │   │   ├── FulfillmentRateChart.tsx       # Recharts line chart
│   │   │   │   │   ├── MeetingsPerWeekChart.tsx       # Bar chart
│   │   │   │   │   ├── MemberComparisonChart.tsx      # Horizontal bar
│   │   │   │   │   └── TrendLineChart.tsx
│   │   │   │   ├── StatCard.tsx
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
│   │   │   │   ├── IntegrationCard.tsx
│   │   │   │   ├── IntegrationSettings.tsx
│   │   │   │   ├── CalendarEventsPreview.tsx
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
│   │   │   │   ├── UpgradeModal.tsx                   # Shown when plan limit hit
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
│   │   ├── intelligence/
│   │   │   ├── components/
│   │   │   │   ├── AIChatPanel/
│   │   │   │   │   ├── AIChatPanel.tsx
│   │   │   │   │   ├── ChatMessage.tsx
│   │   │   │   │   ├── ChatInput.tsx
│   │   │   │   │   └── StreamingCursor.tsx
│   │   │   │   ├── MeetingSummaryStream/
│   │   │   │   │   └── MeetingSummaryStream.tsx
│   │   │   │   └── InsightsPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAIStream.ts                     # Core ReadableStream hook
│   │   │   │   ├── useMeetingSummary.ts
│   │   │   │   └── useAIChat.ts
│   │   │   ├── atoms/
│   │   │   │   └── ai.atoms.ts                        # Jotai atoms for stream state
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
│   │       │   ├── OnboardingProgress.tsx             # Step 1/2/3/4 indicator
│   │       │   ├── WelcomeStep.tsx
│   │       │   ├── CreateTeamStep.tsx
│   │       │   ├── InviteTeamStep.tsx
│   │       │   └── ConnectCalendarStep.tsx
│   │       ├── hooks/
│   │       │   └── useOnboarding.ts
│   │       └── index.ts
│   │
│   │
│   ├── shared/                                        # Shared — no feature affiliation
│   │   │
│   │   ├── components/
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx                       # RSC main shell
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── SidebarNav.tsx
│   │   │   │   │   ├── SidebarNavItem.tsx
│   │   │   │   │   ├── SidebarTeamSwitcher.tsx
│   │   │   │   │   └── SidebarUser.tsx
│   │   │   │   ├── Topbar/
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── GlobalSearch.tsx               # Cmd+K command palette
│   │   │   │   │   └── NotificationBell.tsx
│   │   │   │   ├── MobileNav.tsx                      # Bottom nav (mobile)
│   │   │   │   ├── MobileDrawer.tsx                   # Slide-in sidebar
│   │   │   │   ├── PageContainer.tsx                  # Max-width + padding
│   │   │   │   ├── PageHeader.tsx                     # Title + subtitle + actions slot
│   │   │   │   └── SettingsSidebar.tsx
│   │   │   │
│   │   │   ├── feedback/
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── DataLoadingError.tsx
│   │   │   │   ├── ConfirmModal.tsx
│   │   │   │   ├── OfflineBanner.tsx
│   │   │   │   ├── FullPageSpinner.tsx
│   │   │   │   ├── GlobalLoadingBar.tsx
│   │   │   │   └── Toast/
│   │   │   │       ├── Toast.tsx
│   │   │   │       └── Toaster.tsx
│   │   │   │
│   │   │   └── data-display/
│   │   │       ├── VirtualList.tsx                    # @tanstack/react-virtual
│   │   │       ├── InfiniteScroll.tsx
│   │   │       ├── DataTable/
│   │   │       │   ├── DataTable.tsx                  # TanStack Table
│   │   │       │   ├── DataTableHeader.tsx
│   │   │       │   └── DataTablePagination.tsx
│   │   │       ├── RelativeTime.tsx                   # "2 hours ago"
│   │   │       ├── StatusDot.tsx
│   │   │       └── CopyButton.tsx
│   │   │
│   │   ├── providers/
│   │   │   ├── Providers.tsx                          # Root client providers
│   │   │   ├── QueryProvider.tsx                      # TanStack Query
│   │   │   ├── AuthProvider.tsx                       # Silent refresh on mount
│   │   │   ├── WebSocketProvider.tsx                  # Socket.io connection
│   │   │   ├── ThemeProvider.tsx                      # next-themes
│   │   │   └── AnalyticsProvider.tsx                  # PostHog + Sentry init
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
│   │       └── useNetworkStatus.ts
│   │
│   │
│   ├── store/                                         # Global Zustand stores
│   │   ├── auth.store.ts                              # Token (memory) + user
│   │   ├── ui.store.ts                                # Sidebar, modals, toasts
│   │   ├── realtime.store.ts                          # WS status, live meeting
│   │   └── index.ts
│   │
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                              # Axios + interceptors
│   │   │   └── query-client.ts                        # TanStack Query config
│   │   ├── websocket/
│   │   │   ├── socket.ts                              # Socket.io singleton
│   │   │   ├── socket.events.ts                       # Event name constants
│   │   │   └── socket.middleware.ts
│   │   ├── streaming/
│   │   │   ├── ai-stream.ts                           # ReadableStream decoder
│   │   │   └── stream-parser.ts
│   │   ├── cache/
│   │   │   ├── query-keys.ts                          # All TQ key factories
│   │   │   └── cache-config.ts                        # staleTime/gcTime per type
│   │   ├── utils/
│   │   │   ├── cn.ts                                  # clsx + tailwind-merge
│   │   │   ├── format-date.ts
│   │   │   ├── format-duration.ts
│   │   │   ├── slugify.ts
│   │   │   └── platform-detect.ts
│   │   └── marketing/
│   │       ├── animations.ts                          # Framer Motion variants
│   │       └── content/                               # All landing page content
│   │           ├── navigation.content.ts
│   │           ├── hero.content.ts
│   │           ├── social-proof.content.ts
│   │           ├── product-tabs.content.ts
│   │           ├── problem.content.ts
│   │           ├── how-it-works.content.ts
│   │           ├── features.content.ts
│   │           ├── ai-capabilities.content.ts
│   │           ├── integrations.content.ts
│   │           ├── workflow.content.ts
│   │           ├── benefits.content.ts
│   │           ├── usecases.content.ts
│   │           ├── testimonials.content.ts
│   │           ├── pricing.content.ts
│   │           ├── security.content.ts
│   │           └── faq.content.ts
│   │
│   │
│   └── types/
│       ├── global.d.ts
│       └── env.d.ts
│
│
├── components/                                        # Marketing components (landing only)
│   └── marketing/
│       ├── layout/
│       │   ├── MarketingNav.tsx
│       │   ├── MobileMenuDrawer.tsx
│       │   ├── AnnouncementBar.tsx
│       │   └── MarketingFooter.tsx
│       ├── sections/                                  # All 20 landing page sections
│       │   ├── HeroSection.tsx
│       │   ├── SocialProofBar.tsx
│       │   ├── ProductShowcase.tsx
│       │   ├── ProblemStatement.tsx
│       │   ├── HowItWorks.tsx
│       │   ├── FeaturesGrid.tsx
│       │   ├── AICapabilities.tsx
│       │   ├── IntegrationsSection.tsx
│       │   ├── WorkflowTimeline.tsx
│       │   ├── BenefitsByRole.tsx
│       │   ├── UseCases.tsx
│       │   ├── Testimonials.tsx
│       │   ├── CustomerLogos.tsx
│       │   ├── CaseStudy.tsx
│       │   ├── SecuritySection.tsx
│       │   ├── PricingPreview.tsx
│       │   ├── FAQSection.tsx
│       │   └── FinalCTA.tsx
│       ├── mock/                                      # Product UI mocks for showcase
│       │   ├── MockBrowserFrame.tsx
│       │   ├── MockAppSidebar.tsx
│       │   ├── MockCommitmentsView.tsx
│       │   ├── MockMeetingView.tsx
│       │   └── MockTeamHealthView.tsx
│       └── ui/                                        # Marketing-specific atoms
│           ├── MarketingButton.tsx
│           ├── SectionLabel.tsx
│           ├── SectionHeading.tsx
│           ├── StatusBadge.tsx
│           ├── CommitmentRow.tsx
│           ├── StepCard.tsx
│           ├── FeatureCard.tsx
│           ├── IntegrationPill.tsx
│           ├── IntegrationBadge.tsx
│           ├── TimelineNode.tsx
│           ├── RoleCard.tsx
│           ├── UseCaseTile.tsx
│           ├── TestimonialCard.tsx
│           ├── AnimatedNumber.tsx
│           ├── PricingCard.tsx
│           ├── SecurityCard.tsx
│           └── AccordionItem.tsx
│
│
├── hooks/                                             # Marketing-specific hooks
│   └── marketing/
│       ├── useAnnouncementBar.ts
│       ├── useMobileMenu.ts
│       ├── useNavScroll.ts
│       ├── useScrollReveal.ts
│       ├── useProductShowcaseTabs.ts
│       ├── useCountUp.ts
│       ├── usePricingToggle.ts
│       ├── useAccordion.ts
│       └── useMobileCTABar.ts
│
│
├── public/
│   ├── icons/                                         # SVG integration logos
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
│   ├── fonts/                                         # Self-hosted fonts
│   ├── images/
│   │   └── og-image.png                               # 1200×630 OG image
│   ├── manifest.json                                  # PWA manifest
│   ├── sw.js                                          # Service Worker
│   └── offline.html
│
│
├── tests/
│   ├── unit/
│   │   └── features/
│   ├── integration/
│   └── e2e/
│       ├── auth.spec.ts
│       ├── onboarding.spec.ts
│       ├── meetings.spec.ts
│       └── commitments.spec.ts
│
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 3. Full File Structure — Backend

```
services/api/
│
├── src/
│   │
│   ├── modules/                                       # Feature modules
│   │   │                                              # Pattern: controller → service → repo
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.controller.ts                     # HTTP only — no business logic
│   │   │   ├── auth.service.ts                        # All auth business logic
│   │   │   ├── auth.repository.ts                     # All DB queries
│   │   │   ├── auth.validator.ts                      # Zod request schemas
│   │   │   ├── auth.types.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── oauth/
│   │   │       ├── google.oauth.ts
│   │   │       └── github.oauth.ts
│   │   │
│   │   ├── meetings/
│   │   │   ├── meetings.controller.ts
│   │   │   ├── meetings.service.ts
│   │   │   ├── meetings.repository.ts
│   │   │   ├── meetings.validator.ts
│   │   │   ├── meetings.types.ts
│   │   │   └── meetings.routes.ts
│   │   │
│   │   ├── commitments/
│   │   │   ├── commitments.controller.ts
│   │   │   ├── commitments.service.ts
│   │   │   ├── commitments.repository.ts
│   │   │   ├── commitments.validator.ts
│   │   │   ├── commitments.types.ts
│   │   │   ├── commitments.routes.ts
│   │   │   ├── commitment-resolver.service.ts         # CORE: cross-meeting matching
│   │   │   └── owner-resolver.service.ts              # Speaker name → userId
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
│   │   │   ├── teams.service.ts
│   │   │   ├── teams.repository.ts
│   │   │   ├── teams.validator.ts
│   │   │   ├── teams.types.ts
│   │   │   ├── teams.routes.ts
│   │   │   └── team-health.service.ts                 # Compute team health score
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   ├── analytics.repository.ts                # Aggregation queries
│   │   │   ├── analytics.types.ts
│   │   │   └── analytics.routes.ts
│   │   │
│   │   ├── integrations/
│   │   │   ├── integrations.controller.ts
│   │   │   ├── integrations.service.ts
│   │   │   ├── integrations.repository.ts
│   │   │   ├── integrations.validator.ts
│   │   │   ├── integrations.types.ts
│   │   │   ├── integrations.routes.ts
│   │   │   └── providers/
│   │   │       ├── google-calendar.provider.ts
│   │   │       ├── jira.provider.ts
│   │   │       ├── linear.provider.ts
│   │   │       ├── slack.provider.ts
│   │   │       └── notion.provider.ts
│   │   │
│   │   ├── billing/
│   │   │   ├── billing.controller.ts
│   │   │   ├── billing.service.ts                     # Stripe logic
│   │   │   ├── billing.repository.ts
│   │   │   ├── billing.validator.ts
│   │   │   ├── billing.types.ts
│   │   │   ├── billing.routes.ts
│   │   │   └── plans.config.ts                        # Plan limits per tier
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts               # Route to email/Slack/push
│   │   │   ├── notifications.repository.ts
│   │   │   ├── notifications.types.ts
│   │   │   ├── notifications.routes.ts
│   │   │   ├── email.service.ts                       # Resend SDK wrapper
│   │   │   ├── slack-notify.service.ts                # Slack Block Kit
│   │   │   └── templates/                             # React Email templates
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
│   │   │   ├── recall.webhook.ts                      # Recall.ai bot events
│   │   │   ├── stripe.webhook.ts                      # Stripe billing events
│   │   │   ├── jira.webhook.ts                        # Jira reverse sync
│   │   │   ├── slack.webhook.ts                       # Slack interactions
│   │   │   ├── webhooks.validator.ts                  # HMAC signature verification
│   │   │   └── webhooks.routes.ts
│   │   │
│   │   └── health/
│   │       └── health.routes.ts                       # GET /health + GET /ready
│   │
│   │
│   ├── queues/                                        # Bull queue setup + workers
│   │   ├── queue.client.ts                            # Queue definitions
│   │   ├── scheduler.ts                               # All cron jobs
│   │   │
│   │   ├── workers/
│   │   │   ├── transcribe.worker.ts                   # Store transcript → extract
│   │   │   ├── extract.worker.ts                      # Call AI → save to DB
│   │   │   ├── notify.worker.ts                       # Send all notifications
│   │   │   ├── integrate.worker.ts                    # Sync to Jira/Linear/Notion
│   │   │   ├── deadline.worker.ts                     # Check overdue commitments
│   │   │   └── calendar-sync.worker.ts                # Hourly calendar scan
│   │   │
│   │   └── jobs/                                      # Job payload type definitions
│   │       ├── transcribe.job.ts
│   │       ├── extract.job.ts
│   │       ├── notify.job.ts
│   │       ├── integrate.job.ts
│   │       └── deadline.job.ts
│   │
│   │
│   ├── realtime/
│   │   ├── socket.server.ts                           # Socket.io + JWT auth middleware
│   │   ├── socket.events.ts                           # Event name constants
│   │   └── rooms.manager.ts                           # Room isolation per team
│   │
│   │
│   ├── services/                                      # Shared infrastructure services
│   │   ├── recall.service.ts                          # Recall.ai REST API client
│   │   ├── ai-pipeline.client.ts                      # HTTP client → FastAPI
│   │   ├── calendar-sync.service.ts                   # Calendar scan + dedup
│   │   ├── crypto.service.ts                          # AES-256-GCM encrypt/decrypt
│   │   ├── cache.service.ts                           # Redis cache-aside helpers
│   │   ├── usage.service.ts                           # Usage tracking + quota check
│   │   ├── score.service.ts                           # Commitment score algorithm
│   │   └── mongo.service.ts                           # MongoDB transcript ops
│   │
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts                         # Verify JWT token
│   │   ├── tenant.middleware.ts                       # Inject teamId from JWT
│   │   ├── plan-limits.middleware.ts                  # Enforce plan quotas
│   │   ├── role.middleware.ts                         # requireRole() factory
│   │   ├── validate.middleware.ts                     # Zod request validation
│   │   ├── idempotency.middleware.ts                  # X-Idempotency-Key handling
│   │   ├── rate-limit.middleware.ts                   # Redis sliding window
│   │   ├── request-logger.middleware.ts               # Pino structured logging
│   │   └── error.middleware.ts                        # Global error handler (LAST)
│   │
│   │
│   ├── db/
│   │   ├── client.ts                                  # Prisma singleton
│   │   └── mongo.client.ts                            # MongoDB Atlas connection
│   │
│   │
│   ├── config/
│   │   ├── env.ts                                     # Zod env validation (fail-fast)
│   │   ├── redis.ts                                   # ioredis connection
│   │   ├── logger.ts                                  # Pino logger
│   │   └── cors.ts                                    # CORS per environment
│   │
│   │
│   ├── utils/
│   │   ├── errors.ts                                  # Custom error class hierarchy
│   │   ├── response.ts                                # success() / error() helpers
│   │   ├── async-handler.ts                           # asyncHandler wrapper
│   │   ├── pagination.ts                              # Cursor encode/decode
│   │   └── date.ts                                    # Date helpers
│   │
│   │
│   ├── app.ts                                         # Express app factory
│   └── server.ts                                      # Entry point + graceful shutdown
│
│
├── prisma/
│   ├── schema.prisma                                  # Full 15-table schema
│   ├── migrations/                                    # Auto-generated migrations
│   └── seed.ts                                        # Dev seed data
│
│
├── tests/
│   ├── unit/
│   │   ├── commitment-resolver.test.ts
│   │   ├── score.test.ts
│   │   └── crypto.test.ts
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── meetings.test.ts
│   │   └── commitments.test.ts
│   └── fixtures/
│       ├── users.fixture.ts
│       ├── teams.fixture.ts
│       └── transcripts.fixture.ts
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

## 4. Full File Structure — AI Pipeline

```
services/ai-pipeline/
│
├── src/
│   │
│   ├── api/
│   │   ├── main.py                                    # FastAPI app + middleware
│   │   ├── deps.py                                    # Dependency injection
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py                              # GET /health
│   │       ├── extract.py                             # POST /extract
│   │       ├── summarize.py                           # POST /summarize
│   │       └── resolve.py                             # POST /resolve
│   │
│   ├── services/
│   │   ├── extraction/
│   │   │   ├── __init__.py
│   │   │   ├── extractor.py                           # Main orchestrator
│   │   │   ├── commitment_parser.py                   # Confidence calibration
│   │   │   ├── action_item_parser.py                  # Priority + dedup
│   │   │   ├── decision_parser.py
│   │   │   └── blocker_parser.py
│   │   ├── resolution/
│   │   │   ├── __init__.py
│   │   │   ├── commitment_resolver.py                 # CORE: cross-meeting matching
│   │   │   ├── similarity.py                          # TF-IDF cosine similarity
│   │   │   └── resolution_detector.py                # Completion statement detector
│   │   ├── claude_client.py                           # Anthropic SDK + retry
│   │   ├── transcript_processor.py                    # Clean + chunk transcripts
│   │   └── date_parser.py                             # "by Friday" → ISO date
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── request_models.py                          # Pydantic input schemas
│   │   └── response_models.py                         # Pydantic output schemas
│   │
│   ├── prompts/
│   │   ├── extraction_system.txt                      # Claude system prompt
│   │   ├── extraction_user.txt                        # User prompt template
│   │   ├── summary_system.txt
│   │   ├── summary_user.txt
│   │   ├── resolution_system.txt
│   │   └── followup_email.txt
│   │
│   └── config/
│       ├── settings.py                                # Pydantic BaseSettings
│       └── logging.py                                 # Structured JSON logging
│
│
├── tests/
│   ├── conftest.py
│   ├── test_extractor.py
│   ├── test_commitment_resolver.py
│   ├── test_similarity.py
│   ├── test_date_parser.py
│   └── fixtures/
│       ├── sample_transcript_standup.json
│       └── expected_extraction_standup.json
│
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml
├── Dockerfile
└── .env.example
```

---

## 5. Full File Structure — Shared & Infra

```
vocaply/                                               # Monorepo root
│
├── packages/
│   │
│   ├── shared-types/                                  # @vocaply/types
│   │   └── src/
│   │       ├── user.ts
│   │       ├── team.ts
│   │       ├── meeting.ts
│   │       ├── commitment.ts
│   │       ├── action-item.ts
│   │       ├── integration.ts
│   │       ├── billing.ts
│   │       ├── analytics.ts
│   │       ├── notification.ts
│   │       ├── api.ts                                 # ApiResponse, Error types
│   │       └── index.ts
│   │
│   ├── validators/                                    # @vocaply/validators
│   │   └── src/
│   │       ├── auth.validators.ts                     # Shared FE + BE
│   │       ├── meeting.validators.ts
│   │       ├── commitment.validators.ts
│   │       ├── team.validators.ts
│   │       └── index.ts
│   │
│   ├── ui-kit/                                        # @vocaply/ui
│   │   └── src/
│   │       ├── components/
│   │       │   ├── Button.tsx
│   │       │   ├── Input.tsx
│   │       │   ├── Textarea.tsx
│   │       │   ├── Select.tsx
│   │       │   ├── Checkbox.tsx
│   │       │   ├── Switch.tsx
│   │       │   ├── Card.tsx
│   │       │   ├── Badge.tsx
│   │       │   ├── Modal.tsx
│   │       │   ├── Drawer.tsx
│   │       │   ├── Dropdown.tsx
│   │       │   ├── Tooltip.tsx
│   │       │   ├── Popover.tsx
│   │       │   ├── Tabs.tsx
│   │       │   ├── Avatar.tsx
│   │       │   ├── Progress.tsx
│   │       │   ├── Skeleton.tsx
│   │       │   ├── Separator.tsx
│   │       │   ├── Alert.tsx
│   │       │   ├── Toast.tsx
│   │       │   ├── DatePicker.tsx
│   │       │   └── CommandPalette.tsx
│   │       ├── tokens/
│   │       │   ├── colors.ts
│   │       │   ├── typography.ts
│   │       │   └── spacing.ts
│   │       └── index.ts
│   │
│   └── config/
│       ├── eslint/
│       │   ├── base.js
│       │   ├── nextjs.js
│       │   └── node.js
│       ├── typescript/
│       │   ├── base.json
│       │   ├── nextjs.json
│       │   └── node.json
│       └── tailwind/
│           └── index.js
│
│
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml                         # Local: Postgres + MongoDB + Redis
│   │   └── docker-compose.prod.yml
│   ├── k8s/                                           # Kubernetes (scale phase)
│   │   ├── deployments/
│   │   ├── services/
│   │   └── hpa/
│   ├── terraform/                                     # AWS IaC
│   │   ├── modules/
│   │   └── environments/
│   ├── nginx/
│   │   └── vocaply.conf
│   └── github-actions/
│       ├── ci.yml
│       ├── deploy-web.yml
│       ├── deploy-api.yml
│       └── deploy-ai.yml
│
│
├── docs/
│   ├── architecture/                                  # ADRs
│   ├── api/                                           # OpenAPI specs
│   └── runbooks/
│
├── scripts/
│   ├── seed.ts
│   ├── migrate.ts
│   └── check-env.ts
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example                                       # Master env template
├── .gitignore
├── .eslintrc.js
└── README.md
```

---

## 6. 100-Day Sprint Overview

```
PHASE 1 — FOUNDATION (Days 1–10)
  Day 1:   Monorepo setup + tooling + environment
  Day 2:   Design system + Tailwind tokens + globals
  Day 3:   Database schema (PostgreSQL, Prisma) + Docker
  Day 4:   MongoDB + Redis setup + shared types package
  Day 5:   Backend foundation (Express, middleware chain, env validation)
  Day 6:   Auth system — Register, Login, Logout, JWT, bcrypt
  Day 7:   Auth system — Refresh tokens, email verification, OAuth Google
  Day 8:   Auth system — OAuth GitHub, password reset, sessions
  Day 9:   Frontend auth — Login/Register forms, AuthProvider, Axios interceptors
  Day 10:  Frontend auth — AuthGuard, Onboarding flow, protected routes

PHASE 2 — CORE BACKEND (Days 11–25)
  Day 11:  Teams API — Create, Get, Update, Invite, Members
  Day 12:  Meetings API — CRUD, bot scheduling, Recall.ai integration
  Day 13:  Webhooks — Recall.ai event handler, meeting state machine
  Day 14:  Commitments API — CRUD, status updates, filtering
  Day 15:  Action Items API + Decisions + Blockers
  Day 16:  Bull queues setup — all 5 queue types + workers scaffold
  Day 17:  transcribe.worker + extract.worker (mock AI for now)
  Day 18:  notify.worker — email templates + Resend integration
  Day 19:  deadline.worker + calendar-sync.worker + cron jobs
  Day 20:  Analytics API — overview, members, trends
  Day 21:  Integrations API — OAuth flows, token encryption, Jira basic
  Day 22:  Integrations API — Slack, Linear, Notion, Google Calendar
  Day 23:  Billing API — Stripe checkout, subscriptions, webhooks
  Day 24:  Notifications API — preferences, test, Socket.io server
  Day 25:  Backend testing — unit + integration tests, fix bugs

PHASE 3 — CORE FRONTEND DASHBOARD (Days 26–45)
  Day 26:  Dashboard shell — AppShell, Sidebar, Topbar, routing
  Day 27:  Dashboard home — widgets, activity feed, RSC streaming
  Day 28:  Meetings list page — filters, cursor pagination, empty state
  Day 29:  Meeting detail page — overview tab, summary, participants
  Day 30:  Meeting detail — transcript tab (virtual list, search)
  Day 31:  Meeting detail — action items tab + commitments tab
  Day 32:  Add Meeting modal + Bot status banner + realtime updates
  Day 33:  Commitments tracker — list, filters, PENDING/MISSED/FULFILLED
  Day 34:  Commitments — CommitmentScore gauge, timeline, stats
  Day 35:  Commitments — Mark fulfilled modal, defer modal, optimistic updates
  Day 36:  Action items — list, priority badges, bulk update, Jira sync button
  Day 37:  Team health dashboard — member table, scores, trends
  Day 38:  Member profile page — commitment history, cross-meeting timeline
  Day 39:  WebSocket integration — live bot status, realtime events
  Day 40:  Settings — Profile, Team, Members, security
  Day 41:  Settings — Integrations page (connect/disconnect OAuth)
  Day 42:  Settings — Billing page + Stripe portal
  Day 43:  Settings — Notifications preferences
  Day 44:  Onboarding flow — 4-step wizard + calendar connect
  Day 45:  Mobile responsiveness pass + error boundaries + loading skeletons

PHASE 4 — AI PIPELINE (Days 46–55)
  Day 46:  FastAPI project setup + Claude client + health endpoint
  Day 47:  Transcript processor — clean, format, chunk algorithm
  Day 48:  Extraction prompts — commitment, action item, decision, blocker
  Day 49:  Extraction pipeline — full /extract endpoint + parsers
  Day 50:  Date parser — NLP "by Friday" → ISO datetime
  Day 51:  Similarity engine — TF-IDF + cosine + keyword overlap
  Day 52:  Commitment resolver — cross-meeting matching algorithm
  Day 53:  Resolution detector — keyword check + Claude binary YES/NO
  Day 54:  /resolve endpoint — full pipeline integration
  Day 55:  AI pipeline testing — fixtures, accuracy measurement, edge cases

PHASE 5 — INTEGRATIONS (Days 56–70)
  Day 56:  Google Calendar sync — event fetching, URL extraction, dedup
  Day 57:  Bot deduplication — Redis flags, platform meeting ID detection
  Day 58:  Jira integration — create tickets, assignee mapping
  Day 59:  Jira webhook — reverse sync, status → commitment fulfilled
  Day 60:  Slack integration — Block Kit messages, DMs, channel routing
  Day 61:  Linear integration — GraphQL API, create issues
  Day 62:  Notion integration — create pages, database sync
  Day 63:  Outlook Calendar — Microsoft Graph API sync
  Day 64:  Token refresh — proactive rotation cron, failure alerting
  Day 65:  Integration testing — all providers end-to-end
  Day 66:  integrate.worker — Jira/Linear/Notion sync on extraction
  Day 67:  Slack notifications — post-meeting summaries, commitment alerts
  Day 68:  Email notifications — all 10 templates + Resend delivery
  Day 69:  Commitment score algorithm — full calculation + denormalized updates
  Day 70:  Team health score — calculation, trend, weekly digest

PHASE 6 — LANDING PAGE (Days 71–80)
  Day 71:  Landing page setup — design system, tokens, route group
  Day 72:  Announcement bar, Navigation, Hero section
  Day 73:  Social proof bar, Product showcase (3-tab mock UI)
  Day 74:  Problem statement, How it works
  Day 75:  Features grid, AI capabilities section
  Day 76:  Integrations section, Workflow timeline
  Day 77:  Benefits by role, Use cases, Testimonials, Customer logos
  Day 78:  Case study, Security section, Pricing preview
  Day 79:  FAQ, Final CTA, Footer, Mobile sticky CTA bar
  Day 80:  Mobile polish, animations, scroll reveals, reduced motion

PHASE 7 — BILLING & ANALYTICS (Days 81–88)
  Day 81:  Analytics dashboard — RSC charts, date range selector
  Day 82:  Analytics — member breakdown, fulfillment rate trends
  Day 83:  Analytics — export reports (background job + CSV download)
  Day 84:  Billing — Pricing page, upgrade modal, plan limit alerts
  Day 85:  Billing — Stripe Checkout, portal, invoice history
  Day 86:  AI Intelligence page — chat panel, streaming UI, Jotai atoms
  Day 87:  Command palette (Cmd+K) — meeting/commitment/member search
  Day 88:  Notification bell — in-app notifications, mark as read

PHASE 8 — POLISH & PRODUCTION (Days 89–100)
  Day 89:  Performance — RSC audit, bundle analysis, code splitting
  Day 90:  SEO — metadata, JSON-LD, sitemap, robots, OG images
  Day 91:  Accessibility — ARIA, focus management, contrast, keyboard nav
  Day 92:  E2E tests — Playwright: auth, meetings, commitments, billing
  Day 93:  PostHog analytics — event tracking, conversion funnel
  Day 94:  Sentry setup — error tracking, source maps, performance
  Day 95:  Docker production configs + Railway deployment
  Day 96:  Vercel deployment — environment variables, custom domain
  Day 97:  Database migrations — production Supabase setup
  Day 98:  Load testing + performance benchmarks + Core Web Vitals
  Day 99:  Security audit — CSP headers, OWASP checklist, token security
  Day 100: Final QA pass + production deployment + launch checklist
```

---

## 7. Day 1 — Detailed Plan

### Theme: Foundation — Everything Depends On This Day

> Day 1 ka kaam koi user nahi dekhega. Lekin agar aaj galat ho gaya —
> wrong folder structure, missing configs, wrong versions — toh baaki
> 99 din suffer karein ge. Yeh din boring hai. Yeh din critical hai.
> Har ek step carefully follow karo.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:00 AM   → Node.js + pnpm + Turborepo monorepo scaffold
10:00 AM – 11:30 AM  → Package workspace setup + shared packages skeleton
11:30 AM – 12:00 PM  → TypeScript configs (strict mode, path aliases)
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:30 PM    → ESLint + Prettier + commitlint + husky setup
2:30 PM – 3:30 PM    → Next.js 14 app scaffold (App Router, TypeScript, Tailwind)
3:30 PM – 4:30 PM    → Node.js API service scaffold (Express, TypeScript)
4:30 PM – 5:00 PM    → Python FastAPI service scaffold
5:00 PM – 5:30 PM    → Docker Compose (Postgres + MongoDB + Redis local)
5:30 PM – 6:00 PM    → Verification + turbo dev runs + Day 1 checklist
```

---

### Exact Steps — What to Do

**Step 1: Monorepo Root Setup**

Create the root monorepo structure. Initialize with pnpm workspaces and Turborepo. The root `package.json` should contain ONLY dev tooling — no application dependencies. Root holds: turbo, eslint, prettier, commitlint, husky.

Files to create:
- `pnpm-workspace.yaml` — defines workspace paths: `apps/*`, `services/*`, `packages/*`
- `turbo.json` — pipeline config with build, dev, test, lint, type-check tasks
- `package.json` (root) — devDependencies only: turbo, eslint, prettier, commitlint, husky, lint-staged
- `.gitignore` — node_modules, .next, dist, .env*, coverage, .turbo
- `.env.example` — master template with ALL env vars across all services documented

**Step 2: Shared Packages Setup**

Create the 4 shared packages that everything depends on. These are skeleton files only — real content comes later.

- `packages/shared-types/` — `package.json` + `tsconfig.json` + `src/index.ts` (empty exports)
- `packages/validators/` — `package.json` + `tsconfig.json` + `src/index.ts`
- `packages/ui-kit/` — `package.json` + `tsconfig.json` + `src/index.ts`
- `packages/config/eslint/base.js` — base ESLint rules
- `packages/config/typescript/base.json` — strict TypeScript base config
- `packages/config/tailwind/index.js` — shared Tailwind preset

**Step 3: TypeScript Configuration**

Every TypeScript project in the monorepo extends from `packages/config/typescript/`. Configure:
- `strict: true` — no any, no implicit any, everything typed
- `paths` — `@/*` maps to `src/*` in each app
- `moduleResolution: bundler` for Next.js
- `target: ES2022` for Node.js services

**Step 4: ESLint + Prettier**

Configure code style enforcement:
- ESLint: React hooks rules, import order, no-unused-vars, boundaries plugin (feature isolation)
- Prettier: single quotes, semi: true, trailing comma: es5, print width: 100
- `.eslintignore` and `.prettierignore` with proper exclusions
- Husky pre-commit hook: lint-staged runs eslint + prettier on staged files
- Commitlint: conventional commits enforced (`feat:`, `fix:`, `chore:`, etc.)

**Step 5: Next.js App Scaffold**

Create `apps/web/` with:
- `next.config.ts` — reactStrictMode, images config, security headers (CSP, HSTS)
- `tailwind.config.ts` — extends `@vocaply/tailwind-config`, full color palette defined
- `tsconfig.json` — extends `@vocaply/tsconfig/nextjs.json`, path alias `@/` → `src/`
- `src/app/layout.tsx` — empty root layout with `<html>` and `<body>` (no providers yet)
- `src/app/globals.css` — Tailwind base + complete CSS custom properties (all tokens)
- `src/app/page.tsx` — placeholder "Vocaply — Coming Soon" (1 line)
- `package.json` — Next.js 14, React 18, TypeScript, Tailwind, `@vocaply/*` packages

**Step 6: Node.js API Scaffold**

Create `services/api/` with:
- `package.json` — Express, TypeScript, ts-node, tsup, prisma, ioredis, bull
- `tsconfig.json` — extends `@vocaply/tsconfig/node.json`
- `src/server.ts` — Express listen + graceful shutdown (just scaffold, no routes)
- `src/app.ts` — Express app factory (cors, helmet, json parser — no routes yet)
- `src/config/env.ts` — Zod-based env validation with 5 required vars (DATABASE_URL, JWT_SECRET, REDIS_URL, MONGODB_URL, NODE_ENV)
- `Dockerfile.dev` — Node.js dev container with hot reload

**Step 7: Python FastAPI Scaffold**

Create `services/ai-pipeline/` with:
- `requirements.txt` — fastapi, uvicorn, anthropic, pydantic, scikit-learn, python-dotenv
- `requirements-dev.txt` — pytest, httpx, pytest-asyncio
- `src/api/main.py` — FastAPI app with CORS, single `/health` endpoint returning `{status: "ok"}`
- `src/config/settings.py` — Pydantic BaseSettings for env vars
- `Dockerfile.dev` — Python dev container

**Step 8: Docker Compose**

`infra/docker/docker-compose.yml` with three services:
- **PostgreSQL 15**: port 5432, persistent volume, `vocaply_dev` database
- **MongoDB 6**: port 27017, persistent volume, `vocaply` database
- **Redis 7**: port 6379, persistent volume, AOF persistence enabled

All containers connected on `vocaply-network` bridge. Health checks on all three.

---

### Day 1 End-of-Day Checklist

```
MONOREPO:
  [ ] pnpm install runs without errors
  [ ] pnpm turbo build completes (even with empty builds)
  [ ] No circular dependencies between packages
  [ ] Git repository initialized with initial commit

TOOLING:
  [ ] pnpm lint runs ESLint across all packages — zero errors
  [ ] pnpm format:check runs Prettier — zero errors
  [ ] commitlint works: conventional commit message accepted
  [ ] commitlint rejects: non-conventional message rejected
  [ ] Husky pre-commit hook fires on git commit

FRONTEND:
  [ ] cd apps/web && pnpm dev → localhost:3000 shows placeholder page
  [ ] No TypeScript errors (pnpm type-check)
  [ ] Tailwind CSS loads (add a test class to page.tsx, verify it renders)
  [ ] Path alias @/ works (import something using @/)

BACKEND:
  [ ] cd services/api && pnpm dev → server starts on port 4000
  [ ] No TypeScript errors
  [ ] env.ts validation: removing DATABASE_URL crashes the server (good)

AI PIPELINE:
  [ ] cd services/ai-pipeline && uvicorn src.api.main:app → starts on port 8000
  [ ] GET localhost:8000/health returns { "status": "ok" }

DOCKER:
  [ ] docker compose up -d starts all 3 containers
  [ ] psql connects to Postgres
  [ ] mongosh connects to MongoDB
  [ ] redis-cli ping returns PONG

COMPLETE:
  [ ] pnpm turbo dev starts ALL services in parallel
  [ ] No port conflicts
  [ ] .env.example committed with all variables documented
```

---

## 8. Day 2 — Detailed Plan

### Theme: Design System — The Visual DNA of Vocaply

> Day 2 mein koi feature nahi banayein ge. Sirf ek cheez — design system.
> Agar tokens aaj theek nahi banaye, toh landing page aur dashboard
> ka har ek color, font, spacing alag hoga. Ek hi jagah change karne se
> sab update hone chahiye. Yeh scalability ka core hai.
>
> Day 2 ke end mein: design tokens complete, globals.css complete,
> Tailwind config complete, shared Button + Input components,
> aur route group layouts.

---

### Work Hours Breakdown (8 Hours)

```
9:00 AM – 10:30 AM   → CSS Custom Properties (globals.css) — full token system
10:30 AM – 12:00 PM  → Tailwind config — extend with all brand tokens
12:00 PM – 1:00 PM   → Lunch break
1:00 PM – 2:00 PM    → @vocaply/tokens package — JS + CSS token export
2:00 PM – 3:30 PM    → UI Kit — Button, Input, Badge, Card, Skeleton primitives
3:30 PM – 4:30 PM    → Route group layouts — (marketing), (auth), (dashboard)
4:30 PM – 5:30 PM    → cn() utility + format-date + platform-detect utilities
5:30 PM – 6:00 PM    → Storybook setup + Button story + Day 2 checklist
```

---

### Exact Steps — What to Do

**Step 1: CSS Custom Properties (globals.css)**

This is the most important file in the entire frontend. Every color, font, spacing value flows through CSS variables defined here. Two sets: light mode (`:root`) and dark mode (`.dark`).

Complete token system to define:

```
COLOR TOKENS (all as HSL for easy manipulation):
  --color-background:    0 0% 100%           (#FAFAF8 — off-white)
  --color-foreground:    0 0% 4%             (#0A0A0A — near black)
  --color-brand:         149 61% 28%         (#1A6B3C — brand green)
  --color-brand-subtle:  149 67% 95%         (#E8F5EE — green tint)
  --color-brand-mid:     149 51% 36%         (#2D8A50 — hover green)
  --color-brand-dark:    149 52% 60%         (#6ECC8E — light green for dark bg)
  --color-error:         12 63% 48%          (#C84B31 — missed/error red)
  --color-error-subtle:  10 93% 96%          (#FDECEA — error bg)
  --color-muted:         45 4% 40%           (#6B6A67 — muted text)
  --color-muted-subtle:  45 4% 60%           (#9B9A96 — very muted)
  --color-border:        40 10% 88%          (#E4E3DF — borders)
  --color-surface:       40 10% 94%          (#F2F1EE — card backgrounds)
  --color-surface-2:     40 7% 97%           (#FAFAF8 — page background)

STATUS TOKENS (for commitment status badges):
  --status-pending-bg:    0 0% 94%           (#F2F1EE)
  --status-pending-text:  45 4% 40%          (#6B6A67)
  --status-fulfilled-bg:  149 67% 95%        (#E8F5EE)
  --status-fulfilled-text: 149 61% 28%       (#1A6B3C)
  --status-missed-bg:     10 93% 96%         (#FDECEA)
  --status-missed-text:   12 63% 48%         (#C84B31)
  --status-deferred-bg:   240 100% 95%       (#EEF2FF)
  --status-deferred-text: 239 84% 60%        (#4F46E5)

LAYOUT TOKENS:
  --radius:      6px
  --radius-md:   8px
  --radius-lg:   10px
  --radius-xl:   12px
  --sidebar-width: 240px
  --sidebar-collapsed: 48px
  --topbar-height: 60px

SHADOW TOKENS:
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.05)
  --shadow-md:    0 4px 24px rgba(0,0,0,0.08)
  --shadow-lg:    0 8px 40px rgba(0,0,0,0.12)
  --shadow-brand: 0 4px 24px rgba(26,107,60,0.08)

ANIMATION TOKENS:
  --transition-fast:  150ms ease
  --transition-base:  200ms ease
  --transition-slow:  400ms ease
```

Also in `globals.css`:
- Tailwind base layer imports (`@tailwind base`, `@tailwind components`, `@tailwind utilities`)
- Global resets: `box-sizing: border-box`, `scroll-behavior: smooth`
- Body defaults: background-color, color, font-family
- Focus ring: `*:focus-visible { outline: 2px solid hsl(var(--color-brand)); outline-offset: 2px; }`
- `::selection` styled with brand green
- Custom scrollbar (webkit, thin, brand color)
- `prefers-reduced-motion` media query resetting all animations
- Font variable CSS: `--font-sans`, `--font-serif` applied to body and headings

**Step 2: Tailwind Config**

`tailwind.config.ts` must extend Tailwind with ALL Vocaply brand tokens so they're available as utility classes:

```
extend.colors:
  background → CSS var reference
  foreground → CSS var reference
  brand → { DEFAULT, subtle, mid, dark }
  error → { DEFAULT, subtle }
  muted → { DEFAULT, subtle }
  border → CSS var
  surface → { DEFAULT, 2 }
  
  Commitment status colors as named utilities:
    pending, fulfilled, missed, deferred — each with bg + text variants

extend.fontFamily:
  sans: ['DM Sans', ...defaultTheme.fontFamily.sans]
  serif: ['Instrument Serif', ...defaultTheme.fontFamily.serif]

extend.fontSize:
  display, h2, h3 — each with clamp() responsive values as CSS var references

extend.spacing:
  sidebar, topbar — for layout

extend.borderRadius:
  From CSS vars — radius, radius-md, radius-lg, radius-xl

extend.boxShadow:
  sm, md, lg, brand — from CSS vars

extend.transitionDuration:
  fast: 150ms, base: 200ms, slow: 400ms
```

**Step 3: @vocaply/tokens Package**

The tokens package exports both CSS variables AND JavaScript constants. This means Node.js workers, React components, and email templates can all import from the same source.

Create:
- `packages/tokens/src/colors.ts` — all color hex values as named exports
- `packages/tokens/src/typography.ts` — font families, sizes
- `packages/tokens/src/spacing.ts` — spacing scale
- `packages/tokens/src/index.ts` — re-export everything

**Step 4: Google Fonts Loading**

In `apps/web/src/app/layout.tsx`, configure next/font/google for both fonts:
- `DM_Sans`: weights 300, 400, 500, 600, subset latin, display swap, CSS variable `--font-sans`
- `Instrument_Serif`: weight 400, styles normal + italic, subset latin, display swap, CSS variable `--font-serif`

Apply both font variables to `<html>` element via className. This prevents layout shift.

**Step 5: UI Kit Primitives (packages/ui-kit)**

Build 5 foundational components today. These will be used everywhere — dashboard, landing page, auth forms.

**Button component** — 3 variants, 3 sizes, loading state, left/right icon slots:
- `variant: 'default' | 'outline' | 'ghost'`
- `size: 'sm' | 'default' | 'lg' | 'icon'`
- `isLoading: boolean` — shows spinner, disables button
- `leftIcon` / `rightIcon` — React node slots
- Uses `cn()` for conditional Tailwind classes
- Uses `forwardRef` for ref forwarding
- Named export (no default export)
- CVA (class-variance-authority) for variant management

**Input component** — controlled input with error state:
- `error?: string` — shows red border + error message below
- `label?: string` — accessible label above
- Correct `aria-invalid` and `aria-describedby` for accessibility
- `forwardRef` compatible

**Badge component** — status + generic badges:
- `variant: 'default' | 'pending' | 'fulfilled' | 'missed' | 'deferred' | 'recording'`
- Uses semantic status token CSS vars for colors
- Small size (11px, pill shape, uppercase)

**Card component** — generic card wrapper:
- `CardRoot`, `CardHeader`, `CardContent`, `CardFooter` — compound component pattern
- Accepts className for overrides

**Skeleton component** — loading placeholder:
- Animated pulse via Tailwind `animate-pulse`
- Accepts width, height, borderRadius as props
- Used in all skeleton loading states

**Step 6: Route Group Layouts**

Create the 3 route group layouts. These are empty shells today — they get real content starting Day 9.

`app/(marketing)/layout.tsx`:
- No sidebar, no topbar
- Just wraps children in a `<div>` with Providers
- Will receive MarketingNav + Footer in Day 71

`app/(auth)/layout.tsx`:
- Centers everything on screen
- Full-height, flex, justify-center, align-center
- Light background

`app/(dashboard)/layout.tsx`:
- For now: redirects to `/login` if not authenticated (will be RSC in Day 9)
- Placeholder div around children
- Will get AppShell in Day 26

`app/onboarding/layout.tsx`:
- Full-screen layout, progress indicator slot
- Will be built in Day 44

**Step 7: Utility Functions**

Create the utility files that every component will use from Day 3 onwards:

`lib/utils/cn.ts`:
- Combines `clsx` and `tailwind-merge`
- Single function: `cn(...inputs: ClassValue[]) => string`
- Install both packages today

`lib/utils/format-date.ts`:
- `formatDate(date: Date | string, format?: 'short' | 'long' | 'relative')`
- `formatRelativeTime(date: Date | string)` → "2 hours ago", "3 days ago"
- `formatDuration(minutes: number)` → "28 min", "1h 12min"

`lib/utils/platform-detect.ts`:
- `detectPlatform(url: string): 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'WEBEX' | null`
- Regex patterns for each platform URL format
- Returns null for unrecognized URLs

`lib/utils/slugify.ts`:
- `slugify(text: string): string`
- Lowercase, replace spaces with hyphens, remove special chars

**Step 8: Storybook Setup**

Initialize Storybook in `apps/storybook/` (or inside apps/web):
- Configure for Next.js 14 + Tailwind
- Create `Button.stories.tsx` with all variants
- Create `Badge.stories.tsx` with all status variants
- Ensure Storybook reads globals.css (design tokens visible in stories)
- This confirms the design system actually works visually

---

### What the UI Looks Like After Day 2

At the end of Day 2, visiting `localhost:3000` should show nothing special — just the placeholder page. BUT if you open the browser console and inspect:

- CSS custom properties visible on `:root` element
- Tailwind utilities work with brand colors (`text-brand`, `bg-surface`, etc.)
- Both fonts loading (check Network tab)
- No layout shift from fonts

In Storybook (`localhost:6006`):
- Button component shows all 3 variants × 3 sizes
- Loading state shows spinner
- Badge component shows all 5 status variants with correct colors
- Input shows error state with red border

---

### Files Created Today — Complete List

```
FRONTEND (apps/web):
  src/app/layout.tsx                    ← Font loading + providers shell
  src/app/globals.css                   ← COMPLETE design token system
  src/app/(marketing)/layout.tsx        ← Empty marketing shell
  src/app/(auth)/layout.tsx             ← Centered auth layout
  src/app/(dashboard)/layout.tsx        ← Dashboard shell placeholder
  src/app/onboarding/layout.tsx         ← Full-screen onboarding layout
  src/lib/utils/cn.ts                   ← clsx + tailwind-merge
  src/lib/utils/format-date.ts          ← Date formatting utilities
  src/lib/utils/format-duration.ts      ← Duration formatting
  src/lib/utils/platform-detect.ts      ← Meeting URL platform detection
  src/lib/utils/slugify.ts              ← URL slug generation
  tailwind.config.ts                    ← COMPLETE brand token extension

PACKAGES:
  packages/tokens/src/colors.ts
  packages/tokens/src/typography.ts
  packages/tokens/src/spacing.ts
  packages/tokens/src/index.ts
  packages/tokens/package.json
  packages/ui-kit/src/components/Button.tsx
  packages/ui-kit/src/components/Input.tsx
  packages/ui-kit/src/components/Badge.tsx
  packages/ui-kit/src/components/Card.tsx
  packages/ui-kit/src/components/Skeleton.tsx
  packages/ui-kit/src/index.ts
```

---

### Day 2 End-of-Day Checklist

```
CSS TOKENS:
  [ ] :root has ALL 13 color tokens defined as HSL values
  [ ] --radius, --radius-md, --radius-lg, --radius-xl defined
  [ ] --shadow-sm, --shadow-md, --shadow-lg, --shadow-brand defined
  [ ] --transition-fast, --transition-base, --transition-slow defined
  [ ] --sidebar-width, --topbar-height defined
  [ ] Focus ring visible on ALL focusable elements (test with Tab key)
  [ ] ::selection styled with brand green
  [ ] prefers-reduced-motion removes animations (test in OS settings)
  [ ] No layout shift from fonts (check CLS in DevTools)

TAILWIND:
  [ ] text-brand renders correct green (#1A6B3C equivalent)
  [ ] bg-surface renders correct gray (#F2F1EE equivalent)
  [ ] text-brand-subtle works
  [ ] font-serif renders Instrument Serif
  [ ] font-sans renders DM Sans
  [ ] All custom shadows work (shadow-brand, shadow-md)
  [ ] All radius tokens work (rounded, rounded-lg, rounded-xl)

UI COMPONENTS:
  [ ] Button — default variant renders with dark bg, white text
  [ ] Button — outline variant renders with border, no fill
  [ ] Button — ghost variant renders transparent
  [ ] Button — isLoading shows spinner, button disabled
  [ ] Button — sm, default, lg sizes render correctly
  [ ] Input — renders with correct border color
  [ ] Input — error prop shows red border + message
  [ ] Badge — pending renders gray (#F2F1EE bg, #6B6A67 text)
  [ ] Badge — fulfilled renders green (#E8F5EE bg, #1A6B3C text)
  [ ] Badge — missed renders red (#FDECEA bg, #C84B31 text)
  [ ] Card renders with border and correct background
  [ ] Skeleton animates (pulse visible)

STORYBOOK:
  [ ] Storybook runs at localhost:6006
  [ ] Button story shows all variants and sizes
  [ ] Badge story shows all 5 status variants with correct colors
  [ ] Tailwind styles apply in Storybook stories

UTILITIES:
  [ ] cn() merges Tailwind classes correctly (test: cn('p-4', 'p-8') → 'p-8')
  [ ] formatRelativeTime(new Date()) → "just now"
  [ ] formatRelativeTime(yesterday) → "1 day ago"
  [ ] detectPlatform('https://zoom.us/j/123') → 'ZOOM'
  [ ] detectPlatform('https://meet.google.com/abc') → 'GOOGLE_MEET'
  [ ] detectPlatform('https://random.com') → null

ROUTE GROUPS:
  [ ] localhost:3000 loads (marketing layout)
  [ ] localhost:3000/login loads (auth layout — centered)
  [ ] localhost:3000/dashboard loads (dashboard placeholder)
  [ ] No TypeScript errors in any layout file
```

---

## Summary: Days 1–2 Outcome

After 2 days of work, you have:

```
DAY 1 DELIVERABLES:
  ✅ Turborepo monorepo — all 3 apps + 4 packages connected
  ✅ TypeScript strict mode across everything
  ✅ ESLint + Prettier + commitlint enforced
  ✅ Docker Compose running PostgreSQL + MongoDB + Redis locally
  ✅ Next.js 14 booting at localhost:3000
  ✅ Node.js API booting at localhost:4000
  ✅ FastAPI booting at localhost:8000
  ✅ All 3 services run in parallel via pnpm turbo dev

DAY 2 DELIVERABLES:
  ✅ Complete CSS design token system (colors, spacing, shadows, animations)
  ✅ Tailwind extended with brand tokens (text-brand, bg-surface, etc.)
  ✅ Google Fonts loading with zero layout shift
  ✅ 5 foundational UI components (Button, Input, Badge, Card, Skeleton)
  ✅ 4 route group layouts defined
  ✅ Core utility functions (cn, format-date, platform-detect, slugify)
  ✅ Storybook with visual component documentation

WHAT DOES NOT EXIST YET (intentional):
  ✗ No database schema (Day 3)
  ✗ No auth (Days 6–10)
  ✗ No API routes (Days 11–25)
  ✗ No real pages (Days 26+)
  
  This is correct. Foundation first. Features after.
```

---

*Document: BUILD-PLAN-001 | Vocaply | 100-Day Sprint*
*Phase 1: Foundation (Days 1–10) — Currently: Days 1–2 Detailed*
*Stack: Next.js 14 · Node.js · Python FastAPI · PostgreSQL · MongoDB · Redis*
*Turborepo Monorepo | Production-Grade | 1M+ Users Target*
