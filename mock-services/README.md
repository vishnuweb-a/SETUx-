# SetuX Mock Services

Simulated external government systems used to demonstrate interoperability
without depending on real government infrastructure.

```text
SetuX Backend
     ↓
Connector interface
     ↓
┌──────────────┬───────────────┬────────────────┬─────────────┐
│ Fake         │ Fake          │ Fake           │ Fake        │
│ DigiLocker   │ Identity      │ Education      │ Income      │
└──────────────┴───────────────┴────────────────┴─────────────┘
```

| Service | Represents | Implemented in |
| --- | --- | --- |
| [`fake-digilocker/`](./fake-digilocker) | Document repository | Phase 8 — **implemented**, as `backend/src/connectors/fake-digilocker/` |
| [`fake-identity/`](./fake-identity) | Identity registry | Phase 9 — **implemented**, as `backend/src/connectors/fake-identity/` |
| [`fake-education/`](./fake-education) | Academic records | Phase 9 — **implemented**, as `backend/src/connectors/fake-education/` |
| [`fake-income/`](./fake-income) | Income records | Phase 9 — **implemented**, as `backend/src/connectors/fake-income/` |

Each connector serves the requirement codes the database routes to its source:

| Source code (`data_sources.code`) | Connector | Requirement codes |
| --- | --- | --- |
| `DIGILOCKER_MOCK` | `FakeDigiLockerConnector` | `BANK_DETAILS`, `COMMUNITY_RECORD` |
| `MOCK_IDENTITY_API` | `FakeIdentityConnector` | `IDENTITY` |
| `MOCK_EDUCATION_API` | `FakeEducationConnector` | `EDUCATION_RECORD` |
| `MOCK_INCOME_API` | `FakeIncomeConnector` | `INCOME_RECORD` |

## Rules

- These services are **simulated**. No real government API is called.
- All data must be **synthetic**. Never place real citizen data here.
- Business modules depend on the **connector interface**, never on a mock
  directly, so a mock can later be swapped for a real provider.
- Each connector normalizes its provider-specific response into a SetuX
  domain model.

- No mock makes a **network call of any kind**. There is no HTTP client, no
  base URL and no credential in any of these modules, so the demo can run with
  nothing external to depend on or leak to.
- Every mock is **deterministic**: the same request always yields the same
  result. Failure is a construction-time behaviour, never reachable from a
  request body.
- A **retrieval is not a verification**. A mock reports what the simulated
  system holds; deciding what that means for an application is Phase 10.

All four providers are in-process connector modules behind the connector
interface, which `government-connector.md` §9 recommends for the MVP over a
separate mock server. Phase 8 established the pattern with DigiLocker; Phase 9
added the other three by registering them against their `data_sources.code`,
without changing the retrieval service.
