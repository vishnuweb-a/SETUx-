etuX — Recommended Development Tech Stack
                    SETUX
                      │
        ┌─────────────┴─────────────┐
        │                           │
     FRONTEND                    BACKEND
        │                           │
        ▼                           ▼
 React + TypeScript          Node.js + TypeScript
        │                           │
        ▼                           ▼
 Tailwind CSS                  Express.js
        │                           │
        └─────────────┬─────────────┘
                      ▼
                  Supabase
             ┌────────┼────────┐
             ▼        ▼        ▼
          Auth    PostgreSQL   RLS
                      │
                      ▼
              Fake Government
                 Connectors
1. Frontend
Technology	Purpose
React	UI development
TypeScript	Type safety
Vite	Frontend build/dev environment
Tailwind CSS	Styling
React Router	Routing
TanStack Query	API/server-state management
Zod	Client-side validation
Lucide React	Icons

For the UI you have already designed—citizen authentication, onboarding, citizen dashboard, application tracking, and government dashboard—this is more than enough.

2. Backend
Core

Node.js + TypeScript + Express.js

Why?

Your architecture is a modular monolith, so Express is sufficient without adding unnecessary infrastructure.

Node.js
   │
   ▼
Express
   │
   ├── Auth
   ├── Onboarding
   ├── Applications
   ├── Consent
   ├── Scholarship
   ├── Workflow
   ├── Connectors
   ├── Audit
   └── Error Handling

Recommended backend libraries:

express
typescript
zod
@supabase/supabase-js
jsonwebtoken / jose (if custom token handling is required)
express-rate-limit
cors
helmet
pino

We should avoid implementing authentication ourselves if Supabase Auth already handles the requirement.

3. Database
PostgreSQL through Supabase

This is already aligned with the architecture we've designed.

Supabase
   │
   ├── PostgreSQL
   ├── Authentication
   ├── Row Level Security
   └── Database Management

Core tables would roughly be:

profiles
roles
scholarships
applications
application_status_history
consents
documents
verifications
connector_requests
audit_logs
notifications

The exact schema should follow the database-schema.md we already designed.

4. Authentication

Use:

Supabase Auth

Instead of creating your own authentication system.

User
 ↓
Supabase Auth
 ↓
Authenticated Session
 ↓
SetuX Backend
 ↓
Role Resolution
 ↓
Citizen / Officer / Admin

Your application backend should still perform authorization.

Important distinction:

Authentication
→ Supabase Auth

Authorization
→ SetuX RBAC + PostgreSQL RLS
5. Authorization / RBAC

Use two layers.

Application-level RBAC

Backend checks:

Who is the user?
What role do they have?
What operation are they attempting?

Example:

Citizen
   ↓
GET /applications/:id
   ↓
Does application belong to citizen?
   ↓
YES → allow
NO  → deny
Database-level security

Use:

PostgreSQL Row Level Security (RLS)

So even if a bug occurs in the application layer, the database provides another protection layer.

6. API

Use:

REST API

For the SIH prototype, REST is the right choice.

Example:

POST   /api/v1/auth/login

GET    /api/v1/profile

POST   /api/v1/applications

GET    /api/v1/applications/:id

POST   /api/v1/applications/:id/consent

POST   /api/v1/applications/:id/submit

GET    /api/v1/officer/applications

POST   /api/v1/applications/:id/approve

POST   /api/v1/applications/:id/reject

And all APIs follow the conventions defined in your api-specification.md.

7. Validation

Use:

Zod

Example architecture:

Request
   ↓
Zod Schema
   ↓
Validation
   ↓
Controller
   ↓
Service

Never trust frontend validation alone.

Frontend validation
        +
Backend validation
8. Scholarship Workflow

Don't introduce a separate workflow engine for the MVP.

Implement the scholarship workflow inside the backend as a state machine / workflow service.

Example:

DRAFT
  ↓
SUBMITTED
  ↓
VERIFICATION
  ↓
UNDER_REVIEW
  ↓
APPROVED

or:

UNDER_REVIEW
      ↓
   REJECTED

Backend controls the allowed transitions.

Application
     ↓
Workflow Service
     ↓
Can transition?
   /       \
 YES       NO
  ↓         ↓
Update    Error
Status
9. Fake Government Connectors

This is one of the most important parts of your SIH architecture.

We should not hardcode DigiLocker logic directly inside the scholarship service.

Instead:

Scholarship Service
       ↓
Connector Interface
       ↓
┌──────────────────────┐
│ Government Connector │
└──────────┬───────────┘
           │
     ┌─────┼─────┐
     ▼     ▼     ▼
 DigiLocker Identity Education
   Mock      Mock      Mock

For example:

DigiLockerConnector
IdentityConnector
EducationConnector
IncomeConnector

Each returns a normalized SetuX response.

This allows:

Fake DigiLocker
       ↓
       later
       ↓
Real DigiLocker

without rewriting the application workflow.

10. API Documentation

Use:

OpenAPI / Swagger

This will be very useful for your backend team.

api-specification.md
        +
OpenAPI
        ↓
Interactive API Documentation

The frontend team can understand exactly:

endpoint
request
response
status codes
errors
authentication
11. Logging

Use:

Pino

Backend:

Request
  ↓
Request ID
  ↓
Controller
  ↓
Service
  ↓
Connector
  ↓
Log

Never log sensitive information such as:

passwords
tokens
private credentials
full government IDs
12. Security

Recommended:

Helmet
CORS
Rate Limiting
Zod
Supabase Auth
RBAC
RLS
Audit Logs
HTTPS
Environment Secrets

Security architecture remains the one defined in your security-design.md.

13. Testing
Backend

Use:

Vitest or Jest

I'd recommend:

Vitest

for a modern TypeScript stack.

Test:

Services
Workflow transitions
RBAC
Consent
Connectors
Error handling
Frontend

Use:

Vitest
React Testing Library
End-to-End

If time permits:

Playwright

for the complete:

Citizen
 ↓
Application
 ↓
Verification
 ↓
Officer
 ↓
Approval

flow.

14. Git & Collaboration

Use:

Git + GitHub

Branch structure:

main
 │
 ├── develop
 │
 ├── feature/auth
 ├── feature/onboarding
 ├── feature/application
 ├── feature/workflow
 ├── feature/connectors
 └── feature/officer-dashboard

For your SIH team, main should contain only reviewed/stable code.

15. CI/CD

Use:

GitHub Actions

Pipeline:

Push / PR
   ↓
Install
   ↓
Lint
   ↓
Type Check
   ↓
Tests
   ↓
Build
   ↓
Deploy
16. Deployment

For the MVP:

Frontend
   ↓
Vercel / equivalent frontend host

Backend
   ↓
Render / Railway / equivalent service

Database + Auth
   ↓
Supabase

You don't need Kubernetes for this prototype.

17. Complete Stack

So if I were setting up the SetuX repository with your current architecture, I'd lock the stack as:

Frontend
React
TypeScript
Vite
Tailwind CSS
React Router
TanStack Query
Zod
Lucide
Backend
Node.js
TypeScript
Express.js
Zod
Supabase JS
Helmet
CORS
express-rate-limit
Pino
Database
PostgreSQL
Supabase
Row Level Security
Authentication
Supabase Auth
API
REST
OpenAPI / Swagger
Integration
Connector Pattern
Fake DigiLocker
Fake Identity Provider
Fake Education Provider
Fake Income Provider
Testing
Vitest
React Testing Library
Playwright
DevOps
Git
GitHub
GitHub Actions
Docker (optional but recommended for backend reproducibility)
Deployment
Frontend → Vercel
Backend  → Render/Railway
Database → Supabase
18. Final SetuX Stack
                         SETUX
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
        React + TS                 Node.js + TS
          Vite                       Express
        Tailwind                       │
             │                         │
             │                    REST API
             │                         │
             └─────────────┬───────────┘
                           │
                           ▼
                       Supabase
                  ┌────────┼────────┐
                  │        │        │
                 Auth   PostgreSQL  RLS
                           │
                           ▼
                    SetuX Workflow
                           │
                           ▼
                      Connectors
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        Fake DigiLocker  Fake Identity  Fake Education