# Fake Identity System

Simulated external government system for the SetuX SIH prototype.

## What this represents

A government identity registry standing in for a national identity provider: confirming that a citizen's identity attributes match an authoritative record.

## Status

**Implemented in Phase 9**, as an in-process connector rather than a separate
server:

```text
backend/src/connectors/
├── connector.types.ts                      the GovernmentDataConnector contract
├── connector.registry.ts                   data_sources.code → connector
├── connector.normalize.ts                  the shared provider → SetuX mapper
├── connector.simulation.ts                 shared behaviour + synthetic references
└── fake-identity/
    ├── fake-identity.connector.ts          the adapter
    └── fake-identity.fixtures.ts           the synthetic records
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
- All data is **synthetic fixture data**. The registry reference is prefixed
  `SYNTH-` and the issuer is named "(Simulated)", so a value that reaches a
  screenshot or a log is self-evidently fake.
- Nothing here resembles a real Aadhaar, PAN or passport number. The registry
  reference is deliberately shaped *unlike* a real identity number, and no real
  identity number is ever returned or stored.
- Only a year of birth is returned, not a full date: an identity confirmation
  does not need more.

## What it serves

Keyed by `service_requirements.requirement_code`, so the set of records this
provider can return is bounded by what the database actually asks for:

| Requirement code | Record |
| --- | --- |
| `IDENTITY` | Identity confirmation |

`MOCK_IDENTITY_API` is named by this one requirement code, used by all seven
seeded scholarship services. A requirement outside this set is refused with
`UNSUPPORTED_REQUIREMENT` rather than answered with a plausible-looking
invention.

## Normalization

Provider vocabulary never escapes the connector. An attribute with no mapping is
dropped rather than passed through under its provider name:

| Provider attribute | SetuX field key |
| --- | --- |
| `reg_ref` | `identityRegistryReference` |
| `holder_name` | `identityHolderName` |
| `birth_year` | `identityBirthYear` |
| `match_result` | `identityMatch` |
| `reg_status` | `identityRecordStatus` |

## Retrieved is not verified

`identityMatch: MATCHED` is what the simulated registry *reports*. It is stored
as ordinary retrieved data with `verification_status = PENDING`. It is **not** a
verification, and this connector never creates one — deciding what a match means
for an application belongs to Phase 10 (`government-connector.md` §6).

## Failure simulation

The connector takes a behaviour at construction:

```ts
new FakeIdentityConnector(CONNECTOR_BEHAVIOUR.ALWAYS_FAIL)
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
FakeIdentityConnector            ← swapped for a real adapter later
       ↓
Synthetic fixture records
```

Consent is enforced by the retrieval service *before* this connector is
constructed or called. The connector itself performs no authorization, and is
never reached without a GRANTED consent for `MOCK_IDENTITY_API` specifically —
a grant for another source does not authorize it. See `docs/API/retrievals.md`
§4.
