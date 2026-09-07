# Citizen Records API

Change & Correction Service, **Phase 2**.
Module: `backend/src/modules/citizen-records/`.
Schema: `docs/DATABASE/citizen-records.md`.

Read-only. **There are no mutation endpoints in this phase** — see §6.

---

## 1. Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/citizen-records` | The caller's own record inventory. |
| `GET` | `/api/v1/citizen-records/:recordId` | One record, its current values, and the policy governing each. |

Both require **authentication** and the **`CITIZEN`** role.

```
requireAuth → requireRole(CITIZEN) → validateRequest(params, query) → controller → service → repository
```

The role gate is applied twice — once by the router, once by the service
(`assertCompletedCitizen`) — so a route mounted elsewhere by a later phase still
fails closed rather than inheriting whatever gate that mount carries
(arch §1.1).

### Why CITIZEN, when `/field-policies` is any authenticated user

A field policy is configuration about a *kind* of record and reads identically
for everyone. A citizen record is **personal data about one person**, so it
takes the `applications` posture instead.

Officers are refused, deliberately: an officer's authority over a citizen record
arises from a change target (arch §4.6), which does not exist yet. This matches
the table's own absent officer RLS policy — see `docs/DATABASE/citizen-records.md` §6.

---

## 2. `GET /api/v1/citizen-records`

Returns the whole inventory unpaginated: a citizen has one record per record
type per source, and the Change Details entry screen needs all of them at once
to render the record chooser.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "…uuid…",
        "recordType": "IDENTITY_RECORD",
        "source":    { "code": "MOCK_IDENTITY_API",  "name": "Identity Registry (Mock)" },
        "authority": { "code": "IDENTITY_AUTHORITY", "name": "Identity Authority" },
        "sourceRecordRef": "SYNTH-IDR-2026-0117",
        "status": "ACTIVE",
        "sourceVersion": "v1",
        "lastSyncedAt": "2026-09-08T00:00:00.000Z",
        "isSimulated": true,
        "createdAt": "2026-09-08T00:00:00.000Z",
        "updatedAt": "2026-09-08T00:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

`authority` is **`null`** for `BANK_DETAILS`: the bank is a provider, not a
department, so it has no officer queue and the API says so rather than inventing
an authority.

An **empty** inventory is a 200 with `{ "items": [], "total": 0 }`, not an
error — a citizen SetuX has not provisioned records for genuinely has none.

---

## 3. `GET /api/v1/citizen-records/:recordId`

The summary above, plus `fields`:

```json
{
  "success": true,
  "data": {
    "id": "…uuid…",
    "recordType": "IDENTITY_RECORD",
    "source":    { "code": "MOCK_IDENTITY_API",  "name": "Identity Registry (Mock)" },
    "authority": { "code": "IDENTITY_AUTHORITY", "name": "Identity Authority" },
    "sourceRecordRef": "SYNTH-IDR-2026-0117",
    "status": "ACTIVE",
    "sourceVersion": "v1",
    "lastSyncedAt": "2026-09-08T00:00:00.000Z",
    "isSimulated": true,
    "createdAt": "…", "updatedAt": "…",
    "fields": [
      {
        "fieldKey": "identityHolderName",
        "value": "Demo Old Name",
        "retrievedAt": "2026-09-08T00:00:00.000Z",
        "editability": "CONDITIONALLY_EDITABLE",
        "changeable": true,
        "requiresEvidence": true,
        "requiresReview": true,
        "policyAuthority": "Identity Authority"
      },
      {
        "fieldKey": "identityRegistryReference",
        "value": "SYNTH-IDR-2026-0117",
        "retrievedAt": "2026-09-08T00:00:00.000Z",
        "editability": "IMMUTABLE",
        "changeable": false,
        "requiresEvidence": false,
        "requiresReview": false,
        "policyAuthority": "Identity Authority"
      }
    ]
  }
}
```

Fields are ordered by `fieldKey`, so a record renders identically on every load.

### Field policy integration

Each field carries the **Phase 1** policy governing it, read live from
`field_policies` through the field-policy module. This is what lets the change
form *explain* a locked field rather than hide it — the requirement
`feature.md` places on the Phase 2/3 UI.

Three rules hold:

1. **Editability is never stored on a record.** There is no copy that could
   disagree with the policy table, so a policy edit takes effect everywhere at
   once.
2. **Editability is never accepted from a client.** No schema admits it and no
   parameter carries it.
3. **A field with no active policy is `editability: null`, `changeable: false`.**
   An ungoverned field must never become correctable by having been forgotten —
   the safety of the feature cannot depend on the completeness of a seed.

`changeable` is derived (`editability !== 'IMMUTABLE'`), never stored, so no
response can say "IMMUTABLE, and changeable".

---

## 4. What the response does not contain

| Omitted | Why |
| --- | --- |
| `citizenId` | Already known — it is the caller. Echoing it would suggest it could be something else. |
| `dataSourceId`, `authorityDepartmentId` | Internal routing UUIDs a client can neither use nor act on. The source and authority are named by code and name instead. |

`sourceRecordRef` **is** exposed: it is the handle the citizen would quote to
the issuing office, and a correction service that hid it would make its own
records unidentifiable to their owner.

---

## 5. Errors

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Malformed `recordId`, or any query parameter at all. |
| 401 | `MISSING_TOKEN` / `INVALID_TOKEN` | No session, or an unverifiable one. |
| 403 | `FORBIDDEN` | An officer. |
| 403 | `CITIZEN_RECORD_ONBOARDING_REQUIRED` | A citizen whose onboarding is not `COMPLETED`. |
| 404 | `NOT_FOUND` | No record **of the caller's** has that id. |
| 500 | `CITIZEN_RECORD_UNSUPPORTED_TYPE` | A stored `record_type` outside the supported five — a configuration fault, made loud. |

### Concealment

There is deliberately **no** status or code for "that record belongs to another
citizen". Ownership is a predicate in the query, so another citizen's record
returns the same 404 — same status, same code, same message — as an id that
never existed. A caller enumerating UUIDs learns nothing about which of them are
real.

### Query parameters are rejected, not ignored

Both endpoints validate the query string against an empty strict schema, so
`?citizenId=<someone-else>` is a **400**.

Without that, such a request would return 200 with the caller's own records —
the safe outcome, but an actively misleading one, reading as though the filter
had been applied and the other citizen simply owned these records. Rejecting it
says plainly that no such parameter exists.

---

## 6. No mutation, structurally

No `POST`, `PUT`, `PATCH` or `DELETE` is declared on this router — not disabled,
not guarded, **absent**. A client cannot create, amend or remove a government
record through the API even in principle:

- the router declares no write verb;
- the repository exports no write function;
- the schema admits no body and no proposed value;
- the tables carry **no** write RLS policy for any role, so the browser's own
  Supabase client cannot do it directly either.

Records reach the database through the migration and the trusted server-side
demo provisioner alone.

**Not built in this phase** (all Phase 3+): `change_requests`, proposed values,
the dependency engine, impact detection, target selection, change consent,
officer review, `RecordUpdateConnector`, notifications, the bank connector, and
any source-system write.

---

## 7. Source snapshot semantics

`citizen_record_fields` is a SetuX **projection** of what the source holds now.
It is **not** the historical evidence for an application — that stays in
`application_data`, frozen at retrieval time, and Phase 2 neither reads nor
writes it.

An application decided last month keeps showing the name that was on the record
last month, with its original provenance, even after the citizen corrects that
name (arch §17). A later APPLIED change refreshes `citizen_record_fields`; it
never rewrites `application_data`.
