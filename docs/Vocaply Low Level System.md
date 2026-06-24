# Vocaply — Low Level System Design (LLD)
> AI Meeting Intelligence SaaS | Component-Level Design | Implementation Blueprint
> Version 1.0 | May 2026

---

## Table of Contents

1. [Auth System — Detailed Design](#1-auth-system--detailed-design)
2. [JWT & Session Management](#2-jwt--session-management)
3. [Meeting Pipeline — State Machine](#3-meeting-pipeline--state-machine)
4. [Recall.ai Webhook Handler](#4-recallai-webhook-handler)
5. [AI Extraction Service — Internal Design](#5-ai-extraction-service--internal-design)
6. [Commitment Resolver Algorithm](#6-commitment-resolver-algorithm)
7. [Cross-Meeting Memory System](#7-cross-meeting-memory-system)
8. [Commitment Score Calculation](#8-commitment-score-calculation)
9. [Calendar Sync & Bot Deduplication](#9-calendar-sync--bot-deduplication)
10. [Queue Worker — Internal Design](#10-queue-worker--internal-design)
11. [Deadline Alert System](#11-deadline-alert-system)
12. [Notification Routing Engine](#12-notification-routing-engine)
13. [Integration OAuth Flow](#13-integration-oauth-flow)
14. [Token Encryption Design](#14-token-encryption-design)
15. [Multi-Tenant Middleware Chain](#15-multi-tenant-middleware-chain)
16. [Rate Limiting System](#16-rate-limiting-system)
17. [Real-Time Event System — Socket.io Design](#17-real-time-event-system--socketio-design)
18. [Frontend State Architecture](#18-frontend-state-architecture)
19. [API Response Contract](#19-api-response-contract)
20. [Database Schema — Complete DDL](#20-database-schema--complete-ddl)
21. [Redis Key Space Design](#21-redis-key-space-design)
22. [MongoDB Document Schema](#22-mongodb-document-schema)
23. [Error Handling & Classification](#23-error-handling--classification)
24. [Idempotency Design](#24-idempotency-design)

---

## 1. Auth System — Detailed Design

### Component Responsibilities

```
auth.controller.ts    — HTTP layer only. Reads req, calls service, writes res.
                        No business logic whatsoever.

auth.service.ts       — All business logic. Orchestrates repository calls.
                        Handles all auth flows end-to-end.

auth.repository.ts    — Database queries only. All Prisma calls live here.
                        Returns domain objects, never raw Prisma types.

auth.validator.ts     — Zod schemas for all request bodies.
                        Validation middleware calls these before controllers.
```

### Registration Flow — Step by Step

```
POST /auth/register
{ name, email, password }

auth.validator.ts:
  registerSchema = z.object({
    name:     z.string().min(2).max(100),
    email:    z.string().email().toLowerCase(),
    password: z.string()
      .min(8).max(128)
      .regex(/[A-Z]/, "Must contain uppercase")
      .regex(/[0-9]/, "Must contain number")
      .regex(/[^A-Za-z0-9]/, "Must contain special char")
  })

auth.service.register():
  1. existingUser = await repo.findByEmail(email)
     IF existingUser → throw DuplicateError("EMAIL_TAKEN")

  2. passwordHash = await bcrypt.hash(password, 12)

  3. user = await repo.create({
       id: cuid(),
       email: email.toLowerCase(),
       name,
       passwordHash,
       emailVerified: false,
       failedAttempts: 0,
       createdAt: new Date()
     })

  4. verificationToken = crypto.randomBytes(32).toString('hex')  // 64-char hex
     tokenHash = createHash('sha256').update(verificationToken).digest('hex')
     expiresAt = addHours(new Date(), 24)

  5. await repo.createEmailVerificationToken({
       userId: user.id,
       tokenHash,
       expiresAt
     })

  6. await emailService.sendVerificationEmail({
       to: email,
       name,
       verificationUrl: `${FRONTEND_URL}/verify-email?token=${verificationToken}`
       // Send original token in URL — only hash stored in DB
     })

  7. return { message: "Registration successful. Check your email." }
     // NEVER return user object or token on register — unverified account
```

### Login Flow — Step by Step

```
POST /auth/login
{ email, password }

auth.service.login():
  1. user = await repo.findByEmail(email)

  2. IF !user:
       // Fake bcrypt comparison to prevent timing attack
       await bcrypt.compare(password, FAKE_HASH)
       throw UnauthorizedError("INVALID_CREDENTIALS")
       // Same error message as wrong password — never reveal if email exists

  3. IF user.lockedUntil && user.lockedUntil > new Date():
       minutesRemaining = Math.ceil((user.lockedUntil - Date.now()) / 60000)
       throw RateLimitError("ACCOUNT_LOCKED", { minutesRemaining })

  4. IF !user.emailVerified:
       throw ForbiddenError("EMAIL_NOT_VERIFIED")

  5. IF !user.passwordHash:
       throw UnauthorizedError("USE_OAUTH")
       // User registered via Google/GitHub only — no password set

  6. passwordMatch = await bcrypt.compare(password, user.passwordHash)

  7. IF !passwordMatch:
       newAttempts = user.failedAttempts + 1
       lockedUntil = newAttempts >= 5 ? addMinutes(new Date(), 15) : null
       await repo.updateFailedAttempts(user.id, newAttempts, lockedUntil)
       throw UnauthorizedError("INVALID_CREDENTIALS")

  8. // Password correct — reset failed attempts
     await repo.resetFailedAttempts(user.id)
     await repo.updateLastLogin(user.id)

  9. // Generate tokens
     accessToken = generateAccessToken(user)      // 15 min JWT
     refreshToken = generateRefreshToken()         // 32 random bytes hex
     refreshTokenHash = sha256(refreshToken)

  10. await repo.createRefreshToken({
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: addDays(new Date(), 30),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      })

  11. // Set HttpOnly cookie (never in response body)
      res.cookie('vocaply_refresh', refreshToken, {
        httpOnly:  true,
        secure:    NODE_ENV === 'production',
        sameSite:  'strict',
        path:      '/auth/refresh',  // Only sent to this specific path
        expires:   addDays(new Date(), 30)
      })

  12. return {
        accessToken,   // Client stores in Zustand memory ONLY
        user: {
          id, name, email, avatarUrl, timezone,
          role, teamId, team: { id, name, slug, plan }
        }
      }
```

### Token Refresh — Rotation Design

```
POST /auth/refresh
Cookie: vocaply_refresh=<refresh_token>

auth.service.refreshTokens():
  1. refreshToken = req.cookies.vocaply_refresh
     IF !refreshToken → throw UnauthorizedError("NO_REFRESH_TOKEN")

  2. tokenHash = sha256(refreshToken)

  3. storedToken = await repo.findRefreshToken(tokenHash)
     IF !storedToken → throw UnauthorizedError("INVALID_REFRESH_TOKEN")
     IF storedToken.expiresAt < new Date() → throw UnauthorizedError("REFRESH_TOKEN_EXPIRED")

  4. user = await repo.findById(storedToken.userId)
     IF !user → throw UnauthorizedError("USER_NOT_FOUND")

  5. // Token rotation — old token deleted, new token issued
     await repo.deleteRefreshToken(storedToken.id)

  6. newAccessToken = generateAccessToken(user)
     newRefreshToken = generateRefreshToken()
     newTokenHash = sha256(newRefreshToken)

  7. await repo.createRefreshToken({
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt: addDays(new Date(), 30)
      })

  8. // Set new cookie + return new access token
     res.cookie('vocaply_refresh', newRefreshToken, { ...cookieOptions })
     return { accessToken: newAccessToken }

WHY ROTATION MATTERS:
  If an attacker steals a refresh token and uses it,
  the next time the legitimate user refreshes (old token gone),
  they get a 401 → logout → attacker's token also revoked.
  This detects refresh token theft.
```

---

## 2. JWT & Session Management

### JWT Payload Design

```typescript
// JWT Access Token — signed with HMAC-SHA256
interface JwtPayload {
  sub:    string    // userId — "usr_clx01abc"
  teamId: string    // current team — "team_clx02xyz"
  role:   UserRole  // "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"
  email:  string    // included for logging context
  iat:    number    // issued at (unix timestamp)
  exp:    number    // expires at (iat + 900 seconds = 15 min)
}

// Token generation
function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      sub:    user.id,
      teamId: user.teamId,
      role:   user.role,
      email:  user.email,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer:    'vocaply.com',
      audience:  'vocaply-api',
    }
  )
}

// Refresh token — NOT a JWT, just a random opaque string
function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')  // 64-char hex string
  // Only SHA-256 hash is stored in DB — original never persisted
}
```

### Auth Middleware Chain

```typescript
// middleware/auth.middleware.ts
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('AUTH_REQUIRED', 401, 'Authentication required'))
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ['HS256'],
      issuer:     'vocaply.com',
      audience:   'vocaply-api',
    }) as JwtPayload

    req.user = {
      id:     payload.sub,
      teamId: payload.teamId,
      role:   payload.role,
      email:  payload.email,
    }

    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('TOKEN_EXPIRED', 401, 'Access token expired'))
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError('TOKEN_INVALID', 401, 'Invalid access token'))
    }
    next(err)
  }
}

// middleware/role.middleware.ts
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user.role
    const roleHierarchy: Record<UserRole, number> = {
      OWNER:   4,
      ADMIN:   3,
      MANAGER: 2,
      MEMBER:  1,
    }

    const hasPermission = roles.some(
      (required) => roleHierarchy[userRole] >= roleHierarchy[required]
    )

    if (!hasPermission) {
      return next(new AppError('FORBIDDEN', 403, `Requires role: ${roles.join(' or ')}`))
    }

    next()
  }
}
```

---

## 3. Meeting Pipeline — State Machine

### State Transition Rules

```
STATES:
  SCHEDULED    Initial state when meeting is created
  BOT_JOINING  Bot is dispatched and attempting to join
  RECORDING    Bot is in the meeting and recording
  PROCESSING   Meeting ended; AI extraction in progress
  DONE         Extraction complete; data available to users
  FAILED       Irrecoverable error at any stage
  CANCELLED    Meeting cancelled before recording started

VALID TRANSITIONS (from → to):
  SCHEDULED    → BOT_JOINING  (system: bot dispatched)
  SCHEDULED    → CANCELLED    (user: cancels meeting)
  BOT_JOINING  → RECORDING    (webhook: bot.recording_started)
  BOT_JOINING  → FAILED       (webhook: bot.failed)
  BOT_JOINING  → CANCELLED    (webhook: meeting ended before bot joined)
  RECORDING    → PROCESSING   (webhook: bot.done)
  RECORDING    → FAILED       (webhook: bot.failed during recording)
  PROCESSING   → DONE         (worker: extraction complete)
  PROCESSING   → FAILED       (worker: extraction failed after 3 retries)

INVALID TRANSITIONS (throw error):
  DONE         → any          (terminal state)
  FAILED       → any except SCHEDULED (must re-create meeting to retry)
  CANCELLED    → any          (terminal state)

IMPLEMENTATION:
  meetings.service.ts:
    updateStatus(meetingId: string, newStatus: MeetingStatus, currentStatus?: MeetingStatus) {
      const VALID_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
        SCHEDULED:   ['BOT_JOINING', 'CANCELLED'],
        BOT_JOINING: ['RECORDING', 'FAILED', 'CANCELLED'],
        RECORDING:   ['PROCESSING', 'FAILED'],
        PROCESSING:  ['DONE', 'FAILED'],
        DONE:        [],
        FAILED:      [],
        CANCELLED:   [],
      }
      
      const current = currentStatus || (await repo.findById(meetingId)).status
      const allowed = VALID_TRANSITIONS[current]
      
      if (!allowed.includes(newStatus)) {
        throw new Error(`Invalid transition: ${current} → ${newStatus}`)
      }
      
      return repo.updateStatus(meetingId, newStatus)
    }
```

---

## 4. Recall.ai Webhook Handler

### Webhook Signature Verification

```typescript
// webhooks.validator.ts
export function verifyRecallSignature(req: Request): void {
  const signature = req.headers['x-recall-signature'] as string

  if (!signature) {
    throw new AppError('WEBHOOK_INVALID', 400, 'Missing Recall.ai signature')
  }

  const rawBody = req.rawBody  // Express must be configured to preserve raw body
  const expectedSig = createHmac('sha256', process.env.RECALL_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')

  const sigBuffer = Buffer.from(signature)
  const expBuffer = Buffer.from(expectedSig)

  // Constant-time comparison — prevents timing attacks
  if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
    throw new AppError('WEBHOOK_INVALID', 400, 'Invalid Recall.ai signature')
  }
}
```

### Event Handler Logic

```typescript
// recall.webhook.ts
export async function handleRecallEvent(req: Request, res: Response): Promise<void> {
  // 1. Verify signature FIRST — reject immediately if invalid
  verifyRecallSignature(req)

  // 2. Acknowledge immediately — Recall.ai expects < 5s response
  res.status(200).json({ received: true })

  // 3. Process asynchronously — never block the webhook response
  const { event, data } = req.body

  switch (event) {
    case 'bot.joining_call':
      await handleBotJoining(data.bot_id)
      break

    case 'bot.in_waiting_room':
      await handleBotWaiting(data.bot_id)
      break

    case 'bot.recording_started':
      await handleRecordingStarted(data.bot_id)
      break

    case 'bot.done':
      await handleBotDone(data)
      break

    case 'bot.failed':
      await handleBotFailed(data.bot_id, data.reason)
      break

    default:
      logger.warn({ event }, 'Unknown Recall.ai webhook event')
  }
}

async function handleBotDone(data: RecallBotDonePayload): Promise<void> {
  const meeting = await meetingsRepo.findByRecallBotId(data.bot_id)
  if (!meeting) {
    logger.error({ botId: data.bot_id }, 'bot.done received for unknown bot')
    return
  }

  // 1. Update meeting status + timing
  const durationMinutes = Math.round(
    (new Date().getTime() - meeting.startedAt!.getTime()) / 60000
  )
  await meetingsRepo.update(meeting.id, {
    status:          'PROCESSING',
    endedAt:         new Date(),
    durationMinutes,
  })

  // 2. Store raw transcript in MongoDB
  const mongoTranscriptId = await mongoService.storeTranscript({
    meeting_id:       meeting.id,
    team_id:          meeting.teamId,
    recall_bot_id:    data.bot_id,
    platform:         meeting.platform.toLowerCase(),
    raw_transcript:   data.transcript,
    full_text:        buildFullText(data.transcript),
    processing_status: 'pending',
    created_at:       new Date(),
  })

  // 3. Update meeting with MongoDB reference
  await meetingsRepo.update(meeting.id, { mongoTranscriptId })

  // 4. Emit realtime event to team
  io.to(`team:${meeting.teamId}`).emit('meeting:processing', {
    meetingId: meeting.id,
  })

  // 5. Queue extraction job
  await transcribeQueue.add(
    'process-transcript',
    { meetingId: meeting.id, teamId: meeting.teamId, mongoTranscriptId },
    {
      priority:  2,
      attempts:  3,
      backoff:   { type: 'exponential', delay: 10000 },
      removeOnComplete: 100,
      removeOnFail:     50,
    }
  )
}
```

---

## 5. AI Extraction Service — Internal Design

### FastAPI Endpoint Contract

```python
# POST /extract

# Request
class ExtractRequest(BaseModel):
    meeting_id:    str
    team_id:       str
    meeting_date:  datetime        # Used for relative date parsing
    meeting_title: str
    transcript:    list[TranscriptTurn]
    participants:  list[Participant]

class TranscriptTurn(BaseModel):
    speaker_tag:   str             # "Speaker 1" from Recall.ai
    speaker_email: str | None
    speaker_name:  str | None
    text:          str
    start_time:    float           # Seconds from meeting start
    end_time:      float
    confidence:    float

# Response
class ExtractionResult(BaseModel):
    meeting_id:         str
    commitments:        list[ExtractedCommitment]
    action_items:       list[ExtractedActionItem]
    decisions:          list[ExtractedDecision]
    blockers:           list[ExtractedBlocker]
    summary:            str
    extraction_model:   str
    processing_time_ms: int
    total_tokens_used:  int        # For cost tracking
```

### Extraction Prompt Design

```
# extraction_system.txt — the most important file in the entire project

You are an AI assistant that analyzes meeting transcripts and extracts structured data.
You will receive a formatted meeting transcript and must return ONLY valid JSON.
No preamble, no explanation, no markdown code fences. JSON ONLY.

EXTRACTION RULES:

1. COMMITMENTS (first-person promises only):
   - Must use first person: "I'll", "I will", "I'm going to", "I can have"
   - "We should" is NOT a commitment (no specific owner)
   - "Maybe I'll" → confidence: 0.4
   - "I'll definitely" → confidence: 0.95
   - "Let me" → confidence: 0.75
   - The OWNER is the SPEAKER making the commitment (not the person being assigned to)
   - Extract the raw deadline text AND leave parsing to the date_parser service
   - If no deadline mentioned: due_date_raw = null

2. ACTION ITEMS (assigned tasks):
   - Third-party assignments: "Ahmed, can you fix...", "Sara please..."
   - Self-volunteered: "I'll take care of X" counts as both commitment AND action item
   - Owner = person being assigned (not the assigner)
   - Priority inference: "ASAP", "urgent", "blocking" → HIGH

3. DECISIONS:
   - "We decided to...", "We're going with...", "Final call is..."
   - Must be a concluded decision, not a discussion or suggestion

4. BLOCKERS:
   - "Blocked by", "Waiting on", "Can't proceed until", "Depends on"
   - Extract the person being blocked (affected_user)

CONFIDENCE SCORING RUBRIC:
  0.9-1.0: Explicit, clear commitment with specific deadline
  0.7-0.8: Clear commitment, vague or no deadline
  0.5-0.6: Probable commitment ("try to", "should be able to")
  0.3-0.4: Possible commitment ("maybe", "hopefully")
  < 0.3:   Not a commitment — do NOT include

OUTPUT JSON SCHEMA:
{
  "commitments": [
    {
      "text":          "exact spoken words",
      "owner_name":    "speaker display name",
      "due_date_raw":  "by Thursday" or null,
      "confidence":    0.0-1.0
    }
  ],
  "action_items": [...],
  "decisions":    [...],
  "blockers":     [...],
  "summary":      "3-5 bullet point summary as plain text"
}
```

### Transcript Chunking Algorithm

```python
# transcript_processor.py

MAX_TRANSCRIPT_TOKENS = 120_000   # Claude context window safety margin
CHUNK_OVERLAP_TURNS   = 8         # Turns of overlap between chunks

def chunk_if_needed(formatted_text: str) -> list[str]:
    """
    Split transcript into overlapping chunks if it exceeds context window.
    Returns list of chunk strings (single item list if no chunking needed).
    """
    # Rough token estimate: 1 token ≈ 0.75 words
    word_count = len(formatted_text.split())
    estimated_tokens = int(word_count / 0.75)
    
    if estimated_tokens <= MAX_TRANSCRIPT_TOKENS:
        return [formatted_text]
    
    # Split by turn boundaries (never mid-sentence)
    turns = formatted_text.strip().split('\n')
    
    tokens_per_chunk = MAX_TRANSCRIPT_TOKENS - 2000  # Safety buffer
    chunks = []
    current_chunk_turns = []
    current_token_estimate = 0
    
    for i, turn in enumerate(turns):
        turn_tokens = int(len(turn.split()) / 0.75)
        
        if current_token_estimate + turn_tokens > tokens_per_chunk and current_chunk_turns:
            # Save current chunk
            chunks.append('\n'.join(current_chunk_turns))
            
            # Start new chunk with overlap from end of previous chunk
            overlap_start = max(0, len(current_chunk_turns) - CHUNK_OVERLAP_TURNS)
            current_chunk_turns = current_chunk_turns[overlap_start:]
            current_token_estimate = sum(
                int(len(t.split()) / 0.75) for t in current_chunk_turns
            )
        
        current_chunk_turns.append(turn)
        current_token_estimate += turn_tokens
    
    if current_chunk_turns:
        chunks.append('\n'.join(current_chunk_turns))
    
    return chunks

def merge_chunk_results(results: list[dict]) -> dict:
    """Merge extraction results from multiple chunks, deduplicating commitments."""
    merged_commitments  = []
    merged_action_items = []
    merged_decisions    = []
    merged_blockers     = []
    
    seen_commitment_keys = set()
    
    for result in results:
        for commitment in result.get('commitments', []):
            # Dedup key: owner + normalized text
            normalized = normalize_text(commitment['text'])
            key = f"{commitment['owner_name'].lower()}::{normalized}"
            
            if key not in seen_commitment_keys:
                seen_commitment_keys.add(key)
                merged_commitments.append(commitment)
            else:
                # Keep the one with higher confidence
                existing_idx = next(
                    i for i, c in enumerate(merged_commitments)
                    if f"{c['owner_name'].lower()}::{normalize_text(c['text'])}" == key
                )
                if commitment['confidence'] > merged_commitments[existing_idx]['confidence']:
                    merged_commitments[existing_idx] = commitment
        
        merged_action_items.extend(result.get('action_items', []))
        merged_decisions.extend(result.get('decisions', []))
        merged_blockers.extend(result.get('blockers', []))
    
    # Use summary from first chunk (most chronologically complete)
    summary = results[0].get('summary', '') if results else ''
    
    return {
        'commitments':  merged_commitments,
        'action_items': merged_action_items,
        'decisions':    merged_decisions,
        'blockers':     merged_blockers,
        'summary':      summary,
    }
```

---

## 6. Commitment Resolver Algorithm

### Core Matching Logic

```python
# similarity.py

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
import re

STOPWORDS = {
    'i', 'will', 'have', 'the', 'a', 'an', 'by', 'to', 'it', 'my',
    'is', 'am', 'are', 'be', 'was', 'were', 'been', 'do', 'did',
    'does', 'for', 'with', 'this', 'that', 'all', 'in', 'on', 'at',
    'up', 'we', 'our', "i'll", "i'm", "let", "me", "make", "sure"
}

def normalize_text(text: str) -> str:
    """
    Normalize commitment text for similarity comparison.
    Input:  "I'll make sure to finish the login feature by Thursday"
    Output: "finish login feature"
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)  # Remove punctuation
    tokens = text.split()
    
    # Remove stopwords
    tokens = [t for t in tokens if t not in STOPWORDS]
    
    # Simple suffix stemming (not Porter — too aggressive)
    stemmed = []
    for token in tokens:
        if token.endswith('ing') and len(token) > 5:
            token = token[:-3]  # "finishing" → "finish"
        elif token.endswith('ed') and len(token) > 4:
            token = token[:-2]  # "finished" → "finish"
        elif token.endswith('s') and len(token) > 3:
            token = token[:-1]   # "features" → "feature"
        stemmed.append(token)
    
    return ' '.join(stemmed[:5])  # Max 5 tokens for normalized text


def cosine_similarity(text1: str, text2: str) -> float:
    """TF-IDF cosine similarity between two normalized texts."""
    norm1 = normalize_text(text1)
    norm2 = normalize_text(text2)
    
    if not norm1 or not norm2:
        return 0.0
    
    if norm1 == norm2:
        return 1.0
    
    try:
        vectorizer = TfidfVectorizer()
        matrix = vectorizer.fit_transform([norm1, norm2])
        score = sklearn_cosine(matrix[0:1], matrix[1:2])[0][0]
        return float(score)
    except Exception:
        return keyword_overlap_ratio(norm1, norm2)  # Fallback


def keyword_overlap_ratio(text1: str, text2: str) -> float:
    """Jaccard similarity as fast fallback."""
    tokens1 = set(normalize_text(text1).split())
    tokens2 = set(normalize_text(text2).split())
    
    if not tokens1 or not tokens2:
        return 0.0
    
    intersection = tokens1 & tokens2
    union = tokens1 | tokens2
    return len(intersection) / len(union)


def similarity_score(text1: str, text2: str) -> float:
    """
    Combined similarity: TF-IDF (70%) + Keyword overlap (30%).
    Weighted combination handles short texts where TF-IDF underperforms.
    """
    cosine = cosine_similarity(text1, text2)
    keyword = keyword_overlap_ratio(text1, text2)
    return (cosine * 0.7) + (keyword * 0.3)
```

### Resolution Detector

```python
# resolution_detector.py

COMPLETION_KEYWORDS = {
    'done', 'finished', 'completed', 'merged', 'deployed', 'shipped',
    'sent', 'delivered', 'fixed', 'resolved', 'pushed', 'released',
    'launched', 'submitted', 'closed', 'published', 'live', 'went live'
}

NON_COMPLETION_PHRASES = [
    'still working', 'in progress', 'not done yet', 'almost', 'partially',
    'working on', 'in review', 'pending', 'blocked', 'waiting',
    'havent finished', "haven't finished", 'not finished', 'not completed'
]

async def is_resolution_statement(
    new_text: str,
    old_commitment_text: str,
    claude_client: ClaudeClient
) -> bool:
    """
    Two-stage resolution detection.
    Stage 1: Fast keyword check (no API cost).
    Stage 2: Claude binary check (only if Stage 1 passes).
    """
    lower_text = new_text.lower()
    
    # Stage 1a: Rule out non-completion phrases immediately
    for phrase in NON_COMPLETION_PHRASES:
        if phrase in lower_text:
            return False
    
    # Stage 1b: Check for completion keywords
    has_completion_keyword = any(kw in lower_text for kw in COMPLETION_KEYWORDS)
    
    if not has_completion_keyword:
        return False  # No completion language → not resolved (no API call)
    
    # Stage 2: Claude binary check (only reached if Stage 1 passes)
    # Use Haiku for this — 5-token output, extremely cheap
    prompt = (
        f'Old commitment: "{old_commitment_text}"\n'
        f'New statement: "{new_text}"\n\n'
        f'Does the new statement indicate the old commitment was completed? '
        f'Answer YES or NO only.'
    )
    
    response = await claude_client.complete(
        model='claude-haiku-4-5-20251001',
        system='You are a binary classifier. Answer YES or NO only.',
        user=prompt,
        max_tokens=5,
    )
    
    answer = response.strip().upper()
    return answer == 'YES'
```

---

## 7. Cross-Meeting Memory System

### Full Resolution Flow

```python
# commitment_resolver.py

SIMILARITY_THRESHOLD = 0.65  # Minimum score to consider a match

async def resolve(
    new_extractions: list[ExtractedCommitment],
    historical_commitments: list[HistoricalCommitment],
    meeting_id: str
) -> ResolutionResult:
    """
    Main cross-meeting resolver.
    Maps new extraction results against historical open commitments.
    """
    result = ResolutionResult(
        created=[], resolved=[], referenced=[], unchanged=[]
    )
    
    matched_historical_ids = set()
    
    for extracted in new_extractions:
        # Filter historical to same owner only (never cross-owner matching)
        owner_history = [
            h for h in historical_commitments
            if h.owner_name.lower() == extracted.owner_name.lower()
            # Secondary match: userId match if both available
        ]
        
        best_match = find_best_match(extracted, owner_history)
        
        if best_match is None:
            # No similar existing commitment → create new
            result.created.append(extracted)
        else:
            matched_historical_ids.add(best_match.id)
            
            # Determine if this new mention resolves the old commitment
            is_resolved = await is_resolution_statement(
                new_text=extracted.text,
                old_commitment_text=best_match.text,
                claude_client=claude_client
            )
            
            if is_resolved:
                result.resolved.append(ResolvedCommitment(
                    historical_id=best_match.id,
                    new_status='FULFILLED',
                    resolved_in_meeting_id=meeting_id,
                ))
            else:
                # Referenced but not resolved → keep PENDING
                result.referenced.append(best_match.id)
    
    # Historical commitments not mentioned at all in this meeting
    result.unchanged = [
        h for h in historical_commitments
        if h.id not in matched_historical_ids
    ]
    
    return result


def find_best_match(
    extracted: ExtractedCommitment,
    owner_history: list[HistoricalCommitment]
) -> HistoricalCommitment | None:
    """
    Find the best-matching historical commitment for an extracted one.
    Returns None if no match exceeds the similarity threshold.
    """
    best_score = SIMILARITY_THRESHOLD  # Minimum threshold — not just best overall
    best_match = None
    
    for historical in owner_history:
        score = similarity_score(extracted.text, historical.text)
        
        # Boost score for items with matching normalized_text prefix
        if (extracted.normalized_text and historical.normalized_text and
                extracted.normalized_text[:10] == historical.normalized_text[:10]):
            score = min(score + 0.1, 1.0)
        
        if score > best_score:
            best_score = score
            best_match = historical
    
    return best_match
```

---

## 8. Commitment Score Calculation

### Score Formula

```typescript
// services/score.service.ts

interface ScoreInput {
  userId:       string
  teamId:       string
  periodDays:   number  // default: 30
}

interface ScoreOutput {
  score:           number   // 0-100
  fulfillmentRate: number   // 0-100 percentage
  onTimeRate:      number   // 0-100 percentage
  trend:           'improving' | 'stable' | 'declining'
  total:           number
  fulfilled:       number
  missed:          number
  pending:         number
}

async function calculateCommitmentScore(input: ScoreInput): Promise<ScoreOutput> {
  const { userId, teamId, periodDays } = input
  const since = subDays(new Date(), periodDays)

  const commitments = await commitmentRepo.findByOwner({
    userId, teamId, since,
    statuses: ['FULFILLED', 'MISSED', 'PENDING'],
  })

  if (commitments.length === 0) {
    return { score: 0, fulfillmentRate: 0, onTimeRate: 0, trend: 'stable',
             total: 0, fulfilled: 0, missed: 0, pending: 0 }
  }

  const total     = commitments.length
  const fulfilled = commitments.filter(c => c.status === 'FULFILLED').length
  const missed    = commitments.filter(c => c.status === 'MISSED').length
  const pending   = commitments.filter(c => c.status === 'PENDING').length

  // Base fulfillment rate (excludes pending — they haven't been decided yet)
  const decided = fulfilled + missed
  const baseFulfillmentRate = decided === 0 ? 100 : Math.round((fulfilled / decided) * 100)

  // On-time rate: fulfilled where resolvedAt <= dueDate
  const fulfilledOnTime = commitments.filter(c =>
    c.status === 'FULFILLED' &&
    c.resolvedAt && c.dueDate &&
    c.resolvedAt <= c.dueDate
  ).length

  const onTimeRate = fulfilled === 0 ? 100 :
    Math.round((fulfilledOnTime / fulfilled) * 100)

  // Recency weighting: last 7 days count full, older count 70%
  const recentCutoff = subDays(new Date(), 7)
  const recentFulfilled = commitments.filter(c =>
    c.status === 'FULFILLED' && c.createdAt >= recentCutoff
  ).length
  const recentDecided = commitments.filter(c =>
    ['FULFILLED', 'MISSED'].includes(c.status) && c.createdAt >= recentCutoff
  ).length
  const olderDecided = decided - recentDecided
  const olderFulfilled = fulfilled - recentFulfilled

  let weightedRate: number
  if (decided === 0) {
    weightedRate = 100
  } else {
    const recentWeighted = recentDecided > 0
      ? (recentFulfilled / recentDecided) * 1.0 * recentDecided
      : 0
    const olderWeighted = olderDecided > 0
      ? (olderFulfilled / olderDecided) * 0.7 * olderDecided
      : 0
    const totalWeight = (recentDecided * 1.0) + (olderDecided * 0.7)
    weightedRate = totalWeight > 0
      ? ((recentWeighted + olderWeighted) / totalWeight) * 100
      : 100
  }

  // On-time bonus: up to +10 points
  const onTimeBonus = (onTimeRate / 100) * 10

  // Final score
  const rawScore = weightedRate + onTimeBonus
  const score = Math.min(100, Math.max(0, Math.round(rawScore)))

  // Trend calculation: compare last 7 days vs prior 7 days
  const trend = await calculateTrend(userId, teamId)

  return {
    score, fulfillmentRate: baseFulfillmentRate, onTimeRate, trend,
    total, fulfilled, missed, pending,
  }
}

async function calculateTrend(
  userId: string, teamId: string
): Promise<'improving' | 'stable' | 'declining'> {
  const currentWeekRate  = await getWeeklyRate(userId, teamId, 0, 7)
  const previousWeekRate = await getWeeklyRate(userId, teamId, 7, 14)

  const diff = currentWeekRate - previousWeekRate
  if (diff > 5)  return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}
```

---

## 9. Calendar Sync & Bot Deduplication

### Calendar Sync Algorithm

```typescript
// services/calendar-sync.service.ts

const MEETING_URL_PATTERNS = {
  ZOOM:         /zoom\.us\/j\/(\d+)/,
  GOOGLE_MEET:  /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/,
  TEAMS:        /teams\.microsoft\.com.*meetup-join/,
}

async function syncUserCalendar(userId: string): Promise<SyncResult> {
  // 1. Get user's calendar integration
  const integration = await userIntegrationRepo.findByUser(userId, 'GOOGLE_CALENDAR')
  if (!integration || !integration.syncEnabled) return { synced: 0, skipped: 0 }

  // 2. Ensure access token is fresh
  const accessToken = await getValidAccessToken(integration)

  // 3. Fetch upcoming events (next 7 days)
  const events = await googleCalendarClient.listEvents({
    accessToken,
    calendarId:  integration.calendarId ?? 'primary',
    timeMin:     new Date().toISOString(),
    timeMax:     addDays(new Date(), 7).toISOString(),
    singleEvents: true,
    maxResults:  100,
  })

  let synced = 0, skipped = 0

  for (const event of events.items ?? []) {
    const meetingUrl = extractMeetingUrl(event)
    if (!meetingUrl) { skipped++; continue }

    const { platform, platformMeetingId } = detectPlatform(meetingUrl)
    if (!platform) { skipped++; continue }

    // 4. DEDUPLICATION: Check Redis flag first (fastest)
    const redisKey = `bot:scheduled:${platform.toLowerCase()}:${platformMeetingId}`
    const alreadyScheduled = await redis.exists(redisKey)
    if (alreadyScheduled) { skipped++; continue }

    // 5. Check DB for existing meeting with same URL + team
    const user = await userRepo.findById(userId)
    const existingMeeting = await meetingRepo.findByPlatformId({
      teamId:            user.teamId,
      platform,
      platformMeetingId,
    })
    if (existingMeeting) { skipped++; continue }

    // 6. Create meeting + schedule bot
    try {
      const meeting = await meetingRepo.create({
        teamId:            user.teamId,
        title:             event.summary ?? 'Untitled Meeting',
        platform,
        meetingUrl,
        platformMeetingId,
        scheduledAt:       new Date(event.start?.dateTime ?? event.start?.date!),
        calendarEventId:   event.id,
      })

      const botResponse = await recallService.scheduleBot({
        meetingUrl,
        scheduledAt: meeting.scheduledAt,
      })

      await meetingRepo.update(meeting.id, { recallBotId: botResponse.id })

      // 7. Set Redis dedup flag (TTL: 4 hours after meeting start)
      const ttlSeconds = Math.max(
        3600,  // Minimum 1 hour
        differenceInSeconds(addHours(meeting.scheduledAt, 4), new Date())
      )
      await redis.setex(redisKey, ttlSeconds, meeting.id)

      synced++
    } catch (error) {
      logger.error({ userId, eventId: event.id, error }, 'Failed to schedule bot for calendar event')
      skipped++
    }
  }

  // 8. Update last sync timestamp
  await userIntegrationRepo.update(integration.id, { lastSyncedAt: new Date() })

  return { synced, skipped }
}

function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
  // Priority 1: Google Meet native conferenceData
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints
      .find(e => e.entryPointType === 'video')
    if (videoEntry?.uri) return videoEntry.uri
  }

  // Priority 2: Event description (URLs embedded in text)
  if (event.description) {
    for (const [, pattern] of Object.entries(MEETING_URL_PATTERNS)) {
      const match = event.description.match(
        new RegExp(`https?://[^\\s]*${pattern.source.replace(/\\/g, '\\')}[^\\s]*`)
      )
      if (match) return match[0]
    }
  }

  // Priority 3: Event location
  if (event.location) {
    for (const [, pattern] of Object.entries(MEETING_URL_PATTERNS)) {
      if (pattern.test(event.location)) return event.location
    }
  }

  return null
}
```

---

## 10. Queue Worker — Internal Design

### Extract Worker Full Flow

```typescript
// queues/workers/extract.worker.ts

const extractWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data

    logger.info({ jobId: job.id, meetingId }, 'Starting AI extraction')
    const startTime = Date.now()

    // Step 1: Fetch transcript from MongoDB
    const transcriptDoc = await mongoService.findTranscript(mongoTranscriptId)
    if (!transcriptDoc) {
      throw new Error(`Transcript not found in MongoDB: ${mongoTranscriptId}`)
    }

    // Step 2: Fetch participants from PostgreSQL
    const participants = await participantRepo.findByMeeting(meetingId)
    const meeting      = await meetingRepo.findById(meetingId)

    // Step 3: Build speaker → user mapping
    const speakerMap = buildSpeakerMap(participants, transcriptDoc.raw_transcript)

    // Step 4: Enrich transcript turns with speaker info
    const enrichedTranscript = transcriptDoc.raw_transcript.map(turn => ({
      ...turn,
      speaker_email: speakerMap[turn.speaker_tag]?.email ?? null,
      speaker_name:  speakerMap[turn.speaker_tag]?.name ?? turn.speaker_tag,
    }))

    // Step 5: Call AI Pipeline for extraction
    const extractionResult = await aiPipelineClient.extract({
      meeting_id:    meetingId,
      team_id:       teamId,
      meeting_date:  meeting.scheduledAt,
      meeting_title: meeting.title,
      transcript:    enrichedTranscript,
      participants:  participants.map(p => ({
        speaker_tag: p.speakerTag,
        name:        p.name,
        email:       p.email,
      })),
    })

    // Step 6: Fetch historical open commitments for resolution
    const historicalCommitments = await commitmentRepo.findOpenByTeam({
      teamId,
      excludeMeetingId: meetingId,  // Don't resolve against same meeting
    })

    // Step 7: Call AI Pipeline for cross-meeting resolution
    const resolutionResult = await aiPipelineClient.resolve({
      new_commitments:          extractionResult.commitments,
      historical_commitments:   historicalCommitments,
      team_id:                  teamId,
      meeting_id:               meetingId,
    })

    // Step 8: Persist all results in a single Postgres transaction
    await prisma.$transaction(async (tx) => {
      // Save new commitments
      for (const extracted of resolutionResult.created) {
        const ownerId = await ownerResolverService.resolve(
          extracted.owner_name, teamId, participants
        )
        await tx.commitment.create({
          data: {
            id:             cuid(),
            teamId,
            meetingId,
            ownerId:        ownerId ?? systemUserId,  // fallback
            text:           extracted.text,
            normalizedText: extracted.normalized_text,
            dueDate:        extracted.due_date_iso ? new Date(extracted.due_date_iso) : null,
            dueDateRaw:     extracted.due_date_raw,
            status:         'PENDING',
            confidenceScore: extracted.confidence,
          },
        })
      }

      // Update resolved commitments
      for (const resolved of resolutionResult.resolved) {
        await tx.commitment.update({
          where: { id: resolved.historical_id },
          data: {
            status:               resolved.new_status,
            resolvedAt:           new Date(),
            resolvedInMeetingId:  meetingId,
          },
        })
      }

      // Save action items
      for (const item of extractionResult.action_items) {
        const assigneeId = await ownerResolverService.resolve(
          item.owner_name, teamId, participants
        )
        await tx.actionItem.create({
          data: {
            id:         cuid(),
            teamId,
            meetingId,
            assigneeId,
            text:       item.text,
            dueDate:    item.due_date_iso ? new Date(item.due_date_iso) : null,
            priority:   item.priority as Priority,
            completed:  false,
          },
        })
      }

      // Save decisions and blockers
      for (const d of extractionResult.decisions) {
        await tx.decision.create({ data: { id: cuid(), teamId, meetingId, text: d.text, madeBy: d.made_by } })
      }
      for (const b of extractionResult.blockers) {
        await tx.blocker.create({ data: { id: cuid(), teamId, meetingId, text: b.text, affectedUser: b.affected_user } })
      }

      // Update meeting with summary + DONE status
      await tx.meeting.update({
        where: { id: meetingId },
        data:  { status: 'DONE', summary: extractionResult.summary },
      })
    })

    // Step 9: Recalculate scores for affected commitment owners
    const affectedOwnerIds = new Set([
      ...resolutionResult.resolved.map(r => r.ownerId).filter(Boolean),
    ])
    for (const ownerId of affectedOwnerIds) {
      const newScore = await scoreService.calculateCommitmentScore({ userId: ownerId, teamId, periodDays: 30 })
      await userRepo.updateCommitmentScore(ownerId, newScore.score)
    }

    // Step 10: Update MongoDB transcript with extraction results
    await mongoService.updateTranscriptExtraction(mongoTranscriptId, {
      ai_extraction:      extractionResult,
      processing_status:  'done',
      processing_completed_at: new Date(),
    })

    // Step 11: Track usage event
    await usageService.track({ teamId, type: 'AI_EXTRACTION', metadata: { meetingId } })

    // Step 12: Emit Socket.io realtime event
    io.to(`team:${teamId}`).emit('meeting:processed', {
      meetingId,
      summary:          extractionResult.summary,
      commitmentCount:  resolutionResult.created.length,
      actionItemCount:  extractionResult.action_items.length,
      decisionCount:    extractionResult.decisions.length,
    })

    // Step 13: Queue downstream jobs
    await notifyQueue.add('meeting-processed', { meetingId, teamId }, { priority: 3 })
    await integrateQueue.add('sync-to-jira', { meetingId, teamId }, { priority: 4 })

    logger.info({
      jobId:          job.id,
      meetingId,
      processingMs:   Date.now() - startTime,
      commitments:    resolutionResult.created.length,
      resolved:       resolutionResult.resolved.length,
    }, 'AI extraction complete')
  },
  {
    connection: redis,
    concurrency: 3,  // Process 3 meetings simultaneously
  }
)

extractWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Extract job failed')
  // After 3 failures, job moves to failed queue for manual review
})
```

---

## 11. Deadline Alert System

### Cron Job Logic

```typescript
// queues/scheduler.ts

// === 9 AM DAILY: Send deadline reminders ===
cron.schedule('0 9 * * *', async () => {
  logger.info('Running deadline reminder job')

  const tomorrow = endOfDay(addDays(new Date(), 1))
  const now      = new Date()

  // Find PENDING commitments due within 24 hours with no reminder sent
  const commitments = await prisma.commitment.findMany({
    where: {
      status:          'PENDING',
      dueDate:         { gte: now, lte: tomorrow },
      reminderSentAt:  null,  // Not already reminded
    },
    include: {
      owner:   { select: { id: true, name: true, email: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      team:    { select: { id: true, plan: true, settings: true } },
    },
  })

  for (const commitment of commitments) {
    // Dedup: don't send if already queued in last hour
    const dedupKey = `notif:sent:DEADLINE_REMINDER:${commitment.owner.id}:${commitment.id}`
    const alreadySent = await redis.exists(dedupKey)
    if (alreadySent) continue

    // Skip free plan (notifications are paid feature)
    if (commitment.team.plan === 'FREE') continue

    // Queue notification (don't send inline — keep cron fast)
    await deadlineQueue.add(
      'deadline-reminder',
      {
        type:          'DEADLINE_REMINDER',
        commitmentId:  commitment.id,
        ownerId:       commitment.owner.id,
        teamId:        commitment.team.id,
      },
      { priority: 1 }  // Highest priority — time-sensitive
    )

    // Mark reminder sent + set dedup key
    await prisma.commitment.update({
      where: { id: commitment.id },
      data:  { reminderSentAt: new Date() },
    })
    await redis.setex(dedupKey, 86400, '1')  // TTL: 24 hours
  }

  logger.info({ remindersQueued: commitments.length }, 'Deadline reminder job complete')
})


// === 6 PM DAILY: Mark missed commitments ===
cron.schedule('0 18 * * *', async () => {
  logger.info('Running mark-missed job')

  // Find PENDING commitments past their due date with no missed alert sent
  const overdueCommitments = await prisma.commitment.findMany({
    where: {
      status:              'PENDING',
      dueDate:             { lt: new Date() },
      missedAlertSentAt:   null,
    },
    include: {
      owner:   { select: { id: true, name: true, email: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      team: {
        include: {
          members: {
            where: { role: { in: ['MANAGER', 'ADMIN', 'OWNER'] } },
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  })

  // Batch update all to MISSED in one query
  const overdueIds = overdueCommitments.map(c => c.id)
  if (overdueIds.length > 0) {
    await prisma.commitment.updateMany({
      where: { id: { in: overdueIds } },
      data:  { status: 'MISSED', missedAlertSentAt: new Date() },
    })
  }

  // Emit Socket.io events + queue notifications
  for (const commitment of overdueCommitments) {
    // Real-time update to dashboard
    io.to(`team:${commitment.teamId}`).emit('commitment:missed', {
      commitmentId: commitment.id,
      ownerName:    commitment.owner.name,
    })
    io.to(`user:${commitment.owner.id}`).emit('my:commitment_missed', {
      commitmentId: commitment.id,
      text:         commitment.text,
      daysOverdue:  differenceInDays(new Date(), commitment.dueDate!),
    })

    // Queue notification job
    await notifyQueue.add(
      'commitment-missed',
      {
        type:         'COMMITMENT_MISSED',
        commitmentId: commitment.id,
        ownerId:      commitment.owner.id,
        teamId:       commitment.teamId,
        managerIds:   commitment.team.members.map(m => m.id),
      },
      { priority: 2 }
    )

    // Recalculate owner's commitment score
    const newScore = await scoreService.calculateCommitmentScore({
      userId:     commitment.owner.id,
      teamId:     commitment.teamId,
      periodDays: 30,
    })
    await userRepo.updateCommitmentScore(commitment.owner.id, newScore.score)

    // Emit score change
    io.to(`team:${commitment.teamId}`).emit('member:score_updated', {
      userId:         commitment.owner.id,
      newScore:       newScore.score,
      previousScore:  commitment.owner.commitmentScore,
      change:         newScore.score - (commitment.owner.commitmentScore ?? 0),
      reason:         'MISSED',
    })
  }

  logger.info({ missedMarked: overdueCommitments.length }, 'Mark-missed job complete')
})
```

---

## 12. Notification Routing Engine

### Notify Worker Logic

```typescript
// queues/workers/notify.worker.ts

const notifyWorker = new Worker<NotifyJobData>(
  'notify',
  async (job: Job<NotifyJobData>) => {
    const { type, commitmentId, ownerId, teamId, managerIds, meetingId } = job.data

    // Load user preferences for the owner
    const ownerPrefs = await notificationPrefsRepo.findByUser(ownerId)

    // Load team's Slack integration (if connected)
    const slackIntegration = await teamIntegrationRepo.findByTeam(teamId, 'SLACK')

    // Dedup check per notification type
    const dedupKey = `notif:sent:${type}:${ownerId}:${commitmentId ?? meetingId}`
    const alreadySent = await redis.exists(dedupKey)
    if (alreadySent) {
      logger.info({ type, dedupKey }, 'Notification already sent — skipping')
      return
    }

    switch (type) {
      case 'MEETING_PROCESSED': {
        const meeting = await meetingRepo.findById(meetingId!)
        const counts  = await getExtractionCounts(meetingId!)

        // Slack: post to team channel
        if (slackIntegration?.isActive && ownerPrefs?.slack?.meetingSummary) {
          await slackNotifyService.sendMeetingSummaryToChannel({
            integration: slackIntegration,
            meeting,
            counts,
          })
        }

        // Email: send to manager(s)
        if (ownerPrefs?.email?.meetingSummary && managerIds?.length) {
          for (const managerId of managerIds) {
            const manager = await userRepo.findById(managerId)
            await emailService.sendMeetingSummary({ to: manager.email, meeting, counts })
          }
        }
        break
      }

      case 'COMMITMENT_MISSED': {
        const commitment = await commitmentRepo.findById(commitmentId!)
        const owner      = await userRepo.findById(ownerId)

        // Slack DM to owner
        if (slackIntegration?.isActive && ownerPrefs?.slack?.commitmentMissed) {
          await slackNotifyService.sendCommitmentMissedDM({
            integration: slackIntegration,
            ownerEmail:  owner.email,
            commitment,
          })
        }

        // Email to owner
        if (ownerPrefs?.email?.commitmentMissed) {
          await emailService.sendCommitmentMissed({ to: owner.email, commitment })
        }

        // Alert managers
        if (managerIds?.length) {
          for (const managerId of managerIds) {
            const manager = await userRepo.findById(managerId)
            const managerPrefs = await notificationPrefsRepo.findByUser(managerId)

            if (slackIntegration?.isActive && managerPrefs?.slack?.commitmentMissed) {
              await slackNotifyService.sendManagerAlertDM({
                integration: slackIntegration,
                managerEmail: manager.email,
                owner,
                commitment,
              })
            }
            if (managerPrefs?.email?.commitmentMissed) {
              await emailService.sendManagerAlert({ to: manager.email, owner, commitment })
            }
          }
        }
        break
      }

      case 'DEADLINE_REMINDER': {
        const commitment = await commitmentRepo.findById(commitmentId!)
        const owner      = await userRepo.findById(ownerId)

        if (slackIntegration?.isActive && ownerPrefs?.slack?.deadlineReminder) {
          await slackNotifyService.sendDeadlineReminderDM({
            integration: slackIntegration,
            ownerEmail:  owner.email,
            commitment,
          })
        }
        if (ownerPrefs?.email?.deadlineReminder) {
          await emailService.sendDeadlineReminder({ to: owner.email, commitment })
        }
        break
      }
    }

    // Set dedup key (TTL: 1 hour — prevents duplicate sends within an hour)
    await redis.setex(dedupKey, 3600, '1')
  },
  { connection: redis, concurrency: 5 }
)
```

---

## 13. Integration OAuth Flow

### Unified OAuth Handler

```typescript
// integrations.service.ts

async function initiateOAuth(provider: TeamProvider, teamId: string): Promise<string> {
  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')

  // Store state in Redis (TTL: 10 min)
  await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({ provider, teamId }))

  const providerConfig = OAUTH_CONFIGS[provider]
  const params = new URLSearchParams({
    client_id:     providerConfig.clientId,
    redirect_uri:  providerConfig.callbackUrl,
    response_type: 'code',
    scope:         providerConfig.scopes.join(' '),
    state,
    ...providerConfig.extraParams,
  })

  return `${providerConfig.authUrl}?${params.toString()}`
}

async function handleOAuthCallback(
  provider: TeamProvider,
  code: string,
  state: string
): Promise<void> {
  // 1. Verify + consume state (CSRF check)
  const storedState = await redis.get(`oauth:state:${state}`)
  if (!storedState) {
    throw new AppError('OAUTH_INVALID_STATE', 400, 'OAuth state invalid or expired')
  }
  await redis.del(`oauth:state:${state}`)  // One-time use

  const { teamId } = JSON.parse(storedState)

  // 2. Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(provider, code)

  // 3. Encrypt tokens before storage
  const encryptedAccessToken  = cryptoService.encrypt(tokenResponse.access_token)
  const encryptedRefreshToken = tokenResponse.refresh_token
    ? cryptoService.encrypt(tokenResponse.refresh_token)
    : null

  // 4. Upsert integration record
  await prisma.teamIntegration.upsert({
    where:  { teamId_provider: { teamId, provider } },
    create: {
      id:              cuid(),
      teamId,
      provider,
      accessToken:     encryptedAccessToken,
      refreshToken:    encryptedRefreshToken,
      tokenExpiresAt:  tokenResponse.expires_in
        ? addSeconds(new Date(), tokenResponse.expires_in)
        : null,
      workspaceId:     tokenResponse.workspaceId,
      workspaceName:   tokenResponse.workspaceName,
      isActive:        true,
    },
    update: {
      accessToken:    encryptedAccessToken,
      refreshToken:   encryptedRefreshToken,
      tokenExpiresAt: tokenResponse.expires_in
        ? addSeconds(new Date(), tokenResponse.expires_in)
        : null,
      isActive:       true,
    },
  })
}
```

---

## 14. Token Encryption Design

### AES-256-GCM Implementation

```typescript
// services/crypto.service.ts

const ALGORITHM  = 'aes-256-gcm'
const IV_LENGTH  = 16   // bytes
const TAG_LENGTH = 16   // bytes (GCM auth tag)

// ENCRYPTION_KEY must be a 64-character hex string (32 bytes)
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')

export function encrypt(plaintext: string): string {
  // Fresh IV for every encryption (never reuse IV with same key)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv, {
    authTagLength: TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  // Format: base64(iv + authTag + ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

export function decrypt(ciphertext: string): string {
  const combined = Buffer.from(ciphertext, 'base64')

  // Extract components
  const iv       = combined.subarray(0, IV_LENGTH)
  const authTag  = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv, {
    authTagLength: TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    // Throws if authTag doesn't match — data tampered
    throw new AppError('CRYPTO_ERROR', 500, 'Token decryption failed — data may be corrupted')
  }
}

// Usage pattern for OAuth tokens:
//   STORE:   integration.accessToken = encrypt(rawAccessToken)
//   RETRIEVE: rawAccessToken = decrypt(integration.accessToken)
//   NEVER:   return encrypted token to client or log it
```

---

## 15. Multi-Tenant Middleware Chain

### Request Processing Pipeline

```
Every API request passes through this middleware chain in order:

1. cors()                     — Allow configured origins
2. helmet()                   — Set security headers (CSP, HSTS, etc.)
3. express.json({ limit: '10mb' }) — Parse JSON body
4. cookieParser()             — Parse cookies (for refresh token)
5. requestLogger()            — Log: method, path, ip, userAgent
6. ipRateLimiter()            — 100 requests/minute per IP
7. ─── Route matching ───
8. requireAuth()              — Verify JWT, attach req.user
9. injectTenant()             — Extract teamId from req.user, attach req.teamId
10. requireRole(...roles)     — Check role hierarchy (route-specific)
11. apiRateLimiter()          — 200 requests/minute per userId
12. planLimitsCheck()         — Check plan quota (meeting-specific routes only)
13. validate(schema)          — Zod request body validation
14. ─── Controller ───
15. asyncHandler(controller)  — Catch async errors, pass to error handler
16. errorHandler()            — Global error → structured response (MUST be last)
```

### Tenant Middleware Detail

```typescript
// middleware/tenant.middleware.ts
export function injectTenant(req: Request, res: Response, next: NextFunction) {
  // req.user is already set by requireAuth at this point
  if (!req.user?.teamId) {
    return next(new AppError('NO_TEAM', 403,
      'You must be part of a team to access this resource. '
      + 'Complete onboarding at /onboarding'))
  }

  req.teamId = req.user.teamId

  // Log tenant context for all subsequent logs in this request
  req.log = logger.child({ userId: req.user.id, teamId: req.teamId })

  next()
}

// middleware/plan-limits.middleware.ts
export function checkMeetingLimit(req: Request, res: Response, next: NextFunction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const teamId = req.teamId

    // Cache plan data to avoid DB hit on every meeting creation
    const cacheKey = `cache:team:plan:${teamId}`
    let planData = await redis.get(cacheKey)

    if (!planData) {
      const team = await prisma.team.findUnique({
        where:  { id: teamId },
        select: { plan: true, meetingsUsed: true, billingCycleEnd: true },
      })
      planData = JSON.stringify(team)
      await redis.setex(cacheKey, 3600, planData)  // Cache 1 hour
    }

    const { plan, meetingsUsed } = JSON.parse(planData)
    const limit = PLAN_LIMITS[plan as PlanType].meetings

    if (limit !== -1 && meetingsUsed >= limit) {
      return next(new AppError('PLAN_LIMIT', 402, `Meeting limit reached (${meetingsUsed}/${limit} on ${plan} plan)`, {
        used:       meetingsUsed,
        limit,
        plan,
        upgradeUrl: `${process.env.FRONTEND_URL}/settings/billing`,
      }))
    }

    next()
  }
}
```

---

## 16. Rate Limiting System

### Redis Sliding Window Implementation

```typescript
// middleware/rate-limit.middleware.ts

interface RateLimitConfig {
  key:        (req: Request) => string
  limit:      number
  windowSecs: number
  errorCode:  string
}

function createRateLimiter(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key       = `ratelimit:${config.key(req)}`
    const windowMs  = config.windowSecs * 1000
    const now       = Date.now()
    const windowStart = now - windowMs

    // Lua script for atomic sliding window (no race conditions)
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local window_secs = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count current requests in window
      local count = redis.call('ZCARD', key)
      
      if count >= limit then
        return count
      end
      
      -- Add this request
      redis.call('ZADD', key, now, now .. math.random())
      redis.call('EXPIRE', key, window_secs)
      
      return count + 1
    `

    const count = await redis.eval(
      luaScript, 1, key, now, windowStart, config.limit, config.windowSecs
    ) as number

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit':     config.limit,
      'X-RateLimit-Remaining': Math.max(0, config.limit - count),
      'X-RateLimit-Reset':     Math.ceil((now + windowMs) / 1000),
    })

    if (count > config.limit) {
      return next(new AppError(config.errorCode, 429,
        `Rate limit exceeded. Try again in ${config.windowSecs} seconds.`
      ))
    }

    next()
  }
}

// Rate limiter instances
export const ipRateLimiter = createRateLimiter({
  key:        (req) => `ip:${req.ip}`,
  limit:      100,
  windowSecs: 60,
  errorCode:  'RATE_LIMITED',
})

export const loginRateLimiter = createRateLimiter({
  key:        (req) => `login:${createHash('sha256').update(req.body.email?.toLowerCase() ?? '').digest('hex')}`,
  limit:      5,
  windowSecs: 900,  // 15 minutes
  errorCode:  'ACCOUNT_LOCKED',
})

export const apiRateLimiter = createRateLimiter({
  key:        (req) => `api:${req.user?.id}`,
  limit:      200,
  windowSecs: 60,
  errorCode:  'RATE_LIMITED',
})
```

---

## 17. Real-Time Event System — Socket.io Design

### Server Setup

```typescript
// realtime/socket.server.ts

export function initializeSocketServer(httpServer: Server): SocketIoServer {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin:      process.env.FRONTEND_URL,
      credentials: true,
    },
    transports:       ['websocket'],
    pingTimeout:       20000,
    pingInterval:      25000,
    maxHttpBufferSize: 1e6,  // 1MB max event payload
  })

  // JWT authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token

    if (!token) {
      return next(new Error('NO_TOKEN'))
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload

      socket.data.userId = payload.sub
      socket.data.teamId = payload.teamId
      socket.data.role   = payload.role

      next()
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return next(new Error('TOKEN_EXPIRED'))
      }
      next(new Error('INVALID_TOKEN'))
    }
  })

  io.on('connection', (socket) => {
    const { userId, teamId } = socket.data

    logger.debug({ userId, teamId, socketId: socket.id }, 'Socket connected')

    // Join team room (for team-wide events)
    socket.join(`team:${teamId}`)
    // Join user room (for personal alerts)
    socket.join(`user:${userId}`)

    // Handle client joining a specific meeting room (for live transcript)
    socket.on('join:meeting', ({ meetingId }: { meetingId: string }) => {
      // Verify user belongs to the meeting's team before allowing join
      socket.join(`meeting:${meetingId}`)
    })

    socket.on('leave:meeting', ({ meetingId }: { meetingId: string }) => {
      socket.leave(`meeting:${meetingId}`)
    })

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, 'Socket disconnected')
    })
  })

  return io
}

// Export singleton for use across the application
let _io: SocketIoServer
export function getIO(): SocketIoServer {
  if (!_io) throw new Error('Socket.io not initialized')
  return _io
}
export function setIO(io: SocketIoServer) { _io = io }
```

---

## 18. Frontend State Architecture

### TanStack Query Key Factory

```typescript
// lib/cache/query-keys.ts — Single source of truth for all cache keys

export const queryKeys = {
  auth: {
    me:       () => ['auth', 'me']      as const,
    sessions: () => ['auth', 'sessions'] as const,
  },

  meetings: {
    all:        (teamId: string)                                    => ['teams', teamId, 'meetings']                      as const,
    list:       (teamId: string, filters: MeetingFilters)          => ['teams', teamId, 'meetings', 'list', filters]     as const,
    detail:     (teamId: string, meetingId: string)                => ['teams', teamId, 'meetings', meetingId]            as const,
    transcript: (teamId: string, meetingId: string)                => ['teams', teamId, 'meetings', meetingId, 'transcript'] as const,
  },

  commitments: {
    all:    (teamId: string)                                        => ['teams', teamId, 'commitments']                   as const,
    list:   (teamId: string, filters: CommitmentFilters)           => ['teams', teamId, 'commitments', 'list', filters]  as const,
    my:     (teamId: string, userId: string)                       => ['teams', teamId, 'commitments', 'my', userId]     as const,
    stats:  (teamId: string, period: DateRange)                    => ['teams', teamId, 'commitments', 'stats', period]  as const,
    detail: (teamId: string, commitmentId: string)                 => ['teams', teamId, 'commitments', commitmentId]     as const,
  },

  analytics: {
    overview: (teamId: string, period: DateRange)                  => ['teams', teamId, 'analytics', 'overview', period]  as const,
    members:  (teamId: string, period: DateRange)                  => ['teams', teamId, 'analytics', 'members', period]   as const,
    trends:   (teamId: string, metric: string, period: DateRange)  => ['teams', teamId, 'analytics', 'trends', metric, period] as const,
  },

  team: {
    members: (teamId: string)                                      => ['teams', teamId, 'members']                        as const,
    detail:  (teamId: string)                                      => ['teams', teamId, 'detail']                         as const,
  },

  billing: {
    plans:        () => ['billing', 'plans']                       as const,
    subscription: (teamId: string) => ['teams', teamId, 'subscription'] as const,
    invoices:     (teamId: string) => ['teams', teamId, 'invoices'] as const,
  },
} as const
```

### Optimistic Update Pattern

```typescript
// features/commitments/hooks/useMarkFulfilled.ts

export function useMarkFulfilled() {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()

  return useMutation({
    mutationFn: ({ commitmentId }: { commitmentId: string }) =>
      commitmentApi.markFulfilled(commitmentId),

    onMutate: async ({ commitmentId }) => {
      // Cancel any in-flight refetches that could overwrite our optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.commitments.all(user!.teamId),
      })

      // Snapshot the current value for rollback
      const previousCommitments = queryClient.getQueryData(
        queryKeys.commitments.list(user!.teamId, {})
      )

      // Optimistically update the cache
      queryClient.setQueryData(
        queryKeys.commitments.detail(user!.teamId, commitmentId),
        (old: Commitment | undefined) =>
          old ? { ...old, status: 'FULFILLED', resolvedAt: new Date().toISOString() } : old
      )

      return { previousCommitments }
    },

    onError: (err, { commitmentId }, context) => {
      // Roll back on error
      if (context?.previousCommitments) {
        queryClient.setQueryData(
          queryKeys.commitments.list(user!.teamId, {}),
          context.previousCommitments
        )
      }
      showToast({ title: 'Failed to mark commitment as done', variant: 'error' })
    },

    onSettled: () => {
      // Always refetch to ensure cache is fresh after mutation
      queryClient.invalidateQueries({
        queryKey: queryKeys.commitments.all(user!.teamId),
      })
    },
  })
}
```

---

## 19. API Response Contract

### Standard Response Shapes

```typescript
// utils/response.ts

export function success<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return { success: true, data, ...(meta && { meta }) }
}

export function error(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return { success: false, error: { code, message, ...(details && { details }) } }
}

// Success response
{
  "success": true,
  "data": { ... },
  "meta": {                    // Only on paginated endpoints
    "page":    1,
    "limit":   20,
    "total":   150,
    "hasMore": true
  }
}

// Error response
{
  "success": false,
  "error": {
    "code":    "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {               // Optional field-level details
      "fields": {
        "email":    "Invalid email format",
        "password": "Must contain at least one uppercase letter"
      }
    }
  }
}

// HTTP Status → Error Code mapping
401 → AUTH_REQUIRED, TOKEN_EXPIRED, TOKEN_INVALID, INVALID_CREDENTIALS
402 → PLAN_LIMIT
403 → FORBIDDEN, EMAIL_NOT_VERIFIED
404 → NOT_FOUND
409 → DUPLICATE
422 → VALIDATION_ERROR
429 → RATE_LIMITED, ACCOUNT_LOCKED
500 → INTERNAL_ERROR
502 → INTEGRATION_ERROR
```

---

## 20. Database Schema — Complete DDL

### Core Tables

```sql
-- users
CREATE TABLE users (
  id                VARCHAR(30)   PRIMARY KEY,
  email             VARCHAR(255)  NOT NULL UNIQUE,
  name              VARCHAR(255)  NOT NULL,
  avatar_url        TEXT,
  timezone          VARCHAR(100)  NOT NULL DEFAULT 'UTC',
  password_hash     VARCHAR(255),                -- NULL for OAuth-only users
  email_verified    BOOLEAN       NOT NULL DEFAULT FALSE,
  failed_attempts   INT           NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  google_id         VARCHAR(255)  UNIQUE,
  github_id         VARCHAR(255)  UNIQUE,
  team_id           VARCHAR(30)   REFERENCES teams(id) ON DELETE SET NULL,
  role              VARCHAR(20)   NOT NULL DEFAULT 'MEMBER'
                    CHECK (role IN ('OWNER','ADMIN','MANAGER','MEMBER')),
  commitment_score  INT           NOT NULL DEFAULT 0,  -- Denormalized for fast reads
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_team_id   ON users(team_id);
CREATE INDEX idx_users_team_role ON users(team_id, role);


-- teams
CREATE TABLE teams (
  id                  VARCHAR(30)   PRIMARY KEY,
  name                VARCHAR(255)  NOT NULL,
  slug                VARCHAR(100)  NOT NULL UNIQUE,
  plan                VARCHAR(20)   NOT NULL DEFAULT 'FREE'
                      CHECK (plan IN ('FREE','STARTER','GROWTH','BUSINESS','ENTERPRISE')),
  stripe_customer_id  VARCHAR(255)  UNIQUE,
  stripe_sub_id       VARCHAR(255)  UNIQUE,
  meetings_used       INT           NOT NULL DEFAULT 0,
  billing_cycle_end   TIMESTAMPTZ,
  settings            JSONB         NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- meetings
CREATE TABLE meetings (
  id                    VARCHAR(30)   PRIMARY KEY,
  team_id               VARCHAR(30)   NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title                 VARCHAR(500)  NOT NULL,
  platform              VARCHAR(20)   NOT NULL
                        CHECK (platform IN ('ZOOM','GOOGLE_MEET','TEAMS','WEBEX','MANUAL')),
  meeting_url           TEXT          NOT NULL,
  platform_meeting_id   VARCHAR(255),
  recall_bot_id         VARCHAR(255),
  status                VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN ('SCHEDULED','BOT_JOINING','RECORDING','PROCESSING','DONE','FAILED','CANCELLED')),
  scheduled_at          TIMESTAMPTZ   NOT NULL,
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  duration_minutes      INT,
  calendar_event_id     VARCHAR(500),
  mongo_transcript_id   VARCHAR(30),
  summary               TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_meetings_team_status      ON meetings(team_id, status);
CREATE INDEX idx_meetings_team_scheduled   ON meetings(team_id, scheduled_at DESC);
CREATE INDEX idx_meetings_recall_bot       ON meetings(recall_bot_id) WHERE recall_bot_id IS NOT NULL;
CREATE UNIQUE INDEX idx_meetings_platform_dedup
  ON meetings(team_id, platform_meeting_id) WHERE platform_meeting_id IS NOT NULL;


-- commitments (THE CORE TABLE)
CREATE TABLE commitments (
  id                      VARCHAR(30)   PRIMARY KEY,
  team_id                 VARCHAR(30)   NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  meeting_id              VARCHAR(30)   NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  owner_id                VARCHAR(30)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text                    TEXT          NOT NULL,
  normalized_text         TEXT,
  due_date                TIMESTAMPTZ,
  due_date_raw            VARCHAR(255),
  status                  VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','FULFILLED','MISSED','DEFERRED','CANCELLED')),
  confidence_score        FLOAT         NOT NULL DEFAULT 1.0
                          CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  resolved_at             TIMESTAMPTZ,
  resolved_in_meeting_id  VARCHAR(30)   REFERENCES meetings(id) ON DELETE SET NULL,
  reminder_sent_at        TIMESTAMPTZ,
  missed_alert_sent_at    TIMESTAMPTZ,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_commitments_team_status  ON commitments(team_id, status);
CREATE INDEX idx_commitments_owner        ON commitments(owner_id);
CREATE INDEX idx_commitments_meeting      ON commitments(meeting_id);
-- Critical partial index for cron job: "find overdue PENDING commitments"
CREATE INDEX idx_commitments_overdue
  ON commitments(team_id, due_date)
  WHERE status = 'PENDING' AND due_date IS NOT NULL;
```

---

## 21. Redis Key Space Design

### Complete Key Registry

```
NAMESPACE           KEY FORMAT                                TTL      VALUE
──────────────────────────────────────────────────────────────────────────────────────
Auth / Sessions
  OAuth CSRF        oauth:state:{state_hex}                  600s     JSON: { provider, teamId }
  Login rate limit  ratelimit:login:{sha256(email)}          900s     Integer (attempt count)
  API rate limit    ratelimit:api:{userId}                   60s      Sorted set (timestamps)
  IP rate limit     ratelimit:ip:{ipAddress}                 60s      Sorted set (timestamps)
  Resend rate       ratelimit:resend:{sha256(email)}         60s      Integer

Bot Management
  Bot dedup         bot:scheduled:{platform}:{meetingId}    14400s   Meeting PostgreSQL ID

Caching
  Team members      cache:team:members:{teamId}              300s     JSON array
  Team plan data    cache:team:plan:{teamId}                 3600s    JSON { plan, meetingsUsed }
  Commit stats      cache:team:stats:{teamId}:{from}:{to}   300s     JSON stats object
  User profile      cache:user:profile:{userId}              300s     JSON user object

Notification Dedup
  Missed alert      notif:sent:COMMITMENT_MISSED:{uid}:{cid} 3600s   "1"
  Deadline reminder notif:sent:DEADLINE_REMINDER:{uid}:{cid} 86400s  "1"
  Weekly digest     notif:sent:WEEKLY_DIGEST:{teamId}        604800s "1"

Calendar Sync
  Last sync time    sync:calendar:{userId}:last              none     ISO timestamp string

Bull Queue Keys (managed by Bull — do not write directly)
  Queue jobs        bull:{queueName}:*                       auto     Bull internal
  Job data          bull:{queueName}:{jobId}                 auto     JSON job payload
```

---

## 22. MongoDB Document Schema

### Transcripts Collection

```javascript
// Collection: transcripts
// Indexes:
//   { meeting_id: 1 }                    — lookup by meeting
//   { team_id: 1, created_at: -1 }       — team list sorted by date
//   { processing_status: 1 }              — find pending jobs
//   Atlas Search: { full_text }           — full-text search across all transcripts

{
  _id:           ObjectId,

  // Links to PostgreSQL
  meeting_id:    String,       // Required — FK to meetings.id
  team_id:       String,       // Required — for tenant-scoped queries

  recall_bot_id: String,
  platform:      String,       // "zoom" | "google_meet" | "teams"

  // Raw transcript from Recall.ai
  raw_transcript: [
    {
      speaker_tag:    String,  // "Speaker 1" — Recall.ai label
      speaker_email:  String,  // null if unmatched
      speaker_name:   String,  // null if unmatched
      text:           String,  // Full spoken turn
      start_time:     Number,  // Seconds from meeting start
      end_time:       Number,
      confidence:     Number,  // ASR confidence (0-1)
      words: [                 // Word-level timestamps
        { text: String, start_time: Number, end_time: Number }
      ]
    }
  ],

  // Concatenated full text for Atlas Search
  full_text: String,           // "Ali Raza: Good morning...\nAhmed Hassan: ..."

  // AI extraction results (written by extract.worker after processing)
  ai_extraction: {
    extracted_at:  ISODate,
    model_used:    String,     // "claude-haiku-4-5-20251001"
    tokens_used:   Number,
    processing_ms: Number,

    commitments: [
      {
        text:            String,
        normalized_text: String,
        owner_name:      String,
        due_date_raw:    String,
        due_date_iso:    String,
        confidence:      Number,
        pg_id:           String   // PostgreSQL commitments.id (set after save)
      }
    ],
    action_items:  [...],
    decisions:     [...],
    blockers:      [...],
    summary:       String
  },

  // Processing lifecycle
  processing_status:       String,    // "pending" | "processing" | "done" | "failed"
  processing_started_at:   ISODate,
  processing_completed_at: ISODate,
  processing_error:        String,    // null on success
  processing_attempts:     Number,    // Retry counter

  created_at: ISODate,
  updated_at: ISODate
}
```

---

## 23. Error Handling & Classification

### Error Hierarchy

```typescript
// utils/errors.ts

export class AppError extends Error {
  constructor(
    public readonly code:       string,
    public readonly statusCode: number,
    message:                    string,
    public readonly details?:   Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Auth errors
export class UnauthorizedError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, 401, message, details)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FORBIDDEN', 403, message, details)
  }
}

// Resource errors
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', 404, `${resource}${id ? ` '${id}'` : ''} not found`)
  }
}

export class DuplicateError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DUPLICATE', 409, message, details)
  }
}

// Business logic errors
export class PlanLimitError extends AppError {
  constructor(resource: string, used: number, limit: number, upgradeUrl: string) {
    super('PLAN_LIMIT', 402,
      `${resource} limit reached (${used}/${limit})`,
      { used, limit, upgradeUrl }
    )
  }
}

export class ValidationError extends AppError {
  constructor(fields: Record<string, string>) {
    super('VALIDATION_ERROR', 422, 'Validation failed', { fields })
  }
}

// Infrastructure errors
export class IntegrationError extends AppError {
  constructor(provider: string, message: string) {
    super('INTEGRATION_ERROR', 502, `${provider} integration error: ${message}`)
  }
}

// Global error middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // AppError — our own known errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json(error(err.code, err.message, err.details))
    return
  }

  // Prisma errors — map to known codes
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {  // Unique constraint violation
      res.status(409).json(error('DUPLICATE', 'Resource already exists'))
      return
    }
    if (err.code === 'P2025') {  // Record not found
      res.status(404).json(error('NOT_FOUND', 'Resource not found'))
      return
    }
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(
      err.errors.map(e => [e.path.join('.'), e.message])
    )
    res.status(422).json(error('VALIDATION_ERROR', 'Validation failed', { fields }))
    return
  }

  // Unknown error — log + return 500
  logger.error({ err, path: req.path, userId: req.user?.id }, 'Unhandled error')
  Sentry.captureException(err)

  res.status(500).json(error('INTERNAL_ERROR',
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Our team has been notified.'
      : err.message
  ))
}
```

---

## 24. Idempotency Design

### Webhook Idempotency

```typescript
// Recall.ai may send the same webhook event multiple times
// (network retries, their internal retry logic)
// We must handle duplicates gracefully.

// Pattern: Check-before-write with idempotency key

async function handleBotDone(data: RecallBotDonePayload): Promise<void> {
  const idempotencyKey = `webhook:recall:bot.done:${data.bot_id}`

  // Check if already processed
  const alreadyProcessed = await redis.exists(idempotencyKey)
  if (alreadyProcessed) {
    logger.info({ botId: data.bot_id }, 'bot.done event already processed — skipping')
    return
  }

  // Set idempotency key FIRST (before processing)
  // TTL: 24 hours (covers any possible retry window from Recall.ai)
  await redis.setex(idempotencyKey, 86400, 'processing')

  try {
    // ... actual processing logic ...
    await redis.setex(idempotencyKey, 86400, 'done')  // Mark complete
  } catch (error) {
    // Remove key on failure so it can be retried
    await redis.del(idempotencyKey)
    throw error
  }
}

// Database-level idempotency for meeting creation from calendar sync:
// UNIQUE constraint on (team_id, platform_meeting_id) prevents duplicate meetings
// even if calendar sync runs concurrently for multiple team members

// Stripe webhook idempotency:
// Stripe sends each event with a unique event.id
// Store processed event IDs: SET stripe:event:{event_id} "processed" EX 86400
// Skip if already processed
```

### Bulk Insert Idempotency

```typescript
// For AI extraction results — meeting can be re-processed if extraction fails
// Use UPSERT (ON CONFLICT DO UPDATE) instead of INSERT

// In extract.worker.ts transaction:
await tx.$executeRaw`
  INSERT INTO commitments (id, team_id, meeting_id, owner_id, text, normalized_text,
                           due_date, due_date_raw, status, confidence_score)
  VALUES ${commitmentValues}
  ON CONFLICT (meeting_id, owner_id, normalized_text)
  DO UPDATE SET
    updated_at      = NOW(),
    confidence_score = EXCLUDED.confidence_score
  -- Don't overwrite status if already manually changed
  WHERE commitments.status = 'PENDING'
`
// This makes the extraction step safe to re-run without creating duplicates
```

---

## Summary: Component Interaction Map

```
REQUEST LIFECYCLE — "User marks commitment fulfilled":

Browser
  PATCH /api/v1/commitments/{id}/status { status: "FULFILLED" }
  Authorization: Bearer {accessToken}
         │
         ▼
  [Node.js API Middleware Chain]
  cors → helmet → json → cookieParser →
  requireAuth (verify JWT, attach req.user) →
  injectTenant (attach req.teamId) →
  requireRole (MEMBER can only update own) →
  validate (Zod: status must be FULFILLED/DEFERRED/CANCELLED) →
         │
         ▼
  [commitments.controller.ts]
  Extract: commitmentId from params, status from body
  Call: commitmentService.updateStatus(commitmentId, status, req.user, req.teamId)
         │
         ▼
  [commitments.service.ts]
  1. repo.findById(commitmentId) → verify belongs to req.teamId
  2. Verify ownership: MEMBER can only update own; MANAGER+ can update any
  3. Validate transition: PENDING → FULFILLED is valid
  4. repo.updateStatus(commitmentId, 'FULFILLED', { resolvedAt: now })
  5. scoreService.recalculate(commitment.ownerId, teamId)
  6. repo.updateUserScore(commitment.ownerId, newScore)
  7. io.to(`team:${teamId}`).emit('commitment:fulfilled', { commitmentId, newScore })
  8. io.to(`user:${commitment.ownerId}`).emit('my:score_updated', { newScore, change })
  9. notifyQueue.add('commitment-fulfilled', { commitmentId, teamId })
  10. cache invalidate: del `cache:team:stats:${teamId}:*`
         │
         ▼
  [HTTP Response 200]
  { success: true, data: { id, status: "FULFILLED", resolvedAt: "..." } }
         │
         ▼
  [Browser: TanStack Query]
  onSettled: invalidateQueries(['teams', teamId, 'commitments'])
  → Automatic refetch → fresh data in UI
         │
         ▼
  [Browser: Socket.io listener]
  'commitment:fulfilled' → update CommitmentCard in real-time (all team members)
  'my:score_updated' → animate score change in MemberRow
```

---

*Document: LLD-001 | Vocaply | Version 1.0 | May 2026*
*Low Level System Design — Component & Implementation Detail*
