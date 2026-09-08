# Change Draft & Editable Form — Phase 4

Status: **COMPLETE (2026-09-08).**

Phase 3 got the citizen as far as choosing which details of one government
record they want corrected. Phase 4 is the screen that asks what those details
should say, and the draft that remembers the answer.

Everything below is implemented. Where a sentence describes something as
belonging to a later phase, that thing does not exist in the code.

---

## 1. The one rule

A citizen typing a new name into SetuX does not change what the government
holds. It records a request.

```
citizen_record_fields.field_value        what the source holds  (UNCHANGED)
        │
        │ read once, server-side, at draft creation
        ▼
change_request_fields.old_value          an immutable snapshot of that value
change_request_fields.proposed_value     what the citizen is asking for
```

`proposed_value` is never copied into `citizen_record_fields`,
`citizen_profiles` or `application_data` — not at draft time, and not by
anything this phase creates (arch §13). No code path in the change-requests
module writes to either source table; the repository has no such statement, and
both the backend and frontend test suites assert that the modules they depend on
expose reads only.

`old_value` is **evidence**: it is what the citizen was looking at when they
made the request. It is captured server-side and is never accepted from a
client, never refreshed, and never rewritten by a later edit.

---

## 2. Scope

**In:** creating a draft from a field selection, reading one back, revising the
proposed values, and the citizen-facing form for all three.

**Out — and not stubbed, not placeheld, absent:** the dependency engine, impact
detection, affected-record discovery, target classification and selection, the
consent bundle, department routing, the government queue, officer review,
approval or rejection, connector application, `RecordUpdateConnector`, bank
step-up, notifications, parent status aggregation, and version history. Those
are Phases 5–15. The saved-draft screen says so in plain language rather than
offering a "Continue" that would lead nowhere.

A Phase 4 request is `DRAFT` and stays `DRAFT`. There is no submission.

---

## 3. Database

Migration: `supabase/migrations/20260908163355_setux_change_request_drafts.sql`.
Additive; no existing table, migration or row is modified.

### `change_requests` — the parent draft

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `request_number` | `CR-{YYYY}-{NNNNNN}`, a column default computed by `next_change_request_number()`. Never supplied by a client |
| `citizen_id` | → `profiles(id)` on delete restrict — the owner |
| `source_record_id` | → `citizen_records(id)` on delete restrict |
| `status` | `DRAFT`, and the CHECK admits nothing else |
| `created_at` / `updated_at` | timestamptz |

There is deliberately **no `record_type` column**: it is reachable through
`source_record_id`, and a duplicate could disagree with the record it names.

The status CHECK lists one value rather than the full lifecycle from arch §5.
A CHECK permitting states no code can reach invites a future writer to set one
directly rather than through the transition function that will own it. Widening
it later is a one-line migration.

### `change_request_fields` — one requested correction

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `change_request_id` | → `change_requests(id)` **on delete cascade** — a correction has no meaning without its request |
| `citizen_record_field_id` | → `citizen_record_fields(id)` **on delete restrict** — a source field with a request against it must not vanish |
| `field_key` | the normalized SetuX key, same vocabulary and CHECK as `citizen_record_fields` |
| `old_value` | jsonb — the server-taken snapshot |
| `proposed_value` | jsonb — the citizen's request |
| `policy_snapshot` | jsonb — the Phase 1 policy as it applied at draft time |
| `reason` | text null — the citizen's own account of why the value is wrong (arch §4.5) |
| `created_at` / `updated_at` | timestamptz |

`reason` arrived in a second migration,
`20260908171011_setux_change_request_field_reason.sql`, rather than as an edit
to the first — that one had already been applied to the remote database, and
rewriting an applied migration leaves the local file and the deployed schema
describing different things.

It is **nullable on purpose.** A citizen part way through a correction has not
necessarily written one, and refusing to save their work until they do would
make the draft less useful than the transient form it replaces. The phase that
owns SUBMISSION is where somebody else has to read it, and that is the right
place to require one — a service-layer rule about a transition, not a NOT NULL
on a column that must also hold half-finished work. A blank string is refused by
CHECK, so "not given" has exactly one representation.

Constraints:

- unique `(change_request_id, field_key)` — duplicate fields are structurally
  impossible, not a service-layer promise
- unique `(change_request_id, citizen_record_field_id)` — the same source row
  cannot enter a draft twice under two keys
- `proposed_value <> old_value` — a proposal identical to the source is not a
  correction, and this is true of the DATA rather than only of the code path
  that wrote it
- neither value may be a stored JSON null
- `policy_snapshot` must be an object whose `editability` is `EDITABLE` or
  `CONDITIONALLY_EDITABLE`; an `IMMUTABLE` snapshot is refused

Indexes: `(citizen_id, created_at desc)` and `(source_record_id)` on the parent;
`(change_request_id)` and `(citizen_record_field_id)` on the child — the last of
these also serves the `ON DELETE RESTRICT` check, which is a sequential scan
without it.

### Why `citizen_record_field_id` is stored alongside the snapshot

They answer different questions. The snapshot says what the citizen saw; the FK
says which source row it came from. Comparing the two is how a later phase can
detect that the source moved after the draft was taken. Phase 4 stores both and
builds no conflict-resolution workflow on them.

---

## 4. RLS

```
citizen   SELECT own drafts, and own requested corrections through the parent
officer   nothing
anon      nothing
writes    no INSERT / UPDATE / DELETE policy for any role
```

**Why no citizen INSERT policy, when the citizen creates the draft.** Because
creating a draft is not an insert. It is: verify the record is the caller's,
verify every field belongs to it, re-read the live policy for each, refuse
IMMUTABLE, snapshot the source value the citizen never sees in their payload,
and only then write. A browser-side INSERT policy would let the Supabase client
write a row with an `old_value` of its own choosing and a `policy_snapshot`
claiming whatever it liked — every check above bypassed, because RLS can express
"this row is mine" and cannot express "this old value is what the source
actually holds". The backend owns the write path (arch §14).

**Why no officer policy.** An officer's authority comes from a change target
routed to their department (arch §4.6, §8), and Phase 4 creates no targets. A
draft is a private working document; an officer reading one would be reading a
request the citizen has not made yet.

Verified against the live database: an anonymous client reads nothing from
either table and is refused on write to both.

---

## 5. API

Module: `backend/src/modules/change-requests/`, mounted at
`/api/v1/change-requests`. `requireAuth` + `requireRole(CITIZEN)` on the router,
re-asserted in the service together with the completed-onboarding gate.

```
POST   /api/v1/change-requests/drafts                    create a draft
GET    /api/v1/change-requests/drafts/:changeRequestId    read one back
PATCH  /api/v1/change-requests/drafts/:changeRequestId    revise proposed values
```

There is no DELETE. Discarding a draft is not in the Phase 4 scope, and a
destructive verb added for CRUD symmetry would be an unrequested way to destroy
a citizen's work. The phase that introduces `CANCELLED` can add it with the
lifecycle rules that make it meaningful.

### Create

```jsonc
POST /api/v1/change-requests/drafts
{
  "sourceRecordId": "…",
  "fields": [
    { "fieldKey": "identityHolderName", "proposedValue": "Demo New Name" }
  ]
}
```

Response `201`:

```jsonc
{
  "success": true,
  "data": {
    "id": "…",
    "requestNumber": "CR-2026-000046",
    "status": "DRAFT",
    "sourceRecordId": "…",
    "sourceRecordType": "IDENTITY_RECORD",
    "fields": [
      {
        "fieldKey": "identityHolderName",
        "oldValue": "Demo Old Name",
        "proposedValue": "Demo New Name",
        "policy": {
          "editability": "CONDITIONALLY_EDITABLE",
          "requiresEvidence": true,
          "requiresReview": true,
          "authority": "Identity Authority"
        },
        "reason": "Legal name change",
        "createdAt": "…",
        "updatedAt": "…"
      }
    ],
    "createdAt": "…",
    "updatedAt": "…"
  }
}
```

### What a request body may not carry

Every schema is `.strict()`, so each of these is a **400**, not a silently
dropped key:

`oldValue`, `editability`, `requiresEvidence`, `requiresReview`,
`policyAuthority`, `recordType`, `citizenId`, `status`, `requestNumber`, and —
on PATCH — `sourceRecordId`. A draft's source record is fixed at creation.

### PATCH semantics

The `fields` array **replaces** the draft's field set: the form shows every
field in the draft, so what it submits is what the draft holds afterwards. A
field the citizen removed is deleted from the draft (from the DRAFT — the source
record is not touched); a field newly added is resolved exactly as a create
resolves it.

`proposed_value` and `reason` are what a revision may change — both are the
citizen's own account of their request.

**A field that stays keeps its original `old_value`.** The snapshot is
re-supplied from what is already stored, so a revision cannot refresh it — not
from the request body, and not from the source either. If the source has moved
since the draft was taken, the draft keeps showing what the citizen was actually
looking at.

Every field in the payload is re-authorized, including ones already in the
draft: a field that has become IMMUTABLE since is refused now.

### Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | malformed body, unknown key, duplicate field, blank or unsupported value |
| 400 | `CHANGE_REQUEST_VALUE_UNCHANGED` | the proposal equals the current value |
| 403 | `FORBIDDEN` | an officer, or an anonymous caller reaching a role gate |
| 403 | `CHANGE_REQUEST_ONBOARDING_REQUIRED` | citizen has not completed onboarding |
| 404 | `RESOURCE_NOT_FOUND` | no such draft *of yours*; also a field not on the named record |
| 404 | `FIELD_POLICY_NOT_FOUND` | no active policy governs the field |
| 409 | `FIELD_NOT_EDITABLE` | the field is IMMUTABLE |

There is deliberately no code meaning "that belongs to another citizen".
Ownership is a predicate in every query, so another citizen's draft is
indistinguishable from an id that never existed.

---

## 6. Server-side policy revalidation

The frontend's field selection is a convenience and never an authority. For
every field, on every mutation, the service:

1. reads the source field rows scoped to the record **and** its owner — a key
   from elsewhere comes back missing and is a 404;
2. calls Phase 1's `assertFieldEditable(recordType, fieldKey)`, which throws for
   IMMUTABLE and for a field with no active policy;
3. takes `old_value` from the row read in step 1;
4. refuses a proposal equal to that snapshot;
5. builds `policy_snapshot` from the live decision returned in step 2.

The record type used in step 2 is read from the record's own row, not from the
request. The citizen id is resolved from the verified access token; no schema
has a field it could arrive in.

### Proposed-value validation

Zod at the edge: a JSON-safe **scalar** — string (trimmed, non-empty, ≤ 512
chars), finite number, or boolean. `reason` is an optional string, trimmed,
1–500 characters; a blank one is omitted from the body rather than sent as `""`.
Objects and arrays are refused as proposed values, which is
doing real work rather than being cautious by default: no correctable field in
the seeded policy set takes a structured value, and refusing nested objects at
the edge means `__proto__`/`constructor` keys never reach a JSONB column at all.
At most 20 fields per request.

No document-format rules are invented. SetuX does not pretend to validate real
Aadhaar, PAN or passport numbers — this is a synthetic prototype and the seeded
data is synthetic.

---

## 7. Frontend

```
/citizen/change-details                        record selection      (Phase 3)
/citizen/change-details/:recordId              field selection       (Phase 3)
/citizen/change-details/:recordId/fields       enter new values      (Phase 4)
/citizen/change-details/drafts/:changeRequestId  the saved draft     (Phase 4)
```

The first three are keyed by record; the fourth by the **draft's own id**, and
that shift is the point. A form reached from a field selection cannot survive a
refresh, because the selection lives in navigation state. Once the draft exists
it has durable identity, so it gets a URL of its own, and creating one
`replace`s the history entry — Back does not return to a create form whose state
would produce a second draft.

Each field renders as:

```
Full Name                                   [Conditionally editable]

Current value                    New value
Demo Old Name                    [ Demo New Name        ]

Reason for this change (optional)
[ Legal name change                                     ]

ⓘ This change may require supporting evidence and department review.
  Maintained by Identity Authority.
```

The reason is labelled optional rather than merely permitted to be empty: a
field that looks required but is not teaches a citizen to distrust the ones that
are.

The current value is static text, not a disabled input — a disabled input looks
like a field that might become editable, and this one never will.

**Evidence upload is not offered.** The warning states the requirement honestly;
collecting the document belongs to a later phase, and a control that discarded
its file would be worse than none.

**Immutable fields never arrive.** The record screen makes them unselectable,
and the edit screen filters the incoming selection through the same
`fieldEligibility` helper — so a hand-edited navigation state or a tab left open
across a policy change produces "No details available to change" and a way back,
not an input. That is a UI safeguard; the server refuses such a field regardless.

States handled: loading, API error with retry, concealed not-found, validation
errors per field, empty selection, all-immutable selection, saving, saved draft,
and the phase boundary.

### Refresh behaviour

The draft screen reads everything from the server. A refresh, a closed tab, or
the link opened later rebuilds the same form with the same values. Verified in
the browser: a hard reload with no navigation state restored both proposals and
both snapshots.

---

## 8. Tests

| Suite | File | Count |
| --- | --- | --- |
| Service unit | `backend/tests/unit/change-request-service.test.ts` | 25 |
| API integration | `backend/tests/integration/change-requests.test.ts` | 36 |
| Database + RLS | `backend/tests/database/change-request-queries.test.ts` | 20 |
| Frontend pages | `frontend/tests/features/change-details/change-draft-pages.test.tsx` | 30 |

The database suite runs against the real project and asserts, among other
things, that `citizen_record_fields.field_value` is byte-identical before and
after a draft is created against it, and that deleting a referenced source field
is refused.

---

## 9. Demo scenario

Signed in as `citizen@setux.test`, Identity Record:

```
Full Name
  current   Demo Old Name        (still what citizen_record_fields holds)
  proposed  Demo New Name

Mobile Number
  current   9000000001
  proposed  9000000002
```

Saved as `CR-2026-…`, status `DRAFT`, sent to no department. The citizen's
onboarding profile name is untouched and remains deliberately separate from the
source-held holder name — a mismatch between the two is precisely the situation
this service exists to correct.

---

## 10. Where Phase 4 stops

A valid, citizen-owned draft exists, can be viewed, and can be edited. Nothing
has been submitted, no department has been told, no consent has been asked for,
and the government's record still says exactly what it said before.

Phase 5 is the Dependency & Impact Detection Engine.
