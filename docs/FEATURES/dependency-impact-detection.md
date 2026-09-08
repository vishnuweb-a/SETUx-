# Dependency & Impact Detection — Phase 5

Status: **COMPLETE (2026-09-08).**

Source documents: `docs/ARCHITECTURE/change-correction-service.md` §4.3, §12, §14,
§20.6, §22, §23; `docs/PHASES/feature.md` — Change & Correction Phase 5.

Builds on Phase 4 (`docs/FEATURES/change-draft-editable-form.md`) and reads the
Phase 1 policy set (`docs/DATABASE/field-policies.md`) and the Phase 2 registry
(`docs/DATABASE/citizen-records.md`). Nothing in Phase 1–4 changed.

---

## 1. What this phase does, and what it deliberately does not

Given a citizen's saved DRAFT correction request, Phase 5 answers one question:

> Which of this citizen's **other** records hold the same fact, and would
> therefore be left disagreeing with the source once this correction is made?

It answers it and stops. Phase 5 is **read-only analysis**.

| In scope | Out of scope (Phase 6+) |
| --- | --- |
| Dependency rules as configuration | Target selection (checkboxes) |
| Impact classification and merging | Pre-selected REQUIRED targets |
| Availability of each target for this citizen | Consent screen / consent bundle |
| A read-only impact preview screen | `change_targets` persistence |
| | Department routing, officer queue |
| | Review, approval, rejection |
| | Connector update, bank step-up |
| | Notifications, parent aggregation, APPLIED |

**Nothing is written.** No target row, no consent, no status transition, no
government record. The draft is byte-identical before and after an impact
request — including its `updated_at`, which the endpoint deliberately does not
touch. The impact repository contains no insert, update, upsert or delete
statement of any kind.

---

## 2. The dependency rule model

`public.change_dependency_rules` — configuration, in the same sense
`field_policies` is. A rule holds no citizen id, no change request and no
proposed value: it is a statement about **kinds** of records, knowable before any
citizen exists.

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `source_record_type` | text — the record being corrected |
| `source_field_key` | text — the field whose change triggers the rule |
| `target_record_type` | text — the record type affected. A TYPE, never a record id |
| `target_field_key` | text — the field of the target holding the same fact |
| `impact_level` | `public.change_impact_level` — REQUIRED / RECOMMENDED / OPTIONAL |
| `responsible_department_id` | → `departments(id)` restrict, **nullable** |
| `reason` | text NOT NULL — citizen-facing, rendered verbatim |
| `active` | boolean — only active rules are evaluated |
| `created_at` / `updated_at` | timestamptz |

### Naming: one deliberate deviation from arch §4.3

Arch §4.3 drafted `source_document_type` / `source_field` / `dependency_type`.
This table uses `source_record_type`, `source_field_key`, `target_record_type`,
`target_field_key` and `impact_level` — the same substitution Phase 1 made, for
the same reason: `record_type` and `field_key` are the vocabulary in
`field_policies`, `citizen_records`, `citizen_record_fields` and
`change_request_fields`, and a rule table spelling them differently would need
translation at every join. `impact_level` rather than `dependency_type` because
the column grades **strength**, which is what the merge rule, the API and the
badge all speak of.

### Why an enum for the level, and TEXT for the record types

Opposite choices, deliberately. `record_type` stays TEXT because the set of
record types **grows** with the connectors SetuX federates — a sixth type must be
a seed change, not an `ALTER TYPE`. The impact vocabulary does **not** grow:
three levels are the product's whole classification, the merge is a total order
over exactly those three, and each has a badge and a sentence explaining it to a
citizen. A fourth would be a product decision, so the enum makes it a schema
change.

### Invariants enforced in the database

| Invariant | Mechanism |
| --- | --- |
| One rule per source-field → target-field | `unique (source_record_type, source_field_key, target_record_type, target_field_key)` — `active` deliberately excluded, so two live answers are impossible |
| No self-dependency | `check (source_record_type <> target_record_type)` |
| Well-formed record types and field keys | Four format CHECKs, identical to the rest of the service |
| Every rule can explain itself | `reason` NOT NULL, not blank, ≤ 400 chars |
| Only three levels exist | the `change_impact_level` enum |
| Every rule names a real policy, and a firable source | migration-time `DO` block: fails the migration if any rule names a missing `field_policies` row, an IMMUTABLE source, or a departmental rule that resolved no department |

`active` is a flag, never a delete: a preview that stops listing a record leaves
an auditable trace of why.

---

## 3. Seeded rules

The canonical name-change scenario (arch §23), plus the one address rule the
seeded policy set supports.

| Source | Target | Level | Responsible |
| --- | --- | --- | --- |
| `IDENTITY_RECORD.identityHolderName` | `INCOME_RECORD.incomeCertificateHolder` | **REQUIRED** | Revenue Department |
| `IDENTITY_RECORD.identityHolderName` | `EDUCATION_RECORD.educationStudentName` | RECOMMENDED | Higher Education |
| `IDENTITY_RECORD.identityHolderName` | `COMMUNITY_RECORD.communityCertificateHolder` | RECOMMENDED | Minority Affairs |
| `IDENTITY_RECORD.identityHolderName` | `BANK_DETAILS.bankAccountHolder` | OPTIONAL | *(none — provider)* |
| `IDENTITY_RECORD.identityAddress` | `INCOME_RECORD.incomeAddress` | RECOMMENDED | Revenue Department |

Every target field above is a real seeded `field_policies` row carrying
`dependency_group = 'LEGAL_NAME'` or `'ADDRESS'`. The rules are that group made
**explicit and directional**: a dependency group says "these fields hold the same
fact", which is symmetric and carries no strength; a rule says "changing THIS one
affects THAT one, this much".

**Why the levels are what they are.** The income certificate is the document the
scholarship flow actually reads, so a holder-name mismatch there fails
verification — not a soft choice. Education and community mismatches surface at
the next use rather than blocking anything today. The bank is not a government
system: SetuX can offer to pass a correction on, but cannot describe updating a
private provider's record as an obligation of government (arch §8.1).

**What is deliberately not seeded.** `identityMobile` is the only field in the
`CONTACT` group and `identityBirthYear` is the only date of birth — no other
seeded record holds either, so a rule to a record type that does not hold the
field would be a fabricated government dependency. A mobile-number correction
correctly produces an **empty** impact list. Income bands, marks and community
categories are IMMUTABLE and so can never be a rule's source.

No rule asserts a law, statute or real government process.

---

## 4. Merge semantics

Several rules can reach one target — a name change and an address change both
touch the income certificate. The engine returns **one entry per target record
type**, always.

Deduplication is **structural**: the accumulator is keyed on the target record
type, so a duplicate cannot be built and then filtered.

**Strength ordering, and the merged level:**

```
REQUIRED (2)  >  RECOMMENDED (1)  >  OPTIONAL (0)
```

The merged level is the **strongest** of the contributing rules.
`OPTIONAL + REQUIRED → REQUIRED`, never the reverse and never last-write-wins.
Under-stating a consequence is the failure that matters: a citizen told a
correction is optional when a rule calls it required has the wrong basis for a
decision.

`strongerImpactLevel` is **commutative and idempotent**, so the answer does not
depend on the order rules come back from the database.

**Reasons are all kept.** A merged target genuinely has more than one cause, and
collapsing them would drop a true statement or invent a combined one no rule
makes. Each reason names the field it came from, and reasons are sorted
strongest-first then by field key — a total order, so equal-strength reasons
always appear the same way round.

The impact list itself is sorted strongest-first, then by record type.
Availability is deliberately **not** part of the sort: an unavailable REQUIRED
target is the most important thing on the page.

**Cycles are impossible.** Expansion is strictly **single-hop**:
`identityHolderName → INCOME_RECORD.incomeCertificateHolder` does not then expand
that field's own rules. Depth is bounded at one by construction, not by a
visited-set guard, and the no-self-dependency CHECK closes the degenerate case.

---

## 5. Available vs unavailable targets

A rule says a record **type** is affected. Whether this citizen **holds** such a
record is a separate fact, answered from their own registry, scoped by
`citizen_id`.

- `available: true`, `recordId: "<uuid>"` — the citizen holds one.
- `available: false`, `recordId: null` — a rule fired, but they hold no such
  record.

Unavailable targets are **returned, not dropped**. "This change cannot reach your
bank details" is information the citizen needs, and omitting it would imply the
correction reaches everywhere it should. The UI states it in words rather than
by dimming the card — an unavailable REQUIRED target must not be buried.

Where a citizen holds two records of one type from two sources (permitted by
`citizen_records`' unique key), the oldest wins, deterministically.

---

## 6. API

```
GET /api/v1/change-requests/drafts/:changeRequestId/impact
```

Mounted on the existing change-requests router as a **sub-resource of the draft
it describes** — impact is a computed property of a draft, not a resource of its
own, and it must be governed by exactly the same gate.

**GET, not POST**, because every property that distinguishes them applies: it is
genuinely safe (nothing behind it writes), idempotent and deterministic, and it
takes no input beyond the resource it addresses. A POST would tell every reader
and every intermediary that calling it does something.

**Request.** No body. No query parameters (`noQuerySchema` rejects all). The path
id is validated as a UUID at the edge, so a malformed id is a 400 before any
query runs.

**What a client may NOT supply** — there is no parameter for any of it: source
record type, source field keys, editability, target record types, impact levels,
reasons, citizen id.

**Response** (200):

```json
{
  "success": true,
  "data": {
    "changeRequestId": "…",
    "sourceRecord": { "recordId": "…", "recordType": "IDENTITY_RECORD" },
    "changedFields": [
      { "fieldKey": "identityHolderName",
        "oldValue": "Demo Old Name",
        "proposedValue": "Demo New Name" }
    ],
    "impacts": [
      { "recordType": "INCOME_RECORD",
        "recordId": "…",
        "available": true,
        "impactLevel": "REQUIRED",
        "reasons": [
          { "fieldKey": "identityHolderName",
            "impactLevel": "REQUIRED",
            "reason": "Your income certificate is issued in the same name. …" }
        ],
        "responsibleDepartment": { "code": "REVENUE_DEPT", "name": "Revenue Department" } }
    ]
  }
}
```

`oldValue` is the stored **snapshot**, not a re-read of the source — the preview
describes the same before/after pair the citizen saw on the form.

Absent from the response, deliberately: no status, no target id, no consent, no
`selected` field. A field the UI could bind a checkbox to would be a promise the
backend does not keep.

**Errors** follow the existing envelope:

| Situation | Answer |
| --- | --- |
| Malformed id | 400 `VALIDATION_ERROR` |
| Unexpected query parameter | 400 `VALIDATION_ERROR` |
| No draft of yours with that id | 404 `RESOURCE_NOT_FOUND` |
| Another citizen's draft | **404, identical** — concealed |
| Officer | 403 |
| Anonymous | 401 |
| Citizen without completed onboarding | 403 `CHANGE_REQUEST_ONBOARDING_REQUIRED` |
| Nothing affected | **200** with `impacts: []` — an answer, not a missing resource |

---

## 7. Module layout

```
backend/src/modules/change-impact/
├── change-impact.controller.ts   HTTP: read input, call service, choose status
├── change-impact.repository.ts   two READS; no write statement exists
├── change-impact.service.ts      the engine: gate, load, expand, merge, resolve
├── change-impact.types.ts        contracts + the merge rule
└── index.ts
```

Route → controller → service → repository, per AGENT.md §7. No business logic in
the route or the controller; the dependency logic lives in the service and the
rules in the database, never in a controller or a React component.

Order of operations in `getChangeImpact`, which **is** the authorization model:

1. Role and onboarding, re-asserted in the service (arch §1.1: gating happens
   twice).
2. The draft is loaded **by id AND owner** — another citizen's is not found.
3. The source record is loaded by id AND owner; its type is re-derived from it.
4. Rules are read from configuration, for that type and the fields the **stored
   draft** holds.
5. Target availability is resolved from the **caller's own** registry.

The only record ids that can appear in a response came from a query predicated on
the caller's id.

---

## 8. Frontend

```
frontend/src/features/change-details/
├── components/impact-level-badge.tsx    icon + word, never colour alone
├── components/impact-record-card.tsx    one affected record; NO control
├── hooks/use-change-impact.ts           useQuery, keyed by draft id
├── pages/change-impact-page.tsx         the preview screen
├── services/change-impact-service.ts    ONE function: fetchChangeImpact
├── types/change-impact.types.ts
└── utils/change-impact-presentation.ts  labels and level descriptions
```

Route: `/citizen/change-details/drafts/:changeRequestId/impact`, reached from the
saved draft via "Check affected records". Keyed by the **draft's** id, so the
screen is refresh-safe and a direct URL rebuilds the same analysis.

**The frontend decides nothing.** Levels, reasons, availability and ordering are
the server's conclusions, rendered as given. The page does not compute a level,
merge rules, infer availability or re-sort the list — a client that did any of
those would be a second, unauthoritative impact engine, and the one a user could
edit.

**No selection controls.** `ImpactRecordCard` is a plain `<li>` taking no
`onSelect`, `checked` or `disabled` prop — there is no prop through which
selection could be threaded in without rewriting the file.

States handled: loading, empty impact, API error (with retry), missing draft
(404, worded so it does not hint the draft is someone else's), a draft with no
changed fields, unavailable target, merged multi-reason target, and the populated
list.

The empty state reads *"No other linked records were detected for this change"* —
deliberately what SetuX **found**, never a claim that government systems are
synchronised. This is a prototype over synthetic records.

---

## 9. Security

| Property | How |
| --- | --- |
| Authenticated | `requireAuth` on the router, before every route |
| CITIZEN only | `requireRole(CITIZEN)` + re-asserted in the service |
| Completed onboarding | asserted in the service |
| Owner-scoped | `citizen_id` in the query predicate, never a post-hoc check |
| Cross-citizen draft | concealed 404, identical to a non-existent id |
| Officers | no access — their authority arises from a change target, which does not exist yet |
| Anonymous | 401 |
| No frontend trust | no request parameter carries an impact level, target or reason |
| No mutation | every mutating verb on the path is refused; no write statement exists |
| No rule authoring from a browser | RLS grants SELECT on active rules to `authenticated`; **no** INSERT/UPDATE/DELETE policy for any role |
| No service-role exposure | rules reach the table through migrations and the service role only |
| No sensitive logging | reasons are configuration text about record types; no citizen value is logged |

RLS on `change_dependency_rules` takes the reference-data posture of
`field_policies`: `anon` gets nothing, `authenticated` may read active rules, and
nobody may write. The read is **not** how impact is decided — the backend
re-reads server-side and takes its own answer.

---

## 10. Verification

- **Backend unit** — `backend/tests/unit/change-impact-service.test.ts` (21):
  merge commutativity, strongest-wins, structural dedup, availability from the
  registry only, ownership, officer/onboarding refusals, empty and unsupported
  cases, and that no mocked repository exposes a write function.
- **Backend integration** — `backend/tests/integration/change-impact.test.ts`
  (20): the canonical scenario end-to-end through the real middleware chain,
  concealed 404, 401/403, malformed id, rejected query parameter, every mutating
  verb refused, and no Phase 6 vocabulary in the response.
- **Database** — `backend/tests/database/change-dependency-queries.test.ts` (26),
  against the real project: enum, constraints, duplicate prevention,
  self-dependency refusal, the seeded rules and their levels, department routing
  (and the bank's deliberate absence), policy correspondence, deterministic
  ordering, and RLS for anon and a real signed-in citizen.
- **Frontend** — `frontend/tests/features/change-details/change-impact-page.test.tsx`
  (24): all four badges, one card per record, server order preserved, no
  checkbox/radio/switch, no consent or submit control, one network call, and
  every UI state.
- **Browser acceptance** — the canonical `Demo Old Name → Demo New Name` flow as
  `citizen@setux.test`: four cards at REQUIRED / RECOMMENDED / RECOMMENDED /
  OPTIONAL, one per target, zero checkboxes, one GET impact call and no other
  API traffic, zero console errors and zero React warnings.
- **Immutability, verified live** — all five source field values and their
  `updated_at` timestamps identical before and after the flow; the draft still
  `DRAFT` with `updated_at == created_at`.
- **Responsive** — 1440×900, 768×1024, 390×844, 360×800: no horizontal overflow,
  no clipped cards, all badges in view, reasons wrap, navigation usable.

---

## 11. Phase 6 boundary

Phase 6 (Impact Preview & Target Selection) adds what this phase deliberately
withheld: checkboxes with REQUIRED pre-selected and non-deselectable,
`change_targets` persistence, and the consent bundle that follows. Everything in
this document is the input to that phase; none of it is changed by it.
