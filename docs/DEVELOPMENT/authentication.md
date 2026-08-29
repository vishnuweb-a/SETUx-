# SetuX — Authentication & RBAC (implementation notes)

How Phase 3 implements the contracts in `docs/API/auth-api.md`,
`docs/AUTH/authentication-and-rbac.md` and `docs/SECURITY/security-design.md`.
Those documents remain the specification; this one records what was built and
where it lives.

## The one rule

Supabase Auth answers **"who is this?"**. SetuX answers **"what may they do?"**.

A session alone never grants access. The role is read from `profiles.role` by
the backend, keyed by the user id in a verified token, and nothing a client
sends can influence it.

```
Credentials → Supabase Auth → Session/JWT → Backend verifies token
  → profiles lookup → role → RBAC decision
```

## Roles

`CITIZEN` and `GOVERNMENT_OFFICER`, defined by the `public.user_role` enum.

The database enum is the authority. `docs/AUTH/authentication-and-rbac.md` §5
also describes an `ADMIN` role; the Phase 2 schema and `docs/API/auth-api.md` §3
define exactly two for the MVP, and the schema wins.

## API

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/signup` | public, rate-limited | Register a **citizen** account |
| `POST /api/v1/auth/login` | public, rate-limited | Exchange credentials for a session |
| `GET /api/v1/auth/me` | bearer | Authenticated user + server-resolved role |
| `POST /api/v1/auth/logout` | bearer | Revoke the session server-side |
| `GET /api/v1/citizen/dashboard` | bearer + `CITIZEN` | Citizen destination |
| `GET /api/v1/government/dashboard` | bearer + `GOVERNMENT_OFFICER` | Officer destination |

Protected requests carry `Authorization: Bearer <access_token>`. The header is
the only credential carrier the backend reads — never a query parameter or a
body field.

### Registration

`POST /api/v1/auth/signup` creates **CITIZEN accounts only**. The role is
hardcoded in server code; the request schema has no `role` field, so a client
asking for `GOVERNMENT_OFFICER` gets a citizen account like everyone else.

Government officers are provisioned through `scripts/seed-auth-users.mjs`. A
role that grants government access must not be selectable by the person
requesting it (`auth-api.md` §11, `authentication-and-rbac.md` §16).

The identity and its profile are created in one operation. If the profile write
fails, the auth user is deleted again — an identity that can authenticate but
resolves to no role would fail every protected request (Phase 3 §43).

Registration succeeds and returns `201`; the user then signs in normally. They
are not signed in automatically, so the session always comes from the
credentials, through the same path every other user takes.

### Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `AUTH_TOKEN_MISSING` | 401 | No credential presented |
| `AUTH_INVALID_TOKEN` | 401 | Credential rejected by the Auth server |
| `AUTH_SESSION_EXPIRED` | 401 | Session past its lifetime |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sign-in failed |
| `PROFILE_NOT_FOUND` | 403 | Authenticated, but no SetuX profile |
| `CONFLICT` | 409 | An account already exists for this email |
| `FORBIDDEN` | 403 | Authenticated, wrong role |

Messages never say *why* authentication failed, and a wrong password is
indistinguishable from an unknown account — the login endpoint must not become
an account-enumeration oracle (`auth-api.md` §26).

## Backend

```
backend/src/
├── middleware/
│   ├── authenticate.ts        requireAuth — verify token, attach req.auth
│   ├── authorize.ts           requireRole — RBAC, no role hierarchy
│   └── rate-limit.ts          authRateLimiter — 10 failed / 15 min, keyed
│                               by account + IP so one attacked account
│                               cannot lock out others behind the same address
├── modules/auth/
│   ├── auth.routes.ts         login / me / logout
│   ├── auth.controller.ts     HTTP translation only
│   ├── auth.service.ts        verify, resolve role, sign in/out
│   ├── auth.repository.ts     profiles lookup
│   ├── auth.schema.ts         Zod — credentials only, no role field
│   └── auth.types.ts          UserRole, AuthContext
├── modules/citizen/           CITIZEN-only routes
└── modules/government/        GOVERNMENT_OFFICER-only routes
```

`req.auth` is written by `requireAuth` and by nothing else, so a controller can
trust it.

### Token verification

`auth.getUser(jwt)` is a network call to the Auth server, not a local decode. A
revoked session or deleted user is therefore rejected immediately rather than
staying valid until the token's own expiry.

### Client isolation (important)

`signInWithPassword`, `getUser` and `admin.signOut` **mutate the session of the
client they are called on**. Running them on the shared service-role client
would leave it authenticated as the last user who signed in, so every later
request — token checks and profile lookups included — would run with the wrong
identity.

Every auth operation therefore uses `createIsolatedAuthClient()`, a throwaway
client. This is covered by a regression test in
`backend/tests/unit/auth-service.test.ts`.

## Frontend

```
frontend/src/
├── lib/supabase.ts                     browser client + storage mode
├── services/api-client.ts              attaches the bearer token; reports 401s
└── features/auth/
    ├── auth-provider.tsx               the single auth state
    ├── auth-context.ts
    ├── hooks/use-auth.ts
    ├── components/protected-route.tsx  route guard (UX, not security)
    ├── components/password-input.tsx   masked field + visibility toggle
    ├── components/auth-screen-layout.tsx  shared split-panel shell
    ├── components/account-type-tabs.tsx   Citizen / Government selector (UI only)
    ├── pages/login-page.tsx               the approved auth screen
    ├── pages/register-page.tsx            citizen registration
    └── services/auth-service.ts
```

There is exactly one authentication state, in `AuthProvider`. It resolves to
`loading`, `authenticated` or `unauthenticated`; guards render nothing
protected while `loading`, so a signed-in user reloading a page is never flashed
the login screen.

The API client is given its token source and its 401 handler once, at start-up.
Components never assemble `Authorization` headers themselves.

### Session persistence

Handled by the Supabase SDK. "Remember me" selects *which* browser store the SDK
writes to — `localStorage` (survives a restart) or `sessionStorage` (ends with
the tab). SetuX stores no token itself and implements no custom refresh
(`auth-api.md` §25).

### Session expiry

A 401 carrying `AUTH_TOKEN_MISSING`, `AUTH_INVALID_TOKEN` or
`AUTH_SESSION_EXPIRED` tears the auth state down immediately, so protected data
cannot remain on screen after a session dies. The user is returned to the login
screen with "Your session has expired. Please sign in again."

A 401 from a failed sign-in is *not* treated this way — a mistyped password must
not destroy an unrelated session.

## Routes

| Path | Access |
| --- | --- |
| `/login` | Public |
| `/register` | Public — citizen accounts only |
| `/citizen` | `CITIZEN` |
| `/government` | `GOVERNMENT_OFFICER` |
| `/unauthorized` | Any authenticated user |

Frontend guards decide what renders. They are not the security boundary: every
protected endpoint is independently authorized by the backend, so bypassing a
guard in the browser yields an empty screen, not data.

## RLS

Phase 2's policies remain enabled and unchanged — Phase 3 added no policy,
relaxed none, and disabled RLS nowhere. All 17 public tables have RLS on.

Verified with real user sessions: anonymous callers read nothing; a citizen sees
only their own rows; a citizen cannot promote themselves (no `UPDATE` policy
exists on `profiles`); an officer cannot read an unrelated citizen's profile;
and the audit log is unreachable from the browser entirely.

The backend uses the service-role key and bypasses RLS by design — it is the
trusted tier and enforces RBAC itself. RLS is the second line of defence for any
path that reaches the database with a user's own JWT
(`security-design.md` §19).

## Local setup

```bash
# 1. Environment (never commit .env)
cp backend/.env.example backend/.env      # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
cp frontend/.env.example frontend/.env    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
node scripts/verify-env.mjs

# 2. Development accounts — choose your own passwords
SETUX_SEED_CITIZEN_PASSWORD='...' SETUX_SEED_OFFICER_PASSWORD='...' \
  node scripts/seed-auth-users.mjs

# 3. Run
npm run dev            # backend :3000, frontend :5173
```

Sign in at <http://localhost:5173/login> as `citizen@setux.test` or
`officer@setux.test`.

## Security checklist

- Supabase Auth owns credentials; SetuX stores no password or password hash.
- Passwords, access tokens and refresh tokens are never logged.
- The service-role key is backend-only and never carries a `VITE_` prefix.
- The role is resolved server-side from `profiles`; a client-supplied role in a
  body, query string or header is ignored everywhere.
- A missing profile is an error, never a defaulted role.
- Registration creates CITIZEN accounts only; the role is never read from the
  request, and a failed profile write rolls the identity back.
- Credential endpoints are rate-limited more tightly than the general API
  (10 failed attempts per 15 minutes), keyed by **account and client address**
  so that attacking one account cannot lock out other users sharing an address.
  Successful sign-ins do not consume the budget.
- Authorization failures disclose neither the required role nor the resource.
