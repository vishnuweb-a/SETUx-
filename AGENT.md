SetuX AI Development Contract

This file is the operating contract for Claude and other AI coding agents working on SetuX.

1. Project Mission

SetuX is an SIH prototype demonstrating a secure interoperability layer for government services.

For the MVP, the showcase workflow is a scholarship application:

Citizen
   │
   ▼
SetuX
   │
   ├── Identity
   ├── Consent
   ├── Profile
   ├── Application
   ├── Workflow
   └── RBAC
   │
   ▼
Government / Mock Connectors
   │
   ├── Fake DigiLocker
   ├── Fake Identity
   ├── Fake Education
   └── Fake Income
   │
   ▼
Government Officer
   │
   ├── Review
   ├── Approve
   └── Reject
   │
   ▼
Citizen receives status

The objective is to prove the architecture, not to build a nationwide production government platform during the SIH prototype.

2. Architectural Principle

Start as a modular monolith.

Do NOT introduce microservices unless explicitly requested.

                    SETUX
                      │
        ┌─────────────┴─────────────┐
        │                           │
    Frontend                    Backend
        │                           │
     React                    Express API
        │                           │
        └─────────────┬─────────────┘
                      │
                   Supabase
              ┌───────┴───────┐
              │               │
             Auth          PostgreSQL
                              │
                             RLS
                              │
                       Connector Layer
                              │
                   ┌──────────┼──────────┐
                   ▼          ▼          ▼
                DigiLocker Identity  Education
                 (fake)     (fake)     (fake)

Keep module boundaries strong even though everything initially runs in one backend application.

3. Technology Baseline

Frontend

React

TypeScript

Vite

Tailwind CSS v4

shadcn/ui

React Router

TanStack Query

React Hook Form where useful

Zod

Lucide icons

Backend

Node.js

TypeScript

Express

Zod

Supabase client

Helmet

CORS

express-rate-limit

Pino

REST API

Database and authentication

Supabase Auth

Supabase PostgreSQL

PostgreSQL Row Level Security

Testing

Vitest

React Testing Library

Supertest

Playwright for critical end-to-end flows

Do not add libraries just because they are popular. Prefer the existing stack.

4. Existing Skill Library

The project contains a skill library under:

.agents/skills/

The current library includes:

app-icon
better-icons
color-expert
color-palette
express-rest-api
express-typescript
frontend-expert
nodejs-backend-patterns
nodejs-best-practices
react-expert
review-docs
shadcn-ui
tailwind-best-practices
tailwind-v4-shadcn
tailwindcss-fundamentals-v4
typescript-advanced-types
typescript-clean-code
typescript-docs
typescript-expert
typescript-react-reviewer
ui-design
ui-ux-designer
vercel-react-best-practices
web-design-guidelines
web-styling-tailwind

IMPORTANT: Skill-first development

Before implementing any feature, Claude MUST:

Identify the skills relevant to that feature.

Read/load those skill files from .agents/skills/.

Apply their guidance.

Only then design and implement the feature.

Review the implementation against those skills.

Never implement first and read skills afterward.

5. Skill Selection Guide

Feature / Task

Skills to load

Backend REST API

express-rest-api, express-typescript

Node backend architecture

nodejs-backend-patterns, nodejs-best-practices

TypeScript

typescript-expert, typescript-clean-code

Advanced TypeScript

typescript-advanced-types

React

react-expert, frontend-expert

React + TypeScript review

typescript-react-reviewer

UI components

shadcn-ui, ui-design

UX

ui-ux-designer, web-design-guidelines

Tailwind

tailwind-v4-shadcn, tailwind-best-practices, tailwindcss-fundamentals-v4, web-styling-tailwind

Colors

color-expert, color-palette

Icons

better-icons, app-icon

Documentation

typescript-docs, review-docs

Vercel/frontend deployment

vercel-react-best-practices

If a feature crosses multiple areas, load all applicable skills.

6. Production-Grade Repository Structure

Use this target structure:

setux/
│
├── .agents/
│   └── skills/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── deploy.yml
│   └── pull_request_template.md
│
├── docs/
│   ├── prd/
│   ├── architecture/
│   │   ├── hld.md
│   │   ├── backend-lld.md
│   │   ├── frontend-architecture.md
│   │   └── database-design.md
│   ├── api/
│   │   ├── api-specification.md
│   │   ├── auth-api.md
│   │   ├── onboarding-api.md
│   │   └── application-api.md
│   ├── features/
│   │   └── scholarship-workflow.md
│   ├── integrations/
│   │   ├── digilocker-integration.md
│   │   └── government-connectors.md
│   ├── security/
│   │   ├── authentication-and-rbac.md
│   │   ├── security-design.md
│   │   └── error-handling.md
│   └── deployment/
│       └── deployment.md
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── router/
│   │   │   ├── providers/
│   │   │   └── layouts/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── common/
│   │   │   └── feedback/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── onboarding/
│   │   │   ├── citizen-dashboard/
│   │   │   ├── scholarships/
│   │   │   ├── applications/
│   │   │   ├── consent/
│   │   │   ├── tracking/
│   │   │   └── officer-dashboard/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── schemas/
│   │   ├── types/
│   │   └── utils/
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── onboarding/
│   │   │   ├── profiles/
│   │   │   ├── scholarships/
│   │   │   ├── applications/
│   │   │   ├── consent/
│   │   │   ├── workflow/
│   │   │   ├── verification/
│   │   │   ├── connectors/
│   │   │   ├── notifications/
│   │   │   └── audit/
│   │   ├── shared/
│   │   │   ├── errors/
│   │   │   ├── logger/
│   │   │   ├── validation/
│   │   │   ├── constants/
│   │   │   └── utils/
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── .env.example
│   └── package.json
│
├── mock-services/
│   ├── fake-digilocker/
│   ├── fake-identity/
│   ├── fake-education/
│   └── fake-income/
│
├── supabase/
│   ├── migrations/
│   ├── seed/
│   └── functions/
│
├── scripts/
│   ├── seed-demo-data.*
│   ├── verify-env.*
│   └── health-check.*
│
├── .env.example
├── .gitignore
├── AGENT.md
├── CLAUDE.md
├── README.md
└── package.json

7. Backend Module Contract

Every substantial backend module should follow:

module/
├── module.routes.ts
├── module.controller.ts
├── module.service.ts
├── module.repository.ts
├── module.schema.ts
├── module.types.ts
├── module.constants.ts
└── index.ts

Dependency flow:

Route
  ↓
Controller
  ↓
Service
  ↓
Repository / Connector
  ↓
Database / External System

Rules:

Routes define HTTP wiring.

Controllers translate HTTP requests/responses.

Services contain business logic.

Repositories handle persistence.

Connectors handle external systems.

Schemas validate input/output.

Types define domain contracts.

Do not put business logic inside route handlers.

8. Frontend Feature Contract

Use feature-based architecture:

features/applications/
├── components/
├── hooks/
├── pages/
├── services/
├── schemas/
├── types/
├── constants/
└── index.ts

Shared primitives go under:

components/ui/
components/common/
components/feedback/

Feature-specific logic must stay inside its feature.

9. Authentication and RBAC

Authentication:

Supabase Auth

Authorization:

Backend RBAC
+
resource ownership
+
PostgreSQL RLS

MVP roles:

CITIZEN
GOVERNMENT_OFFICER

A user's role must never be trusted from arbitrary frontend input.

Frontend route protection is for UX.

Backend authorization is mandatory for security.

10. Consent

Sensitive government data access follows:

Application
    ↓
Data requirement
    ↓
Consent check
    ↓
Authorized connector
    ↓
Normalized response
    ↓
Verification

If consent is absent/revoked, the protected connector operation must not proceed.

11. Connector Architecture

Business modules must depend on interfaces, not providers.

Example:

Scholarship Service
       │
       ▼
DocumentProvider
       │
       ▼
FakeDigiLockerConnector

Not:

Scholarship Service
       │
       ▼
FakeDigiLockerService

The fake provider must be replaceable later.

Provider-specific response formats must be normalized into SetuX domain models.

12. Scholarship Workflow

The workflow is explicit:

DRAFT
  │
  ▼
SUBMITTED
  │
  ▼
UNDER_VERIFICATION
  │
  ▼
UNDER_REVIEW
  ├───────────────┐
  ▼               ▼
APPROVED        REJECTED

Only valid transitions are allowed.

Every important transition should create an audit event.

13. Database Rules

Supabase PostgreSQL is the persistence layer.

Use migrations for schema changes.

Every protected table must be evaluated for:

primary keys

foreign keys

indexes

constraints

RLS

role access

ownership rules

audit requirements

Do not duplicate data merely because it is convenient for a screen.

Use domain entities defined by the database design document.

14. API Rules

API base:

/api/v1

Examples:

POST /api/v1/auth/login
POST /api/v1/auth/logout

GET  /api/v1/profile
POST /api/v1/onboarding

GET  /api/v1/scholarships
GET  /api/v1/scholarships/:id

POST /api/v1/applications
GET  /api/v1/applications/:id
POST /api/v1/applications/:id/consent
POST /api/v1/applications/:id/submit

GET  /api/v1/officer/applications
POST /api/v1/applications/:id/approve
POST /api/v1/applications/:id/reject

Exact API behavior must follow the existing API specification documents.

Do not invent a conflicting contract.

15. Security Rules

Never commit:

.env
API secrets
Supabase service-role keys
private credentials
real government IDs
real citizen documents

Never log:

passwords
access tokens
full government IDs
document contents
private credentials

Use synthetic data for the SIH prototype.

Security must be enforced server-side and at the database layer where appropriate.

16. Error Handling

Support at least:

VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
CONNECTOR_ERROR
CONNECTOR_TIMEOUT
EXTERNAL_SERVICE_ERROR
INTERNAL_ERROR

Do not expose stack traces or internal implementation details to clients.

17. UI Rules

Follow the approved SetuX design system.

Visual direction:

Government technology
Secure
Trustworthy
Modern
Clean
Blue-focused
White surfaces
Rounded cards
Clear hierarchy
Accessible contrast

Reuse existing design primitives.

Before creating new UI patterns:

inspect existing components

load relevant UI skills

inspect the design documents

implement using existing patterns where possible

18. Required UI States

Every asynchronous feature must consider:

Loading
Success
Empty
Validation error
Unauthorized
Forbidden
Not found
Network failure
Server failure
Connector failure
Retry

Never design only the happy path.

19. Feature Implementation Protocol

For EVERY feature:

1. Read AGENT.md
        ↓
2. Read relevant project docs
        ↓
3. Identify relevant skills
        ↓
4. Load/read those skills
        ↓
5. Inspect existing code
        ↓
6. Define implementation plan
        ↓
7. Implement
        ↓
8. Add validation/security
        ↓
9. Add error/loading states
        ↓
10. Add tests
        ↓
11. Typecheck
        ↓
12. Lint
        ↓
13. Build
        ↓
14. Review against skills
        ↓
15. Update documentation

20. Definition of Done

A feature is complete only when:

requirements are implemented

architecture is respected

relevant skills were loaded

types are correct

input validation exists

authorization is enforced

RLS is considered

consent is enforced where required

error states are handled

tests exist

typecheck passes

lint passes

build passes

documentation is updated where necessary

21. No Hallucination Rule

When information is missing:

Current requirement
      ↓
PRD
      ↓
HLD
      ↓
LLD
      ↓
API specification
      ↓
Database design
      ↓
Security docs
      ↓
Existing code

Do not invent behavior that conflicts with these sources.

If an architectural/security/data decision genuinely cannot be inferred, ask before making a high-impact change.

22. Final Principle

Every implementation should strengthen this demonstration:

Citizen
   ↓
Authenticate
   ↓
Onboard
   ↓
Choose Scholarship
   ↓
Fill Once
   ↓
Give Consent
   ↓
SetuX Workflow
   ↓
Government Connectors
   ↓
Verification
   ↓
Officer Review
   ↓
Approve / Reject
   ↓
Unified Status

SetuX is demonstrating interoperability and unified service delivery, not replacing every government system.