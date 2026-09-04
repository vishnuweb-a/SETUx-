# Fake DigiLocker

Simulated external government system for the SetuX SIH prototype.

## What this represents

A document repository standing in for DigiLocker: returning citizen document
metadata and contents on consent.

## Status

**Implemented in Phase 8**, as an in-process connector rather than a separate
server:

```text
backend/src/connectors/
├── connector.types.ts                        the GovernmentDataConnector contract
├── connector.registry.ts                     data_sources.code → connector
└── fake-digilocker/
    ├── fake-digilocker.connector.ts          the adapter + response mapper
    └── fake-digilocker.fixtures.ts           the synthetic documents
```

`docs/INTEGRATIONS/government-connector.md` §9 offers two options — a separate
mock HTTP server, or a mock provider module — and recommends the module for the
MVP. Phase 8 takes that option. The connector boundary is real and the provider
sits behind it, so a real integration can replace this module without the
retrieval service changing; nothing is gained for the prototype by paying for a
second process and a network hop.

## Important

This is a **simulation**. It is not connected to any real government system and
contains no real citizen data.

- It makes **no network call of any kind**. There is no HTTP client, no base
  URL, and no credential anywhere in the module.
- All data is **synthetic fixture data**. Identifiers are prefixed `SYNTH-`,
  account numbers are masked, and issuers are named "(Simulated)", so a value
  that reaches a screenshot or a log is self-evidently fake.
- Nothing here resembles a real Aadhaar, PAN or passport number.

## What it serves

Keyed by `service_requirements.requirement_code`, so the set of documents this
provider can return is bounded by what the database actually asks for:

| Requirement code | Document |
| --- | --- |
| `BANK_DETAILS` | Bank account proof |
| `COMMUNITY_RECORD` | Community certificate |

A requirement outside this set is refused with `UNSUPPORTED_REQUIREMENT` rather
than answered with a plausible-looking invention.

## Failure simulation

The connector takes a behaviour at construction:

```ts
new FakeDigiLockerConnector(FAKE_DIGILOCKER_BEHAVIOUR.ALWAYS_FAIL)
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
FakeDigiLockerConnector          ← swapped for a real adapter later
       ↓
Synthetic fixture documents
```

Consent is enforced by the retrieval service *before* this connector is
constructed or called. The connector itself performs no authorization, and is
never reached without a GRANTED consent — see `docs/API/retrievals.md` §4.
