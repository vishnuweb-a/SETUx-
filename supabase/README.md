# Supabase

Persistence and authentication infrastructure for SetuX.

```text
SetuX Backend
     ↓
  Supabase
 ┌───┴────────────┬──────────────┐
 │ Auth           │ PostgreSQL   │ Row Level Security
 └────────────────┴──────────────┘
```

## Layout

| Directory | Purpose |
| --- | --- |
| `migrations/` | Versioned SQL schema changes — the authoritative history |
| `seed/` | Synthetic demo data for the SIH prototype |
| `functions/` | Edge functions, if any are required |

## Status

**Phase 6 implemented.** 17 tables, 9 enums, RLS enabled on every table with 35
policies, synthetic reference data, and atomic application operations.

Phase 4 (onboarding) reuses this schema unchanged — no table, column,
constraint, index, enum or policy was added or altered. It contributes one
migration holding two functions that make onboarding completion atomic. Like
every other migration it must be applied when an environment is set up; the
backend falls back to two ordered writes if it is absent. It **is** applied to
the current shared development project (`auqsiwgawphnuceaibvp`), where both
functions were verified `SECURITY INVOKER` with `EXECUTE` granted to
`authenticated` only. See the file's header for how to apply it elsewhere.

Migrations apply in filename order:

| Order | File |
| --- | --- |
| 1 | `20260829090000_setux_enums.sql` |
| 2 | `20260829090100_setux_identity.sql` |
| 3 | `20260829090200_setux_catalogue.sql` |
| 4 | `20260829090300_setux_applications.sql` |
| 5 | `20260829090400_setux_rls.sql` |
| 6 | `20260903090000_setux_onboarding_functions.sql` (Phase 4) |
| 7 | `20260904090000_setux_application_management.sql` (Phase 6) |
| 8 | `20260904120000_setux_consent_management.sql` (Phase 7) |
| 9 | `20260904150000_setux_fake_digilocker_retrieval.sql` (Phase 8) |

The Phase 6 migration enforces one active application per citizen/service and
adds service-role-only functions for atomic create, draft replacement, and
submit operations. Apply it before using the application endpoints; the backend
does not fall back to partial multi-statement writes.

The Phase 7 migration adds `consents.decided_at` (nullable, so existing rows
stay valid) with a CHECK tying it to a GRANTED or DENIED status, plus two
service-role-only functions: `prepare_application_consents`, which derives the
consent requests for a submitted application idempotently, and
`decide_application_consent`, which records one decision and its
`application_events` entry in a single statement. Both are `security invoker`
with an empty `search_path`, and neither is executable by `anon` or
`authenticated` — consent decisions are reached only through the backend, which
resolves the citizen identity server-side. The `consents` RLS policies are
unchanged from Phase 2.

The Phase 8 migration is applied to the linked project. It adds `data_retrievals.requirement_id` (nullable, so
existing rows stay valid), two CHECK constraints — a failed attempt must carry an
error code, a successful one must not — a CHECK tying
`application_data.source_type` to the presence of `source_id`, and a partial
unique index over `(application_id, requirement_id) WHERE status = 'SUCCESS'`
that makes a successful retrieval idempotent under concurrent retries.

It adds two service-role-only functions: `record_application_retrieval`, which
writes the attempt, the normalized values and the timeline event in one
transaction, and `record_application_retrieval_failure`, which records a failed
attempt and deliberately writes no `application_data`. Both re-derive the full
authorization chain — ownership, submitted state, the requirement's own data
source, and a GRANTED consent for that source — independently of the caller.
Both are `security invoker` with an empty `search_path`, and neither is
executable by `anon` or `authenticated`.

RLS is unchanged from Phase 2. `data_retrievals` and `application_data` keep
SELECT-only policies: no browser session can write a retrieval result.

Every Phase 8 statement is additive. The migration contains no DROP, TRUNCATE or
DELETE, and each constraint has been validated against the live rows.

Full documentation — schema, relationships, the RLS access model, environment
setup and validation commands — is in
[`docs/DATABASE/database-setup.md`](../docs/DATABASE/database-setup.md).
The approved design remains
[`docs/DATABASE/database-schema.md`](../docs/DATABASE/database-schema.md).

## Rules

- Schema changes go through **migrations**, never manual dashboard edits. To
  change something, add a new migration; never edit an applied one.
- Every protected table must have **Row Level Security** enabled with explicit
  policies. RLS is a second line of defence behind backend RBAC, not a
  replacement for it.
- Seed data must be **synthetic**. Never load real citizen records.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never reach the browser.
- Regenerate `backend/src/database/database.types.ts` after any schema change.
