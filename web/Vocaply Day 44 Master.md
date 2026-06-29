# Vocaply — Day 44 Master Build Plan
## Onboarding: 4-Step Wizard + Calendar Connect — First Impression, Production-Polished
> Principal Frontend Architect Edition · Industry-Grade · Under-90-Seconds UX · Zero Wizard Clichés
> Inherits every pattern proven across Days 36–43. No new visual idiom. No new motion language.
> The entire toolkit today is composition — nothing here gets to invent its own rules.

---

## 0. Reading This Document

Onboarding is the only screen in the entire product a user is *guaranteed* to see exactly once, in a specific four-step order, with zero prior context for how this product behaves. Every other settings/feature page this build has shipped gets the benefit of a user who already trusts the system's rhythm. This page does not get that benefit — it has to *establish* the rhythm in real time, in under 90 seconds, while also doing real, stateful work (creating a team, sending invites, initiating OAuth). The craft today is entirely about **not introducing anything new** while still feeling like a confident, fast, single continuous motion. If a user can't tell, looking back, whether "Create Team" was a Sheet-shaped interaction or a full page — that's success. It means the onboarding flow borrowed its grammar from the rest of the product instead of inventing its own.

---

## 1. Typography System for Today's Surface (Locked, Inherited from Days 41–43)

```
FONT ROLES — UNCHANGED, APPLIED TO ONBOARDING'S CONTENT
──────────────────────────────────────────────────────────────────────────
Plus Jakarta Sans   → Each step's single headline ("Welcome to Vocaply,"
                       "Create your team," "Invite your team," "Connect
                       your calendar") — and ONLY the headline. This is the
                       narrowest, most disciplined use of Plus Jakarta Sans
                       in the whole product: one headline per screen, full
                       stop. No subheadline gets this treatment.
                       Weight: 600. Letter-spacing -0.01em. Size scales up
                       slightly from Settings' page titles (24px vs 20px)
                       because this is a full-screen, single-focus moment —
                       the one place in the product where a slightly larger
                       headline is earned by context, not decoration.

Inter                → Every supporting sentence, every field label, every
                       button, every InviteResultList row, every Tooltip,
                       the "Step N of 4" progress text, the Skip-confirm
                       copy. The overwhelming majority of text on this
                       entire flow is Inter — onboarding succeeds by being
                       quiet and clear, not by being typographically loud.
                       Weight: 400 (body/descriptions) / 500 (button labels,
                       field labels, the "Skip for now" link)

Poppins              → Reserved for exactly ONE possible appearance today:
                       IF an invite-step result includes a count summary
                       ("3 invited, 1 already on the team"), that count
                       renders in Poppins/tabular-nums, matching the same
                       "Poppins = the number is the point" rule from every
                       prior day this week. If no such summary line exists
                       in the final implementation, Poppins simply does not
                       appear on this page at all — and that absence is
                       correct, not a gap to fill in.
```

### Concrete Type Scale for This Flow

```
ELEMENT                                       FONT                  SIZE   WEIGHT  LINE-HEIGHT
─────────────────────────────────────────────────────────────────────────────────────────────────
Step headline ("Create your team")            Plus Jakarta Sans     24px   600     32px
Step subhead / supporting sentence            Inter                 14px   400     22px (muted-70%)
"Step 2 of 4" progress label                  Inter                 12px   500     16px (tabular-nums
                                                                                      for the digit,
                                                                                      muted-60%)
Field label ("Team name")                     Inter                 12px   500     16px
Input text (team name, email chips)           Inter                 14px   400     22px
TeamSlugField availability feedback           Inter                 12px   400     16px (success:
                                                                                      default text color;
                                                                                      taken: same neutral
                                                                                      weight — see §4.3)
Primary button label ("Continue", "Get
  started", "Connect Google Calendar")        Inter                 14px   500     22px
"Skip for now" link                           Inter                 13px   500     20px (no underline
                                                                                      at rest, underline
                                                                                      on hover only)
OnboardingSkipConfirm inline copy             Inter                 13px   400     20px
InviteResultList row text                     Inter                 13px   400     20px
InviteResultList summary count (optional)     Poppins               13px   500     20px (tabular-nums)
"Setting up your workspace…" transition text Inter                 13px   400     20px (muted)
```

**Why the headline gets a size bump but nothing else does:** every other settings/dashboard page this product has shipped uses a 20px Plus Jakarta Sans page title, because those pages are dense, multi-element, information-rich. Onboarding's screens are the opposite — one headline, one or two controls, one action. A 24px headline against an otherwise sparse 480px-wide card is the typographic equivalent of giving a single sentence room to breathe; it would look undersized at 20px in that emptier context, and oversized at anything beyond 24px would tip into "marketing landing page" territory, which this explicitly is not.

---

## 2. File & Component Architecture

```
app/onboarding/
  layout.tsx                                     ← Full-screen shell: OnboardingProgress only,
                                                      no Sidebar/Topbar, centers OnboardingStepShell
  page.tsx                                        ← Step 1: Welcome
  create-team/
    page.tsx                                      ← Step 2
  invite-team/
    page.tsx                                       ← Step 3
  connect-calendar/
    page.tsx                                       ← Step 4
  complete/
    page.tsx                                       ← NEW today, not in original file list:
                                                      a real (tiny) route for OnboardingCompleteRedirect
                                                      to render against, rather than an in-place state
                                                      swap on the last step — see §6.8 for why this
                                                      earns its own route

features/onboarding/
  components/
    OnboardingProgress.tsx
    OnboardingStepShell.tsx
    WelcomeStep.tsx
    CreateTeamStep.tsx
    InviteTeamStep.tsx
    InviteResultList.tsx
    InviteResultRow.tsx                            ← Split out: one row per email outcome, reused
                                                      shape from Day 37's InviteMemberSheet, this
                                                      time as its own file since onboarding's version
                                                      needs slightly different surrounding chrome
                                                      (no Sheet wrapper) but identical row content
    ConnectCalendarStep.tsx
    OnboardingSkipConfirm.tsx
    OnboardingCompleteRedirect.tsx
    OnboardingStepFooter.tsx                        ← NEW: the shared "[Skip for now]  [Continue →]"
                                                      footer row, identical layout across steps
                                                      2–4, extracted so the primary/secondary
                                                      button relationship is defined exactly once

  hooks/
    useOnboarding.ts
    useCreateTeamStep.ts
    useInviteTeamStep.ts
    useConnectCalendarStep.ts
    useOnboardingStepGuard.ts                       ← NEW: redirect-if-step-not-reachable logic
                                                      (e.g., direct-navigating to /invite-team
                                                      before a team exists redirects back to
                                                      /create-team) — isolated so this guard logic
                                                      doesn't get duplicated across 4 page.tsx files

  data/
    onboarding-steps.config.ts                      ← Typed array: { path, order, label, optional }
                                                      driving OnboardingProgress's math AND
                                                      useOnboardingStepGuard's reachability checks —
                                                      the fourth consecutive day this exact
                                                      "typed config drives multiple consumers"
                                                      pattern appears (Days 41/42/43 each had one)
```

### Why `onboarding-steps.config.ts` matters even for a flow this short

Four steps is a small enough number that hardcoding `"Step 2 of 4"` math directly into `OnboardingProgress` would *work*. It's deliberately not done that way, for the same reason Days 41–43 each centralized their enumerable lists: **the moment this flow's step count or order changes (e.g., calendar connect becomes optional-and-third, or a fifth "pick your industry" step is added in Q3), every consumer of this config — the progress bar's percentage math, the step-guard's reachability logic, and the back-button's "previous step" lookup — updates correctly from one file.** A flow this short is exactly where it's tempting to skip this discipline "just this once"; today's plan explicitly does not skip it, because consistency-of-pattern matters more than the marginal LOC saved.

```ts
// features/onboarding/data/onboarding-steps.config.ts (shape)
export const ONBOARDING_STEPS = [
  { path: '/onboarding', order: 1, label: 'Welcome', optional: false },
  { path: '/onboarding/create-team', order: 2, label: 'Create team', optional: false },
  { path: '/onboarding/invite-team', order: 3, label: 'Invite team', optional: true },
  { path: '/onboarding/connect-calendar', order: 4, label: 'Connect calendar', optional: true },
] as const
```

---

## 3. Layout Anatomy — Pixel-Level

```
app/onboarding/layout.tsx
  └─ <div class="min-h-dvh flex flex-col">
       └─ OnboardingProgress                          ← fixed top, full-width, 2px Progress bar
                                                          + "Step 2 of 4" text 12px below it,
                                                          24px top padding before the bar starts
       └─ <main class="flex-1 flex items-center justify-center">
            └─ OnboardingStepShell (max-width: 480px)
                 └─ {step-specific content via children}
```

### `OnboardingStepShell` — exact anatomy

```
┌──────────────────────────────────────────────┐
│  Create your team                            │  ← Plus Jakarta Sans 24/600
│  This is where your meetings and             │  ← Inter 14/400, muted-70%, max 2 lines
│  commitments will live.                      │
│                                               │
│  [ field / content slot ]                    │  ← step-specific (Input, chips, button)
│                                               │
│  ─────────────────────────────────────────   │  ← Separator, only on steps with a footer
│  [Skip for now]              [Continue →]    │  ← OnboardingStepFooter, steps 2–4 only
└──────────────────────────────────────────────┘
```
No border, no Card wrapper around the shell itself — onboarding content sits directly on the page background, full-bleed within its 480px column. A bordered Card here would visually compete with the page's own minimalism; the *absence* of a container is the correct choice precisely because every other Settings surface this week used bordered Cards sparingly and deliberately — onboarding earns the right to have zero chrome because it has zero competing content around it.

---

## 4. Micro-Interactions — Full Catalogue

### 4.1 Step-to-step transition (the single most important motion decision today)
```
Trigger:    Successful step completion (Continue clicked + underlying mutation resolves)
            OR direct navigation via the URL (back button, refresh)
Effect:     OUTGOING step content: opacity 1→0 + translateY 0→-4px, 100ms ease-out
            (exits upward and fades — "this is done, moving forward")
            INCOMING step content: opacity 0→1 + translateY 4px→0, 140ms ease-out,
            starting the instant the outgoing finishes (no overlap, no crossfade-through-
            both-simultaneously, which would read as jumpy on a 480px-narrow column)
            OnboardingProgress bar: width animates to its new percentage in lockstep,
            same 140ms ease-out, starting at the same moment as the incoming content
Why this exact shape: this IS the platform's standard Sheet/dropdown entrance motion
            (opacity + 4px translateY, ease-out) — re-applied here as a full-step
            transition rather than invented fresh. The explicit goal stated in the spec
            ("stepping from Welcome to Create Team should feel like the same kind of
            motion as opening a Sheet elsewhere") is satisfied literally, not just in spirit:
            the timing curve and displacement distance are copy-pasted constants, not
            independently-tuned values that happen to look similar.
Anti-pattern avoided: NO slide-the-whole-screen-sideways carousel transition (the
            classic "wizard" tell), NO scale/zoom, NO directional cue implying "step 3 is
            physically to the right of step 2" — steps are sequential in time, not in space,
            and the motion language reflects that.
```

### 4.2 Primary action button — Enter-key parity with click
```
Trigger:    Enter keypress anywhere within the step's focused form context (NOT global —
            scoped to the step's form/container, so Enter inside an unrelated future
            text area, if one ever existed, wouldn't accidentally submit)
Effect:     Identical to a direct click on the primary button: same disabled-during-
            mutation state, same loading label-swap (§4.4) — there is exactly one code
            path for "this step advances," triggered by two input methods, never two
            slightly-different implementations that could drift out of sync
Visual confirmation: the primary button receives a brief 80ms "pressed" opacity dip
            (0.85) on activation regardless of trigger method, giving Enter-key users
            the same tactile confirmation a mouse click's `:active` state would provide —
            a detail many keyboard-first flows miss, and one this build's own stated
            "keyboard-first > mouse-first" principle requires getting right today
```

### 4.3 `TeamSlugField` live-availability check (reused verbatim, behavior re-verified)
```
Trigger:    Debounced 350ms after last keystroke in the team-name/slug field (identical
            debounce timing to Day 40's Settings implementation — re-confirmed, not
            re-tuned, since this is the SAME component, not a fork)
States:     idle → checking ("Checking availability…", Inter 12px muted, no spinner,
            text-only per this build's no-spinner discipline) → available ("✓ Available",
            same neutral text weight as everything else — explicitly NOT colored green,
            consistent with "severity/status via words, not color" carried through every
            prior day) → taken ("Taken — try `{suggestion}`", same neutral weight,
            clickable suggestion text that fills the field on click)
Race condition (today's highest-stakes interaction): if the advisory check says
            "available" but the actual POST /teams returns 409 (another session claimed
            it microseconds earlier), the form does NOT show a raw error — it silently
            re-runs the suggestion logic client-side (or surfaces the backend's own
            auto-suggested alternative) and updates the slug field's state to "taken,
            try {new-suggestion}" with the exact same visual treatment as if the live
            check had caught it originally. The user should never be able to tell, from
            the UI alone, whether the race condition fired or not — that indistinguishability
            IS the correct implementation.
```

### 4.4 Mutation-pending button states (Create Team, Invite, Connect Calendar — all share one pattern)
```
Idle:       "Continue" / "Create team" / "Send invites" / "Connect Google Calendar"
Pending:    Label crossfades (120ms) to "Creating…" / "Sending…" / "Redirecting…" —
            button disabled for the duration, no spinner icon anywhere (this is the
            fourth consecutive settings-adjacent day to apply this exact no-spinner,
            text-only-state discipline; onboarding doesn't get an exception just
            because it's "the first impression" — if anything, especially not here)
Success:    Immediately triggers the step-transition (§4.1) — there is no separate
            "✓ Done" flash on this page the way Day 40/41's inline save-states show one,
            because onboarding steps don't loop back to an idle state to confirm against;
            they move forward. Showing a checkmark for 200ms before transitioning away
            would just be a delay with no comprehension benefit.
```

### 4.5 `InviteTeamStep` — chip input interaction
```
Add:        Comma or Enter commits the current text as a chip; invalid email format
            shows the chip in a subdued "invalid" text style (NOT a red border — same
            neutral-with-honest-text-label rule) with a small inline "invalid email"
            caption beneath that specific chip, removed the instant it's corrected or
            deleted
Remove:     Backspace on an empty input focuses and highlights the last chip (standard,
            expected tag-input behavior); a second Backspace removes it. Chip removal is
            instant, no animation needed for a removal this lightweight (animating chip
            deletion at this scale would be motion for motion's sake)
Max (20):   At the 20th chip, the input disables with a static (not error-toast) inline
            caption: "Maximum 20 invites at once" — present only when the limit is
            actually reached, never preemptively shown as a constant reminder
```

### 4.6 `InviteResultList` / `InviteResultRow` rendering
```
Trigger:    Mutation resolves with the per-email breakdown
Effect:     Rows render immediately, no stagger/cascade (identical discipline to Day
            41's CalendarEventsPreviewSheet rows — a result list is informational, not
            a moment for choreography)
Row styling: invited (default text weight), alreadyMember (muted-60%, "Already on
            the team"), alreadyInvited (muted-60%, "Invite already sent") — three
            outcomes, three distinct but equally-neutral text treatments, no color
            differentiation between "this worked" and "this was a no-op," because
            none of the three outcomes is actually an error; they're just three
            different, equally-valid facts
Continue:   The step's primary button remains "Continue →" throughout — submitting
            invites does not consume the primary action; the user reviews the result
            list, then explicitly continues, giving them a beat to actually read what
            happened before the flow moves on (contrast with §4.4's "success transitions
            immediately" — invites are the one step where the RESULT itself is content
            worth pausing on, unlike a calendar-connect redirect which has nothing to review)
```

### 4.7 `OnboardingSkipConfirm` — the lightweight inline confirm
```
Trigger:    Click on "Skip for now"
Effect:     The link itself is replaced IN PLACE (same position, no layout shift below
            it) by a small two-part inline row: muted confirm sentence + "Confirm skip"
            text button + "Cancel" text button, entrance via the standard 120ms opacity
            fade (no slide — this is a same-position content swap, not a new element
            entering from elsewhere)
Confirm:    Immediately proceeds exactly like a completed step (§4.1's transition fires)
Cancel:     Reverts instantly back to the plain "Skip for now" link, same 120ms fade,
            no confirmation needed to cancel a non-action (cancelling a skip should be
            zero-friction, since "I changed my mind about skipping" has zero consequence)
Why NOT an AlertDialog, restated with the actual interaction cost compared:
            an AlertDialog here would add a focus-trap, a backdrop, and a full modal
            lifecycle for a decision that's instantly reversible and affects nothing
            destructive — using the heavyweight pattern would itself be a violation of
            "match confirmation weight to actual consequence," not a safety improvement.
```

### 4.8 `ConnectCalendarStep` — graceful degradation, verified not assumed
```
Env present:  Standard primary button → full-tab OAuth redirect, identical
              "Redirecting…" label-swap pattern as Day 41's integration connect flow
              (same component logic, reused, not reimplemented for onboarding's context)
Env absent:   Button renders visually identical but `disabled`, wrapped in a Tooltip
              ("Calendar connect isn't configured in this environment") — surfaced via
              the SAME disabled+Tooltip pattern established Day 41 for integrations and
              Day 43 for notification toggles; onboarding does not get its own disabled-
              state visual language, it borrows the one that already exists
OAuth return: Identical query-param-read-then-strip pattern from Day 41 §4.4 — on
              return to /onboarding/connect-calendar?connected=true, the param is read
              once, stripped via router.replace(), and the step proceeds to completion
              automatically (no manual "Continue" click required after a successful
              OAuth round-trip — the connection event itself IS the completion signal
              for this one step, distinct from Create Team/Invite which require an
              explicit Continue)
```

### 4.9 `OnboardingCompleteRedirect` — honest, unpadded transition
```
Trigger:    Final step completed or skipped
Effect:     Navigates to /onboarding/complete (today's new tiny route, §2/§6.8), which
            renders a single centered line: "Setting up your workspace…" in muted Inter,
            NO progress bar (the 4-step progress bar's job is done; reusing it here for
            an indeterminate wait would misrepresent it as quantifiable progress when
            it isn't), and fires the actual finalize mutation(s) on mount
Duration:   Whatever the real async work takes — if it resolves in 180ms, the screen is
            visible for 180ms before redirecting to /dashboard. If a deliberate minimum-
            display-time were added "so it doesn't flash," that would be padding for
            theater, explicitly rejected by the spec's own stated principle. The ONLY
            acceptable minimum is whatever prevents a literal one-frame flash that could
            read as a glitch (a few tens of milliseconds at most, via a `requestAnimationFrame`-
            based guard, not a fixed `setTimeout(800)` "feels right" delay)
Failure:    If the finalize call fails (rare — team/membership already exists by this
            point, so failure here is almost always transient), the screen swaps to a
            plain inline error + "Try again" button — never a silent redirect to a
            half-finished dashboard state
```

### 4.10 ⌘K — explicitly inert, verified, not just absent
```
Today's QA explicitly tests pressing ⌘K on every one of the four onboarding routes
plus /onboarding/complete, confirming no listener fires and no command palette element
exists in the DOM at all (not just visually hidden) — this is checked as a real negative
test case, not assumed correct because "we didn't add the provider here." The
WebSocketProvider and QueryProvider remain mounted (onboarding still needs live data),
but CommandPaletteProvider is deliberately excluded from app/onboarding/layout.tsx's
provider tree, structurally guaranteeing it cannot fire rather than relying on a
runtime route-check inside the palette itself.
```

---

## 5. The Step-Footer Contract — `OnboardingStepFooter`

| Step | Left slot | Right slot (primary) | Notes |
|---|---|---|---|
| **1. Welcome** | *(none)* | `Get started` | No footer component at all — single centered button, no Separator above it (nothing to separate from) |
| **2. Create Team** | *(none — required step)* | `Continue →` | No skip option; team creation is the one non-optional step after Welcome |
| **3. Invite Team** | `Skip for now` | `Continue →` | Both rendered via `OnboardingStepFooter`, identical layout to step 4 |
| **4. Connect Calendar** | `Skip for now` | `Connect Google Calendar` (idle) → becomes unnecessary the instant OAuth succeeds, per §4.8 | Primary label differs from "Continue" because this step's primary action IS the OAuth trigger, not a generic advance |

**The one rule governing the footer:** `Skip for now` only ever appears on steps marked `optional: true` in `onboarding-steps.config.ts` (§2) — `OnboardingStepFooter` reads this from the config rather than each page deciding independently whether to render it, so a future change to which steps are optional is a one-line config edit, not a per-page audit.

---

## 6. Component-by-Component Build Notes

### 6.1 `OnboardingProgress.tsx`
- Computes its percentage and "Step N of 4" text from `onboarding-steps.config.ts` + the current pathname (via `usePathname()`), never from a manually-incremented counter passed down through props — this guarantees the bar is always correct on direct navigation/refresh/back-button, not just on forward progression through clicks.
- The bar itself is the existing `Progress` primitive at 2px height (thinner than Billing's 4px usage-bars, Day 42) — deliberately the thinnest Progress instance in the product, since this is ambient wayfinding chrome, not a data visualization the user is meant to study.

### 6.2 `OnboardingStepShell.tsx`
- Pure layout: `headline`, `subhead?`, `children`, `footer?` props. Owns the §4.1 transition wrapper (likely via a small `key`-based remount keyed on pathname, paired with a CSS animation class, or Framer Motion's `AnimatePresence` if already a dependency elsewhere in the product — whichever mechanism is already used for Sheet enter/exit should be reused here, not a second animation mechanism introduced for this one screen).

### 6.3 `WelcomeStep.tsx`
- The shortest, simplest file shipped all week — headline + one sentence + one button, no hook beyond a plain `router.push()` on click/Enter. Resisting the urge to add "just one small illustration" here is today's clearest test of editorial discipline; the spec is explicit that this screen earns trust by being fast, not persuasive, and the build plan holds that line in the component itself, not just in prose.

### 6.4 `CreateTeamStep.tsx`
- Owns the team-name `Input` (autofocused via a `ref.current.focus()` in a mount effect — the ONE field on this entire flow guaranteed to receive autofocus, since it's the very first interactive control of the very first required step) and renders `TeamSlugField` beneath it, wired to `useCreateTeamStep()`. Slug suggestion-on-click (§4.3) updates the same controlled input the name field derives from, so accepting a suggestion never requires a second round-trip to re-derive the slug — it's already correct the instant it's accepted.

### 6.5 `InviteTeamStep.tsx` + `InviteResultList.tsx` + `InviteResultRow.tsx`
- `InviteTeamStep` owns the chip-input state and the optional `OnboardingSkipConfirm` toggle; on successful submission it swaps its own content area from "the input" to "the InviteResultList" IN PLACE (not a step-transition per §4.1 — this is a within-step content swap, since the user is still notionally "on" the Invite step, just viewing its result rather than its input). The primary button's label and behavior update accordingly (becomes "Continue →" pointing at the next route, per §4.6).
- `InviteResultRow` is the literal shared shape from Day 37's `InviteMemberSheet`, factored out today into its own file specifically so BOTH consumers (Settings' Sheet-wrapped version, Onboarding's bare version) import the identical row component — today's refactor closes a gap the Day 37 spec left implicit ("reused pattern," not yet "reused component file").

### 6.6 `ConnectCalendarStep.tsx`
- Wraps `useConnectCalendarStep()`, which itself wraps the exact `useOAuthConnect` hook built Day 41 for Settings' Integrations page, passing an onboarding-specific return URL. This is the cleanest single proof point in today's entire build that the architecture decisions made three days ago were correct: a hook built for one settings page is reused, unmodified in its core logic, for an entirely different flow.

### 6.7 `OnboardingSkipConfirm.tsx`
- Generic enough to take `{ message, onConfirm, onCancel }` — used identically by both Invite and Connect Calendar steps, zero step-specific logic inside the component itself.

### 6.8 `OnboardingCompleteRedirect.tsx` + the new `/onboarding/complete` route
- Giving this its own route (rather than rendering this state inline atop whichever step was last active) matters for one concrete reason: a real route means a real browser history entry and a real loading boundary, so if the finalize call is slow on a poor connection, Next.js's own `loading.tsx`-equivalent behavior and back-button semantics work correctly without bespoke state-machine handling inside the last step's page component. It's a small structural decision that pays for itself the first time someone tests this flow on throttled 3G.

### 6.9 `useOnboardingStepGuard.ts`
- Called at the top of every step's `page.tsx` (steps 2–4): checks the user's actual completion state from the API (team exists? invites step reached?) against `onboarding-steps.config.ts`'s order, and `redirect()`s backward if a later step is accessed before its prerequisite — protecting against a user bookmarking `/onboarding/invite-team` and landing there on a future session with no team yet. This guard does NOT protect against accessing an *earlier* step again (going back to re-check Create Team after reaching Invite is harmless and allowed).

---

## 7. ⌘K Command Palette — Explicitly Not Extended Today

Unlike Days 41–43, this section exists today only to state its own absence clearly: **no new ⌘K commands are added, because the palette itself does not exist within this route group** (§4.10). This is worth a dedicated, named section in the plan rather than a quiet omission, precisely because every other day this week added a "⌘K integration" section — a reader scanning five consecutive day-plans should never have to wonder "did they forget it, or was it deliberate?" Today's plan answers that explicitly: deliberate.

---

## 8. Accessibility & Keyboard Pass

```
- Every step's primary control receives focus on mount appropriate to that step:
  Welcome's primary button, Create Team's name input, Invite Team's email-chip
  input, Connect Calendar's primary button — confirmed per-step, not a single
  generic "focus the first element" rule that might land somewhere unhelpful
- Enter-key parity (§4.2) verified to never accidentally double-fire when a step
  has both a text input AND a button in focus-traversal range — only the step's
  designated "primary submit" Enter-handler is bound, scoped to that step's form
- Skip-confirm's two text buttons ("Confirm skip" / "Cancel") are both real
  buttons, independently Tab-reachable, with Cancel as a safe early return —
  not a destructive-style ordering despite this being a much lower-stakes
  confirm than Day 41/42's AlertDialogs
- Progress bar communicates step position to screen readers via an
  `aria-label="Step 2 of 4: Create team"` on the bar's container, not solely
  through the visual percentage width
- Calendar-connect button's disabled+Tooltip state (§4.8) is reachable and
  announces its reason on keyboard focus, identical discipline to Day 41/43's
  disabled-control patterns
- Full flow completable start to finish via keyboard alone: Tab/Shift+Tab,
  Enter, and Esc (for skip-confirm cancel) are the only keys required
```

---

## 9. QA / End-of-Day Checklist

```
TYPOGRAPHY
  [ ] Exactly one Plus Jakarta Sans element per step (the headline) — audited across
      all four steps plus the complete screen, confirmed no second heading-weight text exists
  [ ] Poppins appears ONLY if the invite-result summary count is implemented, and even
      then nowhere else on the flow — confirmed by direct inspection, not assumption

LAYOUT
  [ ] OnboardingStepShell renders identically (480px max-width, no border/Card) across
      all four steps and the complete screen
  [ ] No layout shift when TeamSlugField's feedback text appears/changes length
      (idle → checking → available/taken)

MICRO-INTERACTIONS
  [ ] Step transition (§4.1) measured at exactly the spec'd 100ms-out / 140ms-in timing,
      matches the platform's existing Sheet entrance constants byte-for-byte (same
      shared animation token, not independently re-tuned)
  [ ] Enter key advances each step identically to a click, including the same disabled-
      during-mutation guard against double-submission
  [ ] Primary button shows the 80ms "pressed" opacity dip on BOTH click and Enter trigger
  [ ] TeamSlugField debounce timing (350ms) and feedback states confirmed pixel-identical
      to Settings' Day 40 implementation — same component, not a visually-similar fork
  [ ] Forced slug race condition (two near-simultaneous submits, same name) resolves to
      an indistinguishable "taken, try X" state — never a raw 409 error surfaced to the user
  [ ] Chip input: comma/Enter commits, invalid-format chip shows neutral "invalid" caption
      (not a red border), 20-chip max correctly blocks further input with a static caption
  [ ] InviteResultList's three outcome types render with three distinct but equally-neutral
      text treatments — confirmed no color differentiates "worked" from "no-op"
  [ ] Skip-confirm replaces the link in place with zero layout shift to surrounding content;
      Cancel reverts instantly with no confirmation-of-cancel required
  [ ] Calendar-connect button's env-absent disabled+Tooltip state verified by actually
      unsetting GOOGLE_CLIENT_ID/SECRET locally, not just code-reviewed
  [ ] OAuth return query param is read exactly once and stripped via router.replace();
      Connect Calendar step auto-advances on success without requiring a manual Continue click
  [ ] OnboardingCompleteRedirect's displayed duration matches actual mutation time —
      confirmed via network throttling test that no artificial setTimeout padding exists

⌘K
  [ ] Pressing ⌘K on all four step routes AND /onboarding/complete confirmed to do
      nothing — verified by inspecting the DOM for absence of the palette's root element,
      not just by visual non-appearance

ACCESSIBILITY
  [ ] Full flow completed keyboard-only, start to finish, zero mouse interaction
  [ ] Each step's appropriate control receives autofocus on mount, verified per-step
  [ ] Progress bar's aria-label correctly announces current step to screen readers

END-TO-END TIMING
  [ ] Full flow timed manually (register → verify → onboard → dashboard) stays under
      the 90-second median target on a representative connection
  [ ] useOnboardingStepGuard correctly redirects backward when a later step's route is
      accessed before its prerequisite is met (tested via direct URL navigation)
```

---

## 10. What Tomorrow (Day 45) Inherits From Today

- The step-transition motion constants (100ms-out/140ms-in, opacity+4px-translateY) are now confirmed reused identically across Sheets, dropdowns, AND full-step navigation — Day 45's mobile pass can treat "this exact timing" as the one universal motion contract to verify hasn't drifted anywhere across the whole app, rather than auditing each surface's animation independently
- `useOnboardingStepGuard`'s pattern of deriving reachability/redirect logic from a typed config + live completion state is the clearest model yet for any future guarded-route logic Day 45's error-boundary audit might need to formalize elsewhere
- The deliberate, documented absence of a feature (⌘K, §7) — rather than a silent omission — is itself a process worth carrying into Day 45's full design-language audit: where something is intentionally NOT present, the audit should look for an explicit note confirming that, not just confirm the audit didn't stumble over a bug
- `InviteResultRow`'s extraction into a standalone file (closing the Day 37 "pattern, not yet component" gap) is the model for Day 45's own broader pass: any place this week's plans said "reused pattern" without naming a shared file is a candidate for the same kind of closing refactor

---

*Document: BUILD-PLAN-DAY-44 | Vocaply | Version 1.0*
*Track: Core Frontend Dashboard (Phase 3) — Onboarding: 4-Step Wizard*
*Typography: Plus Jakarta Sans (one headline per step, nowhere else) · Inter (everything else) · Poppins (invite-count summary only, if present)*
