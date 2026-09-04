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

Actual project structure:

setux/
│
├── .agents/skills/          AI skill library (skill-first development)
├── .github/workflows/       CI: lint, typecheck, test, build
│
├── backend/                 Express + TypeScript API (npm workspace)
│   ├── src/
│   │   ├── config/          Centralized, validated configuration
│   │   ├── middleware/      Request context, logging, rate limit, errors, 404
│   │   ├── modules/         Feature modules (Phase 0: health only)
│   │   ├── routes/          Versioned API router (/api/v1)
│   │   ├── shared/          errors/ logger/ validation/ constants/ utils/
│   │   ├── types/           Express augmentation and domain types
│   │   ├── app.ts           Express application factory
│   │   └── server.ts        Listener + graceful shutdown
│   └── tests/               unit/ integration/
│
├── frontend/                React + TypeScript + Vite (npm workspace)
│   ├── src/
│   │   ├── app/             router/ providers/ layouts/
│   │   ├── components/      ui/ common/ feedback/
│   │   ├── features/        Feature-based modules (added from Phase 3)
│   │   ├── services/        API client and per-domain services
│   │   ├── hooks/ lib/ stores/ schemas/ types/ utils/
│   │   └── main.tsx
│   └── index.html
│
├── mock-services/           Simulated external government systems
│   ├── fake-digilocker/
│   ├── fake-identity/
│   ├── fake-education/
│   └── fake-income/
│
├── supabase/                migrations/ seed/ functions/
├── scripts/                 verify-env.mjs, health-check.mjs
├── docs/                    PRD, HLD, LLD, API, security, deployment
│
├── AGENT.md                 AI development contract
├── CLAUDE.md                Claude operating instructions
├── .env.example
├── .gitignore
└── package.json             npm workspaces root

Backend modules follow a fixed contract:

module/
├── module.routes.ts         HTTP wiring
├── module.controller.ts     Request/response translation
├── module.service.ts        Business logic
├── module.repository.ts     Persistence
├── module.schema.ts         Zod validation
├── module.types.ts          Domain contracts
└── index.ts

Dependency direction:

Route → Controller → Service → Repository/Connector → Database/Provider

17. Getting Started

Prerequisites

Node.js >= 20.19 (Node 22 LTS recommended)
npm >= 10 (npm workspaces are used)
Git
A Supabase project (required from Phase 2 onward; not needed to run Phase 0)

Clone and Install

git clone <repository-url>
cd setux
npm install

A single install at the root installs both workspaces. Do not run npm install
inside backend/ or frontend/ separately.

Configure Environment

Copy the example files:

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

Verify the result:

node scripts/verify-env.mjs

Environment strategy

Two trust boundaries exist:

backend/.env    Server-only. May hold privileged secrets.
frontend/.env   Shipped to the browser. Every VITE_* value is PUBLIC.

SUPABASE_SERVICE_ROLE_KEY belongs only in backend/.env. It must never be given
a VITE_ prefix and must never be referenced from frontend source code.

Never commit a real .env file. Only .env.example is tracked.

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

The schema is in place as of Phase 2: 17 tables with Row Level Security enabled
on every one, plus synthetic reference seed data. See
docs/DATABASE/database-setup.md for the schema, the RLS access model and the
migration workflow.

Outstanding migration (Phase 4)

Phase 4 adds no table, column, constraint or policy — it reuses the Phase 2
schema. It does add one migration containing two PostgreSQL functions that make
onboarding completion atomic:

supabase/migrations/20260903090000_setux_onboarding_functions.sql

This migration has NOT yet been applied to the shared Supabase project, because
this environment has no linked Supabase CLI and no direct database access.
Onboarding works without it: the backend detects the missing functions and falls
back to two ordered writes (profile row first, completion flag second), which is
recoverable but not atomic. Apply the migration to close that window — the
backend then uses the functions automatically, with no code change. Instructions
are in the migration's own header comment.

19. Running Locally

Start both applications from the repository root:

npm run dev

This runs the backend on http://localhost:3000 and the frontend on
http://localhost:5173.

Individually:

npm run dev:backend
npm run dev:frontend

Verify the backend:

curl http://localhost:3000/api/v1/health
node scripts/health-check.mjs

Expected response:

{
  "success": true,
  "data": {
    "service": "setux-backend",
    "status": "healthy"
  },
  "message": "Service is healthy"
}

Quality gates (run from the root, across both workspaces):

npm run lint
npm run typecheck
npm run test
npm run build


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

Current phase: Phase 4 complete — onboarding.

Phase 0  Repository architecture and engineering foundation
Phase 1  Frontend/backend foundation, health endpoint, logging, security middleware
Phase 2  Supabase schema: 17 tables, 9 enums, Row Level Security on every table
Phase 3  Authentication and RBAC (Supabase Auth, server-side role resolution)
Phase 4  Citizen and government officer onboarding

Phase 5 (scholarship catalogue) onward is not implemented. See
docs/PHASES/phase.md for the full phase plan.

Phase 4 adds the first authenticated business vertical slice:

Login
  ↓
Server-side role resolution
  ↓
Onboarding status from profiles.onboarding_status
  ↓
Role-specific onboarding form
  ↓
Backend validation + RBAC + RLS
  ↓
Profile persisted
  ↓
Correct dashboard

A newly registered account has onboarding_status = NOT_STARTED and is routed to
its onboarding form; the dashboards are reachable only once the profile is
COMPLETED. See docs/API/onboarding.md for the API contract.

One migration is outstanding — see "Database Setup" below.

Prototype disclaimer

External government systems are simulated for the SIH prototype. No real
government API integration is assumed unless explicitly documented. All data
used in this repository is synthetic; no real citizen or government records are
present or supported.

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