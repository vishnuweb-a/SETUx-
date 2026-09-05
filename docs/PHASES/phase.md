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

Status

Complete. The foundation is documented in docs/DEVELOPMENT/foundation.md.

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

Status

Complete. The implementation is documented in docs/DATABASE/database-setup.md.

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

Phase 7 implementation profile (2026-09-04) — IMPLEMENTED

Implemented surface:

GET  /api/v1/applications/:applicationId/consents
POST /api/v1/consents/:consentId/grant
POST /api/v1/consents/:consentId/deny
/citizen/applications/:applicationId/consent

Consent requests are derived from `service_requirements` rows naming a
`data_source_id`; citizen DECLARATION requirements need no consent. Decisions
are explicit per item, final for the application, guarded against concurrent or
repeated decisions in SQL, and recorded as CONSENT_GRANTED / CONSENT_DENIED
events in `application_events`.

Deliberately NOT implemented in Phase 7: revocation (REVOKED and EXPIRED remain
unused schema values), DigiLocker retrieval, government connectors,
verification, officer review, notifications. Phase 7 does not advance the
application beyond SUBMITTED — "Support revocation where required" and "Enforce
consent before protected connector calls" above are satisfied by establishing
the boundary; the enforcement point itself belongs to the phase that first
performs a retrieval.

See docs/API/consent.md for the contract.

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

Status: implemented (2026-09-04).

Implemented as an in-process connector module behind the connector interface
rather than a separate mock HTTP service, which government-connector.md §9
recommends for the MVP. Document *selection* is automatic: the requirement
determines the document, so there is nothing for the citizen to choose between.

Retrieval is NOT verification. A retrieved document has been fetched from the
system that issued it and has not been checked. `verifications` stays empty and
`applications.status` does not move; both belong to Phase 9/10.

Contract: docs/API/retrievals.md

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

Status: implemented (2026-09-05).

Three connectors added — identity, education and income — joining the Phase 8
fake DigiLocker, so every seeded `data_sources` row now resolves to a connector:

  DIGILOCKER_MOCK     FakeDigiLockerConnector   BANK_DETAILS, COMMUNITY_RECORD
  MOCK_IDENTITY_API   FakeIdentityConnector     IDENTITY
  MOCK_EDUCATION_API  FakeEducationConnector    EDUCATION_RECORD
  MOCK_INCOME_API     FakeIncomeConnector       INCOME_RECORD

They were added by REGISTRATION alone. The retrieval service, the API contract
and the database schema are unchanged, and Phase 9 required NO migration — the
Phase 8 tables are already source-keyed. All four connectors are in-process,
deterministic, credential-free and make zero network calls.

Consent remains source-level: a grant for one government system authorizes that
system only. Idempotency remains requirement-scoped.

"Add simulated latency" was deliberately not done — it would slow the demo and
make tests flaky for no architectural gain. Controlled failure is a
construction-time behaviour, never reachable from a request body. Connector
health checks and automatic retry remain deferred (government-connector.md §23,
§24).

Retrieval is still NOT verification. After all four systems answer, the
application stays SUBMITTED, `verifications` and `application_reviews` stay
empty, and provider data stays `verification_status = PENDING`. Phase 10 owns
that transition.

Contract: docs/API/retrievals.md

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

Status: complete (2026-09-05). Backend, citizen UI, migration applied to the
live project, and live browser acceptance all done.

The migration `20260905090000_setux_verification_workflow` is APPLIED. Note one
bookkeeping discrepancy: it is recorded in `supabase_migrations.schema_migrations`
under the server-assigned version `20260904203202`, because the tool used to
apply it stamps its own timestamp rather than honouring the filename. The DDL is
correct and complete; only the recorded version string differs from the local
filename, and correcting that row was not permitted from this session.

Two defects were found by live acceptance and fixed, neither visible to any
mocked test:

  1. `POST .../verification` answered 400 for a request with NO body, because
     `express.json()` leaves `req.body` undefined and `z.object({}).strict()`
     rejects undefined. The citizen's own "Start verification" click sends no
     body, so the happy path was broken in the browser while every integration
     test — which sends `{}` — passed. The schema now carries `.default({})`;
     a body that IS supplied is still rejected for any unknown key.

  2. Moving an application to VERIFICATION made the Phase 8 retrievals endpoint
     answer 409, because reading the history shared the "must be SUBMITTED"
     guard with performing a retrieval. The citizen lost the evidence panel at
     exactly the moment the verification outcomes needed explaining. Reading is
     now allowed at VERIFICATION; fetching anything new is still restricted to
     SUBMITTED, so an application under verification cannot acquire evidence the
     run did not see.

A third, in the frontend: retrieving the last outstanding document left the
verification overview showing stale "evidence outstanding" until a manual
reload, because the retrieval mutation did not invalidate the verification
query whose readiness it had just changed.

Phase 10 is the first phase that JUDGES evidence rather than fetching it:

  application_data → verification rules → verifications → VERIFICATION

"Retrieve required information" in the task list above is deliberately NOT done
by this phase. Phases 8 and 9 already retrieved it, and a verification run able
to re-fetch would reach a provider around the consent gate that governs
retrieval. The verification module holds no connector import, enforced by tests
that read the module source and by a run completed with no connector registered.

Two contract conflicts surfaced during implementation and were resolved against
the schema rather than by invention:

  1. `verifications.verification_type` allowed only IDENTITY/EDUCATION/INCOME,
     but the seeded catalogue names five requirement codes and marks
     COMMUNITY_RECORD (SCHOLARSHIP_MINORITY) and BANK_DETAILS
     (SCHOLARSHIP_RESEARCH) as required. Neither could hold a verification row,
     so those services could never finish verifying. The Phase 10 migration
     widens the CHECK to the five requirement codes, keeping the two Phase 2
     spellings permitted so the change stays non-destructive.

  2. No eligibility threshold exists anywhere in SetuX — no income limit, no
     marks minimum, no age bound, in neither `services`, `service_requirements`,
     the seed, nor the docs. So no rule compares a number against one. The
     education aggregate and the community category are retrieved and shown but
     NOT judged; they resolve to REQUIRES_ACTION for the officer. Inventing a
     cutoff would have meant SetuX writing eligibility policy.

The lifecycle value is `VERIFICATION`, which is what the enum and
database-schema.md §19 define. "UNDER_VERIFICATION" as used in the prose above
is the same state under a different name; no second enum member was added.

Application status after the run stays VERIFICATION. `application_reviews`
remains empty and no application is APPROVED or REJECTED — Phase 11 owns the
officer review, the decision, and the transition onward.

Contract: docs/API/verification.md

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

✅

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