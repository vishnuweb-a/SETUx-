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
| `migrations/` | Versioned SQL schema changes |
| `seed/` | Synthetic demo data for the SIH prototype |
| `functions/` | Edge functions, if any are required |

## Status

**No schema exists yet.** Phase 0 establishes only the directory boundary.

The business schema (`profiles`, `scholarships`, `applications`, `consents`,
`audit_logs`, …) is created in **Phase 2 — Supabase & Database Foundation**,
following [`docs/DATABASE/database-schema.md`](../docs/DATABASE/database-schema.md)
and [`docs/lld/database-design.md`](../docs/lld/database-design.md).

## Rules

- Schema changes go through **migrations**, never manual dashboard edits.
- Every protected table must have **Row Level Security** enabled with explicit
  policies. RLS is a second line of defence behind backend RBAC, not a
  replacement for it.
- Seed data must be **synthetic**. Never load real citizen records.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never reach the browser.
