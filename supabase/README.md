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

The Phase 6 migration enforces one active application per citizen/service and
adds service-role-only functions for atomic create, draft replacement, and
submit operations. Apply it before using the application endpoints; the backend
does not fall back to partial multi-statement writes.

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
