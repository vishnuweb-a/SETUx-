SetuX — DigiLocker Integration

Version: 1.0
Project: SetuX SIH MVP
Integration Type: Dummy / Simulated DigiLocker Integration
Purpose: Scholarship document verification
Backend: Supabase + SetuX API
Architecture: Modular Monolith

Phase 8 implementation profile (2026-09-04)

This document is the approved design for the DigiLocker integration as a whole.
Phase 8 implements the RETRIEVAL half of it. Read this profile first: where the
design below describes verification, identity matching or workflow advancement,
that is Phase 9/10 and is NOT implemented.

Implemented in Phase 8:

  - the connector interface (`GovernmentDataConnector`)
  - the fake DigiLocker adapter and its response mapper
  - synthetic fixture documents
  - the connector registry, keyed on `data_sources.code`
  - consent enforcement before any provider call
  - credential retrieval and normalization
  - persistence of retrieval metadata and normalized values
  - deterministic failure simulation and retry
  - audit events

NOT implemented in Phase 8 (deferred to Phase 9/10):

  - credential *verification* and its state machine (§17, §18)
  - identity matching (§16) — MATCH / MISMATCH / UNVERIFIABLE
  - the `verifications` table; it stays empty
  - workflow advancement; `applications.status` does not move
  - officer and admin views (§31, §33)
  - the education/identity/income connectors (§19)
  - automatic retry with a retry budget (§24) — Phase 8 retry is
    citizen-initiated, one attempt per action

Two deliberate departures from the design below:

  - §20 proposes provider-named routes (`/education/authorize`,
    `/education/credentials`). Phase 8 exposes resource-oriented routes instead —
    `GET|POST /api/v1/applications/:id/retrievals` — so the client never names a
    provider and the URL does not bake in today's single connector. The
    principle §20 states, that the public API must not leak mock-provider
    endpoints, is preserved.
  - §21's separate mock HTTP service is implemented as an in-process module,
    which `government-connector.md` §9 recommends for the MVP.

The authoritative Phase 8 contract is `docs/API/retrievals.md`.

--------------------------------------------------------------------------------

1. Purpose

This document defines how SetuX will integrate with a dummy DigiLocker-like provider for the SIH prototype.

The objective is not to build DigiLocker or reproduce its internal infrastructure.

SetuX will demonstrate how an interoperability layer can:

Citizen
   ↓
SetuX
   ↓
Consent
   ↓
DigiLocker-like Provider
   ↓
Credential Retrieval
   ↓
Normalization
   ↓
Scholarship Workflow

The real DigiLocker platform can be considered an external document/credential source. For the SIH prototype, the provider will be simulated so the team can demonstrate the complete integration flow without depending on production government credentials or live external infrastructure.

2. Why DigiLocker Is Used

SetuX should not duplicate document-storage functionality that an existing government platform already provides.

The architectural responsibility is:

DigiLocker
    ↓
Stores / exposes credentials

while:

SetuX
    ↓
Requests authorized access
    ↓
Uses credential for scholarship verification
    ↓
Continues workflow

Therefore:

SetuX is an interoperability and workflow layer, not a replacement for DigiLocker.

3. MVP Scope

The dummy integration will demonstrate:

Citizen consent

Credential discovery

Credential selection

Credential retrieval

Credential validation

Data normalization

Verification result

Workflow continuation

External API failure

Retry

Audit logging

The integration should support at least one scholarship-relevant education credential.

Example:

Education Credential
        │
        ├── Student Name
        ├── Institution
        ├── Course / Qualification
        ├── Year
        └── Credential Status

4. What Is Dummy vs Real

Component

MVP

SetuX frontend

Real

SetuX backend

Real

Supabase database

Real

Authentication

Real

Consent management

Real

Workflow engine

Real

DigiLocker connector interface

Real

DigiLocker adapter implementation

Real

External DigiLocker provider

Dummy

Credential records

Dummy

External OAuth/authorization

Simulated

Government credential registry

Dummy

The important demonstration is:

The SetuX integration architecture is real; the external provider is simulated.

5. High-Level Architecture

                     ┌──────────────────┐
                     │     CITIZEN      │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   SetuX Web UI   │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   SetuX API      │
                     └────────┬─────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
           Application      Consent      Workflow
             Module         Module        Engine
                │             │             │
                │             │             ▼
                │             │       Education Connector
                │             │             │
                │             │             ▼
                │             │      DigiLocker Adapter
                │             │             │
                │             │             ▼
                │             │      Dummy Provider
                │             │             │
                └─────────────┴─────────────┘
                              │
                              ▼
                       Supabase/Postgres

6. Integration Boundary

The workflow engine must not directly know how DigiLocker works.

Incorrect:

Workflow Engine
      ↓
DigiLocker HTTP API

Correct:

Workflow Engine
      ↓
EducationCredentialProvider
      ↓
DigiLockerAdapter
      ↓
Dummy DigiLocker Provider

This abstraction makes it possible to replace:

Dummy Provider

with:

Real DigiLocker Integration

later without rewriting the scholarship workflow.

7. Provider Interface

Conceptual TypeScript interface:

interface EducationCredentialProvider {
  createAuthorizationRequest(
    input: AuthorizationRequest
  ): Promise<AuthorizationResponse>;

  listCredentials(
    input: CredentialListRequest
  ): Promise<CredentialListResponse>;

  getCredential(
    input: CredentialRequest
  ): Promise<CredentialResponse>;

  verifyCredential(
    input: CredentialVerificationRequest
  ): Promise<CredentialVerificationResponse>;
}

The scholarship workflow should depend on this interface, not on a specific provider.

8. Dummy DigiLocker Adapter

Recommended structure:

src/
└── modules/
    └── integrations/
        └── digilocker/
            ├── digilocker.interface.ts
            ├── digilocker.adapter.ts
            ├── digilocker.mapper.ts
            ├── digilocker.types.ts
            └── digilocker.mock.ts

Responsibilities:

digilocker.interface.ts

Defines the provider contract.

digilocker.adapter.ts

Implements the integration behavior.

digilocker.mapper.ts

Converts provider data into SetuX canonical data.

digilocker.mock.ts

Simulates external DigiLocker responses.

digilocker.types.ts

Contains request/response types.

9. End-to-End Flow

Citizen starts scholarship
          │
          ▼
SetuX creates application
          │
          ▼
Scholarship requires education credential
          │
          ▼
Consent requested
          │
          ▼
Citizen allows access
          │
          ▼
SetuX creates credential-access request
          │
          ▼
Dummy DigiLocker Provider
          │
          ▼
Credential list returned
          │
          ▼
Citizen / workflow selects credential
          │
          ▼
Credential retrieved
          │
          ▼
SetuX validates response
          │
          ▼
Mapper converts data
          │
          ▼
Canonical Education Credential
          │
          ▼
Education Verification = VERIFIED
          │
          ▼
Scholarship workflow continues

10. Step 1 — Consent

Before requesting education data:

SetuX
  ↓
Consent Request
  ↓
Citizen

Example:

Education Credential Access

SetuX wants to access your education
credential for scholarship verification.

Purpose:
Scholarship application verification

Data:
Education credential

[ Deny ]       [ Allow Access ]

No credential request should be made before the required consent is recorded.

11. Step 2 — Authorization Request

After consent:

Citizen Consent
      ↓
Education Connector
      ↓
DigiLocker Adapter
      ↓
Dummy Provider

Example internal request:

{
  "applicationId": "STX-APP-001",
  "citizenId": "CIT-001",
  "purpose": "SCHOLARSHIP_EDUCATION_VERIFICATION",
  "consentId": "CON-001"
}

The provider returns a simulated authorization reference.

{
  "authorizationId": "DL-AUTH-001",
  "status": "AUTHORIZED"
}

12. Step 3 — Credential Discovery

SetuX requests available credentials.

GET /mock/digilocker/credentials

Conceptually:

Authorization
     ↓
Credential List
     ↓
Available Education Documents

Example response:

{
  "credentials": [
    {
      "credentialId": "DL-CRED-001",
      "type": "EDUCATION_CERTIFICATE",
      "issuer": "Demo University",
      "year": 2025,
      "status": "ACTIVE"
    }
  ]
}

13. Step 4 — Credential Selection

The citizen or workflow selects the credential required for the scholarship.

Example:

Education Credentials

┌─────────────────────────────────┐
│ B.Tech Degree Certificate       │
│ Issuer: Demo University         │
│ Year: 2025                      │
│ Status: Valid                   │
│                                 │
│ [ Use for Verification ]        │
└─────────────────────────────────┘

For the SIH prototype, this can be simplified to automatically selecting the appropriate credential.

14. Step 5 — Credential Retrieval

SetuX requests the selected credential.

SetuX
  ↓
DigiLocker Adapter
  ↓
Dummy DigiLocker Provider
  ↓
Credential

Example provider response:

{
  "credentialId": "DL-CRED-001",
  "credentialType": "EDUCATION_CERTIFICATE",
  "issuer": "Demo University",
  "holderName": "Rahul Kumar",
  "qualification": "B.Tech",
  "year": 2025,
  "verificationStatus": "VALID"
}

15. Step 6 — Data Normalization

External providers should not dictate SetuX's internal data model.

Provider response:

{
  "holderName": "Rahul Kumar",
  "qualification": "B.Tech",
  "verificationStatus": "VALID"
}

SetuX canonical model:

{
  "credentialId": "DL-CRED-001",
  "credentialType": "EDUCATION",
  "holder": {
    "name": "Rahul Kumar"
  },
  "education": {
    "qualification": "B.Tech",
    "year": 2025
  },
  "verification": {
    "status": "VERIFIED"
  }
}

The mapper performs this transformation.

16. Identity Matching

The retrieved education credential must be associated with the authenticated citizen/application.

Conceptually:

Authenticated Citizen
       │
       ▼
Citizen Identity
       │
       ▼
Credential Holder
       │
       ▼
Identity Match

Possible results:

MATCH
MISMATCH
UNVERIFIABLE

For example:

SetuX citizen name
      =
Credential holder name

        ↓

MATCH

The prototype may use a simplified matching rule.

17. Credential Verification

After retrieval:

Credential
    ↓
Validate structure
    ↓
Validate required fields
    ↓
Check credential status
    ↓
Match applicant
    ↓
Verification result

Result:

{
  "status": "VERIFIED",
  "credentialId": "DL-CRED-001"
}

Possible states:

VERIFIED
INVALID
MISMATCH
NOT_FOUND
PENDING
UNAVAILABLE

18. Integration State Machine

The DigiLocker integration should maintain its own state.

NOT_STARTED
    │
    ▼
CONSENT_PENDING
    │
    ▼
AUTHORIZED
    │
    ▼
CREDENTIAL_DISCOVERY
    │
    ▼
CREDENTIAL_SELECTED
    │
    ▼
RETRIEVING
    │
    ├──── FAILED ────► RETRY
    │
    ▼
RETRIEVED
    │
    ▼
VALIDATING
    │
    ├──── INVALID ──► FAILED
    │
    ▼
VERIFIED

This integration state is separate from the overall scholarship application state.

19. Scholarship Workflow Integration

The DigiLocker module should be one workflow step.

Scholarship Workflow
        │
        ├── Identity Verification
        │
        ├── Education Verification
        │       │
        │       ▼
        │   DigiLocker
        │
        ├── Income Verification
        │
        └── Officer Review

The workflow engine only cares about:

Education Verification
       ↓
VERIFIED / FAILED / PENDING

It does not need to know provider-specific implementation details.

20. API Design

The public SetuX API should expose SetuX-level operations rather than leaking mock-provider endpoints.

Example:

POST /api/v1/applications/:id/education/authorize

GET /api/v1/applications/:id/education/credentials

POST /api/v1/applications/:id/education/credentials/:credentialId/select

GET /api/v1/applications/:id/education/status

The dummy provider endpoints should remain internal/test-only.

21. Internal Mock Provider API

For the prototype, the backend can simulate the external provider using internal routes or a separate mock service.

Example:

POST /mock/digilocker/authorize
GET  /mock/digilocker/credentials
GET  /mock/digilocker/credentials/:id
POST /mock/digilocker/verify

These endpoints represent an external system contract for demonstration purposes.

They should not be presented as real DigiLocker production APIs.

22. Mock Data

Seed the dummy provider with deterministic records.

Example:

{
  "credentialId": "DL-CRED-001",
  "holderName": "Demo Citizen",
  "issuer": "Demo University",
  "qualification": "B.Tech",
  "year": 2025,
  "status": "VALID"
}

Create at least three demo scenarios:

1. Valid credential
2. Identity mismatch
3. External provider failure

This allows the SIH judges to see both the happy path and exception handling.

23. Failure Simulation

The dummy provider should intentionally support failures.

Example:

SetuX
  ↓
DigiLocker Mock
  ↓
500 / timeout

SetuX records:

provider = DIGILOCKER
operation = CREDENTIAL_RETRIEVAL
status = FAILED
attempt = 1
error_code = PROVIDER_TIMEOUT

Then:

Retry
  ↓
Provider available
  ↓
Credential retrieved
  ↓
Workflow continues

24. Retry Strategy

For the MVP:

Maximum automatic retries = 3

Example:

Attempt 1 → Timeout
Attempt 2 → Timeout
Attempt 3 → Success

If all attempts fail:

Integration Status
       ↓
UNAVAILABLE
       ↓
Workflow = WAITING_FOR_EXTERNAL_SYSTEM

The application should remain recoverable.

25. Idempotency

Repeated requests must not create duplicate logical operations.

Use an internal operation reference:

application_id
+
workflow_step_id
+
operation_id

Example:

APP-001
EDUCATION-VERIFICATION
OP-001

If the same operation is retried, SetuX should be able to identify it rather than creating duplicate credential records or duplicate workflow steps.

26. Data Storage

SetuX should store only what is necessary for the scholarship workflow.

Recommended information:

application_id
provider
external_reference
credential_id
credential_type
issuer
verification_status
retrieved_at
error/status metadata

Avoid unnecessarily copying an entire external document into SetuX.

Architecture:

External Provider
       │
       │ credential
       ▼
SetuX
       │
       ├── verification result
       ├── reference
       └── minimum required metadata

The objective is interoperability, not document duplication.

27. Sensitive Data

The prototype should minimize sensitive information.

Do not:

log complete credentials
log access tokens
log authorization secrets
expose provider credentials to frontend

Logs should contain references:

credential_id
application_id
operation_id
status
timestamp

rather than unnecessary document contents.

28. Consent and Audit

Every credential access should be traceable.

Example:

Citizen
  ↓
Consent Granted
  ↓
Credential Requested
  ↓
Credential Retrieved
  ↓
Credential Verified

Audit event:

{
  "event": "CREDENTIAL_ACCESSED",
  "applicationId": "STX-APP-001",
  "provider": "DIGILOCKER",
  "credentialId": "DL-CRED-001",
  "purpose": "SCHOLARSHIP_EDUCATION_VERIFICATION",
  "timestamp": "..."
}

This creates a clear audit trail.

29. Security Boundary

The browser should never receive:

provider_secret
service_role_key
internal API credentials
private integration configuration

Flow:

Browser
   ↓
SetuX Backend
   ↓
DigiLocker Adapter
   ↓
Provider

Never:

Browser
   ↓
Provider secret
   ↓
DigiLocker

30. Role-Based Access

Citizen

Can:

grant/deny consent

view credential status

select credential where applicable

view verification result

Officer

Can:

view required education verification result

see credential metadata required for scholarship review

not modify citizen consent

not impersonate citizen

Admin

Can:

view integration health

inspect failed integration attempts

retry supported operations

view integration audit events

31. Officer View

The officer should see the verification result, not an unnecessary replica of the external document store.

Example:

Education Verification
────────────────────────────

Credential: Education Certificate
Issuer: Demo University
Year: 2025

Holder Match: ✓
Credential Status: ✓ Valid
Verification: ✓ Verified

Source:
DigiLocker

[ View Verification Details ]

This demonstrates that SetuX consumes trusted external data instead of asking the officer to manually verify multiple systems.

32. Citizen View

Citizen dashboard:

Scholarship Application
STX-APP-001

Education Verification

✓ Consent granted
✓ Credential retrieved
✓ Credential verified

Overall Status:
Processing

The citizen does not need to navigate the external provider to understand the application status.

33. Admin View

Admin dashboard:

DigiLocker Integration

Status: Healthy

Requests Today: 42
Successful: 39
Failed: 3
Retries: 4

Recent Failures
────────────────────────────
APP-001  Timeout      Recovered
APP-009  Provider 5xx Retrying
APP-013  Timeout      Recovered

This demonstrates interoperability observability.

34. Database Relationship

Conceptually:

applications
      │
      ▼
workflow_steps
      │
      ▼
data_retrievals
      │
      ├── provider = DIGILOCKER
      ├── external_reference
      ├── status
      └── retrieved_at
              │
              ▼
      verification result

Consent:

applications
      │
      ▼
consents
      │
      └── provider/data purpose

Audit:

applications
      │
      ▼
audit_logs

The exact columns should follow database-schema.md.

35. Complete Integration Sequence

CITIZEN
   │
   │ Start scholarship
   ▼
SETUX APPLICATION
   │
   │ Request education verification
   ▼
CONSENT MODULE
   │
   │ Consent granted
   ▼
WORKFLOW ENGINE
   │
   ▼
EDUCATION CONNECTOR
   │
   ▼
DIGILOCKER ADAPTER
   │
   ▼
DUMMY DIGILOCKER
   │
   │ Credential list
   ▼
DIGILOCKER ADAPTER
   │
   ▼
SETUX MAPPER
   │
   ▼
CANONICAL CREDENTIAL
   │
   ▼
VERIFICATION SERVICE
   │
   ├──── MATCH ────► VERIFIED
   │
   └──── MISMATCH ─► FAILED
   │
   ▼
WORKFLOW ENGINE
   │
   ▼
NEXT VERIFICATION
   │
   ▼
OFFICER REVIEW

36. Failure Sequence

Workflow
   ↓
Education Verification
   ↓
DigiLocker Adapter
   ↓
Dummy Provider
   ↓
TIMEOUT
   ↓
Record Failure
   ↓
Retry
   ↓
Provider Success
   ↓
Credential Retrieved
   ↓
Verify
   ↓
Workflow Continues

If all retries fail:

TIMEOUT
   ↓
RETRY 1
   ↓
RETRY 2
   ↓
RETRY 3
   ↓
UNAVAILABLE
   ↓
WAITING_FOR_EXTERNAL_SYSTEM

37. What the SIH Judges Should See

The demo should communicate:

1. Existing system

DigiLocker

already provides credential access.

2. SetuX does not duplicate it

No new document repository

3. SetuX adds orchestration

Consent
   ↓
Credential Access
   ↓
Normalization
   ↓
Verification
   ↓
Scholarship Workflow

4. Failure is handled

Provider failure
   ↓
Retry
   ↓
Recovery

5. Citizen sees one journey

One application
One status
One workflow

38. Production Migration Path

The dummy provider should be replaceable.

Current:

EducationProvider
       ↓
DummyDigiLockerAdapter

Future:

EducationProvider
       ↓
DigiLockerAdapter
       ↓
Official Integration

The following should remain unchanged:

Application Module
Consent Module
Workflow Engine
Verification Service
Notification Module
Audit Module
Database model
Citizen UI
Officer UI

Only the provider integration layer should change where possible.

39. Environment Configuration

Dummy integration should be controlled through environment configuration.

Example:

EDUCATION_PROVIDER=mock
DIGILOCKER_MODE=mock
DIGILOCKER_BASE_URL=http://localhost:4001

Future:

EDUCATION_PROVIDER=digilocker
DIGILOCKER_MODE=production
DIGILOCKER_BASE_URL=<official-provider-endpoint>

Never hard-code provider credentials in source code.

40. Testing

Minimum test cases:

Success

Consent granted
→ credential found
→ credential valid
→ identity matched
→ VERIFIED

Consent denied

Consent denied
→ no provider request
→ workflow paused

Credential not found

Credential list empty
→ NOT_FOUND
→ verification failed/pending according to workflow rule

Identity mismatch

Credential holder != citizen
→ MISMATCH
→ verification failed

Provider timeout

Provider timeout
→ retry
→ success

Persistent failure

Provider unavailable
→ max retries
→ WAITING_FOR_EXTERNAL_SYSTEM

Duplicate request

Same operation repeated
→ idempotency check
→ no duplicate logical retrieval

41. Definition of Done

Integration

Education provider interface created

Dummy DigiLocker adapter created

Mock provider created

Provider mapper created

Canonical credential model defined

Environment-based provider selection implemented

Consent

Consent required before credential access

Consent decision recorded

Denied consent prevents provider request

Credential Flow

Authorization simulated

Credential discovery implemented

Credential retrieval implemented

Credential validation implemented

Identity matching implemented

Verification result stored

Workflow

DigiLocker is represented as education verification step

Successful verification advances workflow

Failure pauses/blocks workflow appropriately

Retry supported

Recovery supported

Security

Provider secrets remain backend-only

Access tokens are never logged

Sensitive credential data is minimized

Consent is auditable

Credential access is auditable

Role-based access enforced

Demo

Valid credential scenario

Consent-denied scenario

Credential mismatch scenario

Provider failure/retry scenario

Successful recovery scenario

42. Final Design

The SetuX DigiLocker integration should be understood as:

                DIGILOCKER
             External System
                    │
                    │ Credential
                    ▼
             ┌──────────────┐
             │    SETUX     │
             │              │
             │   Consent    │
             │      ↓       │
             │  Connector   │
             │      ↓       │
             │   Mapper     │
             │      ↓       │
             │ Verification │
             │      ↓       │
             │   Workflow   │
             └──────┬───────┘
                    │
                    ▼
              SCHOLARSHIP
               APPLICATION
                    │
                    ▼
              OFFICER REVIEW
                    │
                    ▼
                 CITIZEN

The key architectural principle is:

DigiLocker remains the document/credential provider. SetuX remains the interoperability, consent, verification, and workflow orchestration layer.