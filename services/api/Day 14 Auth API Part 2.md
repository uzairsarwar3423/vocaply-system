# Day 14 — Auth API Part 2 Full Plan
## Refresh · Email Verify · Password Reset · Google OAuth · Sessions · Middleware

> **Theme:** Aaj auth system complete hoga. Baad mein koi auth bug fix karni nahi chahiye.

---

## Table of Contents

1. [Big Picture — Day 14 Kya Complete Karega](#1-big-picture)
2. [File Map — Konsi File Mein Kya Hoga](#2-file-map)
3. [File-by-File Deep Dive](#3-file-by-file-deep-dive)
   - [auth.repository.ts — New Functions](#31-authrepositoryts--new-functions)
   - [auth.service.ts — Token Refresh](#32-authservicets--token-refresh)
   - [auth.service.ts — Email Verification](#33-authservicets--email-verification)
   - [auth.service.ts — Password Reset](#34-authservicets--password-reset)
   - [auth.service.ts — Google OAuth](#35-authservicets--google-oauth)
   - [auth.service.ts — Profile (me)](#36-authservicets--profile-me)
   - [auth.service.ts — Sessions](#37-authservicets--sessions)
   - [auth.controller.ts — New Endpoints](#38-authcontrollerts--new-endpoints)
   - [auth.routes.ts — Complete Route Map](#39-authroutests--complete-route-map)
   - [tenant.middleware.ts](#310-tenantmiddlewarets)
   - [role.middleware.ts](#311-rolemiddlewarets)
4. [Security Decisions — Kyun Aisa Kiya](#4-security-decisions)
5. [Scalability Decisions](#5-scalability-decisions)
6. [Build Order — Step-by-Step Plan](#6-build-order)
7. [End-of-Day Checklist](#7-end-of-day-checklist)
8. [Complete Auth API Reference](#8-complete-auth-api-reference)

---

## 1. Big Picture

Day 13 mein humne likha tha: Register, Login, Logout, requireAuth.  
Day 14 mein auth system ka baaki sab hissa complete hoga:

| Feature | Problem Jo Solve Hota Hai |
|---|---|
| Token Refresh (Rotation) | Access token 15min mein expire hota hai — user logout na ho silently |
| Email Verification | Token validate karo, user ko verify karo, auto-login do |
| Password Reset | Forgot password flow — secure, one-time use token |
| Google OAuth | Social login — users email/password nahi banana chahte |
| GET/PATCH /auth/me | User apna profile dekhe/update kare |
| Sessions List + Revoke | User dekhe kahan se login hai, specific session logout kare |
| Tenant Middleware | Team-based access — teamId har request mein inject ho |
| Role Middleware | Role-based access control — OWNER > ADMIN > MANAGER > MEMBER |

**Architecture wahi hai — Controller → Service → Repository.**  
Day 14 mein existing files mein nayi functions add hongi, koi naya pattern nahi.

---

## 2. File Map

```
services/api/src/
│
├── modules/
│   └── auth/
│       ├── auth.repository.ts    ← UPDATED: 6 nayi query functions add hongi
│       ├── auth.service.ts       ← UPDATED: refresh, verify, reset, oauth, me, sessions
│       ├── auth.controller.ts    ← UPDATED: 8 nayi endpoints ke handlers
│       ├── auth.routes.ts        ← UPDATED: sab routes register honge
│       └── auth.validator.ts     ← UPDATED: forgotPasswordSchema, resetPasswordSchema
│
├── middleware/
│   ├── auth.middleware.ts        ← Day 13 ka (unchanged)
│   ├── tenant.middleware.ts      ← FILLED IN: injectTenant function
│   └── role.middleware.ts        ← NEW: requireRole factory function
│
└── (Redis client already setup from infrastructure days)
```

**Nayi files sirf 2:** `tenant.middleware.ts` aur `role.middleware.ts`  
Baaki sab existing files mein additions.

---

## 3. File-by-File Deep Dive

---

### 3.1 `auth.repository.ts` — New Functions

Day 13 mein 11 functions the. Aaj 6 aur add honge:

| Function | Kya karta hai | Kaun use karta hai |
|---|---|---|
| `findEmailVerificationToken(tokenHash)` | Hash se verification token dhundho | Email verify service |
| `deleteEmailVerificationToken(id)` | Verified token delete karo | Email verify (post-verify cleanup) |
| `createPasswordResetToken(data)` | Reset token store karo (hash only) | Forgot password |
| `findPasswordResetToken(tokenHash)` | Hash se reset token dhundho | Reset password |
| `markPasswordResetTokenUsed(id)` | `usedAt` timestamp set karo | Reset password (audit trail) |
| `findUserByGoogleId(googleId)` | Google ID se user dhundho | OAuth callback |
| `linkGoogleAccount(userId, googleId, picture)` | Existing user se Google link karo | OAuth account linking |
| `getSessionsByUserId(userId)` | User ke sare refresh tokens | Sessions list |

**Kyun separate functions for each token type?**  
`emailVerificationToken`, `passwordResetToken`, `refreshToken` — teen alag tables. Ek galat table mein search karo toh security hole. Explicit functions → explicit intent.

---

### 3.2 `auth.service.ts` — Token Refresh

**Endpoint:** `POST /auth/refresh`  
**Auth:** Public (koi Bearer token nahi — sirf cookie)

**Yeh feature kyun zaroori hai:**  
Access token 15 min mein expire hota hai. Agar refresh na ho, user har 15 min mein login kare — terrible UX. Refresh token (30 days) silently naya access token deta hai.

**Rotation kyun? (Sabse important concept)**  
Simple approach: refresh token permanent rakho, sirf access token refresh karo.  
**Problem:** Agar refresh token ek baar steal ho gaya → hamesha ke liye valid.  

Rotation approach: Har refresh pe:
- Purana refresh token DELETE karo DB se
- Naya refresh token banao
- Naya cookie set karo

**Agar stolen token use ho:**  
Attacker naya token le gaya → original user ka cookie invalidate → original user ka agle request fail → user forcefully logout → attacker ka stolen token bhi ek use ke baad dead.

Yeh "refresh token rotation with reuse detection" pattern hai.

**Step-by-step flow:**

```
Step 1: Cookie se refreshToken lo
  → req.cookies.vocaply_refresh
  → nahi mila? → 401 NO_REFRESH_TOKEN

Step 2: DB mein dhundho
  → tokenHash = hashToken(refreshToken)
  → repo.findRefreshToken(tokenHash)
  → nahi mila? → 401 INVALID_REFRESH_TOKEN
  → (Reuse detection: agar token DB mein nahi mila lekin koi use kar raha hai
     → stolen token detect karo → family ke sare tokens revoke karo — advanced)

Step 3: Expiry check
  → stored.expiresAt < now?
  → repo.deleteRefreshToken(stored.id)  ← expired cleanup
  → 401 REFRESH_TOKEN_EXPIRED

Step 4: User fetch karo
  → repo.findById(stored.userId)
  → nahi mila? → 401 USER_NOT_FOUND (account deleted hoga)

Step 5: ROTATION — old delete, new create
  → repo.deleteRefreshToken(stored.id)  ← purana gone
  → newRefreshToken = generateRefreshToken()
  → repo.createRefreshToken({ userId, tokenHash: hash(newRefreshToken), expiresAt: +30d })

Step 6: New access token
  → newAccessToken = generateAccessToken(user)

Step 7: Cookie update + response
  → res.cookie('vocaply_refresh', newRefreshToken, COOKIE_OPTIONS)
  → return { accessToken: newAccessToken }
  ← Sirf accessToken return karo — refresh token cookie mein hai
```

**Frontend ka flow:**
```
API call → 401 TOKEN_EXPIRED
  → POST /auth/refresh (cookie automatically jaata hai)
  → Naya accessToken mila
  → Original request retry karo
  → User ko kuch dikha hi nahi
```

---

### 3.3 `auth.service.ts` — Email Verification

**Endpoint:** `GET /auth/verify-email?token=xxx`  
**Auth:** Public (email mein link hota hai, user logged in nahi hota)

**Kyun yeh zaroori hai:**  
Day 13 mein register ke baad user ko email bheja, login allow nahi kiya. Ab yeh endpoint woh token validate karega.

**Step-by-step flow:**

```
Step 1: Token query param lo
  → req.query.token
  → nahi mila? → 400 TOKEN_REQUIRED

Step 2: Hash nikalo aur DB mein dhundho
  → tokenHash = hashToken(token)
  → repo.findEmailVerificationToken(tokenHash)
  → nahi mila? → 400 TOKEN_INVALID
  → (Token never existed ya already used — same error, no info leak)

Step 3: Expiry check
  → stored.expiresAt < now?
  → 410 TOKEN_EXPIRED
  → Kyun 410 (Gone) na ki 400? — Semantically correct: token tha, ab expired hai
  → Frontend ko pata chalega "resend verification email" button dikhao

Step 4: Transaction — atomically karo
  → user.emailVerified = true  (user table update)
  → emailVerificationToken delete  (one-time use enforce)
  → Kyun transaction? Agar user update ho gaya aur token delete fail ho gaya
    → same token dobara use ho sakta tha → security hole

Step 5: Auto-login
  → user = repo.findById(stored.userId)
  → accessToken = generateAccessToken(user)
  → refreshToken = generateRefreshToken()
  → repo.createRefreshToken(...)
  → res.cookie('vocaply_refresh', ...)

Step 6: Response
  → { accessToken, user, message: "Email verified successfully" }
  → User verify karte hi seedha dashboard — extra login step nahi
```

**Kyun auto-login?**  
User ne abhi email link click kiya — woh already tha email ke paas. Extra login step unnecessary friction. Verify → seedha app mein.

---

### 3.4 `auth.service.ts` — Password Reset

**Do endpoints:**  
`POST /auth/forgot-password` — reset link bhejo  
`POST /auth/reset-password` — naya password set karo

---

**Forgot Password Flow:**

```
Step 1: Email lo (Zod validate)
  → forgotPasswordSchema: z.object({ email: z.string().email() })

Step 2: User dhundho
  → repo.findByEmail(email)
  → CHAHE MILA YA NAHI → HAMESHA SAME 200 RESPONSE
  → "If that email exists, a reset link has been sent"
  → Kyun? User enumeration attack rokna:
    "Email not found" → attacker ko pata chal gaya email registered nahi
    "Email sent" hamesha → attacker kuch nahi jaanta

Step 3: Sirf tab email bhejo agar user mila AND verified hai
  → token = crypto.randomBytes(32).toString('hex')
  → tokenHash = hashToken(token)
  → repo.createPasswordResetToken({ userId, tokenHash, expiresAt: now + 1 hour })
  → emailService.sendPasswordResetEmail({ to: email, token })
  → 1 hour expiry: security vs UX balance
    (15 min = too short, user might not check email; 24h = too long, window of attack)

Step 4: Response — always same
  → 200 { message: "If that email exists, a reset link has been sent" }
```

---

**Reset Password Flow:**

```
Step 1: Validate input
  → resetPasswordSchema: z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8)...  (same rules as register)
    })

Step 2: Token validate karo
  → tokenHash = hashToken(token)
  → repo.findPasswordResetToken(tokenHash)
  → nahi mila? → 400 TOKEN_INVALID
  → stored.usedAt is set? → 400 TOKEN_INVALID (already used)
  → stored.expiresAt < now? → 410 TOKEN_EXPIRED

Step 3: Naya password hash karo
  → bcrypt.hash(newPassword, 12)

Step 4: Transaction — teen cheezein atomically
  → user.passwordHash = newHash
  → passwordResetToken.usedAt = now  ← DELETE nahi, audit trail ke liye mark karo
  → refreshToken.deleteMany(userId)  ← SARE SESSIONS INVALIDATE

  Kyun sare sessions delete?
  → Agar kisi ne password steal kiya → account compromise
  → Password reset = proof account owner wapas control mein hai
  → Purane sessions (jo possibly attacker ke) sab khatam

Step 5: Auto-login (fresh session)
  → accessToken generate karo
  → refreshToken generate karo
  → Cookie set karo
  → return { accessToken, user, message: "Password reset successful" }
```

**Kyun `usedAt` set karo, delete nahi?**  
Audit trail. Security incident mein pata chalega: kab token create hua, kab use hua, kaunse IP se. Delete karo toh yeh history khatam.

---

### 3.5 `auth.service.ts` — Google OAuth

**Do endpoints:**  
`GET /auth/google` — Google par redirect karo  
`GET /auth/google/callback` — Google wapas bhejta hai yahan

**OAuth ka full flow (simple terms):**

```
User "Login with Google" click karta hai
  → Tumhara server: Google ka URL banao (client_id, redirect_uri, scope, state)
  → User Google par jaata hai, login karta hai, permission deta hai
  → Google: tumhare callback URL par redirect karta hai with `code` aur `state`
  → Tumhara server: code exchange karo Google se tokens ke liye
  → Google: id_token deta hai (user ki info)
  → Tumhara server: user dhundho ya banao, session issue karo
```

---

**Initiate Flow — `GET /auth/google`:**

```
Step 1: CSRF state generate karo
  → state = crypto.randomBytes(32).toString('hex')
  → Redis mein store karo: SET oauth:state:{state} "1" EX 600  (10 min TTL)
  → Kyun Redis? State temporary hai, DB mein row banana wasteful

Step 2: Google Auth URL banao
  → Parameters:
    client_id    = GOOGLE_CLIENT_ID
    redirect_uri = API_URL/auth/google/callback
    response_type = code
    scope        = openid email profile
    state        = woh random string
    access_type  = offline  (refresh token bhi milega Google se)

Step 3: Redirect
  → res.redirect(googleAuthUrl)
```

**CSRF State kyun zaroori hai:**  
Bina state ke: attacker apna OAuth flow start kare, callback URL tumhare user ko bheje → user ka session attacker ke account se link ho jaaye.  
State ke saath: callback mein state verify karo Redis se → agar match nahi → reject.

---

**Callback Flow — `GET /auth/google/callback`:**

```
Step 1: Query params lo
  → { code, state, error } = req.query

Step 2: Error check
  → error === 'access_denied'? → redirect /login?error=oauth_denied
  → (User ne Google par Cancel kiya)

Step 3: State verify karo (CSRF check)
  → Redis mein dhundho: GET oauth:state:{state}
  → nahi mila? → redirect /login?error=oauth_failed
  → mila? → DELETE oauth:state:{state}  ← one-time use

Step 4: Code exchange karo
  → POST to https://oauth2.googleapis.com/token
  → Send: code, client_id, client_secret, redirect_uri, grant_type=authorization_code
  → Milta hai: access_token, id_token, refresh_token

Step 5: id_token decode karo
  → JWT hai (Google signed) — verify karo Google ka public key se
  → Payload se nikalo: sub (googleId), email, name, picture, email_verified

Step 6: Account linking logic (3 cases)
  ┌─────────────────────────────────────────────────────────────┐
  │ CASE 1: googleId already DB mein hai                        │
  │   → Existing Google user → seedha login                     │
  ├─────────────────────────────────────────────────────────────┤
  │ CASE 2: googleId nahi, email mila                           │
  │   → Existing email/password user                            │
  │   → Google ID link karo unke account se                     │
  │   → (repo.linkGoogleAccount)                                │
  ├─────────────────────────────────────────────────────────────┤
  │ CASE 3: Dono nahi                                           │
  │   → Naya user banao                                         │
  │   → emailVerified: true  (Google ne already verify kiya)    │
  │   → passwordHash: null   (OAuth user, no password)          │
  └─────────────────────────────────────────────────────────────┘

Step 7: Session issue karo
  → accessToken, refreshToken generate karo (same as login)
  → Cookie set karo

Step 8: Redirect
  → New user? → redirect /onboarding
  → Existing user? → redirect /dashboard
  → accessToken URL mein? NAHI — cookie se ho raha hai
```

**Kyun redirect at the end (nahi JSON response)?**  
OAuth flow browser mein hoti hai — redirects ke through. JSON response tab kaam karta hai jab fetch/AJAX call ho. Is flow mein browser redirect karta hai, isliye server bhi redirect se respond karta hai.

---

### 3.6 `auth.service.ts` — Profile (me)

**Endpoints:**  
`GET /auth/me` — apna profile dekho  
`PATCH /auth/me` — profile update karo

Dono `requireAuth` ke peeche hain.

**GET /auth/me:**
```
→ req.user.id se user fetch karo (with team data)
→ return { id, name, email, role, teamId, team, avatarUrl, timezone, lastLogin }
← Passwordhash KABHI return nahi
```

**PATCH /auth/me:**
```
→ Validate: sirf { name, timezone, avatarUrl } update allowed
→ Email update yahan nahi (alag verification flow chahiye)
→ Password update yahan nahi (alag current password verification chahiye)
→ repo.updateUser(userId, { name, timezone, avatarUrl })
→ Updated user return karo
```

**Kyun limited fields?**  
Email change = verification chahiye (naya email verify karo).  
Password change = current password verify karo (auth check).  
Yeh dono alag endpoints honge (`/auth/change-email`, `/auth/change-password`) — Day 18 mein.

---

### 3.7 `auth.service.ts` — Sessions

**Endpoints:**  
`GET /auth/sessions` — active sessions list  
`DELETE /auth/sessions/:sessionId` — specific session revoke

`requireAuth` required dono par.

**GET /auth/sessions:**
```
→ repo.getSessionsByUserId(req.user.id)
→ Har session ke liye return:
   { id, ipAddress, userAgent, createdAt, lastUsedAt, isCurrent }
→ isCurrent: current request ka cookie hash == is session ka tokenHash?
   Kyun? User dekhe "yeh wali device pe main hun abhi"
```

**DELETE /auth/sessions/:sessionId:**
```
→ sessionId = req.params.sessionId
→ Session fetch karo — verify karo yeh is user ki session hai
  (dusre user ki session delete nahi kar sakte)
→ Current session? → 400 "Use /logout to end current session"
  Kyun? UX clarity — current session ka alag flow
→ repo.deleteRefreshToken(sessionId)
→ 200 { message: "Session revoked" }
```

**Use case:** User ne notice kiya "Lagos, Nigeria se login show ho raha hai" — woh session revoke karo seedha dashboard se.

---

### 3.8 `auth.controller.ts` — New Endpoints

Wahi pattern — req → service → res. Zero logic.

| Controller Function | Kya karta hai |
|---|---|
| `refresh` | authService.refresh(req, res) → 200 { accessToken } |
| `verifyEmail` | authService.verifyEmail(req.query.token, req, res) → 200 |
| `forgotPassword` | authService.forgotPassword(req.body.email) → 200 |
| `resetPassword` | authService.resetPassword(req.body, req, res) → 200 |
| `googleInit` | authService.googleInit(res) → redirect |
| `googleCallback` | authService.googleCallback(req.query, req, res) → redirect |
| `getMe` | authService.getMe(req.user.id) → 200 user |
| `updateMe` | authService.updateMe(req.user.id, req.body) → 200 user |
| `getSessions` | authService.getSessions(req.user.id, req) → 200 sessions[] |
| `revokeSession` | authService.revokeSession(req.user.id, req.params.id, req) → 200 |

---

### 3.9 `auth.routes.ts` — Complete Route Map

**Public routes (koi auth nahi):**
```
POST   /auth/register          → validate(registerSchema) → loginRateLimiter → register
POST   /auth/login             → validate(loginSchema) → loginRateLimiter → login
POST   /auth/logout            → logout
POST   /auth/refresh           → refresh
GET    /auth/verify-email      → verifyEmail
POST   /auth/forgot-password   → validate(forgotPasswordSchema) → forgotRateLimiter → forgotPassword
POST   /auth/reset-password    → validate(resetPasswordSchema) → resetPassword
GET    /auth/google            → googleInit
GET    /auth/google/callback   → googleCallback
```

**Protected routes (requireAuth zaroori):**
```
GET    /auth/me                → requireAuth → getMe
PATCH  /auth/me                → requireAuth → validate(updateMeSchema) → updateMe
GET    /auth/sessions          → requireAuth → getSessions
DELETE /auth/sessions/:id      → requireAuth → revokeSession
```

**Rationale — alag rate limiters:**
- `loginRateLimiter`: 10 req/15min (credential endpoints)
- `forgotRateLimiter`: 3 req/hour (email bhejne ka cost hai, stricter)
- `resetPassword`: token ki validity hi rate limit hai (1 use only)

---

### 3.10 `tenant.middleware.ts`

**Kya hai:** Har team-based request mein `req.teamId` inject karo.

**Flow:**
```
requireAuth run ho chuka hai → req.user available hai
  → req.user.teamId hai? → req.teamId = req.user.teamId → next()
  → nahi? → 403 ForbiddenError("You must be part of a team")
```

**Kyun alag middleware?**  
Kuch routes individual access dete hain (profile, billing), kuch team-based hain (jobs, pipeline).  
`requireAuth` → sirf user verify  
`requireAuth + injectTenant` → user + team dono required  
Composable — middleware chain mein add/remove karo as needed.

**Usage example (Day 15+ routes mein):**
```
router.get('/jobs', requireAuth, injectTenant, jobsController.list)
```

---

### 3.11 `role.middleware.ts`

**Kya hai:** Role-based access control (RBAC) factory function.

**Role hierarchy:**
```
OWNER   = 4  (sab kuch kar sakta hai)
ADMIN   = 3  (team manage kar sakta hai, OWNER ke kuch kaam nahi)
MANAGER = 2  (candidates, pipeline manage)
MEMBER  = 1  (sirf dekh sakta hai, create nahi)
```

**`requireRole(...roles)` factory:**
```
→ roles pass karo jinka minimum access chahiye
→ requireRole('ADMIN') → ADMIN aur OWNER allowed, MANAGER aur MEMBER nahi
→ requireRole('ADMIN', 'OWNER') → same as above (minimum ADMIN level)
→ requireRole('MEMBER') → sab roles allowed (sirf authenticated)

Logic:
  userLevel = ROLE_LEVELS[req.user.role]
  requiredLevel = minimum of all passed roles' levels
  userLevel >= requiredLevel? → next()
  nahi? → 403 ForbiddenError("Requires role: ADMIN or OWNER")
```

**Kyun factory function (nahi hardcoded middleware)?**  
Ek middleware likhni padi hoti har role ke liye:  
`requireAdmin`, `requireOwner`, `requireManager` — duplication.  
Factory approach: `requireRole('ADMIN')` — ek function, infinite flexibility.

**Usage examples:**
```
router.delete('/team/members/:id', requireAuth, injectTenant, requireRole('ADMIN'), handler)
router.get('/jobs', requireAuth, injectTenant, requireRole('MEMBER'), handler)
router.patch('/team/settings', requireAuth, injectTenant, requireRole('OWNER'), handler)
```

---

## 4. Security Decisions — Kyun Aisa Kiya

### 4.1 Refresh Token Rotation
**Old approach:** Refresh token permanent → steal once, use forever.  
**Rotation approach:** Har use mein naya token → stolen token ek use ke baad dead.  
**Bonus:** Reuse detect karo (same token dobara use) → possible theft signal → family revoke.

### 4.2 Forgot Password — Always 200
**Why:** "Email not found" → user enumeration → attacker jaanta hai kaunse emails registered hain.  
**Solution:** Chahe email registered ho ya nahi — same response. Email sirf tab bhejo jab user exist kare.

### 4.3 Password Reset Invalidates All Sessions
**Why:** Password reset = account was probably compromised. Attacker ke active sessions bhi honge.  
**Solution:** `deleteMany` on refresh tokens for that userId → sab sessions khatam → fresh start.

### 4.4 OAuth State Parameter (CSRF Protection)
**Attack:** Attacker apna OAuth flow start kare, callback URL victim ko bheje → victim ka account attacker ke Google se link ho jaaye.  
**Solution:** Random state generate karo, Redis mein store karo (10 min), callback mein verify karo. Match nahi → reject.

### 4.5 OAuth State in Redis (Not Cookie/DB)
**Kyun Redis:**  
- Cookie: State wahi browser mein store jahan OAuth start hua — mostly fine, lekin server-side validation better.  
- DB: Permanent table → OAuth state cleanup maintain karna padta.  
- Redis TTL: 10 min ke baad automatic expire — no cleanup needed.

### 4.6 Google id_token Verification
`id_token` sirf decode nahi karo — Google ke public key se verify karo.  
Unverified decode karna = attacker forged token bhi accept kar loge.

### 4.7 Email Verification — Transaction
User verified mark karo aur token delete karo — ek atomic operation.  
Agar user updated lekin token nahi mita → same token dobara kaam karega → duplicate verification possible.

### 4.8 Password Reset Token — `usedAt` Not Delete
Delete karo toh: audit trail khatam. Agar kal koi bole "mera account hack hua" — tum prove nahi kar sakte kab aur kaunsa token use hua.  
`usedAt` set karo: history preserved, lekin service logic check kare `usedAt is null` → used token reject.

### 4.9 Sessions — Authorization Check Before Revoke
`DELETE /auth/sessions/:id` mein sirf sessionId nahi, userId bhi verify karo.  
Bina check: User A session ID guess karke User B ki session revoke kar sakta hai.  
With check: `WHERE id = sessionId AND userId = req.user.id` → sirf apni sessions.

### 4.10 `access_type: offline` in Google OAuth
Google se `refresh_token` bhi milta hai.  
Abhi use nahi lekin: agar kabhi Google Calendar/Gmail integration chahiye → woh token stored hoga.

---

## 5. Scalability Decisions

### 5.1 Redis for OAuth State
Millions of users OAuth start karein — Redis handle kar sakta hai. DB rows create/delete karna unnecessary load.  
TTL automatic — koi cron job nahi chahiye stale state cleanup ke liye.

### 5.2 Role Middleware as Factory
Naya role add karna hai (`SUPER_ADMIN`)? Sirf `ROLE_LEVELS` object mein add karo — baaki sab work karta rahega.

### 5.3 Tenant Middleware Composable
Kuch routes tenant require karein, kuch nahi — middleware chain mein add/remove.  
`requireAuth + injectTenant` = authenticated + team member  
`requireAuth` only = authenticated but team not required (e.g., onboarding)

### 5.4 Sessions Track karna (IP + UserAgent)
Future: Anomaly detection.  
"User usually Lagos se login karta hai, aaj Moscow se login hua" → alert bhejo.  
Yeh data ab collect ho raha hai — logic baad mein add hoga.

### 5.5 Account Linking (OAuth + Password)
User ne email/password se account banaya, phir Google se login kiya → dono link ho jaate hain — ek account, do login methods.  
Future mein: GitHub, Microsoft, Apple bhi add karna ho → same pattern follow karo.

### 5.6 Auto-Login After Verify / Reset
Friction reduce karo — verify email karo, seedha dashboard. Reset password karo, seedha app mein.  
UX improvement jo bade scale par matters karta hai.

---

## 6. Build Order — Step-by-Step Plan

```
Step 1: auth.validator.ts update karo
  → forgotPasswordSchema: { email }
  → resetPasswordSchema: { token, newPassword }
  → updateMeSchema: { name?, timezone?, avatarUrl? }
  → Dependencies: None

Step 2: auth.repository.ts — nayi functions add karo
  → findEmailVerificationToken, deleteEmailVerificationToken
  → createPasswordResetToken, findPasswordResetToken, markPasswordResetTokenUsed
  → findUserByGoogleId, linkGoogleAccount
  → getSessionsByUserId
  → Dependencies: Prisma schema mein passwordResetTokens table hona chahiye

Step 3: email.service.ts — sendPasswordResetEmail add karo
  → Resend se reset email bhejo
  → Dependencies: Resend setup (Day 13 mein ho gaya)

Step 4: auth.service.ts — Token Refresh
  → Sabse simple service function, warm up ke liye pehle likhein
  → Test immediately after

Step 5: auth.service.ts — Email Verification
  → Transaction use karna seekho yahan
  → Dependencies: repository functions (Step 2)

Step 6: auth.service.ts — Forgot Password
  → Simple — mostly email bhejo
  → Dependencies: email service (Step 3)

Step 7: auth.service.ts — Reset Password
  → Transaction: update user + mark token + delete sessions
  → Dependencies: repository (Step 2)

Step 8: auth.service.ts — GET/PATCH me
  → Simple CRUD — easy

Step 9: auth.service.ts — Sessions
  → getSessionsByUserId + isCurrent logic
  → revokeSession + authorization check

Step 10: auth.service.ts — Google OAuth
  → Sabse complex — last mein karo
  → Dependencies: Redis client, Google OAuth env vars

Step 11: auth.controller.ts — nayi functions add karo
  → Mechanical — service ready hai toh 15 min ka kaam

Step 12: auth.routes.ts — sab routes register karo
  → Public + Protected routes clearly separate karo

Step 13: tenant.middleware.ts fill in karo
  → Simple — req.user.teamId check

Step 14: role.middleware.ts likhao
  → ROLE_LEVELS object + factory function

Step 15: Integration tests — Postman
  → Checklist ke saath sab endpoints
  → OAuth manually test karo (browser mein)
```

---

## 7. End-of-Day Checklist

### Token Refresh
- [ ] `POST /auth/refresh` (valid cookie) → 200 `{ accessToken }`
- [ ] Naya cookie set hua (rotated refresh token)
- [ ] Purana refresh token DB mein nahi (psql check)
- [ ] `POST /auth/refresh` (expired cookie) → 401
- [ ] `POST /auth/refresh` (no cookie) → 401
- [ ] Same refresh token dobara use → 401 INVALID_REFRESH_TOKEN

### Email Verification
- [ ] `GET /auth/verify-email?token=valid` → 200, auto-login, `emailVerified: true` in DB
- [ ] Token DB se delete hua (psql check)
- [ ] Same token dobara → 400 TOKEN_INVALID
- [ ] Expired token → 410 TOKEN_EXPIRED

### Password Reset
- [ ] `POST /auth/forgot-password` → hamesha 200 (unknown email bhi)
- [ ] Token `password_reset_tokens` table mein (psql)
- [ ] `POST /auth/reset-password` valid token → 200, auto-login
- [ ] Token ka `usedAt` set hua (deleted nahi)
- [ ] User ke sare refresh tokens deleted (psql)
- [ ] Used token dobara → 400 TOKEN_INVALID

### Google OAuth
- [ ] `GET /auth/google` → accounts.google.com par redirect
- [ ] Redis mein state stored (`redis-cli: KEYS oauth:state:*`)
- [ ] Valid callback → user create/find, cookie set, dashboard redirect
- [ ] `error=access_denied` → `/login?error=oauth_denied`
- [ ] Wrong state → `/login?error=oauth_failed`
- [ ] Existing email + Google login → account linked (same user)

### Profile
- [ ] `GET /auth/me` → user object (no passwordHash in response)
- [ ] `PATCH /auth/me { name: "New Name" }` → 200 updated user
- [ ] Email field update attempt → ignored ya 422

### Sessions
- [ ] `GET /auth/sessions` → active sessions list
- [ ] `isCurrent: true` current device pe
- [ ] `DELETE /auth/sessions/:id` → session deleted from DB
- [ ] Dusre user ki session delete attempt → 404 ya 403

### Middleware
- [ ] `injectTenant`: user without teamId → 403
- [ ] `requireRole('ADMIN')`: MEMBER → 403, ADMIN → 200, OWNER → 200
- [ ] `requireRole('MANAGER')`: MEMBER → 403, MANAGER → 200

---

## 8. Complete Auth API Reference

### Public Endpoints (No Auth)

| Method | Path | Body/Query | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | 201 `{ message, email }` |
| POST | `/auth/login` | `{ email, password }` | 200 `{ accessToken, user }` + cookie |
| POST | `/auth/logout` | — | 200 `{ message }` |
| POST | `/auth/refresh` | — (cookie) | 200 `{ accessToken }` |
| GET | `/auth/verify-email` | `?token=xxx` | 200 `{ accessToken, user }` |
| POST | `/auth/forgot-password` | `{ email }` | 200 `{ message }` |
| POST | `/auth/reset-password` | `{ token, newPassword }` | 200 `{ accessToken, user }` |
| GET | `/auth/google` | — | 302 redirect to Google |
| GET | `/auth/google/callback` | `?code&state` | 302 redirect to app |

### Protected Endpoints (requireAuth)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/auth/me` | — | 200 `{ user }` |
| PATCH | `/auth/me` | `{ name?, timezone?, avatarUrl? }` | 200 `{ user }` |
| GET | `/auth/sessions` | — | 200 `{ sessions[] }` |
| DELETE | `/auth/sessions/:id` | — | 200 `{ message }` |

### Error Codes Quick Reference

| Situation | HTTP | Code |
|---|---|---|
| No refresh token cookie | 401 | `NO_REFRESH_TOKEN` |
| Refresh token not in DB | 401 | `INVALID_REFRESH_TOKEN` |
| Refresh token expired | 401 | `REFRESH_TOKEN_EXPIRED` |
| Verification token invalid | 400 | `TOKEN_INVALID` |
| Verification token expired | 410 | `TOKEN_EXPIRED` |
| Reset token used/invalid | 400 | `TOKEN_INVALID` |
| Reset token expired | 410 | `TOKEN_EXPIRED` |
| OAuth CSRF mismatch | — | redirect `oauth_failed` |
| No teamId on user | 403 | `FORBIDDEN` |
| Insufficient role | 403 | `FORBIDDEN` |

---

*Day 14 complete hone ke baad: Auth system 100% production-ready. Day 15 se core product features shuru — Jobs, Pipeline, Candidates.*
