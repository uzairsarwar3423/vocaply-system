# Vocaply — Day 43 Master Build Plan
## Settings → Notifications: Preferences Matrix, Honest Test-Send, Notification Bell Foundation
> Principal Frontend Architect Edition · Industry-Grade · Calmest Page of the Week · Zero Fake States
> Continues Days 41–42's Settings pattern language. No new color. No new motion idiom. Nothing fakes success.

---

## 0. Reading This Document

This is the quietest page of the week, and that's the point. A notification-preferences page that tries to be interesting is a notification-preferences page that's lying about what it is. Today's actual craft is in the **restraint** — a perfectly transposed matrix, toggles that are honest about what they can and can't do, a test-send button that refuses to lie about success, and a Notification Bell that goes from a six-week-old dead placeholder to a real, live, Socket.io-wired piece of chrome without ever overstating what it currently does (the "View all" link is the clearest example: it's *labeled* honestly as not-yet-built, not hidden, not faked). By the end of today, `/settings/notifications` should feel like the most boring, most trustworthy page in the entire Settings shell — and the Bell icon in the Topbar should, for the first time since Day 26, actually mean something.

---

## 1. Typography System for Today's Surface (Locked, Inherited from Days 41–42)

```
FONT ROLES — UNCHANGED, APPLIED TO NOTIFICATIONS' CONTENT
──────────────────────────────────────────────────────────────────────────
Plus Jakarta Sans   → Page title ("Notifications"), the three column headers
                       atop the matrix ("Email" / "Slack" / "In-app") —
                       these earn heading treatment because they function
                       as the page's only real "headline" content; everything
                       beneath them is body-weight detail
                       Weight: 600 only. Letter-spacing -0.01em.

Inter                → Everything else: notification-type labels and
                       descriptions, dependency hints, tooltip copy,
                       button labels, Bell dropdown item text, empty-state
                       copy
                       Weight: 400 (body/descriptions) / 500 (type labels,
                       button labels, unread Bell item text)

Poppins              → Reserved for exactly ONE element on this entire page:
                       the unread-count Badge on the Bell icon itself
                       ("3", "9+"). This is the smallest, most numerically-
                       singular use of Poppins anywhere in the product so
                       far — a one-or-two-digit count, nothing else. If a
                       second Poppins use-case appears on this page during
                       implementation, that's a sign something drifted from
                       spec, not a sign to "just add it."
```

### Concrete Type Scale for This Page

```
ELEMENT                                       FONT                  SIZE   WEIGHT  LINE-HEIGHT
─────────────────────────────────────────────────────────────────────────────────────────────────
Page title ("Notifications")                  Plus Jakarta Sans     20px   600     28px
Matrix column header ("Email"/"Slack"/"In-app") Plus Jakarta Sans    13px   600     20px (centered
                                                                                      over each
                                                                                      Switch column)
NotificationTypeRow label ("Commitment missed") Inter                13px   500     20px
NotificationTypeRow description (muted)        Inter                 12px   400     18px
NotificationDependencyHint text                Inter                 12px   400     16px (muted-60%,
                                                                                      link portion 500)
Test-send button label                         Inter                 13px   500     20px
Tooltip text (disabled-toggle explanation)     Inter                 12px   400     16px
Bell dropdown header ("Notifications")         Inter                 13px   600     20px
Bell item title text                           Inter                 13px   400/500 20px (500 if unread,
                                                                                      400 if read — the
                                                                                      ONLY place weight
                                                                                      itself encodes state)
Bell item timestamp                            Inter                 11px   400     16px (tabular-nums,
                                                                                      muted-60%)
Bell empty-state copy ("You're all caught up") Inter                 13px   400     20px (muted, centered)
Bell unread-count Badge ("3", "9+")            Poppins               11px   500     16px (tabular-nums)
"View all" coming-soon label                   Inter                 12px   400     16px (muted-40%,
                                                                                      no underline — visually
                                                                                      distinct from a real link)
```

**Why the matrix headers get Plus Jakarta Sans:** every other settings page this week used Plus Jakarta Sans sparingly for page/Sheet titles only. Today's exception — promoting the three channel-column headers to heading weight — exists because **this page's entire information architecture IS those three headers**; they're not decoration above a list, they're the axis the whole grid is organized around. Giving them slightly more visual weight than a typical section label (which stays Inter-adjacent everywhere else) helps the matrix read instantly as "rows × columns," which is the single most important comprehension job this page has.

---

## 2. File & Component Architecture

```
app/(dashboard)/settings/notifications/
  page.tsx                                       ← RSC — fetch current preferences + Slack
                                                     connection status (for column-disable logic)
  loading.tsx                                    ← Skeleton matching the exact matrix grid
                                                     dimensions (zero CLS on real data arrival)

features/notifications/
  components/
    NotificationPreferencesForm.tsx
    NotificationMatrixHeader.tsx                  ← The 3 column headers row (Email/Slack/In-app)
    NotificationSection.tsx                       ← Kept from spec, but repurposed: today it wraps
                                                       the WHOLE matrix as one section, not three
                                                       separate per-channel sections (see §4 rationale)
    NotificationTypeRow.tsx
    NotificationToggle.tsx                        ← Thin wrapper around shared Switch; adds the
                                                       disabled+tooltip branch logic in one place
    NotificationDependencyHint.tsx
    TestNotificationButton.tsx
    TestSendResultLine.tsx                        ← Inline success/failure line beneath each
                                                       channel's Send-test button (see §4.4)
    NotificationBellDropdown.tsx
    NotificationBellHeader.tsx                     ← "Notifications" title + "Mark all read" action
    NotificationBellItem.tsx
    NotificationBellEmptyState.tsx
    NotificationBellViewAllLink.tsx                ← Honestly-disabled "coming soon" link, isolated
                                                       into its own tiny component so its disabled
                                                       styling can never accidentally be reused as
                                                       a real link pattern elsewhere

  hooks/
    useNotificationPrefs.ts
    useTestNotification.ts
    useInAppNotifications.ts
    useMarkNotificationRead.ts
    useUnreadCount.ts                              ← Derived/selector hook over useInAppNotifications,
                                                       isolated so the Topbar Bell can subscribe to
                                                       ONLY the count without re-rendering on full
                                                       list changes it doesn't need

  data/
    notification-types.config.ts                   ← Typed array: { id, label, description,
                                                        channels: ('email'|'slack'|'inApp')[],
                                                        inAppLocked: boolean } — single source for
                                                        matrix rows AND the ⌘K registry, same
                                                        pattern as Day 41/42's config files

shared/components/layout/Topbar/
  NotificationBell.tsx                            ← UPDATED: real Badge + opens dropdown

shared/lib/websocket/
  socket.handlers.ts                               ← EXTENDED: register `notification:created` →
                                                        patches useInAppNotifications cache (see §7)

shared/lib/cache/
  query-keys.ts                                    ← EXTENDED: notifications.preferences(userId),
                                                        notifications.inApp(userId, cursor),
                                                        notifications.unreadCount(userId)
```

### Why `notification-types.config.ts` exists (the third config file this week, and why that's correct)

Days 41 and 42 each introduced one typed config array (`providers.config.ts`, `plan-features.config.ts`) as the single source feeding both a UI surface and the ⌘K registry. Today's `notification-types.config.ts` continues that exact discipline, and it's worth naming directly: **this is now a proven architectural pattern in this codebase, not a one-off.** Any settings page with "a fixed list of things that get rendered as rows AND need to be searchable" should reach for this shape by default going forward — Day 43 doesn't introduce the pattern, it confirms it generalizes for a third consecutive day.

```ts
// features/notifications/data/notification-types.config.ts (shape)
export const NOTIFICATION_TYPES = [
  {
    id: 'MEETING_PROCESSED',
    label: 'Meeting processed',
    description: 'A meeting finished and its summary is ready.',
    channels: ['email', 'slack', 'inApp'],
  },
  {
    id: 'COMMITMENT_MISSED',
    label: 'Commitment missed',
    description: 'Someone missed a commitment deadline.',
    channels: ['email', 'slack', 'inApp'],
  },
  // Deadline reminder, Weekly digest, Payment alerts …
] as const
```

---

## 3. Layout Anatomy — Pixel-Level

```
PageContainer (max-width: 760px, identical to Days 41–42)
  └─ "Notifications" page title (Plus Jakarta Sans 20/600)
  └─ Separator (24px margin)
  └─ NotificationPreferencesForm
       └─ NotificationMatrixHeader   [blank label col]   Email   Slack   In-app
       └─ NotificationTypeRow × 5   (one per type, divide-y, 44px-ish row height —
                                      slightly taller than a 36px dense row since
                                      three Switches + a description line need room)
       └─ TestSendResultLine (anchored beneath the matrix, per-channel, see §4.4)
  └─ Separator (24px margin)
  └─ Footer row: "Send test"  [Email] [Slack]  buttons, right-aligned under their columns
```

### `NotificationTypeRow` — exact anatomy

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Commitment missed                              [Switch]   [Switch]   [Switch]   │
│ Someone missed a commitment deadline           (email)    (slack)    (in-app,    │
│                                                                        locked-on) │
└──────────────────────────────────────────────────────────────────────────────────┘
```
Grid: `grid-template-columns: 1fr 72px 72px 72px; align-items: center; gap: 16px` — the three Switch columns are fixed-width and **identically positioned across every row and aligned exactly beneath their `NotificationMatrixHeader` label**, which is the one layout detail that, if even 2px off, makes the entire "this is a matrix" mental model collapse for the user. This is verified pixel-for-pixel in QA (§9), not eyeballed.

---

## 4. Micro-Interactions — Full Catalogue

### 4.1 The matrix-not-list decision, and what it costs in build complexity vs. what it buys in trust
This isn't a single micro-interaction but the governing decision behind several below: rendering rows×columns instead of three repeated lists means every Switch toggle is independently addressable by `(typeId, channel)`, and the optimistic-update logic (§4.2) patches exactly one cell, not a whole section. The complexity cost is real (a 2D state shape instead of three flat lists) — it's accepted because it directly enables "show me everything about Slack = scan one column," which is a genuine comprehension win over three separately-scrolling sections.

### 4.2 Switch toggle — optimistic, cell-scoped
```
Trigger:    Click/Space/Enter on any enabled Switch
Effect:     Switch's visual thumb slides instantly (the shadcn Switch primitive's own
            built-in 120ms transition — not re-themed, not slowed down) BEFORE the
            mutation resolves — true optimism, not a fake-instant-then-jank-correct
Mutation:   PATCH merges only the single changed `{ channel, typeId, value }` into the
            existing preferences JSONB — never re-sends the whole preferences object,
            matching the "merge-not-replace" discipline already established for Team
            settings (Day 40) and re-confirmed here for a third settings surface
Rollback:   On mutation failure, the Switch reverts to its prior state with the SAME
            120ms transition (never a hard snap-back, which would visually read as
            "something broke" even though reverting state correctly is the right
            behavior) + a small inline error appears anchored directly beneath that
            row (not a toast — same anchoring discipline as every prior settings day)
```

### 4.3 Disabled "in-app, locked-on" toggle — Tooltip-explained, never silently inert
```
Trigger:    Hover or focus on a disabled in-app Switch (400ms tooltip delay, same
            timing convention locked Day 41)
Effect:     Tooltip: "In-app notifications can't be fully disabled — they're how the
            app stays in sync." The Switch itself renders visually `checked` + `disabled`
            (per the design-system's existing disabled-checked treatment — reduced
            opacity on the track, NOT grayed-to-invisible; a disabled-on control should
            still clearly read as "on," just unclickable)
Why this matters more than it looks: a disabled toggle with NO explanation is one of
            the most common "this feels broken" reports in any settings UI — a single
            sentence of Tooltip copy is the entire difference between "the product is
            hiding something from me" and "the product is being straightforward with me."
```

### 4.4 Slack column disable + `NotificationDependencyHint` + live re-enable
```
Trigger:    Page mount with `slackConnected: false` from the integrations status fetch
Effect:     All Slack-column Switches in every row render `disabled`, AND the
            `NotificationMatrixHeader`'s "Slack" label itself gets a small trailing
            info-glyph that, on hover, surfaces the SAME copy as the inline
            NotificationDependencyHint ("Connect Slack in Integrations to enable
            these →") — providing the explanation at the COLUMN level (hover the
            header once) rather than forcing a user to hover five separate disabled
            Switches to learn the same fact five times
Live update: The exact Day-39 Socket.io plumbing (via `team:integration_connected`-class
            event, or simply re-fetching integration status on the existing
            `integration:connected` event already wired Day 41) flips `slackConnected`
            to `true` live — Switches re-enable WITHOUT a page refresh, WITHOUT losing
            any other in-progress toggle state on the page. This is explicitly tested
            cross-tab in QA (§9): connect Slack in one tab, watch this page's Slack
            column come alive in another, unprompted.
Re-enable transition: Switches that flip from disabled→enabled get a brief 160ms
            opacity-only fade (0.5→1.0) so the change registers as an event rather
            than a silent, easily-missed attribute flip — this is the one moment on
            an otherwise nearly-static page where an entrance-style animation is
            justified, because something genuinely just became possible that wasn't
            a second ago.
```

### 4.5 `TestNotificationButton` — honest disabled-state and honest result
```
Idle:       "Send test" — enabled ONLY if that channel has a valid destination
            (email: always valid, it's the account's own verified email; slack:
            requires both `slackConnected` AND a configured default channel from
            Day 41's SlackConfigForm; in-app: button is omitted entirely for this
            channel — there's nothing meaningful to "test send" for a channel that's
            always-on and intrinsic to using the app itself)
Disabled reason: Tooltip on the disabled Slack button reads "Set a default Slack
            channel in Integrations first" — precise about WHAT is missing, not a
            generic "unavailable"
Click → Sending…: 120ms label crossfade, button disabled for the mutation's duration
            (prevents double-fire, same discipline as every mutating button this
            build has shipped since Day 32)
Result:     NOT shown as a toast, NOT shown as a temporary button-label change beyond
            the brief "✓ Sent" crossfade — instead, `TestSendResultLine` renders a
            small persistent-until-replaced line directly beneath that channel's
            button: "✓ Test sent to ali@techflow.com at 2:41 PM" or, on failure,
            "✗ Couldn't reach Slack — check your connection in Integrations". This
            line is intentionally MORE persistent than the button's own 3-second
            auto-revert (matching the spec's stated ~3s timing for the button label
            itself), because a test-send result is exactly the kind of fact a user
            might glance away from mid-send and want to come back and re-read —
            a toast that's already gone fails that use case; an anchored, lingering
            line does not. It's replaced (not stacked) on the next test-send of that
            same channel.
```

### 4.6 Notification Bell — icon idle state and badge appearance
```
Idle icon:  Standard outline bell glyph, no motion, sits in Topbar exactly where its
            6-week-old placeholder always was (zero layout shift introduced today —
            the icon's box dimensions were already reserved since Day 26)
Badge appear: When unread count transitions 0→1+ (almost always via the live Socket.io
            event, §4.8, rather than on mount), the Poppins count Badge fades in
            (opacity 0→1, 120ms) at the icon's top-right corner — it does NOT pop/scale
            in (no spring, per the locked motion rules), and it does NOT pulse/glow to
            draw attention. A new-notification signal in this product is informational,
            not an alarm.
Count format: 1–9 shown literally; 10+ collapses to "9+" — capped width so the badge
            never causes the Topbar's icon row to reflow regardless of count magnitude
```

### 4.7 `NotificationBellDropdown` open/close
```
Trigger:    Click on the Bell icon (also reachable via Tab + Enter/Space)
Component:  `DropdownMenu`, explicitly NOT a Sheet — per spec, this is a transient
            glance-and-dismiss surface. Using the lighter DropdownMenu primitive here
            (rather than reaching for Sheet "because it's more content") is itself the
            correct micro-decision: Sheets imply "I'm going somewhere," DropdownMenus
            imply "I'm glancing and will dismiss" — matching user intent precisely.
Animation:  Radix DropdownMenu default: opacity + 4px translateY, ~100ms ease-out —
            identical motion language to every other DropdownMenu in the product
            (row-end menus, Bulk bar menus from Day 36) — no custom override here,
            today's job is consistency, not novelty.
Width:      Fixed ~360px, NOT full-width even on narrow viewports below the dropdown's
            anchor — at mobile widths this becomes a near-full-width panel via the
            primitive's own collision-aware positioning, not a custom mobile variant
Close:      Esc, click-outside, or selecting "Mark all read" / clicking an item (which
            navigates and closes) — standard DropdownMenu dismissal, nothing bespoke
```

### 4.8 `NotificationBellItem` — read/unread visual distinction and click behavior
```
Unread:     Small filled 6px dot, leading edge, accent color (the ONE place a colored
            dot is acceptable on this page, because "unread" is genuinely a binary,
            non-severity state — it's not communicating urgency or danger, just
            "seen vs not seen," which is squarely within bounds for the single accent
            color already used product-wide) + item text at Inter 500 weight (vs 400 read)
Click:      Single click does TWO things atomically: (a) optimistically marks that
            item read (dot disappears, text weight drops to 400, ~120ms crossfade)
            and (b) navigates to the notification's `actionUrl` (e.g., a specific
            commitment or meeting) — dropdown closes the instant navigation begins,
            never lingers open over a route change
Mark-all:   "Mark all read" in `NotificationBellHeader` clears every unread dot in the
            currently-rendered list in one optimistic batch (mirrors the Day 36 bulk-
            update discipline: one cache-patch pass across N items, not N sequential
            mutations) and resets the Topbar Badge to hidden, instantly
```

### 4.9 Live `notification:created` Socket.io event → Bell update without refresh
```
Registered in socket.handlers.ts's central registry (Day 39 pattern, third or fourth
domain to plug into it): on `notification:created` for the current user, the new row
is PREPENDED to the cached in-app-notifications list (not a full refetch — a single
list-prepend operation) and the unread count increments by exactly 1.
Bell badge:  If the dropdown is CLOSED when this fires, the badge count updates per
             §4.6's fade-in. If the dropdown is OPEN when it fires (rare but real —
             e.g., a teammate marks something missed while you happen to be glancing
             at your own notifications), the new item animates into the TOP of the
             open list with the exact same opacity+4px-translateY entrance used
             everywhere else — never a jarring list-reflow, never a sound, never a
             desktop-style toast-on-top-of-dropdown stacking.
```

### 4.10 `NotificationBellEmptyState` and `NotificationBellViewAllLink`
```
Empty:       Centered, single line, Inter 13px/400, muted — "You're all caught up."
             No icon, no illustration. Rendered the instant the list is confirmed
             empty (not after a delay, not behind a skeleton that "tries one more
             time") — emptiness is reported immediately and calmly.
View all:    Rendered at the dropdown's footer in muted-40% Inter, NO underline, NOT
             wrapped in an `<a>`/Link at all today (a real disabled-looking link with
             an onClick that does nothing is worse than a plain disabled-styled text
             node — there is nothing to click, so nothing should look clickable).
             A small trailing "(coming soon)" in the same muted weight removes any
             ambiguity. This is the single most literal expression of "never fake
             success, never silently dead-click" in today's entire build.
```

---

## 5. The Preferences Matrix — Full State Specification

| Channel | Default state per type | Can user disable? | Disabled-reason source |
|---|---|---|---|
| **Email** | `true` for all 5 types | Yes, per-type, always | none — always available, it's the account's verified email |
| **Slack** | `true` for all 5 types | Yes, per-type — but only if `slackConnected` | `NotificationDependencyHint` |
| **In-app** | `true`, locked | No — disabled-checked, Tooltip explains why | n/a — intrinsic, not dependency-gated |

**The one rule that governs the whole matrix:** a Switch is only ever in one of three states — `enabled+off`, `enabled+on`, or `disabled+on` (in-app) / `disabled+off-or-on` (Slack pre-connection, reflecting whatever value is stored even though it can't currently take effect). There is no fourth state, and no state is ever visually ambiguous about which of the three it is.

---

## 6. Component-by-Component Build Notes

### 6.1 `NotificationPreferencesForm.tsx`
- Owns the single source of truth for the page's 2D state (`{ [typeId]: { email, slack, inApp } }`), hydrated directly from `useNotificationPrefs()` — no separate local form state library needed here, since every interaction is a discrete, independently-mutating cell rather than a single multi-field submission. This is deliberately **not** wrapped in `react-hook-form` (unlike most forms in this product) because there's no "Save" button and no batched validation — every Switch is its own micro-mutation, and reaching for a form library here would add ceremony without benefit.

### 6.2 `NotificationMatrixHeader.tsx`
- Pure presentational row: blank leading cell (aligns with the label column) + three Plus Jakarta Sans column headers, centered over their respective 72px columns. Receives `slackDisabled: boolean` to render the column-level info-glyph from §4.4 — kept as a prop rather than this component independently querying integration status, so it stays a dumb, easily-tested layout piece.

### 6.3 `NotificationTypeRow.tsx`
- Maps `notification-types.config.ts`'s `channels` array per row to decide which of the three Switch slots render a real `NotificationToggle` vs. an empty placeholder cell (not every notification type necessarily supports every channel forever, even though today's initial 5 types all support all 3 — building the row to read this from config rather than assuming "always 3" future-proofs the matrix for a type that's email-only, without a layout special-case later).

### 6.4 `NotificationToggle.tsx`
- Thin wrapper: takes `{ checked, onChange, disabled, disabledReason }`. All three disabled-state branches (in-app-locked, Slack-not-connected, and a hypothetical future third reason) funnel through this ONE component's Tooltip-rendering logic — meaning a fourth disable-reason added next quarter requires one new `disabledReason` string, not a new component.

### 6.5 `NotificationDependencyHint.tsx`
- Generic enough to take `{ serviceName: string, settingsPath: string }` so it isn't Slack-specific in its implementation even though Slack is its only consumer today — matching the "build the general shape, prove it once" discipline from `InlineFieldHint` (Day 41).

### 6.6 `TestNotificationButton.tsx` + `TestSendResultLine.tsx`
- Deliberately two components, not one — `TestNotificationButton` owns only the click→mutation→label-state lifecycle (§4.5's "Sending…"/"✓ Sent" crossfade); `TestSendResultLine` owns the longer-lived, replaced-not-stacked result message. Splitting these means the button's internal state machine never has to know or care how long its *result* should remain visible on screen — two different lifetimes, two components, exactly matching their actual behavior.

### 6.7 `NotificationBellDropdown.tsx` / `NotificationBellHeader.tsx` / `NotificationBellItem.tsx`
- `NotificationBellDropdown` renders at most 10 items (per spec) via a plain `.slice(0, 10)` over the already-fetched list — no separate "preview" query, the full feed's first page IS the dropdown's content, just visually truncated, so Day 88's full-feed page can trivially reuse the exact same `useInAppNotifications` hook with pagination simply turned on.
- `NotificationBellItem` receives a fully-resolved `{ title, timestamp, isRead, actionUrl }` shape — no raw notification-type-to-copy mapping logic inside this component; that resolution lives in `useInAppNotifications` itself (or a small mapper it calls), keeping the presentational item dumb and easy to visually QA in isolation.

### 6.8 `NotificationBellEmptyState.tsx` / `NotificationBellViewAllLink.tsx`
- Both intentionally tiny, single-purpose files — exactly the kind of component a less disciplined build would inline directly into `NotificationBellDropdown.tsx` "since it's only a few lines." Keeping them separate means Day 88's full-feed page can reuse the identical empty-state component without any extraction work later, and means `NotificationBellViewAllLink`'s "this looks disabled on purpose" styling can never accidentally be copy-pasted into a context where it should be a real working link.

### 6.9 `NotificationBell.tsx` (Topbar)
- Updated from a static icon to: icon + conditionally-rendered Badge (sourced from `useUnreadCount()`, NOT from the full list hook directly — see §2's rationale for the selector split) + `DropdownMenuTrigger` wiring. This file's diff today should be small and surgical — the six-week-old placeholder's box dimensions, position, and icon asset are untouched; only its interactivity and badge are added.

---

## 7. Socket.io / Realtime Wiring (Today's Cross-Cutting Backend-Facing Work)

```
EVENT: notification:created   (per-user room: user:{userId})
  Payload: { id, type, title, body, actionUrl, createdAt, isRead: false }
  Handler (registered in socket.handlers.ts, per Day 39's central-registry pattern):
    1. queryClient cache: prepend to notifications.inApp(userId, ...) list
    2. queryClient cache: increment notifications.unreadCount(userId) by 1
    3. If NotificationBellDropdown is currently mounted/open, the prepended item
       enters with the standard 4px-translateY+opacity entrance (§4.9) — otherwise
       it simply exists in cache, surfaced next time the dropdown opens

EVENT: notification:read (rare — fired if read-state changes from ANOTHER session,
  e.g., user reads on mobile while desktop tab is open)
  Handler: patches that single item's isRead in cache + decrements unread count —
  included today specifically so multi-device read-state never drifts out of sync,
  even though today's UI surface for triggering it (the Bell) is single-session-focused
```

This is the first day Notifications' own domain plugs into the Day-39 registry — worth noting in the registry file's own inline documentation (per Day 39's stated intent that the registry be "scannable" for exactly this kind of audit) so a future engineer reading `socket.handlers.ts` six months from now sees Notifications listed there with a clear one-line comment pointing back to this day's spec.

---

## 8. ⌘K Command Palette Extension

```
NEW COMMANDS (generated from notification-types.config.ts + 2 static actions):

  "Notification preferences"      → navigates to /settings/notifications
  "Send test email"               → fires useTestNotification('email') directly from
                                      the palette; palette closes immediately, result
                                      surfaces via TestSendResultLine on next visit to
                                      the page (palette itself never shows the result,
                                      consistent with Day 41/42's "trigger and get out
                                      of the way" rule) — OR, if not already on the
                                      Notifications page, navigates there first, then
                                      fires the test (small but important UX nuance:
                                      a test-send result with nowhere to display itself
                                      would otherwise silently vanish)
  "Send test Slack message"       → same pattern, disabled in the palette itself
                                      (greyed list item + inline "Connect Slack first"
                                      sublabel) if Slack isn't connected — the palette
                                      respects the exact same honesty rule as the
                                      in-page button, never offering an action that's
                                      guaranteed to fail

Search synonyms: "alerts" / "emails" / "preferences" / "slack notifications" /
"digest" all resolve to the preferences page command.
```

---

## 9. Accessibility & Keyboard Pass

```
- Every Switch in the matrix is independently Tab-reachable in row-major order
  (left to right, top to bottom) with Space/Enter toggling — standard native
  behavior via the underlying Switch primitive, confirmed not overridden
- Disabled Switches are still Tab-reachable (so their Tooltip explanation is
  discoverable via keyboard focus, not just mouse hover) — `disabled` attribute
  alone would remove them from the tab order in some implementations; explicitly
  verified that focus + Tooltip-on-focus works here, not just hover
- NotificationBellDropdown: opening via Enter/Space on the Bell trigger moves focus
  to the first focusable item inside (the "Mark all read" action or first
  notification item); Esc returns focus to the Bell trigger itself, never to
  document.body
- Bell unread Badge is NOT the only signal screen readers receive — the Bell
  trigger's accessible name updates to include the count ("Notifications, 3 unread")
  so the information is available without relying on visually parsing a small Badge
- "Mark all read" action is reachable and operable via keyboard with the same
  optimistic-then-confirmed behavior as a mouse click
- NotificationBellViewAllLink: rendered as plain text with `aria-disabled` semantics
  if implemented as a button-like element, NOT a focusable, Tab-stoppable dead end —
  a non-functional control should never consume a Tab stop
```

---

## 10. QA / End-of-Day Checklist

```
TYPOGRAPHY
  [ ] Matrix column headers render in Plus Jakarta Sans 600; every other text on
      the page confirmed Inter (audit, not spot-check)
  [ ] Poppins appears in exactly one place on this page: the Bell's unread-count Badge
  [ ] Unread vs read Bell item weight difference (500 vs 400) is the only typographic
      signal of read-state — confirmed no additional color/background difference

LAYOUT
  [ ] Switch columns align pixel-perfectly beneath their matrix headers across every
      row, verified with an overlay/ruler check, not eyeballed
  [ ] Row height accommodates the two-line label+description without clipping at the
      longest real description string in the dataset

MICRO-INTERACTIONS
  [ ] Switch toggle is visually instant (optimistic) before mutation resolves; rollback
      on forced failure reverts with the same transition speed, never a hard snap
  [ ] PATCH payload confirmed to send only the single changed cell, never the full
      preferences object (verified via network inspector)
  [ ] Disabled in-app Switch shows explanatory Tooltip on both hover AND keyboard focus
  [ ] Slack column disables fully pre-connection; live re-enables cross-tab without
      refresh and without losing other in-progress toggle state on the page
  [ ] Re-enabled Slack switches show the 160ms opacity-fade "this just became possible"
      cue exactly once, not a repeating pulse
  [ ] Test-send button correctly disabled (with precise Tooltip reason) when destination
      is missing; never allows a click that's guaranteed to fail
  [ ] Test-send result renders in TestSendResultLine, persists until replaced by the
      next test of that channel, is NOT a toast
  [ ] Bell badge fade-in on count 0→1+ uses opacity only, confirmed no scale/spring
  [ ] Bell dropdown open/close motion matches every other DropdownMenu in the product
      exactly — no custom override
  [ ] Notification item click marks read optimistically AND navigates in one atomic
      interaction; dropdown closes immediately on navigation
  [ ] "Mark all read" clears all visible unread dots in one optimistic pass, Topbar
      badge clears instantly
  [ ] Live notification:created event prepends new item correctly whether dropdown
      is open or closed, with correct entrance animation only when open

HONESTY / NEVER-FAKE-SUCCESS AUDIT
  [ ] "View all" renders with zero clickability (no href, no onClick, no Tab stop) and
      a clear "(coming soon)" label — confirmed not a dead link
  [ ] No toggle, button, or link anywhere on this page produces a UI state that implies
      success without a corresponding real backend effect

COMMAND PALETTE
  [ ] All notification commands + synonyms resolve correctly
  [ ] "Send test Slack message" correctly greys out in the palette itself when
      Slack isn't connected, with the same precise sublabel reasoning as the in-page button

ACCESSIBILITY
  [ ] Full keyboard traversal of matrix + Bell dropdown completed start to finish,
      no mouse
  [ ] Screen reader confirms Bell trigger's accessible name includes live unread count
  [ ] Disabled Switches remain Tab-reachable; Tooltip content is announced on focus
```

---

## 11. What Tomorrow (Day 44) Inherits From Today

- `notification-types.config.ts` confirms the typed-config → multi-consumer pattern for a third consecutive day — Onboarding's `useOnboarding` step-completion model can lean on the same instinct if a similarly enumerable shape appears
- The optimistic single-cell-patch discipline (§4.2) is the most granular optimistic-update example in the product so far — directly informs how Onboarding's step-skip/step-complete flags should be patched (single boolean flips, not whole-object resaves)
- `NotificationBellDropdown`'s "transient glance, not a destination" reasoning for choosing DropdownMenu over Sheet is the exact judgment call Onboarding's lightweight `OnboardingSkipConfirm` (Day 44) needs to make correctly for the same reason
- The honesty-over-flexibility principle (disabled-but-explained, never-fake-success) carries directly into Day 44's Calendar Connect step, which must degrade identically rather than pretending to work when OAuth env vars are absent

---

*Document: BUILD-PLAN-DAY-43 | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) — Settings: Notifications + Notification Bell Foundation*
*Typography: Plus Jakarta Sans (matrix headers & page title only) · Inter (everything else) · Poppins (Bell unread count, exclusively)*
