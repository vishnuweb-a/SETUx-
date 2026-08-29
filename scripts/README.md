# Scripts

Small operational helpers. Each script is dependency-free and runs on plain Node.

| Script | Purpose |
| --- | --- |
| `verify-env.mjs` | Checks local `.env` files exist and that no service-role key leaked into the frontend |
| `health-check.mjs` | Verifies a running backend answers `GET /api/v1/health` |
| `seed-auth-users.mjs` | Creates the synthetic CITIZEN and GOVERNMENT_OFFICER development accounts |

```bash
node scripts/verify-env.mjs
node scripts/health-check.mjs [baseUrl]
```

## Development accounts

`seed-auth-users.mjs` provisions the two synthetic accounts Phase 3 needs to
demonstrate both authentication flows. Passwords are supplied through the
environment and are never committed — you choose them, and running the script is
what puts them on a machine:

```bash
SETUX_SEED_CITIZEN_PASSWORD='<choose-one>' SETUX_SEED_OFFICER_PASSWORD='<choose-one>'   node scripts/seed-auth-users.mjs
```

| Account | Email | Role |
| --- | --- | --- |
| Citizen | `citizen@setux.test` | `CITIZEN` |
| Government officer | `officer@setux.test` | `GOVERNMENT_OFFICER` |

Both are fictional; no real personal or government data is used. The script is
idempotent — re-running it reconciles the existing accounts rather than
duplicating them, and updates their passwords to match the environment.

The officer's role is assigned here, server-side. It is deliberately not
selectable at sign-up: government access must be provisioned through a
controlled process (`docs/API/auth-api.md` §11).
