# Day 13 — Auth API Full Plan
## Register · Login · Logout · JWT · Middleware

> **Theme:** Auth bugs = security incidents. Har line production-grade hogi. No shortcuts.

---

## Table of Contents

1. [Big Picture — Architecture](#1-big-picture--architecture)
2. [Data Flow — Har Request Kaise Travel Karti Hai](#2-data-flow)
3. [File Map — Konsi File Mein Kya Hoga](#3-file-map)
4. [File-by-File Deep Dive](#4-file-by-file-deep-dive)
   - [auth.types.ts](#41-authtypests)
   - [auth.repository.ts](#42-authrepositoryts)
   - [auth.helpers.ts](#43-authhelpersts)
   - [auth.validator.ts](#44-authvalidatorts)
   - [auth.service.ts — Register](#45-authservicets--register-flow)
   - [auth.service.ts — Login](#46-authservicets--login-flow)
   - [auth.service.ts — Logout](#47-authservicets--logout-flow)
   - [auth.controller.ts](#48-authcontrollerts)
   - [auth.routes.ts](#49-authroutests)
   - [auth.middleware.ts](#410-authmiddlewarets)
   - [email.service.ts](#411-emailservicets)
5. [Security Decisions — Kyun Aisa Kiya](#5-security-decisions--kyun-aisa-kiya)
6. [Scalability Decisions — Future-Proof Kaise Hai](#6-scalability-decisions)
7. [Build Order — Step-by-Step Plan](#7-build-order--step-by-step-plan)
8. [End-of-Day Checklist](#8-end-of-day-checklist)

---

## 1. Big Picture — Architecture

```
HTTP Request
    │
    ▼
[ Routes ] ──── validate(Zod) ──── rateLimiter
    │
    ▼
[ Controller ]   ← sirf req padhta hai, res likhta hai. Zero business logic.
    │
    ▼
[ Service ]      ← sari business logic yahan. AppError subclasses throw karta hai.
    │
    ▼
[ Repository ]   ← sirf Prisma queries. Koi logic nahi. Domain objects return karta hai.
    │
    ▼
[ Database ]     ← PostgreSQL via Prisma ORM
```

**Kyun yeh 3-layer pattern?**

| Layer | Responsibility | Kya nahi karta |
|---|---|---|
| Controller | HTTP layer — req/res | Business rules nahi jaanta |
| Service | Business rules, security checks | DB se seedha baat nahi karta |
| Repository | DB queries only | Logic nahi likhta |

Agar kal tum PostgreSQL se MongoDB switch karo — sirf Repository badlega, baaki sab same rahega.  
Agar kal REST se gRPC switch karo — sirf Controller layer badlegi.

---

## 2. Data Flow

### Register Flow
```
POST /auth/register
  → Zod validates { name, email, password }
  → Controller calls authService.register()
    → Service: email duplicate check (repo.findByEmail)
    → Service: bcrypt.hash(password, 12)
    → Service: repo.create(user)
    → Service: verification token generate karo (crypto.randomBytes)
    → Service: token ka SHA-256 hash DB mein store karo (NEVER plain token)
    → Service: emailService.sendVerificationEmail()
  → Controller: 201 { message, email }
  ← Response mein token ya user object NAHI (account abhi unverified hai)
```

### Login Flow
```
POST /auth/login
  → Zod validates { email, password }
  → loginRateLimiter (IP-based, Express rate limit)
  → Controller calls authService.login()
    → Service: user dhundho by email
    → Service: agar user nahi mila → fake bcrypt compare (timing attack prevent)
    → Service: account locked check (lockedUntil > now)
    → Service: email verified check
    → Service: OAuth account check (passwordHash null hai?)
    → Service: bcrypt.compare(password, hash)
    → Service: agar wrong → failedAttempts++ → 5 ho gaye? lockedUntil set karo
    → Service: agar sahi → failedAttempts reset, lastLogin update
    → Service: accessToken generate (JWT, 15 min)
    → Service: refreshToken generate (random hex, 30 days, HttpOnly cookie)
    → Service: refreshToken ka hash DB mein store karo
  → Controller: 200 { accessToken, user: { id, name, email, role, teamId } }
  ← Cookie: vocaply_refresh (HttpOnly, Secure, SameSite=Strict, path=/auth/refresh)
```

### Logout Flow
```
POST /auth/logout
  → Cookie se refreshToken lo
  → Token ka hash nikalo
  → DB mein dhundho aur delete karo
  → Cookie clear karo
  → 200 { message }
```

---

## 3. File Map — Konsi File Mein Kya Hoga

```
services/api/src/
│
├── modules/
│   ├── auth/
│   │   ├── auth.types.ts        ← TypeScript types/interfaces (CreateUserData, JwtPayload, etc.)
│   │   ├── auth.repository.ts   ← Sirf Prisma queries (DB se baat)
│   │   ├── auth.helpers.ts      ← JWT generate, refreshToken generate, hash util
│   │   ├── auth.validator.ts    ← Zod schemas (registerSchema, loginSchema)
│   │   ├── auth.service.ts      ← Business logic: register, login, logout
│   │   ├── auth.controller.ts   ← req → service → res
│   │   └── auth.routes.ts       ← Route definitions + middleware chain
│   │
│   └── notifications/
│       └── email.service.ts     ← Resend SDK wrapper (verification email)
│
├── middleware/
│   └── auth.middleware.ts       ← requireAuth — JWT verify karta hai protected routes ke liye
│
└── app.ts                       ← app.use('/auth', authRouter) yahan add hoga
```

---

## 4. File-by-File Deep Dive

---

### 4.1 `auth.types.ts`

**Kya hai:** Pure TypeScript type definitions. Koi logic nahi, sirf shapes.

**Kyun zaroori hai:** Agar types yahan central na hon, toh har file mein alag-alag types likhni padein — inconsistency aur bugs ka seedha rasta.

**Andar kya hoga:**

```
CreateUserData
  → id (cuid), email, name, passwordHash

CreateRefreshTokenData
  → userId, tokenHash, expiresAt, ipAddress, userAgent

JwtPayload (extends jwt.JwtPayload)
  → sub (userId), teamId, role, email

AuthUser (req.user par jo object hoga)
  → id, teamId, role, email

RegisterInput / LoginInput
  → Zod schema se infer karo (z.infer<typeof registerSchema>)
```

---

### 4.2 `auth.repository.ts`

**Kya hai:** Database ka sirf ek hi darwaza. Sari Prisma queries yahan. Baki koi file seedha DB nahi chhuegi.

**Functions aur unka kaam:**

| Function | Kya karta hai | Kyun zaroori |
|---|---|---|
| `findByEmail(email)` | Email se user dhundho | Register aur login dono mein use hota hai |
| `findById(id)` | ID se user dhundho | Token refresh, profile fetch |
| `create(data)` | Naya user banao | Register flow |
| `updateFailedAttempts(id, attempts, lockedUntil)` | Wrong password ke baad update | Brute force protection |
| `resetFailedAttempts(id)` | Successful login ke baad reset | Clean slate after correct login |
| `updateLastLogin(id)` | lastLogin timestamp update | Analytics, security audit |
| `createRefreshToken(data)` | Hashed refresh token store karo | Login ke baad session banane ke liye |
| `findRefreshToken(tokenHash)` | Hash se token dhundho | Logout, token rotation |
| `deleteRefreshToken(id)` | Single token delete | Logout |
| `deleteAllRefreshTokens(userId)` | User ke sare tokens delete | "Logout from all devices" |
| `createEmailVerificationToken(data)` | Verification token store | Register ke baad email verify |

**Scalability note:** Yahan sirf `prisma.user.findUnique`, `prisma.refreshToken.create` jaise calls hongi. Koi `if`, koi `throw`, koi bcrypt — kuch nahi.

---

### 4.3 `auth.helpers.ts`

**Kya hai:** Crypto aur JWT utilities. Pure functions — koi side effects nahi.

**Functions:**

**`generateAccessToken(user)`**
- JWT sign karta hai
- Payload: `{ sub: userId, teamId, role, email }`
- Expiry: **15 minutes** (kyu short? — agar leak ho toh damage minimize)
- Algorithm: HS256
- Issuer: `vocaply.com`, Audience: `vocaply-api` (yeh validation mein use hoga)

**`generateRefreshToken()`**
- `crypto.randomBytes(32).toString('hex')` → 64-char hex string
- **NEVER** JWT nahi — simple random string hai
- Yeh sirf cookie mein jaata hai, DB mein kabhi plain nahi

**`hashToken(token)`**
- SHA-256 hash nikalta hai
- DB mein hamesha yeh hash store hota hai, plain token NEVER
- Kyun? Agar DB leak ho, refresh tokens useless ho jaayein

**`COOKIE_OPTIONS`**
- `httpOnly: true` — JavaScript se access nahi (XSS protection)
- `secure: true in production` — HTTPS only
- `sameSite: 'strict'` — CSRF protection
- `path: '/auth/refresh'` — Sirf refresh endpoint par jaata hai, har request par nahi
- `maxAge: 30 days`

---

### 4.4 `auth.validator.ts`

**Kya hai:** Zod schemas. Controller se pehle validate hota hai. Agar validation fail → 422 response, service tak request jaati hi nahi.

**`registerSchema`:**
```
name     → min 2, max 100 chars
email    → valid email format, .toLowerCase() transform
password → min 8, max 128
           uppercase letter zaroori
           number zaroori
           special character zaroori
```

**`loginSchema`:**
```
email    → valid email format
password → min 1 (sirf "exists" check, strength login mein nahi)
```

**Kyun Zod?**
- Runtime validation + TypeScript types ek saath
- `.toLowerCase()` transform email par → case-sensitivity bugs khatam
- Error messages field-by-field milte hain frontend ko

---

### 4.5 `auth.service.ts` — Register Flow

**Kya hai:** Registration ki poori business logic.

**Step-by-step:**

```
Step 1: Duplicate email check
  → repo.findByEmail(email.toLowerCase())
  → Mila? → throw DuplicateError('Email already registered') → 409

Step 2: Password hash
  → bcrypt.hash(password, 12)
  → Cost factor 12: ~300ms per hash — attacker ke liye 300ms per guess (acceptable)
  → Cost 10 = too fast, 14 = too slow for users

Step 3: User create
  → repo.create({ id: cuid(), email, name, passwordHash })
  → cuid() → collision-resistant unique IDs (UUID alternative)

Step 4: Email verification token
  → crypto.randomBytes(32).toString('hex') → plain token
  → SHA-256 hash nikalo
  → repo.createEmailVerificationToken({ userId, tokenHash, expiresAt: +24h })
  → DB mein hash store, plain token email mein jaata hai

Step 5: Email bhejo
  → emailService.sendVerificationEmail({ to, name, verificationToken: PLAIN_TOKEN })

Step 6: Response
  → { message: "Check your email", email }
  → NO accessToken, NO refreshToken, NO user details
  → Kyun? Account abhi verified nahi — koi session nahi dena
```

---

### 4.6 `auth.service.ts` — Login Flow

**Kya hai:** Login flow — security ki sabse zyada zaroorat yahan.

**Step-by-step:**

```
Step 1: User dhundho
  → repo.findByEmail(email.toLowerCase())

Step 2: User nahi mila
  → await bcrypt.compare(password, FAKE_HASH) ← IMPORTANT
  → Kyun fake compare? Timing attack! Bina iske:
    - Valid email: 300ms (bcrypt runs)
    - Invalid email: 1ms (seedha return)
    - Attacker measure kar ke valid emails enumerate kar sakta hai
  → throw UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
  ← SAME message valid/invalid email pe → no user enumeration

Step 3: Account locked check
  → user.lockedUntil && user.lockedUntil > new Date()
  → throw RateLimitError('Account locked. Try again in X minutes.')
  → X = Math.ceil((lockedUntil - now) / 60000) — exact minutes bata do

Step 4: Email verified check
  → !user.emailVerified
  → throw ForbiddenError('EMAIL_NOT_VERIFIED', 'Please verify your email')
  → Kyun? Unverified accounts login karne nahi dete — email ownership confirm nahi

Step 5: OAuth account check
  → !user.passwordHash
  → throw UnauthorizedError('USE_OAUTH', 'This account uses Google/GitHub login')
  → Kyun? Kuch users sirf OAuth se bane — unke paas password hai hi nahi

Step 6: Password verify
  → bcrypt.compare(req.password, user.passwordHash)

Step 7: Wrong password handling
  → newAttempts = user.failedAttempts + 1
  → newAttempts >= 5? lockedUntil = now + 15 minutes
  → repo.updateFailedAttempts(userId, newAttempts, lockedUntil)
  → throw UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
  ← SAME error message — attacker ko pata nahi chalega kitne attempts bache

Step 8: Successful login cleanup
  → repo.resetFailedAttempts(userId)
  → repo.updateLastLogin(userId)

Step 9: Tokens generate karo
  → accessToken = generateAccessToken(user)  ← JWT, 15min
  → refreshToken = generateRefreshToken()    ← random hex, 30 days

Step 10: Refresh token store karo
  → repo.createRefreshToken({
      userId,
      tokenHash: hashToken(refreshToken),  ← HASH store, never plain
      expiresAt: +30 days,
      ipAddress: req.ip,       ← audit trail
      userAgent: req.headers['user-agent']  ← audit trail
    })

Step 11: Cookie set karo
  → res.cookie('vocaply_refresh', refreshToken, COOKIE_OPTIONS)
  ← HttpOnly: JS se access nahi (XSS safe)

Step 12: Response
  → { accessToken, user: { id, name, email, role, teamId, team } }
  ← accessToken response mein (client memory mein store karega)
  ← refreshToken KABHI response body mein nahi (cookie only)
```

---

### 4.7 `auth.service.ts` — Logout Flow

**Kya hai:** Session cleanup.

```
Step 1: Cookie se refreshToken lo
  → req.cookies.vocaply_refresh

Step 2: DB se delete karo
  → tokenHash = hashToken(refreshToken)
  → token = repo.findRefreshToken(tokenHash)
  → mila? → repo.deleteRefreshToken(token.id)
  → Kyun DB se delete? Cookie clear karna enough nahi —
    agar kisi ne token intercept kiya tha, woh abhi bhi use kar sakta tha

Step 3: Cookie clear karo
  → res.clearCookie('vocaply_refresh', { path: '/auth/refresh' })
  → path same honi chahiye jo set karte waqt thi

Step 4: Response
  → 200 { message: 'Logged out successfully' }
```

---

### 4.8 `auth.controller.ts`

**Kya hai:** Sirf HTTP layer. Business logic ka ek line bhi yahan nahi.

**Teen functions:**

```
register:
  → req.body read karo (Zod already validated)
  → authService.register(req.body) call karo
  → 201 + success(result)

login:
  → authService.login(req.body, req, res) call karo
  → req aur res pass karo kyunki service cookie set karti hai
  → 200 + success(result)

logout:
  → authService.logout(req, res) call karo
  → 200 + success({ message })
```

**`asyncHandler` kyun?**  
Express mein async errors automatically next(err) nahi jaatein — asyncHandler wrap karta hai taaki unhandled rejection error middleware tak pahunche.

---

### 4.9 `auth.routes.ts`

**Kya hai:** Route definitions — middleware chain define karta hai har endpoint ke liye.

```
POST /auth/register
  Chain: validate(registerSchema) → loginRateLimiter → authController.register

POST /auth/login
  Chain: validate(loginSchema) → loginRateLimiter → authController.login

POST /auth/logout
  Chain: authController.logout (koi auth required nahi — cookie handle karti hai)
```

**`validate` middleware kya karta hai:**
- Zod schema se req.body validate karo
- Fail → 422 VALIDATION_ERROR with field-level errors
- Pass → next()

**`loginRateLimiter` kya karta hai:**
- IP address se rate limit (e.g., 10 requests per 15 min per IP)
- Brute force against the API endpoint itself rokta hai
- Yeh service-level brute force (per-account lockout) se alag hai — dono zaroori

---

### 4.10 `auth.middleware.ts`

**Kya hai:** `requireAuth` — har protected route par lagega. JWT verify karta hai.

**Flow:**

```
Step 1: Authorization header check
  → req.headers.authorization
  → nahi mila ya 'Bearer ' se start nahi? → 401 AUTH_REQUIRED

Step 2: Token extract karo
  → header.split(' ')[1]

Step 3: JWT verify karo
  → jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer, audience })
  → algorithms array kyun? — 'none' algorithm attack rokta hai (classic JWT vulnerability)
  → issuer + audience verify → token kisi aur service ka nahi use ho sakta

Step 4: req.user set karo
  → { id: payload.sub, teamId, role, email }
  → Ab controller aur service req.user se user info le saktein hain

Step 5: Errors handle karo
  → TokenExpiredError → 401 TOKEN_EXPIRED (client ko pata chale refresh karna hai)
  → Baaki errors → 401 TOKEN_INVALID
```

**Kyun alag error codes?**  
Frontend ko `TOKEN_EXPIRED` mila → silently `/auth/refresh` call karo → naya token lo → original request retry karo. `TOKEN_INVALID` mila → logout karo.

---

### 4.11 `email.service.ts`

**Kya hai:** Resend SDK wrapper. Notification module mein hai kyunki emails sirf auth ke liye nahi honge — baad mein aur types bhi aayenge.

**`sendVerificationEmail` kya karta hai:**
```
URL banao: FRONTEND_URL/verify-email?token=PLAIN_TOKEN
resend.emails.send() call karo:
  from: noreply@vocaply.com
  to: user email
  subject: 'Verify your Vocaply account'
  html: simple template with link
```

**Important:** Yahan `verificationToken` URL mein jaata hai — yeh wahi plain token hai jo service ne generate kiya tha. DB mein sirf uska hash hai.

---

## 5. Security Decisions — Kyun Aisa Kiya

### 5.1 Timing Attack Prevention
**Problem:** Agar user nahi mila to 1ms mein return, mila to 300ms (bcrypt runs) — attacker measure karke valid emails pata kar sakta hai.  
**Solution:** User na mile tab bhi fake bcrypt.compare run karo — hamesha ~300ms lagein.

### 5.2 No User Enumeration
**Problem:** "Email not found" vs "Wrong password" → attacker ko pata chal jaata hai kaunsa email registered hai.  
**Solution:** Dono cases mein same message: `"Invalid email or password"`

### 5.3 Refresh Token Hashing
**Problem:** DB hack ho → attacker ke paas sare refresh tokens → sab sessions hijack.  
**Solution:** Plain token kabhi DB mein nahi, sirf SHA-256 hash. Cookie mein plain token, DB mein hash — dono milne chahiyein tab hi valid.

### 5.4 HttpOnly Cookie for Refresh Token
**Problem:** Access token JS mein store karo (memory) → XSS attack se steal.  
**Solution:** Refresh token HttpOnly cookie mein — JS access hi nahi kar sakta.

### 5.5 Cookie path: `/auth/refresh`
**Problem:** Cookie every request ke saath jaati — bandwidth waste, har request mein refresh token expose.  
**Solution:** Path restrict karo `/auth/refresh` — sirf us endpoint par cookie jaati hai.

### 5.6 Brute Force Protection (2 layers)
**Layer 1 — Per account:** 5 wrong passwords → 15 min lockout (DB mein track)  
**Layer 2 — Per IP:** loginRateLimiter middleware (10 req/15min per IP)  
Kyun dono? Attacker different accounts try kare ya ek hi — dono covered.

### 5.7 bcrypt cost factor 12
- Cost 10: ~100ms → too fast for modern GPUs
- Cost 12: ~300ms → acceptable for users, brutal for attackers
- Cost 14: ~1000ms → users complain

### 5.8 Access Token 15min Expiry
- Short expiry = leaked token ki shelf life kam
- Refresh token (30 days, HttpOnly cookie) silently renew karta hai
- User ko logout nahi dikhta

### 5.9 JWT Algorithm Explicit
```
algorithms: ['HS256']  ← array mein explicitly specify
```
Classic vulnerability: `alg: none` attack. Agar algorithm whitelist na ho, attacker unsigned token bhej sakta hai.

### 5.10 Email Verification Before Login
Unverified accounts login nahi kar saktein — ensures email ownership, spam accounts reduce.

---

## 6. Scalability Decisions

### 6.1 Stateless Access Tokens
JWT stateless hai — koi DB call nahi har request par. 1 server ho ya 100 — sab same token verify kar saktein hain. Horizontal scaling free mein.

### 6.2 Refresh Token in DB (Stateful)
Purposely stateful — kyunki:
- Logout actually work kare (token DB se delete)
- "Logout from all devices" possible ho (deleteAllRefreshTokens)
- Stolen token revoke karna possible ho

### 6.3 Repository Pattern
DB change karna hai (Postgres → PlanetScale)? Sirf repository badlo. Service layer touch nahi hoti.

### 6.4 ipAddress + userAgent on Refresh Token
Future feature: "Active sessions" page — user dekh sake kahan se login hai.

### 6.5 Error Subclasses (AppError hierarchy)
`DuplicateError`, `UnauthorizedError`, `ForbiddenError`, `RateLimitError` — error middleware automatically HTTP status code map karta hai. Service sirf throw karo, controller/middleware handle kar lega.

### 6.6 Separate `loginRateLimiter`
Register endpoint par same rate limiter — future mein alag rate limits per endpoint possible (register strict, login lenient, etc.)

---

## 7. Build Order — Step-by-Step Plan

Yeh order follow karo — dependency ke hisaab se:

```
Step 1: auth.types.ts
  → Pehle types define karo — baaki sab files import karein gi
  → No dependencies

Step 2: auth.repository.ts
  → Prisma queries likhna aasan hai jab types ready hon
  → Depends on: Prisma schema (already done Day 11-12), auth.types.ts

Step 3: auth.helpers.ts
  → JWT aur crypto utils — pure functions, koi dependency
  → Depends on: auth.types.ts (User type ke liye)

Step 4: auth.validator.ts
  → Zod schemas — independent
  → Depends on: zod package only

Step 5: email.service.ts
  → Resend SDK setup — service likhne se pehle email ready chahiye
  → Depends on: RESEND_API_KEY env var, resend package

Step 6: auth.service.ts
  → Sab kuch use karta hai — last mein likho
  → Depends on: repository, helpers, email service, types

Step 7: auth.controller.ts
  → Service ready? Controller likhna 5 minute ka kaam
  → Depends on: auth.service.ts

Step 8: auth.routes.ts
  → Controller ready? Routes define karo
  → Depends on: controller, validator

Step 9: auth.middleware.ts
  → requireAuth — independently test ho sakta hai
  → Depends on: helpers (JWT verify ke liye)

Step 10: app.ts update
  → authRouter register karo
  → Depends on: routes file

Step 11: Postman tests
  → Checklist ke saath sab endpoints test karo
```

---

## 8. End-of-Day Checklist

### Register

- [ ] `POST /auth/register { name, email, password }` → 201
- [ ] Duplicate email → 409 DUPLICATE
- [ ] Weak password (no uppercase) → 422 VALIDATION_ERROR with field name
- [ ] User DB mein create hua (psql check)
- [ ] `email_verification_tokens` table mein token hai
- [ ] Email gaya (Resend dashboard check)
- [ ] Response mein token ya passwordHash nahi

### Login

- [ ] `POST /auth/login { email, password }` → 200 with `accessToken` + `user`
- [ ] Wrong password → 401 `INVALID_CREDENTIALS` ("Invalid email or password")
- [ ] Wrong email → 401 `INVALID_CREDENTIALS` (same message — no enumeration)
- [ ] Unverified email → 403 `EMAIL_NOT_VERIFIED`
- [ ] 5 wrong passwords → account lock (DB mein `lockedUntil` check)
- [ ] 6th attempt on locked account → 429 with minutes remaining
- [ ] HttpOnly cookie `vocaply_refresh` set hai (DevTools → Application → Cookies)
- [ ] Cookie path `/auth/refresh` hai (NOT `/` ya `/api`)
- [ ] AccessToken decode karo (jwt.io) → `sub, teamId, role, email, iat, exp` sab hain
- [ ] AccessToken 15 min mein expire hota hai (exp - iat = 900)
- [ ] Algorithm HS256 hai (jwt.io header check)

### Logout

- [ ] `POST /auth/logout` → 200 `{ message: "Logged out successfully" }`
- [ ] Response mein `Set-Cookie` with empty value (cookie cleared)
- [ ] DB mein refresh token delete hua

### requireAuth Middleware

- [ ] Valid token → protected route access milta hai
- [ ] Expired token → 401 `TOKEN_EXPIRED`
- [ ] Tampered token → 401 `TOKEN_INVALID`
- [ ] No Bearer header → 401 `AUTH_REQUIRED`

---

## Quick Reference — Error Codes

| Situation | HTTP | Code |
|---|---|---|
| Email duplicate | 409 | `DUPLICATE` |
| Validation fail | 422 | `VALIDATION_ERROR` |
| Wrong credentials | 401 | `INVALID_CREDENTIALS` |
| Account locked | 429 | `RATE_LIMITED` |
| Email unverified | 403 | `EMAIL_NOT_VERIFIED` |
| OAuth account | 401 | `USE_OAUTH` |
| No auth header | 401 | `AUTH_REQUIRED` |
| Token expired | 401 | `TOKEN_EXPIRED` |
| Token invalid | 401 | `TOKEN_INVALID` |

---

*Day 13 complete hone ke baad: Register, Login, Logout fully working. Day 14 mein Token Refresh + Email Verification endpoints aayenge.*
