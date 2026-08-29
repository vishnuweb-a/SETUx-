SetuX Development Phases

Master development tracker for the SetuX SIH prototype — from repository setup through final testing and deployment.

Development Strategy

SetuX will be implemented as a modular monolith for the SIH prototype.

PHASE 0
Architecture & Repository Setup
        ↓
PHASE 1
Development Environment & Foundation
        ↓
PHASE 2
Supabase & Database
        ↓
PHASE 3
Authentication & RBAC
        ↓
PHASE 4
Citizen & Government Onboarding
        ↓
PHASE 5
Scholarship Catalogue
        ↓
PHASE 6
Application Management
        ↓
PHASE 7
Consent Management
        ↓
PHASE 8
Fake DigiLocker Integration
        ↓
PHASE 9
Fake Government Connectors
        ↓
PHASE 10
Scholarship Verification & Workflow
        ↓
PHASE 11
Government Officer Dashboard
        ↓
PHASE 12
Citizen Tracking & Notifications
        ↓
PHASE 13
Security, Error Handling & Audit
        ↓
PHASE 14
Integration Testing & E2E Testing
        ↓
PHASE 15
Production Build & Deployment
        ↓
PHASE 16
Final SIH Demo Validation

Phase 0 — Architecture & Repository Setup

Objective

Create the complete repository structure and establish the engineering rules before feature development begins.

Tasks

Create root project structure

Create frontend/

Create backend/

Create mock-services/

Create supabase/

Create scripts/

Organize docs/

Verify .agents/skills/

Add AGENT.md

Add CLAUDE.md

Add architecture documentation

Add .gitignore

Add root README.md

Define environment variable strategy

Define branch/contribution rules

Exit Criteria

Repository structure matches the architecture

AI development contract exists

Documentation is organized

No application feature code is implemented yet

Phase 1 — Development Environment & Foundation

Objective

Create the frontend and backend foundations.

Frontend

Initialize React + TypeScript + Vite

Configure Tailwind CSS v4

Configure shadcn/ui

Configure routing

Configure API client

Configure TanStack Query

Configure global providers

Create application layout

Create shared UI primitives

Create error boundary

Create loading/feedback components

Backend

Initialize Node.js + TypeScript

Configure Express

Create app.ts

Create server.ts

Create API versioning

Add request parsing

Add CORS

Add Helmet

Add rate limiting

Add structured logging

Add centralized error handling

Add health endpoint

Create configuration module

Quality

TypeScript configuration

ESLint

Testing framework

Environment validation

Development scripts

Production build scripts

Exit Criteria

Frontend starts
Backend starts
/api/v1/health works
Frontend can communicate with backend
Typecheck passes
Lint passes
Tests pass
Build passes

Phase 2 — Supabase & Database Foundation

Objective

Establish the persistence and authentication infrastructure.

Tasks

Create Supabase project

Configure environment variables

Configure Supabase client

Create initial database migration

Implement required tables from database-schema.md

Add primary keys

Add foreign keys

Add constraints

Add indexes

Configure Row Level Security

Create RLS policies

Create seed/demo data

Verify database connectivity

Exit Criteria

Database schema matches approved design

RLS policies are active

Seed data can be loaded

Backend can securely access required data

Phase 3 — Authentication & RBAC

Objective

Implement the authentication screen and role-based access flow.

Roles

CITIZEN
GOVERNMENT_OFFICER

Tasks

Implement Supabase authentication

Implement login

Implement logout

Implement session handling

Implement session persistence

Implement authentication API

Implement authentication middleware

Implement role resolution

Implement RBAC middleware

Implement protected routes

Implement frontend role guards

Handle unauthorized access

Handle expired sessions

UI

Citizen login state

Government organization login state

Password visibility

Remember/session behavior

Loading state

Invalid credentials state

Error state

Security

Never trust role from frontend

Validate authenticated user server-side

Protect government endpoints

Verify RLS compatibility

Exit Criteria

Citizen login
      ↓
Citizen Dashboard

Government login
      ↓
Officer Dashboard

Phase 4 — Onboarding

Objective

Complete profile setup after authentication.

Citizen

Full name

Government ID

Mobile number

Date of birth

Verified email displayed from authentication

Validation

Profile creation

Profile completion state

Government Officer

Organization name

Organization ID/code

Department/ministry

Official email

Official mobile

Full name

Employee ID

Designation/role

Validation

Organization profile creation

Exit Criteria

Citizen can complete onboarding

Officer can complete onboarding

Required profile records are persisted

Users are redirected to the correct dashboard

Phase 5 — Scholarship Catalogue

Objective

Allow citizens to discover the demo scholarship.

Tasks

Create scholarship domain module

Create scholarship database records

Create scholarship API

Create scholarship service

Create scholarship repository

Create scholarship list UI

Create scholarship detail UI

Display eligibility information

Display required information/documents

Add application CTA

Exit Criteria

Citizen can:

Dashboard
   ↓
Scholarships
   ↓
Scholarship Details
   ↓
Apply

Phase 6 — Application Management

Objective

Create and manage scholarship applications.

Tasks

Create application domain

Create application API

Create application service

Create application repository

Create draft application

Save application data

Retrieve application

Update draft

Submit application

Validate submission

Prevent duplicate active applications

Create application reference number

Application lifecycle

DRAFT
  ↓
SUBMITTED

Exit Criteria

Citizen can create an application

Citizen can save a draft

Citizen can submit

Submitted applications are immutable where required

Application status is persisted

Phase 7 — Consent Management

Objective

Allow citizens to explicitly authorize SetuX to access required information.

Tasks

Create consent model

Create consent API

Create consent service

Create consent UI

Display requested data

Explain purpose

Record consent

Record timestamp

Record consent status

Support revocation where required

Enforce consent before protected connector calls

Flow

Application
     ↓
Data Required
     ↓
Consent Screen
     ↓
Citizen Approves
     ↓
Consent Stored
     ↓
Connector Access Allowed

Exit Criteria

No protected data connector call occurs without valid consent

Consent state can be audited

Phase 8 — Fake DigiLocker Integration

Objective

Demonstrate document retrieval without depending on real DigiLocker infrastructure.

Tasks

Create fake DigiLocker service

Create fake document dataset

Create connector interface

Implement fake DigiLocker connector

Implement authentication/token simulation if required

Implement document listing

Implement document retrieval

Normalize provider response

Handle missing documents

Handle connector failures

Record connector access

Architecture

Application Service
       ↓
DocumentProvider
       ↓
FakeDigiLockerConnector
       ↓
Fake DigiLocker
       ↓
Synthetic Documents

Exit Criteria

Citizen can demonstrate:

Consent
  ↓
Fetch Documents
  ↓
Select Required Document
  ↓
SetuX receives normalized document metadata/data

Phase 9 — Fake Government Connectors

Objective

Demonstrate interoperability with multiple existing government-style systems.

Connectors

Fake identity connector

Fake education connector

Fake income connector

Fake DigiLocker connector

Tasks

Define connector interface

Define normalized response models

Implement adapters

Add simulated latency

Add controlled failure scenarios

Add timeout handling

Add validation

Add connector logging/audit events

Flow

SetuX
  │
  ├── Fake Identity
  ├── Fake Education
  ├── Fake Income
  └── Fake DigiLocker

Exit Criteria

Multiple systems can be queried through one SetuX workflow

Provider-specific formats are hidden behind connectors

Failures do not crash the application

Phase 10 — Scholarship Verification & Workflow

Objective

Connect the application, consent, documents, and government data into one workflow.

Workflow

DRAFT
  ↓
SUBMITTED
  ↓
UNDER_VERIFICATION
  ↓
UNDER_REVIEW
  ├── APPROVED
  └── REJECTED

Tasks

Implement workflow service

Implement valid state transitions

Trigger verification after submission

Retrieve required information

Validate received data

Create verification result

Handle partial verification

Handle connector failure

Move verified application to review

Create workflow events

Exit Criteria

A submitted scholarship application can travel through the complete verification workflow.

Phase 11 — Government Officer Dashboard

Objective

Provide government employees with a consolidated view for application review.

Tasks

Officer dashboard

Application queue

Filter by status

Search application

Application detail

Citizen-provided information

Verification results

Document status

Consent status

Application history

Approve action

Reject action

Rejection reason

Authorization

Only:

GOVERNMENT_OFFICER

with the appropriate access should be able to perform officer actions.

Exit Criteria

Officer can:

Login
  ↓
View applications
  ↓
Open application
  ↓
Review verification
  ↓
Approve / Reject

Phase 12 — Citizen Tracking & Notifications

Objective

Give citizens a unified view of their application's progress.

Tasks

Application tracking API

Timeline UI

Status badges

Verification status

Officer review status

Approval/rejection status

Notification model

In-app notifications

Demo notification events

Example

Application Submitted       ✓
        ↓
Documents Verified          ✓
        ↓
Eligibility Verified        ✓
        ↓
Officer Review              ●
        ↓
Decision                    ○

Exit Criteria

Citizen can understand the complete application status from one screen.

Phase 13 — Security, Error Handling & Audit

Objective

Harden the complete prototype before testing.

Security

Authentication checks

RBAC checks

RLS verification

Ownership checks

Consent enforcement

Input validation

Rate limiting

CORS configuration

Helmet

Secure environment variables

No secrets in repository

No sensitive values in logs

Error handling

Verify:

Validation error

Unauthorized

Forbidden

Not found

Conflict

Rate limit

Connector timeout

Connector failure

Database failure

Unexpected server error

Audit

Login events

Consent events

Document access events

Verification events

Application submission

Approval

Rejection

Important state transitions

Exit Criteria

No critical security or error-handling gap remains in the MVP flow.

Phase 14 — Testing

Objective

Validate the system at unit, integration, and end-to-end levels.

Unit Tests

Backend

Auth services

RBAC logic

Profile services

Scholarship services

Application services

Consent services

Workflow transitions

Connector adapters

Validation

Error handling

Frontend

Auth components

Forms

Validation

Role guards

Application components

Status components

Integration Tests

API + database

Auth + database

Application + consent

Application + connectors

Verification + workflow

Officer decision + application status

End-to-End Test

The complete happy path:

Citizen
  ↓
Login
  ↓
Onboarding
  ↓
Scholarship
  ↓
Apply
  ↓
Consent
  ↓
Fake DigiLocker
  ↓
Fake Government Connectors
  ↓
Verification
  ↓
Officer Login
  ↓
Review
  ↓
Approve
  ↓
Citizen sees APPROVED

Negative E2E Tests

Invalid login

Citizen accesses officer route

Officer accesses citizen-only resource

Missing consent

Missing document

Connector timeout

Connector failure

Invalid application transition

Duplicate submission

Unauthorized approval

Exit Criteria

Unit tests pass

Integration tests pass

E2E happy path passes

Critical negative paths pass

Phase 15 — Production Build & Deployment

Objective

Create a repeatable deployment process.

Pre-deployment

Production environment variables configured

Supabase production configuration verified

Database migrations applied

RLS verified

Seed/demo data prepared separately

CORS configured

API URL configured

Frontend build verified

Backend build verified

Deployment

Deploy frontend

Deploy backend

Configure domain/environment

Configure health checks

Verify API connectivity

Verify Supabase connectivity

Verify authentication

Verify mock connectors

Post-deployment

Login test

Citizen flow test

Officer flow test

Application submission test

Connector test

Approval test

Error-path test

Exit Criteria

The deployed environment can complete the complete MVP journey.

Phase 16 — Final SIH Demo Validation

Objective

Ensure the prototype tells the interoperability story clearly and works reliably during judging.

Demo Dataset

Demo citizen account

Demo government officer account

Demo scholarship

Demo documents

Demo identity record

Demo education record

Demo income record

Demo application

Demo Flow

1. Citizen Login
       ↓
2. Citizen Profile
       ↓
3. Select Scholarship
       ↓
4. Start Application
       ↓
5. Give Consent
       ↓
6. SetuX fetches data
       ↓
7. Fake DigiLocker provides document
       ↓
8. Fake departments provide verification data
       ↓
9. Application becomes UNDER_REVIEW
       ↓
10. Government Officer logs in
       ↓
11. Reviews consolidated application
       ↓
12. Approves / Rejects
       ↓
13. Citizen sees final status

Final Checks

No broken routes

No console errors

No exposed secrets

No real sensitive citizen data

All demo accounts work

All connector mocks work

Loading states work

Error states work

Mobile/responsive behavior acceptable

UI matches SetuX design system

API documentation matches implementation

Database schema matches implementation

README explains setup

Deployment documentation is current

Global Definition of Done

A phase is considered complete only when:

Implementation
     +
Tests
     +
Security
     +
Documentation
     +
Code Quality
     +
Build Verification

are all complete.

For every feature:

[ ] Relevant skills loaded first
[ ] Relevant documentation read
[ ] Architecture respected
[ ] TypeScript types correct
[ ] Validation implemented
[ ] Authorization implemented
[ ] Error states handled
[ ] Loading states handled
[ ] Tests added
[ ] Typecheck passes
[ ] Lint passes
[ ] Build passes
[ ] Documentation updated

Master Progress Tracker

Phase

Area

Status

0

Architecture & Repository

✅

1

Development Foundation

✅

2

Supabase & Database

⬜

3

Authentication & RBAC

⬜

4

Onboarding

⬜

5

Scholarship Catalogue

⬜

6

Application Management

⬜

7

Consent Management

⬜

8

Fake DigiLocker

⬜

9

Government Connectors

⬜

10

Verification & Workflow

⬜

11

Officer Dashboard

⬜

12

Tracking & Notifications

⬜

13

Security & Audit

⬜

14

Testing

⬜

15

Deployment

⬜

16

SIH Demo Validation

⬜

Status Legend

⬜ Not Started
🟡 In Progress
🟢 Complete
🔴 Blocked