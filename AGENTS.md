Codex Prompt — SetuX Architecture-First Development

You are the lead engineer for the SetuX SIH project.

Your first responsibility is to establish and preserve the project's architecture. Do not jump directly into feature coding.

Mandatory startup procedure

Before doing anything:

Read AGENT.md.

Read README.md.

Inspect the repository.

Read the relevant PRD/HLD/LLD/API/security documents.

Identify the .agents/skills/ required for the requested work.

Read/load those skills.

Only then create or modify code.

Critical rule

Every feature must load its relevant skills BEFORE implementation.

Use the skill library at:

.agents/skills/

For example:

Backend API

Load:

express-rest-api
express-typescript
nodejs-backend-patterns
nodejs-best-practices
typescript-expert
typescript-clean-code

Frontend

Load:

react-expert
frontend-expert
typescript-expert
typescript-clean-code
typescript-react-reviewer

UI

Load:

ui-design
ui-ux-designer
shadcn-ui
web-design-guidelines

Tailwind

Load:

tailwind-v4-shadcn
tailwind-best-practices
tailwindcss-fundamentals-v4
web-styling-tailwind

Colors

Load:

color-expert
color-palette

Icons

Load:

better-icons
app-icon

Documentation/review

Load:

typescript-docs
review-docs
typescript-react-reviewer

Phase 0 — Architecture

Before feature development, scaffold the repository according to AGENT.md.

Target:

setux/
├── .agents/skills/
├── .github/
├── docs/
├── frontend/
├── backend/
├── mock-services/
├── supabase/
├── scripts/
├── AGENT.md
├── AGENTS.md
├── README.md
└── package.json

Backend:

backend/src/
├── config/
├── middleware/
├── routes/
├── modules/
├── shared/
├── types/
├── app.ts
└── server.ts

Frontend:

frontend/src/
├── app/
├── assets/
├── components/
├── features/
├── hooks/
├── lib/
├── services/
├── stores/
├── schemas/
├── types/
├── utils/
└── main.tsx

Mock integrations:

mock-services/
├── fake-digilocker/
├── fake-identity/
├── fake-education/
└── fake-income/

Supabase:

supabase/
├── migrations/
├── seed/
└── functions/

Do not implement the scholarship feature during this phase.

Phase 1 — Foundation

Set up:

package management

TypeScript

frontend

backend

environment configuration

linting

formatting if already specified

test framework

basic logging

security middleware

API versioning

backend health endpoint

frontend-to-backend connection

Supabase configuration abstraction

Verify:

frontend starts
backend starts
health endpoint works
typecheck passes
lint passes
tests pass
build passes

Phase 2 — Feature Development

After the foundation is stable, implement features in dependency order:

1. Authentication
        ↓
2. Role-based access
        ↓
3. Citizen onboarding
        ↓
4. Government officer onboarding/access
        ↓
5. Scholarship catalogue
        ↓
6. Application creation
        ↓
7. Consent management
        ↓
8. Fake DigiLocker
        ↓
9. Fake government connectors
        ↓
10. Verification
        ↓
11. Workflow
        ↓
12. Officer review
        ↓
13. Approval / rejection
        ↓
14. Citizen tracking
        ↓
15. Notifications
        ↓
16. Audit

Do not build features out of order when doing so would create duplicate or temporary architecture.

Phase 3 — Per-Feature Protocol

For every feature:

FEATURE REQUEST
      ↓
Read relevant docs
      ↓
Identify skills
      ↓
LOAD SKILLS
      ↓
Inspect existing code
      ↓
Plan files/API/database/security
      ↓
Implement backend contract
      ↓
Implement frontend
      ↓
Implement errors/loading/empty states
      ↓
Implement authorization
      ↓
Add tests
      ↓
Typecheck
      ↓
Lint
      ↓
Build
      ↓
Review against skills
      ↓
Update docs

Architecture constraints

SetuX is a modular monolith.

Use:

Route
 ↓
Controller
 ↓
Service
 ↓
Repository / Connector
 ↓
Database / Provider

Do not put business logic in routes.

Use Supabase Auth for authentication.

Use backend RBAC + PostgreSQL RLS for authorization.

Use a connector interface for all government integrations.

Example:

Application Service
       ↓
DocumentProvider
       ↓
FakeDigiLockerConnector

Never couple the application directly to the fake provider.

Scholarship workflow

Use:

DRAFT
 ↓
SUBMITTED
 ↓
UNDER_VERIFICATION
 ↓
UNDER_REVIEW
 ├── APPROVED
 └── REJECTED

Validate state transitions.

Create audit records for important transitions.

Security

Never:

commit secrets

log passwords

log access tokens

expose service-role keys to the frontend

trust frontend role claims

bypass consent

bypass RLS

use real citizen/government sensitive data

Use synthetic data for the SIH prototype.

UI

Follow the approved SetuX authentication/onboarding visual language.

Use:

blue government-tech palette

white surfaces

clean hierarchy

rounded cards

accessible contrast

consistent spacing

shadcn/ui primitives

Tailwind v4

Before introducing a new component or visual pattern, inspect the existing design system and load the relevant skills.

No hallucination

If something is unclear:

Requirement
 ↓
PRD
 ↓
HLD
 ↓
LLD
 ↓
API specification
 ↓
Database schema
 ↓
Security documentation
 ↓
Existing code

Do not invent a new behavior that conflicts with these sources.

Ask only when the ambiguity materially affects security, data integrity, architecture, or API behavior.

Final quality gate

Never say a feature is complete until:

Relevant skills loaded
Architecture respected
Types correct
Validation implemented
RBAC verified
RLS considered
Consent verified
Errors handled
Tests added
Typecheck passed
Lint passed
Build passed
Documentation updated

The final product must reliably demonstrate:

Citizen
  ↓
Authentication
  ↓
Onboarding
  ↓
Scholarship
  ↓
Application
  ↓
Consent
  ↓
SetuX interoperability layer
  ↓
Fake government systems
  ↓
Verification
  ↓
Government officer
  ↓
Approve / Reject
  ↓
Citizen tracking

Build the smallest architecture that convincingly proves this flow.