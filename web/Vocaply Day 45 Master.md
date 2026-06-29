# Vocaply — Day 45 Master Build Plan
## Full Workspace Hardening: Mobile Responsiveness · Error Boundaries · Loading Skeletons · Design-Language Audit
> Principal Frontend Architect Edition · Industry-Grade · Zero New Components · Pure Correctness Pass
> Closes Phase 3 (Days 26–45). Nothing new gets invented today — everything that already exists gets verified.

---

## 0. Reading This Document

There is no new feature today, which makes this the hardest day of the month to plan well, because "go fix everything" is not a plan. Today's document is structured as a **measurement instrument**, not a build list: for every surface shipped since Day 26, we state the exact pixel/timing/behavior bar it must clear, the exact viewport widths it's tested at, and the exact failure mode we're hunting for. The deliverable isn't a component — it's a *verified claim*, screen by screen, that this product is production-grade at every breakpoint, in every error state, and during every loading transition. Phase 4 starts tomorrow building net-new surface area; today is the last moment any inconsistency from the last three weeks can be fixed cheaply instead of compounding.

---

## 1. Typography System — Today's Job Is Verification, Not Definition

No new type scale ships today. Instead, today's typography work is a **cross-surface audit** of the rules already locked Days 26–44:

```
AUDIT TARGETS (re-stated, not re-invented)
──────────────────────────────────────────────────────────────────────────
Plus Jakarta Sans   → MUST appear only at: page titles, Sheet/Dialog titles,
                       one headline per Onboarding step, Settings section
                       labels, matrix column headers (Notifications).
                       AUDIT TASK: grep every component for font-family
                       overrides; flag any Plus Jakarta Sans usage NOT on
                       this list as a violation to fix today.

Inter                → MUST be the default for everything else, with zero
                       exceptions for "this label felt like it needed more
                       presence." AUDIT TASK: confirm Inter is the CSS
                       default at the :root level, so any future component
                       that forgets to set a font explicitly inherits Inter
                       correctly rather than falling back to a system font
                       stack on a slow CDN load.

Poppins              → MUST appear ONLY where a number is the literal point:
                       CommitmentScore, connection counts, money/usage
                       fractions, invoice amounts, Bell unread badge, invite
                       result counts. AUDIT TASK: enumerate every current
                       Poppins usage across the codebase (this list should
                       be short enough to fit on one screen) and confirm
                       each one still matches this rule — any drift gets
                       corrected today, before Phase 4 adds new numeric UI
                       that might otherwise copy a bad precedent forward.

MOBILE-SPECIFIC TYPE CHECK (new ground covered today):
  At 375px viewport, re-verify EVERY locked type-scale value from Days
  26-44 still meets minimum legibility — specifically: no body text
  renders below 13px effective size on mobile (some components use
  relative/clamp() sizing that could shrink further than intended at
  narrow viewports without anyone having tested it at 375px specifically
  until today).
```

---

## 2. File & Component Architecture

```
shared/components/layout/
  MobileNav.tsx                                  ← FINALIZED today
  MobileNavItem.tsx                                ← NEW: extracted single nav-destination button,
                                                       so active-state logic lives in one place,
                                                       not duplicated 5× inline inside MobileNav
  MobileDrawer.tsx                                 ← FINALIZED today
  MobileDrawerHeader.tsx                            ← NEW: team switcher + close button row,
                                                       extracted so it's independently testable
  AppShell.tsx                                      ← UPDATED: single source of breakpoint truth
  Topbar/Topbar.tsx                                 ← UPDATED: collapse logic below 640px
  Topbar/TopbarOverflowMenu.tsx                     ← NEW: the single icon-button that absorbs
                                                       GlobalSearch + NotificationBell triggers
                                                       below 640px — a real component, not an
                                                       inline conditional inside Topbar.tsx

shared/components/feedback/
  ErrorBoundary.tsx                                 ← AUDITED (logic unchanged, coverage extended)
  RouteErrorFallback.tsx                             ← NEW
  WidgetErrorFallback.tsx                            ← NEW: a SMALLER fallback for ErrorBoundary-
                                                       wrapped widgets-within-a-page (distinct from
                                                       RouteErrorFallback, which takes over a full
                                                       route segment) — see §6.3 for why these must
                                                       not be the same component
  GlobalNotFound.tsx                                 ← AUDITED

shared/components/data-display/
  ResponsiveRow.tsx                                  ← NEW: the shared internal layout primitive
                                                       every dense-list row (MeetingCard,
                                                       CommitmentCard, ActionItemRow, MemberRow,
                                                       InvoiceRow) is refactored to compose, so the
                                                       "collapse to stacked-2-line below 640px" rule
                                                       is implemented exactly once and inherited by
                                                       all five, rather than reimplemented five times
                                                       with five subtly different breakpoint behaviors

app/(dashboard)/**/error.tsx                          ← AUDITED/FILLED (see §5 inventory)
app/(dashboard)/**/loading.tsx                        ← AUDITED/FILLED (see §5 inventory)

features/**/components/**Skeleton.tsx                 ← AUDITED (see §7 inventory)

tests/e2e/
  mobile-nav.spec.ts
  responsive-tables.spec.ts
  error-boundaries.spec.ts
  typography-audit.spec.ts                            ← NEW: a Playwright pass that computes
                                                       getComputedStyle().fontFamily for a
                                                       sampled set of elements across every
                                                       route and asserts against the rules in §1 —
                                                       turning today's typography audit from a
                                                       one-time manual pass into a CI-enforced
                                                       regression guard going forward
  skeleton-dimension.spec.ts                          ← NEW: for each route with a loading.tsx,
                                                       captures the skeleton's bounding boxes,
                                                       then captures the real content's bounding
                                                       boxes once loaded, and asserts they match
                                                       within a small pixel tolerance — turning
                                                       "zero CLS" from a manual visual check into
                                                       an automated, repeatable assertion
```

### Why two new test specs beyond the three originally scoped

The original plan calls for three Playwright specs. Today's plan adds two more — `typography-audit.spec.ts` and `skeleton-dimension.spec.ts` — because the two riskiest claims in this entire day ("the type system has zero drift," "skeletons cause zero layout shift") are exactly the two claims most likely to silently regress the first time someone adds a new screen in Phase 4 without reading this document. A manual audit today is necessary but not sufficient; encoding both audits as CI assertions is what actually prevents Day 45's work from quietly decaying over the following months. This is the single highest-leverage addition to today's scope beyond what was originally listed.

---

## 3. The Breakpoint Contract — Restated as an Enforceable Spec

```
BREAKPOINT          SIDEBAR              BOTTOM NAV      TOPBAR                  DENSE LISTS
─────────────────────────────────────────────────────────────────────────────────────────────────
< 640px              none (Drawer only)   MobileNav        Search+Bell → overflow  Stacked 2-line rows
640–767px            none (Drawer only)   MobileNav        Search+Bell visible     Stacked 2-line rows
768–1023px           Icon-only, 56px      none             Full Topbar             Full table columns
≥ 1024px             Full, 240px          none             Full Topbar             Full table columns
```

**The one change from the original three-tier contract:** the original spec drew the dense-list collapse line at 640px and the sidebar collapse line at 768px as if they were the same decision — today's audit treats them as two **independently verified** thresholds, because a viewport between 640–767px (a large phone in landscape, or a small tablet portrait) needs the *Drawer* (no persistent sidebar fits) while still being wide enough to render *full table columns* comfortably. Conflating these two breakpoints was a latent bug risk in the original three-bucket framing; today's contract is the corrected, four-row version, and `AppShell.tsx` is the single file where both thresholds are defined as named constants (`SIDEBAR_BREAKPOINT = 768`, `DENSE_LIST_BREAKPOINT = 640`) so no component ever hardcodes a raw `768` or `640` pixel value independently.

---

## 4. Micro-Interactions — Full Catalogue (Today's Actual Craft)

### 4.1 `MobileNav` — bottom bar, active-state, and tap feedback
```
Layout:     Fixed bottom, full-width, 56px height, 5 equal-width MobileNavItem
            slots (Dashboard, Meetings, Commitments, Action Items, More),
            safe-area-inset-bottom padding respected on iOS (a detail easy
            to miss and immediately obvious on a real device with a home
            indicator)
Active state: Icon + label both shift from muted-60% to full foreground
            color — NO background pill, NO underline bar beneath the icon
            (both are common bottom-nav conventions this product explicitly
            rejects, because they'd introduce a new "active indicator" visual
            idiom distinct from the Sidebar's own active-state treatment,
            which uses a subtle background fill, not a pill or bar). Instead,
            MobileNavItem's active state reuses the EXACT same "subtle
            background fill on the icon's hit-area" treatment as SidebarNavItem
            (Day 26) — confirmed via direct visual diff, not just "looks similar"
Tap feedback: 80ms opacity dip to 0.7 on press (`:active` / touch-start),
            reverting on release — the same tactile-confirmation principle
            applied to Day 44's Enter-key button press, now applied to
            touch targets specifically, since touch has no native hover state
            to fall back on for "did my tap register"
"More" item: Opens MobileDrawer (§4.2), NOT a 6th-item overflow sheet of its
            own — "More" and the hamburger-triggered Drawer are literally the
            same destination, reached two ways (bottom-nav tap, or Topbar
            hamburger), confirmed to open the identical component instance
            logic, never two different "more menu" implementations
```

### 4.2 `MobileDrawer` — slide-in, focus trap, dismissal
```
Entrance:   translateX(-100%)→0 + backdrop opacity 0→1, 160ms ease-out —
            same duration as a Sheet's entrance (Day 41 §4.3's 160ms
            constant, reused here for a left-edge slide instead of a
            right-edge one, but identical timing token)
Exit:       100ms (matching the platform-wide "exits are brisk" rule
            established Day 41 §4.3, now confirmed to extend to the Drawer)
Focus trap: First focusable element (team switcher trigger) receives focus
            on open; Tab cycles only within the Drawer's content; Esc closes
            and returns focus to whichever trigger opened it (bottom-nav
            "More" item or Topbar hamburger) — today's audit explicitly
            tests BOTH entry points return focus correctly, not just one
Dismissal:  Esc, backdrop click, OR route change (navigating to a new page
            via a Drawer link auto-closes the Drawer instead of leaving it
            open behind the new page — checked explicitly, since this is
            the one dismissal trigger most likely to be forgotten in a
            naive implementation)
```

### 4.3 `TopbarOverflowMenu` — the collapse, and why it preserves capability
```
Trigger:    Viewport crosses below 640px (CSS media query driven, not JS
            resize-listener driven, for zero layout-thrash risk on resize)
Effect:     GlobalSearch's visible trigger (the "⌘K" pill button) and
            NotificationBell's icon both unmount from their normal Topbar
            positions and are replaced by a single overflow icon-button;
            clicking it opens a small DropdownMenu with two items: "Search"
            (which, when clicked, programmatically opens the SAME command
            palette ⌘K would open — not a separate mobile search UI) and
            "Notifications" (opens the SAME NotificationBellDropdown, Day
            43, anchored to the overflow button instead of the original
            Bell icon position)
Keyboard parity (the critical claim, verified not assumed): pressing ⌘K
            on a sub-640px viewport STILL opens the command palette
            directly, bypassing the overflow menu entirely — the overflow
            button is a VISIBLE-TRIGGER convenience for touch, never the
            keyboard shortcut's only path. Today's QA forces this exact
            scenario: throttle viewport to 375px, press ⌘K with a physical/
            simulated keyboard event, confirm the palette opens with zero
            dependency on the overflow menu's mounted state.
Badge:      The unread-count Badge (Day 43) relocates from the Bell icon
            to a small dot on the overflow button itself when collapsed —
            same Poppins-numeral treatment is dropped in favor of a plain
            dot at this size (a 2-digit Poppins count doesn't fit legibly
            on an icon this small; a dot preserves "there's something here"
            without false precision at a size where precision can't be read anyway)
```

### 4.4 `ResponsiveRow` — the one collapse implementation, inherited by five components
```
Above 640px: Renders its full multi-column grid exactly as already built
            (MeetingCard's existing columns, CommitmentCard's existing
            columns, etc. — ResponsiveRow doesn't change anything here)
Below 640px: Re-flows to: Line 1 = primary identifier (title/name, full
            width, Inter 500, truncates with ellipsis) / Line 2 = up to 3
            secondary metadata chips inline (status Badge + one or two
            most-important fields, e.g., due date for Commitments, role
            for Members) — implemented via CSS Grid `grid-template-areas`
            swapping at the breakpoint, NOT a JS-conditional that renders
            two entirely different JSX trees (the same DOM structure
            reflows via CSS alone wherever possible, which is both cheaper
            and guarantees the row's click target, ARIA attributes, and
            keyboard behavior never silently diverge between the two layouts)
Click target: identical whole-row click area at every breakpoint — this
            is the one property that must NEVER change between desktop and
            mobile, since "rows are clickable" is one of this build's core
            stated UI principles ("every item clickable")
Transition: NO animation on the breakpoint reflow itself (resizing a
            browser window or rotating a device should reflow instantly,
            not animate — animating a CSS Grid template change on resize
            would look like a glitch, not a polish)
```

### 4.5 `RouteErrorFallback` — the "Try again" recovery interaction
```
Trigger:    Any uncaught error within a route segment (Next.js error.tsx
            boundary)
Render:     Centered, single-column content (matches EmptyState's visual
            family per the spec's explicit requirement) — short Inter
            headline ("Something went wrong loading this page"), one muted
            sentence, a single "Try again" button
Try again:  Calls the error boundary's own `reset()` function (Next.js's
            built-in mechanism) — re-renders the segment fresh. Button
            shows the standard label-swap pending state ("Retrying…", 120ms
            crossfade, no spinner) for the brief moment before either (a)
            the segment recovers and the fallback unmounts, or (b) the
            error recurs and the fallback re-renders with an incremented
            internal "attempt count" used ONLY to decide whether to show a
            secondary "Go to dashboard" escape-hatch link after 2 failed
            retries (never trapping a user in an infinite retry loop with
            no way out)
NEVER:      a full white/blank screen at any point in this sequence — even
            the instant between error and fallback-render is covered by
            React's own synchronous error-boundary render swap, confirmed
            today by literally forcing errors and watching for any single
            blank frame via screen recording at high frame rate, not just
            "it looked fine"
```

### 4.6 `WidgetErrorFallback` — contained failure, distinct from route failure
```
Render:     Deliberately SMALLER and quieter than RouteErrorFallback — a
            compact inline message sized to fit within whatever widget's
            bounding box it's replacing (e.g., one chart on the Analytics
            page: "Couldn't load this chart" + small "Retry" text link,
            NOT a full-height centered block, since the surrounding page
            and its other widgets must visibly remain intact around it)
Isolation:  Today's audit specifically forces an error inside ONE chart on
            a multi-chart Analytics page and confirms the OTHER charts on
            the same page continue rendering and remain interactive —
            this is the literal, hands-on verification of the "Fail
            Gracefully" principle, not a code-review assumption
Distinction from RouteErrorFallback restated: a route-level failure means
            "this whole page can't do its job," a widget-level failure
            means "this one part of an otherwise-working page can't do
            its job" — conflating the two into one fallback component
            would force every widget failure to either look alarmingly
            page-sized or every page failure to look unhelpfully small;
            keeping them separate components is the correct fix, not a
            redundant one
```

### 4.7 Skeleton-to-content handoff — the zero-CLS swap
```
Trigger:    Real data resolves (TanStack Query transitions from `isLoading`
            to data-present)
Effect:     Skeleton unmounts and real content mounts in the SAME render
            pass — no separate fade-out-skeleton-then-fade-in-content
            sequence, no animation at all on this specific transition,
            because any transition animation here would itself draw
            attention to a swap that should be imperceptible. The entire
            point of dimension-matching (§7) is that this swap is JUST a
            DOM replacement with literally nothing for the eye to notice —
            "zero CLS" and "zero motion" are the same goal stated twice
Verification: this is the one micro-interaction on today's list defined
            entirely by ABSENCE — no animation, no flash, no shift. Today's
            new `skeleton-dimension.spec.ts` (§2) is what actually proves
            this claim mechanically rather than relying on a human eyeballing
            a screen recording, which is the appropriate level of rigor for
            a claim this foundational to the product's perceived speed
```

---

## 5. Error Boundary & Route Coverage Inventory

| Route segment | `error.tsx` present pre-Day-45? | Action today |
|---|---|---|
| `/dashboard` | ✅ (Day 26) | Audit copy matches `RouteErrorFallback` standard |
| `/meetings`, `/meetings/[id]` | ✅ (Day 28/29) | Audit + confirm `[id]` segment's error doesn't swallow parent nav |
| `/commitments`, `/commitments/[id]` | ✅ (Day 33) | Audit |
| `/action-items`, `/action-items/[id]` | Partial — list had one, detail (Day 36) did not | **Fill today** |
| `/team`, `/team/[memberId]` | List had one (Day 37); profile (Day 38) did not | **Fill today** |
| `/analytics` | Missing entirely | **Fill today** — and wrap each chart individually in `WidgetErrorFallback` per §4.6 |
| `/intelligence` | Missing entirely | **Fill today** |
| `/settings/profile`, `/team`, `/members`, `/integrations`, `/billing`, `/notifications`, `/security` | Mixed — profile/team/members/security had one from Day 40; integrations/billing/notifications (Days 41–43) did not yet have their own | **Fill the three missing today** |
| `/onboarding/*` | Deliberately none (Day 44, §7 of that plan — onboarding's own simpler honest-failure states substitute) | **Confirmed correct as-is, no action** |

This table is the actual "audit" referenced throughout the spec — rather than a vague "go check everything," today's plan names the specific gaps inherited from the exact days that created them, so the work is traceable to its origin rather than rediscovered from scratch.

---

## 6. Component-by-Component Build Notes

### 6.1 `MobileNavItem.tsx`
- Takes `{ href, icon, label, isActive }` — `isActive` computed once in `MobileNav` via `usePathname()` matching, passed down rather than each item independently subscribing to the router (avoids 5 redundant re-render triggers on every navigation for what's fundamentally one piece of derived state).

### 6.2 `MobileDrawerHeader.tsx`
- Reuses `SidebarTeamSwitcher` (Day 26) internally rather than building a second team-switcher UI for mobile — confirms the component generalizes correctly inside a Drawer's narrower context, identical to how `TeamSlugField` was confirmed to generalize across Settings and Onboarding on Day 44.

### 6.3 `RouteErrorFallback.tsx` vs `WidgetErrorFallback.tsx`
- Both consume the same underlying error object shape and the same `reset`/`retry` callback contract, but render at deliberately different scales and with deliberately different escape-hatch logic (route-level gets the "Go to dashboard" link after repeated failures; widget-level never does, since the surrounding page already provides navigation). Today's explicit decision to keep these as two files, not one component with a `size` prop, is because their *content strategy* differs (route failures explain a whole-page problem; widget failures explain a specific, nameable thing), not just their visual size — a single component with a size prop would tempt future engineers into treating them as interchangeable, which they are not.

### 6.4 `ResponsiveRow.tsx`
- This is today's single largest refactor: `MeetingCard`, `CommitmentCard`, `ActionItemRow`, `MemberRow`, and `InvoiceRow` are each updated to render their content INSIDE a `ResponsiveRow` wrapper that owns the breakpoint-driven grid-template swap, rather than each component independently implementing its own `@media` query. Each consuming component now only needs to declare which of its existing fields map to "primary identifier" vs. "secondary metadata chips" (typically a 2–3 line prop mapping, not a rewrite) — the actual responsive mechanics live in exactly one place.

### 6.5 `Topbar/TopbarOverflowMenu.tsx`
- Receives `{ onOpenSearch, onOpenNotifications, unreadCount }` as props from `Topbar.tsx` — it does not independently call `useUnreadCount()` or reach into the command-palette's internals itself, keeping it a dumb presentational composition of a `DropdownMenu`, consistent with how every other menu-trigger component in this product is built to receive behavior via props rather than reaching for global state directly.

### 6.6 `GlobalNotFound.tsx`
- Audited today specifically for visual-family consistency with `EmptyState` (Day 26) and the new `RouteErrorFallback` — all three "nothing/something's wrong here" surfaces should share enough visual DNA (centered column, Inter copy, single muted illustration-free presentation, one action link/button) that a user can't tell from feel alone whether they hit a 404, an empty list, or a caught error — the *meaning* differs, the *visual register* should not.

---

## 7. Loading Skeleton Dimension Audit — Inventory

| Component | Skeleton file | Dimension-match status pre-Day-45 |
|---|---|---|
| `MeetingList` | `MeetingListSkeleton` | ✅ built carefully Day 28 |
| `CommitmentTracker` | `CommitmentTrackerSkeleton` | ✅ Day 33 |
| `ActionItemList` | `ActionItemListSkeleton` | ✅ Day 36, but built BEFORE the bulk-select checkbox column existed — **re-verify column width today** |
| `MemberTable` | `MemberTableSkeleton` | ✅ Day 37 |
| `AnalyticsDashboard` charts | none existed | **Build today** — chart skeletons are simple bordered boxes at the chart's exact rendered aspect ratio, no fake bar/line shapes drawn inside (a skeleton chart pretending to show fake data is a step too far into "decoration," consistent with this build's anti-illustration stance even for loading states) |
| `InvoiceTable` | none existed (Day 42 shipped without one — gap inherited) | **Build today** |
| `IntegrationsGrid` | none existed (Day 41 gap) | **Build today** |
| `NotificationPreferencesForm` matrix | none existed (Day 43 gap) | **Build today** |

Every newly-built skeleton today is verified against `skeleton-dimension.spec.ts` (§2) before being marked complete — "built" and "verified zero-CLS" are treated as two separate checklist items, not one.

---

## 8. Full Design-Language Self-Audit — The Hunt List

```
GRADIENT CHECK         grep all CSS/Tailwind classes for `gradient` — any match is a violation
BOUNCE/SPRING CHECK     audit every Framer Motion config and CSS transition timing-function for
                        anything resembling a spring/bounce curve (cubic-bezier with overshoot,
                        or explicit `type: 'spring'`) — all motion in this product is ease-out only
CHAT-BUBBLE CHECK       visually inspect AIChatPanel/ChatMessage (if any exist by Day 45) and any
                        comment/note-style UI for rounded-asymmetric "speech bubble" shapes —
                        this product's message-adjacent UI should read as plain text rows, never
                        as chat bubbles, even in the AI Intelligence surfaces
TRAFFIC-LIGHT CHECK     re-verify EVERY Badge/status component across the whole app one more time
                        (this is the fourth time this exact check has appeared across Days 41-43's
                        individual audits — today is the cumulative, whole-product pass) for any
                        red/yellow/green severity coloring that may have crept in
EMPTY-ILLUSTRATION CHECK audit every EmptyState-class component for accidental illustration/emoji
                        creep — confirmed text-only, consistent with Day 39/43's explicit precedent
EMOJI-IN-COPY CHECK     grep all UI copy strings (component files + i18n/content files if any)
                        for emoji characters — flag and remove any found in functional UI text
                        (this rule does not apply to genuinely content-authored fields like a
                        user's own meeting title, only to product-authored UI copy)
```

Each check above is run as a literal pass over the codebase today (grep/visual-audit as appropriate), not inferred from "we don't think we did that" — the entire premise of Day 45 is that assumptions get replaced with verification.

---

## 9. Accessibility & Keyboard Pass (Mobile-Specific Additions)

```
- MobileNav items have a minimum 44×44px touch target (Apple/WCAG-recommended
  minimum), confirmed via actual measured hit-area, not just visual icon size
- MobileDrawer's focus trap re-tested specifically on a touch-only device
  simulation (no physical keyboard) to confirm VoiceOver/TalkBack swipe-
  navigation stays contained within the Drawer while open
- TopbarOverflowMenu's DropdownMenu items are reachable via the same
  swipe-navigation gesture order a screen-reader user would expect, matching
  every other DropdownMenu in the product — no special-cased gesture handling
  introduced for this one collapsed menu
- ResponsiveRow's mobile-collapsed layout confirmed to preserve identical
  `aria-label`/accessible-name content to its desktop layout — collapsing
  visual columns must never silently drop information from the accessible
  tree, only from the visual one
```

---

## 10. QA / End-of-Day Checklist

```
BREAKPOINTS
  [ ] All four breakpoint tiers (§3) verified independently — specifically the
      640–767px "Drawer + full table" tier, the one most likely to have been
      conflated with the 768px sidebar threshold before today's fix
  [ ] Every (dashboard) route renders correctly at 375px, 640px, 768px, 1024px —
      four checkpoints, not three, matching the corrected contract

RESPONSIVE ROWS
  [ ] ResponsiveRow's stacked layout verified across all five consuming components
      (Meeting/Commitment/ActionItem/Member/Invoice) with IDENTICAL breakpoint
      behavior — confirmed via the shared component, not five independent checks
      that happen to agree
  [ ] Whole-row click target confirmed unchanged between desktop and mobile layouts
      for all five row types
  [ ] No animation fires on the breakpoint reflow itself (resize/rotate test)

MOBILE NAV & DRAWER
  [ ] MobileNav active-state visually matches SidebarNav's treatment exactly
      (background-fill, no pill/underline) — direct side-by-side screenshot diff
  [ ] MobileDrawer focus-trapped, closes on Esc/backdrop/route-change, confirmed
      from BOTH entry points (bottom-nav "More" and Topbar hamburger)
  [ ] 44×44px minimum touch target verified on all MobileNav items

TOPBAR COLLAPSE
  [ ] TopbarOverflowMenu correctly absorbs Search+Bell below 640px, restores
      them above 640px, with zero layout jump at the exact threshold
  [ ] ⌘K fires the palette directly at 375px viewport via simulated keyboard
      event, independent of the overflow menu's open/closed state
  [ ] Unread badge correctly switches from Poppins count to plain dot when
      collapsed into the overflow trigger

ERROR BOUNDARIES
  [ ] Every route in the §5 inventory has a working error.tsx — table fully closed out
  [ ] WidgetErrorFallback isolation confirmed on Analytics: forcing one chart to
      error leaves sibling charts fully functional
  [ ] RouteErrorFallback's "Try again" successfully recovers on a transient
      failure; "Go to dashboard" escape-hatch appears only after repeated failures

SKELETONS
  [ ] All skeletons in the §7 inventory exist and pass skeleton-dimension.spec.ts
  [ ] Chart skeletons confirmed to be plain bordered boxes, not fake data shapes
  [ ] Skeleton-to-content handoff produces zero visible flash/shift on a
      representative screen per module, confirmed via the new automated spec

DESIGN-LANGUAGE AUDIT
  [ ] All six hunt-list checks (§8) completed across the full Days 26–44 surface
      area; any violations found are listed and fixed same-day, not deferred
  [ ] typography-audit.spec.ts passes — Plus Jakarta Sans/Inter/Poppins usage
      confirmed to match the locked rules with zero drift, enforced in CI going forward

CI
  [ ] mobile-nav.spec.ts, responsive-tables.spec.ts, error-boundaries.spec.ts,
      typography-audit.spec.ts, and skeleton-dimension.spec.ts all pass in CI —
      five specs, not three, reflecting today's expanded automated-verification scope
```

---

## 11. What Phase 4 (Day 46 Onward) Inherits From Today

- `ResponsiveRow` is now the mandatory base for any future dense list — the AI Pipeline's own surfaces (if any list-shaped UI emerges from Days 46–55) build on this from day one rather than reimplementing breakpoint logic a sixth time
- `RouteErrorFallback` / `WidgetErrorFallback`'s explicit two-tier distinction is the template for how any new Phase 4/5 surface should think about failure scope before writing its first error boundary, not after
- Two CI-enforced regression guards (`typography-audit.spec.ts`, `skeleton-dimension.spec.ts`) now sit in the pipeline permanently — any Phase 4/5 PR that introduces a stray Plus Jakarta Sans label or an unmatched skeleton dimension fails CI automatically, rather than waiting for a future "Day 45-style" audit to catch it months later
- The corrected four-tier breakpoint contract (§3), with named constants in `AppShell.tsx`, is the single reference point for all future responsive work — no future component should ever hardcode a raw breakpoint pixel value again

---

*Document: BUILD-PLAN-DAY-45 | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3, final day) — Hardening Pass, Closes Phase 3*
*Typography: zero new rules — today verifies Plus Jakarta Sans / Inter / Poppins usage matches Days 26–44 exactly, with CI enforcement added*
