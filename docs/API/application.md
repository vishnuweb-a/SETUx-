SetuX — Application API Specification

Version: 1.0
Project: SetuX SIH MVP
Module: Scholarship Application
Backend: Supabase + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

Phase 6 implementation profile (2026-09-04)

The lifecycle described later in this document spans multiple project phases.
The currently implemented Phase 6 surface is intentionally limited to:

POST   /api/v1/applications
GET    /api/v1/applications
GET    /api/v1/applications/:applicationId
PATCH  /api/v1/applications/:applicationId
POST   /api/v1/applications/:applicationId/submit

Phase 6 owns only DRAFT → SUBMITTED. Submission does not create consent,
retrieve data, call a connector, run verification, create a review, or emit a
notification. Those remain Phase 7 and later responsibilities.

Create request:

{
  "service_id": "uuid"
}

Draft update request:

{
  "fields": {
    "CONFIGURED_DECLARATION_CODE": "Citizen-supplied declaration"
  }
}

Only requirements configured as DECLARATION may be written by a citizen.
Profile values are returned read-only and are not duplicated into
application_data. Requirements supplied by government or DigiLocker sources
are displayed but are not collected during Phase 6.

One active application per (citizen, service) is enforced by a partial unique
index. APPROVED, REJECTED, and CANCELLED are terminal for this uniqueness rule.
Creation, draft replacement, lifecycle events, and submission use controlled
database functions so each logical operation is atomic.

1. Purpose

This document defines the API contract for the SetuX application module.

The application is the primary business object of the SIH prototype.

SetuX demonstrates:

One Citizen
     ↓
One Application
     ↓
Multiple verification systems
     ↓
One coordinated workflow
     ↓
One unified status
     ↓
Government review
     ↓
Approve / Reject

For the SIH prototype, the application represents a scholarship application.

The application API is responsible for:

Creating an application

Saving application information

Retrieving applications

Updating draft applications

Submitting applications

Tracking application status

Returning workflow progress

Returning application timeline

Enforcing application ownership

Starting the application workflow

Consent, data retrieval, connector communication, and government review are separate modules, but they are triggered or consumed through the application lifecycle.

2. Core Principle

The frontend must never communicate directly with government systems.

Correct:

Citizen UI
    │
    ▼
SetuX Application API
    │
    ├── Application Service
    ├── Consent Service
    ├── Workflow Engine
    └── Integration Layer
             │
             ▼
       Government Systems

Incorrect:

Citizen UI ─────────────► Government API

The SetuX API is the controlled business layer between the frontend, database, workflow, and integration layer.

3. Application as the Primary Business Object

The application connects the major SetuX modules:

                    APPLICATION
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
    Consent         Verification       Workflow
       │                 │                 │
       ▼                 ▼                 ▼
 Data Access       External Systems   Application State
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                    Government
                       Review
                         │
                   ┌─────┴─────┐
                   ▼           ▼
                APPROVED     REJECTED

4. Application Lifecycle

The application follows a controlled state machine.

                         ┌──────────────┐
                         │    DRAFT     │
                         └──────┬───────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │   CONSENT_PENDING   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   DATA_RETRIEVAL    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    VERIFICATION     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ READY_FOR_SUBMISSION│
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      SUBMITTED      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    UNDER_REVIEW     │
                    └──────┬────────┬─────┘
                           │        │
                    approve│        │reject
                           ▼        ▼
                       APPROVED  REJECTED

Additional operational states:

WAITING_FOR_CONSENT
WAITING_FOR_DEPARTMENT
RETRYING
FAILED
REQUESTED_INFO
CANCELLED

The frontend cannot directly set arbitrary application statuses.

5. Application Number

Every application has two identifiers.

Internal ID

UUID:

550e8400-e29b-41d4-a716-446655440000

Used internally for database relationships and API operations.

Human-readable Application Number

Example:

STX-2026-000001

Displayed to citizens and officers.

The UUID is the primary key and the application number is a unique display identifier.

6. Application Data Model

Conceptually:

applications
│
├── id
├── application_number
├── citizen_id
├── service_id
├── status
├── current_workflow_step
├── created_at
├── updated_at
└── submitted_at

Related data:

applications
    │
    ├── consents
    ├── data_retrievals
    ├── application_data
    ├── application_reviews
    └── application_events

7. Application Creation

Endpoint

POST /api/v1/applications

Authentication

Required.

Authorization: Bearer <access_token>

Only an authenticated citizen can create a citizen scholarship application.

8. Create Application Request

Example:

{
  "service_id": "scholarship-service-uuid"
}

The authenticated user's ID is obtained from the JWT.

The client must not send:

{
  "citizen_id": "another-user-id"
}

as a trusted identity field.

9. Create Application Flow

Citizen clicks "Apply"
        │
        ▼
POST /applications
        │
        ▼
Authenticate
        │
        ▼
Authorize CITIZEN
        │
        ▼
Validate service
        │
        ▼
Create application number
        │
        ▼
Create application
        │
        ▼
Create APPLICATION_CREATED event
        │
        ▼
Create audit event
        │
        ▼
Initialize workflow
        │
        ▼
Return application

10. Create Application Response

201 Created

{
  "success": true,
  "message": "Application created successfully.",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "application_number": "STX-2026-000001",
    "service": {
      "id": "scholarship-service-uuid",
      "code": "SCHOLARSHIP",
      "name": "Scholarship"
    },
    "status": "DRAFT",
    "current_workflow_step": null,
    "created_at": "2026-08-29T09:00:00Z"
  }
}

11. Application Creation Rules

The backend must:

1. Verify authentication
2. Verify citizen role
3. Verify service exists
4. Verify service is active
5. Create unique application number
6. Create application
7. Create application event
8. Create audit record
9. Initialize workflow

Application creation must be server-controlled.

12. Get Citizen Applications

Endpoint

GET /api/v1/applications

Returns applications belonging to the authenticated citizen.

Optional filters

GET /api/v1/applications?status=SUBMITTED

Pagination:

GET /api/v1/applications?page=1&limit=20

The backend automatically restricts results to the authenticated citizen.

13. Application List Response

{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "application_number": "STX-2026-000001",
        "service": {
          "code": "SCHOLARSHIP",
          "name": "Scholarship"
        },
        "status": "VERIFICATION",
        "current_workflow_step": "EDUCATION_VERIFICATION",
        "created_at": "2026-08-29T09:00:00Z",
        "updated_at": "2026-08-29T09:10:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "total_pages": 1
    }
  }
}

14. Application Ownership

A citizen can only access their own applications.

Backend rule:

JWT user_id
     ==
applications.citizen_id

Example:

Citizen A
   │
   ├── Application A1
   └── Application A2

Citizen B
   │
   └── Application B1

Citizen A cannot retrieve:

Application B1

Attempt:

GET /api/v1/applications/B1

must return:

403 Forbidden

or a resource-not-found response according to the API's resource-disclosure policy.

15. Get Application Detail

Endpoint

GET /api/v1/applications/:applicationId

Returns the application and its current workflow state.

Response

{
  "success": true,
  "data": {
    "id": "uuid",
    "application_number": "STX-2026-000001",
    "service": {
      "code": "SCHOLARSHIP",
      "name": "Scholarship"
    },
    "status": "VERIFICATION",
    "current_workflow_step": "EDUCATION_VERIFICATION",
    "created_at": "2026-08-29T09:00:00Z",
    "updated_at": "2026-08-29T09:10:00Z",
    "submitted_at": null
  }
}

16. Update Draft Application

Endpoint

PATCH /api/v1/applications/:applicationId

This endpoint is used while the application is still editable.

Example:

{
  "academic_year": "2026-27",
  "course": "B.Tech",
  "institution": "Example Institute",
  "category": "GENERAL"
}

The exact scholarship fields should be driven by the service requirements configured for the MVP.

17. Update Rules

A citizen can update an application only when it is in an editable state.

Example:

DRAFT
REQUESTED_INFO

A citizen cannot directly modify an application in:

SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED

unless a defined workflow transition explicitly permits the operation.

18. Draft Save Flow

Citizen fills form
       │
       ▼
PATCH /applications/:id
       │
       ▼
Authenticate
       │
       ▼
Verify ownership
       │
       ▼
Validate application fields
       │
       ▼
Check application state
       │
       ▼
Update application data
       │
       ▼
Record APPLICATION_UPDATED event

19. Submit Application

Endpoint

POST /api/v1/applications/:applicationId/submit

This is the critical transition from citizen editing to SetuX workflow execution.

20. Submission Preconditions

The application cannot be submitted until required conditions are satisfied.

Required information available
            +
Required consent granted
            +
Required data available
            +
Required verification completed
            ↓
       READY_FOR_SUBMISSION
            ↓
          SUBMIT

The backend must enforce these conditions.

The frontend must not be trusted to determine whether the application is ready.

21. Submission Request

{}

Optional:

{
  "confirmation": true
}

The backend determines the actual requirements.

22. Submission Flow

POST /applications/:id/submit
             │
             ▼
       Authenticate
             │
             ▼
       Verify ownership
             │
             ▼
      Validate state
             │
             ▼
       Check required data
             │
             ▼
       Check consent
             │
             ▼
    Check verification state
             │
             ▼
       BEGIN TRANSACTION
             │
       ┌─────┼─────────────┐
       ▼     ▼             ▼
    Update  Event       Audit Log
    Status
       │
       └─────────┬─────────┘
                 ▼
              COMMIT
                 │
                 ▼
        Start/continue workflow

23. Submit Success Response

200 OK

{
  "success": true,
  "message": "Application submitted successfully.",
  "data": {
    "application_id": "uuid",
    "application_number": "STX-2026-000001",
    "status": "SUBMITTED",
    "current_workflow_step": "IDENTITY_VERIFICATION"
  }
}

24. Application Workflow

For the scholarship SIH prototype:

SUBMITTED
    │
    ▼
IDENTITY_VERIFICATION
    │
    ▼
EDUCATION_VERIFICATION
    │
    ▼
INCOME_VERIFICATION
    │
    ▼
OFFICER_REVIEW
    │
    ▼
FINAL_DECISION
    │
    ▼
COMPLETED

The workflow engine controls these transitions.

The application API should not contain department-specific integration logic.

25. Workflow Execution Boundary

Application API
      │
      ▼
Workflow Engine
      │
      ├── Identity Verification
      │
      ├── Education Verification
      │
      └── Income Verification
             │
             ▼
       Integration Layer
             │
       ┌─────┼─────────┐
       ▼     ▼         ▼
    Identity Education Income
    System   System    System

The workflow engine communicates using the SetuX canonical data model.

26. Consent Dependency

Application processing can require consent.

Example:

Application
    │
    ▼
Consent Required?
    │
   YES
    │
    ▼
Consent Service
    │
    ▼
Citizen
 ┌──┴───┐
 ▼      ▼
ALLOW  DENY
 │      │
 ▼      ▼
Continue  Pause

If required consent has not been granted:

Application
     ↓
WAITING_FOR_CONSENT

The application API does not bypass the consent service.

27. Data Retrieval Dependency

After required consent:

Application
     │
     ▼
Consent Approved
     │
     ▼
Data Retrieval
     │
     ▼
Connector
     │
     ▼
External System
     │
     ▼
Normalized SetuX Data
     │
     ▼
Application Data

For education credentials, the connector may use:

DigiLocker

or:

Mock DigiLocker Provider

for the SIH prototype.

SetuX should not create a duplicate document repository.

28. Verification Results

The application detail response may expose normalized verification status.

Example:

{
  "verification": {
    "identity": {
      "status": "VERIFIED"
    },
    "education": {
      "status": "VERIFIED"
    },
    "income": {
      "status": "PROCESSING"
    }
  }
}

Possible verification statuses:

PENDING
PROCESSING
VERIFIED
FAILED
REQUIRES_ACTION

The frontend should use these statuses for the unified tracking UI.

29. Unified Application Tracking

Endpoint

GET /api/v1/applications/:applicationId/timeline

The citizen sees one timeline instead of navigating multiple departmental systems.

Example:

Scholarship
STX-2026-000001

✓ Identity Verification
✓ Education Verification
⏳ Income Verification
○ Officer Review
○ Final Decision

30. Timeline Response

{
  "success": true,
  "data": {
    "application_id": "uuid",
    "application_number": "STX-2026-000001",
    "current_status": "VERIFICATION",
    "current_step": "INCOME_VERIFICATION",
    "events": [
      {
        "event_type": "APPLICATION_CREATED",
        "created_at": "2026-08-29T09:00:00Z"
      },
      {
        "event_type": "CONSENT_GRANTED",
        "created_at": "2026-08-29T09:02:00Z"
      },
      {
        "event_type": "VERIFICATION_STARTED",
        "step": "IDENTITY_VERIFICATION",
        "created_at": "2026-08-29T09:03:00Z"
      },
      {
        "event_type": "VERIFICATION_COMPLETED",
        "step": "IDENTITY_VERIFICATION",
        "created_at": "2026-08-29T09:04:00Z"
      }
    ]
  }
}

31. Application Events

Important lifecycle events are stored in application_events.

Examples:

APPLICATION_CREATED
APPLICATION_UPDATED
CONSENT_REQUESTED
CONSENT_GRANTED
CONSENT_REVOKED
APPLICATION_SUBMITTED
VERIFICATION_STARTED
VERIFICATION_COMPLETED
DEPARTMENT_REQUEST_FAILED
DEPARTMENT_REQUEST_RETRIED
APPLICATION_STATUS_CHANGED
APPLICATION_APPROVED
APPLICATION_REJECTED
INFORMATION_REQUESTED

Events should be append-only.

32. Application Status vs Workflow Step

These are different concepts.

Application Status

Represents the high-level state:

DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED

Workflow Step

Represents the current processing operation:

IDENTITY_VERIFICATION
EDUCATION_VERIFICATION
INCOME_VERIFICATION
OFFICER_REVIEW
FINAL_DECISION

Example:

{
  "status": "SUBMITTED",
  "current_workflow_step": "EDUCATION_VERIFICATION"
}

This separation is important for unified tracking.

33. Failure Handling

External systems can fail.

The application itself should not be blindly marked as rejected.

Example:

SetuX
  │
  ▼
Income Department
  │
  ├── Success → Continue
  │
  ├── Timeout → Retry
  │
  ├── 5xx → Retry
  │
  └── Permanent business error → Failed

Operational states can include:

WAITING_FOR_DEPARTMENT
RETRYING
FAILED

After repeated infrastructure failure:

Retry
  ↓
Retry limit reached
  ↓
Dead Letter Queue
  ↓
Admin intervention

34. Idempotency

Submission and externally mutating operations must be protected against duplicate execution.

Recommended header:

Idempotency-Key: <unique-request-key>

Example:

POST /api/v1/applications/uuid/submit
Idempotency-Key: 5c0d7...

If the client retries because the network failed:

First request
     ↓
Application successfully submitted
     ↓
Response lost
     ↓
Client retries
     ↓
Same Idempotency-Key
     ↓
Do not submit twice

The application ID and request/correlation ID should also be propagated to downstream workflow operations.

35. Correlation ID

Each important request should have a correlation ID.

Example:

X-Correlation-ID: 8b8d4f...

If the client does not provide one, the backend can generate it.

The correlation ID should be associated with:

API request
Application event
Workflow execution
Integration request
Audit event

This allows the SIH demo to trace one application across multiple systems.

36. Transaction Strategy

Critical application writes should be atomic.

Example submission:

BEGIN

Update application status
Create application event
Create audit log
Create notification/event

COMMIT

If a critical database operation fails:

ROLLBACK

The client should not perform these writes separately.

37. Application API Security

Every application endpoint must:

Authenticate
    ↓
Authorize
    ↓
Validate ownership
    ↓
Validate request
    ↓
Validate application state
    ↓
Execute operation

Never trust:

client-side role
client-side user ID
client-side application status
client-side verification result
client-side permission

38. Citizen Authorization

Citizen can:

CREATE own application
READ own applications
UPDATE own draft applications
SUBMIT own application
READ own timeline
READ own verification status

Citizen cannot:

READ another citizen's application
APPROVE application
REJECT application
CHANGE application status directly
CHANGE verification result
BYPASS consent

39. Government Access Boundary

Government application review is exposed through the government application API/module.

Conceptually:

Citizen Application API
        │
        │ own applications
        ▼
    Application
        ▲
        │
        │ authorized department access
        │
Government Review API

A government officer should only see applications relevant to their authorized department.

40. Application + Government Review

The application lifecycle eventually reaches:

SUBMITTED
     ↓
UNDER_REVIEW
     ↓
┌─────────────┐
│             │
▼             ▼
APPROVED    REJECTED

The government officer's decision creates:

application_review
application_event
audit_log
notification

The application API then exposes the updated application state to the citizen.

41. Application + Notification

Important application changes can produce notification events.

Example:

Application Approved
       │
       ▼
Application Event
       │
       ├── Audit
       │
       └── Notification
               │
               ▼
            Citizen

The application module does not need to implement the notification delivery mechanism itself.

It emits the event required by the notification module.

42. API Endpoint Summary

Citizen Application APIs

POST   /api/v1/applications
GET    /api/v1/applications
GET    /api/v1/applications/:applicationId
PATCH  /api/v1/applications/:applicationId
POST   /api/v1/applications/:applicationId/submit
GET    /api/v1/applications/:applicationId/timeline

Related Modules

Consent:

GET    /api/v1/applications/:applicationId/consents
POST   /api/v1/applications/:applicationId/consents
DELETE /api/v1/applications/:applicationId/consent/:consentId

Data retrieval:

POST   /api/v1/applications/:applicationId/data/retrieve
GET    /api/v1/applications/:applicationId/data/retrievals
GET    /api/v1/applications/:applicationId/data

Government review:

GET    /api/v1/government/applications
GET    /api/v1/government/applications/:applicationId
POST   /api/v1/government/applications/:applicationId/review
POST   /api/v1/government/applications/:applicationId/approve
POST   /api/v1/government/applications/:applicationId/reject
POST   /api/v1/government/applications/:applicationId/request-information

These related endpoints belong to their respective modules and are listed here only to show the complete application lifecycle.

43. Error Format

All application errors follow the common SetuX API format.

{
  "success": false,
  "error": {
    "code": "APPLICATION_INVALID_STATE",
    "message": "The application cannot be submitted in its current state."
  },
  "request_id": "uuid"
}

44. Application Error Codes

APPLICATION_NOT_FOUND
APPLICATION_ACCESS_DENIED
APPLICATION_INVALID_STATE
APPLICATION_VALIDATION_ERROR
APPLICATION_ALREADY_SUBMITTED
APPLICATION_ALREADY_DECIDED
APPLICATION_NOT_READY
APPLICATION_MISSING_CONSENT
APPLICATION_MISSING_DATA
APPLICATION_VERIFICATION_PENDING
APPLICATION_VERIFICATION_FAILED
APPLICATION_SUBMISSION_FAILED
APPLICATION_DUPLICATE_REQUEST
APPLICATION_SERVICE_UNAVAILABLE

45. HTTP Status Codes

Status

Meaning

200

Successful read/update/submit

201

Application created

400

Invalid request

401

Missing/invalid authentication

403

Not authorized

404

Application not found

409

State/duplicate conflict

422

Validation failure

429

Rate limit

500

Internal server error

503

Dependency unavailable

46. Backend Module Structure

Recommended modular-monolith structure:

src/
│
├── modules/
│   │
│   ├── applications/
│   │   ├── application.routes.ts
│   │   ├── application.controller.ts
│   │   ├── application.service.ts
│   │   ├── application.validation.ts
│   │   ├── application.repository.ts
│   │   └── application.types.ts
│   │
│   ├── consent/
│   ├── workflow/
│   ├── integration/
│   ├── verification/
│   ├── review/
│   ├── notification/
│   └── audit/
│
├── middleware/
│   ├── auth.middleware.ts
│   ├── role.middleware.ts
│   └── error.middleware.ts
│
└── lib/
    └── supabase.ts

47. Application Service Responsibility

The application.service owns application business rules.

It should handle:

createApplication()
getApplication()
listApplications()
updateDraft()
validateSubmission()
submitApplication()
getTimeline()

It should not directly contain:

DigiLocker API logic
Income department API logic
Education department API logic
Government-specific data transformation

Those belong to the integration/connector layer.

48. Application Service Flow

Controller
    │
    ▼
Application Service
    │
    ├── Authorization
    ├── Ownership
    ├── State validation
    ├── Business rules
    │
    ├──────────────► Consent Service
    │
    ├──────────────► Workflow Engine
    │
    ├──────────────► Application Repository
    │
    └──────────────► Audit/Event Service

49. Database Mapping

Primary table:

applications

Related tables:

applications
     │
     ├── application_data
     ├── data_retrievals
     ├── consents
     ├── application_reviews
     └── application_events

Supporting tables:

services
service_requirements
data_sources
notifications
audit_logs

50. RLS / Database Security

Supabase RLS must reinforce application ownership.

Citizen policy concept:

auth.uid()
   =
applications.citizen_id

This means a citizen can only read/write their own permitted application records.

Government access should be constrained by authorized department/role.

Application status changes that affect workflow integrity should be performed through controlled backend operations rather than arbitrary client updates.

51. End-to-End Application Flow

Citizen
   │
   ▼
Citizen Dashboard
   │
   ▼
Select Scholarship
   │
   ▼
POST /applications
   │
   ▼
Application Created
   │
   ▼
STX-2026-000001
   │
   ▼
Draft Application
   │
   ▼
Consent Required
   │
   ▼
Citizen Grants Consent
   │
   ▼
Data Retrieval
   │
   ├───────────────┐
   ▼               ▼
DigiLocker     Government APIs
   │               │
   └───────┬───────┘
           ▼
    Canonical Data
           │
           ▼
      Verification
           │
           ├── Identity
           ├── Education
           └── Income
           │
           ▼
  READY_FOR_SUBMISSION
           │
           ▼
        Submit
           │
           ▼
       SUBMITTED
           │
           ▼
      UNDER_REVIEW
           │
      ┌────┴─────┐
      ▼          ▼
   APPROVED    REJECTED
      │          │
      └────┬─────┘
           ▼
       Notification
           │
           ▼
         Citizen

52. SIH Demo Scenario

The application API should support the complete demonstration:

1. Citizen logs in
        ↓
2. Citizen selects Scholarship
        ↓
3. SetuX creates STX application
        ↓
4. Citizen provides required application information
        ↓
5. SetuX requests consent
        ↓
6. Citizen approves
        ↓
7. SetuX retrieves required information
        ↓
8. Identity verification executes
        ↓
9. Education verification executes
        ↓
10. Income verification executes
        ↓
11. One external connector intentionally fails
        ↓
12. Retry/recovery occurs
        ↓
13. Application continues
        ↓
14. Citizen sees one unified timeline
        ↓
15. Government officer sees application
        ↓
16. Officer reviews application
        ↓
17. Officer approves/rejects
        ↓
18. Citizen sees final decision

This demonstrates the actual SetuX value:

Multiple systems
      ↓
SetuX orchestration
      ↓
One application
      ↓
One workflow
      ↓
One status

53. What the Application API Does NOT Do

The application API should not become a giant controller containing every SetuX feature.

It does not directly implement:

Authentication
Onboarding
DigiLocker API calls
Government API calls
Consent decision logic
Connector transformation logic
Notification delivery
Admin monitoring

Instead:

Application API
      │
      ├── Consent Module
      ├── Workflow Module
      ├── Integration Module
      ├── Verification Module
      ├── Review Module
      ├── Notification Module
      └── Audit Module

This keeps the modular monolith maintainable.

54. MVP Definition of Done

Application Creation

Citizen can create scholarship application

Unique application UUID generated

Human-readable application number generated

Application linked to authenticated citizen

Application created event recorded

Draft

Citizen can retrieve own application

Citizen can list own applications

Citizen can update draft application

Required fields validated

Unauthorized application access rejected

Submission

Submission endpoint implemented

Required data checked

Consent checked

Verification state checked

Valid state transition enforced

Submission is atomic

Idempotency supported

Application event recorded

Workflow

Workflow initialized

Current workflow step stored

Verification states exposed

Waiting/retrying states supported

Workflow failures handled without blindly rejecting application

Tracking

Application status available

Current workflow step available

Timeline endpoint available

Application events recorded

Citizen sees unified progress

Security

JWT authentication required

Citizen ownership enforced

RLS enabled

Client cannot modify protected status

Government actions separated from citizen APIs

Sensitive data excluded from logs

55. Final Application Architecture

                         SETUX
                           │
                           ▼
                  ┌─────────────────┐
                  │ Application API │
                  └────────┬────────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
     Application       Consent          Workflow
       Service          Service           Engine
          │                │                 │
          │                │                 ▼
          │                │          Integration Layer
          │                │                 │
          │                │        ┌────────┼────────┐
          │                │        ▼        ▼        ▼
          │                │     Identity Education Income
          │                │      System    System   System
          │                │
          └────────────────┼──────────────────────┐
                           ▼                      │
                      PostgreSQL                 │
                           │                      │
             ┌─────────────┼──────────────┐       │
             ▼             ▼              ▼       │
        applications   application_data  events    │
             │                                    │
             ▼                                    │
       Government Review ◄────────────────────────┘
             │
        ┌────┴─────┐
        ▼          ▼
     APPROVED   REJECTED
        │          │
        └────┬─────┘
             ▼
       Notification
             │
             ▼
          Citizen

56. Final Design Principle

The application API is the orchestration entry point for the citizen's service request, not the place where every government integration is implemented.

The core principle is:

One application record represents one citizen service request. SetuX coordinates the consent, data retrieval, verification, workflow, and government review around that application while exposing one unified status to the citizen.
