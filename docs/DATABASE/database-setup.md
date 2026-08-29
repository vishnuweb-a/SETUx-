# SetuX — Database Setup & Operations

Phase 2 implementation guide. This document describes the database **as built**.

The approved design remains [`database-schema.md`](./database-schema.md); where
the implementation had to make a call the specification left open, the decision
is recorded in [§9 Design decisions](#9-design-decisions).

---

## 1. Architecture

```text
React frontend
      │  HTTPS, no database credentials
      ▼
Express backend  ── service-role key ──►  Supabase  ──►  PostgreSQL
      │                                                      ▲
      │                                                      │
      └── RBAC + ownership checks                    RLS (defence in depth)
```

The backend is the trusted tier. It holds the **service-role key**, which
bypasses Row Level Security, and is therefore responsible for its own
authorization on every query. RLS is the second line of defence for any path
that reaches PostgreSQL carrying a user's own JWT.

The browser never receives a service-role credential and never talks to
PostgreSQL directly in the current architecture.

---

## 2. Environment variables

| Variable | Where | Sensitivity |
| --- | --- | --- |
| `SUPABASE_URL` | `backend/.env` | Public, but server-configured |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | **Secret — bypasses RLS** |
| `VITE_SUPABASE_URL` | `frontend/.env` | Public (shipped to the browser) |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env` | Public (protected by RLS) |

Rules:

- `.env` is git-ignored; only `.env.example` (empty placeholders) is committed.
- `SUPABASE_SERVICE_ROLE_KEY` must never carry a `VITE_` prefix, appear in
  `frontend/`, be logged, or be returned from an API.
- The backend validates both variables at startup (`src/config/env.ts`) and
  exits rather than running half-configured.

`npm start` loads `backend/.env` via `--env-file-if-exists`, so a deployment
that injects real environment variables instead works unchanged.

---

## 3. Migrations

Migration files live in `supabase/migrations/` and are the authoritative
history. Never change schema through the dashboard alone.

| Order | File | Contents |
| --- | --- | --- |
| 1 | `20260829090000_setux_enums.sql` | 9 controlled value domains |
| 2 | `20260829090100_setux_identity.sql` | `profiles`, `organizations`, `departments`, `citizen_profiles`, `government_profiles`, `set_updated_at()` |
| 3 | `20260829090200_setux_catalogue.sql` | `services`, `data_sources`, `service_requirements` |
| 4 | `20260829090300_setux_applications.sql` | `applications` + the 8 application-scoped tables, application-number generator |
| 5 | `20260829090400_setux_rls.sql` | `private` helper schema, RLS enablement, 35 policies |

They are ordered by foreign-key dependency and apply cleanly to an empty
database in filename order.

To add a change: create a **new** migration. Never edit one that has already
been applied.

### Verifying a clean rebuild

`supabase/config.toml` is configured for this (`major_version = 17`, matching
the remote; `db.seed.sql_paths` points at `seed/seed.sql`), so a full
from-scratch replay of every migration plus the seed is:

```bash
npx supabase start       # first run pulls the local stack images
npx supabase db reset    # drops, replays all migrations in order, then seeds
npx supabase migration list --local
```

> **Not yet executed.** Docker Desktop on this machine currently returns HTTP
> 500 for every Engine API call (`/version`, `/images/json`, `/images/create`),
> so no image can be pulled and the local stack cannot start. The failure is in
> the Docker installation, not in these migrations — a plain
> `docker pull hello-world` fails identically. Run the commands above once the
> Docker daemon is healthy to close this gap.

---

## 4. Schema

17 tables, all with UUID primary keys and `TIMESTAMPTZ` timestamps.

### Identity

| Table | Key relationships |
| --- | --- |
| `profiles` | PK = `auth.users.id` (1:1). Holds `role`, `onboarding_status` — both server-controlled |
| `citizen_profiles` | `user_id` → `profiles.id` (UNIQUE), `government_id` UNIQUE |
| `government_profiles` | `user_id` → `profiles.id` (UNIQUE); `organization_id`, `department_id`; UNIQUE `(organization_id, employee_id)` |
| `organizations` | `code` UNIQUE |
| `departments` | `organization_id` → `organizations.id`; UNIQUE `(organization_id, code)` |

### Catalogue

| Table | Key relationships |
| --- | --- |
| `services` | `code` UNIQUE |
| `data_sources` | `code` UNIQUE, typed by `data_source_type` |
| `service_requirements` | → `services`, → `data_sources`; UNIQUE `(service_id, requirement_code)` |

### Application core

| Table | Key relationships |
| --- | --- |
| `applications` | `application_number` UNIQUE; → `profiles` (citizen), → `services` |
| `consents` | → `applications`, `profiles`, `data_sources`; UNIQUE `(application_id, data_source_id)` |
| `data_retrievals` | → `applications`, `data_sources`, `consents`; one row per attempt |
| `application_data` | → `applications`, `data_sources`; UNIQUE `(application_id, field_code)` |
| `verifications` | → `applications`; UNIQUE `(application_id, verification_type)` |
| `application_reviews` | → `applications`, `profiles` (reviewer), `departments` |
| `application_events` | → `applications`; append-only timeline |
| `notifications` | → `profiles`, `applications` |
| `audit_logs` | → `profiles` (nullable); append-only |

### Delete behaviour

Per `database-schema.md` §43, history must survive:

- `RESTRICT` on `applications.citizen_id`, `applications.service_id`,
  `application_reviews.reviewer_id` — records stay attributable.
- `SET NULL` on `application_events.actor_user_id`, `audit_logs.actor_user_id` —
  history outlives the actor.
- `CASCADE` only from an application down to its own child rows, and from a
  profile to its own onboarding record.
- **No `DELETE` policy exists on any table**, so nothing is deletable from a
  browser session at all.

### Controlled values

`user_role`, `onboarding_status`, `application_status` (14 values),
`consent_status`, `verification_status`, `data_verification_status`,
`retrieval_status`, `data_source_type`, `review_decision`.

Invalid values are rejected by PostgreSQL, not merely by the application.

### Application numbers

`public.next_application_number()` returns `STX-{YEAR}-{SEQUENCE}`
(e.g. `STX-2026-000001`) from a database sequence, and is the column default on
`applications.application_number`. Never generate one client-side.

---

## 5. Row Level Security

RLS is enabled on **all 17 tables**. 35 policies, every one scoped
`TO authenticated`. No policy targets `anon` or `public`, so an unauthenticated
caller reads nothing anywhere.

| Actor | Can read | Can write |
| --- | --- | --- |
| `anon` | nothing | nothing |
| Citizen | own profile, own citizen profile, own applications and all records under them, own notifications, the catalogue | create own citizen profile; create own **DRAFT** application; edit own draft; create/update own consent; mark own notification read |
| Officer | the catalogue, plus non-draft applications whose service belongs to their department — and the applicant profiles, consents, data, verifications, reviews and events under those | nothing directly |
| Service role | everything (bypasses RLS) | everything — this is the backend |

Deliberate absences:

- **No UPDATE policy on `profiles`** — `role` and `onboarding_status` are
  server-controlled, so nothing on that table is safely client-writable.
- **No INSERT/UPDATE policy on `application_reviews`** — a decision must carry
  the reviewer identity from the authenticated session, not the payload.
- **No policies at all on `audit_logs`** — RLS is on and nothing is granted, so
  the audit trail is unreachable except through the backend.
- **No DELETE policy anywhere** — retention.

### Officer scoping

An officer sees an application only when their department handles that
application's service, and only once it has left `DRAFT`. Resolved by
`private.officer_can_read_application()`, which joins
`applications → services → departments → government_profiles` on the caller's
own `auth.uid()`.

### The `private` helper schema

Four `SECURITY DEFINER` functions break RLS recursion (a policy on `profiles`
cannot itself query `profiles` under RLS). They are safe because:

- they live in an unexposed schema with `search_path = ''`;
- none takes a caller-supplied identity — each resolves `auth.uid()` itself, so
  a caller can only ask about themselves;
- `EXECUTE` is revoked from `PUBLIC` and `anon`, granted only to
  `authenticated`, which must be able to run them because **policy expressions
  are evaluated with the caller's privileges**.

---

## 6. Seed data

`supabase/seed/seed.sql` — entirely synthetic, idempotent, safe to re-run.

Seeds 1 organization (`EDU`), 1 department (`HIGHER_ED`), 1 service
(`SCHOLARSHIP`), 4 data sources (`DIGILOCKER_MOCK`, `MOCK_IDENTITY_API`,
`MOCK_EDUCATION_API`, `MOCK_INCOME_API`) and 4 service requirements.

It seeds **no** citizen, officer or application rows: those require
`auth.users` entries, which Phase 3 introduces. Inserting a profile without a
matching auth user would violate the `profiles → auth.users` foreign key.

> `services.department` is matched against `departments.name` for officer
> scoping, so those two values must stay in step.

---

## 7. Backend integration

```text
Route → Controller → Service → Repository → Supabase
```

| Module | Responsibility |
| --- | --- |
| `src/database/supabase-client.ts` | The single service-role client. Lazily created, session persistence disabled |
| `src/database/database.types.ts` | Generated `public` schema types. Regenerate after every schema change |
| `src/database/database-error.ts` | Maps SQLSTATE codes onto SetuX `AppError`s |
| `src/modules/health/health.repository.ts` | The connectivity probe |

Because the service-role client bypasses RLS, **every repository must scope its
own access explicitly**. Do not rely on the database to filter rows.

### Error mapping

| SQLSTATE | Becomes | HTTP |
| --- | --- | --- |
| `PGRST116` no rows | `NotFoundError` | 404 |
| `23505` unique | `ConflictError` | 409 |
| `23503` foreign key | `ConflictError` | 409 |
| `23502` / `23514` / `22P02` | `VALIDATION_ERROR` | 400 |
| `42501` privilege | `FORBIDDEN` | 403 |
| anything else | `DatabaseError` (retryable) | 500 |

Raw PostgreSQL messages carry table, column and constraint names, so they are
logged server-side and never returned to a client.

### Health endpoint

`GET /api/v1/health` probes the database and reports:

```json
{
  "success": true,
  "data": {
    "service": "setux-backend",
    "status": "healthy",
    "dependencies": { "database": { "status": "up", "latencyMs": 338 } }
  }
}
```

`200` when healthy, `503` with `"status": "degraded"` when the database is
unreachable — the API still answers, so a monitor can distinguish the two.

---

## 8. Running and validating

```bash
npm run dev -w backend        # tsx loads backend/.env automatically
npm start   -w backend        # compiled; loads .env via --env-file-if-exists

npm run lint && npm run typecheck && npm run test && npm run build
```

Live-database integration tests are excluded from the default run because they
need real credentials and network access:

```bash
SETUX_DB_TESTS=1 \
SETUX_TEST_SUPABASE_URL=... \
SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY=... \
npm run test:db -w backend
```

Regenerate types after any schema change:

```bash
npx supabase gen types typescript --project-id <ref> \
  > backend/src/database/database.types.ts
```

---

## 9. Design decisions

Decisions made where the specification left an implementation detail open, or
where two approved documents disagreed.

1. **`government_profiles` over `officer_profiles`.**
   `database-design.md` §5.3 uses a flattened `officer_profiles` with
   `department` as free text. `database-schema.md` §13 (the document
   `docs/PHASES/phase.md` names as the Phase 2 source),
   `authentication-and-rbac.md` §41 and `docs/API/onboarding.md` §16 all use
   `government_profiles` with relational `organizations` and `departments`.
   The three-document majority was implemented, because department-scoped
   officer authorization needs a real foreign key, not a string.

2. **Union of enum values where the two documents differ.**
   `application_status` takes the 14 values of `database-schema.md` §19 (a
   superset of the LLD's 10). `consent_status` and `retrieval_status` likewise
   union both lists so neither document's states are unrepresentable.

3. **Drafts are hidden from officers.** Not stated explicitly, but implied by
   the workflow: an officer's queue begins at `SUBMITTED`. Enforced in
   `private.officer_can_read_application()`.

4. **Citizens cannot change their own application status.** The UPDATE policy
   pins the row to `DRAFT` in both `USING` and `WITH CHECK`, so every
   transition — including submission — must go through the backend, which owns
   the state machine.

5. **`workflow_definitions` / `workflow_steps` / `workflow_executions` omitted.**
   `database-schema.md` §57 explicitly permits representing a fixed workflow in
   application configuration for the first implementation, and §20 of the LLD
   lists 14 MVP tables without them. The 3 workflow tables are deferred.
   `applications.current_workflow_step` carries the current position.

6. **`consent_records` omitted.** §30 allows merging detailed consent history
   into the main event model for a small MVP; `application_events` and
   `audit_logs` cover the `GRANTED` / `REVOKED` trail.

7. **Multiple permissive SELECT policies retained.** The Supabase performance
   advisor flags the owner and officer policies as combinable. They were kept
   separate because each states one rule and is separately auditable; permissive
   policies OR together, which is the intended semantics, and the prototype's
   data volume makes the cost negligible.
