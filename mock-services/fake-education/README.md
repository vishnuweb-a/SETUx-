# Fake Education System

Simulated external government system for the SetuX SIH prototype.

## What this represents

A board/university records system: returning a citizen's academic records and enrolment status for eligibility checks.

## Status

**Implemented in Phase 9**, as an in-process connector rather than a separate
server:

```text
backend/src/connectors/
├── connector.types.ts                       the GovernmentDataConnector contract
├── connector.registry.ts                    data_sources.code → connector
├── connector.normalize.ts                   the shared provider → SetuX mapper
├── connector.simulation.ts                  shared behaviour + synthetic references
└── fake-education/
    ├── fake-education.connector.ts          the adapter
    └── fake-education.fixtures.ts           the synthetic records
```

`docs/INTEGRATIONS/government-connector.md` §9 offers two options — a separate
mock HTTP server, or a mock provider module — and recommends the module for the
MVP. Phase 8 took that option for DigiLocker and Phase 9 follows it here, so all
four simulated systems sit behind one boundary in one shape.

## Important

This is a **simulation**. It is not connected to any real government system and
contains no real citizen data.

- It makes **no network call of any kind**. There is no HTTP client, no base
  URL, and no credential anywhere in the module.
- All data is **synthetic fixture data**. The enrolment number is prefixed
  `SYNTH-`, and the board and institution are named "(Simulated)" or "Demo", so
  a value that reaches a screenshot or a log is self-evidently fake.
- No real board, university, roll number or student appears anywhere.
- An aggregate percentage is returned rather than a subject-by-subject mark
  sheet: the scholarship's eligibility rule needs the aggregate, and the
  individual marks are more personal data than the demonstration requires.

## What it serves

Keyed by `service_requirements.requirement_code`, so the set of records this
provider can return is bounded by what the database actually asks for:

| Requirement code | Record |
| --- | --- |
| `EDUCATION_RECORD` | Education record (result + enrolment) |

`MOCK_EDUCATION_API` is named by this one requirement code, although six seeded
requirements use it under service-specific names — "Class 12 Result",
"Enrolment Record", "School Enrolment", "Postgraduate Record". The provider
answers the code; the citizen sees the service's own label, which
`service_requirements.name` already supplies. A requirement outside this set is
refused with `UNSUPPORTED_REQUIREMENT` rather than answered with a
plausible-looking invention.

## Normalization

Provider vocabulary never escapes the connector. An attribute with no mapping is
dropped rather than passed through under its provider name:

| Provider attribute | SetuX field key |
| --- | --- |
| `enrol_no` | `educationEnrolmentNumber` |
| `student_name` | `educationStudentName` |
| `inst_name` | `educationInstitution` |
| `programme` | `educationProgramme` |
| `exam_board` | `educationBoard` |
| `result_year` | `educationResultYear` |
| `aggregate_pct` | `educationAggregatePercentage` |
| `enrol_status` | `educationEnrolmentStatus` |

## Retrieved is not verified

The connector returns the record. It does **not** decide whether the aggregate
clears the scholarship's threshold — that is an eligibility judgement, and it
belongs to Phase 10 (`government-connector.md` §6). Retrieved values are stored
with `verification_status = PENDING`.

## Failure simulation

The connector takes a behaviour at construction:

```ts
new FakeEducationConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL)
```

This is deliberately **not** reachable from a request body. There is no
`forceFailure` flag a client could set — production code has no path that lets a
caller ask the provider to fail.

## Boundary

SetuX business modules never depend on this module directly. They depend on the
connector interface, which this provider sits behind:

```text
Retrieval Service
       ↓
GovernmentDataConnector          ← business code depends on this
       ↓
FakeEducationConnector           ← swapped for a real adapter later
       ↓
Synthetic fixture records
```

Consent is enforced by the retrieval service *before* this connector is
constructed or called. The connector itself performs no authorization, and is
never reached without a GRANTED consent for `MOCK_EDUCATION_API` specifically —
a grant for another source does not authorize it. See `docs/API/retrievals.md`
§4.
