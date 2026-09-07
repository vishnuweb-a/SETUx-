# Editable Field Policy API — Change & Correction Service, Phase 1

Implements the Phase 1 boundary of
`docs/ARCHITECTURE/change-correction-service.md` §25, and the field-class model
of `docs/PHASES/feature.md` Phase 1.

The field policy answers exactly one question, about a *kind* of record rather
than about anybody's record:

> May a citizen ask for this field to be corrected, and what does asking require
> of them?

It is **configuration**, keyed on `(recordType, fieldKey)`. It holds no citizen
value, no proposed value, no application and no consent — which is why it exists
before `citizen_records` does, and why nothing in this API varies by who is
asking.

Base path: `/api/v1/field-policies`

Read-only. No mutation route exists on this router — not disabled, not guarded,
**absent** — so no client can author a policy through the API even in principle.

---

## 1. Authorization

Every route requires a valid session. No route is restricted by role.

```
requireAuth → validateRequest(<params>) → controller
```

Two reasons, matching the catalogue's posture in `services.md` §1:

- The RLS policy on the table is
  `field_policies_select_authenticated ... to authenticated` — the database
  grants these rows to any signed-in user, not to citizens alone. Narrowing the
  API to `CITIZEN` would contradict the schema.
- An officer reviewing a correction must see the same rule the citizen was
  shown. *"Why was this field editable?"* is a question the review phase has to
  answer, and it cannot answer it from an endpoint it may not call.

Anonymous access is refused, in line with every SetuX route but health and auth,
and because the correction rules of the government systems SetuX federates are
not something to publish unauthenticated.

There is **no onboarding gate**: this endpoint describes record types, not the
caller.

---

## 2. Record types

A closed set, validated at the edge (`docs/ARCHITECTURE/change-correction-service.md` §20.5):

```
IDENTITY_RECORD
INCOME_RECORD
EDUCATION_RECORD
COMMUNITY_RECORD
BANK_DETAILS
```

`BANK_DETAILS` carries policy even though no bank connector exists. Editability
is policy and policy is configuration: it is knowable before the provider is
built.

An unsupported record type is a `400 VALIDATION_ERROR` **before any query runs**,
never a `200` with an empty field list. Those two answers read very differently
to somebody enumerating the record types SetuX knows about.

---

## 3. Editability

| Value | Meaning |
|---|---|
| `EDITABLE` | A correction may be requested directly. |
| `CONDITIONALLY_EDITABLE` | A correction may be requested, subject to `requiresEvidence` / `requiresReview`. |
| `IMMUTABLE` | No citizen may request a correction to this field here. |

`IMMUTABLE` is not "hidden". The UI is expected to **show** the field and name
the authority that owns it — *"this cannot be changed here, and here is who owns
it"* is the more useful answer (arch §11).

An `IMMUTABLE` field never requires evidence or review; a database CHECK makes
the incoherent combination impossible to write.

---

## 4. `GET /api/v1/field-policies/:recordType`

Every active policy for one record type, ordered by `fieldKey` so the same
record type always renders its fields in the same order.

### Response `200`

```json
{
  "success": true,
  "data": {
    "recordType": "IDENTITY_RECORD",
    "fields": [
      {
        "fieldKey": "identityHolderName",
        "editability": "CONDITIONALLY_EDITABLE",
        "requiresEvidence": true,
        "requiresReview": true,
        "authority": "Identity Authority",
        "dependencyGroup": "LEGAL_NAME"
      },
      {
        "fieldKey": "identityRegistryReference",
        "editability": "IMMUTABLE",
        "requiresEvidence": false,
        "requiresReview": false,
        "authority": "Identity Authority",
        "dependencyGroup": null
      }
    ]
  }
}
```

`id`, `active`, `createdAt` and `updatedAt` are **not** exposed. `active` is
absent because every returned row is active by construction, and repeating it on
each field would invite a client to believe it could ask for the others.

A record type whose policies have all been retired returns `fields: []` with
`200`. That is a configuration state, not an error, and describing it honestly
is the right answer.

---

## 5. `GET /api/v1/field-policies/:recordType/fields/:fieldKey`

One field's policy. For a client that already holds a field and wants the
current rule for it — re-checking before submitting, rather than trusting a
policy fetched with the form.

`fieldKey` must be a normalized SetuX key (lowerCamelCase, matching the database
CHECK). This is the key the connectors emit — `identityHolderName`, never the
provider's own `holder_name`.

### Response `200`

```json
{
  "success": true,
  "data": {
    "recordType": "IDENTITY_RECORD",
    "fieldKey": "identityHolderName",
    "editability": "CONDITIONALLY_EDITABLE",
    "requiresEvidence": true,
    "requiresReview": true,
    "authority": "Identity Authority",
    "dependencyGroup": "LEGAL_NAME"
  }
}
```

An `IMMUTABLE` field returns `200`, not an error. **Reading a policy is not
requesting a change**: the read succeeds so the UI can explain the lock, and it
is the enforcement helper (§7) that refuses when a change is actually attempted.

---

## 6. Errors

| Status | Code | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Unsupported record type, malformed field key, unknown path parameter. |
| `401` | `AUTH_TOKEN_MISSING` / `AUTH_INVALID_TOKEN` | No session, or a session the auth server rejects. |
| `404` | `FIELD_POLICY_NOT_FOUND` | A well-formed field key that no active policy governs. |
| `404` | `RESOURCE_NOT_FOUND` | Any method other than `GET`, and any unrouted path. |
| `500` | `INTERNAL_ERROR` | Unexpected failure. No stack trace is returned. |

`400` and `404` are deliberately distinct: `400` means *"that is not a field
key"*, `404` means *"no policy governs that field"*. Collapsing them would make
a typo look like a policy gap.

`FIELD_NOT_EDITABLE` (`409`) is raised by the enforcement helper (§7) and not by
either read endpoint, because reading a policy is always permitted.

---

## 7. Server-side enforcement helper

The read endpoints are for display. The **authoritative decision** is made by
`backend/src/modules/field-policies/field-policy.service.ts`, which later phases
call before accepting a proposed value (arch §11: the policy is re-read inside
the draft-update and submit transitions).

```ts
assertFieldEditable(recordType, fieldKey): Promise<FieldChangeDecision>
```

| Policy | Behaviour |
|---|---|
| `IMMUTABLE` | throws `FieldNotEditableError` — `409 FIELD_NOT_EDITABLE`, carrying the owning authority. |
| `CONDITIONALLY_EDITABLE` | returns, with `requiresEvidence` / `requiresReview` as the requirements the **caller** must then satisfy. |
| `EDITABLE` | returns, demanding nothing further. |
| no active policy | throws `FieldPolicyNotFoundError` — `404`. |

Two companions:

- `getFieldPolicy(recordType, fieldKey)` — the policy, or `404`.
- `resolveFieldChangeDecision(recordType, fieldKey)` — the non-throwing form,
  returning `null` for an ungoverned field. For callers that must *describe*
  several fields rather than refuse one: an impact preview cannot raise on the
  first immutable field it meets.

Phase 1 **establishes** the decision and does not act on it. `requiresEvidence`
and `requiresReview` are returned, not enforced, because there is no submission
in this phase to enforce them against — the phase that owns submission is the
one that must refuse an evidence-less request.

A missing policy is a **refusal, never a permissive default**. An ungoverned
field must not become correctable by having been forgotten in a seed; that would
make the safety of the feature depend on the completeness of its configuration.

---

## 8. Why the frontend cannot forge editability

Four independent reasons, any one of which would be sufficient:

1. **No input carries it.** Neither route accepts a body or a query parameter,
   and both param schemas are `.strict()`. A forged `editability` has nowhere to
   land — no parameter admits it and no handler reads one.
2. **No write route exists.** `POST`, `PUT`, `PATCH` and `DELETE` are not
   declared on the router, so they `404` at routing.
3. **The database refuses the browser.** `field_policies` carries one
   `for select ... to authenticated` policy and **no** INSERT/UPDATE/DELETE
   policy for any browser role. Writes reach the table only through a migration.
   `anon` has no policy at all.
4. **The decision is re-derived server-side.** Later phases call
   `assertFieldEditable`, which reads the table. The frontend's own list of
   editable fields is never consulted by anything that writes.

---

## 9. Related documents

- `docs/ARCHITECTURE/change-correction-service.md` — §11 field policy, §20.5
  record inventory, §25 Phase 1 boundary.
- `docs/DATABASE/field-policies.md` — schema, constraints, RLS and the seed.
- `docs/PHASES/feature.md` — Phase 1 objective and acceptance.
