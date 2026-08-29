# Scripts

Small operational helpers. Each script is dependency-free and runs on plain Node.

| Script | Purpose |
| --- | --- |
| `verify-env.mjs` | Checks local `.env` files exist and that no service-role key leaked into the frontend |
| `health-check.mjs` | Verifies a running backend answers `GET /api/v1/health` |

```bash
node scripts/verify-env.mjs
node scripts/health-check.mjs [baseUrl]
```

Demo data seeding is added in Phase 2, once the database schema exists.
