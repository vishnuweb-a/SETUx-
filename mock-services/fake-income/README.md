# Fake Income System

Simulated external government system for the SetuX SIH prototype.

## What this represents

A revenue/income certificate system: returning declared income band data used for means-tested scholarship eligibility.

## Status

**Implemented in Phase 9**, as an in-process connector rather than a separate
server:

```text
backend/src/connectors/
├── connector.types.ts                    the GovernmentDataConnector contract
├── connector.registry.ts                 data_sources.code → connector
├── connector.normalize.ts                the shared provider → SetuX mapper
├── connector.simulation.ts               shared behaviour + synthetic references
└── fake-income/
    ├── fake-income.connector.ts          the adapter
    └── fake-income.fixtures.ts           the synthetic records
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
- All data is **synthetic fixture data**. The certificate number is prefixed
  `SYNTH-` and the issuer is named "(Simulated)", so a value that reaches a
  screenshot or a log is self-evidently fake.
- No real PAN, income tax record or household appears anywhere.
- A **band** is returned rather than an exact figure. A means test needs to know
  which side of the threshold a household falls on, not its precise income, and
  the band is the less sensitive of the two (`government-connector.md` §13).

## What it serves

Keyed by `service_requirements.requirement_code`, so the set of records this
provider can return is bounded by what the database actually asks for:

| Requirement code | Record |
| --- | --- |
| `INCOME_RECORD` | Income certificate |

`MOCK_INCOME_API` is named by this one requirement code, used by five seeded
scholarship services. A requirement outside this set is refused with
`UNSUPPORTED_REQUIREMENT` rather than answered with a plausible-looking
invention.

## Normalization

Provider vocabulary never escapes the connector. An attribute with no mapping is
dropped rather than passed through under its provider name:

| Provider attribute | SetuX field key |
| --- | --- |
| `cert_no` | `incomeCertificateNumber` |
| `holder_name` | `incomeCertificateHolder` |
| `assess_year` | `incomeAssessmentYear` |
| `income_band` | `incomeBand` |
| `issuing_office` | `incomeIssuingOffice` |
| `valid_until` | `incomeValidUntil` |

## Retrieved is not verified

`incomeBand: BELOW_THRESHOLD` is what the simulated department *reports*. It is
stored as ordinary retrieved data with `verification_status = PENDING`. The
connector does not decide whether the citizen qualifies — "the connector itself
should not decide scholarship approval" (`government-connector.md` §13); that is
Phase 10's judgement.

## Failure simulation

The connector takes a behaviour at construction:

```ts
new FakeIncomeConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL)
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
FakeIncomeConnector              ← swapped for a real adapter later
       ↓
Synthetic fixture records
```

Consent is enforced by the retrieval service *before* this connector is
constructed or called. The connector itself performs no authorization, and is
never reached without a GRANTED consent for `MOCK_INCOME_API` specifically — a
grant for another source does not authorize it. See `docs/API/retrievals.md` §4.
