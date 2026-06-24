# Vocaply — Production-Grade Frontend System Architecture
> Principal Frontend Architect Edition | 1M+ Users | Enterprise Multi-Tenant SaaS
> Next.js 14 · React · TypeScript · Turborepo · Tailwind · shadcn/ui · TanStack Query · Zustand

---

## Table of Contents

1. [Architecture Philosophy & Decision Framework](#1-architecture-philosophy--decision-framework)
2. [Monorepo Architecture](#2-monorepo-architecture)
3. [Microfrontend vs Modular Architecture Decision](#3-microfrontend-vs-modular-architecture-decision)
4. [Scalable Folder Structure](#4-scalable-folder-structure)
5. [State Management Architecture](#5-state-management-architecture)
6. [Realtime Frontend Architecture](#6-realtime-frontend-architecture)
7. [AI Streaming UI System](#7-ai-streaming-ui-system)
8. [Dashboard Rendering Strategy](#8-dashboard-rendering-strategy)
9. [WebSocket & Event Architecture](#9-websocket--event-architecture)
10. [Caching Strategy](#10-caching-strategy)
11. [Performance Optimization](#11-performance-optimization)
12. [Frontend Security Architecture](#12-frontend-security-architecture)
13. [Observability & Error Tracking](#13-observability--error-tracking)
14. [Design System Architecture](#14-design-system-architecture)
15. [PWA & Mobile Strategy](#15-pwa--mobile-strategy)
16. [CI/CD & Deployment Architecture](#16-cicd--deployment-architecture)
17. [Team Scaling Architecture](#17-team-scaling-architecture)

---

## 1. Architecture Philosophy & Decision Framework

### Core Principles

```
PRINCIPLE 1 — Server First, Client When Necessary
  Default to React Server Components (RSC) for all data-fetching.
  Only hydrate to client when: interactivity, realtime, or browser APIs needed.
  Result: 40-60% less JavaScript shipped to browser.

PRINCIPLE 2 — Streaming Everything
  Never block the user. Stream data, stream AI, stream UI.
  Suspense boundaries at every data boundary.
  Progressive enhancement: content appears incrementally.

PRINCIPLE 3 — Optimistic by Default
  Every mutation is optimistic. UI updates before server confirms.
  Rollback on failure. User never waits for network.

PRINCIPLE 4 — Islands of Interactivity
  RSC renders the static shell. Client components are isolated islands.
  Each island owns its own state. No shared mutable global state in RSC.

PRINCIPLE 5 — Tenant Isolation at Every Layer
  Every API call, cache key, WebSocket room, and local store is scoped to teamId.
  Cross-tenant data leakage is architecturally impossible.

PRINCIPLE 6 — Edge-First
  Static assets, auth checks, and read-heavy pages run at the edge.
  Dynamic, personalized, and realtime content runs at origin.

PRINCIPLE 7 — Fail Gracefully
  Every component has an error boundary.
  Network loss triggers offline mode, not a broken screen.
  Partial failures show partial data with retry affordances.
```

### Technology Decision Matrix

```
DECISION                 CHOICE              RATIONALE
─────────────────────────────────────────────────────────────────────────────
Routing                  Next.js App Router  RSC + Streaming + Edge support
Data Fetching            TanStack Query v5   Best-in-class cache, mutations,
                                             infinite scroll, optimistic updates
UI Components            shadcn/ui + custom  Accessible, unstyled base, full
                                             ownership (not a black-box library)
Styling                  Tailwind CSS        Utility-first, no runtime cost,
                                             design token integration
Global State             Zustand             Minimal, no boilerplate, slices,
                                             subscriptions, devtools
Atomic State             Jotai               Derived atoms, async atoms for
                                             realtime AI streaming state
Realtime                 WebSocket (native)  Full control over reconnection,
                         + Socket.io client  rooms, auth, events
AI Streaming             ReadableStream      Native Fetch streaming, Vercel AI
                         + Vercel AI SDK     SDK for useChat/useCompletion
Monorepo                 Turborepo           Best remote caching, pipeline
                                             orchestration, package graph
Type Safety              TypeScript strict   No 'any' anywhere in codebase
Forms                    React Hook Form     Performance (uncontrolled), Zod
                         + Zod              integration
Animation                Framer Motion       Production-grade, layout animation,
                                             gesture support
Testing                  Vitest + Playwright Unit + integration + E2E
─────────────────────────────────────────────────────────────────────────────
```

---

## 2. Monorepo Architecture

### Turborepo Workspace Graph

```
vocaply-monorepo/
│
├── apps/
│   ├── web/                    # Main Next.js 14 app (dashboard + landing)
│   ├── docs/                   # Nextra documentation site
│   └── storybook/              # Isolated component development
│
├── packages/
│   ├── ui/                     # @vocaply/ui — Design system + components
│   ├── tokens/                 # @vocaply/tokens — Design tokens (CSS vars + JS)
│   ├── icons/                  # @vocaply/icons — SVG icon system
│   ├── types/                  # @vocaply/types — Shared TypeScript types
│   ├── validators/             # @vocaply/validators — Zod schemas
│   ├── api-client/             # @vocaply/api-client — Typed API client
│   ├── hooks/                  # @vocaply/hooks — Shared React hooks
│   ├── utils/                  # @vocaply/utils — Pure utility functions
│   ├── analytics/              # @vocaply/analytics — Event tracking abstraction
│   └── config/
│       ├── eslint/             # @vocaply/eslint-config
│       ├── typescript/         # @vocaply/tsconfig
│       └── tailwind/           # @vocaply/tailwind-config
│
└── tooling/
    ├── jest-preset/
    ├── playwright-config/
    └── prettier-config/
```

### turbo.json — Pipeline Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": ["NODE_ENV", "VERCEL_ENV"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": [
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_SOCKET_URL",
        "NEXT_PUBLIC_POSTHOG_KEY",
        "NEXT_PUBLIC_SENTRY_DSN"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "cache": false
    },
    "lint": {
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "storybook:build": {
      "dependsOn": ["^build"],
      "outputs": ["storybook-static/**"]
    }
  },
  "remoteCache": {
    "enabled": true
  }
}
```

### Package Dependency Graph

```
apps/web
  ├── @vocaply/ui          (components)
  │     ├── @vocaply/tokens
  │     └── @vocaply/icons
  ├── @vocaply/api-client  (typed fetch layer)
  │     └── @vocaply/types
  ├── @vocaply/hooks       (shared hooks)
  │     └── @vocaply/api-client
  ├── @vocaply/validators  (Zod schemas)
  │     └── @vocaply/types
  ├── @vocaply/analytics   (PostHog abstraction)
  └── @vocaply/utils       (pure functions)

RULE: No circular dependencies.
      packages/ NEVER import from apps/.
      apps/ freely import from packages/.
      packages/ can only import sibling packages if no cycle created.
```

---

## 3. Microfrontend vs Modular Architecture Decision

### Decision: Modular Monolith with Feature Isolation

```
REJECTED: Microfrontend (Module Federation)

REASONS FOR REJECTION:
  × Premature optimization for current scale
  × Shared state between MFEs is an unsolved hard problem
  × Auth, routing, and design system coordination overhead
  × Webpack Module Federation introduces runtime instability
  × Independent deployment complexity with no real benefit at 1M users
  × React version mismatch risks across MFE boundaries
  × Significant DX penalty for the team

CHOSEN: Modular Monolith with Strict Feature Isolation

REASONS FOR CHOICE:
  ✓ Single Next.js app = single deployment unit (Vercel edge network)
  ✓ Feature boundaries enforced via module architecture (not deploy units)
  ✓ Shared RSC layout, auth, and design system — zero coordination overhead
  ✓ Future-proof: Can be split into MFE if truly needed at 10M+ users
  ✓ Turborepo remote cache: 90% faster CI even as a monolith
  ✓ TypeScript module boundaries + ESLint import rules = same isolation
  ✓ Teams can own feature modules independently without MFE complexity

WHEN TO REVISIT (triggers for MFE migration):
  → 50+ frontend engineers
  → Independent release cadences genuinely required
  → Features need different tech stacks (e.g., embedded AI widget)
  → Enterprise customers require white-label isolated deployments
```

### Feature Module Boundary Enforcement

```typescript
// .eslintrc.js — import boundary rules via eslint-plugin-boundaries

module.exports = {
  plugins: ['boundaries'],
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // Features can import from shared layers
          { from: 'feature', allow: ['shared', 'ui', 'hooks', 'utils'] },
          // Features CANNOT import from other features
          { from: 'feature', allow: [], forbid: ['feature'] },
          // Pages can import features + shared
          { from: 'page', allow: ['feature', 'shared', 'ui'] },
          // Shared cannot import features
          { from: 'shared', allow: ['ui', 'utils', 'hooks'] },
        ],
      },
    ],
  },
}

// Each feature is a self-contained vertical slice:
// features/
//   meetings/          ← owns: components, hooks, store, api, types
//   commitments/       ← owns: components, hooks, store, api, types
//   analytics/         ← owns: components, hooks, store, api, types
//   team/              ← owns: components, hooks, store, api, types
//
// Cross-feature communication: only via shared event bus or URL state
// Never: featureA imports from featureB directly
```

---

## 4. Scalable Folder Structure

```
apps/web/
│
├── src/
│   │
│   ├── app/                              # Next.js App Router (routing layer ONLY)
│   │   │                                 # App dir = thin routing shell
│   │   │                                 # No business logic here
│   │   │
│   │   ├── (auth)/
│   │   │   ├── layout.tsx               # Auth shell layout
│   │   │   ├── login/page.tsx           # Renders <LoginPage /> from features/
│   │   │   ├── register/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx               # Dashboard shell — RSC
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx             # Renders <DashboardPage />
│   │   │   │   ├── loading.tsx          # Streaming skeleton
│   │   │   │   └── error.tsx
│   │   │   ├── meetings/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   └── [meetingId]/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── loading.tsx
│   │   │   │       ├── error.tsx
│   │   │   │       └── @transcript/     # Parallel route — transcript panel
│   │   │   │           └── page.tsx
│   │   │   ├── commitments/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   └── [commitmentId]/page.tsx
│   │   │   ├── action-items/page.tsx
│   │   │   ├── team/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [memberId]/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── intelligence/            # AI assistant workspace
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       ├── layout.tsx
│   │   │       ├── profile/page.tsx
│   │   │       ├── team/page.tsx
│   │   │       ├── integrations/page.tsx
│   │   │       ├── billing/page.tsx
│   │   │       ├── notifications/page.tsx
│   │   │       └── security/page.tsx
│   │   │
│   │   ├── onboarding/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── create-team/page.tsx
│   │   │   ├── invite-team/page.tsx
│   │   │   └── connect-calendar/page.tsx
│   │   │
│   │   ├── api/                          # Next.js Route Handlers (BFF layer)
│   │   │   ├── auth/
│   │   │   │   ├── refresh/route.ts     # Silent token refresh
│   │   │   │   └── logout/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── stream/route.ts      # AI streaming proxy (SSE)
│   │   │   │   └── summarize/route.ts
│   │   │   └── webhooks/
│   │   │       └── socket/route.ts
│   │   │
│   │   ├── layout.tsx                   # Root — fonts, metadata, providers
│   │   ├── page.tsx                     # Landing page (marketing)
│   │   ├── pricing/page.tsx
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   └── globals.css
│   │
│   │
│   ├── features/                        # FEATURE MODULES — vertical slices
│   │   │                                # Each module is fully self-contained
│   │   │
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── RegisterForm.tsx
│   │   │   │   ├── OAuthButton.tsx
│   │   │   │   ├── AuthCard.tsx
│   │   │   │   ├── PasswordStrengthBar.tsx
│   │   │   │   ├── VerifyEmailGate.tsx
│   │   │   │   └── SessionExpiredModal.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useLogin.ts
│   │   │   │   ├── useRegister.ts
│   │   │   │   ├── useLogout.ts
│   │   │   │   └── usePasswordReset.ts
│   │   │   ├── store/
│   │   │   │   └── auth.store.ts        # Zustand slice
│   │   │   ├── api/
│   │   │   │   └── auth.api.ts          # TanStack Query mutations
│   │   │   ├── types/
│   │   │   │   └── auth.types.ts
│   │   │   └── index.ts                 # Public API of this module
│   │   │
│   │   ├── meetings/
│   │   │   ├── components/
│   │   │   │   ├── MeetingCard/
│   │   │   │   │   ├── MeetingCard.tsx
│   │   │   │   │   ├── MeetingCard.stories.tsx
│   │   │   │   │   └── MeetingCard.test.tsx
│   │   │   │   ├── MeetingList/
│   │   │   │   │   ├── MeetingList.tsx
│   │   │   │   │   └── MeetingListSkeleton.tsx
│   │   │   │   ├── MeetingDetail/
│   │   │   │   │   ├── MeetingDetail.tsx
│   │   │   │   │   ├── MeetingOverviewTab.tsx
│   │   │   │   │   ├── MeetingTranscriptTab.tsx
│   │   │   │   │   ├── MeetingActionItemsTab.tsx
│   │   │   │   │   └── MeetingCommitmentsTab.tsx
│   │   │   │   ├── LiveMeetingBanner.tsx
│   │   │   │   ├── BotStatusIndicator.tsx
│   │   │   │   ├── TranscriptViewer/
│   │   │   │   │   ├── TranscriptViewer.tsx    # Virtualized transcript
│   │   │   │   │   ├── TranscriptTurn.tsx
│   │   │   │   │   └── TranscriptSearch.tsx
│   │   │   │   ├── MeetingFilters.tsx
│   │   │   │   └── AddMeetingModal.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useMeetings.ts
│   │   │   │   ├── useMeeting.ts
│   │   │   │   ├── useCreateMeeting.ts
│   │   │   │   ├── useMeetingFilters.ts
│   │   │   │   └── useRealtimeMeeting.ts
│   │   │   ├── store/
│   │   │   │   └── meetings.store.ts
│   │   │   ├── api/
│   │   │   │   ├── meetings.queries.ts   # TanStack Query queryFns
│   │   │   │   └── meetings.mutations.ts # TanStack Query mutations
│   │   │   ├── types/
│   │   │   │   └── meetings.types.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── commitments/
│   │   │   ├── components/
│   │   │   │   ├── CommitmentTracker/
│   │   │   │   │   ├── CommitmentTracker.tsx   # Main tracker view
│   │   │   │   │   └── CommitmentTrackerSkeleton.tsx
│   │   │   │   ├── CommitmentCard/
│   │   │   │   ├── CommitmentTimeline/         # Cross-meeting history
│   │   │   │   ├── CommitmentScore/            # SVG donut gauge
│   │   │   │   ├── MarkFulfilledModal.tsx
│   │   │   │   └── DeferModal.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCommitments.ts
│   │   │   │   ├── useCommitmentStats.ts
│   │   │   │   ├── useMarkFulfilled.ts
│   │   │   │   └── useRealtimeCommitments.ts
│   │   │   ├── store/
│   │   │   │   └── commitments.store.ts
│   │   │   ├── api/
│   │   │   │   ├── commitments.queries.ts
│   │   │   │   └── commitments.mutations.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── intelligence/                # AI assistant + streaming
│   │   │   ├── components/
│   │   │   │   ├── AIChatPanel/
│   │   │   │   │   ├── AIChatPanel.tsx
│   │   │   │   │   ├── ChatMessage.tsx
│   │   │   │   │   ├── ChatInput.tsx
│   │   │   │   │   └── StreamingCursor.tsx
│   │   │   │   ├── MeetingSummaryStream/
│   │   │   │   │   ├── MeetingSummaryStream.tsx
│   │   │   │   │   └── SummaryBlock.tsx
│   │   │   │   ├── ActionItemExtraction/
│   │   │   │   │   └── ExtractionStream.tsx    # Live extraction UI
│   │   │   │   └── InsightsPanel/
│   │   │   │       └── InsightsPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAIStream.ts              # Core streaming hook
│   │   │   │   ├── useMeetingSummary.ts
│   │   │   │   └── useAIChat.ts
│   │   │   ├── atoms/
│   │   │   │   └── ai.atoms.ts                 # Jotai atoms for streaming
│   │   │   └── index.ts
│   │   │
│   │   ├── action-items/
│   │   │   ├── components/
│   │   │   │   ├── ActionItemBoard/            # Kanban view
│   │   │   │   ├── ActionItemList/
│   │   │   │   ├── ActionItemCard/
│   │   │   │   └── IntegrationSyncButton.tsx
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   └── index.ts
│   │   │
│   │   ├── team/
│   │   │   ├── components/
│   │   │   │   ├── TeamHealthDashboard/
│   │   │   │   ├── MemberTable/
│   │   │   │   ├── MemberProfile/
│   │   │   │   └── InviteMemberModal/
│   │   │   ├── hooks/
│   │   │   ├── store/
│   │   │   └── index.ts
│   │   │
│   │   ├── analytics/
│   │   │   ├── components/
│   │   │   │   ├── charts/
│   │   │   │   │   ├── FulfillmentRateChart.tsx
│   │   │   │   │   ├── MeetingsPerWeekChart.tsx
│   │   │   │   │   ├── MemberComparisonChart.tsx
│   │   │   │   │   └── TrendLineChart.tsx
│   │   │   │   ├── StatCard/
│   │   │   │   └── AnalyticsDashboard/
│   │   │   ├── hooks/
│   │   │   │   ├── useAnalyticsOverview.ts
│   │   │   │   ├── useAnalyticsTrends.ts
│   │   │   │   └── useMemberAnalytics.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── integrations/
│   │   │   ├── components/
│   │   │   │   ├── IntegrationCard/
│   │   │   │   ├── OAuthConnectButton/
│   │   │   │   ├── CalendarEventsPreview/
│   │   │   │   └── integrations/
│   │   │   │       ├── SlackIntegration.tsx
│   │   │   │       ├── JiraIntegration.tsx
│   │   │   │       ├── LinearIntegration.tsx
│   │   │   │       ├── NotionIntegration.tsx
│   │   │   │       ├── GithubIntegration.tsx
│   │   │   │       ├── AsanaIntegration.tsx
│   │   │   │       ├── TrelloIntegration.tsx
│   │   │   │       └── ClickUpIntegration.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useIntegrations.ts
│   │   │   │   └── useOAuthConnect.ts
│   │   │   └── index.ts
│   │   │
│   │   └── billing/
│   │       ├── components/
│   │       │   ├── PricingTable/
│   │       │   ├── UpgradeModal/
│   │       │   └── BillingPortal/
│   │       ├── hooks/
│   │       └── index.ts
│   │
│   │
│   ├── shared/                          # SHARED — no feature affiliation
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx         # Main RSC shell (sidebar + topbar)
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── SidebarNav.tsx
│   │   │   │   │   ├── SidebarUser.tsx
│   │   │   │   │   └── SidebarTeamSwitcher.tsx
│   │   │   │   ├── Topbar/
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── GlobalSearch.tsx  # Cmd+K command palette
│   │   │   │   │   └── NotificationBell.tsx
│   │   │   │   ├── MobileNav.tsx
│   │   │   │   ├── PageContainer.tsx
│   │   │   │   └── PageHeader.tsx
│   │   │   │
│   │   │   ├── feedback/
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── DataLoadingError.tsx
│   │   │   │   ├── ConfirmModal.tsx
│   │   │   │   ├── OfflineBanner.tsx
│   │   │   │   └── Toast/
│   │   │   │       ├── Toast.tsx
│   │   │   │       └── Toaster.tsx
│   │   │   │
│   │   │   └── data-display/
│   │   │       ├── VirtualList.tsx      # react-virtual wrapper
│   │   │       ├── InfiniteScroll.tsx
│   │   │       ├── DataTable/
│   │   │       │   ├── DataTable.tsx    # TanStack Table
│   │   │       │   ├── DataTableHeader.tsx
│   │   │       │   └── DataTablePagination.tsx
│   │   │       ├── RelativeTime.tsx
│   │   │       ├── StatusDot.tsx
│   │   │       └── CopyButton.tsx
│   │   │
│   │   ├── providers/
│   │   │   ├── Providers.tsx            # Root client providers wrapper
│   │   │   ├── QueryProvider.tsx        # TanStack Query client
│   │   │   ├── AuthProvider.tsx         # Auth state + silent refresh
│   │   │   ├── WebSocketProvider.tsx    # Socket.io connection
│   │   │   ├── ThemeProvider.tsx        # next-themes
│   │   │   └── AnalyticsProvider.tsx    # PostHog + Sentry init
│   │   │
│   │   ├── hooks/
│   │   │   ├── useDebounce.ts
│   │   │   ├── useMediaQuery.ts
│   │   │   ├── useOnClickOutside.ts
│   │   │   ├── useLocalStorage.ts
│   │   │   ├── useCopyToClipboard.ts
│   │   │   ├── useKeyboardShortcut.ts
│   │   │   ├── useIntersectionObserver.ts
│   │   │   └── useNetworkStatus.ts      # Online/offline detection
│   │   │
│   │   └── utils/
│   │       ├── cn.ts                    # clsx + tailwind-merge
│   │       ├── format-date.ts
│   │       ├── format-duration.ts
│   │       ├── slugify.ts
│   │       ├── platform-detect.ts
│   │       └── retry.ts                 # Exponential backoff utility
│   │
│   │
│   ├── store/                           # Global Zustand stores
│   │   ├── auth.store.ts                # Token (memory) + user + session
│   │   ├── ui.store.ts                  # Sidebar, modals, command palette
│   │   ├── realtime.store.ts            # WS connection status, online users
│   │   └── index.ts                     # Typed useStore hooks
│   │
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                # Axios + interceptors + token refresh
│   │   │   └── query-client.ts          # TanStack Query client config
│   │   │
│   │   ├── websocket/
│   │   │   ├── socket.ts                # Socket.io client singleton
│   │   │   ├── socket.events.ts         # Event name constants
│   │   │   └── socket.middleware.ts     # Auth + reconnect middleware
│   │   │
│   │   ├── streaming/
│   │   │   ├── ai-stream.ts             # ReadableStream decoder
│   │   │   └── stream-parser.ts         # Server-sent events parser
│   │   │
│   │   └── cache/
│   │       ├── query-keys.ts            # All TanStack Query keys factory
│   │       └── cache-config.ts          # staleTime/gcTime per query type
│   │
│   │
│   └── types/
│       ├── global.d.ts                  # Window augmentations
│       └── env.d.ts                     # process.env type safety
│
│
├── public/
│   ├── icons/                           # Platform SVG icons
│   ├── fonts/                           # Self-hosted fonts (perf)
│   ├── manifest.json                    # PWA manifest
│   ├── sw.js                            # Service Worker (generated)
│   └── offline.html                     # Offline fallback page
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
└── package.json
```

---

## 5. State Management Architecture

### State Ownership Model

```
STATE TYPE          OWNER               WHY
────────────────────────────────────────────────────────────────────
Server state        TanStack Query      Remote data, caching, sync
Auth/session        Zustand             Must survive re-renders, no stale
UI state            Zustand             Sidebar, modals, selections
URL state           Next.js searchParams Shareable, bookmarkable filters
Form state          React Hook Form     Uncontrolled, performant
AI stream state     Jotai atoms         Reactive, derived, async-safe
Realtime events     Zustand             WebSocket → store updates
Optimistic updates  TanStack Query      Built-in rollback mechanism
Local prefs         Zustand + persist   Theme, collapsed panels
```

### Zustand Store Architecture

```typescript
// store/auth.store.ts — Strict slice pattern

interface AuthState {
  // State
  user: User | null
  accessToken: string | null       // In memory ONLY — never localStorage
  isAuthenticated: boolean
  isLoading: boolean               // True during initial auth check

  // Actions
  setUser: (user: User) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) =>
        set({ user, isAuthenticated: !!user }, false, 'auth/setUser'),

      setAccessToken: (token) =>
        set({ accessToken: token }, false, 'auth/setToken'),

      clearAuth: () =>
        set(
          { user: null, accessToken: null, isAuthenticated: false },
          false,
          'auth/clear'
        ),

      setLoading: (isLoading) =>
        set({ isLoading }, false, 'auth/setLoading'),
    }),
    { name: 'AuthStore' }
  )
)

// RULE: Never store accessToken anywhere except this Zustand store.
// RULE: Refresh token lives ONLY in HttpOnly cookie.
// RULE: On page load: call /auth/refresh → if success: setAccessToken + setUser
//                                         → if fail:   clearAuth → /login
```

```typescript
// store/ui.store.ts — UI state slice

interface UIState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  activeModal: string | null
  toasts: Toast[]

  toggleSidebar: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openModal: (id: string) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        commandPaletteOpen: false,
        activeModal: null,
        toasts: [],

        toggleSidebar: () =>
          set(
            (s) => ({ sidebarCollapsed: !s.sidebarCollapsed }),
            false,
            'ui/toggleSidebar'
          ),
        // ... rest of actions
      }),
      {
        name: 'vocaply-ui',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed, // Only persist layout prefs
        }),
      }
    ),
    { name: 'UIStore' }
  )
)
```

### TanStack Query Architecture

```typescript
// lib/cache/query-keys.ts — Typed query key factory
// Prevents cache key collisions across features

export const queryKeys = {
  // Auth
  auth: {
    me: () => ['auth', 'me'] as const,
    sessions: () => ['auth', 'sessions'] as const,
  },

  // Meetings — all keys scoped to teamId for tenant isolation
  meetings: {
    all: (teamId: string) => ['teams', teamId, 'meetings'] as const,
    list: (teamId: string, filters: MeetingFilters) =>
      [...queryKeys.meetings.all(teamId), 'list', filters] as const,
    detail: (teamId: string, meetingId: string) =>
      [...queryKeys.meetings.all(teamId), meetingId] as const,
    transcript: (teamId: string, meetingId: string) =>
      [...queryKeys.meetings.detail(teamId, meetingId), 'transcript'] as const,
  },

  // Commitments
  commitments: {
    all: (teamId: string) => ['teams', teamId, 'commitments'] as const,
    list: (teamId: string, filters: CommitmentFilters) =>
      [...queryKeys.commitments.all(teamId), 'list', filters] as const,
    stats: (teamId: string, period: DateRange) =>
      [...queryKeys.commitments.all(teamId), 'stats', period] as const,
    detail: (teamId: string, id: string) =>
      [...queryKeys.commitments.all(teamId), id] as const,
  },

  // Analytics
  analytics: {
    overview: (teamId: string, period: DateRange) =>
      ['teams', teamId, 'analytics', 'overview', period] as const,
    members: (teamId: string, period: DateRange) =>
      ['teams', teamId, 'analytics', 'members', period] as const,
    trends: (teamId: string, metric: string, period: DateRange) =>
      ['teams', teamId, 'analytics', 'trends', metric, period] as const,
  },
} as const

// lib/cache/cache-config.ts — staleTime per data type

export const cacheConfig = {
  // User profile — stale after 5 min, garbage collected after 30 min
  userProfile:     { staleTime: 5 * 60 * 1000,   gcTime: 30 * 60 * 1000 },
  // Meeting list — stale after 30s (realtime updates via WS)
  meetingList:     { staleTime: 30 * 1000,         gcTime: 5 * 60 * 1000 },
  // Meeting detail — stale after 2 min (transcript rarely changes)
  meetingDetail:   { staleTime: 2 * 60 * 1000,    gcTime: 10 * 60 * 1000 },
  // Commitments — stale after 15s (frequently updated)
  commitments:     { staleTime: 15 * 1000,         gcTime: 5 * 60 * 1000 },
  // Analytics — stale after 5 min (expensive queries)
  analytics:       { staleTime: 5 * 60 * 1000,    gcTime: 30 * 60 * 1000 },
  // Plans — stale after 1 hour (rarely changes)
  billingPlans:    { staleTime: 60 * 60 * 1000,   gcTime: 24 * 60 * 60 * 1000 },
}
```

### Jotai Atoms for AI Streaming

```typescript
// features/intelligence/atoms/ai.atoms.ts
// Jotai is ideal for derived, async, streaming state

import { atom } from 'jotai'

// Base atom — current streaming text
export const streamingTextAtom = atom<string>('')

// Base atom — is stream currently active
export const isStreamingAtom = atom<boolean>(false)

// Base atom — stream error
export const streamErrorAtom = atom<Error | null>(null)

// Derived atom — word count from streaming text
export const streamingWordCountAtom = atom(
  (get) => get(streamingTextAtom).split(' ').filter(Boolean).length
)

// Derived atom — last N characters (for cursor animation)
export const streamingLastCharsAtom = atom(
  (get) => get(streamingTextAtom).slice(-20)
)

// Write atom — reset stream
export const resetStreamAtom = atom(null, (_get, set) => {
  set(streamingTextAtom, '')
  set(isStreamingAtom, false)
  set(streamErrorAtom, null)
})

// Async atom — meeting summary (streams from API)
export const meetingSummaryAtom = atom(async (get) => {
  // Async atoms integrate with Suspense automatically
  const meetingId = get(currentMeetingIdAtom)
  if (!meetingId) return null
  const response = await fetch(`/api/ai/summarize?meetingId=${meetingId}`)
  return response.json()
})
```

---

## 6. Realtime Frontend Architecture

### WebSocket Connection Lifecycle

```typescript
// lib/websocket/socket.ts — Singleton with auth + reconnect

import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'

class SocketManager {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT = 10

  connect(accessToken: string): Socket {
    if (this.socket?.connected) return this.socket

    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { token: accessToken },
      transports: ['websocket'],          // Skip polling entirely
      timeout: 10_000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,       // Max 30s between retries
      reconnectionAttempts: this.MAX_RECONNECT,
      withCredentials: true,
    })

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0
      useRealtimeStore.getState().setConnectionStatus('connected')
    })

    this.socket.on('disconnect', (reason) => {
      useRealtimeStore.getState().setConnectionStatus('disconnected')
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected (e.g., token expired)
        // → Refresh token → reconnect
        this.handleServerDisconnect()
      }
    })

    this.socket.on('connect_error', (err) => {
      if (err.message === 'TOKEN_EXPIRED') {
        this.handleTokenExpiry()
      }
    })

    return this.socket
  }

  private async handleTokenExpiry() {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' })
      const { accessToken } = await res.json()
      useAuthStore.getState().setAccessToken(accessToken)
      // Reconnect with new token
      this.socket?.auth && (this.socket.auth = { token: accessToken })
      this.socket?.connect()
    } catch {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    }
  }

  private async handleServerDisconnect() {
    await new Promise((r) => setTimeout(r, 1000))
    this.connect(useAuthStore.getState().accessToken!)
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
  }

  getSocket(): Socket | null {
    return this.socket
  }
}

export const socketManager = new SocketManager()
```

### WebSocket Provider & Room Management

```typescript
// shared/providers/WebSocketProvider.tsx
'use client'

import { useEffect, createContext, useContext } from 'react'
import { socketManager } from '@/lib/websocket/socket'
import { useAuthStore } from '@/store/auth.store'
import { useEventHandlers } from './useEventHandlers'

const SocketContext = createContext<ReturnType<typeof socketManager.getSocket>>(null)

export function WebSocketProvider({ children, teamId }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const socket = socketManager.connect(accessToken)

    // Join team room — all team events flow through here
    socket.emit('join:team', { teamId })

    // Register all event handlers
    registerEventHandlers(socket)

    return () => {
      socket.emit('leave:team', { teamId })
      socketManager.disconnect()
    }
  }, [isAuthenticated, accessToken, teamId])

  return (
    <SocketContext.Provider value={socketManager.getSocket()}>
      {children}
    </SocketContext.Provider>
  )
}

// Event handler registration — maps WS events to store updates + cache invalidation
function registerEventHandlers(socket: Socket) {
  const queryClient = getQueryClient()
  const { teamId } = useTeamStore.getState()

  // Meeting status updates
  socket.on('meeting:bot_joining',  ({ meetingId }) => {
    updateMeetingStatus(queryClient, teamId, meetingId, 'BOT_JOINING')
  })

  socket.on('meeting:recording',   ({ meetingId }) => {
    updateMeetingStatus(queryClient, teamId, meetingId, 'RECORDING')
    useMeetingsStore.getState().setLiveMeeting(meetingId)
  })

  socket.on('meeting:processed',   ({ meetingId, summary, counts }) => {
    updateMeetingStatus(queryClient, teamId, meetingId, 'DONE')
    // Invalidate related queries — fresh data will be fetched
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(teamId, meetingId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
    showToast({ title: 'Meeting processed', description: summary })
  })

  // Commitment updates
  socket.on('commitment:missed', ({ commitmentId, ownerName }) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
    showToast({ title: `${ownerName} missed a deadline`, variant: 'warning' })
  })

  socket.on('commitment:fulfilled', ({ commitmentId, ownerName, newScore }) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
    useMembersStore.getState().updateScore(commitmentId, newScore)
  })

  // Member score updates
  socket.on('member:score_updated', ({ userId, newScore, change }) => {
    useMembersStore.getState().updateScore(userId, newScore)
    animateScoreChange(userId, change)
  })

  // Real-time transcript (during live meeting)
  socket.on('transcript:turn', ({ meetingId, turn }) => {
    useMeetingsStore.getState().appendTranscriptTurn(meetingId, turn)
  })
}
```

---

## 7. AI Streaming UI System

### Architecture Overview

```
User Input
    ↓
ChatInput component
    ↓
useAIStream hook → POST /api/ai/stream (Next.js route handler)
    ↓
Route handler → proxies to FastAPI /extract or Claude API
    ↓
ReadableStream (chunked response)
    ↓
stream-parser.ts → decodes SSE chunks
    ↓
Jotai atom updates (streamingTextAtom) per chunk
    ↓
ChatMessage component re-renders with new text
    ↓
StreamingCursor animates at end of text
    ↓
On stream complete → save to TanStack Query cache
```

### Core Streaming Hook

```typescript
// features/intelligence/hooks/useAIStream.ts

import { useState, useCallback, useRef } from 'react'
import { useSetAtom } from 'jotai'
import { streamingTextAtom, isStreamingAtom, streamErrorAtom } from '../atoms/ai.atoms'

interface StreamOptions {
  endpoint: string
  payload: Record<string, unknown>
  onComplete?: (fullText: string) => void
  onError?: (error: Error) => void
}

export function useAIStream() {
  const setStreamingText = useSetAtom(streamingTextAtom)
  const setIsStreaming = useSetAtom(isStreamingAtom)
  const setStreamError = useSetAtom(streamErrorAtom)
  const abortControllerRef = useRef<AbortController | null>(null)

  const stream = useCallback(async (options: StreamOptions) => {
    const { endpoint, payload, onComplete, onError } = options

    // Cancel any existing stream
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStreamingText('')
    setIsStreaming(true)
    setStreamError(null)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        // Parse SSE format: "data: {text}\n\n"
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const text = parsed.delta?.text || parsed.text || ''
              fullText += text

              // Atom update triggers re-render of all consumers
              setStreamingText(fullText)
            } catch {
              // Partial JSON — continue
            }
          }
        }
      }

      onComplete?.(fullText)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return // Intentional cancel
      const err = error as Error
      setStreamError(err)
      onError?.(err)
    } finally {
      setIsStreaming(false)
    }
  }, [setStreamingText, setIsStreaming, setStreamError])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
  }, [setIsStreaming])

  return { stream, cancel }
}
```

### Streaming UI Components

```typescript
// features/intelligence/components/AIChatPanel/ChatMessage.tsx
'use client'

import { useAtomValue } from 'jotai'
import { streamingTextAtom, isStreamingAtom } from '../../atoms/ai.atoms'
import { StreamingCursor } from './StreamingCursor'

interface Props {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: Props) {
  const liveText = useAtomValue(streamingTextAtom)
  const activelyStreaming = useAtomValue(isStreamingAtom)

  // Show live streaming text if this is the active streaming message
  const displayText = isStreaming && activelyStreaming ? liveText : content

  return (
    <div className={cn('flex gap-3', role === 'user' && 'flex-row-reverse')}>
      <MessageAvatar role={role} />
      <div className="prose prose-sm max-w-none">
        {/* Render markdown incrementally as it streams */}
        <MarkdownRenderer content={displayText} />
        {isStreaming && activelyStreaming && <StreamingCursor />}
      </div>
    </div>
  )
}

// StreamingCursor.tsx — blinking cursor at end of stream
export function StreamingCursor() {
  return (
    <span
      className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse"
      aria-hidden
    />
  )
}

// MeetingSummaryStream.tsx — streams AI meeting summary
'use client'

import { Suspense } from 'react'
import { useAtomValue } from 'jotai'
import { meetingSummaryAtom } from '../../atoms/ai.atoms'

// Suspense + async atom = component automatically suspends while streaming
export function MeetingSummaryStream({ meetingId }: { meetingId: string }) {
  return (
    <Suspense fallback={<SummarySkeleton />}>
      <SummaryContent meetingId={meetingId} />
    </Suspense>
  )
}

function SummaryContent({ meetingId }: { meetingId: string }) {
  const summary = useAtomValue(meetingSummaryAtom)  // Suspends automatically

  return (
    <div className="space-y-2">
      {summary?.bullets.map((bullet, i) => (
        <SummaryBullet key={i} text={bullet} delay={i * 100} />
      ))}
    </div>
  )
}

// SummaryBullet with entrance animation as each bullet streams in
function SummaryBullet({ text, delay }: { text: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000 }}
      className="flex gap-2"
    >
      <span className="text-primary mt-1">•</span>
      <p className="text-sm">{text}</p>
    </motion.div>
  )
}
```

### Next.js Route Handler — AI Stream Proxy

```typescript
// app/api/ai/stream/route.ts — BFF streaming proxy

import { NextRequest } from 'next/server'
import { getAccessToken } from '@/lib/auth/token.server'

export const runtime = 'edge'  // Run at edge for lowest latency

export async function POST(req: NextRequest) {
  const token = await getAccessToken(req)
  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()

  // Proxy to FastAPI — returns ReadableStream
  const upstreamResponse = await fetch(
    `${process.env.AI_PIPELINE_URL}/extract`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  )

  if (!upstreamResponse.ok) {
    return new Response('Upstream error', { status: 502 })
  }

  // Pass the ReadableStream directly to the client
  // Zero buffering — pure pipe
  return new Response(upstreamResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',          // Disable Nginx buffering
    },
  })
}
```

---

## 8. Dashboard Rendering Strategy

### Rendering Decision Tree

```
For each page/component, apply this decision:

Is the content STATIC (same for everyone)?
  YES → Static Generation (SSG) with ISR
  NO  ↓

Does it need PERSONALIZATION but not realtime?
  YES → Server Components (RSC) with per-request data fetch
  NO  ↓

Does it need REALTIME updates?
  YES → Client Component with TanStack Query + WebSocket
  NO  ↓

Default → Server Component with Suspense streaming
```

### Rendering Map for Vocaply

```
ROUTE                    RENDERING STRATEGY         REASON
──────────────────────────────────────────────────────────────────────────
/ (landing)              SSG + ISR (1hr)             Marketing, rarely changes
/pricing                 SSG + ISR (1hr)             Billing plans change rarely
/login, /register        SSG                         Pure client forms, no data

/dashboard               RSC + Streaming             Personalized, initial load
  ├── Greeting           RSC                         User name from server
  ├── MyCommitments      Client (TanStack Query)     Realtime updates via WS
  ├── UpcomingMeetings   RSC + Suspense              Calendar data, not realtime
  └── ActivityFeed       Client (TanStack Query)     Frequent updates

/meetings                RSC + Streaming             List with server filters
  ├── MeetingList        Client (TanStack Query)     Pagination, filter updates
  └── BotStatusBanner    Client (WebSocket)          Live bot status

/meetings/[id]           RSC shell + Client tabs     Static shell, dynamic tabs
  ├── Overview tab       RSC + Suspense              Server-fetch summary
  ├── Transcript tab     Client (virtual list)       Large data, needs virtual
  ├── ActionItems tab    Client (TanStack Query)     Editable, optimistic
  └── Commitments tab    Client (TanStack Query)     Editable, optimistic

/commitments             Client (TanStack Query)     High interactivity
/analytics               Client (TanStack Query)     Chart data, date ranges
/intelligence            Client (Jotai atoms)        AI streaming, fully client
/settings/*              RSC + Client form           Read on server, edit client
```

### RSC Data Fetching Pattern

```typescript
// app/(dashboard)/layout.tsx — RSC layout fetches once, passes to children

import { getTeam, getUser } from '@/lib/api/server'
import { AppShell } from '@/shared/components/layout/AppShell'

// This runs on the server — no client bundle
export default async function DashboardLayout({ children }: Props) {
  // Parallel data fetching — not waterfall
  const [user, team] = await Promise.all([
    getUser(),       // FROM: JWT cookie on server
    getTeam(),       // FROM: API with server-side token
  ])

  if (!user) redirect('/login')
  if (!team) redirect('/onboarding')

  return (
    <AppShell user={user} team={team}>
      {children}
    </AppShell>
  )
}

// app/(dashboard)/meetings/page.tsx — Streaming RSC

import { Suspense } from 'react'
import { MeetingListServer } from '@/features/meetings/components/MeetingList'
import { MeetingListSkeleton } from '@/features/meetings/components'
import { PageHeader } from '@/shared/components/layout'

// Page shell renders instantly (no data)
// MeetingListServer streams in when data ready
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: MeetingFilters
}) {
  return (
    <div>
      <PageHeader
        title="Meetings"
        actions={<AddMeetingButton />}   // Client component island
      />

      {/* Suspense boundary — shows skeleton until server data ready */}
      <Suspense fallback={<MeetingListSkeleton count={6} />}>
        <MeetingListServer filters={searchParams} />
      </Suspense>
    </div>
  )
}

// MeetingListServer — RSC that fetches and renders initial data
// Client-side TanStack Query takes over for mutations + realtime
async function MeetingListServer({ filters }: Props) {
  const initialData = await getMeetings(filters)

  // Passes server data as initialData to client component
  // Client immediately shows data, then keeps it fresh
  return <MeetingListClient initialData={initialData} filters={filters} />
}
```

### Virtual List for Large Data

```typescript
// shared/components/data-display/VirtualList.tsx
// Handles transcripts with 1000+ turns, large team lists

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

interface VirtualListProps<T> {
  items: T[]
  estimateSize: (index: number) => number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 5,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  })

  return (
    <div ref={parentRef} className="overflow-auto h-full">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  )
}

// Usage in TranscriptViewer:
<VirtualList
  items={transcript.turns}
  estimateSize={() => 72}          // Each turn ~72px
  renderItem={(turn) => (
    <TranscriptTurn key={turn.id} turn={turn} />
  )}
/>
```

---

## 9. WebSocket & Event Architecture

### Event Contract (Frontend ↔ Backend)

```typescript
// lib/websocket/socket.events.ts — Single source of truth for all events

// ── CLIENT → SERVER ─────────────────────────────────────────────────
export const ClientEvents = {
  JOIN_TEAM:          'join:team',         // payload: { teamId }
  LEAVE_TEAM:         'leave:team',        // payload: { teamId }
  JOIN_MEETING:       'join:meeting',      // payload: { meetingId }
  LEAVE_MEETING:      'leave:meeting',     // payload: { meetingId }
  MARK_PRESENCE:      'presence:ping',     // payload: { userId, teamId }
  AI_CHAT_MESSAGE:    'ai:chat',           // payload: { message, context }
} as const

// ── SERVER → CLIENT ─────────────────────────────────────────────────
export const ServerEvents = {
  // Meeting lifecycle
  MEETING_BOT_JOINING:   'meeting:bot_joining',    // { meetingId }
  MEETING_RECORDING:     'meeting:recording',      // { meetingId, startedAt }
  MEETING_PROCESSING:    'meeting:processing',     // { meetingId }
  MEETING_PROCESSED:     'meeting:processed',      // { meetingId, summary, counts }
  MEETING_FAILED:        'meeting:failed',         // { meetingId, reason }
  TRANSCRIPT_TURN:       'transcript:turn',        // { meetingId, turn }

  // Commitments
  COMMITMENT_CREATED:    'commitment:created',     // { commitment }
  COMMITMENT_FULFILLED:  'commitment:fulfilled',   // { commitmentId, resolvedAt }
  COMMITMENT_MISSED:     'commitment:missed',      // { commitmentId, ownerName }
  COMMITMENT_DEFERRED:   'commitment:deferred',    // { commitmentId, newDueDate }

  // Personal alerts (to user room only)
  MY_DEADLINE_TODAY:     'my:deadline_today',      // { commitmentId, text }
  MY_DEADLINE_MISSED:    'my:deadline_missed',     // { commitmentId, text }
  MY_SCORE_UPDATED:      'my:score_updated',       // { newScore, change }

  // Team
  MEMBER_SCORE_UPDATED:  'member:score_updated',   // { userId, newScore, change }
  MEMBER_JOINED:         'member:joined',          // { user }
  MEMBER_LEFT:           'member:left',            // { userId }

  // System
  PLAN_LIMIT_REACHED:    'system:plan_limit',      // { resource, limit }
  SESSION_EXPIRED:       'system:session_expired', // {}
} as const

// Type-safe event payloads
export type EventPayloads = {
  [ServerEvents.MEETING_PROCESSED]: {
    meetingId: string
    summary: string
    counts: { commitments: number; actionItems: number; decisions: number }
  }
  [ServerEvents.COMMITMENT_FULFILLED]: {
    commitmentId: string
    resolvedAt: string
    ownerName: string
    newScore: number
  }
  // ... all events fully typed
}
```

### Event-Driven Store Updates

```typescript
// The golden rule: WebSocket events NEVER directly update component state.
// They ALWAYS go through either:
//   A) TanStack Query cache invalidation (for server state)
//   B) Zustand store updates (for UI/optimistic state)

// This ensures single source of truth and prevents stale closure bugs.

// Pattern A — Query invalidation (preferred for server data)
socket.on(ServerEvents.MEETING_PROCESSED, ({ meetingId }) => {
  // Invalidate → TanStack Query refetches → all subscribers update
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.detail(teamId, meetingId),
  })
  // Also invalidate the list (counts changed)
  queryClient.invalidateQueries({
    queryKey: queryKeys.meetings.all(teamId),
    exact: false,
  })
})

// Pattern B — Store update (for realtime UI state that isn't server data)
socket.on(ServerEvents.MEETING_RECORDING, ({ meetingId, startedAt }) => {
  // Update local store directly (no refetch needed — this is UI state)
  useMeetingsStore.getState().setBotStatus(meetingId, {
    status: 'RECORDING',
    startedAt,
  })
})

// Pattern C — Optimistic update with rollback
async function markFulfilled(commitmentId: string) {
  // 1. Optimistically update local cache
  queryClient.setQueryData(
    queryKeys.commitments.detail(teamId, commitmentId),
    (old: Commitment) => ({ ...old, status: 'FULFILLED', resolvedAt: new Date().toISOString() })
  )

  try {
    // 2. Send mutation to server
    await commitmentApi.markFulfilled(commitmentId)
    // 3. Success — cache is already updated, nothing to do
  } catch (error) {
    // 4. Failure — rollback optimistic update
    queryClient.invalidateQueries({
      queryKey: queryKeys.commitments.detail(teamId, commitmentId),
    })
    showToast({ title: 'Failed to update commitment', variant: 'error' })
  }
}
```

---

## 10. Caching Strategy

### Multi-Layer Cache Architecture

```
LAYER 1 — CDN / Edge Cache (Cloudflare / Vercel Edge)
  What: Static assets, public pages, immutable files
  TTL:  Fonts/icons: 1 year (content-hash URLs)
        Landing page: 1 hour (ISR)
        Marketing pages: 1 hour (ISR)
  Who:  Configured in next.config.ts + Vercel headers

LAYER 2 — Next.js Route Cache (Server-side)
  What: RSC render output per request
  TTL:  Dashboard pages: no-store (personalized, always fresh)
        Public pages: 1 hour
  Who:  next.config.ts cache control headers

LAYER 3 — TanStack Query Cache (Client-side)
  What: API response data (meetings, commitments, analytics)
  TTL:  Per query type (see cache-config.ts above)
  Who:  QueryProvider with custom gcTime/staleTime

LAYER 4 — Browser Cache (HTTP Cache)
  What: API responses with explicit cache headers
  TTL:  Immutable assets: max-age=31536000
        API responses: private, no-cache (auth data)
  Who:  Backend sets Cache-Control headers

LAYER 5 — Service Worker Cache (PWA)
  What: App shell, fonts, icons, critical CSS
  TTL:  Until next deploy (cache-busted by build hash)
  Who:  next-pwa generated service worker
```

### TanStack Query Invalidation Strategy

```typescript
// Cascading invalidation — invalidating parent invalidates children

// When a meeting is processed:
queryClient.invalidateQueries({
  queryKey: ['teams', teamId, 'meetings'],  // Invalidates ALL meeting queries
  exact: false,                              // Including list and detail variants
})

// More surgical — only invalidate specific meeting
queryClient.invalidateQueries({
  queryKey: queryKeys.meetings.detail(teamId, meetingId),
})

// Prefetching — load data before user navigates
async function prefetchMeeting(meetingId: string) {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.meetings.detail(teamId, meetingId),
    queryFn: () => meetingsApi.getById(meetingId),
    staleTime: 2 * 60 * 1000,
  })
}

// On hover of meeting card — prefetch the detail
<MeetingCard
  onMouseEnter={() => prefetchMeeting(meeting.id)}
  {...props}
/>

// Background refresh — keep data fresh without blocking UI
// TanStack Query handles this automatically via staleTime + refetchOnWindowFocus
// Custom: refetch every 30s for live meeting data
const { data } = useQuery({
  queryKey: queryKeys.meetings.list(teamId, filters),
  queryFn: () => meetingsApi.list(filters),
  ...cacheConfig.meetingList,
  // During active recording — poll every 5s
  refetchInterval: hasLiveMeeting ? 5000 : false,
})
```

---

## 11. Performance Optimization

### Bundle Optimization

```typescript
// next.config.ts — production optimizations

import type { NextConfig } from 'next'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

const nextConfig: NextConfig = {
  // Strict mode in development
  reactStrictMode: true,

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'],
    deviceSizes: [640, 768, 1024, 1280, 1536],
  },

  // Bundle splitting
  experimental: {
    optimizeCss: true,
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },

  webpack: (config, { isServer, dev }) => {
    // Analyze bundles in CI
    if (process.env.ANALYZE === 'true') {
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      )
    }

    // Alias heavy libraries to lighter alternatives
    config.resolve.alias = {
      ...config.resolve.alias,
      'lodash': 'lodash-es',  // Tree-shakeable
    }

    return config
  },
}

export default nextConfig
```

### Code Splitting Strategy

```typescript
// Route-level splitting is automatic in Next.js App Router
// Feature-level splitting — lazy load heavy features

// Heavy chart library — only loaded on analytics page
const FulfillmentRateChart = dynamic(
  () => import('@/features/analytics/components/charts/FulfillmentRateChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,  // Charts are client-only
  }
)

// AI chat panel — only loaded when user opens it
const AIChatPanel = dynamic(
  () => import('@/features/intelligence/components/AIChatPanel/AIChatPanel'),
  {
    loading: () => <ChatSkeleton />,
    ssr: false,
  }
)

// Command palette — only loaded when Cmd+K is pressed
const CommandPalette = dynamic(
  () => import('@/shared/components/layout/Topbar/GlobalSearch'),
  { ssr: false }
)

// Framer Motion — only load when animations needed
const MotionDiv = dynamic(
  () => import('framer-motion').then((mod) => mod.motion.div),
  { ssr: false }
)
```

### React Performance Patterns

```typescript
// 1. Memo only where profiling proves it's needed
// Bad: memo everything "just in case"
// Good: profile first, memo second

// MeetingCard receives stable props → memo is justified
export const MeetingCard = memo(function MeetingCard({ meeting, onSelect }: Props) {
  return (...)
}, (prev, next) => {
  // Custom comparison — only re-render if meeting data changed
  return prev.meeting.id === next.meeting.id &&
         prev.meeting.status === next.meeting.status &&
         prev.meeting.updatedAt === next.meeting.updatedAt
})

// 2. Stable callbacks with useCallback
function MeetingList({ teamId }: Props) {
  const handleSelect = useCallback((meetingId: string) => {
    router.push(`/meetings/${meetingId}`)
  }, [router])  // router is stable from next/navigation

  return (
    <VirtualList
      items={meetings}
      renderItem={(meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          onSelect={handleSelect}  // Stable reference — MeetingCard won't re-render
        />
      )}
    />
  )
}

// 3. Selector pattern — subscribe to only the slice you need
// Bad:
const store = useAuthStore()  // Re-renders on ANY store change
const user = store.user

// Good:
const user = useAuthStore((state) => state.user)  // Only re-renders when user changes

// 4. Transition API for non-urgent updates
import { useTransition } from 'react'

function CommitmentFilters() {
  const [isPending, startTransition] = useTransition()
  const [filters, setFilters] = useState(defaultFilters)

  const handleFilterChange = (newFilters: CommitmentFilters) => {
    startTransition(() => {
      setFilters(newFilters)  // Non-urgent — won't block user input
    })
  }

  return (
    <FilterBar
      filters={filters}
      onChange={handleFilterChange}
      loading={isPending}
    />
  )
}
```

### Core Web Vitals Targets

```
METRIC          TARGET        STRATEGY
──────────────────────────────────────────────────────────────────────
LCP             < 1.2s        RSC + streaming, font preload,
                              image priority for hero images
FID / INP       < 100ms       Client hydration deferred, transitions
                              for non-urgent updates, no long tasks
CLS             < 0.05        Skeleton loaders match real content
                              dimensions exactly, no layout shift
TTFB            < 200ms       Edge runtime for API routes,
                              Vercel edge network, CDN caching
FCP             < 0.8s        Streaming SSR, critical CSS inlined
TBT             < 200ms       Bundle splitting, defer non-critical JS
```

---

## 12. Frontend Security Architecture

### Token Security

```typescript
// RULE 1: Access token lives ONLY in Zustand (memory)
// Never: localStorage, sessionStorage, cookies accessible to JS

// RULE 2: Refresh token lives ONLY in HttpOnly cookie
// Set by backend: Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict

// RULE 3: Silent refresh — invisible to user
// shared/providers/AuthProvider.tsx

'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'

export function AuthProvider({ children }: Props) {
  const { setUser, setAccessToken, setLoading, clearAuth } = useAuthStore()

  useEffect(() => {
    async function initAuth() {
      try {
        // Attempt silent refresh on every app load
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',  // Sends HttpOnly cookie automatically
        })

        if (!res.ok) {
          clearAuth()
          return
        }

        const { accessToken, user } = await res.json()
        setAccessToken(accessToken)
        setUser(user)
      } catch {
        clearAuth()
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  // Proactive refresh — 2 minutes before expiry (access token = 15 min)
  useEffect(() => {
    const REFRESH_BEFORE_EXPIRY = 2 * 60 * 1000  // 2 min
    const ACCESS_TOKEN_TTL = 15 * 60 * 1000       // 15 min

    const interval = setInterval(async () => {
      if (!useAuthStore.getState().isAuthenticated) return
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        })
        const { accessToken } = await res.json()
        setAccessToken(accessToken)
      } catch {
        clearAuth()
      }
    }, ACCESS_TOKEN_TTL - REFRESH_BEFORE_EXPIRY)

    return () => clearInterval(interval)
  }, [])

  return <>{children}</>
}
```

### Content Security Policy

```typescript
// next.config.ts — strict CSP headers

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline'
    https://js.stripe.com
    https://cdn.posthog.com
    https://browser.sentry-cdn.com;
  style-src 'self' 'unsafe-inline'
    https://fonts.googleapis.com;
  font-src 'self'
    https://fonts.gstatic.com;
  img-src 'self' data: blob:
    https://lh3.googleusercontent.com
    https://avatars.githubusercontent.com
    https://*.s3.amazonaws.com;
  connect-src 'self'
    ${process.env.NEXT_PUBLIC_API_URL}
    ${process.env.NEXT_PUBLIC_SOCKET_URL}
    https://api.stripe.com
    https://sentry.io
    wss://${process.env.NEXT_PUBLIC_SOCKET_DOMAIN};
  frame-src https://js.stripe.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\s{2,}/g, ' ').trim(),
  },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-XSS-Protection',        value: '1; mode=block' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]
```

### Input Sanitization & XSS Prevention

```typescript
// All user-generated content rendered via React is auto-escaped
// Risk: dangerouslySetInnerHTML in markdown renderers

// SAFE — use a sanitized markdown renderer
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function MarkdownRenderer({ content }: { content: string }) {
  const sanitizedHtml = DOMPurify.sanitize(
    marked.parse(content) as string,
    {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    }
  )

  return (
    <div
      className="prose prose-sm"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}

// All links from user content get rel="noopener noreferrer"
// Enforced in DOMPurify config above via FORCE_BODY + RETURN_DOM
```

### Multi-Tenant Data Isolation

```typescript
// RULE: Every API call MUST be scoped to current team
// Enforced by Axios interceptor

// lib/api/client.ts
axiosInstance.interceptors.request.use((config) => {
  const teamId = useAuthStore.getState().user?.teamId

  if (!teamId) {
    throw new Error('No teamId — cannot make API call')
  }

  // Inject teamId as header — backend validates this against JWT claim
  config.headers['X-Team-ID'] = teamId

  return config
})

// RULE: TanStack Query keys always include teamId
// Prevents cache poisoning across team switches
// (e.g., switching teams shouldn't show old team's data)

function onTeamSwitch(newTeamId: string) {
  // Clear ALL cached data when switching teams
  queryClient.clear()

  // Update user in store
  useAuthStore.getState().setUser({ ...user, teamId: newTeamId })

  // Navigate to dashboard (fresh state)
  router.push('/dashboard')
}
```

---

## 13. Observability & Error Tracking

### Sentry Integration

```typescript
// shared/providers/AnalyticsProvider.tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'

export function AnalyticsProvider({ children }: Props) {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return

    // Identify user in Sentry for error context
    Sentry.setUser({
      id: user.id,
      email: user.email,
      // NEVER include sensitive data — only what helps debug
    })

    // Set team context
    Sentry.setTag('team_id', user.teamId)
    Sentry.setTag('plan', user.team?.plan)
  }, [user])

  return <>{children}</>
}

// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Sample rates — not every event needs to go to Sentry
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.05,   // 5% of sessions get full replay
  replaysOnErrorSampleRate: 1.0,    // 100% of error sessions

  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.nextRouterInstrumentation,
    }),
    new Sentry.Replay({
      maskAllText: true,             // Privacy — mask all text in replay
      blockAllMedia: true,
    }),
  ],

  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ChunkLoadError',
    /Network request failed/,
  ],

  beforeSend(event) {
    // Scrub sensitive data before sending
    if (event.request?.headers) {
      delete event.request.headers['Authorization']
      delete event.request.headers['Cookie']
    }
    return event
  },
})
```

### Custom Error Boundaries

```typescript
// shared/components/feedback/ErrorBoundary.tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { Component, ErrorInfo, ReactNode } from 'react'
import { DataLoadingError } from './DataLoadingError'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  context?: string           // e.g., "MeetingList", "CommitmentTracker"
  level?: 'page' | 'section' | 'component'
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack },
        vocaply: { context: this.props.context, level: this.props.level },
      },
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return (
      <DataLoadingError
        message={`Something went wrong in ${this.props.context || 'this section'}`}
        onRetry={() => this.setState({ hasError: false })}
        level={this.props.level}
      />
    )
  }
}

// Usage — wrap every major section
<ErrorBoundary context="MeetingList" level="section">
  <MeetingList />
</ErrorBoundary>
```

### Web Vitals Reporting

```typescript
// app/layout.tsx — report vitals to analytics

export function reportWebVitals(metric: NextWebVitalsMetric) {
  // Send to PostHog
  if (window.posthog) {
    window.posthog.capture('web_vital', {
      name: metric.name,
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      id: metric.id,
      label: metric.label,
      navigationType: metric.navigationType,
    })
  }

  // Send to Sentry for performance monitoring
  if (metric.name === 'LCP' && metric.value > 2500) {
    Sentry.captureMessage('LCP exceeded threshold', {
      level: 'warning',
      extra: { value: metric.value, url: window.location.href },
    })
  }
}
```

---

## 14. Design System Architecture

### Token Architecture

```typescript
// packages/tokens/src/index.ts — Design tokens as CSS variables + JS

export const tokens = {
  colors: {
    // Semantic tokens — NEVER use raw hex in components
    background:     { DEFAULT: 'hsl(var(--background))' },
    foreground:     { DEFAULT: 'hsl(var(--foreground))' },
    primary:        { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
    secondary:      { DEFAULT: 'hsl(var(--secondary))' },
    destructive:    { DEFAULT: 'hsl(var(--destructive))' },
    muted:          { DEFAULT: 'hsl(var(--muted))' },
    accent:         { DEFAULT: 'hsl(var(--accent))' },
    border:         'hsl(var(--border))',
    ring:           'hsl(var(--ring))',

    // Vocaply brand tokens
    brand: {
      50:   'hsl(149, 67%, 95%)',
      100:  'hsl(149, 60%, 88%)',
      500:  'hsl(149, 60%, 28%)',   // Primary green
      600:  'hsl(149, 65%, 24%)',
      900:  'hsl(149, 70%, 8%)',
    },
  },

  // Component-specific tokens
  spacing:   { sidebar: '240px', topbar: '60px', settings: '220px' },
  radius:    { DEFAULT: '6px', lg: '10px', xl: '12px' },
  shadow: {
    sm:  '0 1px 3px rgba(0,0,0,0.05)',
    md:  '0 4px 24px rgba(0,0,0,0.08)',
    lg:  '0 8px 40px rgba(0,0,0,0.12)',
  },
} as const

// globals.css — light + dark mode via CSS variables
:root {
  --background:         0 0% 100%;
  --foreground:         0 0% 3.9%;
  --primary:            149 60% 28%;
  --primary-foreground: 0 0% 98%;
  --secondary:          0 0% 96.1%;
  --muted:              0 0% 96.1%;
  --accent:             149 67% 95%;
  --border:             0 0% 89.8%;
  --ring:               149 60% 28%;
  --radius:             6px;
}

.dark {
  --background:         0 0% 3.9%;
  --foreground:         0 0% 98%;
  --primary:            149 60% 45%;
  --border:             0 0% 14.9%;
  /* etc. */
}
```

### Component Architecture

```typescript
// packages/ui/src/components/Button/Button.tsx
// Compound component pattern with variants

import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@vocaply/utils'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:     'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 rounded-md px-3',
        lg:      'h-11 rounded-md px-8',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : leftIcon ? (
          <span className="mr-2">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !isLoading && (
          <span className="ml-2">{rightIcon}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

// ─── Usage ───────────────────────────────────────────────────────
// <Button isLoading={isSubmitting} variant="default" size="lg">
//   Save changes
// </Button>
```

---

## 15. PWA & Mobile Strategy

### PWA Configuration

```typescript
// next.config.ts — PWA with next-pwa

import withPWA from 'next-pwa'

const pwaConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,

  runtimeCaching: [
    // App shell — cache first (fast load)
    {
      urlPattern: /^https:\/\/vocaply\.com\/((?!api).)*$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'app-shell',
        expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // API responses — network first with fallback
    {
      urlPattern: /^https:\/\/api\.vocaply\.com\/api\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Google Fonts — stale while revalidate
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 4 } },
    },
  ],
})
```

### Offline Sync Architecture

```typescript
// Background sync — queue mutations when offline, replay when online

// lib/offline/sync-queue.ts

interface QueuedMutation {
  id: string
  endpoint: string
  method: string
  payload: unknown
  timestamp: number
  retries: number
}

class OfflineSyncQueue {
  private queue: QueuedMutation[] = []
  private readonly STORAGE_KEY = 'vocaply_sync_queue'

  constructor() {
    this.queue = this.loadFromStorage()
    this.listenForOnline()
  }

  enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retries'>) {
    const item: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    }
    this.queue.push(item)
    this.persist()

    // Show offline toast
    useUIStore.getState().addToast({
      title: 'Saved offline',
      description: 'Will sync when connection is restored',
      variant: 'info',
    })
  }

  private async flush() {
    if (!navigator.onLine || this.queue.length === 0) return

    const pending = [...this.queue]
    this.queue = []
    this.persist()

    for (const item of pending) {
      try {
        await fetch(item.endpoint, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        })
      } catch {
        // Re-queue failed items (max 3 retries)
        if (item.retries < 3) {
          this.queue.push({ ...item, retries: item.retries + 1 })
        }
      }
    }

    if (pending.length > 0) {
      // Invalidate all queries — data may have changed
      getQueryClient().invalidateQueries()
    }
  }

  private listenForOnline() {
    window.addEventListener('online', () => this.flush())
  }

  private persist() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue))
  }

  private loadFromStorage(): QueuedMutation[] {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  }
}

export const syncQueue = new OfflineSyncQueue()
```

### Mobile Responsive Architecture

```typescript
// Breakpoint strategy — mobile-first with Tailwind

// tailwind.config.ts
screens: {
  'xs':  '375px',   // Small phones
  'sm':  '640px',   // Large phones / small tablets
  'md':  '768px',   // Tablets
  'lg':  '1024px',  // Laptops
  'xl':  '1280px',  // Desktops
  '2xl': '1536px',  // Large desktops
}

// Responsive layout rules:
// < 768px:  No sidebar, bottom nav, stacked layout
// 768-1024: Collapsed sidebar (icons only, 48px)
// > 1024px: Full sidebar (240px)

// shared/components/layout/AppShell.tsx
export function AppShell({ children }: Props) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex md:flex-col md:w-12 lg:w-60 transition-all duration-200">
        <Sidebar />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
        {/* Mobile bottom nav */}
        <MobileNav className="md:hidden" />
      </div>

      {/* Mobile drawer (hamburger) */}
      <MobileDrawer />
    </div>
  )
}
```

---

## 16. CI/CD & Deployment Architecture

### GitHub Actions Pipeline

```yaml
# .github/workflows/ci.yml

name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # Cancel stale runs on new push

jobs:
  # ── QUALITY GATES ──────────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}

  type-check:
    name: TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo type-check

  unit-test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: apps/web/coverage/

  # ── BUILD ───────────────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, type-check]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}
          # All NEXT_PUBLIC_* vars injected here for build

  # ── E2E (only on PRs to main) ───────────────────────────────────
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [build]
    if: github.base_ref == 'main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm playwright install --with-deps chromium
      - run: pnpm turbo test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-results
          path: test-results/

  # ── DEPLOY PREVIEW ──────────────────────────────────────────────
  preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    needs: [build]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel preview
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          github-comment: true
```

### Deployment Architecture

```
ENVIRONMENT     TRIGGER                   TARGET              STRATEGY
──────────────────────────────────────────────────────────────────────────────
Preview         PR opened/pushed          Vercel preview URL  Automatic
                                          (unique per PR)
Staging         Push to develop branch    staging.vocaply.com Blue/green
Production      Push to main branch       vocaply.com         Canary (10% → 100%)
                (after E2E passes)

PRODUCTION DEPLOYMENT FLOW:
  1. Push to main → CI pipeline runs
  2. All quality gates pass
  3. E2E tests pass on staging
  4. Vercel deploys to production (automatic via GitHub integration)
  5. 10% of traffic gets new deployment (canary)
  6. Monitor: error rate, p99 latency, Core Web Vitals
  7. If metrics stable for 10 min → 100% traffic shift
  8. If regression detected → automatic rollback

FEATURE FLAGS (LaunchDarkly / Vercel Edge Config):
  → New features deployed dark (hidden behind flag)
  → Enabled for internal team first
  → Gradual rollout: 5% → 25% → 50% → 100%
  → Instant kill switch if issues arise
  → No full redeployment needed to toggle features
```

---

## 17. Team Scaling Architecture

### Feature Team Ownership Model

```
TEAM                OWNS                                STACK EXPERTISE
──────────────────────────────────────────────────────────────────────────────
Core Platform       AppShell, auth, routing, design     RSC, Next.js deep
                    system, shared providers

Meetings & AI       features/meetings,                   Streaming, WebSocket
Intelligence        features/intelligence,               Jotai, AI UX
                    AI streaming system

Commitments &       features/commitments,                TanStack Query,
Action Items        features/action-items,               optimistic updates,
                    realtime stores                      Zustand

Analytics &         features/analytics,                  Recharts, data viz,
Team Health         features/team,                       virtual lists,
                    dashboard widgets                    performance

Integrations &      features/integrations,               OAuth flows,
Platform            features/billing,                    Stripe, 3rd party APIs
                    settings pages

OWNERSHIP RULES:
  → Each team owns their feature module directories
  → PRs that touch shared/ or app/ require 2 cross-team approvals
  → Design system changes require Design + Platform team review
  → Each team maintains their own Storybook stories
  → Each team owns their own E2E tests for their features
```

### Code Conventions & Standards

```typescript
// NAMING CONVENTIONS
// Components:      PascalCase  → MeetingCard.tsx
// Hooks:           camelCase   → useMeetings.ts (always 'use' prefix)
// Stores:          camelCase   → meetings.store.ts
// Utils:           kebab-case  → format-date.ts
// Constants:       UPPER_SNAKE → MAX_RETRY_COUNT
// Types/Interfaces: PascalCase → Meeting, CommitmentStatus

// FILE NAMING
// Component file = Component name = Named export
// MeetingCard.tsx → export function MeetingCard() {}
// No default exports for components (aids refactoring + grep)

// TEST FILE CONVENTION
// MeetingCard.tsx → MeetingCard.test.tsx (co-located)
// useMeetings.ts  → useMeetings.test.ts  (co-located)
// E2E tests       → tests/e2e/meeting-flow.spec.ts

// IMPORT ORDER (enforced by eslint-plugin-import)
// 1. React
// 2. Next.js
// 3. External packages (alphabetical)
// 4. @vocaply/* packages
// 5. @/ absolute imports (feature → shared order)
// 6. Relative imports
// 7. Type imports

// COMPONENT PATTERNS
// ✅ Function components only (no class components)
// ✅ forwardRef for UI components that accept ref
// ✅ Named exports only (no default exports)
// ✅ Props interface above component
// ✅ JSDoc comment on public API components

// ANTI-PATTERNS (ESLint will catch these)
// ❌ useEffect for data fetching (use TanStack Query)
// ❌ setState in render (infinite loop)
// ❌ Inline function in JSX for expensive components (use useCallback)
// ❌ any type (strict TypeScript)
// ❌ Direct fetch in components (go through API layer)
// ❌ Cross-feature direct imports (use index.ts public API)
```

### Architectural Decision Records (ADR)

```markdown
# ADR Template — apps/docs or docs/architecture/

## ADR-001: TanStack Query over SWR

**Status:** Accepted
**Date:** 2026-01-15
**Deciders:** Frontend Platform Team

### Context
Need a client-side server-state solution for 1M user scale.

### Decision
Use TanStack Query v5 instead of SWR.

### Consequences
**Positive:**
- Built-in optimistic updates with rollback
- Infinite query for pagination
- Mutation hooks with cache invalidation
- Better devtools
- More granular cache control

**Negative:**
- Larger bundle (30KB vs 10KB for SWR)
- More boilerplate for simple queries

### Alternative Considered
SWR — rejected due to lack of mutation + optimistic update primitives.

---

## ADR-002: Jotai for AI streaming state vs Zustand

**Status:** Accepted
**Date:** 2026-02-01

### Decision
Use Jotai for AI streaming state, Zustand for app-wide global state.

### Rationale
Jotai atoms compose naturally with async/streaming data.
Derived atoms eliminate need for manual selectors.
Integrates with Suspense without extra boilerplate.
Zustand better for imperative actions and app-wide state.
```

---

## Summary: Architecture at a Glance

```
CONCERN                  SOLUTION                         SCALE TARGET
─────────────────────────────────────────────────────────────────────────────
Routing                  Next.js App Router               Unlimited
Rendering                RSC + Streaming SSR + CSR        1M users
State (server)           TanStack Query v5                Global cache
State (UI)               Zustand (slices)                 Any scale
State (AI/atomic)        Jotai atoms                      Streaming safe
Realtime                 Socket.io + Redis adapter         Multi-server
AI Streaming             ReadableStream + SSE              Claude-like UX
Data tables              TanStack Table + react-virtual    100K+ rows
Bundle size              Code splitting + RSC              < 150KB first load
Performance              LCP < 1.2s, INP < 100ms          Core Web Vitals green
Security                 CSP + memory tokens + sanitize    Enterprise grade
Observability            Sentry + PostHog + Web Vitals     Full coverage
PWA                      next-pwa + background sync        Offline capable
CI/CD                    Turborepo + Vercel + GH Actions   < 5 min deploys
Team scale               Feature modules + ADRs            50+ engineers
─────────────────────────────────────────────────────────────────────────────
```

---

*Vocaply Frontend Architecture | Principal Engineer Level | Silicon Valley Grade*
*Optimized for hypergrowth · 1M+ users · Enterprise SaaS · AI-first UX*
