# Service Catalogue API — Phase 5

Implements `docs/API/api-specification.md` §15.

The persistence model is generic: `services` describes any government service
SetuX federates, and the MVP seeds scholarships into it
(`docs/DATABASE/database-schema.md` §16, §17). The API keeps the schema's
vocabulary — the routes are `/services` — while the citizen interface calls the
same records *Scholarships*. The translation lives in the frontend feature, not
in the API.

Base path: `/api/v1/services`

---

## 1. Authorization

Every route requires a valid session. No route is restricted by role.

```
requireAuth → validateRequest(<schema>) → controller
```

Two sources settle this rather than convenience:

- `api-specification.md` §26 places `GET /services` after `GET /auth/me` in the
  authenticated flow.
- The RLS policy on these tables is
  `services_select_authenticated ... to authenticated` — the database grants
  these rows to any signed-in user, not to citizens alone.

Narrowing the API to `CITIZEN` would contradict the schema and would block the
officer screens of later phases, which need to name the service an application
belongs to.

This is not a weakening. These tables hold configuration — what SetuX offers and
what it requires — and no citizen data. What *is* enforced is **publication**:
only `ACTIVE` services are ever selected (§5 below).

Onboarding is not gated at the API layer. The browser routes the catalogue
behind `RequireOnboarding`, so a half-onboarded citizen stays in their form; an
API that refused to name a scholarship until a profile existed would be
describing publication, not privacy.

---

## 2. `GET /api/v1/services`

One page of the catalogue.

### Query parameters

All are optional. The schema is **strict**: an unknown parameter is rejected
with `400 VALIDATION_ERROR` rather than ignored, so a client cannot probe for a
hidden filter.

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `search` | string | — | Trimmed; blank means no filter. Max 120 characters. Matches `name`, `description` or `department`, case-insensitively. |
| `department` | string | — | Exact match on `services.department`. Trimmed; blank means no filter. Max 120 characters. |
| `page` | integer | `1` | Must be ≥ 1. |
| `limit` | integer | `12` | Must be ≥ 1 and ≤ `50`. |

Search terms are always passed as bound parameters. PostgREST pattern
metacharacters (`%`, `_`, `,`, `(`, `)`, `\`) are escaped, so a term such as
`100%` matches literally and a comma cannot inject a second predicate.

Results are ordered by `name` ascending, which is what makes pagination
deterministic.

### Response `200`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "code": "SCHOLARSHIP_MERIT",
        "name": "National Merit Scholarship",
        "description": "Merit-based scholarship for undergraduate students…",
        "department": "Higher Education"
      }
    ],
    "page": 1,
    "limit": 12,
    "total": 7,
    "totalPages": 1
  }
}
```

`status` is deliberately **not** returned: the list only ever contains `ACTIVE`
rows, and repeating that on every item would invite a client to believe it could
ask for the others.

`totalPages` is at least `1`, so an empty catalogue reports "page 1 of 1".

---

## 3. `GET /api/v1/services/departments`

The departments that own at least one visible service — the options offered by
the department filter.

Declared before `/:serviceId` in the router, so the literal segment is never
captured as an identifier.

### Response `200`

```json
{
  "success": true,
  "data": { "departments": ["Higher Education", "Minority Affairs", "Social Welfare", "Technical Education"] }
}
```

---

## 4. `GET /api/v1/services/:serviceId`

One service, with its requirements embedded — `api-specification.md` §15.2
("Returns service details and requirements").

`serviceId` must be a UUID. A malformed identifier is rejected with
`400 VALIDATION_ERROR` before it reaches the database.

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "SCHOLARSHIP_MERIT",
    "name": "National Merit Scholarship",
    "description": "…",
    "department": "Higher Education",
    "requirements": [
      {
        "id": "uuid",
        "code": "IDENTITY",
        "name": "Identity Verification",
        "description": "Confirms the applicant's identity against the national identity registry.",
        "type": "IDENTITY",
        "source": "Identity Registry (Mock)",
        "required": true,
        "displayOrder": 1
      }
    ]
  }
}
```

`type` is one of `IDENTITY`, `DOCUMENT`, `RECORD`, `DECLARATION`
(`service_requirements.requirement_type`).

`source` names the simulated government system that supplies the requirement, or
is `null` when the citizen supplies it themselves (a `DECLARATION`). Naming the
source is the point of the detail screen: it tells the citizen which department
SetuX will approach on their behalf, before any consent is asked for.

Requirements are returned in `display_order`.

### Response `404`

```json
{
  "success": false,
  "error": { "code": "RESOURCE_NOT_FOUND", "message": "Service not found.", "requestId": "req_…" }
}
```

---

## 5. `GET /api/v1/services/:serviceId/requirements`

The requirements alone — `api-specification.md` §15.3. Guarded by the same
visibility check as the detail route; without it, this route would be the way
around it, since the requirements of an unpublished service still describe what
that service is.

The frontend detail screen does not call this: `GET /services/:serviceId`
already embeds the requirements, and a second request for data the first
returned would be a wasted round trip. It is part of the documented contract, so
it is implemented and tested.

### Response `200`

```json
{ "success": true, "data": [ { "id": "uuid", "code": "IDENTITY", "…": "…" } ] }
```

---

## 6. Visibility

Only services with `status = 'ACTIVE'` are exposed.

This is enforced **in the query predicate**, not by filtering rows after they are
read. An `INACTIVE` service is never selected, so no query manipulation from the
client can surface it.

An `INACTIVE` service addressed directly by id returns exactly the same status,
code and message as an unknown id. The response therefore cannot be used to
confirm that an unpublished service exists.

The seed carries `SCHOLARSHIP_LEGACY` as an `INACTIVE` fixture precisely so this
rule has something to be tested against.

---

## 7. Errors

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Unknown query parameter, out-of-range `page`/`limit`, over-long `search`, malformed `serviceId`. |
| `401` | `AUTH_TOKEN_MISSING` | No credential presented. |
| `401` | `AUTH_INVALID_TOKEN` / `AUTH_SESSION_EXPIRED` | Credential rejected by the Auth server. |
| `404` | `RESOURCE_NOT_FOUND` | No such service, or the service is not published. |
| `500` | `INTERNAL_ERROR` | Unexpected failure. Database messages, constraint names and stack traces are never returned. |

---

## 8. Phase boundary

Every route in this module is a read. There is no mutation route, and no
repository function that writes.

Browsing a scholarship, opening its detail screen, or pressing **Apply now** does
not create an application, collect consent, retrieve documents or start
verification. Those belong to Phase 6 and later.
