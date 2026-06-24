Day 29 — Meeting Detail Page Build Plan

Shared Tab Shell · Overview Tab · Summary · Participants · Timeline · Destructive Actions


Senior Frontend Architecture Edition · Linear/Jira-grade Detail/Drill-Down Screen
Stack: Next.js 14 (App Router, RSC, nested layouts) · TypeScript strict · Tailwind · shadcn/ui
Document: DAY29-MEETING-DETAIL-001 | Version 1.0




0. Why This Day Is a Different Class of Problem Than Days 27–28

Days 27–28 were about lists — many items, one shape, filtered and paginated. Day 29 is the first detail/drill-down page: one item, many facets (overview, transcript, action items, commitments), viewed through tabs. The architectural risk here is subtle and almost invisible until you build it wrong: if each tab is implemented as "its own page that happens to share a header component," every tab switch re-fetches the meeting, re-renders the title, and flickers the header for a frame. The fix — a shared layout.tsx that owns the meeting fetch once — is the entire intellectual content of today, and it is the pattern Commitments detail, Team member profile (Day 38), and every future tabbed entity in the product will copy verbatim.

Definition of done: clicking between Overview/Transcript/Action Items/Commitments tabs feels like switching panels in a desktop app — the header, status badge, and tab bar never blink, never re-fetch, never shift by a pixel — only the panel content below changes.


1. Typography Application (carrying forward Day 26–28 tokens, one new contextual use)

ELEMENT                              TOKEN                            FAMILY
─────────────────────────────────────────────────────────────────────────────
MeetingDetailHeader title             text-base-heading (15px/600)     font-heading (Jakarta) —
                                                                         same role as PageHeader's <h1>,
                                                                         since this header REPLACES
                                                                         PageHeader on detail pages
Header meta line (platform·duration)  text-xs (12px) tabular-nums       font-sans (Inter), muted
MeetingDetailTabs labels                text-sm (13px) / 500 active      font-sans (Inter)
BotStatusBanner text                    text-xs (12px) / 500              font-sans (Inter)
MeetingSummaryBlock bullets             text-sm (13px/20px line-height)  font-sans (Inter) — body text,
                                                                         NOT a heading font, explicitly
                                                                         because it must read as plain
                                                                         notes, not as a "feature" of the UI
MeetingTimeline event labels            text-xs (12px)                    font-sans (Inter)
MeetingTimeline timestamps               text-2xs (11px) tabular-nums      font-sans (Inter), muted
ConfirmModal/AlertDialog title           text-base-heading (15px/600)     font-heading (Jakarta) — every
                                                                         dialog title in the product
                                                                         from today forward uses this,
                                                                         locking the pattern early

The one naming decision worth stating outright: MeetingDetailHeader's title uses the same text-base-heading/Jakarta combination as PageHeader's <h1> — because on a detail page, MeetingDetailHeader is the page header, just one with extra chrome (status badge, platform icon, actions menu) bolted onto it. Detail pages never render a separate PageHeader above their custom header; that would be two competing "this is the title" signals stacked on top of each other, which is a real mistake worth pre-empting in writing before anyone is tempted to do it on Day 33's Commitments detail page.


2. The Shared Layout Architecture (the entire point of the day)

2.1 The anti-pattern, stated precisely

❌ WRONG: each tab route independently fetches the meeting

app/(dashboard)/meetings/[meetingId]/
  page.tsx              → fetches meeting, renders <Header> + <Overview>
  transcript/page.tsx   → fetches meeting AGAIN, renders <Header> + <Transcript>
  action-items/page.tsx → fetches meeting AGAIN, renders <Header> + <ActionItems>

Result: switching tabs = full header re-fetch + re-mount + visible flash,
        3x the network calls for data that never changes between tabs,
        and a real risk of the header showing STALE data on one tab if
        the meeting was just updated and only some routes' caches refreshed.

✅ CORRECT: layout.tsx fetches once, tabs render only their own slice

app/(dashboard)/meetings/[meetingId]/
  layout.tsx             → fetches meeting ONCE per navigation into this route segment
                           → renders MeetingDetailHeader + BotStatusBanner + MeetingDetailTabs
                           → renders {children} below the tab bar
  page.tsx               → Overview tab content ONLY — no meeting fetch, receives nothing extra
  transcript/page.tsx    → Transcript tab content ONLY (Day 30)
  action-items/page.tsx  → Action Items tab content ONLY (Day 31)
  commitments/page.tsx   → Commitments tab content ONLY (Day 31)

tsx// app/(dashboard)/meetings/[meetingId]/layout.tsx
export default async function MeetingDetailLayout({
  children, params,
}: { children: React.ReactNode; params: { meetingId: string } }) {
  const meeting = await getMeetingDetail(params.meetingId)   // 404s via notFound() if cross-tenant
  if (!meeting) notFound()

  return (
    <PageContainer>
      <MeetingDetailHeader meeting={meeting} />
      {meeting.status === 'BOT_JOINING' || meeting.status === 'RECORDING' ? (
        <BotStatusBanner status={meeting.status} />
      ) : null}
      <MeetingDetailTabs meetingId={meeting.id} />
      <div className="mt-4">{children}</div>
    </PageContainer>
  )
}

2.2 How tab content still gets meeting data without re-fetching

Each child page.tsx (Overview today, Transcript/Action Items/Commitments later) genuinely does need pieces of the meeting object (e.g., Overview needs meeting.summary, meeting.participants; Transcript needs meeting.mongoTranscriptId). Re-fetching per tab is wrong, but so is prop-drilling through Next.js's layout/page boundary, which does not support passing custom props between a layout.tsx and its page.tsx — they are independently rendered segments by design.

THE SOLUTION: React `cache()` + a shared server-only data-loader function.

features/meetings/api/meetings.queries.ts:

  import { cache } from 'react'
  import 'server-only'

  export const getMeetingDetail = cache(async (meetingId: string) => {
    return serverApiClient.get<MeetingDetail>(`/meetings/${meetingId}`, {
      params: { include: 'participants,decisions,blockers' },
    })
  })

React's cache() memoizes the function PER REQUEST (per server render pass) —
calling getMeetingDetail('mtg_01') from layout.tsx AND from page.tsx during
the SAME navigation hits the network exactly once; the second call returns
the already-resolved promise/result from the request-scoped memo. This is
the official Next.js-recommended pattern for "multiple Server Components in
one render tree need the same data" — it looks like duplicate fetches in the
code, but is a SINGLE network call at runtime.

tsx// app/(dashboard)/meetings/[meetingId]/page.tsx (Overview tab)
export default async function MeetingOverviewPage({ params }: { params: { meetingId: string } }) {
  const meeting = await getMeetingDetail(params.meetingId)   // cache() hit — no second network call
  return <MeetingOverviewTab meeting={meeting} />
}

This is the single most important engineering insight of the day. It resolves the apparent contradiction between "layout.tsx fetches once" and "page.tsx also needs the data" without inventing a custom context-passing mechanism, a global store, or prop-drilling hacks — it uses a documented React/Next.js primitive exactly as intended. Every future tabbed-detail page in the product (Commitments detail, Member profile) reuses this exact cache()-wrapped loader pattern.

2.3 Tabs as real routes, not client-side state

tsx// MeetingDetailTabs.tsx
const TABS = [
  { href: '',              label: 'Overview' },
  { href: '/transcript',    label: 'Transcript' },
  { href: '/action-items',  label: 'Action items' },
  { href: '/commitments',   label: 'Commitments' },
]

export function MeetingDetailTabs({ meetingId }: { meetingId: string }) {
  const pathname = usePathname()
  const base = `/meetings/${meetingId}`

  return (
    <nav className="flex gap-5 border-b border-border" aria-label="Meeting sections">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`
        const isActive = pathname === href
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              'relative h-9 text-sm text-muted-foreground transition-colors duration-120',
              'hover:text-foreground flex items-center',
              isActive && 'text-foreground font-medium'
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-foreground rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

Why a bottom-border indicator, not a background pill: matches the Day 26 sidebar's "2px indicator bar, no fill block" visual language exactly — the same restraint principle applied to a different axis (horizontal underline instead of vertical left-bar). Establishing one visual grammar for "this is currently selected/active" and reusing it across sidebar nav, tab bars, and (later) any segmented control is what makes the whole product feel designed by one hand rather than assembled from disconnected shadcn examples.

Why real <Link> routes instead of a client Tabs component with useState: stated in the spec already, but the consequence is worth being explicit about — Transcript's virtualizer (@tanstack/react-virtual, Day 30) and its associated JS only get fetched by Next.js's code-splitting when a user actually navigates to /meetings/:id/transcript. A useState-driven tab component would mount all four tab panels' components into one client bundle for the route, even if the user only ever looks at Overview. This is a real, measurable bundle-size win, not a theoretical one.


3. File Structure (final, build order annotated)

app/(dashboard)/meetings/[meetingId]/
  layout.tsx                       ← 5. The fetch-once shell — built AFTER its children exist below,
                                         since it composes them
  page.tsx                         ← 6. Overview route — thin, calls cache()'d loader + renders tab
  loading.tsx                      ← 7. Header+tabs skeleton (persists across tab switches) +
                                         Overview content skeleton
  error.tsx                        ← 7. Route-level error boundary
  not-found.tsx                    ← 8. NEW (not in original list) — explicit 404 UI for
                                         cross-tenant/non-existent meetingId, see §7

features/meetings/components/MeetingDetail/
  MeetingDetailHeader.tsx          ← 1. Built first — defines what "header" means for this entity
  MeetingDetailActionsMenu.tsx     ← 2. Built alongside header (header renders it as a slot)
  BotStatusBanner.tsx              ← 2. Independent, built in parallel — no dependency on header internals
  MeetingDetailTabs.tsx            ← 3. Built once header exists, since it sits directly below it
  MeetingOverviewTab.tsx           ← 4. Composes the three pieces below
  MeetingSummaryBlock.tsx          ← 4. Leaf
  MeetingParticipantsList.tsx      ← 4. Leaf
  MeetingTimeline.tsx              ← 4. Leaf

shared/components/feedback/
  ConfirmModal.tsx                 ← 0. Built FIRST of everything today — both Delete and
                                         (future) Remove-bot actions depend on it existing

Build order rationale


ConfirmModal first — it's a zero-dependency, generic primitive (AlertDialog wrapper) that the destructive-action menu needs immediately; building it last would mean stubbing the menu with a fake confirm and circling back.
MeetingDetailHeader + its two slot components second — the header is the visual anchor every other piece sits below; its exact height and padding need to be locked before loading.tsx's skeleton can be written accurately.
Tab bar third — depends on knowing the header's final markup so it can be positioned directly beneath it with the correct border-t/mt relationship (no double borders, no extra gap).
Overview tab leaves fourth — independent of each other, can be built in any order or in parallel by multiple engineers in a real team setting.
5–8. Layout, page, loading, not-found last — these are the assembly/wiring files; nothing about them can be finalized until the components they compose exist.



4. Microinteraction & Pattern Catalogue

4.1 MeetingDetailActionsMenu — the first destructive-action pattern in the product

tsxexport function MeetingDetailActionsMenu({ meeting, userRole }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const canManage = ROLE_LEVEL[userRole] >= ROLE_LEVEL.ADMIN

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Meeting actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canManage && (
            <DropdownMenuItem onSelect={() => reprocessMeeting(meeting.id)}>
              <RefreshCw className="h-3.5 w-3.5" /> Reprocess
            </DropdownMenuItem>
          )}
          {meeting.status !== 'DONE' && (
            <DropdownMenuItem onSelect={() => removeBot(meeting.id)}>
              <XCircle className="h-3.5 w-3.5" /> Remove bot
            </DropdownMenuItem>
          )}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmOpen(true)}
                className="text-[--danger] focus:text-[--danger] focus:bg-[--danger]/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete meeting
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this meeting?"
        description="This permanently removes the meeting, transcript, and all extracted commitments and action items. This cannot be undone."
        confirmLabel="Delete meeting"
        variant="destructive"
        onConfirm={() => deleteMeeting(meeting.id)}
      />
    </>
  )
}

tsx// shared/components/feedback/ConfirmModal.tsx — the generic, reused-forever primitive
interface ConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void | Promise<void>
}

export function ConfirmModal({ open, onOpenChange, title, description, confirmLabel, variant = 'default', onConfirm }: ConfirmModalProps) {
  const [isPending, setIsPending] = useState(false)

  async function handleConfirm() {
    setIsPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-base-heading">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(variant === 'destructive' && 'bg-[--danger] hover:bg-[--danger]/90 text-white')}
          >
            {isPending ? 'Deleting…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

Three microinteraction details worth naming individually:


isPending disables both buttons and changes the action label to a verb-ing state ("Deleting…") — this prevents the classic double-submit bug (user double-clicks a slow destructive action and fires it twice) and gives explicit feedback that the click registered, rather than leaving the user staring at an unresponsive dialog.
The destructive variant overrides the button's color to --danger only at the point of final confirmation — the trigger (DropdownMenuItem) is also tinted red as an earlier warning signal, so the danger signal appears twice, at increasing intensity, before anything irreversible happens. This graduated-warning pattern is standard in mature products (GitHub's repo-delete flow does the same thing) and is being locked in here as the only sanctioned destructive-action pattern for the rest of the build — Team member removal, Commitment cancellation, and any future "delete X" all route through this exact component.
Errors inside onConfirm are caught and toast'd, not thrown to an error boundary — a failed delete should never blank the whole detail page; it should tell the user it failed and let them try again, with the dialog still open.


4.2 BotStatusBanner — restrained live-state signaling

tsxexport function BotStatusBanner({ status }: { status: 'BOT_JOINING' | 'RECORDING' }) {
  const copy = status === 'BOT_JOINING'
    ? { dot: 'bg-[--warning]', label: 'Bot is joining the meeting…' }
    : { dot: 'bg-[--danger]',  label: 'Recording live' }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', copy.dot)} />
      {copy.label}
    </div>
  )
}

Deliberately a neutral-bordered, surface-background strip with only the small dot carrying color and motion — not a full red/amber banner background. A loud colored banner reads as an alert/error; this is neither — it's informational, ambient awareness, which is exactly why it borrows the restrained bg-surface treatment instead of a Bootstrap-style alert component. This is the same "color carries only the minimum necessary signal" rule already established for StatusDot and MeetingStatusBadge on Day 28, applied to a third, larger surface.

4.3 MeetingParticipantsList — overlapping avatars with progressive disclosure

tsxexport function MeetingParticipantsList({ participants }: { participants: Participant[] }) {
  const visible = participants.slice(0, 5)
  const remaining = participants.slice(5)

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {visible.map((p) => (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <Avatar className="h-6 w-6 ring-2 ring-background">
                <AvatarImage src={p.avatarUrl} />
                <AvatarFallback className="text-2xs">{getInitials(p.name)}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom">{p.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {remaining.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="ml-1.5 flex h-6 items-center rounded-full border border-border
                                bg-surface px-2 text-2xs text-muted-foreground
                                hover:bg-surface-hover transition-colors duration-120">
              +{remaining.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1.5">
            <ul className="space-y-0.5">
              {remaining.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={p.avatarUrl} />
                    <AvatarFallback className="text-2xs">{getInitials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 truncate">
                    <div className="truncate text-xs text-foreground">{p.name}</div>
                    {p.email && <div className="truncate text-2xs text-muted-foreground">{p.email}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

The ring-2 ring-background detail on each avatar is what creates the "cut-out" overlap illusion — without a ring matching the page background color exactly, overlapping avatars just look like they're stacked behind each other with visible square corners; the ring simulates a circular cutout against whatever the avatar sits on. This single CSS trick is the difference between "amateur overlapping circles" and the polished overlapping-avatar-stack seen in every mature collaboration product (Linear, Notion, Figma all use the same technique).

Individual hover Tooltips on the first five avatars (showing name) plus a Popover for the overflow is a deliberate two-tier disclosure: a quick hover answers "who is that" for the visible avatars without any click; a click is only required for the truly long tail, and that click surfaces both name and email, since at that point the user has shown enough intent to want more detail.

4.4 MeetingTimeline — debug-friendly, support-ticket-reducing audit trail

tsxconst TIMELINE_STEPS: { status: MeetingStatus; label: string }[] = [
  { status: 'SCHEDULED',   label: 'Scheduled' },
  { status: 'BOT_JOINING', label: 'Bot joining' },
  { status: 'RECORDING',   label: 'Recording started' },
  { status: 'PROCESSING',  label: 'Processing transcript' },
  { status: 'DONE',        label: 'Completed' },
]

export function MeetingTimeline({ meeting }: { meeting: MeetingDetail }) {
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.status === meeting.status)
  const isFailed = meeting.status === 'FAILED'

  return (
    <ol className="relative">
      {TIMELINE_STEPS.map((step, i) => {
        const reached = isFailed ? i <= currentIndex : i <= currentIndex
        const timestamp = getTimestampForStep(meeting, step.status)
        return (
          <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < TIMELINE_STEPS.length - 1 && (
              <span className={cn(
                'absolute left-[3px] top-3 h-full w-px',
                reached ? 'bg-foreground/30' : 'bg-border'
              )} />
            )}
            <span className={cn(
              'relative z-10 mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
              reached ? 'bg-foreground' : 'bg-border'
            )} />
            <div className="flex-1">
              <div className={cn('text-xs', reached ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </div>
              {timestamp && (
                <RelativeTime date={timestamp} className="text-2xs" />
              )}
            </div>
          </li>
        )
      })}
      {isFailed && (
        <li className="relative flex gap-3 text-[--danger]">
          <span className="relative z-10 mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[--danger]" />
          <div className="text-xs">Failed{meeting.processingError ? `: ${meeting.processingError}` : ''}</div>
        </li>
      )}
    </ol>
  )
}

Why this exists at all, product-wise: the backend design docs note meetings can fail at multiple stages (bot.failed with several distinct reasons), and without a visible trail, every failure becomes a support ticket ("why didn't my meeting process?"). This timeline turns that into a self-service answer — a user can see exactly which stage was reached and, on failure, the literal error reason, directly on the page. This is the kind of feature that has outsized leverage relative to its build cost: it's a simple vertical list of dots, but it eliminates an entire category of support load.


5. MeetingSummaryBlock — the "not look like AI" requirement, executed precisely

tsxexport function MeetingSummaryBlock({ summary }: { summary: string | null }) {
  if (!summary) {
    return (
      <Card className="p-4">
        <h3 className="mb-2 text-xs font-medium text-foreground">Summary</h3>
        <p className="text-xs text-muted-foreground">
          {/* meeting still processing, or summary generation pending */}
          Summary will appear once the meeting finishes processing.
        </p>
      </Card>
    )
  }

  const bullets = summary.split('\n').filter(Boolean)

  return (
    <Card className="p-4">
      <h3 className="mb-2.5 text-xs font-medium text-foreground">Summary</h3>
      <ul className="space-y-1.5">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span className="flex-1">{stripLeadingBulletChar(bullet)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

Concrete contrast with what was explicitly avoided: no rounded-gradient avatar with a sparkle icon labeled "AI Summary," no typewriter/shimmer reveal animation, no chat-bubble background tint, no "✨" emoji decoration. The card header just says "Summary" — the same way a Card header would say "Participants" or "Timeline." The content renders as a plain bulleted list using the same small-dot bullet style as everything else in the app (matching, e.g., FAQAccordion-style bullets if any exist in marketing, and matching MeetingTimeline's own dot language). The deliberate effect: a user should not be able to tell, from styling alone, that this particular card's content was machine-generated versus manually typed meeting notes — which is exactly the brief.


6. loading.tsx — header-persists, content-skeletons pattern

tsx// app/(dashboard)/meetings/[meetingId]/loading.tsx
export default function MeetingDetailLoading() {
  return (
    <PageContainer>
      {/* Header skeleton mirrors MeetingDetailHeader's exact height/padding */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      {/* Tab bar skeleton — 4 pills, matches MeetingDetailTabs height exactly */}
      <div className="mt-3 flex gap-5 border-b border-border pb-0">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-2 h-3 w-16" />)}
      </div>
      {/* Overview content skeleton */}
      <div className="mt-4 grid grid-cols-12 gap-4">
        <Skeleton className="col-span-8 h-40 rounded-md" />
        <Skeleton className="col-span-4 h-40 rounded-md" />
      </div>
    </PageContainer>
  )
}

Important subtlety, stated explicitly because it's easy to get backward: this loading.tsx fires on the initial navigation into /meetings/[meetingId] from anywhere else in the app (e.g., clicking a row in Day 28's list). It does not fire again when switching between Overview/Transcript/Action Items/Commitments tabs within an already-loaded meeting — because those tab switches are sibling-route navigations under the same layout.tsx, and Next.js only re-suspends the {children} slot, not the whole route segment, for sibling page transitions where the layout itself isn't remounting. This is precisely the "header skeleton persists across tab loads since it's in the parent layout's Suspense boundary, only the tab content skeleton shows on tab switch" requirement from the spec — and it's a consequence of the layout/page split in §2, not separate work.


7. Tenant Isolation & Error Surfaces — "never leak existence"

tsx// features/meetings/api/meetings.queries.ts
export const getMeetingDetail = cache(async (meetingId: string) => {
  try {
    return await serverApiClient.get<MeetingDetail>(`/meetings/${meetingId}`)
  } catch (err) {
    if (isApiError(err, 'NOT_FOUND') || isApiError(err, 'FORBIDDEN')) {
      return null   // layout.tsx converts a null return into notFound() — see §2.1
    }
    throw err   // genuine server errors still bubble to error.tsx
  }
})

tsx// not-found.tsx (route-scoped, NEW file added beyond the original spec list)
export default function MeetingNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={SearchX}
        title="Meeting not found"
        subtitle="It may have been deleted, or you may not have access to it."
        action={<Button size="sm" variant="outline" asChild><Link href="/meetings">Back to meetings</Link></Button>}
      />
    </PageContainer>
  )
}

Why a 404, never a 403, regardless of the real backend reason: per the explicit checklist requirement, "never leak existence" — if a meeting belonging to Team B returned a different error/message than a meeting that truly doesn't exist, a malicious or merely curious user from Team A could enumerate other teams' meeting IDs by observing which error they get back. Collapsing both NOT_FOUND and FORBIDDEN into the exact same not-found.tsx UI, with identical copy, is a small but real security-hygiene decision, and it's why this case gets its own dedicated file rather than being handled ad hoc inside error.tsx (which is reserved for genuine 5xx/unexpected failures with a "Try again" affordance — a 404 should never offer a retry button, since retrying changes nothing).


8. Components Installed/Used Today

dropdown-menu (reused, now with destructive-styled item), popover (reused), avatar + overlap-ring pattern (new usage), alert-dialog (new today — powers ConfirmModal), separator (reused), badge (reused), tooltip (reused, Day 26 origin).


9. Performance Notes

CONCERN                                    DECISION
─────────────────────────────────────────────────────────────────────────────
Meeting fetched twice in code               cache() ensures ONE network call per
(layout.tsx + page.tsx)                     request — verified by checking server
                                            logs/network panel show exactly 1 call
Tab bundle isolation                        Transcript/Action Items/Commitments tab
                                            JS never loads until that route is visited
                                            (Next.js route-level code splitting — free,
                                            requires no manual dynamic() import)
Header re-render on tab switch              Does NOT happen — layout.tsx is not remounted
                                            for sibling page navigations, verified via a
                                            console.log inside MeetingDetailHeader that
                                            should fire exactly once per meeting visit,
                                            not once per tab click


10. End-of-Day Checklist

SHARED LAYOUT CORRECTNESS
  [ ] Switching tabs does not re-fetch the meeting (verified via network panel, single GET)
  [ ] Switching tabs does not visibly flash/remount the header or tab bar
  [ ] Each tab is independently deep-linkable (paste /meetings/:id/transcript directly — works)
  [ ] cache() confirmed deduplicating layout.tsx + page.tsx calls to the same meetingId

DESTRUCTIVE ACTIONS
  [ ] Delete requires ConfirmModal confirmation, cannot be triggered by a single click
  [ ] Delete/Reprocess menu items hidden entirely for MEMBER role (not just disabled)
  [ ] Failed delete shows a toast, dialog stays open, no silent failure
  [ ] Double-click on confirm button does not fire the delete twice (isPending guard verified)

VISUAL CORRECTNESS
  [ ] BotStatusBanner shows only for BOT_JOINING/RECORDING, absent otherwise
  [ ] Participants: ≤5 shows flat avatar row, >5 shows "+N" popover correctly
  [ ] Avatar overlap ring renders correctly in both light and dark mode
  [ ] MeetingTimeline correctly grays out future (not-yet-reached) steps
  [ ] MeetingTimeline shows the FAILED branch with error reason when applicable
  [ ] MeetingSummaryBlock renders as plain bullets — no chat/AI styling present anywhere

TENANT ISOLATION
  [ ] Visiting another team's meetingId shows the identical not-found.tsx as a truly
      nonexistent ID (byte-for-byte same response, verified by comparing both manually)
  [ ] error.tsx (5xx) and not-found.tsx (404/403) are visually distinct from each other
      (error.tsx offers Retry, not-found.tsx offers "Back to meetings" only)

TYPOGRAPHY
  [ ] MeetingDetailHeader title uses font-heading, matching PageHeader's own <h1> treatment
  [ ] No competing PageHeader is rendered above MeetingDetailHeader on any detail route
  [ ] AlertDialog title uses font-heading — locked as the standard for all future dialogs


Document: DAY29-MEETING-DETAIL-001 | Vocaply | Day 29 — Meeting Detail Page (Overview)
The shared-layout, cache()-deduplicated, route-based-tabs pattern that every future detail page in the product inherits.
