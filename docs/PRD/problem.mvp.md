SetuX — SIH Prototype PRD

Version: 1.0
Product: SetuX
Prototype Focus: Cross-department Scholarship Application
Architecture: Modular Monolith
Primary Goal: Demonstrate secure interoperability and workflow orchestration across existing/ simulated government systems.

1. Product Vision
SetuX

A secure interoperability layer that connects existing government systems and orchestrates a complete citizen service through one unified workflow.

For the SIH prototype, SetuX will demonstrate this using one scholarship application.

We are not building a general-purpose government super-app.

We are proving that:

A citizen can complete a complex, multi-department process through one interface while SetuX coordinates the underlying systems.

2. Problem

A scholarship application may require information from multiple sources:

                    STUDENT
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
 Identity          Education          Income
 System            System             System
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                Scholarship Dept.

The citizen can face:

repeated information submission
multiple systems
different verification processes
fragmented status tracking
manual coordination
delays when one system is unavailable
SetuX solves the coordination problem.
3. Prototype Objective

The prototype must demonstrate:

One scholarship application → multiple system interactions → one unified workflow → one application status.

The prototype should prove:

1. Interoperability

SetuX can communicate with different external systems.

2. Consent

Citizen controls whether required information can be accessed/shared.

3. Orchestration

SetuX automatically executes the required verification steps.

4. Standardization

Different external data formats are converted into a common SetuX format.

5. Resilience

External failures don't automatically destroy the entire application.

6. Unified experience

The citizen sees one application and one status.

4. Primary User
Student / Citizen

The citizen is the primary user of the prototype.

They should be able to:

Login
View scholarship service
Start application
Provide required information
Give consent
Authorize/access required credentials
Track verification
See final application status
5. Secondary Users
Department Officer

The officer should be able to:

view applications
view verification results
review application
approve/reject application
Administrator

The administrator should be able to:

monitor integrations
view failed requests
inspect audit logs
see system status
6. Core User Journey

This is the single most important flow in the entire prototype.

Student
   │
   ▼
Login
   │
   ▼
Scholarship Service
   │
   ▼
Start Application
   │
   ▼
Consent
   │
   ▼
Identity Verification
   │
   ▼
Education Verification
   │
   ▼
Income Verification
   │
   ▼
Officer Review
   │
   ▼
Final Decision
   │
   ▼
Student
7. Feature Scope
Feature 1 — Authentication
Goal

Allow users to securely access SetuX.

MVP functionality
Login
Logout
Session/token management
Role identification
Roles
CITIZEN
OFFICER
ADMIN
8. Feature 2 — Citizen Profile

SetuX maintains basic information required for the workflow.

Example:

Citizen Profile

Name
Date of Birth
Contact
Address
Citizen ID
Important

This is not a document repository.

We are not rebuilding DigiLocker.

9. Feature 3 — Scholarship Application

Citizen selects:

Scholarship
     ↓
Apply

SetuX creates:

Application ID
STX-APP-001

Application contains:

Citizen
Service
Status
Created At
Current Workflow Step
Verification Results
10. Feature 4 — Consent Management

Before accessing required information:

SetuX
  │
  ▼
Consent Request
  │
  ▼
Citizen
  │
 ┌┴─────────┐
 ▼          ▼
ALLOW      DENY

Consent record:

Citizen
Application
Data Requested
Purpose
Recipient
Timestamp
Status
Example

"Allow SetuX to request your education credential for scholarship verification?"

Citizen:

Allow

Workflow continues.

11. Feature 5 — DigiLocker Integration

For the prototype, SetuX should not store its own education-document repository.

Instead:

SetuX
  ↓
DigiLocker Connector
  ↓
DigiLocker
  ↓
Authorized Credential
  ↓
SetuX

For SIH:

Preferred

Real DigiLocker integration if appropriate access/credentials are available.

Fallback

Mock DigiLocker connector.

The architecture must support both.

EducationProvider
       │
       ├── DigiLocker
       │
       └── Mock Provider
12. Feature 6 — Government Connectors

SetuX connects to external systems through adapters.

                    SETUX
                      │
              Integration Layer
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
 Identity         Education        Income
 Connector        Connector        Connector
       │              │              │
       ▼              ▼              ▼
 Mock API /       DigiLocker /     Mock API /
 External         Mock Provider    External

For the prototype, we only need three verification systems.

Identity
verifyIdentity()
Education
verifyEducation()
Income
verifyIncome()
13. Feature 7 — Canonical Data Model

External systems may have different formats.

SetuX normalizes them.

External System
      ↓
Connector
      ↓
Mapper
      ↓
SetuX Canonical Model

Example:

{
  "citizenId": "C123",
  "name": "Rahul Kumar",
  "verificationStatus": "VERIFIED"
}

The workflow engine only understands the SetuX model.

It does not need to understand each department's internal API.

14. Feature 8 — Workflow Engine

This is the core of the prototype.

Scholarship workflow:

START
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

Each step has:

Step ID
Status
Started At
Completed At
Result
Error
15. Feature 9 — Unified Application Tracking

Citizen sees:

┌─────────────────────────────────┐
│ Scholarship                     │
│ STX-APP-001                     │
├─────────────────────────────────┤
│                                 │
│ Identity          ✓ Verified    │
│ Education         ✓ Verified    │
│ Income            ⏳ Processing │
│ Officer Review    ○ Pending     │
│ Final Decision    ○ Pending     │
│                                 │
│ Overall: PROCESSING             │
└─────────────────────────────────┘

This is one of the strongest visible benefits of SetuX.

16. Feature 10 — Officer Dashboard

Officer sees:

Applications
────────────────────────
STX-APP-001   Processing
STX-APP-002   Pending
STX-APP-003   Review

Selecting an application:

Applicant
Verification results
Documents/credentials status
Income status
Education status
Application history

Officer can:

APPROVE
REJECT
REQUEST INFORMATION
17. Feature 11 — Failure Handling

We deliberately demonstrate this in the prototype.

Example:

SetuX
  ↓
Income System
  ↓
TIMEOUT

SetuX:

Attempt 1 → Failed
Attempt 2 → Failed
Attempt 3 → Failed

Then:

Status:

WAITING_FOR_EXTERNAL_SYSTEM

Admin sees:

⚠ Income Connector
   Timeout

Retry count: 3
Application: STX-APP-001

This demonstrates that SetuX can handle unreliable external systems.

18. Feature 12 — Audit Logs

Every important operation is recorded.

Example:

10:01  User logged in
10:03  Scholarship application created
10:04  Consent granted
10:05  Identity verification requested
10:06  Identity verified
10:07  Education credential accessed
10:08  Education verified
10:09  Income verification requested

Audit record:

WHO
WHAT
WHEN
APPLICATION
RESULT
19. Feature 13 — Notifications

Prototype notifications:

Application submitted
Verification completed
Additional information required
Application approved
Application rejected
External system delayed

For MVP:

In-app notifications are enough.

Email can be added if time permits.

20. Admin Dashboard

Admin sees:

SETUX SYSTEM

Applications              124
Completed                  87
Processing                 27
Failed                      3

Connector Health

Identity       ✓
Education      ✓
Income         ⚠
DigiLocker     ✓

And:

Recent Failures

Income API
STX-APP-001
Timeout
Retry: 3
21. End-to-End Architecture
                         STUDENT
                            │
                            ▼
                     WEB APPLICATION
                            │
                            ▼
                    ┌───────────────┐
                    │ SETUX BACKEND │
                    │               │
                    │ Identity      │
                    │ Profile       │
                    │ Consent       │
                    │ Application   │
                    │ Workflow      │
                    │ RBAC          │
                    └───────┬───────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Integration Hub  │
                  └────────┬─────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        Identity       DigiLocker       Income
        Connector       Connector       Connector
            │              │              │
            ▼              ▼              ▼
        Mock Govt      DigiLocker     Mock Govt
         System          /Mock         System
                        Provider

Database:

                 SETUX BACKEND
                      │
                      ▼
                 PostgreSQL
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
    Citizens     Applications     Workflows
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                   Consent
                      │
                      ▼
                  Audit Logs
22. Technology Stack

For the prototype:

Frontend

React + TypeScript

Backend

Node.js + TypeScript

API

REST

Database

PostgreSQL

Authentication

JWT/session-based authentication

External integration

REST + mock legacy-style API

Queue

Initially optional.

If the workflow requires asynchronous processing:

RabbitMQ

Cache

Redis, only where useful.

Deployment

Docker

23. Backend Architecture

The backend will be a modular monolith.

src/
│
├── modules/
│   ├── identity/
│   ├── profile/
│   ├── rbac/
│   ├── consent/
│   ├── application/
│   └── workflow/
│
├── integrations/
│   ├── digilocker/
│   ├── identity/
│   ├── education/
│   └── income/
│
├── audit/
├── notifications/
├── database/
├── middleware/
├── config/
└── common/

One deployment.

Clear module boundaries.

24. What We Are NOT Building

This section should be strictly enforced.

Out of scope

❌ Full national government platform

❌ Every government service

❌ Replacing DigiLocker

❌ Building our own document vault

❌ Replacing Aadhaar

❌ Replacing PAN

❌ Building real government databases

❌ Integrating dozens of real government APIs

❌ National-scale infrastructure

❌ Production-grade identity federation

❌ AI-based government decision-making

❌ Blockchain

❌ Complex microservice infrastructure

These can be future possibilities, not SIH MVP requirements.

25. What will be real vs simulated?

This needs to be explicitly stated in your presentation.

Component	Prototype
SetuX backend	Real
Database	Real
Authentication	Real
RBAC	Real
Consent	Real
Workflow engine	Real
Application tracking	Real
Audit	Real
Connector architecture	Real
Identity API	Simulated
Income API	Simulated
Education API	Simulated / DigiLocker
Legacy system	Simulated
Government databases	Not used

The important point is:

We are simulating the external departments, not the SetuX interoperability logic.

26. Success Criteria

The prototype is successful if we can demonstrate:

Scenario 1 — Normal application
Login
 ↓
Apply
 ↓
Consent
 ↓
Identity ✓
 ↓
Education ✓
 ↓
Income ✓
 ↓
Officer Review
 ↓
Approved
Scenario 2 — External failure
Income API
 ↓
Timeout
 ↓
Retry
 ↓
Retry
 ↓
Recovery
 ↓
Workflow continues
Scenario 3 — Consent denied
SetuX requests consent
 ↓
Citizen DENIES
 ↓
Data is NOT accessed
 ↓
Workflow pauses
Scenario 4 — Unified tracking

Citizen sees the entire application status from one dashboard.

27. The SIH Demo

Your demo should be approximately:

                 STUDENT
                    │
                    ▼
              LOGIN TO SETUX
                    │
                    ▼
          APPLY FOR SCHOLARSHIP
                    │
                    ▼
             CONSENT REQUEST
                    │
                    ▼
               ALLOW ACCESS
                    │
                    ▼
          ┌──────────────────┐
          │  SETUX WORKFLOW  │
          └────────┬─────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
    Identity    DigiLocker   Income
       ✓           ✓           ✓
       └───────────┼───────────┘
                   ▼
             OFFICER REVIEW
                   │
                   ▼
                APPROVED
                   │
                   ▼
             STUDENT DASHBOARD

Then show the failure scenario.

That will make the interoperability concept tangible.

28. Product KPIs for the Prototype

Don't make unrealistic claims like "90% faster."

Instead measure your prototype.

Citizen-side
Number of separate portals visited: before vs SetuX
Number of repeated data-entry steps
Number of manual document submissions
Number of status-check locations
System-side
Workflow completion rate
Successful connector requests
Failed connector requests
Retry recovery rate
Average workflow processing time

Example:

Traditional simulated flow:
5 system interactions
3 separate status checks

SetuX:
1 interface
1 application
1 unified status

You can then honestly show the improvement within your prototype simulation.

29. Final Product Architecture

The entire product can be summarized as:

                         SETUX
                           │
                           ▼
                 ┌──────────────────┐
                 │  UNIFIED CITIZEN │
                 │    EXPERIENCE    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  SETUX CORE       │
                 │                  │
                 │ Identity         │
                 │ Profile          │
                 │ Consent          │
                 │ Application      │
                 │ Workflow         │
                 │ RBAC             │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ INTEGRATION HUB  │
                 │                  │
                 │ Connectors       │
                 │ Mapping          │
                 │ Validation       │
                 │ Retry            │
                 └────────┬─────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        Identity      DigiLocker      Income
         System         System        System
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                    ONE WORKFLOW
                          │
                          ▼
                   ONE APPLICATION
                          │
                          ▼
                  ONE STATUS VIEW