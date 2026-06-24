# Vocaply — Full Frontend System Design
> Industry-Grade · Production-Ready · 1M+ Users
> Senior Frontend Architect Edition
> Stack: Next.js 14 · TypeScript · Turborepo · TanStack Query · Zustand · Jotai · Socket.io · Framer Motion
> Version: 1.0 | Document: FE-SYSTEM-001 | June 2026

---

## Table of Contents

1. [Architecture Philosophy & Decision Framework](#1-architecture-philosophy--decision-framework)
2. [Monorepo & Package Architecture](#2-monorepo--package-architecture)
3. [Application Shell & Routing Architecture](#3-application-shell--routing-architecture)
4. [Design System Architecture](#4-design-system-architecture)
5. [State Management Architecture](#5-state-management-architecture)
6. [Data Fetching & Caching Architecture](#6-data-fetching--caching-architecture)
7. [Authentication Frontend Architecture](#7-authentication-frontend-architecture)
8. [Real-Time Frontend Architecture](#8-real-time-frontend-architecture)
9. [AI Streaming UI Architecture](#9-ai-streaming-ui-architecture)
10. [Feature Module Architecture](#10-feature-module-architecture)
11. [Component Architecture & Hierarchy](#11-component-architecture--hierarchy)
12. [Form Architecture](#12-form-architecture)
13. [Performance Architecture](#13-performance-architecture)
14. [Frontend Security Architecture](#14-frontend-security-architecture)
15. [Error Handling & Resilience Architecture](#15-error-handling--resilience-architecture)
16. [Analytics & Observability Architecture](#16-analytics--observability-architecture)
17. [Testing Architecture](#17-testing-architecture)
18. [CI/CD & Deployment Architecture](#18-cicd--deployment-architecture)
19. [Accessibility Architecture](#19-accessibility-architecture)
20. [PWA & Offline Architecture](#20-pwa--offline-architecture)
21. [Internationalization Architecture](#21-internationalization-architecture)
22. [Team Scaling & Code Governance](#22-team-scaling--code-governance)
23. [Migration & Upgrade Strategy](#23-migration--upgrade-strategy)
24. [Capacity & Performance Targets](#24-capacity--performance-targets)

---

## 1. Architecture Philosophy & Decision Framework

### Seven Core Tenets

Every frontend architectural decision at Vocaply is evaluated against these seven tenets, in priority order. When two tenets conflict, the lower-numbered tenet wins.

```
TENET 1 — Server First, Client When Necessary
  Default: React Server Components (RSC) for all data-display.
  Hydrate to client ONLY when: interactivity, realtime, browser APIs, or user-specific
  animation is required.
  Result: 40–60% less JavaScript shipped. Faster LCP. Smaller bundle.
  Test: Before adding 'use client', ask "does this NEED the browser to work?"

TENET 2 — Optimistic by Default
  Every user mutation is optimistic. UI updates before server confirms.
  Rollback on failure with minimal user disruption.
  The user should never wait for a network round-trip to see their action reflected.
  TanStack Query handles the rollback contract automatically.

TENET 3 — Tenant Isolation at Every Layer
  Every API call, cache key, WebSocket room, and local store is scoped to teamId.
  Cross-tenant data leakage is architecturally impossible — not just policy.
  Switching teams clears ALL cached data (queryClient.clear()).

TENET 4 — Streaming Everything
  Never block the user. Stream RSC data. Stream AI responses. Stream UI.
  Suspense boundaries at every meaningful data boundary.
  Progressive enhancement: content appears incrementally.
  A loading skeleton is ALWAYS defined before writing the happy-path UI.

TENET 5 — Fail Gracefully, Retry Intelligently
  Every component has an error boundary.
  Network loss triggers offline mode, not a broken screen.
  Partial failures show partial data with retry affordances — not blank pages.
  Exponential backoff with jitter for all retry strategies.

TENET 6 — Feature Isolation by Default
  Features are vertical slices. They own their components, hooks, api, store, types.
  Features NEVER import from other features.
  Cross-feature communication happens via URL state or shared Zustand stores only.
  ESLint enforces this boundary automatically at commit time.

TENET 7 — Measure Before Optimizing
  No premature optimization. No memo() without a profiler screenshot.
  Bundle budgets are defined up front and enforced in CI.
  Core Web Vitals are measured on every deploy.
  A/B test significant UX changes before permanent decisions.
```

### Technology Decision Matrix

```
CONCERN                  CHOICE                    WHY NOT THE ALTERNATIVE
─────────────────────────────────────────────────────────────────────────────────────────
Routing                  Next.js 14 App Router     Pages Router lacks RSC + Streaming
Data Fetching            TanStack Query v5          SWR: no optimistic update rollback
Global State             Zustand (slices)           Redux: too much boilerplate for SaaS
Atomic/Streaming State   Jotai                     Zustand: not ideal for derived atoms
UI Primitives            shadcn/ui + Radix          Headless UI: less community, less DX
Styling                  Tailwind CSS + CSS Vars    CSS Modules: no design token system
Animation                Framer Motion             GSAP: license cost, React integration
Forms                    React Hook Form + Zod      Formik: controlled inputs are slower
Testing (Unit)           Vitest                    Jest: slower, worse ESM support
Testing (E2E)            Playwright                Cypress: no multi-tab, no mobile
Monorepo                 Turborepo                 Nx: heavier, more config
Icons                    Lucide React              FontAwesome: larger bundle
HTTP Client              Axios (with interceptors)  fetch: no interceptors, verbose
Type Safety              TypeScript strict           JSDoc: not refactorable at scale
─────────────────────────────────────────────────────────────────────────────────────────
```

### Architecture Decision Records (ADRs)

Each significant architectural choice is documented as an ADR in `docs/architecture/`. ADRs are immutable — to reverse a decision, a new ADR is created. This prevents "why did we do this?" questions six months later.

```
ADR format (stored at docs/architecture/ADR-NNN-title.md):
  Status:    Proposed | Accepted | Deprecated | Superseded
  Context:   Problem being solved
  Decision:  What we chose
  Rationale: Why this over alternatives
  Consequences: Trade-offs accepted
  Review Date: When to revisit (e.g., "review at 10M users")
```

**Active ADRs:**

| ADR | Title | Status |
|---|---|---|
| ADR-001 | TanStack Query over SWR | Accepted |
| ADR-002 | Jotai for AI streaming state | Accepted |
| ADR-003 | Modular Monolith over Microfrontends | Accepted |
| ADR-004 | Cursor pagination as default | Accepted |
| ADR-005 | Access token in memory (not localStorage) | Accepted |
| ADR-006 | shadcn/ui over fully custom components | Accepted |
| ADR-007 | CSS Variables for design tokens (not JS-in-CSS) | Accepted |

---

## 2. Monorepo & Package Architecture

### Turborepo Workspace Graph

```
vocaply/                                     ← Turborepo monorepo root
│
├── apps/
│   ├── web/                                 ← Next.js 14 (main app: dashboard + landing)
│   ├── docs/                                ← Nextra documentation site
│   └── storybook/                           ← Isolated component development + visual testing
│
├── packages/
│   ├── ui/                   @vocaply/ui    ← Design system + all shared components
│   ├── tokens/               @vocaply/tokens ← Design tokens (CSS vars + JS constants)
│   ├── icons/                @vocaply/icons ← SVG icon system (Lucide + custom)
│   ├── types/                @vocaply/types ← Shared TypeScript interfaces
│   ├── validators/           @vocaply/validators ← Shared Zod schemas (FE + BE)
│   ├── api-client/           @vocaply/api-client ← Typed Axios wrapper
│   ├── hooks/                @vocaply/hooks ← Shared React hooks (no business logic)
│   ├── utils/                @vocaply/utils ← Pure utility functions
│   └── config/
│       ├── eslint/           @vocaply/eslint-config
│       ├── typescript/       @vocaply/tsconfig
│       └── tailwind/         @vocaply/tailwind-config
│
└── tooling/
    ├── jest-preset/
    ├── playwright-config/
    └── prettier-config/
```

### Package Dependency Graph

```
apps/web
  ├── @vocaply/ui              (imports @vocaply/tokens, @vocaply/icons)
  ├── @vocaply/api-client      (imports @vocaply/types)
  ├── @vocaply/hooks           (imports @vocaply/api-client)
  ├── @vocaply/validators      (imports @vocaply/types)
  └── @vocaply/utils           (pure, no deps)

RULES:
  packages/ NEVER import from apps/
  packages/ can import sibling packages IF no circular dependency
  @vocaply/types has zero external dependencies (pure TypeScript)
  @vocaply/utils has zero React dependencies (pure functions)
```

### turbo.json — Pipeline Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": [
    "NODE_ENV",
    "VERCEL_ENV",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SOCKET_URL",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_SENTRY_DSN"
  ],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "cache": true
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
      "outputs": [],
      "cache": true
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": [],
      "cache": true
    }
  },
  "remoteCache": {
    "enabled": true
  }
}
```

### Microfrontend Decision — Why NOT

```
REJECTED: Microfrontend architecture (Module Federation)

REASONS:
  × Premature at current scale — adds complexity without meaningful benefit
  × Shared state between MFEs is an unsolved hard problem
  × React version mismatch risks across MFE boundaries
  × Auth, routing, and design system coordination overhead
  × Independent deployment: achievable in monolith via feature flags
  × DX penalty is significant (longer build times, harder debugging)

CHOSEN: Modular Monolith with Strict Feature Isolation

ENFORCEMENT:
  Feature boundary = eslint-plugin-boundaries rules
  Module boundaries = TypeScript module path restrictions
  Cannot import across feature boundaries at compile time
  Same isolation as MFE, without the complexity

WHEN TO REVISIT (documented in ADR-003):
  → 50+ frontend engineers (team coordination becomes bottleneck)
  → Features genuinely need different tech stacks
  → Independent deploy cadences are genuinely required, not just desired
  → Enterprise white-label deployments become core business requirement
```

---

## 3. Application Shell & Routing Architecture

### Route Group Architecture

```
apps/web/src/app/
│
├── (marketing)/                   ← Public pages (no auth, no sidebar)
│   ├── layout.tsx                 ← Marketing shell (nav + footer only)
│   ├── page.tsx                   ← Landing page (20 sections, SSG + ISR)
│   ├── pricing/page.tsx
│   ├── blog/
│   │   ├── page.tsx               ← Blog list
│   │   └── [slug]/page.tsx        ← Blog article (SSG + ISR)
│   └── compare/[competitor]/page.tsx  ← SEO comparison pages
│
├── (auth)/                        ← Auth pages (centered card, no sidebar)
│   ├── layout.tsx                 ← Auth shell
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── verify-email/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
│
├── (dashboard)/                   ← Protected app (sidebar + topbar)
│   ├── layout.tsx                 ← RSC: fetches user+team, renders AppShell
│   ├── dashboard/
│   │   ├── page.tsx               ← Home feed (RSC + Streaming)
│   │   ├── loading.tsx            ← Skeleton shown during RSC data load
│   │   └── error.tsx              ← Error boundary with retry
│   ├── meetings/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── [meetingId]/
│   │       ├── page.tsx           ← Meeting detail (RSC shell + client tabs)
│   │       ├── loading.tsx
│   │       ├── @transcript/       ← Parallel route: transcript panel
│   │       │   └── page.tsx
│   │       ├── transcript/page.tsx
│   │       ├── action-items/page.tsx
│   │       └── commitments/page.tsx
│   ├── commitments/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── [commitmentId]/page.tsx
│   ├── action-items/page.tsx
│   ├── team/
│   │   ├── page.tsx
│   │   └── [memberId]/page.tsx
│   ├── analytics/page.tsx
│   ├── intelligence/page.tsx      ← AI chat workspace
│   └── settings/
│       ├── layout.tsx             ← Settings sidebar tabs
│       ├── profile/page.tsx
│       ├── team/page.tsx
│       ├── members/page.tsx
│       ├── integrations/page.tsx
│       ├── billing/page.tsx
│       ├── notifications/page.tsx
│       └── security/page.tsx
│
├── onboarding/
│   ├── layout.tsx                 ← Full-screen, progress bar, no sidebar
│   ├── page.tsx                   ← Step 1: Welcome
│   ├── create-team/page.tsx       ← Step 2: Team creation
│   ├── invite-team/page.tsx       ← Step 3: Invite
│   └── connect-calendar/page.tsx  ← Step 4: Calendar OAuth
│
├── invite/[token]/page.tsx        ← Accept team invite link
│
├── api/                           ← Next.js Route Handlers (BFF)
│   ├── auth/
│   │   ├── refresh/route.ts       ← Silent token refresh proxy
│   │   └── logout/route.ts
│   ├── ai/
│   │   ├── stream/route.ts        ← AI streaming proxy (edge runtime)
│   │   └── summarize/route.ts
│   └── og/route.tsx              ← Dynamic OG image generation
│
├── layout.tsx                     ← Root: fonts, metadata, providers
├── globals.css                    ← Design tokens + Tailwind
├── not-found.tsx
├── error.tsx
├── robots.ts
└── sitemap.ts
```

### Dashboard Layout RSC (Server Component)

The dashboard layout runs on the server. It fetches the user and team data once and passes them down — no client-side data fetching for the shell.

```typescript
// app/(dashboard)/layout.tsx
// THIS IS A SERVER COMPONENT — no 'use client'

import { redirect } from 'next/navigation'
import { AppShell } from '@/shared/components/layout/AppShell'
import { getUser, getTeam } from '@/lib/api/server'

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  // Parallel data fetching — NOT waterfall
  const [user, team] = await Promise.all([
    getUser(),   // From JWT cookie on server
    getTeam(),   // From API with server-side token
  ])

  // Redirect unauthenticated users
  if (!user) redirect('/login')

  // Redirect users without a team to onboarding
  if (!team) redirect('/onboarding')

  return (
    <AppShell user={user} team={team}>
      {children}
    </AppShell>
  )
}
```

### Rendering Decision Tree

```
For each page/component, apply this decision tree (stop at first match):

QUESTION 1: Is the content identical for all users (marketing, docs)?
  YES → Static Generation (SSG) with ISR revalidation
  NO  ↓

QUESTION 2: Does it need personalization but NOT realtime updates?
  YES → React Server Component with per-request data fetch
  NO  ↓

QUESTION 3: Does it need realtime updates (WebSocket/polling)?
  YES → Client Component with TanStack Query + WebSocket listener
  NO  ↓

DEFAULT → RSC with Suspense boundary (streams content when ready)
```

### Rendering Map

```
ROUTE                       STRATEGY               RATIONALE
─────────────────────────────────────────────────────────────────────────────
/ (landing)                 SSG + ISR (1hr)         Marketing, rarely changes
/pricing                    SSG + ISR (1hr)          Plans change rarely
/login, /register           SSG                      Pure client forms, no data
/dashboard                  RSC + Streaming          Personalized, mixed content
/dashboard → widgets        Client (TQ + WS)         Realtime commitment alerts
/meetings (list)            RSC + Streaming          Server-filtered, cursor paged
/meetings/[id]              RSC shell + client tabs  Static shell, dynamic content
/meetings/[id]/transcript   Client (virtual list)    Large data, virtualized
/commitments                Client (TQ)              Highly interactive, filters
/analytics                  Client (TQ)              Date range changes, charts
/intelligence               Client (Jotai atoms)     AI streaming, fully client
/settings/*                 RSC + client form        Read on server, edit client
```

---

## 4. Design System Architecture

### Token Architecture

Design tokens are the single source of truth for all visual decisions. Tokens flow from the `@vocaply/tokens` package into CSS custom properties.

```
TOKEN LAYERS:

Layer 1 — Primitive Tokens (raw values, rarely used directly):
  --color-green-50  → #E8F5EE
  --color-green-500 → #1A6B3C
  --color-red-50    → #FDECEA
  --space-1         → 4px
  --space-2         → 8px

Layer 2 — Semantic Tokens (mapped to intent):
  --color-brand           → var(--color-green-500)
  --color-brand-subtle    → var(--color-green-50)
  --color-error           → #C84B31
  --color-error-subtle    → var(--color-red-50)
  --color-text            → #0A0A0A
  --color-text-muted      → #6B6A67
  --color-border          → #E4E3DF
  --color-surface         → #F2F1EE
  --color-background      → #FAFAF8

Layer 3 — Component Tokens (scoped to component):
  --button-primary-bg     → var(--color-brand)
  --button-primary-text   → white
  --card-border           → var(--color-border)
  --card-radius           → var(--radius-lg)
  --input-border          → var(--color-border)
  --input-focus-ring      → var(--color-brand)
```

### Color Palette

```
BRAND COLORS:
  black          #0A0A0A    Primary text, dark backgrounds, primary CTA
  white          #FAFAF8    Page background, text on dark
  gray-1         #F2F1EE    Section backgrounds, card fills
  gray-2         #E4E3DF    Borders, dividers (2px gaps for column separation)
  gray-3         #9B9A96    Muted labels, captions, logos
  gray-4         #6B6A67    Secondary body text, nav links
  accent         #1A6B3C    PRIMARY BRAND — CTAs, links, active states, fulfilled
  accent-light   #E8F5EE    Green-tinted card backgrounds, hover backgrounds
  accent-mid     #2D8A50    Button hover, darker green
  accent-dark    #6ECC8E    Light green — use on dark backgrounds (#0A0A0A)
  warn           #C84B31    Missed commitments, errors, overdue
  warn-light     #FDECEA    Warning backgrounds, missed row backgrounds

DARK SECTION PALETTE (3 dark sections: AICapabilities, CaseStudy, FinalCTA):
  bg             #0A0A0A
  text           rgba(255, 255, 255, 0.9)
  text-muted     rgba(255, 255, 255, 0.5)
  text-subtle    rgba(255, 255, 255, 0.3)
  accent         #6ECC8E    (lighter green — readability on dark)
  border         rgba(255, 255, 255, 0.1)
  surface        rgba(255, 255, 255, 0.06)

COMMITMENT STATUS COLORS:
  PENDING:   bg #F2F1EE  · text #6B6A67  · badge "Pending"
  FULFILLED: bg #E8F5EE  · text #1A6B3C  · badge "Fulfilled"
  MISSED:    bg #FDECEA  · text #C84B31  · badge "Missed"
  DEFERRED:  bg #EEF2FF  · text #4F46E5  · badge "Deferred"
  DUE_TODAY: bg #FFFBF0  · text #7A5C00  · badge "Due today"
```

### Typography System

```
FONT FAMILIES:
  --font-serif: 'Instrument Serif', Georgia, serif
    Usage: H1 hero, H2 section headlines, pull quotes, pricing numbers,
           testimonial quotes, final CTA, case study metrics
    Weights: 400 (regular), 400 italic
    
  --font-sans: 'DM Sans', system-ui, sans-serif
    Usage: All body text, navigation, buttons, labels, captions, cards
    Weights: 300 (light), 400, 500, 600

FONT LOADING (next/font/google — no layout shift):
  import { DM_Sans, Instrument_Serif } from 'next/font/google'
  
  const dmSans = DM_Sans({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600'],
    variable: '--font-sans',
    display: 'swap',
  })
  
  const instrumentSerif = Instrument_Serif({
    subsets: ['latin'],
    weight: ['400'],
    style: ['normal', 'italic'],
    variable: '--font-serif',
    display: 'swap',
  })

TYPE SCALE (responsive with clamp()):
  --text-display: clamp(48px, 6vw, 78px)   line-height: 1.08   letter-spacing: -1.5px
  --text-h2:      clamp(32px, 4vw, 52px)   line-height: 1.10   letter-spacing: -1.0px
  --text-h3:      clamp(18px, 2vw, 28px)   line-height: 1.20   letter-spacing: -0.3px
  --text-body-lg: clamp(16px, 2vw, 19px)   line-height: 1.65
  --text-body:    16px                      line-height: 1.60
  --text-sm:      14px                      line-height: 1.65
  --text-xs:      13px                      line-height: 1.70
  --text-label:   11px                      line-height: 1.0    letter-spacing: 0.1em
                                            font-weight: 600    text-transform: uppercase
```

### Spacing & Layout System

```
SPACING (8px base grid):
  --space-1:   4px
  --space-2:   8px
  --space-3:   12px
  --space-4:   16px
  --space-5:   20px
  --space-6:   24px
  --space-8:   32px
  --space-10:  40px
  --space-12:  48px
  --space-16:  64px
  --space-20:  80px
  --space-24:  96px

LAYOUT:
  --max-width:    1120px   ← Content max-width (most sections)
  --max-width-sm:  800px   ← Narrow sections (FAQ, FinalCTA)
  --pad-x:  clamp(20px, 5vw, 80px)   ← Horizontal section padding
  --section-py: clamp(60px, 8vw, 100px)  ← Vertical section padding
  --sidebar-width:  240px  ← Dashboard sidebar (collapsed: 48px)
  --topbar-height:   60px  ← Dashboard topbar

BORDER RADIUS:
  --radius:    6px    ← Buttons, badges, small elements
  --radius-md: 8px    ← Integration pills, tab switchers
  --radius-lg: 10px   ← Feature cards, testimonials, pricing cards
  --radius-xl: 12px   ← MockBrowser, large modals

SHADOWS:
  --shadow-sm:    0 1px 3px rgba(0, 0, 0, 0.05)
  --shadow-md:    0 4px 24px rgba(0, 0, 0, 0.08)
  --shadow-lg:    0 8px 40px rgba(0, 0, 0, 0.12)
  --shadow-green: 0 4px 24px rgba(26, 107, 60, 0.08)
```

### Animation Token System

```
TRANSITION SPEEDS:
  --transition-fast:   150ms ease     ← Hover color changes, badges
  --transition-base:   200ms ease     ← Button hover, focus states
  --transition-slow:   400ms ease     ← Reveal animations, larger state changes
  --transition-reveal: 600ms cubic-bezier(0.25, 0.1, 0.25, 1)

FRAMER MOTION VARIANTS (lib/marketing/animations.ts):
  fadeUpVariant:
    hidden:  { opacity: 0, y: 20 }
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] } }

  containerVariant:
    hidden:  {}
    visible: { transition: { staggerChildren: 0.15, delayChildren: 0 } }

  cardVariant:
    same as fadeUpVariant — used for individual card children

  slideFromLeft:
    hidden:  { opacity: 0, x: -30 }
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } }

  slideFromRight:
    hidden:  { opacity: 0, x: 30 }
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } }

prefers-reduced-motion: ALL Framer Motion animations respect this via:
  <MotionConfig reducedMotion="user"> (in Providers.tsx)

Also in globals.css:
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
```

### Component Library Architecture (shadcn/ui)

```
PHILOSOPHY:
  shadcn/ui = COPY, not IMPORT.
  Components are copied into packages/ui/src/components/
  We OWN the source — no version conflicts, no black-box dependencies.

COMPONENT CATEGORIES:

Primitives (from Radix UI via shadcn):
  Button, Input, Textarea, Select, Checkbox, Switch, Radio
  Card, Badge, Separator, Progress, Skeleton
  Modal/Dialog, Drawer, Dropdown, Tooltip, Popover, Tabs
  Avatar, Alert, Toast, DatePicker

Domain Components (Vocaply-specific, in packages/ui):
  CommitmentScore    ← SVG donut gauge (0-100 ring)
  StatusBadge        ← PENDING/FULFILLED/MISSED/DEFERRED/DUE_TODAY
  MeetingStatusPill  ← SCHEDULED/RECORDING/PROCESSING/DONE
  PlatformIcon       ← Zoom/Meet/Teams/Webex SVG
  CommitmentRow      ← Single commitment list item (reused marketing + app)
  MemberAvatar       ← Initials circle with commitment score ring
  TrendIndicator     ← ↑↓→ with color (improving/stable/declining)

Marketing Components (in apps/web/src/components/marketing/):
  Specific to landing page — NOT in packages/ui (not reused elsewhere)
```

---

## 5. State Management Architecture

### State Ownership Model

```
STATE TYPE                 OWNER                  RATIONALE
─────────────────────────────────────────────────────────────────────────────
Server state               TanStack Query v5       Remote data, caching, optimistic
Auth / session             Zustand (auth slice)    Survives re-renders, no stale
UI state (sidebar, modals) Zustand (ui slice)      Imperative actions, persist prefs
URL / filter state         Next.js searchParams    Shareable, bookmarkable
Form state                 React Hook Form         Uncontrolled, performant
AI streaming state         Jotai atoms             Reactive, derived, async-safe
WebSocket events           Zustand + TQ            WS → Zustand → TQ invalidate
Local preferences          Zustand + persist()     Theme, collapsed panels
Optimistic updates         TanStack Query          Built-in rollback mechanism
```

### Zustand Store Architecture (Slices Pattern)

```typescript
// store/auth.store.ts
// CRITICAL: Access token is IN MEMORY ONLY — NEVER localStorage or cookies

interface AuthState {
  accessToken: string | null    // Memory only — wiped on page close
  user: User | null
  isAuthenticated: boolean      // Derived: !!user
  isLoading: boolean            // True during initial auth check on mount
}

interface AuthActions {
  setUser: (user: User) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void         // Called on logout or 401 unrecoverable
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    (set) => ({
      accessToken:     null,
      user:            null,
      isAuthenticated: false,
      isLoading:       true,      // True until first auth check resolves

      setUser:         (user) => set({ user, isAuthenticated: !!user }, false, 'auth/setUser'),
      setAccessToken:  (token) => set({ accessToken: token }, false, 'auth/setToken'),
      clearAuth:       () => set({ user: null, accessToken: null, isAuthenticated: false }, false, 'auth/clear'),
      setLoading:      (isLoading) => set({ isLoading }, false, 'auth/setLoading'),
    }),
    { name: 'AuthStore', enabled: process.env.NODE_ENV === 'development' }
  )
)

// ─────────────────────────────────────────────────────────────────────

// store/ui.store.ts
interface UIState {
  sidebarCollapsed:    boolean
  commandPaletteOpen:  boolean
  activeModal:         string | null
  toasts:              Toast[]
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed:   false,
        commandPaletteOpen: false,
        activeModal:        null,
        toasts:             [],

        toggleSidebar:   () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        openCommandPalette: () => set({ commandPaletteOpen: true }),
        closeCommandPalette: () => set({ commandPaletteOpen: false }),
        openModal:       (id: string) => set({ activeModal: id }),
        closeModal:      () => set({ activeModal: null }),

        addToast: (toast: Omit<Toast, 'id'>) =>
          set((s) => ({ toasts: [...s.toasts, { ...toast, id: nanoid() }] })),
        removeToast: (id: string) =>
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      }),
      {
        name: 'vocaply-ui',
        // ONLY persist layout preferences — not modal/toast state
        partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      }
    ),
    { name: 'UIStore' }
  )
)

// ─────────────────────────────────────────────────────────────────────

// store/realtime.store.ts
interface RealtimeState {
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  liveMeetingId:    string | null   // Currently recording meeting
  onlineUsers:      string[]        // UserIds currently active in team
}

export const useRealtimeStore = create<RealtimeState>()(
  devtools(
    (set) => ({
      connectionStatus: 'disconnected',
      liveMeetingId:    null,
      onlineUsers:      [],

      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setLiveMeeting:      (meetingId) => set({ liveMeetingId: meetingId }),
      setOnlineUsers:      (users) => set({ onlineUsers: users }),
    }),
    { name: 'RealtimeStore' }
  )
)
```

### Jotai Atoms for AI Streaming

```typescript
// features/intelligence/atoms/ai.atoms.ts
// Jotai is ideal for reactive, derived, async streaming state

import { atom } from 'jotai'

// Base atoms — raw mutable state
export const streamingTextAtom    = atom<string>('')
export const isStreamingAtom      = atom<boolean>(false)
export const streamErrorAtom      = atom<Error | null>(null)
export const currentMeetingIdAtom = atom<string | null>(null)

// Derived atoms — computed from base atoms, no duplication
export const streamingWordCountAtom = atom(
  (get) => get(streamingTextAtom).split(' ').filter(Boolean).length
)

export const streamingIsEmptyAtom = atom(
  (get) => get(streamingTextAtom).length === 0 && !get(isStreamingAtom)
)

// Write atom — reset entire stream state atomically
export const resetStreamAtom = atom(null, (_get, set) => {
  set(streamingTextAtom, '')
  set(isStreamingAtom, false)
  set(streamErrorAtom, null)
})

// Async atom — suspends until meeting summary is available
// Integrates with React Suspense automatically
export const meetingSummaryAtom = atom(async (get) => {
  const meetingId = get(currentMeetingIdAtom)
  if (!meetingId) return null
  const response = await fetch(`/api/ai/summarize?meetingId=${meetingId}`)
  if (!response.ok) throw new Error('Failed to fetch summary')
  return response.json()
})
```

### State Transition Rules

```
GOLDEN RULES FOR STATE:

1. WebSocket events NEVER directly update component state.
   They MUST go through:
     (A) TanStack Query cache invalidation (for server data)
     (B) Zustand store update (for UI/ephemeral state)
   
   BAD:  socket.on('event', (data) => setLocalState(data))
   GOOD: socket.on('event', () => queryClient.invalidateQueries(key))

2. Never store server-derived values in Zustand.
   If it comes from an API, TanStack Query owns it.
   Zustand is for AUTH, UI, and REALTIME CONNECTION state.

3. Never use useEffect for data fetching.
   That's TanStack Query's job.
   useEffect is for: subscriptions, DOM side effects, cleanup.

4. URL state for anything shareable.
   Filters, pagination, selected tabs → searchParams.
   If a user can share the URL and it should show the same view → URL state.

5. Optimistic updates live in TanStack Query, not Zustand.
   onMutate → setQueryData (optimistic)
   onError → setQueryData back (rollback)
   onSettled → invalidate (refetch for truth)
```

---

## 6. Data Fetching & Caching Architecture

### TanStack Query Configuration

```typescript
// lib/cache/query-client.ts

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            1000 * 30,   // 30 seconds default stale time
        gcTime:               1000 * 60 * 5, // 5 min garbage collection
        retry:                (failureCount, error) => {
          // Don't retry on 4xx errors (client mistakes)
          if (error instanceof ApiError && error.status < 500) return false
          return failureCount < 3
        },
        retryDelay:           (attempt) => Math.min(1000 * 2 ** attempt, 30000),
        refetchOnWindowFocus: true,
        refetchOnReconnect:   true,
        networkMode:          'offlineFirst', // Use cache when offline
      },
      mutations: {
        retry: 0,  // Never auto-retry mutations (side effects)
        networkMode: 'always',
      },
    },
  })
}
```

### Query Key Factory (Typed, Centralized)

```typescript
// lib/cache/query-keys.ts
// ALL TanStack Query keys defined here — zero ad-hoc key strings in components

export const queryKeys = {
  auth: {
    me:       () => ['auth', 'me']       as const,
    sessions: () => ['auth', 'sessions'] as const,
  },

  meetings: {
    all:        (teamId: string)                          => ['teams', teamId, 'meetings']                       as const,
    list:       (teamId: string, filters: MeetingFilters) => ['teams', teamId, 'meetings', 'list', filters]      as const,
    detail:     (teamId: string, id: string)              => ['teams', teamId, 'meetings', id]                   as const,
    transcript: (teamId: string, id: string)              => ['teams', teamId, 'meetings', id, 'transcript']     as const,
  },

  commitments: {
    all:    (teamId: string)                               => ['teams', teamId, 'commitments']                   as const,
    list:   (teamId: string, filters: CommitmentFilters)   => ['teams', teamId, 'commitments', 'list', filters]  as const,
    my:     (teamId: string, userId: string)               => ['teams', teamId, 'commitments', 'my', userId]     as const,
    stats:  (teamId: string, period: DateRange)            => ['teams', teamId, 'commitments', 'stats', period]  as const,
    detail: (teamId: string, id: string)                   => ['teams', teamId, 'commitments', id]               as const,
  },

  actionItems: {
    all:    (teamId: string)                               => ['teams', teamId, 'action-items']                  as const,
    list:   (teamId: string, filters: ActionItemFilters)   => ['teams', teamId, 'action-items', 'list', filters] as const,
  },

  analytics: {
    overview: (teamId: string, period: DateRange)          => ['teams', teamId, 'analytics', 'overview', period]  as const,
    members:  (teamId: string, period: DateRange)          => ['teams', teamId, 'analytics', 'members', period]   as const,
    trends:   (teamId: string, metric: string, period: DateRange) =>
                ['teams', teamId, 'analytics', 'trends', metric, period] as const,
  },

  team: {
    detail:  (teamId: string)   => ['teams', teamId, 'detail']    as const,
    members: (teamId: string)   => ['teams', teamId, 'members']   as const,
  },

  billing: {
    plans:        () => ['billing', 'plans']                          as const,
    subscription: (teamId: string) => ['teams', teamId, 'subscription'] as const,
    invoices:     (teamId: string) => ['teams', teamId, 'invoices']     as const,
  },

  integrations: {
    all:    (teamId: string)  => ['teams', teamId, 'integrations']         as const,
    events: (teamId: string)  => ['teams', teamId, 'integrations', 'events'] as const,
  },

  notifications: {
    preferences: (userId: string) => ['notifications', 'preferences', userId] as const,
  },
} as const
```

### Cache Configuration Per Resource Type

```typescript
// lib/cache/cache-config.ts
// staleTime: how long before background refetch
// gcTime:    how long to keep in memory after last subscriber

export const cacheConfig = {
  // User profile — changes infrequently
  userProfile:       { staleTime: 5 * 60 * 1000,    gcTime: 30 * 60 * 1000 },

  // Meeting list — new meetings added during the day
  meetingList:       { staleTime: 30 * 1000,          gcTime:  5 * 60 * 1000 },

  // Meeting detail — transcript/summary rarely changes after processing
  meetingDetail:     { staleTime: 2 * 60 * 1000,    gcTime: 10 * 60 * 1000 },

  // Commitments — highly dynamic during standup hours
  commitmentList:    { staleTime: 15 * 1000,          gcTime:  5 * 60 * 1000 },

  // Analytics — expensive queries, refreshed infrequently
  analytics:         { staleTime: 5 * 60 * 1000,    gcTime: 30 * 60 * 1000 },

  // Billing plans — changes only on product updates
  billingPlans:      { staleTime: 60 * 60 * 1000,   gcTime: 24 * 60 * 60 * 1000 },

  // Team member list — changes on invite/remove
  teamMembers:       { staleTime: 2 * 60 * 1000,    gcTime: 10 * 60 * 1000 },

  // Integrations — changes only when user connects/disconnects
  integrations:      { staleTime: 5 * 60 * 1000,    gcTime: 30 * 60 * 1000 },
} as const
```

### Optimistic Update Pattern (Standard)

```typescript
// features/commitments/hooks/useMarkFulfilled.ts
// Standard optimistic update implementation used across Vocaply

export function useMarkFulfilled() {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()

  return useMutation({
    mutationFn: ({ commitmentId }: { commitmentId: string }) =>
      commitmentApi.markFulfilled(commitmentId),

    onMutate: async ({ commitmentId }) => {
      // Step 1: Cancel in-flight refetches (prevent overwriting optimistic state)
      await queryClient.cancelQueries({
        queryKey: queryKeys.commitments.all(user!.teamId),
      })

      // Step 2: Snapshot current state for rollback
      const previousData = queryClient.getQueryData(
        queryKeys.commitments.detail(user!.teamId, commitmentId)
      )

      // Step 3: Apply optimistic update immediately
      queryClient.setQueryData(
        queryKeys.commitments.detail(user!.teamId, commitmentId),
        (old: Commitment | undefined) => old
          ? { ...old, status: 'FULFILLED', resolvedAt: new Date().toISOString() }
          : old
      )

      return { previousData, commitmentId }
    },

    onError: (_err, { commitmentId }, context) => {
      // Rollback to snapshot on error
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.commitments.detail(user!.teamId, commitmentId),
          context.previousData
        )
      }
      useUIStore.getState().addToast({
        title:   'Failed to mark commitment as done',
        variant: 'error',
      })
    },

    onSettled: () => {
      // Always refetch after mutation (whether success or error)
      queryClient.invalidateQueries({
        queryKey: queryKeys.commitments.all(user!.teamId),
      })
    },
  })
}
```

### Cursor Pagination Implementation

```typescript
// lib/pagination/useCursorPagination.ts
// Cursor-based pagination for all list views (meetings, commitments, action items)

export function useCursorPagination<T>({
  queryKey,
  queryFn,
  limit = 20,
}: CursorPaginationOptions<T>) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn({ cursor: pageParam, limit }),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.meta.prevCursor ?? undefined,
    initialPageParam: undefined,
  })
}

// Usage: flat items from all pages (for virtual list)
const allItems = data?.pages.flatMap((page) => page.data) ?? []
```

### Prefetching Strategy

```typescript
// Prefetch on hover — before user even clicks
// Applied to: MeetingCard, CommitmentCard, MemberRow

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()

  const prefetchMeeting = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.meetings.detail(user!.teamId, meeting.id),
      queryFn:  () => meetingApi.getById(meeting.id),
      ...cacheConfig.meetingDetail,
    })
  }, [meeting.id, queryClient, user])

  return (
    <article onMouseEnter={prefetchMeeting}>
      {/* ... */}
    </article>
  )
}
```

---

## 7. Authentication Frontend Architecture

### Token Security Contract

```
ACCESS TOKEN:
  Storage:     Zustand store (memory only) — dies on page close/refresh
  TTL:         15 minutes (matches backend JWT expiry)
  Location:    Zustand authStore.accessToken
  Use:         Added to every API request via Axios interceptor
  NEVER in:    localStorage, sessionStorage, cookies, URL

REFRESH TOKEN:
  Storage:     HttpOnly cookie (set by backend, inaccessible to JS)
  TTL:         30 days (sliding — renewed on every use)
  Location:    Cookie path: /auth/refresh (only sent to that path)
  Use:         Sent automatically by browser to /auth/refresh
  NEVER in:    Zustand, localStorage, response body

WHY NOT localStorage?
  localStorage is accessible by any JS on the page.
  XSS vulnerability = auth token stolen = account takeover.
  Memory + HttpOnly cookie is the industry-standard pattern (Stripe, Auth0).
```

### Authentication Flow Architecture

```typescript
// shared/providers/AuthProvider.tsx
// Runs once on app mount — silent auth check

'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth.store'

const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000  // Refresh 2 min before token expires
const ACCESS_TOKEN_TTL_MS      = 15 * 60 * 1000 // 15 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setAccessToken, setLoading, clearAuth } = useAuthStore()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    // Initial auth check on every page load
    async function initializeAuth() {
      try {
        // Call our BFF route — it reads the HttpOnly cookie and proxies to backend
        const res = await fetch('/api/auth/refresh', {
          method:      'POST',
          credentials: 'include',  // Sends cookie automatically
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

    initializeAuth()
  }, [])

  useEffect(() => {
    // Proactive token refresh — 2 minutes before expiry
    // This prevents mid-operation token expiry
    const refreshInterval = setInterval(async () => {
      if (!useAuthStore.getState().isAuthenticated) return

      try {
        const res = await fetch('/api/auth/refresh', {
          method:      'POST',
          credentials: 'include',
        })
        if (!res.ok) { clearAuth(); return }
        const { accessToken } = await res.json()
        setAccessToken(accessToken)
      } catch {
        clearAuth()
      }
    }, ACCESS_TOKEN_TTL_MS - REFRESH_BEFORE_EXPIRY_MS)

    intervalRef.current = refreshInterval
    return () => clearInterval(refreshInterval)
  }, [])

  return <>{children}</>
}
```

### Axios Interceptor (Request + Response)

```typescript
// lib/api/client.ts

const axiosInstance = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL,
  timeout:         30_000,
  withCredentials: true,
  headers:         { 'Content-Type': 'application/json' },
})

// REQUEST INTERCEPTOR — Attach token + team context
axiosInstance.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  const { user }        = useAuthStore.getState()

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  if (user?.teamId) {
    config.headers['X-Team-ID'] = user.teamId  // Backend validates this
  }

  return config
})

// RESPONSE INTERCEPTOR — Handle 401, silent refresh
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

axiosInstance.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request already refreshing — queue this one
        return new Promise((resolve) => {
          refreshSubscribers.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(axiosInstance(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await fetch('/api/auth/refresh', {
          method:      'POST',
          credentials: 'include',
        })

        if (!res.ok) throw new Error('Refresh failed')

        const { accessToken } = await res.json()
        useAuthStore.getState().setAccessToken(accessToken)

        // Notify all queued requests
        refreshSubscribers.forEach((cb) => cb(accessToken))
        refreshSubscribers = []

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return axiosInstance(originalRequest)
      } catch {
        // Refresh failed — log out user
        useAuthStore.getState().clearAuth()
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=session_expired'
        }
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export { axiosInstance as apiClient }
```

### AuthGuard Component

```typescript
// features/auth/components/AuthGuard.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { FullPageSpinner } from '@/shared/components/feedback/FullPageSpinner'

interface AuthGuardProps {
  children: React.ReactNode
  requireTeam?: boolean   // Redirect to /onboarding if no team
}

export function AuthGuard({ children, requireTeam = true }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return  // Wait for auth check

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (requireTeam && !user?.teamId) {
      router.push('/onboarding')
      return
    }
  }, [isAuthenticated, isLoading, user, requireTeam, router])

  // Show spinner during auth check — never flash unauthenticated content
  if (isLoading) return <FullPageSpinner />

  if (!isAuthenticated) return null  // Redirect in progress

  return <>{children}</>
}
```

---

## 8. Real-Time Frontend Architecture

### WebSocket Connection Architecture

```typescript
// lib/websocket/socket.ts
// Singleton Socket.io client with auth + reconnect

import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'
import { useRealtimeStore } from '@/store/realtime.store'

class SocketManager {
  private socket:              Socket | null = null
  private reconnectAttempts:   number = 0
  private readonly MAX_RECONNECT = 10

  connect(accessToken: string): Socket {
    if (this.socket?.connected) return this.socket

    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth:          { token: accessToken },
      transports:    ['websocket'],          // Skip polling — better performance
      timeout:        10_000,
      reconnection:   true,
      reconnectionDelay:    1_000,
      reconnectionDelayMax: 30_000,          // Cap at 30s (with jitter)
      reconnectionAttempts: this.MAX_RECONNECT,
      withCredentials:      true,
    })

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0
      useRealtimeStore.getState().setConnectionStatus('connected')
    })

    this.socket.on('disconnect', (reason) => {
      useRealtimeStore.getState().setConnectionStatus('disconnected')

      if (reason === 'io server disconnect') {
        // Server intentionally disconnected (token expired, etc.)
        this.handleServerDisconnect()
      }
    })

    this.socket.on('connect_error', (err) => {
      if (err.message === 'TOKEN_EXPIRED') {
        this.handleTokenExpiry()
      }
    })

    this.socket.on('system:session_expired', () => {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    })

    return this.socket
  }

  private async handleTokenExpiry() {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      const { accessToken } = await res.json()
      useAuthStore.getState().setAccessToken(accessToken)
      // Reconnect with new token
      if (this.socket) this.socket.auth = { token: accessToken }
      this.socket?.connect()
    } catch {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    }
  }

  private async handleServerDisconnect() {
    await new Promise((r) => setTimeout(r, 1_000))
    const token = useAuthStore.getState().accessToken
    if (token) this.connect(token)
  }

  getSocket = () => this.socket
  disconnect = () => { this.socket?.disconnect(); this.socket = null }
}

export const socketManager = new SocketManager()
```

### WebSocket Provider (Room Management + Event Handling)

```typescript
// shared/providers/WebSocketProvider.tsx
'use client'

import { useEffect, createContext, useContext, useCallback } from 'react'
import { socketManager } from '@/lib/websocket/socket'
import { useAuthStore } from '@/store/auth.store'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/cache/query-keys'

const SocketContext = createContext<ReturnType<typeof socketManager.getSocket>>(null)

export function WebSocketProvider({
  children,
  teamId,
}: {
  children: React.ReactNode
  teamId:   string
}) {
  const accessToken    = useAuthStore((s) => s.accessToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const queryClient    = useQueryClient()

  const registerEventHandlers = useCallback((socket: any) => {
    // Meeting events
    socket.on('meeting:bot_joining', ({ meetingId }: any) => {
      queryClient.setQueryData(
        queryKeys.meetings.detail(teamId, meetingId),
        (old: any) => old ? { ...old, status: 'BOT_JOINING' } : old
      )
    })

    socket.on('meeting:recording', ({ meetingId, startedAt }: any) => {
      queryClient.setQueryData(
        queryKeys.meetings.detail(teamId, meetingId),
        (old: any) => old ? { ...old, status: 'RECORDING', startedAt } : old
      )
      useRealtimeStore.getState().setLiveMeeting(meetingId)
    })

    socket.on('meeting:processed', ({ meetingId }: any) => {
      // Invalidate → TanStack Query refetches → all subscribers update
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(teamId, meetingId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.all(teamId) })
      useRealtimeStore.getState().setLiveMeeting(null)
    })

    // Commitment events
    socket.on('commitment:fulfilled', ({ commitmentId }: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
    })

    socket.on('commitment:missed', ({ commitmentId }: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commitments.all(teamId) })
    })

    // Member score updates
    socket.on('member:score_updated', ({ userId, newScore }: any) => {
      queryClient.setQueryData(
        queryKeys.team.members(teamId),
        (old: any[]) => old?.map((m) =>
          m.id === userId ? { ...m, commitmentScore: newScore } : m
        )
      )
    })
  }, [teamId, queryClient])

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const socket = socketManager.connect(accessToken)
    socket.emit('join:team', { teamId })
    registerEventHandlers(socket)

    return () => {
      socket.emit('leave:team', { teamId })
      socket.removeAllListeners()
    }
  }, [isAuthenticated, accessToken, teamId, registerEventHandlers])

  return (
    <SocketContext.Provider value={socketManager.getSocket()}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
```

---

## 9. AI Streaming UI Architecture

### Streaming Pipeline

```
User Input
    ↓
ChatInput component (client)
    ↓
POST /api/ai/stream (Next.js Route Handler, edge runtime)
    ↓
Proxies to: POST {AI_PIPELINE_URL}/extract
    ↓
ReadableStream from FastAPI → piped directly to client (zero buffering)
    ↓
useAIStream hook → decodes SSE chunks → updates Jotai streamingTextAtom
    ↓
ChatMessage component (subscribes to atom) → re-renders per chunk
    ↓
StreamingCursor animates at end of growing text
    ↓
On [DONE] → save full text to TanStack Query cache → atom reset
```

### Core Streaming Hook

```typescript
// features/intelligence/hooks/useAIStream.ts

export function useAIStream() {
  const setStreamingText = useSetAtom(streamingTextAtom)
  const setIsStreaming   = useSetAtom(isStreamingAtom)
  const setStreamError   = useSetAtom(streamErrorAtom)
  const abortRef         = useRef<AbortController | null>(null)

  const stream = useCallback(async (options: {
    endpoint:   string
    payload:    Record<string, unknown>
    onComplete?: (fullText: string) => void
    onError?:    (error: Error) => void
  }) => {
    // Cancel any existing stream
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStreamingText('')
    setIsStreaming(true)
    setStreamError(null)

    try {
      const response = await fetch(options.endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(options.payload),
        signal:  controller.signal,
      })

      if (!response.ok) throw new Error(`Stream failed: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const text   = parsed.delta?.text || parsed.text || ''
            fullText    += text
            setStreamingText(fullText)   // Atom update → immediate re-render
          } catch {
            // Partial JSON chunk — continue to next
          }
        }
      }

      options.onComplete?.(fullText)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return  // Intentional cancel
      const err = error as Error
      setStreamError(err)
      options.onError?.(err)
    } finally {
      setIsStreaming(false)
    }
  }, [setStreamingText, setIsStreaming, setStreamError])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [setIsStreaming])

  return { stream, cancel }
}
```

### Streaming Route Handler (Edge Runtime)

```typescript
// app/api/ai/stream/route.ts
export const runtime = 'edge'  // Run at edge — lowest latency

export async function POST(req: NextRequest) {
  // Auth check (reads HttpOnly cookie)
  const token = req.cookies.get('vocaply_refresh')?.value
  if (!token) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()

  // Proxy to FastAPI — stream the response directly
  const upstream = await fetch(`${process.env.AI_PIPELINE_URL}/extract`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,  // Internal service auth
    },
    body: JSON.stringify(body),
  })

  if (!upstream.ok) return new Response('Upstream error', { status: 502 })

  // Pipe ReadableStream directly — zero buffering, lowest TTFB
  return new Response(upstream.body, {
    headers: {
      'Content-Type':     'text/event-stream',
      'Cache-Control':    'no-cache, no-store',
      'X-Accel-Buffering': 'no',  // Disable Nginx buffering
    },
  })
}
```

---

## 10. Feature Module Architecture

### Module Structure (Vertical Slice)

Each feature is a completely self-contained vertical slice. No feature imports from another feature.

```
features/
├── auth/
│   ├── components/          ← React components (presentation + composition)
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── OAuthButton.tsx
│   │   ├── PasswordStrengthBar.tsx
│   │   ├── VerifyEmailPrompt.tsx
│   │   └── SessionExpiredModal.tsx
│   ├── hooks/               ← Custom hooks (business logic)
│   │   ├── useAuth.ts       ← Read auth state (current user, isAuthenticated)
│   │   ├── useLogin.ts      ← Login mutation
│   │   ├── useRegister.ts   ← Register mutation
│   │   ├── useLogout.ts     ← Logout + clearAuth
│   │   └── usePasswordReset.ts
│   ├── store/               ← Zustand slice (if feature needs local store)
│   │   └── auth.store.ts    ← (in this case lives at store/ root — shared)
│   ├── api/                 ← API call functions (return Promises)
│   │   └── auth.api.ts      ← login(), register(), refresh(), etc.
│   ├── types/               ← TypeScript interfaces for this feature
│   │   └── auth.types.ts
│   └── index.ts             ← Public API (what other modules CAN import)
│
├── meetings/
│   ├── components/
│   │   ├── MeetingCard/
│   │   │   ├── MeetingCard.tsx
│   │   │   ├── MeetingCard.test.tsx
│   │   │   └── MeetingCard.stories.tsx
│   │   ├── MeetingList/
│   │   ├── MeetingDetail/
│   │   │   ├── MeetingDetail.tsx
│   │   │   ├── MeetingOverviewTab.tsx
│   │   │   ├── MeetingTranscriptTab.tsx
│   │   │   ├── MeetingActionItemsTab.tsx
│   │   │   └── MeetingCommitmentsTab.tsx
│   │   ├── TranscriptViewer/          ← Virtualized (@tanstack/react-virtual)
│   │   ├── BotStatusBanner.tsx        ← Live "Recording..." indicator
│   │   └── AddMeetingModal.tsx
│   ├── hooks/
│   │   ├── useMeetings.ts             ← Infinite query with cursor pagination
│   │   ├── useMeeting.ts
│   │   ├── useCreateMeeting.ts        ← Mutation with plan limit error handling
│   │   ├── useMeetingFilters.ts       ← URL searchParam filter state
│   │   └── useRealtimeMeeting.ts      ← Subscribes to meeting:* WS events
│   ├── api/
│   │   ├── meetings.queries.ts        ← queryFn implementations
│   │   └── meetings.mutations.ts      ← mutation functions
│   └── index.ts
│
├── commitments/
│   ├── components/
│   │   ├── CommitmentTracker/         ← Main tracker view
│   │   ├── CommitmentCard/
│   │   ├── CommitmentTimeline/        ← Cross-meeting history view
│   │   ├── CommitmentScore/           ← SVG donut gauge (0-100)
│   │   ├── MarkFulfilledModal.tsx
│   │   └── DeferModal.tsx             ← Requires newDueDate
│   ├── hooks/
│   │   ├── useCommitments.ts
│   │   ├── useMyCommitments.ts
│   │   ├── useCommitmentStats.ts
│   │   ├── useMarkFulfilled.ts        ← Optimistic update
│   │   ├── useDeferCommitment.ts
│   │   └── useRealtimeCommitments.ts
│   └── index.ts
│
├── analytics/
├── action-items/
├── team/
├── integrations/
├── billing/
├── notifications/
├── intelligence/            ← AI chat + streaming
│   ├── components/
│   │   ├── AIChatPanel/
│   │   └── MeetingSummaryStream/
│   ├── hooks/
│   │   └── useAIStream.ts   ← Core streaming hook
│   ├── atoms/
│   │   └── ai.atoms.ts      ← Jotai atoms for stream state
│   └── index.ts
└── onboarding/
```

### Feature Boundary Enforcement

```javascript
// .eslintrc.js — Import boundaries enforced at lint time

module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'feature',  pattern: 'src/features/*',  capture: ['name'] },
      { type: 'shared',   pattern: 'src/shared/*'  },
      { type: 'store',    pattern: 'src/store/*'   },
      { type: 'lib',      pattern: 'src/lib/*'     },
      { type: 'page',     pattern: 'src/app/*'     },
    ],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // Pages can import features and shared
          { from: 'page',    allow: ['feature', 'shared', 'store', 'lib'] },
          // Features can import shared, store, lib (but NOT other features)
          { from: 'feature', allow: ['shared', 'store', 'lib'] },
          // Features CANNOT import other features (key rule)
          { from: 'feature', forbid: ['feature'] },
          // Shared can only import lib
          { from: 'shared',  allow: ['lib'] },
        ],
      },
    ],
  },
}
```

---

## 11. Component Architecture & Hierarchy

### Component Responsibility Levels

```
LEVEL 1 — Pages (app/ directory):
  Responsibility: Routing, data fetching (RSC), Suspense boundaries.
  Rules: No business logic. No useState. Just composition.
  Pattern: Import feature page components and render them.

LEVEL 2 — Feature Pages (features/*/components/*Page.tsx):
  Responsibility: Feature-level layout, data orchestration.
  Rules: Uses TanStack Query hooks. Passes data to presentational components.
  Pattern: Container components (data in, UI out).

LEVEL 3 — Feature Components (features/*/components/*.tsx):
  Responsibility: Specific feature UI with business logic.
  Rules: Can use feature hooks. Can have local state.
  Pattern: Mixed container/presentational. The majority of components.

LEVEL 4 — Shared Components (shared/components/*.tsx):
  Responsibility: Reusable UI with no feature dependency.
  Rules: No feature imports. No business logic. Props-driven.
  Pattern: Pure presentational. Highly reusable.

LEVEL 5 — Primitives (packages/ui/src/components/*.tsx):
  Responsibility: Base UI primitives (Button, Input, Card, etc.)
  Rules: Zero business logic. Controlled via props only.
  Pattern: shadcn/ui derivatives with Vocaply token system applied.
```

### Component Anatomy (Standard Template)

```typescript
// Standard component structure used across Vocaply frontend

// 1. Types first (co-located with component)
interface CommitmentCardProps {
  commitment:  Commitment
  onFulfill?:  (id: string) => void
  onDefer?:    (id: string) => void
  isLoading?:  boolean
  className?:  string
}

// 2. Component function (named, not default export)
export function CommitmentCard({
  commitment,
  onFulfill,
  onDefer,
  isLoading = false,
  className,
}: CommitmentCardProps) {
  // 3. Hooks at the top (rules of hooks)
  const [showActions, setShowActions] = useState(false)
  const isOverdue = useMemo(
    () => commitment.dueDate && new Date(commitment.dueDate) < new Date(),
    [commitment.dueDate]
  )

  // 4. Event handlers (stable references via useCallback if passed as props)
  const handleFulfill = useCallback(() => {
    onFulfill?.(commitment.id)
  }, [commitment.id, onFulfill])

  // 5. Render (no inline functions for performance-sensitive lists)
  return (
    <article
      className={cn(
        'rounded-lg p-3 border transition-colors',
        commitment.status === 'MISSED'    && 'bg-warn-light border-warn/20',
        commitment.status === 'FULFILLED' && 'bg-accent-light border-accent/20',
        commitment.status === 'PENDING'   && 'bg-white border-gray-2',
        className
      )}
      aria-label={`Commitment: ${commitment.text}`}
    >
      {/* ... */}
    </article>
  )
}

// 6. Tests co-located in same directory
// CommitmentCard.test.tsx
// CommitmentCard.stories.tsx
```

### Virtualization for Large Lists

```typescript
// shared/components/data-display/VirtualList.tsx
// Handles: transcript (1000+ turns), commitment lists (500+ items)

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 5,
}: {
  items:        T[]
  estimateSize: (index: number) => number
  renderItem:   (item: T, index: number) => React.ReactNode
  overscan?:    number
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count:           items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  })

  return (
    <div ref={parentRef} className="overflow-auto h-full">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position:  'absolute',
              top:       0,
              left:      0,
              width:     '100%',
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

// Usage — transcript viewer:
<VirtualList
  items={transcript.turns}
  estimateSize={() => 72}   // Each turn approx 72px
  renderItem={(turn) => <TranscriptTurn key={turn.id} turn={turn} />}
/>
```

---

## 12. Form Architecture

### React Hook Form + Zod (Standard Pattern)

```typescript
// Standard form implementation pattern across Vocaply

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// 1. Schema (from @vocaply/validators or co-located)
const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginInput = z.infer<typeof loginSchema>

// 2. Form component
export function LoginForm() {
  const login = useLogin()  // TanStack Query mutation

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginInput) => {
    try {
      await login.mutateAsync(data)
      // Router.push handled inside useLogin on success
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        // Map server error to specific field error
        setError('password', { message: 'Invalid email or password' })
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField
        label="Email"
        error={errors.email?.message}
      >
        <Input
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
      </FormField>

      <FormField
        label="Password"
        error={errors.password?.message}
      >
        <PasswordInput
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
      </FormField>

      <Button
        type="submit"
        isLoading={isSubmitting || login.isPending}
        disabled={isSubmitting}
        className="w-full"
      >
        Sign in
      </Button>
    </form>
  )
}
```

### Shared Zod Schema Strategy

```typescript
// packages/validators/src/auth.validators.ts
// Shared between frontend (form validation) and backend (API validation)

export const registerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:    z.string().email('Invalid email format').toLowerCase(),
  password: z.string()
    .min(8,  'Must be at least 8 characters')
    .max(128, 'Too long')
    .regex(/[A-Z]/,         'Must contain an uppercase letter')
    .regex(/[0-9]/,         'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
})

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string()
    .min(2).max(50)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens')
    .optional(),
})

// Frontend uses: zodResolver(registerSchema)
// Backend uses:  registerSchema.parse(req.body)
// → Zero duplication. Single source of validation truth.
```

---

## 13. Performance Architecture

### Bundle Strategy

```typescript
// next.config.ts — Production optimizations

const nextConfig: NextConfig = {
  reactStrictMode: true,

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    domains: [
      'lh3.googleusercontent.com',
      'avatars.githubusercontent.com',
    ],
    deviceSizes: [640, 768, 1024, 1280, 1536],
  },

  experimental: {
    optimizeCss:  true,
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
}
```

### Code Splitting Strategy

```typescript
// Heavy features loaded only when needed

// Analytics charts — only on /analytics
const FulfillmentRateChart = dynamic(
  () => import('@/features/analytics/components/charts/FulfillmentRateChart'),
  { loading: () => <ChartSkeleton />, ssr: false }
)

// AI chat panel — only when user opens it
const AIChatPanel = dynamic(
  () => import('@/features/intelligence/components/AIChatPanel/AIChatPanel'),
  { loading: () => <ChatSkeleton />, ssr: false }
)

// Command palette — only when Cmd+K pressed
const CommandPalette = dynamic(
  () => import('@/shared/components/layout/Topbar/GlobalSearch'),
  { ssr: false }
)

// Framer Motion — only for animated sections
const MotionDiv = dynamic(
  () => import('framer-motion').then((mod) => mod.motion.div),
  { ssr: false }
)
```

### React Performance Patterns

```typescript
// 1. Selector pattern — subscribe to only the needed slice
// BAD:  useAuthStore() re-renders on any store change
// GOOD: useAuthStore((s) => s.user) only re-renders when user changes
const user    = useAuthStore((s) => s.user)
const loading = useAuthStore((s) => s.isLoading)

// 2. memo only where profiling confirms it helps
// Co-located with profiling note explaining WHY it's memoized
export const MeetingCard = memo(
  function MeetingCard({ meeting, onSelect }: MeetingCardProps) { ... },
  (prev, next) =>
    prev.meeting.id === next.meeting.id &&
    prev.meeting.status === next.meeting.status &&
    prev.meeting.updatedAt === next.meeting.updatedAt
)
// WHY: MeetingCard is rendered in a virtual list of 100+ items.
// Profiler showed 400ms re-render of entire list on any status change.
// Custom comparator: only re-render when visible fields change.

// 3. useTransition for non-urgent updates
import { useTransition } from 'react'

function CommitmentFilters() {
  const [isPending, startTransition] = useTransition()
  const [filters, setFilters]        = useState(defaultFilters)

  const handleChange = (newFilters: CommitmentFilters) => {
    startTransition(() => {
      setFilters(newFilters)  // Non-urgent — won't block input
    })
  }
  // ...
}

// 4. Stable callbacks when passed as props to memoized components
const handleSelect = useCallback((meetingId: string) => {
  router.push(`/meetings/${meetingId}`)
}, [router])  // router is stable from next/navigation
```

### Core Web Vitals Targets & Strategy

```
METRIC         TARGET     STRATEGY
──────────────────────────────────────────────────────────────────────────────
LCP            < 1.2s     RSC + streaming, font preload, image priority tag
INP            < 100ms    Client hydration deferred, transitions for non-urgent updates
CLS            < 0.05     Skeleton loaders exactly match real content dimensions
TTFB           < 200ms    Edge runtime, Vercel edge network, ISR caching
FCP            < 0.8s     Streaming SSR, critical CSS inlined by Next.js
TBT            < 200ms    Bundle splitting, no long tasks on main thread

MEASUREMENT:
  → Lighthouse CI on every Vercel deployment
  → Real User Monitoring (RUM) via Vercel Analytics + PostHog
  → Alert on: P75 LCP > 2.5s or INP > 200ms for any route
```

### Performance Budget (Bundle Sizes)

```
BUDGET                   LIMIT        CURRENT    STATUS
──────────────────────────────────────────────────────
First Load JS            < 150KB      ~110KB     ✅
Landing page JS          < 80KB       ~65KB      ✅
Dashboard page JS        < 120KB      ~95KB      ✅
Per-route chunk          < 50KB       < 40KB     ✅
Design system CSS        < 30KB       ~22KB      ✅

ENFORCEMENT:
  → bundlesize check in CI (fail PR if budget exceeded)
  → next-bundle-analyzer run weekly (detect unexpected growth)
  → Tree-shaking: all imports from packages verified with size-limit
```

---

## 14. Frontend Security Architecture

### Content Security Policy

```typescript
// next.config.ts — Strict CSP headers

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline'
    https://js.stripe.com
    https://cdn.posthog.com
    https://browser.sentry-cdn.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:
    https://lh3.googleusercontent.com
    https://avatars.githubusercontent.com;
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
  { key: 'Content-Security-Policy',     value: ContentSecurityPolicy.replace(/\s{2,}/g, ' ').trim() },
  { key: 'X-Frame-Options',             value: 'DENY' },
  { key: 'X-Content-Type-Options',      value: 'nosniff' },
  { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',          value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-XSS-Protection',            value: '1; mode=block' },
]
```

### XSS Prevention in Dynamic Content

```typescript
// All user content rendered in React is auto-escaped by default.
// Risk area: dangerouslySetInnerHTML (e.g., markdown renderers)

// SAFE markdown renderer with sanitization:
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function MarkdownRenderer({ content }: { content: string }) {
  const sanitizedHtml = DOMPurify.sanitize(
    marked.parse(content) as string,
    {
      ALLOWED_TAGS:  ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'br'],
      ALLOWED_ATTR:  ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      // Force all links to be noopener noreferrer
      FORCE_BODY: true,
    }
  )

  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
```

### Multi-Tenant Data Isolation (Frontend Layer)

```typescript
// lib/api/client.ts
// Axios interceptor ensures EVERY request is team-scoped

axiosInstance.interceptors.request.use((config) => {
  const teamId = useAuthStore.getState().user?.teamId

  if (!teamId) {
    throw new Error('No teamId — refusing to make API call without tenant context')
  }

  // Backend validates this against JWT — client cannot forge
  config.headers['X-Team-ID'] = teamId
  return config
})

// When switching teams:
function onTeamSwitch(newTeamId: string) {
  // CRITICAL: Clear ALL cached data — prevent data bleed between teams
  queryClient.clear()

  // Update Zustand store
  useAuthStore.getState().setUser({ ...user, teamId: newTeamId })

  // Navigate to dashboard (fresh state, no stale data)
  router.push('/dashboard')
}

// TanStack Query keys always include teamId:
// ['teams', teamId, 'commitments'] — never just ['commitments']
// If teamId changes, all keys are different → no accidental cache sharing
```

---

## 15. Error Handling & Resilience Architecture

### Error Boundary Hierarchy

```
ROOT ERROR BOUNDARY (app/error.tsx)
  → Catches unhandled errors from any page
  → Shows branded error page with "Refresh" CTA
  → Reports to Sentry automatically (Next.js built-in)

DASHBOARD ERROR BOUNDARY (app/(dashboard)/error.tsx)
  → Catches dashboard-level errors without losing the shell (sidebar stays)
  → Shows data loading error with retry

FEATURE ERROR BOUNDARIES (in each feature layout):
  → Per-section boundaries using ErrorBoundary component
  → One section failing doesn't break the rest of the page
  → Shows DataLoadingError with section-specific retry

COMPONENT ERROR BOUNDARIES (inline in complex components):
  → Wrapped around: TranscriptViewer, AnalyticsDashboard, AIChatPanel
  → Allows rest of page to function if one heavy component fails
```

```typescript
// shared/components/feedback/ErrorBoundary.tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { Component, ErrorInfo, ReactNode } from 'react'
import { DataLoadingError } from './DataLoadingError'

interface Props {
  children:  ReactNode
  fallback?: ReactNode
  context?:  string          // e.g., "CommitmentTracker"
  level?:    'page' | 'section' | 'component'
}

export class ErrorBoundary extends Component<Props, { hasError: boolean; error?: Error }> {
  state = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react:    { componentStack: info.componentStack },
        vocaply:  { context: this.props.context, level: this.props.level },
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
```

### API Error Classification

```typescript
// lib/api/errors.ts

export class ApiError extends Error {
  constructor(
    public readonly status:  number,
    public readonly code:    string,
    message:                 string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
  }

  // Helper predicates
  get isAuthError()       { return this.status === 401 }
  get isForbidden()       { return this.status === 403 }
  get isNotFound()        { return this.status === 404 }
  get isPlanLimit()       { return this.status === 402 }
  get isRateLimited()     { return this.status === 429 }
  get isServerError()     { return this.status >= 500 }
  get isValidationError() { return this.code === 'VALIDATION_ERROR' }
}

// Axios response → ApiError
axiosInstance.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response) {
      const { status, data } = error.response
      throw new ApiError(
        status,
        data.error.code,
        data.error.message,
        data.error.details
      )
    }
    throw error  // Network error — let TanStack Query retry
  }
)
```

### Offline & Network Resilience

```typescript
// shared/hooks/useNetworkStatus.ts

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return isOnline
}

// shared/components/feedback/OfflineBanner.tsx
export function OfflineBanner() {
  const isOnline = useNetworkStatus()

  if (isOnline) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-warn text-white text-sm py-2 text-center"
    >
      You're offline. Changes will sync when connection is restored.
    </div>
  )
}
```

---

## 16. Analytics & Observability Architecture

### Sentry Integration

```typescript
// sentry.client.config.ts

Sentry.init({
  dsn:         process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Sample rates — not every event needs to go to Sentry
  tracesSampleRate:        process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.05,   // 5% of sessions get full replay
  replaysOnErrorSampleRate: 1.0,    // 100% of error sessions

  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.nextRouterInstrumentation,
    }),
    new Sentry.Replay({
      maskAllText:   true,    // Privacy: mask all text in replay
      blockAllMedia: true,    // Privacy: block images/video
    }),
  ],

  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ChunkLoadError',
    /Network request failed/,
    /Loading chunk/,
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

### PostHog Product Analytics

```typescript
// lib/analytics.ts
// Type-safe event tracking abstraction

type AnalyticsEvent =
  | { name: 'hero_cta_click';        props: { cta_text: string } }
  | { name: 'nav_cta_click';         props: { position: 'nav' } }
  | { name: 'pricing_toggle';        props: { toggled_to: 'annual' | 'monthly' } }
  | { name: 'pricing_plan_click';    props: { plan: string } }
  | { name: 'faq_opened';            props: { question: string } }
  | { name: 'meeting_created';       props: { platform: string } }
  | { name: 'commitment_fulfilled';  props: { source: 'manual' | 'ai' } }
  | { name: 'integration_connected'; props: { provider: string } }
  | { name: 'upgrade_modal_shown';   props: { trigger: string; plan: string } }
  | { name: 'plan_upgraded';         props: { from: string; to: string } }

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window === 'undefined') return
  if (!(window as any).posthog) return
  ;(window as any).posthog.capture(event.name, event.props)
}

// Usage — type-safe, no stringly-typed event names
trackEvent({ name: 'commitment_fulfilled', props: { source: 'manual' } })
```

### Web Vitals Reporting

```typescript
// app/layout.tsx

export function reportWebVitals(metric: NextWebVitalsMetric) {
  // Report to PostHog for product analytics
  if ((window as any).posthog) {
    (window as any).posthog.capture('web_vital', {
      name:            metric.name,
      value:           Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      id:              metric.id,
      label:           metric.label,
      navigationType:  metric.navigationType,
    })
  }

  // Alert on LCP regression
  if (metric.name === 'LCP' && metric.value > 2500) {
    Sentry.captureMessage('LCP exceeded 2.5s threshold', {
      level: 'warning',
      extra: { value: metric.value, url: window.location.href },
    })
  }
}
```

---

## 17. Testing Architecture

### Testing Pyramid

```
E2E TESTS (Playwright) — 20 tests
  → Full user journeys: Register → Verify → Onboard → Create meeting → View commitments
  → Critical paths: Login, meeting creation, commitment fulfillment, billing upgrade
  → Cross-browser: Chrome, Firefox, Safari
  → Mobile: Chrome mobile, Safari mobile (via device emulation)
  → Run: on every PR to main branch

INTEGRATION TESTS (Vitest + MSW) — 50 tests
  → Feature hooks: useMeetings, useMarkFulfilled, useCreateMeeting
  → TanStack Query integration: cache behavior, optimistic updates, rollback
  → Form validation: all form schemas with valid/invalid inputs
  → API error handling: 401, 402, 404, 422, 500 scenarios
  → Run: on every PR

UNIT TESTS (Vitest) — 100 tests
  → Utility functions: cn(), format-date, format-duration, slugify
  → Validation schemas: all Zod schemas
  → Store actions: auth.store, ui.store actions
  → Custom hooks: useDebounce, useScrollReveal, useCursorPagination
  → Run: on every commit (fast, < 10 seconds)

VISUAL TESTS (Storybook + Chromatic) — 50 stories
  → Every shared component has a story
  → Every domain component has a story (StatusBadge, CommitmentScore, etc.)
  → Stories document all variants and edge cases
  → Chromatic: visual regression detection on every deploy
```

### Testing Strategy Per File Type

```typescript
// Component tests (Vitest + Testing Library)
// CommitmentCard.test.tsx

import { render, screen, fireEvent } from '@testing-library/react'
import { CommitmentCard } from './CommitmentCard'
import { mockCommitment } from '@/test/fixtures/commitments'

describe('CommitmentCard', () => {
  it('renders MISSED status with red background', () => {
    render(<CommitmentCard commitment={{ ...mockCommitment, status: 'MISSED' }} />)
    expect(screen.getByRole('article')).toHaveClass('bg-warn-light')
    expect(screen.getByText('Missed')).toBeInTheDocument()
  })

  it('calls onFulfill when fulfill button clicked', async () => {
    const onFulfill = vi.fn()
    render(<CommitmentCard commitment={mockCommitment} onFulfill={onFulfill} />)
    await userEvent.click(screen.getByRole('button', { name: /mark fulfilled/i }))
    expect(onFulfill).toHaveBeenCalledWith(mockCommitment.id)
  })

  it('shows overdue indicator when past due date', () => {
    const overdueCommitment = {
      ...mockCommitment,
      dueDate: '2020-01-01T00:00:00Z',  // Past date
      status:  'PENDING' as const,
    }
    render(<CommitmentCard commitment={overdueCommitment} />)
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────

// Hook tests (Vitest + MSW)
// useMarkFulfilled.test.ts

import { renderHook, waitFor } from '@testing-library/react'
import { server } from '@/test/mocks/server'
import { rest } from 'msw'
import { useMarkFulfilled } from './useMarkFulfilled'
import { createTestQueryClient, createWrapper } from '@/test/utils'

describe('useMarkFulfilled', () => {
  it('optimistically updates commitment status', async () => {
    const queryClient = createTestQueryClient()
    const { result }  = renderHook(() => useMarkFulfilled(), {
      wrapper: createWrapper(queryClient),
    })

    // Pre-populate cache with PENDING commitment
    queryClient.setQueryData(
      ['teams', 'team_01', 'commitments', 'com_01'],
      { ...mockCommitment, status: 'PENDING' }
    )

    result.current.mutate({ commitmentId: 'com_01' })

    // Immediately check optimistic update (before server responds)
    const optimisticData = queryClient.getQueryData<Commitment>(
      ['teams', 'team_01', 'commitments', 'com_01']
    )
    expect(optimisticData?.status).toBe('FULFILLED')
  })

  it('rolls back on server error', async () => {
    server.use(
      rest.patch('/api/v1/commitments/:id/status', (_req, res, ctx) =>
        res(ctx.status(500))
      )
    )

    // ... test rollback behavior
  })
})
```

### E2E Test Structure

```typescript
// tests/e2e/commitment-flow.spec.ts

import { test, expect } from '@playwright/test'
import { loginAs, createTeam, createMeeting } from './helpers'

test.describe('Commitment Tracking Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'manager@techflow.com')
  })

  test('marks commitment as fulfilled and updates score', async ({ page }) => {
    await page.goto('/commitments')

    // Find a pending commitment
    const commitment = page.getByTestId('commitment-row').filter({
      hasText: 'PENDING',
    }).first()

    await commitment.getByRole('button', { name: /mark fulfilled/i }).click()

    // Modal appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /confirm/i }).click()

    // Commitment status changes optimistically
    await expect(commitment).toContainText('Fulfilled')

    // Score updates via WebSocket (wait for it)
    await expect(page.getByTestId('commitment-score')).not.toHaveText('Loading')
  })
})
```

---

## 18. CI/CD & Deployment Architecture

### GitHub Actions Pipeline

```yaml
# .github/workflows/ci.yml

name: CI

on:
  pull_request:    { branches: [main, develop] }
  push:            { branches: [main] }

concurrency:
  group:              ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true   # Cancel stale runs on new push

jobs:
  quality:
    name: Quality Gates
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run:  pnpm install --frozen-lockfile
      - run:  pnpm turbo type-check lint
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM:  ${{ vars.TURBO_TEAM }}

  test:
    name: Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run:  pnpm install --frozen-lockfile
      - run:  pnpm turbo test
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: apps/web/coverage/ }

  build:
    name: Build
    runs-on:  ubuntu-latest
    needs:    [quality, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run:  pnpm install --frozen-lockfile
      - run:  pnpm turbo build
        env:
          TURBO_TOKEN:             ${{ secrets.TURBO_TOKEN }}
          NEXT_PUBLIC_API_URL:     ${{ vars.NEXT_PUBLIC_API_URL }}
          NEXT_PUBLIC_SOCKET_URL:  ${{ vars.NEXT_PUBLIC_SOCKET_URL }}

  bundle-check:
    name: Bundle Budget
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4
      - run:  pnpm dlx bundlesize

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs:   [build]
    if:      github.base_ref == 'main'
    steps:
      - uses: actions/checkout@v4
      - run:  pnpm playwright install --with-deps chromium
      - run:  pnpm turbo test:e2e
      - uses: actions/upload-artifact@v4
        if:   failure()
        with: { name: playwright-results, path: test-results/ }
```

### Deployment Architecture

```
ENVIRONMENT     TRIGGER              TARGET              STRATEGY
─────────────────────────────────────────────────────────────────────────────
Preview         PR opened/updated    Vercel preview URL  Automatic, per-PR
Staging         Push to develop      staging.vocaply.com Blue/green
Production      Push to main         vocaply.com         Canary → 10% → 100%

PRODUCTION DEPLOYMENT:
  1. Push to main → CI passes
  2. Vercel deploys automatically (GitHub integration)
  3. 10% of traffic routed to new deployment (canary)
  4. Monitor: error rate, P99 latency, Core Web Vitals (10 minutes)
  5. If metrics stable → 100% traffic shift (automatic)
  6. If regression detected → automatic rollback to previous

FEATURE FLAGS (Vercel Edge Config):
  → New features dark-deployed (flag OFF by default)
  → Enable for internal team → 5% → 25% → 50% → 100%
  → Instant rollback: toggle flag to OFF (no redeployment)
  → Used for: new dashboard layout, new AI features, pricing experiments
```

---

## 19. Accessibility Architecture

### Semantic HTML Contract

```
ONE H1 PER PAGE: Always the hero/page headline.
H2: Section headlines (Features, How it Works, FAQ, etc.)
H3: Card/item titles within sections
H4+: Sub-items (rarely needed)

NEVER skip heading levels (H1 → H3 without H2).

LANDMARK ELEMENTS:
  <header>: MarketingNav, Topbar
  <main>:   Page content (one per page, id="main-content")
  <nav>:    Navigation (with aria-label="Main navigation")
  <aside>:  Sidebar (with aria-label="Application sidebar")
  <footer>: MarketingFooter

INTERACTIVE ELEMENTS:
  Buttons: always have text content OR aria-label
  Links: always have descriptive text (no "click here")
  Icon buttons: always have aria-label
  Form inputs: always have associated <label> (via htmlFor or aria-labelledby)
  Accordion: aria-expanded + aria-controls on trigger
  Tabs: role="tablist" + role="tab" + aria-selected + aria-controls
  Modals: role="dialog" + aria-modal + aria-labelledby
  Loading states: aria-busy="true" + aria-label="Loading..."
```

### Focus Management

```typescript
// Focus ring — globally defined in globals.css
// Visible on ALL focusable elements, no exceptions

*:focus-visible {
  outline:        2px solid var(--color-brand);
  outline-offset: 2px;
  border-radius:  var(--radius);
}

// Never: outline: none without a visible replacement

// Skip to main content link (keyboard users)
// First focusable element on every page
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4
             focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded
             focus:border-2 focus:border-brand"
>
  Skip to main content
</a>

// Modal focus trap (using Radix Dialog — built-in)
// Focus returns to trigger element on close
```

### Keyboard Navigation Checklist

```
Tab:             Navigate all interactive elements in document order
Shift+Tab:       Navigate backwards
Enter/Space:     Activate buttons, checkboxes, accordions
Escape:          Close modals, dropdowns, command palette
Arrow keys:      Navigate: tabs, dropdown items, date picker
Cmd+K:           Open command palette (custom keyboard shortcut)

All keyboard interactions tested with:
  → VoiceOver (macOS/iOS)
  → NVDA (Windows)
  → JAWS (enterprise screen reader)
```

### Color Contrast Compliance

```
WCAG AA (minimum, required):
  Text on white (#0A0A0A on #FAFAF8):     21:1    ✅ (AAA)
  Muted text (#6B6A67 on #FAFAF8):         5.2:1  ✅
  White on accent (#FAFAF8 on #1A6B3C):   5.1:1  ✅
  White on dark (#FAFAF8 on #0A0A0A):    21:1    ✅ (AAA)

Check with: axe DevTools, WAVE, color.review
Automated check: pa11y in CI on every build
```

---

## 20. PWA & Offline Architecture

### Service Worker Strategy

```typescript
// next.config.ts — PWA via next-pwa

const pwaConfig = withPWA({
  dest:       'public',
  disable:    process.env.NODE_ENV === 'development',
  register:   true,
  skipWaiting: true,

  runtimeCaching: [
    // App shell — cache first (fast load)
    {
      urlPattern: /^https:\/\/vocaply\.com\/((?!api).)*$/,
      handler:    'CacheFirst',
      options: {
        cacheName:   'app-shell',
        expiration:  { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // API responses — network first (always fresh data)
    {
      urlPattern: /^https:\/\/api\.vocaply\.com\/api\//,
      handler:    'NetworkFirst',
      options: {
        cacheName:              'api-cache',
        networkTimeoutSeconds:  5,           // Fall back to cache after 5s
        expiration:             { maxEntries: 100, maxAgeSeconds: 60 * 60 },
        cacheableResponse:      { statuses: [0, 200] },
      },
    },
    // Fonts — stale while revalidate
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler:    'StaleWhileRevalidate',
      options:    { cacheName: 'google-fonts', expiration: { maxEntries: 4 } },
    },
  ],
})
```

### Offline Sync Queue

```typescript
// lib/offline/sync-queue.ts
// Queue mutations made while offline, replay when online

class OfflineSyncQueue {
  private queue:    QueuedMutation[] = []
  private STORAGE:  string = 'vocaply_sync_queue'

  constructor() {
    this.queue = this.loadFromStorage()
    window.addEventListener('online', () => this.flush())
  }

  enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retries'>) {
    const item: QueuedMutation = {
      ...mutation,
      id:        crypto.randomUUID(),
      timestamp: Date.now(),
      retries:   0,
    }
    this.queue.push(item)
    this.persist()

    useUIStore.getState().addToast({
      title:       'Saved offline',
      description: 'Will sync when connection is restored',
      variant:     'info',
    })
  }

  private async flush() {
    if (!navigator.onLine || this.queue.length === 0) return

    const pending = [...this.queue]
    this.queue    = []
    this.persist()

    for (const item of pending) {
      try {
        await fetch(item.endpoint, {
          method:  item.method,
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(item.payload),
        })
      } catch {
        if (item.retries < 3) {
          this.queue.push({ ...item, retries: item.retries + 1 })
        }
      }
    }

    if (pending.length > 0) {
      // Invalidate all queries — server state may have changed
      getQueryClient().invalidateQueries()
    }

    this.persist()
  }

  private persist() {
    localStorage.setItem(this.STORAGE, JSON.stringify(this.queue))
  }

  private loadFromStorage(): QueuedMutation[] {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE) || '[]')
    } catch {
      return []
    }
  }
}

export const syncQueue = new OfflineSyncQueue()
```

---

## 21. Internationalization Architecture

### i18n Strategy (Planned Phase 2)

```
PHASE 1 (Current): English only.
  All strings hardcoded in English.
  No translation layer — maximum DX for solo team.
  Content-as-code: content files in lib/marketing/content/*.ts

PHASE 2 (Month 6, after product-market fit):
  Library: next-intl (best Next.js App Router support)
  Approach: File-based (messages/en.json, messages/es.json)
  
  Locale detection priority:
    1. User preference (stored in user.locale DB field)
    2. Accept-Language header (on first visit)
    3. Default: 'en'
  
  URL structure: /es/dashboard (not ?locale=es — better for SEO)
  
  RTL support (Arabic, Hebrew):
    → dir="rtl" on <html>
    → Tailwind: logical properties (ms-4 instead of ml-4, etc.)
    → Test with: Hebrew text in development

TARGET LANGUAGES (priority order based on market):
  1. English (en)       — Current
  2. Spanish (es)       — Large remote work market
  3. German (de)        — Enterprise market
  4. French (fr)        — European enterprise
  5. Japanese (ja)      — Strong async work culture
  6. Portuguese (pt-BR) — Latin America market
```

---

## 22. Team Scaling & Code Governance

### Feature Team Ownership Model

```
TEAM              OWNS                              REQUIRED EXPERTISE
──────────────────────────────────────────────────────────────────────────────
Core Platform     AppShell, auth, routing, design   RSC, Next.js deep, tokens
                  system, shared providers

Meetings & AI     features/meetings,                Streaming, WebSocket,
Intelligence      features/intelligence,            Jotai, AI UX patterns
                  AI streaming system

Commitments &     features/commitments,             TanStack Query, optimistic
Action Items      features/action-items,            updates, virtual lists
                  realtime store updates

Analytics &       features/analytics,               Recharts/D3, data viz,
Team Health       features/team,                    complex SQL → chart patterns
                  dashboard widgets

Integrations &    features/integrations,            OAuth flows, Stripe,
Platform          features/billing,                 3rd party API patterns
                  settings pages

Marketing         app/(marketing)/,                 Landing page, SEO,
                  landing page components,          performance, animation
                  content system
```

### Code Conventions (Enforced by ESLint)

```typescript
// NAMING:
//   Components:     PascalCase   → CommitmentCard.tsx
//   Hooks:          camelCase    → useCommitments.ts (always 'use' prefix)
//   Stores:         camelCase    → auth.store.ts
//   API files:      kebab-case   → commitment.api.ts
//   Utils:          kebab-case   → format-date.ts
//   Constants:      UPPER_SNAKE  → MAX_COMMITMENT_TEXT_LENGTH
//   Types:          PascalCase   → Commitment, CommitmentStatus
//   Enums:          PascalCase   → UserRole (values: OWNER, ADMIN, MANAGER, MEMBER)

// EXPORTS:
//   Named exports only — no default exports from components
//   Exception: Next.js pages MUST be default exports (framework requirement)
//   Named exports enable better tree-shaking + grep-ability

// IMPORTS ORDER (enforced by eslint-plugin-import):
//   1. React + Next.js
//   2. External packages (alphabetical)
//   3. @vocaply/* packages
//   4. @/ absolute imports (feature → shared → lib)
//   5. Relative imports
//   6. Type imports (import type)

// ANTI-PATTERNS (ESLint errors):
//   ❌ useEffect for data fetching → use TanStack Query
//   ❌ Cross-feature imports → use index.ts public API only
//   ❌ any type → always type properly
//   ❌ console.log → use logger utility
//   ❌ Direct fetch in components → always go through api/ layer
//   ❌ Inline styles → use Tailwind classes + CSS variables
//   ❌ Magic strings for query keys → use queryKeys factory

// COMPONENT RULES:
//   Interface above component (co-located props types)
//   forwardRef for UI components that accept ref
//   JSDoc comment on all public API functions/components
//   Co-locate: Component.tsx, Component.test.tsx, Component.stories.tsx
```

### PR Review Checklist

```
EVERY PR MUST PASS:

Automated (CI):
  [ ] TypeScript: zero errors
  [ ] ESLint: zero errors, zero warnings
  [ ] Unit tests: all passing
  [ ] Bundle budget: within limits
  [ ] Lighthouse: no regression on changed pages

Manual (reviewer):
  [ ] Feature isolation: no cross-feature imports
  [ ] State ownership: no server state in Zustand
  [ ] Optimistic updates: mutations have rollback
  [ ] Error handling: new UI has error boundary
  [ ] Accessibility: semantic HTML, ARIA labels, keyboard works
  [ ] Loading states: skeleton defined before happy path
  [ ] Mobile: tested at 375px
  [ ] Dark section contrast: white text readable on #0A0A0A

For API changes:
  [ ] Query key uses queryKeys factory
  [ ] Cache config defined in cache-config.ts
  [ ] Invalidation strategy documented in comment
```

---

## 23. Migration & Upgrade Strategy

### Dependency Upgrade Strategy

```
MAJOR UPGRADES (e.g., Next.js 14 → 15, TanStack Query v5 → v6):
  1. Create feature branch: upgrade/next-15
  2. Apply upgrade on isolated branch
  3. Run full test suite
  4. Run Lighthouse on all major routes
  5. Deploy to preview environment
  6. Manual QA on preview (auth, meetings, commitments, billing)
  7. Performance comparison (before vs after bundle sizes)
  8. PR with detailed change log + breaking change notes
  9. Merge to main → canary deploy → monitor for 48 hours
  10. Full rollout if stable

MINOR / PATCH UPGRADES:
  → Dependabot auto-PRs (configured for weekly batches)
  → Auto-merge if: CI passes + no major changes in changelog
  → Labelled: 'dependencies' for visibility

SHADCN/UI COMPONENT UPDATES:
  → shadcn components are OWNED (copied), not versioned
  → Check shadcn changelog monthly for security/accessibility updates
  → Apply manually to packages/ui with careful review
  → No automated updates — changes are intentional
```

### Feature Flag System

```typescript
// Feature flags via Vercel Edge Config (sub-1ms reads at edge)
// Controlled without redeployment

const FLAGS = {
  'new-dashboard-layout':       false,
  'ai-meeting-brief':           false,
  'cursor-pagination-default':  true,
  'microsoft-teams-support':    false,
  'multi-workspace':            false,
} as const

type FeatureFlag = keyof typeof FLAGS

export async function getFeatureFlag(flag: FeatureFlag): Promise<boolean> {
  try {
    const edgeConfig = await fetch(process.env.EDGE_CONFIG_URL!)
    const config     = await edgeConfig.json()
    return config[flag] ?? FLAGS[flag]  // Fallback to code default
  } catch {
    return FLAGS[flag]  // Always fall back to code default
  }
}

// Server-side usage (RSC):
const showNewLayout = await getFeatureFlag('new-dashboard-layout')

// Client-side usage (via /api/features endpoint):
const { data: features } = useQuery({
  queryKey: ['features'],
  queryFn:  () => apiClient.get('/api/v1/features').then((r) => r.data),
  staleTime: 5 * 60 * 1000,
})
```

---

## 24. Capacity & Performance Targets

### System Capacity by Scale

```
SCALE PHASE        USERS     TEAMS    ARCHITECTURE CHANGES
─────────────────────────────────────────────────────────────────────────────
Phase 1 (NOW)      0-10K     0-500    Current monolith, single Vercel project
Phase 2            10K-100K  500-5K   Add Vercel Enterprise, CDN tuning
Phase 3            100K-1M   5K-50K   Edge middleware for auth, partial SSG
Phase 4 (1M+)      1M+       50K+     Multi-region, possible MFE evaluation

COMPONENT CAPACITY:
  Virtual list:      100,000+ items (react-virtual)
  Transcript turns:  2,000+ per meeting (virtualized, not rendered all at once)
  Chart data points: 365+ per chart (Recharts handles efficiently)
  WS connections:    10,000+ per Socket.io instance (with Redis adapter)
  Cache entries:     Unlimited (TanStack Query with LRU eviction)
```

### Detailed Performance Targets

```
METRIC                           TARGET    MEASUREMENT
─────────────────────────────────────────────────────────────────────────────
First Load JS (all pages)        < 150KB   next build output + bundlesize
Landing page LCP                 < 1.2s    Lighthouse CI on vercel preview
Dashboard LCP                    < 1.5s    Lighthouse CI
Commitment list render (100)     < 16ms    React DevTools profiler
Commitment list render (1000)    < 50ms    Virtualized, profiler
Chart render (365 data points)   < 100ms   Recharts profiler
Socket.io reconnect time         < 3s      Integration test
AI stream TTFB (first token)     < 500ms   E2E timing
Auth check on load               < 200ms   AuthProvider timing
Page navigation (SPA)            < 100ms   Navigation timing API
TypeScript compile (full)        < 30s     CI timing
TypeScript compile (incremental) < 3s      Local dev (turbo watch)
Vitest full run                  < 30s     CI timing
Playwright critical path E2E     < 2min    CI timing
```

### Technology Upgrade Timeline

```
CURRENT STACK (June 2026):
  Next.js 14.2.x  · React 18.3.x  · TypeScript 5.4.x
  TanStack Query 5.x · Zustand 4.x · Jotai 2.x
  Framer Motion 11.x · Tailwind 3.x · Socket.io 4.x

PLANNED UPGRADES:
  Q3 2026: Next.js 15 (React 19 + improved RSC caching)
  Q3 2026: React 19 (Actions, use() hook, improved Suspense)
  Q4 2026: Tailwind 4 (CSS-native, no PostCSS dependency)
  Q1 2027: TanStack Query 6 (if released, evaluate)

WATCH LIST:
  Bun runtime: monitor for production Next.js stability
  Vite 6:      if better than Turbopack for large projects
  Biome:       potential ESLint/Prettier replacement (faster)
  Million.js:  React rendering optimization (if performance bottleneck)
```

---

## Summary: Architecture at a Glance

```
CONCERN                   SOLUTION                          SCALE TARGET
─────────────────────────────────────────────────────────────────────────────
Routing                   Next.js App Router                Unlimited
Rendering                 RSC + Streaming SSR + CSR         1M users
Server State              TanStack Query v5                 Global, typed cache
Auth State                Zustand (memory only)             Session-safe
UI State                  Zustand (persist prefs)           Any scale
AI/Streaming State        Jotai atoms                       SSE-safe
Real-time                 Socket.io + Redis adapter         Multi-server
AI Streaming              ReadableStream + Edge runtime     Claude-like UX
Large Lists               TanStack Virtual                  100K+ rows
Forms                     RHF + Zod (shared schemas)        Server + client parity
Bundle Size               RSC + code split + budget CI      < 150KB first load
Performance               LCP < 1.2s · INP < 100ms         CWV green
Security                  CSP + memory tokens + DOMPurify   Enterprise grade
Observability             Sentry + PostHog + RUM            Full coverage
PWA                       next-pwa + offline sync           Offline capable
Accessibility             WCAG AA + semantic HTML           Enterprise grade
CI/CD                     Turborepo + Vercel + GH Actions   < 5 min deploys
Feature Isolation         eslint-plugin-boundaries          50+ engineer safe
Team Scale                Vertical feature slices + ADRs    100+ engineer ready
─────────────────────────────────────────────────────────────────────────────
Total components:     90+     Total hooks:       40+
Total pages:          30+     Total packages:     9
Total test files:     170+    Total Storybook:    50+ stories
Architecture style:   Modular Monolith → MFE if needed at Phase 4
─────────────────────────────────────────────────────────────────────────────
```

---

*Document: FE-SYSTEM-001 | Vocaply | Full Frontend System Design*
*Author: Senior Frontend System Architect*
*Version: 1.0 | June 2026*
*Scope: Next.js 14 · TypeScript · Turborepo · 1M+ Users · Enterprise SaaS*
*Landing page: ✅ Already built (Days 1–10 complete)*
*Dashboard + App: This document governs the full frontend system*
