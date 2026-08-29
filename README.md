SetuX

A secure interoperability and federated service-delivery layer for unified government service access.

SetuX is an SIH prototype designed to demonstrate how existing government systems can be connected through a common interoperability layer without requiring those systems to be replaced.

For the MVP, SetuX focuses on a scholarship application workflow and demonstrates how a citizen can submit information once, provide consent for required data access, use simulated government connectors for verification, and track the complete application from a unified interface.

1. Problem

Government services often involve multiple departments and systems.

A citizen may need to:

Find a service
      ↓
Understand requirements
      ↓
Enter information
      ↓
Submit documents
      ↓
Verify identity
      ↓
Verify eligibility
      ↓
Wait for different departments
      ↓
Track different application states

This creates:

duplicate data submission

fragmented workflows

repeated verification

disconnected departmental systems

poor application visibility

unnecessary complexity for citizens and officers

The underlying problem is not simply the absence of another government-services application.

The problem is interoperability between existing systems.

2. SetuX Solution

SetuX acts as a common layer between the citizen and existing government services.

                    CITIZEN
                       │
                       ▼
                 ┌───────────┐
                 │   SetuX   │
                 │   Core    │
                 └─────┬─────┘
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Identity        DigiLocker       Education /
   System           System           Income System
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                Verification
                       │
                       ▼
                Scholarship
                 Application
                       │
                       ▼
                Government Officer

Instead of replacing government systems, SetuX provides an interoperability and workflow layer that coordinates them.

3. SIH MVP Focus

The prototype intentionally focuses on one concrete use case: scholarship delivery.

The goal is to demonstrate:

ONE CITIZEN
    ↓
ONE SETUX FLOW
    ↓
MULTIPLE GOVERNMENT SYSTEMS
    ↓
ONE UNIFIED APPLICATION STATUS

The prototype uses fake/mock government services rather than requiring access to real government APIs.

4. Core Features

Identity

Provides authentication and identity handling.

Login
  ↓
Authenticated User
  ↓
Role Resolution

Supported prototype roles:

Citizen

Government Officer

Admin

Citizen Onboarding

After authentication, the citizen provides the information required by the SetuX scholarship workflow.

The onboarding flow is separate from authentication.

Authenticate
     ↓
Onboard
     ↓
Citizen Profile

Unified Citizen Profile

SetuX maintains the profile information required by the application workflow so the citizen does not repeatedly enter the same information at every step.

Consent Management

Citizens control access to protected external information.

Application
    ↓
Required Data
    ↓
Consent
    ↓
Government Connector

If the required consent is not available:

No Consent
    ↓
Connector Access Blocked

Scholarship Application

The citizen can:

select the scholarship

start an application

provide required information

provide consent

submit the application

track application progress

Workflow Orchestration

SetuX coordinates the scholarship workflow.

Example:

DRAFT
  ↓
SUBMITTED
  ↓
UNDER_VERIFICATION
  ↓
UNDER_REVIEW
  ↓
APPROVED

Alternative:

UNDER_REVIEW
      ↓
   REJECTED

The backend controls valid state transitions.

Government Connectors

SetuX uses a connector architecture to communicate with external systems.

For the SIH prototype:

SetuX
  │
  ├── Fake DigiLocker
  ├── Fake Identity Provider
  ├── Fake Education Provider
  └── Fake Income Provider

These connectors simulate government interoperability without requiring real production integrations.

DigiLocker Simulation

The prototype demonstrates the concept of accessing a document/credential through a DigiLocker-like provider.

SetuX does not need to become a document-storage platform.

The intended flow is:

Citizen Consent
      ↓
SetuX Connector
      ↓
Fake DigiLocker
      ↓
Credential
      ↓
Verification
      ↓
Required Result

The fake provider can also simulate failures such as:

NORMAL
TIMEOUT
NOT_FOUND
IDENTITY_MISMATCH
INVALID_RESPONSE

Application Tracking

The citizen can see the current state of the scholarship application from one place.

Example:

Application Submitted       ✓
Identity Verification      ✓
Education Verification     ✓
Income Verification        ✓
Officer Review             ⏳
Final Decision             ⏳

Government Officer Dashboard

The government-side interface allows an authorized officer to:

view assigned applications

inspect relevant application information

review verification results

approve an application

reject an application

request additional information where supported

Officer actions are protected by RBAC and application scope.

RBAC

SetuX uses role-based authorization.

                    SETUX
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     CITIZEN        OFFICER        ADMIN
        │             │             │
        ▼             ▼             ▼
   Own Data       Review Data    Operations
   Own Apps       Decisions      Monitoring

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

Audit Logging

Important operations are auditable.

Examples:

APPLICATION_CREATED
APPLICATION_SUBMITTED
CONSENT_GRANTED
CONSENT_REVOKED
CONNECTOR_REQUESTED
VERIFICATION_COMPLETED
CONNECTOR_FAILED
APPLICATION_APPROVED
APPLICATION_REJECTED

Error Handling

SetuX treats errors as part of the interoperability architecture.

Example:

Fake Government Service
          ↓
        Timeout
          ↓
     SetuX detects
          ↓
       Retry
          ↓
       Success
          ↓
 Workflow continues

Non-recoverable errors are safely recorded and surfaced to the appropriate user.

5. Architecture

SetuX is intentionally designed as a modular monolith for the SIH prototype.

                         SETUX
                           │
                  ┌────────┴────────┐
                  │                 │
             Frontend           Backend
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
              Identity           Consent          Application
                 │                  │                  │
                 └──────────────────┼──────────────────┘
                                    │
                                    ▼
                               Workflow
                                    │
                                    ▼
                               Connectors
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               DigiLocker       Identity        Education
                 Mock              Mock             Mock
                                    │
                                    ▼
                              Supabase
                           Auth + PostgreSQL

6. Core Backend Modules

backend/
│
├── auth/
├── onboarding/
├── applications/
├── consent/
├── scholarships/
├── workflow/
├── connectors/
├── notifications/
├── audit/
├── errors/
└── shared/

The modules remain logically separated even though they are deployed as one backend application.

7. Technology Stack

The current MVP architecture is centered around:

Frontend

Web frontend

Role-based dashboards

Citizen and officer interfaces

Backend

Modular monolith

REST API architecture

Server-side authentication and authorization

Workflow orchestration

Connector abstraction

Database / Authentication

Supabase

PostgreSQL

Supabase Auth

Row Level Security

External Integrations

Fake DigiLocker connector

Fake government connectors

Provider-adapter pattern

Security

Authentication

RBAC

Resource ownership

Consent enforcement

RLS

Audit logging

Input validation

Rate limiting

Secure secret handling

8. End-to-End Citizen Flow

┌─────────────────┐
│ Citizen opens   │
│ SetuX           │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Authentication  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Citizen         │
│ Onboarding      │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Citizen         │
│ Dashboard       │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Select          │
│ Scholarship     │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Application     │
│ Form            │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Give Consent    │
└────────┬────────┘
         ↓
┌─────────────────┐
│ SetuX Workflow  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Government      │
│ Connectors      │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Verification    │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Officer Review  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Approve /       │
│ Reject          │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Citizen sees    │
│ final status    │
└─────────────────┘

9. Government Officer Flow

Officer
   ↓
Authentication
   ↓
Officer Dashboard
   ↓
View Authorized Applications
   ↓
Open Application
   ↓
Review Citizen Information
   ↓
Review Verification Results
   ↓
Approve / Reject / Request Information
   ↓
Audit Event
   ↓
Application Status Updated
   ↓
Citizen Dashboard Updated

10. Interoperability Flow

This is the core architectural idea of SetuX.

Citizen
   │
   ▼
SetuX
   │
   ├──────────────► Identity Provider
   │
   ├──────────────► DigiLocker
   │
   ├──────────────► Education Provider
   │
   └──────────────► Income Provider
   │
   ▼
Normalized Data
   │
   ▼
Workflow Engine
   │
   ▼
Scholarship Application

Each external provider can have a different API/data format.

The connector layer converts provider-specific responses into a common SetuX representation.

Provider Response
      ↓
Connector Adapter
      ↓
Validation
      ↓
Normalization
      ↓
Canonical SetuX Data
      ↓
Workflow

11. Why SetuX Is Not Another Document Vault

SetuX does not attempt to duplicate DigiLocker.

Instead:

DigiLocker
    ↓
Document / Credential Access
    ↓
SetuX Connector
    ↓
Verification
    ↓
Scholarship Workflow

SetuX focuses on orchestration and interoperability, not replacing existing document repositories.

12. Security Model

The security model follows:

Authenticate
     ↓
Authorize
     ↓
Check Ownership / Scope
     ↓
Check Consent
     ↓
Validate Input
     ↓
Execute Operation
     ↓
Audit

Important rules:

never trust the frontend

authenticate protected requests

enforce server-side RBAC

enforce citizen ownership

enforce officer scope

require consent for protected connector access

keep secrets backend-only

minimize sensitive data

audit critical operations

13. Data Flow

High-level data flow:

                    Citizen
                       │
                       ▼
                  Frontend
                       │
                       ▼
                   SetuX API
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Profile      Consent    Application
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Workflow
                       │
                       ▼
                  Connectors
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          Identity  DigiLocker Education
             │         │         │
             └─────────┼─────────┘
                       ▼
                  Verification
                       │
                       ▼
                 Officer Review
                       │
                       ▼
                 Final Decision

14. Deployment

The MVP uses a simple deployment model.

                INTERNET
                   │
                   ▼
              Frontend
                   │
                 HTTPS
                   │
                   ▼
             SetuX Backend
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       Supabase  Workflow  Connectors
          │                 │
          ▼                 ▼
       PostgreSQL       Fake Providers
       + Auth

The prototype does not require:

Kubernetes

microservices

service mesh

complex distributed infrastructure

The objective is to make the SIH prototype reliable and easy to demonstrate.

15. Project Documentation

The architecture is documented through the following design documents:

docs/
│
├── PRD
│
├── HLD
│
├── frontend-architecture.md
│
├── backend-lld.md
│
├── database-design.md
│
├── database-schema.md
│
├── api-specification.md
│
├── auth-api.md
│
├── onboarding-api.md
│
├── application-api.md
│
├── authentication-and-rbac.md
│
├── scholarship-workflow.md
│
├── digilocker-integration.md
│
├── government-connectors.md
│
├── security-design.md
│
├── error-handling.md
│
└── deployment.md

The exact filenames/location can be adjusted to match the repository structure.

16. Repository Structure

Recommended project structure:

setux/
│
├── frontend/
│
├── backend/
│
├── docs/
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── mock-services/
│
├── .env.example
├── .gitignore
└── README.md

Backend example:

backend/
│
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── applications/
│   │   ├── consent/
│   │   ├── scholarships/
│   │   ├── workflow/
│   │   ├── connectors/
│   │   ├── notifications/
│   │   └── audit/
│   │
│   ├── shared/
│   │   ├── errors/
│   │   ├── middleware/
│   │   └── utils/
│   │
│   └── app.*
│
└── package.json

17. Getting Started

Prerequisites

Install the project's required runtime and package manager before starting.

You will need access to:

Node.js
Package Manager
Git
Supabase Project

Exact versions should be maintained in the repository configuration.

Clone the Repository

git clone <repository-url>
cd setux

Configure Environment

Create the required environment files from the example configuration:

cp .env.example .env

Then configure the required Supabase and application variables.

Never commit the real .env file.

Install Dependencies

For the backend:

cd backend
npm install

For the frontend:

cd frontend
npm install

Use the package manager and commands defined by the actual project configuration if they differ.

18. Database Setup

Configure the Supabase project and apply the version-controlled database migrations.

Conceptually:

Supabase Project
      ↓
Database Migrations
      ↓
RLS Policies
      ↓
Seed Data
      ↓
Ready

The demo environment should use fictional data.

19. Running Locally

Start the backend:

cd backend
npm run dev

Start the frontend:

cd frontend
npm run dev

The exact commands may vary depending on the framework configuration.

20. Demo Roles

The SIH prototype should provide controlled demo accounts for:

Citizen
Officer
Admin

The accounts should use fictional information.

Do not use real government IDs or real citizen documents in the demonstration.

21. Testing

The prototype should test:

Authentication

Valid login
Invalid login
Expired session
Unauthorized request

RBAC

Citizen → own application ✓
Citizen → another application ✗
Citizen → approve application ✗
Officer → authorized application ✓
Officer → unauthorized scope ✗

Consent

Consent granted → connector access ✓
Consent denied → connector blocked ✗

Workflow

Valid state transition ✓
Invalid state transition ✗

Connectors

Success
Timeout
Retry
Failure
Identity mismatch
Not found

22. SIH Demo Scenario

The primary demonstration should tell one complete story.

Citizen

Login
 ↓
Onboard
 ↓
Select Scholarship
 ↓
Apply
 ↓
Give Consent
 ↓
Verification
 ↓
Submit

SetuX

Receive application
 ↓
Check consent
 ↓
Call connectors
 ↓
Normalize responses
 ↓
Run workflow
 ↓
Send to officer review

Government Officer

Login
 ↓
Open application
 ↓
Review
 ↓
Approve / Reject

Citizen

Open dashboard
 ↓
See final application status

23. Failure Scenario

The secondary demonstration should show resilience.

Scholarship Application
        ↓
Education Verification
        ↓
Fake DigiLocker
        ↓
TIMEOUT
        ↓
SetuX detects retryable error
        ↓
Retry
        ↓
Provider succeeds
        ↓
Verification completes
        ↓
Workflow continues

This demonstrates that SetuX is an interoperability layer rather than only a frontend aggregator.

24. Scope

Included in MVP

✓ Citizen authentication
✓ Officer authentication
✓ Role-based access
✓ Citizen onboarding
✓ Scholarship discovery/selection
✓ Scholarship application
✓ Consent management
✓ Fake DigiLocker
✓ Fake government connectors
✓ Verification workflow
✓ Application tracking
✓ Officer dashboard
✓ Approval/rejection
✓ Audit logging
✓ Error handling
✓ Deployment

25. Out of Scope

The SIH prototype does not attempt to implement:

✗ Real Aadhaar integration
✗ Real PAN integration
✗ Real production DigiLocker integration
✗ Real government departmental APIs
✗ Production-scale identity federation
✗ Nationwide deployment
✗ Microservice infrastructure
✗ Kubernetes
✗ Advanced distributed event infrastructure
✗ Complete document storage platform
✗ Production government compliance certification

These can be future extensions.

26. Future Evolution

The architecture is intentionally designed so fake integrations can later be replaced.

Current:

SetuX
  ↓
Fake Connector
  ↓
Fake Provider

Future:

SetuX
  ↓
Government Connector
  ↓
Real Provider

The core workflow should remain largely independent of provider-specific implementation.

Potential future capabilities include:

additional government services

real government connectors

federated identity

more departments

broader workflow orchestration

advanced monitoring

production-grade security infrastructure

additional citizen services

27. Key Architectural Principle

SetuX should not become another isolated government application.

Its purpose is to provide:

                 INTEROPERABILITY
                       │
                       ▼
                 ORCHESTRATION
                       │
                       ▼
                    CONSENT
                       │
                       ▼
                  VERIFICATION
                       │
                       ▼
                  WORKFLOW
                       │
                       ▼
              UNIFIED EXPERIENCE

The systems underneath can continue to exist independently.

SetuX connects them.

28. One-Line Explanation

If you need to explain SetuX in one sentence:

SetuX is a secure interoperability and workflow layer that connects existing government systems into a unified, consent-driven citizen service journey.

29. SIH Positioning

Do not position SetuX as:

"An app that combines government services."

Position it as:

"A secure interoperability and federated service-delivery layer that connects existing government systems without requiring their replacement."

The scholarship workflow is the concrete proof-of-concept used to demonstrate that architecture.

30. License

Add the project's chosen license here before public release.

Example:

MIT License

Do not assume a license has been selected until the project team confirms it.

31. Status

Project: SetuX
Stage: SIH Prototype
Architecture: Modular Monolith
Database/Auth: Supabase
Integrations: Fake Government Connectors
Primary Use Case: Scholarship Workflow

32. Final Architecture Summary

                         SETUX
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
        CITIZEN UI                 GOVERNMENT UI
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    SETUX BACKEND
                   MODULAR MONOLITH
                           │
      ┌────────────────────┼────────────────────┐
      ▼                    ▼                    ▼
  IDENTITY              CONSENT             APPLICATION
      │                    │                    │
      └────────────────────┼────────────────────┘
                           ▼
                       WORKFLOW
                           │
                           ▼
                      CONNECTORS
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   Fake DigiLocker    Fake Identity     Fake Education
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                    VERIFICATION
                           │
                           ▼
                       SUPABASE
                    AUTH + DATABASE
                           │
                           ▼
                      AUDIT LOGS

Built for SIH

SetuX is intentionally scoped as a working proof of interoperability rather than an attempt to reproduce the entire government digital ecosystem.

The prototype proves the central idea:

MULTIPLE SYSTEMS
       ↓
    SETUX
       ↓
ONE CONSENT-DRIVEN WORKFLOW
       ↓
ONE UNIFIED EXPERIENCE