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

**Phase 2 complete.** 17 tables, 9 enums, RLS enabled on every table with 35
policies, and synthetic reference seed data.

Migrations apply in filename order:

| Order | File |
| --- | --- |
| 1 | `20260829090000_setux_enums.sql` |
| 2 | `20260829090100_setux_identity.sql` |
| 3 | `20260829090200_setux_catalogue.sql` |
| 4 | `20260829090300_setux_applications.sql` |
| 5 | `20260829090400_setux_rls.sql` |

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
