# Vocaply — Day 42 Master Build Plan
## Settings → Billing: Plan, Usage, Stripe Portal, Invoices, Plan-Limit Banners
> Principal Frontend Architect Edition · Industry-Grade · "Clear as a Phone Bill" UI · Zero Dark Patterns
> Continues Day 41's Settings pattern language. No new color. No new motion idiom. Every number trusted.

---

## 0. Reading This Document

Billing is the one page in the whole product where a user's *literal money* is on screen. The bar isn't "delightful" — it's **unambiguous**. Every micro-interaction documented below exists to remove doubt, never to add charm. By the end of today, `/settings/billing` should answer "what am I on, how close am I to the limit, where's my last invoice" in under two seconds of looking, with zero moment where the user has to wonder "did that actually save / did that actually redirect / is that number accurate right now."

---

## 1. Typography System for Today's Surface (Locked, Inherited from Day 41)

```
FONT ROLES — UNCHANGED FROM DAY 41, APPLIED TO BILLING'S CONTENT
──────────────────────────────────────────────────────────────────────────
Plus Jakarta Sans   → Page title ("Billing"), Sheet titles ("Compare plans"),
                       CurrentPlanCard's plan name ("Growth") — the ONE
                       place on this page a plan name gets heading treatment
                       Weight: 600 only. Letter-spacing -0.01em.

Inter                → Everything else: descriptions, labels, table cells,
                       badge text, button labels, AlertDialog body copy,
                       field hints, invoice line items
                       Weight: 400 (body) / 500 (labels, emphasis, table headers)

Poppins              → Reserved for the page's actual MONEY and COUNT numerals:
                       price ("$99/mo"), usage fractions ("34 / 120"),
                       invoice amounts ("$99.00"). Always paired with
                       tabular-nums. This is Poppins' single clearest job
                       in the entire product — a billing page is the one
                       place numeric confidence matters more than anywhere
                       else, and Poppins' rounded, slightly friendlier
                       numeral shapes read as more "human-readable receipt"
                       than Inter's numerals do at a glance.
```

### Concrete Type Scale for This Page

```
ELEMENT                                   FONT                  SIZE   WEIGHT  LINE-HEIGHT
──────────────────────────────────────────────────────────────────────────────────────────────
Page title ("Billing")                    Plus Jakarta Sans     20px   600     28px
CurrentPlanCard plan name ("Growth")       Plus Jakarta Sans     18px   600     24px
CurrentPlanCard price ("$99")              Poppins               24px   500     28px (tabular-nums)
CurrentPlanCard price suffix ("/mo")       Inter                 13px   400     20px (muted-60%)
"Renews on {date}"                         Inter                 12px   400     16px (muted)
Section label ("Usage this period")        Plus Jakarta Sans     13px   600     20px (uppercase,
                                                                                   +0.04em tracking, muted)
UsageProgressRow label ("Meetings")        Inter                 13px   500     20px
UsageProgressRow fraction ("34 / 120")      Poppins               12px   500     16px (tabular-nums)
Badge text (plan status, invoice status)   Inter                 11px   500     16px (caps, +0.02em)
InvoiceTable header cells                  Inter                 12px   500     16px (muted, uppercase)
InvoiceTable date/description cells        Inter                 13px   400     20px
InvoiceTable amount cells                  Poppins               13px   500     20px (tabular-nums)
PlanLimitBanner / PaymentFailedBanner text Inter                 13px   400     20px
PlanComparisonSheet table — feature names  Inter                 13px   400     20px
PlanComparisonSheet table — plan price     Poppins               16px   500     24px (tabular-nums)
AlertDialog body copy (Cancel flow)        Inter                 13px   400     20px
```

**Why money gets its own font treatment:** Inter is excellent for UI chrome, but its numerals at small sizes can read slightly clinical for a number a human is mentally checking against their bank statement. Poppins' geometric-but-rounded numeral set is used in this product in exactly three contexts — commitment scores (Day 34), connection counts (Day 41), and now money/usage (today) — every one of them a place where a *number itself* is the entire point of the UI element it's inside. That consistency is the rule; it's never used for prose, ever.

---

## 2. File & Component Architecture

```
app/(dashboard)/settings/billing/
  page.tsx                                       ← RSC — parallel fetch: subscription, usage,
                                                     recent invoices (first page only, client
                                                     paginates further)
  loading.tsx                                    ← Skeleton matching CurrentPlanCard +
                                                     UsageBreakdown + InvoiceTable exactly

features/billing/
  components/
    CurrentPlanCard.tsx
    PlanStatusBadge.tsx                          ← Active / Trialing / Past due / Cancelling —
                                                     neutral badge, reused badge contract from Day 41
    UsageBreakdown.tsx
    UsageProgressRow.tsx
    UsageThresholdLink.tsx                       ← The "Upgrade →" text-link that appears at 90%+
    PlanLimitBanner.tsx                          ← PROMOTED — moved here from ad hoc Day 32/37 usage
    BillingPortalButton.tsx
    InvoiceTable.tsx
    InvoiceTableHeader.tsx
    InvoiceRow.tsx
    InvoiceStatusBadge.tsx
    InvoiceRowDetail.tsx
    InvoiceDownloadButton.tsx                     ← Icon-only, inline state (idle → fetching → done)
    PlanComparisonSheet.tsx
    PlanComparisonTable.tsx
    PlanComparisonColumn.tsx                      ← Single plan's column, current-plan variant prop
    CancelPlanAlert.tsx
    PaymentFailedBanner.tsx

  hooks/
    useBilling.ts
    usePlans.ts
    useCheckout.ts
    useBillingPortal.ts
    useInvoices.ts
    useDownloadInvoice.ts
    useCancelSubscription.ts

  data/
    plan-features.config.ts                       ← Typed feature-comparison matrix: one source
                                                       for PlanComparisonTable AND the pricing
                                                       landing page (Day 84) when it's built —
                                                       written today so neither page invents its
                                                       own copy of "what's in each plan"

shared/components/feedback/
  PlanLimitBanner.tsx → MOVED HERE (was ad hoc in features/meetings + features/team)
  OfflineBanner.tsx   → REFACTORED: extract shared `TopBanner` shell, see §6.10

shared/components/data-display/
  DataTableEmptyRow.tsx
  DataTable/* (existing primitives — first production billing usage today)

shared/lib/cache/
  query-keys.ts                                   ← EXTENDED: billing.subscription(teamId),
                                                       billing.usage(teamId), billing.invoices(teamId, cursor),
                                                       billing.plans()
```

### Why `plan-features.config.ts` matters beyond today

Exactly like Day 41's `providers.config.ts`, this is a deliberate "write the data once, render it twice" decision. `PlanComparisonTable` (this page, settings-context, dense) and the future pricing page (Day 84, marketing-context, persuasive cards) will read from the **same typed array** of `{ feature, free, starter, growth, business, enterprise }` rows. If this data lived inline in `PlanComparisonSheet.tsx` today, Day 84 would either duplicate it (and the two pages would silently drift apart the first time pricing changes) or someone would have to do an awkward refactor under deadline pressure two months from now. Writing it once today, even though only one consumer exists yet, is the correct call for a 25-year-engineer's sense of "where does this actually belong."

---

## 3. Layout Anatomy — Pixel-Level

```
PageContainer (max-width: 760px, identical to Day 41's Integrations page)
  └─ "Billing" page title (Plus Jakarta Sans 20/600)
  └─ PaymentFailedBanner  (conditional — only renders if subscription.status === 'past_due')
  └─ CurrentPlanCard                                          ← the ONE Card on this page
  └─ Separator (24px margin)
  └─ Section label: "Usage this period"
       └─ UsageBreakdown
            └─ UsageProgressRow × 3  (Meetings, Members, Storage)
  └─ Separator (24px margin)
  └─ Section label: "Invoices"           [View all →]  (if >10 invoices exist)
       └─ InvoiceTable  (first 10 rows, cursor-paginated "Load more" below, no infinite scroll
                          here — invoices are a bounded, deliberate-browsing list, not a feed)
```

### `CurrentPlanCard` — exact anatomy

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Growth                                                      [Active]     │  ← Plus Jakarta Sans 18/600 + PlanStatusBadge
│  $99 /mo                                                                   │  ← Poppins 24/500 price + Inter /mo suffix
│  Renews on June 24, 2026                                                   │  ← Inter 12/400, muted
│                                                                            │
│  [Manage billing]              Compare plans →                            │  ← primary button + quiet text link
└────────────────────────────────────────────────────────────────────────────┘
```
Card padding: 20px. Border: 1px `--border`, radius matching every other Card-class surface in the product (locked token, not redefined here). **No shadow** — this product's Cards are flat, bordered, never elevated; a billing card is not the place to introduce a new depth treatment.

### `UsageProgressRow` — exact anatomy

```
Meetings                                                            34 / 120
[████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]
```
`grid-template-columns: 1fr auto; gap: 8px` for the label/fraction line, then the `Progress` bar full-width beneath at `4px` height (identical height to `CommitmentRateBar`, Day 37 — confirmed, not re-measured from scratch). Row vertical rhythm: 12px between rows.

---

## 4. Micro-Interactions — Full Catalogue

### 4.1 Usage bar fill on load
```
Trigger:    Initial mount, data arrives (RSC-hydrated, so usually instant — no loading flash
            in the common case; loading.tsx skeleton only shows on a genuine cold/slow fetch)
Effect:     Progress bar fills from 0 to its true value over 280ms ease-out, ONE TIME on
            mount only — not on every re-render, not on every refetch
Why a fill animation at all (the one animated bar on this page):
            A billing usage bar is the single number on this entire surface where "this
            represents real consumption of something finite" benefits from a brief, honest
            motion — it's the digital equivalent of a gauge needle settling. It is explicitly
            NOT decorative; it never replays once mounted, and it never animates on a
            background refetch (which would misleadingly suggest usage "jumped").
Implementation note: gate the animation behind a `hasAnimatedOnce` ref per row, not a
            CSS transition on the `value` prop directly — a naive CSS transition would
            replay every time TanStack Query silently revalidates the number in the
            background, which is the exact bug that makes a UI feel twitchy/untrustworthy.
```

### 4.2 90% threshold crossing → "Upgrade →" link
```
Trigger:    `used / limit >= 0.9` computed client-side from already-fetched data
Effect:     The row's right-aligned fraction text ("110 / 120") gets a trailing inline
            text link "· Upgrade →" appended via a 120ms opacity fade-in — no layout
            shift (the link occupies space that's reserved at all usage levels via
            `min-width` on that slot, just invisible/zero-opacity below 90%, so crossing
            the threshold never causes the row's other content to jump)
Why no color: this is the textbook moment a less disciplined build adds a red bar —
            we don't. The bar stays the same accent fill at 100% width; the only signal
            is the word "Upgrade" appearing, which is both more actionable (a literal
            link) and consistent with "severity via words, not color" carried from Day 41.
```

### 4.3 Unlimited-plan row rendering
```
Effect:     Bar renders as a fully-filled, static accent bar (100% width, no animation —
            §4.1's fill-on-mount animation is explicitly skipped for Unlimited rows, since
            animating "filling up to unlimited" is a logical non-sequitur) + "Unlimited"
            replaces the fraction text, in the same Poppins styling slot so the row's
            grid never reflows between plan tiers
```

### 4.4 `BillingPortalButton` click → external redirect
```
Trigger:    Click
Sequence:   1. Button label crossfades "Manage billing" → "Redirecting…" (120ms, same
               text-swap pattern as Day 41's OAuth button — one consistent "we're about
               to leave this tab" idiom across the whole product, not two different ones)
            2. Button becomes disabled the instant it's clicked (prevents a double-click
               from firing two Checkout-session-creation mutations — this one is backed by
               an Idempotency-Key on the mutation itself as a second line of defense, since
               a network retry must never create two Stripe sessions)
            3. `window.location.href` navigates to the Stripe-hosted portal URL returned
               by the mutation — full-tab, never a popup or iframe (Stripe explicitly
               disallows portal-in-iframe, and a popup is the same anti-pattern called
               out on Day 41)
Failure:    If the mutation itself fails (network/5xx) before redirect occurs, button
            re-enables, label reverts, and a row-anchored inline error appears directly
            beneath the button — not a toast, consistent with Day 41 §4.7's anchoring rule
```

### 4.5 Invoice row expand/collapse (`Collapsible`, first real use beyond FAQ)
```
Trigger:    Click anywhere on an InvoiceRow EXCEPT the trailing download icon-button
            (which has its own independent click target and stopPropagation, identical
            discipline to every row-with-trailing-action across the product)
Effect:     Height auto-animates 0→auto via the Collapsible primitive's built-in CSS
            variable approach (`--radix-collapsible-content-height`), 160ms ease-out —
            same duration as a Sheet entrance, deliberately, since this is conceptually
            "a small Sheet that lives inline" rather than a full-blown drawer
Chevron:    A small chevron icon at the row's leading edge rotates 0deg→90deg in lockstep
            with the expand (160ms, same easing) — the ONLY rotating-icon micro-interaction
            on this page, and it's a single, purposeful, universally-understood affordance
            (not decorative spin, it's literally pointing at what just happened)
Multi-open: Multiple invoice rows can be expanded simultaneously — this is NOT an
            accordion-exclusive pattern. Each invoice is independent financial information;
            forcing only-one-open would actively hurt a user trying to compare two invoices
            side by side, which is a real, common billing-page task.
```

### 4.6 `InvoiceDownloadButton` — inline state, no toast
```
States:     idle (download icon) → fetching (icon dims to 50% opacity, no spinner —
             same no-spinner discipline as every inline state in this build) → on success,
             the browser's native download/save dialog takes over (this is a real file
             download, not an in-app preview, so "success" in-UI is just reverting to idle
             the instant the browser accepts the blob)
Failure:    icon briefly shows a small inline tooltip-style error ("Couldn't download —
             try again") anchored at the button, auto-dismiss after 4s
```

### 4.7 `PlanComparisonSheet` open + current-plan column highlight
```
Trigger:    "Compare plans →" link click
Sheet:      Wider than a typical settings Sheet (this one needs room for 5 columns ×
             ~10 feature rows) — uses the Sheet primitive's `lg` width variant, NOT a
             full Dialog/Modal, preserving the platform-wide "Sheet preserves context"
             rule even for a comparison table that could tempt a less disciplined build
             into "this needs a full modal, it's complex" — it doesn't; width solves it
Highlight:  Current plan's column gets `background: var(--muted)` at low opacity,
             applied instantly on mount (no animated "highlight sweep" — it's simply
             always-on for that column, a static fact, not an event)
Row hover:  Hovering a FEATURE ROW (not a column) highlights that row across all 5
             columns simultaneously (subtle background, 100ms linear) — this is the
             one piece of cross-column affordance that genuinely helps comparison-table
             scanning and is a well-established, non-decorative pattern (same one Stripe's
             own pricing tables use internally)
Selection:  Clicking a non-current plan's "Select" button at the column footer triggers
             useCheckout → Stripe Checkout redirect, same label-swap + disable pattern as §4.4
```

### 4.8 `CancelPlanAlert` flow
```
Trigger:    "Cancel plan" — deliberately placed at the bottom of PlanComparisonSheet's
             footer area as a quiet text link, NOT a button on CurrentPlanCard itself —
             cancellation should require one extra deliberate navigation step beyond the
             page's primary surface, which is a legitimate, non-dark-pattern friction
             (contrast with dark patterns: this is ONE extra click to a clearly-labeled
             destination, not a hidden link or a maze — the difference matters)
AlertDialog: Default-focused button is "Keep my plan" (the non-destructive option),
             identical safety convention to Day 41's Disconnect flow. Body copy states,
             in plain Inter prose, exactly what happens: downgrade timing (at period end,
             not immediately), what's retained, what stops working — sourced from a
             single config string per plan tier so the copy can't silently drift from
             what the backend actually does
No animation beyond the standard AlertDialog open — this is the most serious single
             action available on this page; it earns zero "flair," only clarity.
```

### 4.9 `PaymentFailedBanner` — appearance and dismissal
```
Mount:      Slides down from the very top of the viewport, 140ms ease-out (slightly
             slower than Day 41's row-level animations — this is a page-level alert,
             motion duration should scale slightly with the "size" of the thing entering)
Dismiss:    Has a close (×) affordance UNLIKE OfflineBanner (which auto-dismisses only
             on reconnect) — payment-failed is a state the user might legitimately want
             to acknowledge-and-defer rather than act on immediately, so manual dismiss
             is appropriate here; it reappears on next session load until the underlying
             subscription status actually changes, never permanently suppressed by a
             local dismiss flag (a real unpaid invoice should never be permanently
             hide-able by accident)
Shared shell: extracted into `TopBanner` (see §6.10) so this and OfflineBanner are
             provably the same visual family, not two similar-looking but separately
             maintained components
```

### 4.10 ⌘K actions firing
```
"Manage billing"   → same Redirecting… label-swap pattern fires even from the palette —
                      the palette closes immediately on selection (never waits around for
                      a redirect), consistent with Day 41's "palette triggers and gets out
                      of the way" principle
"View invoices"    → scrolls/navigates to the Invoices section if already on this page,
                      or navigates to /settings/billing#invoices if elsewhere — no separate
                      page exists for invoices alone, by design (today's invoice list lives
                      inside Billing, not as its own settings tab)
"Compare plans"    → opens PlanComparisonSheet directly, same as the in-page link
```

---

## 5. The Plan-Status & Invoice-Status Badge Matrices

### `PlanStatusBadge` (subscription-level)

| Status | Badge Text | Notes |
|---|---|---|
| `active` | `Active` | default, neutral filled badge |
| `trialing` | `Trialing` | same neutral style — NOT a special "promo" color |
| `past_due` | `Past due` | same neutral style; severity communicated by the word + the `PaymentFailedBanner` above it, never by badge color |
| `cancel_at_period_end: true` | `Cancelling` | shown instead of `Active` once a cancellation is scheduled — single source of truth so the badge never contradicts the banner/card copy |

### `InvoiceStatusBadge`

| Status | Badge Text |
|---|---|
| `paid` | `Paid` |
| `open` | `Open` |
| `void` | `Void` |
| `uncollectible` | `Uncollectible` |

**Identical rule to Day 41:** every state above shares the exact same badge container styling. The QA pass (§9) explicitly screenshots all eight states (4+4) side-by-side to confirm pixel-identical chrome.

---

## 6. Component-by-Component Build Notes

### 6.1 `CurrentPlanCard.tsx`
- The single `Card` (stat-tile variant) on this page, per the locked design language — confirmed there is no second Card anywhere else on `/settings/billing` (Usage and Invoices are plain sectioned lists, not Cards, a distinction worth re-verifying explicitly since "just wrap it in a Card" is the easiest default to slip into).
- Renews-on date uses `Intl.DateTimeFormat` with the user's resolved timezone (not UTC, not the server's timezone) — billing dates displayed in the wrong timezone is a top-tier source of confused support tickets industry-wide; this is checked explicitly, not assumed correct because "dates are dates."

### 6.2 `UsageBreakdown.tsx` / `UsageProgressRow.tsx`
- `UsageProgressRow` takes `{ label, used, limit, threshold = 0.9 }` — `threshold` is a prop, not hardcoded, so a future resource type with a different sensible warning point doesn't require touching this file.
- Storage row formats its numbers via a shared `formatBytes()` util (GB precision to 1 decimal) rather than ad hoc string concatenation — small detail, but storage-unit formatting bugs ("0.999999999999 GB used") are exactly the kind of thing that quietly erodes trust in a billing page.

### 6.3 `PlanLimitBanner.tsx` — the promotion, done correctly
- New canonical home: `shared/components/feedback/PlanLimitBanner.tsx`. Props: `resource: string`, `used: number`, `limit: number`, `upgradeUrl: string`.
- Today's actual refactor work: delete the two ad hoc inline versions inside `features/meetings/components/AddMeetingSheet.tsx` (Day 32) and `features/team/components/InviteMemberSheet.tsx` (Day 37), replace both call sites with an import of the shared component, and add this exact component as the visual basis for Billing's own "you're at 90%" inline link (§4.2) — note the **banner** variant (full-width, used inside Sheets when an action is blocked) and the **inline-link** variant (§4.2, used in the Usage rows) are two different presentations of the same underlying limit data, not the same component reused 1:1 — documented here explicitly so nobody "fixes" the Usage row by force-fitting the full banner into a 24px-tall row.

### 6.4 `InvoiceTable.tsx` / `InvoiceTableHeader.tsx` / `InvoiceRow.tsx`
- First production use of the `DataTable` primitives (header + row composition) outside the bespoke dense lists built for Meetings/Commitments/Action Items — today's job is to confirm those primitives compose cleanly with `Collapsible` rows (§4.5) without fighting the table's own row semantics (i.e., `InvoiceRow` renders as a `<Collapsible>` wrapping a table-row-shaped trigger, not a literal nested `<table>` inside a `<tr>`, which would be invalid HTML and a screen-reader trap).
- Column alignment: Date/Description left-aligned (Inter), Amount right-aligned (Poppins, tabular-nums), Status centered (Badge), Download trailing-right (icon button) — confirmed against the general rule that **numeric columns are always right-aligned** in this product's tables, a detail easy to get backwards under deadline pressure.

### 6.5 `InvoiceRowDetail.tsx`
- Renders inside the `Collapsible.Content`: a simple two-column key/value list of line items (description left, amount right, Poppins/tabular-nums) plus a subtotal/tax/total breakdown at the bottom, separated by a thin `Separator`. No new visual treatment — this is plain Inter/Poppins text in a tight grid, because a line-item breakdown is the one place on this entire page where "boring and exact" is the only correct aesthetic.

### 6.6 `PlanComparisonSheet.tsx` / `PlanComparisonTable.tsx` / `PlanComparisonColumn.tsx`
- `PlanComparisonTable` reads `plan-features.config.ts` and renders rows; `PlanComparisonColumn` is a thin presentational wrapper handling only the current-plan highlight + footer CTA — kept separate from the table-row-rendering logic so the eventual Day 84 marketing page can reuse `plan-features.config.ts`'s data without needing to import this Settings-specific column component at all.

### 6.7 `CancelPlanAlert.tsx`
- Body copy sourced from a `getCancelConsequenceCopy(plan: PlanType)` pure function living alongside `plan-features.config.ts`, not inlined JSX strings — keeps the "what exactly happens on cancel" language centrally auditable by whoever owns billing copy, separate from component code.

### 6.8 `PaymentFailedBanner.tsx`
- Consumes the new shared `TopBanner` shell (§6.10). Its own file is reduced to: icon, copy, and a "Update payment method" action that calls the same `useBillingPortal` hook as `BillingPortalButton` — **reused mutation, not a duplicated Stripe-redirect implementation.**

### 6.9 `DataTableEmptyRow.tsx`
- Generic empty state for any `DataTable` consumer (Invoices today; reusable for any future tabular settings/analytics surface). Renders a single full-width row: centered muted Inter text ("No invoices yet — they'll appear here after your first billing cycle"), no illustration — consistent with every empty state across the product since Day 26.

### 6.10 `TopBanner.tsx` (new shared shell, extracted today)
- `shared/components/feedback/TopBanner.tsx` — props: `variant: 'neutral' | 'attention'`, `icon`, `children`, `onDismiss?`. Both `OfflineBanner` (Day 39) and `PaymentFailedBanner` (today) are refactored to render through this shell. This is today's second-most-important refactor after `PlanLimitBanner` — proving, with actual code, that "same visual family" claimed in the spec is enforced by a shared component, not just a shared intention that two engineers might independently drift away from in six months.

---

## 7. ⌘K Command Palette Extension

```
NEW COMMANDS (static — not generated from a config array today, since unlike Day 41's
providers there is no per-item state branching; these three actions are always available
identically regardless of plan):

  "Manage billing"   → fires useBillingPortal directly from the palette (§4.10)
  "View invoices"    → navigates to /settings/billing, scrolls to Invoices section
  "Compare plans"    → opens PlanComparisonSheet

Search synonyms: "subscription" / "plan" / "upgrade" / "invoice" / "receipt" / "payment"
all resolve to these three commands — billing-language varies a lot user to user
("where's my receipt" vs "where's my invoice"), so synonym coverage here is worth the
small extra config effort.
```

---

## 8. Accessibility & Keyboard Pass

```
- CurrentPlanCard's "Manage billing" button and "Compare plans →" link are both
  independently Tab-reachable in logical reading order
- UsageProgressRow's Progress bar has `aria-valuenow`/`aria-valuemax` reflecting real
  usage numbers (not just visually implied) — screen reader announces "Meetings, 34 of
  120 used" correctly
- InvoiceRow's Collapsible trigger is a real button (not a div with onClick) with
  `aria-expanded` correctly toggled, so a screen reader user always knows whether a
  row's detail is open without relying on the chevron's rotation alone
- PlanComparisonSheet's table uses real `<table>` semantics (thead/tbody/th scope)
  inside the Sheet, not div-grids pretending to be a table — a comparison table is
  exactly the content type screen readers have dedicated table-navigation commands for,
  and this product should not opt out of that for free
- CancelPlanAlert: "Keep my plan" is the default-focused element on open, matching
  Day 41's Disconnect-flow safety convention exactly
- Color contrast re-verified for Poppins numerals specifically — Poppins' slightly
  different letterforms at small sizes are checked against the same ≥4.5:1 bar as
  Inter text, not assumed equivalent just because the hex color is identical
```

---

## 9. QA / End-of-Day Checklist

```
TYPOGRAPHY
  [ ] Plan name uses Plus Jakarta Sans 600; price uses Poppins 500 with tabular-nums
  [ ] Every invoice amount and usage fraction in the page uses Poppins — audited, not spot-checked
  [ ] No Plus Jakarta Sans usage anywhere outside the page title, plan name, and Sheet titles

LAYOUT
  [ ] CurrentPlanCard is the ONLY Card-class element on the page — confirmed via component audit
  [ ] Usage row grid never reflows between Unlimited and numeric-limit states (slot width reserved)
  [ ] Invoice table numeric column (Amount) confirmed right-aligned; text columns left-aligned

MICRO-INTERACTIONS
  [ ] Usage bar fill-on-mount animation fires exactly once, never replays on background refetch
  [ ] 90% threshold "Upgrade →" link fades in without causing any layout shift
  [ ] Unlimited rows skip the fill animation and never flash an empty/zero-width bar first
  [ ] BillingPortalButton disables instantly on click; Idempotency-Key confirmed present on the
      underlying mutation (verified via network inspector, not assumed)
  [ ] Invoice row Collapsible expands/collapses at 160ms with chevron rotation in lockstep
  [ ] Multiple invoice rows can be expanded simultaneously — confirmed NOT an accordion
  [ ] InvoiceDownloadButton shows dimmed-icon fetching state, no spinner, correct failure tooltip
  [ ] PlanComparisonSheet row-hover highlights the full row across all 5 columns, not just one cell
  [ ] PaymentFailedBanner and OfflineBanner confirmed to share the literal TopBanner component

STATE CORRECTNESS
  [ ] All 4 PlanStatusBadge states and all 4 InvoiceStatusBadge states render pixel-identical
      badge chrome — screenshot-diffed side by side
  [ ] "Cancelling" badge correctly overrides "Active" the instant cancel_at_period_end is true
  [ ] Renews-on date renders in the user's actual local timezone, verified against a non-UTC
      test account

DESTRUCTIVE FLOW SAFETY
  [ ] CancelPlanAlert defaults focus to "Keep my plan", requires deliberate action to confirm
  [ ] Cancel copy correctly reflects period-end timing and data retention — verified against
      the actual backend behavior, not just the placeholder copy

COMMAND PALETTE
  [ ] All three billing commands + synonyms resolve correctly
  [ ] Palette closes immediately on "Manage billing" selection, never blocks on the redirect

ACCESSIBILITY
  [ ] Full keyboard traversal completed start to finish with no mouse
  [ ] Screen reader confirms Progress bar values and Collapsible expanded state announce correctly
  [ ] PlanComparisonSheet table is real semantic markup, confirmed via accessibility tree inspection

GRACEFUL DEGRADATION
  [ ] Stripe portal/checkout mutation failure surfaces a row-anchored inline error, never a blank
      redirect or silent no-op
  [ ] Zero invoices state renders DataTableEmptyRow correctly, no broken table chrome around it
```

---

## 10. What Tomorrow (Day 43) Inherits From Today

- `TopBanner` shared shell — `PaymentFailedBanner`'s sibling pattern is ready for any future page-level alert Notifications might need (e.g., a future "your Slack token expired" banner)
- `plan-features.config.ts` + `getCancelConsequenceCopy()` pattern — the templated approach (typed config → multiple consumers) is reused for Day 43's notification-preferences JSONB-to-UI matrix
- `PlanLimitBanner`'s two-presentation distinction (full banner vs. inline link) — directly informs how Day 43's `NotificationDependencyHint` decides between a full-row disabled state vs. a small inline hint
- Confirmed: the `DataTable` primitive composes cleanly with `Collapsible` — this exact pairing is available, proven, for any future settings page needing expandable tabular rows

---

*Document: BUILD-PLAN-DAY-42 | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) — Settings: Billing*
*Typography: Plus Jakarta Sans (headings) · Inter (UI/body) · Poppins (money & counts, tabular-nums)*
