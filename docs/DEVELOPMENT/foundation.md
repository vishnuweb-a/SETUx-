SetuX — Development Foundation

Reference for the reusable frontend and backend foundation established in
Phase 1. Design intent lives in `docs/lld/`; this document records what is
actually wired up and how to work with it.

---

# 1. Prerequisites

- Node.js `>=20.19.0`
- npm (the repository uses npm workspaces — do not switch package managers)

Install once from the repository root:

```bash
npm install
```

---

# 2. Environment configuration

Environment files are never committed. Copy each example and fill it in:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

## Backend (`backend/.env`) — server only

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3000` | HTTP listen port |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated list of allowed browser origins |
| `LOG_LEVEL` | no | `info` | Pino level |

`backend/src/config/env.ts` is the **only** place `process.env` is read. It is
validated with Zod at startup: a malformed value stops the process immediately
rather than failing at the first request that needs it. Import `config` from
`backend/src/config/index.js` everywhere else.

## Frontend (`frontend/.env`) — browser

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | no | `http://localhost:3000/api/v1` | Base URL for the API client |

**Every `VITE_*` value is compiled into the bundle and is therefore public.**
`SUPABASE_SERVICE_ROLE_KEY` and any other privileged credential must stay in
`backend/.env` and must never be given a `VITE_` prefix.

---

# 3. Development commands

Run from the repository root; each also exists per workspace.

| Command | Effect |
| --- | --- |
| `npm run dev` | Starts backend and frontend together |
| `npm run dev:backend` | Backend only (`tsx watch`, port 3000) |
| `npm run dev:frontend` | Frontend only (Vite, port 5173) |
| `npm run build` | Production build of both workspaces |
| `npm run lint` | ESLint across both workspaces |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest across both workspaces |

Target a single workspace with `npm run <script> -w backend` (or `-w frontend`).

---

# 4. Backend foundation

```
Request
  |  requestContext      assigns x-request-id
  |  helmet              security headers
  |  cors                origin allow-list from CORS_ORIGIN
  |  express.json        1mb body limit
  |  requestLogger       pino-http, correlated
  |  apiRateLimiter      mounted on /api/v1
  |  apiRouter           versioned surface
  |  Controller -> Service -> Repository / Connector
  |  notFoundHandler     unmatched path becomes NotFoundError
  |  errorHandler        single exit point for every failure
Response
```

`app.ts` builds the Express app and is free of side effects, so tests mount it
directly with supertest. `server.ts` owns listening, signal handling and
graceful shutdown. Neither contains business logic.

## Shared infrastructure

| Module | Purpose |
| --- | --- |
| `shared/errors` | `AppError` and its subclasses; `ERROR_CODES` |
| `shared/logger` | Pino instance; silent under test, redacts auth headers |
| `shared/validation` | `validateRequest({ body, params, query })` Zod middleware |
| `shared/constants` | `HTTP_STATUS` |
| `shared/utils` | `successBody` / `errorBody` envelopes, `asyncHandler` |

## Response envelopes

Success:

```json
{ "success": true, "data": {}, "message": "optional" }
```

Failure — `requestId` matches the `x-request-id` response header, so a user can
quote it and a developer can find the matching log line:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload is invalid.",
    "details": { "body.email": "Invalid email address" },
    "requestId": "req_..."
  }
}
```

Only an `AppError` reaches the client with its own code and message. Anything
else is logged in full and reported as a generic `INTERNAL_ERROR` — internal
details and stack traces never appear in a response body.

## Adding a module

Follow AGENT.md section 7. Routes wire HTTP, controllers translate
request/response, services hold the logic, repositories and connectors reach
outside. Register the router in `src/routes/index.ts`, and validate input at the
route with `validateRequest`.

---

# 5. Frontend foundation

```
main.tsx
  App
    AppProviders            ErrorBoundary + QueryClientProvider
      RouterProvider
        RootLayout          header / main / footer shell
          route element
```

| Path | Purpose |
| --- | --- |
| `app/providers` | Global providers; no business logic |
| `app/router` | Route table |
| `app/layouts` | Application shell |
| `app/pages` | Route-level screens |
| `components/ui` | Vendored shadcn/ui primitives |
| `components/common` | Shared composed components |
| `components/feedback` | Loading, error, empty and boundary states |
| `services` | API client and query definitions |
| `lib` | `cn()`, validated browser env |
| `types` | Shared contracts, including the API envelope |

`features/`, `hooks/`, `stores/`, `schemas/` and `utils/` are scaffolded for the
phases that need them.

## UI primitives

`Button`, `Input`, `Card`, `Badge`, `Alert`, `Dialog`, `Separator`, `Skeleton`.

These are shadcn/ui components kept close to upstream so they remain updatable
from the registry. Add more with `npx shadcn@latest add <name>` only when a
component provides real foundation value.

Theme tokens live in `src/index.css` following the Tailwind v4 four-step
pattern: variables at `:root`, `@theme inline` mapping, `@layer base`
consumption, `.dark` override.

## API client

`services/api-client.ts` is the single entry point for backend communication.
It owns base-URL resolution, JSON handling, a 15s timeout and error
normalisation. Every failure surfaces as an `ApiError` carrying `code`,
`status` and `requestId`; network and timeout failures get the client-side
codes in `types/api.ts`. **Do not call `fetch` directly from a component.**

## Data fetching

Define queries with `queryOptions` beside their service, as
`services/health-service.ts` does, then pass them to `useQuery`. The query
client retries twice by default but never retries a 4xx — a client error will
not succeed on a second attempt.

## Required UI states

Per AGENT.md section 18 every asynchronous screen must handle loading, success,
empty and failure. Use `LoadingState`, `SkeletonList`, `ErrorState` and
`EmptyState` from `components/feedback` rather than writing new one-off states.

`ErrorBoundary` wraps the whole application and catches render-time errors. It
does **not** catch errors in event handlers or async code — those surface
through TanStack Query's error state.

---

# 6. Health endpoint

The only functional endpoint in the foundation, and the contract the frontend
integration is verified against.

```
GET /api/v1/health
```

```json
{
  "success": true,
  "data": {
    "service": "setux-backend",
    "status": "healthy",
    "environment": "development",
    "uptimeSeconds": 84,
    "timestamp": "2026-08-29T11:38:19.714Z"
  },
  "message": "Service is healthy"
}
```

Dependency checks (Supabase, connectors) are added by the phases that introduce
those dependencies.

---

# 7. Verifying frontend to backend locally

```bash
npm run dev
```

Open `http://localhost:5173`. The foundation screen calls the health endpoint
through the API client and TanStack Query, and renders the loading, success and
error states.

If the screen reports an error, check that the backend is listening on the port
in `VITE_API_BASE_URL`, and that the frontend's origin appears in the backend's
`CORS_ORIGIN`.

---

# 8. Testing

Vitest in both workspaces.

| Location | Environment | Covers |
| --- | --- | --- |
| `backend/tests/unit` | node | Error handler, request validation |
| `backend/tests/integration` | node | Health endpoint, security middleware |
| `frontend/tests/components` | jsdom | Error boundary, feedback states |
| `frontend/tests/services` | jsdom | API client envelope, network, timeout |
| `frontend/tests/integration` | jsdom | Foundation screen loading/success/error |

Backend tests mount `createApp()` with supertest. Frontend tests use React
Testing Library and query by role, so they exercise the accessible tree rather
than implementation details.

```bash
npm test                    # both workspaces
npm test -w backend         # one workspace
npx vitest                  # watch mode, from within a workspace
```

---

# 9. Security rules that the foundation enforces

- `.env` files are gitignored; only `.env.example` is committed.
- CORS is an explicit allow-list — never `*`.
- Helmet is enabled; `x-powered-by` is disabled.
- Rate limiting is applied to the whole versioned API surface.
- The logger redacts `authorization`, `cookie` and `set-cookie`. Redaction is a
  safety net, not permission to log sensitive values — credentials, tokens and
  full government IDs must never be passed to the logger at all.
- Production error responses carry a generic message; stack traces and internal
  details are never returned to a client.
