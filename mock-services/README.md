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
| [`fake-identity/`](./fake-identity) | Identity registry | Phase 9 |
| [`fake-education/`](./fake-education) | Academic records | Phase 9 |
| [`fake-income/`](./fake-income) | Income records | Phase 9 |

## Rules

- These services are **simulated**. No real government API is called.
- All data must be **synthetic**. Never place real citizen data here.
- Business modules depend on the **connector interface**, never on a mock
  directly, so a mock can later be swapped for a real provider.
- Each connector normalizes its provider-specific response into a SetuX
  domain model.

Phase 8 implements the DigiLocker provider as an in-process connector module
behind the connector interface, which `government-connector.md` §9 recommends
for the MVP over a separate mock server. The remaining three are Phase 9.
