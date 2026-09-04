SetuX — Government Connectors

Version: 1.0
Project: SetuX SIH MVP
Architecture: Modular Monolith
Connector Strategy: Fake / Mock Government Connectors
Backend: Supabase + SetuX API

Phase 8 implementation profile (2026-09-04)

Phase 8 implements the connector LAYER described below, and exactly one
connector behind it: the fake DigiLocker document provider.

Implemented:

  - the common connector contract, as `GovernmentDataConnector` in
    `backend/src/connectors/connector.types.ts`
  - the provider adapter pattern and its response mapper
  - the connector registry (§16), keyed on `data_sources.code` so connector
    selection is database-driven and server-owned
  - canonical/normalized response models (§14, §15)
  - the error model (§20) and the retryable/non-retryable split (§21)
  - the consent boundary (§19) — enforced before any connector is constructed
  - connector operation records and audit events (§33, §34)

NOT implemented in Phase 8 (Phase 9 and later):

  - the identity, education and income connectors (§12, §13)
  - connector health checks and the admin view (§24, §33)
  - automatic retry with a retry budget (§23) — Phase 8 retry is
    citizen-initiated
  - the workflow engine calling connectors (§18); Phase 8 retrieval is invoked
    by the citizen from their application, and advances no workflow state

Note on §33: connector activity is recorded in the existing `data_retrievals`
table rather than a new `connector_operations` table. `data_retrievals` already
carries application, source, consent, status, attempt number, external
reference, error code and timestamps — every field §33 asks for — and Phase 8
adds `requirement_id` to it. A second table would duplicate the first.

--------------------------------------------------------------------------------

1. Purpose

This document defines the government connector layer for the SetuX SIH prototype.

SetuX is being demonstrated as an interoperability layer. Therefore, the prototype should not depend on real government systems for the core demonstration.

Instead, SetuX will implement fake government connectors that behave like external government systems.

The important part of the prototype is not whether the external API is real.

The important part is proving that:

SetuX
   ↓
Connector
   ↓
Government System
   ↓
Response
   ↓
Normalization
   ↓
Workflow

can work as a reusable architecture.

2. Why Fake Connectors

For the SIH MVP, real government integrations may require:

official credentials

approvals

production access

security requirements

API contracts

government network access

legal/data-sharing agreements

These are unnecessary for proving the SetuX architecture.

Therefore:

REAL SETUX CORE
+
REAL CONNECTOR INTERFACES
+
FAKE EXTERNAL SYSTEMS

will be used.

3. What Is Real and What Is Fake

Layer

MVP

Citizen UI

Real

Government UI

Real

SetuX API

Real

Authentication

Real

RBAC

Real

Consent

Real

Application workflow

Real

Workflow engine

Real

Database

Real

Connector interface

Real

Connector implementation

Real

DigiLocker provider

Fake

Identity provider

Fake

Income provider

Fake

Education provider

Fake / DigiLocker simulation

The fake providers exist only behind the connector boundary.

4. Core Principle

The SetuX backend must never depend directly on a specific external government's API structure.

Incorrect:

Application Service
      ↓
Fake DigiLocker API

Correct:

Application Service
      ↓
Workflow Engine
      ↓
Connector Interface
      ↓
Provider Adapter
      ↓
Fake Government System

This makes the external provider replaceable.

5. Government Connector Architecture

                       SETUX CORE
                           │
                           ▼
                    Workflow Engine
                           │
                    Connector Layer
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
 Identity Connector   Education Connector  Income Connector
        │                  │                  │
        ▼                  ▼                  ▼
 Fake Identity API   Fake DigiLocker API   Fake Income API

The workflow engine knows:

VERIFY_IDENTITY
VERIFY_EDUCATION
VERIFY_INCOME

It does not need to know:

Aadhaar API format
DigiLocker API format
Income department API format

6. Connector Responsibilities

A connector is responsible for:

communicating with an external provider

converting SetuX requests into provider requests

receiving provider responses

converting provider responses into SetuX canonical data

handling provider errors

returning a predictable result to the workflow engine

A connector is not responsible for:

deciding whether the scholarship is approved

deciding citizen eligibility

managing UI

managing application state

managing user roles

storing unrelated application information

7. Connector Interface

All government connectors should follow a common conceptual contract.

interface GovernmentConnector {
  healthCheck(): Promise<ConnectorHealth>;

  verify(
    request: VerificationRequest
  ): Promise<VerificationResponse>;
}

More specialized interfaces may be used:

interface IdentityConnector {
  verifyIdentity(
    request: IdentityVerificationRequest
  ): Promise<IdentityVerificationResponse>;
}

interface EducationConnector {
  listCredentials(
    request: CredentialListRequest
  ): Promise<CredentialListResponse>;

  getCredential(
    request: CredentialRequest
  ): Promise<CredentialResponse>;

  verifyCredential(
    request: CredentialVerificationRequest
  ): Promise<CredentialVerificationResponse>;
}

interface IncomeConnector {
  verifyIncome(
    request: IncomeVerificationRequest
  ): Promise<IncomeVerificationResponse>;
}

8. Connector Directory

Recommended structure:

src/
└── modules/
    └── connectors/
        ├── identity/
        │   ├── identity.interface.ts
        │   ├── identity.connector.ts
        │   ├── identity.mapper.ts
        │   ├── identity.mock.ts
        │   └── identity.types.ts
        │
        ├── education/
        │   ├── education.interface.ts
        │   ├── education.connector.ts
        │   ├── education.mapper.ts
        │   ├── education.mock.ts
        │   └── education.types.ts
        │
        ├── income/
        │   ├── income.interface.ts
        │   ├── income.connector.ts
        │   ├── income.mapper.ts
        │   ├── income.mock.ts
        │   └── income.types.ts
        │
        └── index.ts

The exact folder naming can be adjusted to match the project's existing backend structure.

9. Fake Provider Architecture

The fake provider should behave like an external service.

SetuX Backend
     │
     │ HTTP / provider contract
     ▼
┌─────────────────────────────┐
│ Fake Government Provider    │
│                             │
│ /identity                   │
│ /education                  │
│ /income                     │
└─────────────────────────────┘

The fake provider can be:

Option A — Separate mock server

SetuX Backend
     ↓ HTTP
Mock Government Server

Option B — Mock provider module

SetuX Backend
     ↓
Mock Provider Implementation

For the SIH MVP, Option B is simpler if the goal is to demonstrate architecture without creating unnecessary infrastructure.

If the judges need to see actual API-to-API communication, Option A can be used.

10. Recommended MVP Approach

Use:

SetuX Backend
    ↓
Connector Interface
    ↓
Fake Provider Adapter
    ↓
Fake Provider Data

The connector behaves as if it is calling an external system.

This gives the team:

clean architecture

easy testing

deterministic demo data

no external dependency

simple deployment

11. Education Connector

The education connector is the most important connector for the scholarship demo.

Scholarship Workflow
        ↓
Education Connector
        ↓
Fake DigiLocker Provider
        ↓
Education Credential

It should support:

authorization
credential discovery
credential retrieval
credential verification

Detailed DigiLocker behavior is documented in:

digilocker-integration.md

12. Identity Connector

The fake identity connector simulates an identity verification provider.

Example:

Identity Request
      ↓
Fake Identity Provider
      ↓
Identity Result

Input:

{
  "citizenId": "CIT-001",
  "name": "Demo Citizen"
}

Response:

{
  "status": "VERIFIED",
  "matched": true
}

Possible outcomes:

VERIFIED
MISMATCH
NOT_FOUND
UNAVAILABLE

13. Income Connector

The income connector simulates an income verification system.

Input:

{
  "citizenId": "CIT-001"
}

Response:

{
  "status": "VERIFIED",
  "incomeBand": "BELOW_THRESHOLD"
}

The workflow can then determine whether the income verification step has succeeded.

The connector itself should not decide scholarship approval.

14. Canonical Response

Every connector must return a normalized SetuX response.

External provider:

{
  "verification": "SUCCESS",
  "holder_name": "Demo Citizen"
}

SetuX:

{
  "status": "VERIFIED",
  "matched": true
}

Therefore:

Provider Response
       ↓
Connector Mapper
       ↓
Canonical SetuX Response
       ↓
Workflow Engine

15. Why Canonical Models Matter

Different providers may use different field names.

Example:

Provider A:
verification_status

Provider B:
verification

Provider C:
status

SetuX should convert all of them to:

verificationStatus

The workflow therefore remains provider-independent.

16. Provider Registry

The backend can maintain a simple provider registry.

Example:

const providers = {
  identity: identityConnector,
  education: educationConnector,
  income: incomeConnector
};

The workflow engine requests the appropriate connector:

workflow step
     ↓
provider registry
     ↓
connector

This avoids hard-coding provider logic inside workflow services.

17. Connector Selection

The workflow definition can specify:

{
  "step": "EDUCATION_VERIFICATION",
  "connector": "education"
}

Then:

Workflow Engine
       ↓
connector = education
       ↓
Education Connector

For the current MVP:

education → Fake DigiLocker
identity   → Fake Identity Provider
income     → Fake Income Provider

18. Connector Request Flow

Every request should follow:

Workflow
   ↓
Create operation ID
   ↓
Check consent
   ↓
Resolve connector
   ↓
Connector validates input
   ↓
Provider request
   ↓
Provider response
   ↓
Mapper
   ↓
Canonical response
   ↓
Workflow update
   ↓
Audit event

19. Consent Boundary

The connector must not bypass consent.

Correct:

Citizen
   ↓
Consent
   ↓
Workflow
   ↓
Connector
   ↓
Provider

Incorrect:

Workflow
   ↓
Connector
   ↓
Provider

without checking whether the required consent exists.

20. Error Model

All connectors should return predictable error categories.

VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
TIMEOUT
RATE_LIMITED
PROVIDER_ERROR
SERVICE_UNAVAILABLE
INVALID_RESPONSE
UNKNOWN_ERROR

Example:

{
  "status": "UNAVAILABLE",
  "errorCode": "PROVIDER_TIMEOUT",
  "retryable": true
}

21. Retryable vs Non-Retryable Errors

Retryable

TIMEOUT
SERVICE_UNAVAILABLE
PROVIDER_5XX
TEMPORARY_NETWORK_ERROR

Usually non-retryable

INVALID_REQUEST
CONSENT_DENIED
CREDENTIAL_NOT_FOUND
IDENTITY_MISMATCH
INVALID_CREDENTIAL

The workflow engine uses this information to decide what happens next.

22. Timeout Handling

Every connector request should have a timeout.

Example:

SetuX
  ↓
Fake Provider
  ↓
No response
  ↓
Timeout
  ↓
Connector returns:
SERVICE_UNAVAILABLE
retryable = true

The workflow then applies the retry policy.

23. Retry Flow

Connector Request
      ↓
   FAILURE
      ↓
Retryable?
   ┌──┴──┐
  NO    YES
  │      │
  ▼      ▼
Failed  Retry
         │
         ▼
      Success

For MVP:

MAX_RETRIES = 3

24. External Provider Health

Each connector should expose a basic health check.

Example:

GET /health

Result:

{
  "provider": "FAKE_DIGILOCKER",
  "status": "HEALTHY"
}

Admin dashboard:

Identity       ● Healthy
Education      ● Healthy
Income         ● Healthy

If a provider is intentionally disabled:

Education      ● Unavailable

25. Fake Provider Controls

For the SIH demo, the fake provider should support deterministic behavior.

Example configuration:

NORMAL
FAIL_ONCE
ALWAYS_FAIL
MISMATCH
NOT_FOUND

This makes it possible to demonstrate exception handling without relying on random failures.

26. Demo Scenario — Success

Citizen
   ↓
Scholarship Application
   ↓
Consent
   ↓
Identity Connector
   ↓
VERIFIED
   ↓
Education Connector
   ↓
Fake DigiLocker
   ↓
CREDENTIAL VERIFIED
   ↓
Income Connector
   ↓
VERIFIED
   ↓
Officer Review
   ↓
APPROVED

27. Demo Scenario — Provider Failure

Citizen
   ↓
Scholarship
   ↓
Consent
   ↓
Education Connector
   ↓
Fake DigiLocker
   ↓
TIMEOUT
   ↓
Retry 1
   ↓
Retry 2
   ↓
Success
   ↓
Workflow continues

This is an important SIH demonstration because it shows that SetuX can handle unreliable connected systems.

28. Demo Scenario — Identity Mismatch

Citizen
   ↓
Identity Connector
   ↓
Fake Identity Provider
   ↓
MISMATCH
   ↓
Identity Verification Failed
   ↓
Workflow blocked

The officer should see a meaningful verification failure instead of a generic application error.

29. Demo Scenario — DigiLocker Credential Not Found

Education Verification
       ↓
Fake DigiLocker
       ↓
No credential
       ↓
NOT_FOUND
       ↓
Education Verification Failed
       ↓
Citizen informed

The application should remain traceable.

30. Mock Data Design

Use deterministic demo citizens.

Example:

CIT-001
Name: Demo Citizen
Education: Valid
Income: Below Threshold
Identity: Valid

CIT-002
Name: Mismatch Citizen
Education: Credential belongs to another person
Identity: Mismatch

CIT-003
Name: Failure Citizen
Education Provider: Temporary Failure

These records should be seeded for demonstrations and automated tests.

31. Fake DigiLocker Data

Example:

{
  "credentialId": "DL-CRED-001",
  "holderName": "Demo Citizen",
  "issuer": "Demo University",
  "credentialType": "EDUCATION_CERTIFICATE",
  "qualification": "B.Tech",
  "year": 2025,
  "status": "VALID"
}

The fake provider should return this as provider data.

The SetuX mapper converts it into the canonical education model.

32. No Fake Government Branding

The UI and API documentation should make it clear that these are simulated systems.

Use labels such as:

Demo Education Provider
Simulated DigiLocker
Mock Identity Service
Mock Income Service

Do not present the fake service as an official production government API.

33. Database Records

Connector activity should be traceable.

Conceptual record:

connector_operations

id
application_id
workflow_step_id
provider
operation
status
attempt
external_reference
error_code
created_at
completed_at

Example:

APP-001
EDUCATION
DIGILOCKER
GET_CREDENTIAL
SUCCESS
1
DL-CRED-001

34. Audit Events

Connector actions should produce audit events.

Examples:

CONSENT_GRANTED
CONNECTOR_REQUESTED
CREDENTIAL_RETRIEVED
VERIFICATION_COMPLETED
CONNECTOR_FAILED
CONNECTOR_RETRIED
CONNECTOR_RECOVERED

Example:

{
  "event": "CONNECTOR_REQUESTED",
  "provider": "FAKE_DIGILOCKER",
  "applicationId": "STX-APP-001"
}

35. Security

Even though the provider is fake, the architecture should follow production-like boundaries.

Never expose:

internal provider configuration
service-role credentials
private API keys
backend secrets

The browser communicates only with:

SetuX API

and not directly with the fake provider.

36. Frontend Boundary

Citizen UI:

Citizen UI
    ↓
SetuX API
    ↓
Workflow
    ↓
Connector

Officer UI:

Officer UI
    ↓
SetuX API
    ↓
Application / Workflow

Neither frontend should call the fake government provider directly.

37. Backend Module Boundary

Recommended:

src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── applications/
│   ├── consent/
│   ├── workflow/
│   ├── notifications/
│   ├── audit/
│   └── connectors/
│       ├── identity/
│       ├── education/
│       └── income/
│
└── shared/
    ├── errors/
    ├── logger/
    └── types/

The connector layer remains independent from application controllers.

38. Request Flow in the Monolith

Because the MVP is a modular monolith:

                    SETUX BACKEND
┌────────────────────────────────────────────┐
│                                            │
│ API Controller                             │
│      ↓                                     │
│ Application Service                        │
│      ↓                                     │
│ Workflow Service                           │
│      ↓                                     │
│ Connector Registry                         │
│      ↓                                     │
│ Provider Adapter                           │
│      ↓                                     │
│ Fake Provider                              │
│                                            │
└────────────────────────────────────────────┘

There is no need to deploy each connector as an independent microservice.

39. Future Production Architecture

The MVP:

SetuX Monolith
     ↓
Fake Connectors

Future:

SetuX Core
     ↓
Connector Layer
     ├── DigiLocker
     ├── Identity Provider
     ├── Income Department
     └── Education Department

If scale requires it, individual connectors can later become separate services.

The prototype should not introduce that complexity prematurely.

40. Configuration

Provider selection should be configuration-driven.

Example:

IDENTITY_PROVIDER=mock
EDUCATION_PROVIDER=mock-digilocker
INCOME_PROVIDER=mock

Future:

IDENTITY_PROVIDER=official-provider
EDUCATION_PROVIDER=digilocker
INCOME_PROVIDER=official-provider

The workflow should remain unchanged.

41. Testing Strategy

Each connector should have unit tests for:

Success

Provider returns valid response
→ Connector returns VERIFIED

Timeout

Provider timeout
→ Connector returns retryable error

Invalid response

Provider returns malformed data
→ INVALID_RESPONSE

Not found

Provider returns no record
→ NOT_FOUND

Mismatch

Provider identity != citizen
→ MISMATCH

Retry

Failure
→ retry
→ success

42. Integration Test

Test the entire chain:

Application
   ↓
Consent
   ↓
Workflow
   ↓
Education Connector
   ↓
Fake DigiLocker
   ↓
Mapper
   ↓
Verification
   ↓
Workflow continues

The test should verify that the application reaches the expected state.

43. Definition of Done

Connector Architecture

Connector interface defined

Provider adapter pattern implemented

Connector registry implemented

Canonical response models defined

Provider-specific mapping isolated

Fake Providers

Fake Identity Provider

Fake DigiLocker Provider

Fake Income Provider

Deterministic mock data

Success scenario

Failure scenario

Mismatch scenario

Not-found scenario

Workflow

Connector called by workflow

Consent checked before protected access

Verification result updates workflow

Retry supported

Failure state supported

Recovery supported

Observability

Connector operations stored

Audit events generated

Provider health visible

Errors categorized

Security

Provider secrets backend-only

Frontend cannot call provider directly

Sensitive provider responses minimized

RBAC enforced

Consent enforced

44. SIH Demonstration Flow

The recommended live demonstration:

STEP 1
Citizen logs in
        ↓
STEP 2
Selects Scholarship
        ↓
STEP 3
Creates application
        ↓
STEP 4
Grants consent
        ↓
STEP 5
SetuX calls Identity Connector
        ↓
Identity verified
        ↓
STEP 6
SetuX calls Education Connector
        ↓
Fake DigiLocker returns credential
        ↓
Credential verified
        ↓
STEP 7
Income Connector verifies income
        ↓
STEP 8
Application reaches Officer Review
        ↓
STEP 9
Officer approves
        ↓
STEP 10
Citizen sees APPROVED

Then demonstrate:

Education Provider
       ↓
Failure
       ↓
SetuX Retry
       ↓
Recovery
       ↓
Workflow Continues

45. Core Message for SIH

The fake connectors are not the product.

They exist to demonstrate the SetuX architecture.

The product is:

             SETUX
               │
       ┌───────┴────────┐
       │ Interoperability│
       │     Layer       │
       └───────┬────────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   Identity Education Income
      │        │        │
      ▼        ▼        ▼
   Existing Government Systems
               │
               ▼
        Unified Workflow
               │
               ▼
          One Citizen
          Experience

46. Final Principle

For the SIH MVP:

Build the connector architecture as if the external government systems were real, but use deterministic fake providers behind those connectors.

This gives SetuX a credible interoperability architecture while keeping the prototype:

buildable

testable

deterministic

demonstrable

independent of production government credentials

easy to replace with real integrations later

The architecture should therefore make this replacement possible:

TODAY

SetuX
  ↓
Connector
  ↓
Fake Government API


FUTURE

SetuX
  ↓
Same Connector Interface
  ↓
Official Government API

The SetuX core should not need to know which one is being used.