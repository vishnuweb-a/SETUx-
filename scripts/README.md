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

`seed-auth-users.mjs` provisions the two synthetic accounts SetuX needs to
demonstrate both authentication flows. Passwords are supplied through the
environment and are never committed — you choose them, and running the script is
what puts them on a machine:

```bash
# both fixtures
SETUX_SEED_CITIZEN_PASSWORD='<choose-one>' SETUX_SEED_OFFICER_PASSWORD='<choose-one>' \
  node scripts/seed-auth-users.mjs

# only the citizen — the officer's password is not required, and the officer
# account is not touched
SETUX_SEED_CITIZEN_PASSWORD='<choose-one>' \
  node scripts/seed-auth-users.mjs --only citizen@setux.test

# only the officer
SETUX_SEED_OFFICER_PASSWORD='<choose-one>' \
  node scripts/seed-auth-users.mjs --only officer@setux.test
```

| Account | Email | Role |
| --- | --- | --- |
| Citizen | `citizen@setux.test` | `CITIZEN` |
| Government officer | `officer@setux.test` | `GOVERNMENT_OFFICER` |

Both are fictional; no real personal or government data is used.

`--only` accepts nothing but the two fixture addresses above. Any other value is
refused, so the script cannot be pointed at a real account.

### What the script writes

Re-running it reconciles the existing accounts rather than duplicating them, and
updates their passwords to match the environment. It is deliberately narrow
about the profile:

| Case | Written |
| --- | --- |
| **New** synthetic profile | `id`, `email`, `role`, `onboarding_status = 'NOT_STARTED'` |
| **Existing** profile | the `role`, and only if it has drifted |

**Existing onboarding progress is preserved.** `onboarding_status` is an initial
value for a profile the script creates, never a reset applied to one that is
already there — rotating a fixture password does not send an onboarded account
back through the flow.

The officer's role is assigned here, server-side. It is deliberately not
selectable at sign-up: government access must be provisioned through a
controlled process (`docs/API/auth-api.md` §11).

Behaviour is covered by `backend/tests/unit/seed-auth-users.test.ts`.
