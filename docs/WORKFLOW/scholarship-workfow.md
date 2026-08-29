SetuX — Scholarship Workflow

Version: 1.0
Project: SetuX SIH Prototype
Workflow: Unified Scholarship Application
Architecture: Modular Monolith
Backend: Node.js + TypeScript + Supabase/PostgreSQL

1. Purpose

This document defines the end-to-end scholarship workflow for the SetuX SIH prototype.

The prototype is intentionally focused on one scholarship journey rather than trying to implement every government service.

The core demonstration is:

One Citizen
    ↓
One Application
    ↓
One Consent Flow
    ↓
Multiple Verification Systems
    ↓
One Unified Workflow
    ↓
One Officer Review
    ↓
One Final Decision
    ↓
One Status for the Citizen

This directly represents the central SetuX prototype objective: one scholarship application triggering multiple system interactions while SetuX coordinates them behind a unified interface.

2. Problem Being Solved

A scholarship process can require information from multiple systems:

                    CITIZEN
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Identity        Education          Income
    System          System            System
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                Scholarship Dept.

Without SetuX, the citizen may experience:

repeated data submission

multiple systems

different verification processes

fragmented status tracking

manual coordination

delays when an external system is unavailable

SetuX solves the coordination and orchestration problem, not by replacing the underlying systems, but by connecting them through a common workflow.

3. Scope

In Scope

The SIH MVP supports:

Citizen authentication

Citizen profile

Scholarship discovery

Application creation

Application data collection

Consent management

Identity verification

Education verification

Income verification

Workflow orchestration

Unified application tracking

Officer review

Approve / reject / request information

Notifications

Audit trail

External-system failure handling

The PRD explicitly identifies identity, education and income as the three verification systems required for the prototype.

4. Out of Scope

The scholarship workflow does not attempt to build:

a national scholarship platform

every scholarship scheme

real government databases

a replacement for DigiLocker

an Aadhaar replacement

a PAN replacement

dozens of live government integrations

AI-based scholarship decisions

blockchain infrastructure

microservices infrastructure

External systems may be simulated for the SIH demonstration while the SetuX orchestration and interoperability layer remains real.

5. Actors

┌─────────────────────────────────────┐
│              ACTORS                 │
├─────────────────────────────────────┤
│ CITIZEN                             │
│ OFFICER                             │
│ ADMIN                               │
│ EXTERNAL SYSTEMS                    │
└─────────────────────────────────────┘

Citizen

Starts and tracks the scholarship application.

Officer

Reviews verified application information and makes the government-side decision.

Admin

Monitors system/integration health and failures.

External Systems

Provide information required for verification.

For the prototype:

Identity      → Mock Identity API
Education     → DigiLocker / Mock Education API
Income        → Mock Income API

6. High-Level Workflow

                         CITIZEN
                            │
                            ▼
                         LOGIN
                            │
                            ▼
                   CITIZEN DASHBOARD
                            │
                            ▼
                  SELECT SCHOLARSHIP
                            │
                            ▼
                    START APPLICATION
                            │
                            ▼
                     APPLICATION DRAFT
                            │
                            ▼
                     CONSENT REQUEST
                            │
                  ┌─────────┴─────────┐
                  │                   │
                DENY                ALLOW
                  │                   │
                  ▼                   ▼
              WORKFLOW             WORKFLOW
               PAUSED             CONTINUES
                                      │
                                      ▼
                           IDENTITY VERIFICATION
                                      │
                                      ▼
                           EDUCATION VERIFICATION
                                      │
                                      ▼
                             INCOME VERIFICATION
                                      │
                                      ▼
                              OFFICER REVIEW
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                      APPROVE       REJECT       REQUEST
                                                   INFO
                         │            │            │
                         └────────────┴────────────┘
                                      │
                                      ▼
                              FINAL APPLICATION
                                  STATUS
                                      │
                                      ▼
                                   CITIZEN

7. Application Lifecycle

The application itself moves through a controlled state machine.

DRAFT
  │
  ▼
CONSENT_PENDING
  │
  ├──────── DENIED ───────► PAUSED
  │                           │
  │                           └── Citizen grants consent
  │                                      │
  └──────── ALLOWED ─────────────────────┘
                                      │
                                      ▼
                              VERIFICATION_PENDING
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
                         ┌────────────┴────────────┐
                         │                         │
                      FAILED                    PASSED
                         │                         │
                         ▼                         ▼
                WAITING_FOR_EXTERNAL         OFFICER_REVIEW
                    / RETRY                       │
                                                   │
                                      ┌────────────┼────────────┐
                                      ▼            ▼            ▼
                                   APPROVED      REJECTED    INFO_REQUIRED
                                      │            │            │
                                      ▼            ▼            ▼
                                  COMPLETED      CLOSED       PAUSED

The exact database enum/state names should remain consistent with the implementation.

8. Step 1 — Citizen Login

The citizen first authenticates through the SetuX authentication system.

Citizen
   ↓
Login
   ↓
Supabase Auth
   ↓
Authenticated Session
   ↓
SetuX Backend
   ↓
Resolve Role
   ↓
Citizen Dashboard

Only an authenticated CITIZEN can create a citizen scholarship application.

9. Step 2 — Scholarship Selection

The citizen sees the available scholarship service.

Example:

┌──────────────────────────────────┐
│ Scholarship Assistance Program   │
│                                  │
│ Eligibility: Student             │
│                                  │
│ Required verification:           │
│ ✓ Identity                       │
│ ✓ Education                      │
│ ✓ Income                         │
│                                  │
│ [ Start Application ]            │
└──────────────────────────────────┘

The scholarship service defines which information and verification steps are required.

10. Step 3 — Create Application

When the citizen selects Start Application, SetuX creates an application.

Example:

Application ID:
STX-APP-001

Conceptually:

Citizen
   │
   ▼
POST /api/v1/applications
   │
   ▼
Create Application
   │
   ├── citizen_id
   ├── service_id
   ├── status = DRAFT
   ├── current_step
   └── created_at

The application becomes the central object around which all workflow events are associated.

11. Step 4 — Application Data

The citizen provides information required specifically by the scholarship.

Important design rule:

Do not collect scholarship-specific information during generic onboarding.

Onboarding creates the SetuX profile. Scholarship data belongs to the scholarship workflow.

Possible scholarship information:

Academic information
Course information
Institution information
Scholarship-specific declarations
Other required fields

The exact fields should be based on the selected prototype scholarship.

12. Step 5 — Consent

Before SetuX accesses information from connected systems, the citizen is asked for consent.

Example:

┌─────────────────────────────────────┐
│ Education Information               │
│                                     │
│ SetuX wants to access your          │
│ education credential for            │
│ scholarship verification.           │
│                                     │
│ Purpose: Scholarship Verification   │
│                                     │
│ [ Deny ]          [ Allow Access ] │
└─────────────────────────────────────┘

Consent is application-specific.

It is not a blanket agreement to share all future data.

13. Consent Decision

              CONSENT REQUEST
                     │
              ┌──────┴──────┐
              ▼             ▼
            ALLOW          DENY
              │             │
              ▼             ▼
        Access allowed    No access
              │             │
              ▼             ▼
       Workflow continues  Workflow pauses

If consent is denied:

Data must NOT be accessed.

The application remains in a state where the citizen can understand what is blocking progress.

14. Step 6 — Workflow Initialization

After the required consent is available:

Application
     │
     ▼
Workflow Engine
     │
     ▼
Create workflow steps
     │
     ├── Identity
     ├── Education
     ├── Income
     └── Officer Review

Each step maintains its own execution state.

15. Workflow Step Model

Every workflow step should conceptually contain:

step_id
application_id
step_type
status
started_at
completed_at
result
error
retry_count

Example:

{
  "step_type": "EDUCATION_VERIFICATION",
  "status": "COMPLETED",
  "result": {
    "verificationStatus": "VERIFIED"
  }
}

16. Step 7 — Identity Verification

SetuX invokes the identity connector.

Workflow Engine
      │
      ▼
Identity Connector
      │
      ▼
Identity System
      │
      ▼
Raw Response
      │
      ▼
Mapper
      │
      ▼
Canonical SetuX Result

Example canonical result:

{
  "citizenId": "C123",
  "name": "Rahul Kumar",
  "verificationStatus": "VERIFIED"
}

The workflow engine only understands the canonical SetuX format.

17. Step 8 — Education Verification

Education information is retrieved through the education provider.

Preferred architecture:

SetuX
   ↓
Education Connector
   ↓
DigiLocker
   ↓
Authorized Credential
   ↓
SetuX

Fallback for the SIH prototype:

SetuX
   ↓
Education Connector
   ↓
Mock Education Provider

SetuX should not become a document repository.

The document/credential remains with the appropriate external provider.

18. Step 9 — Income Verification

Workflow Engine
      │
      ▼
Income Connector
      │
      ▼
Mock Income API
      │
      ▼
Raw Income Response
      │
      ▼
Mapper
      │
      ▼
Canonical Income Result

Example:

{
  "citizenId": "C123",
  "incomeVerified": true,
  "annualIncome": 180000,
  "verificationStatus": "VERIFIED"
}

Sensitive values should only be retained when actually required by the prototype and should not be unnecessarily exposed to the officer UI.

19. Connector Architecture

The workflow engine must not directly call external systems.

Incorrect:

Workflow
   ↓
DigiLocker API

Correct:

Workflow
   ↓
Education Connector Interface
   ↓
Provider Adapter
   ↓
External System

For example:

EducationProvider
       │
       ├── DigiLockerProvider
       │
       └── MockEducationProvider

Similarly:

IdentityProvider
       │
       └── MockIdentityProvider

IncomeProvider
       │
       └── MockIncomeProvider

This keeps the workflow independent of external API details.

20. Canonical Data Model

External systems may return different structures.

Example:

Identity API
{
  "aadhaar_name": "Rahul Kumar",
  "verification": "SUCCESS"
}

Education API:

{
  "student_name": "Rahul Kumar",
  "credential_valid": true
}

SetuX converts both to:

{
  "citizenId": "C123",
  "name": "Rahul Kumar",
  "verificationStatus": "VERIFIED"
}

Therefore:

External API
      ↓
Connector
      ↓
Mapper
      ↓
Canonical SetuX Model
      ↓
Workflow Engine

21. Verification Dependency

For the MVP, the workflow can execute verification sequentially:

Identity
   ↓
Education
   ↓
Income
   ↓
Officer Review

This makes the demo easy to understand.

A future optimization could execute independent checks concurrently:

              ┌── Identity ──┐
              │              │
Workflow ─────┼── Education ─┼──► Officer Review
              │              │
              └── Income ────┘

Do not introduce unnecessary parallel-processing complexity into the first prototype unless required.

22. Verification Result Handling

Each verification produces a normalized result:

VERIFIED
FAILED
PENDING
UNAVAILABLE

Example:

Identity       ✓ VERIFIED
Education      ✓ VERIFIED
Income         ⏳ PENDING

The overall workflow should not be marked completed until all required verification steps succeed.

23. External Failure Handling

External systems are unreliable.

Example:

SetuX
  ↓
Income API
  ↓
TIMEOUT

SetuX should not immediately destroy the application.

Instead:

Attempt 1
   ↓
FAILED
   ↓
Retry
   ↓
Attempt 2
   ↓
FAILED
   ↓
Retry
   ↓
Attempt 3
   ↓
FAILED
   ↓
WAITING_FOR_EXTERNAL_SYSTEM

The application remains recoverable.

24. Retry Model

Conceptually:

MAX_RETRIES = 3

Each attempt should record:

attempt_number
started_at
completed_at
status
error
response/reference

Example:

Income Verification

Attempt 1 → Timeout
Attempt 2 → Timeout
Attempt 3 → Timeout

Status → WAITING_FOR_EXTERNAL_SYSTEM

The administrator can see the failure and retry/recover according to the prototype's admin workflow.

25. Consent Failure vs External Failure

These are different situations.

Consent denied

Citizen decision
     ↓
DENIED
     ↓
No external request
     ↓
Workflow PAUSED

External system failure

Citizen consent
     ↓
External request made
     ↓
System failure
     ↓
Retry / waiting state

This distinction must be preserved in both the database and UI.

26. Step 10 — Officer Review

After all required verifications succeed:

Verification Complete
       ↓
Officer Review Queue
       ↓
Officer Dashboard

Officer sees:

STX-APP-001
────────────────────────
Applicant
Verification Results
Education Status
Income Status
Application Data
Application History

The officer does not need to manually contact multiple departments.

SetuX has already coordinated the verification workflow.

27. Officer Actions

The officer can perform:

APPROVE
REJECT
REQUEST_INFORMATION

Approve

Officer
  ↓
Approve
  ↓
Application = APPROVED
  ↓
Citizen notified

Reject

Officer
  ↓
Reject
  ↓
Application = REJECTED
  ↓
Reason recorded
  ↓
Citizen notified

Request Information

Officer
  ↓
Request Information
  ↓
Application = INFO_REQUIRED
  ↓
Citizen notified
  ↓
Citizen provides information
  ↓
Workflow resumes

28. Final Decision

The final decision must be an explicit state transition.

OFFICER_REVIEW
      │
      ├──── APPROVE ────► APPROVED
      │
      ├──── REJECT ─────► REJECTED
      │
      └──── REQUEST ────► INFO_REQUIRED

Every decision should record:

officer_id
application_id
decision
reason
timestamp

29. Unified Application Tracking

The citizen should never need to inspect separate systems.

Example:

┌────────────────────────────────────┐
│ Scholarship                        │
│ STX-APP-001                        │
├────────────────────────────────────┤
│                                    │
│ Identity          ✓ Verified       │
│ Education         ✓ Verified       │
│ Income            ✓ Verified       │
│ Officer Review    ✓ Completed      │
│ Final Decision    ✓ Approved       │
│                                    │
│ Overall: APPROVED                  │
└────────────────────────────────────┘

This unified status is one of the strongest visible benefits of SetuX.

30. Application Status vs Workflow Step

These must not be confused.

Application status

Represents the overall application:

DRAFT
PROCESSING
INFO_REQUIRED
UNDER_REVIEW
APPROVED
REJECTED
PAUSED

Workflow step

Represents a specific operation:

IDENTITY_VERIFICATION
EDUCATION_VERIFICATION
INCOME_VERIFICATION
OFFICER_REVIEW

Example:

Application:
PROCESSING

Current step:
INCOME_VERIFICATION

Income step:
WAITING_FOR_EXTERNAL_SYSTEM

31. Notifications

The prototype should support in-app notifications.

Important events:

Application submitted
Verification completed
Additional information required
Application approved
Application rejected
External system delayed

Example:

🔔 Income verification is taking longer than expected.

Email notifications are optional for the MVP.

32. Audit Trail

Important workflow operations must create audit records.

Example:

10:01  User logged in
10:03  Application created
10:04  Consent granted
10:05  Identity verification requested
10:06  Identity verified
10:07  Education credential accessed
10:08  Education verified
10:09  Income verification requested
10:12  Income API timeout
10:15  Income verification recovered
10:17  Officer reviewed application
10:18  Application approved

Audit information should capture:

WHO
WHAT
WHEN
APPLICATION
RESULT

33. Database Workflow Relationship

Conceptually:

Citizen
   │
   ▼
Application
   │
   ├──────── Consent
   │
   ├──────── Application Data
   │
   ├──────── Workflow
   │              │
   │              ├── Identity Verification
   │              ├── Education Verification
   │              ├── Income Verification
   │              └── Officer Review
   │
   ├──────── Application Events
   │
   ├──────── Notifications
   │
   └──────── Audit Logs

The application is the central aggregate for the scholarship journey.

34. End-to-End Backend Flow

POST /applications
        │
        ▼
Create Application
        │
        ▼
Create Workflow
        │
        ▼
Request Consent
        │
        ▼
Citizen Allows
        │
        ▼
Workflow Engine
        │
        ▼
Identity Connector
        │
        ▼
Normalize Result
        │
        ▼
Education Connector
        │
        ▼
Normalize Result
        │
        ▼
Income Connector
        │
        ▼
Normalize Result
        │
        ▼
All Required Checks Passed?
        │
    ┌───┴───┐
   NO      YES
    │        │
    ▼        ▼
Retry /    Officer
Pause      Review
             │
        ┌────┴────┐
        ▼         ▼
     Approve    Reject
        │         │
        └────┬────┘
             ▼
       Update Status
             │
             ▼
        Audit Event
             │
             ▼
        Notification
             │
             ▼
          Citizen

35. API-Level Workflow

The workflow can be exposed through APIs such as:

POST   /api/v1/applications
GET    /api/v1/applications
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
POST   /api/v1/applications/:id/submit

GET    /api/v1/applications/:id/workflow
GET    /api/v1/applications/:id/events

GET    /api/v1/applications/:id/consents
POST   /api/v1/applications/:id/consents/:consentId/decision

GET    /api/v1/government/applications
GET    /api/v1/government/applications/:id
POST   /api/v1/government/applications/:id/approve
POST   /api/v1/government/applications/:id/reject
POST   /api/v1/government/applications/:id/request-information

Exact endpoint contracts are defined separately in application-api.md and related API specifications.

36. Workflow Engine Responsibility

The workflow engine is responsible for:

determining the next step

starting workflow steps

calling the appropriate connector

interpreting canonical results

updating step status

handling failures

triggering retries

moving the application forward

stopping the workflow when required

creating workflow events

The workflow engine should not contain provider-specific API logic.

Incorrect:

workflow.ts
   └── DigiLocker HTTP request

Correct:

workflow.ts
   ↓
EducationProvider
   ↓
DigiLockerAdapter

37. State Transition Rules

The backend must enforce valid transitions.

Example:

DRAFT
  → CONSENT_PENDING

CONSENT_PENDING
  → PROCESSING
  → PAUSED

PROCESSING
  → UNDER_REVIEW
  → WAITING_FOR_EXTERNAL_SYSTEM
  → PAUSED

WAITING_FOR_EXTERNAL_SYSTEM
  → PROCESSING

UNDER_REVIEW
  → APPROVED
  → REJECTED
  → INFO_REQUIRED

INFO_REQUIRED
  → PROCESSING

APPROVED
  → terminal

REJECTED
  → terminal

The frontend must never directly set arbitrary application states.

38. Idempotency

Workflow operations should be safe against duplicate execution.

Example:

Income verification request
        ↓
Network timeout
        ↓
Client retries

SetuX must avoid accidentally creating two logical verification executions for the same workflow step.

Use an internal operation/reference identifier where appropriate.

Conceptually:

application_id
+
workflow_step_id
+
operation_id

39. Transaction Boundaries

Database updates that represent a single logical state transition should be atomic.

Example:

Verification succeeds
        │
        ├── Update verification result
        ├── Mark workflow step completed
        ├── Move application to next state
        └── Create workflow event

These related database changes should be designed so that the system does not leave an inconsistent state.

External API calls should not be held inside long-running database transactions.

40. Security Rules

The workflow must enforce:

Citizen
   → only own applications

Officer
   → only authorized department applications

Admin
   → system monitoring / privileged operations

Additionally:

authentication is required

role is resolved server-side

consent must exist before protected data access

external credentials/tokens must not be exposed to the frontend

sensitive values should be minimized

every important action is auditable

41. Real vs Simulated Workflow Components

Component

SIH Prototype

SetuX backend

Real

Database

Real

Authentication

Real

RBAC

Real

Consent

Real

Workflow engine

Real

Application tracking

Real

Audit

Real

Connector architecture

Real

Identity API

Simulated

Income API

Simulated

Education API

Simulated / DigiLocker

Legacy system

Simulated

The important point is:

We simulate the external departments, not the SetuX interoperability logic.

42. Failure Scenario for SIH Demo

A strong demonstration should intentionally show one failure.

Citizen
   ↓
Scholarship Application
   ↓
Consent
   ↓
Identity ✓
   ↓
Education ✓
   ↓
Income
   ↓
TIMEOUT
   ↓
Retry 1
   ↓
Retry 2
   ↓
Recovery
   ↓
Income ✓
   ↓
Officer Review
   ↓
Approved

Then show the admin/system view:

Income Connector
Status: RECOVERED
Previous failures: 2
Application: STX-APP-001

This demonstrates that an external failure does not destroy the entire application.

43. Consent-Denied Demo

The second useful demonstration:

Citizen
   ↓
Scholarship
   ↓
Consent Request
   ↓
DENY
   ↓
Education data NOT accessed
   ↓
Workflow PAUSED

Then:

Citizen
   ↓
Review consent
   ↓
ALLOW
   ↓
Workflow resumes

This proves that consent is an actual control point rather than a decorative UI element.

44. Normal Success Scenario

The primary SIH demo:

LOGIN
  ↓
SCHOLARSHIP
  ↓
START APPLICATION
  ↓
CONSENT
  ↓
ALLOW
  ↓
IDENTITY ✓
  ↓
EDUCATION ✓
  ↓
INCOME ✓
  ↓
OFFICER REVIEW
  ↓
APPROVE
  ↓
CITIZEN DASHBOARD
  ↓
APPROVED

This is the cleanest representation of the SetuX value proposition.

45. Final Architecture Diagram

                         ┌───────────────┐
                         │    CITIZEN    │
                         └───────┬───────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Citizen UI      │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ SetuX API Layer │
                        └────────┬────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
          Application         Consent          Workflow
             Module            Module            Engine
                │                │                │
                │                │         ┌──────┼──────┐
                │                │         ▼      ▼      ▼
                │                │     Identity Education Income
                │                │         │      │      │
                │                │         ▼      ▼      ▼
                │                │      External Providers
                │                │
                └────────────────┼────────────────┘
                                 │
                                 ▼
                         PostgreSQL / Supabase
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
              Audit          Events         Notifications
                                 │
                                 ▼
                         Officer Dashboard
                                 │
                          ┌──────┴──────┐
                          ▼             ▼
                       APPROVE       REJECT
                          │             │
                          └──────┬──────┘
                                 ▼
                           Final Status
                                 │
                                 ▼
                              CITIZEN

46. Definition of Done

Citizen

Citizen can log in

Citizen can see scholarship service

Citizen can create an application

Citizen can save application data

Citizen can submit application

Citizen receives consent request

Citizen can allow/deny consent

Citizen can see verification progress

Citizen can see final decision

Workflow

Application creates workflow

Identity verification executes

Education verification executes

Income verification executes

External results are normalized

Workflow advances automatically

Failed external requests can retry

Workflow can pause

Workflow can resume

Final review state is reached

Officer

Officer sees application queue

Officer can open application

Officer sees verification results

Officer can approve

Officer can reject

Officer can request information

Decision is recorded

System

Application events recorded

Audit events recorded

Notifications generated

External failures visible

Citizen sees unified status

Unauthorized users cannot access protected operations

47. Core Principle

The entire scholarship workflow should communicate one architectural idea:

WITHOUT SETUX

Citizen
 ├── Identity System
 ├── Education System
 ├── Income System
 ├── Scholarship System
 └── Multiple status locations


WITH SETUX

Citizen
       │
       ▼
    SETUX
       │
       ├── Identity
       ├── Education
       ├── Income
       └── Scholarship Department
       │
       ▼
 ONE APPLICATION
 ONE WORKFLOW
 ONE STATUS

SetuX does not replace these systems.

SetuX connects them, obtains consent, normalizes their responses, orchestrates the workflow, handles failures, and presents the citizen with one unified scholarship journey.