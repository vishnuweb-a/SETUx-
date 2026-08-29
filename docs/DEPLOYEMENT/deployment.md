SetuX — Deployment Design

Version: 1.0
Project: SetuX SIH MVP
Architecture: Modular Monolith
Backend: Supabase + PostgreSQL
Frontend: Web Application
Government Integrations: Fake/Mock Connectors
Deployment Goal: Simple, reproducible, secure deployment suitable for an SIH prototype.

1. Purpose

This document defines how the SetuX SIH prototype will be built, configured, deployed, tested, monitored, and demonstrated.

The deployment architecture should remain intentionally simple.

The MVP does not require Kubernetes, microservices, service meshes, or complex cloud infrastructure.

The target is:

                    INTERNET
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     Frontend Host              Supabase
          │                  ┌──────┴──────┐
          │                  │ Auth        │
          │                  │ PostgreSQL  │
          │                  │ RLS         │
          │                  └──────┬──────┘
          │                         │
          └───────────┬─────────────┘
                      ▼
                 SetuX Backend
                      │
                      ▼
              Fake Government
                Connectors

2. Deployment Objectives

The deployment must provide:

working citizen authentication

working government-officer authentication

role-based dashboards

citizen onboarding

scholarship application workflow

consent management

fake DigiLocker integration

fake government connectors

officer review

approval/rejection

notifications where implemented

audit logging

error handling

secure environment configuration

3. MVP Deployment Philosophy

For SIH:

Keep the infrastructure simple; demonstrate the architecture through the application.

The deployment should prioritize:

Reliability
+
Security
+
Ease of setup
+
Low operational complexity
+
Fast demonstration

Avoid introducing infrastructure that does not contribute directly to the prototype.

4. Recommended Deployment Architecture

                        USERS
                          │
                          ▼
                 ┌─────────────────┐
                 │    Frontend     │
                 │  Web Application│
                 └────────┬────────┘
                          │
                        HTTPS
                          │
                          ▼
                 ┌─────────────────┐
                 │  SetuX Backend  │
                 │ Modular Monolith│
                 └───────┬─────────┘
                         │
           ┌─────────────┼──────────────┐
           │             │              │
           ▼             ▼              ▼
       Supabase      Fake Connectors   Logging
       Auth/DB            │
                          ▼
                  Mock Government
                     Systems

5. Deployment Components

5.1 Frontend

Responsible for:

authentication UI

citizen onboarding

citizen dashboard

application forms

consent UI

application tracking

officer dashboard

review and decision screens

error states

The frontend communicates with the SetuX backend through HTTPS APIs.

5.2 Backend

The backend is a modular monolith.

Conceptually:

SetuX Backend
│
├── Auth
├── Onboarding
├── Applications
├── Consent
├── Scholarships
├── Workflow
├── Connectors
├── Notifications
├── Audit
└── Error Handling

It should be deployed as one backend application for the MVP.

5.3 Supabase

Supabase provides:

Authentication
       +
PostgreSQL
       +
Row Level Security
       +
Database APIs / SDK

The application database remains centralized.

5.4 Fake Government Systems

The SIH prototype uses simulated government services.

Examples:

Fake DigiLocker
Fake Identity Provider
Fake Income Provider
Fake Education Provider

These can be:

separate mock services, or

mock endpoints/modules within the backend during the earliest prototype stage.

The connector interface should remain independent so they can later be replaced by real providers.

6. Environment Architecture

Use separate environments where practical.

LOCAL
  ↓
DEVELOPMENT
  ↓
DEMO / STAGING
  ↓
PRODUCTION

For the SIH MVP, the minimum recommended environments are:

LOCAL
DEMO

A separate production environment is optional until the application is intended for real users.

7. Local Development

Developer machine:

Frontend
    │
    ▼
Local Backend
    │
    ▼
Supabase Project / Local Supabase
    │
    ▼
Fake Connectors

Example:

Frontend
http://localhost:3000

Backend
http://localhost:8000

Supabase
Hosted project or local instance

Exact ports should be determined by the implementation.

8. Demo Environment

The SIH demo should use a stable deployed environment.

Judge / User
     ↓
HTTPS
     ↓
SetuX Frontend
     ↓
SetuX Backend
     ↓
Supabase
     ↓
Fake Government Connectors

The demo environment should not depend on a developer's laptop.

9. Frontend Deployment

Recommended flow:

Git Repository
      ↓
Build
      ↓
Frontend Hosting
      ↓
HTTPS
      ↓
Users

The exact hosting provider can be selected by the team based on the framework and available infrastructure.

The frontend build must use only public/client-safe environment variables.

10. Backend Deployment

Recommended flow:

Git Repository
      ↓
Install Dependencies
      ↓
Run Tests
      ↓
Build
      ↓
Deploy Backend
      ↓
HTTPS API

The backend should run as a single application.

For the SIH MVP:

1 Backend Service

is sufficient.

11. Supabase Deployment

Create a dedicated Supabase project for the demo environment.

Configure:

Authentication
Database
RLS Policies
Tables
Indexes
Functions if required

Do not use personal development data in the final SIH demo database.

12. Database Migration Strategy

Database changes should be version-controlled.

Conceptually:

Migration 001
      ↓
Migration 002
      ↓
Migration 003
      ↓
Migration 004

Never rely exclusively on manually changing the production/demo database.

The schema should be reproducible from migration files.

13. Seed Data

The demo environment should contain controlled seed data.

Examples:

Demo Citizen
Demo Officer
Demo Admin
Demo Scholarship
Demo Applications
Fake Credentials
Fake Verification Results

Seed data must contain fictional information.

Do not use real Aadhaar numbers, PAN numbers, bank details, or real government documents.

14. Demo Accounts

Create dedicated demo identities.

Example:

CITIZEN_DEMO
OFFICER_DEMO
ADMIN_DEMO

Credentials should be stored securely and shared only with authorized team members.

Do not hardcode demo passwords into source code.

15. Environment Variables

Example backend configuration:

NODE_ENV=
PORT=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

FRONTEND_URL=

FAKE_DIGILOCKER_URL=
FAKE_IDENTITY_URL=
FAKE_EDUCATION_URL=
FAKE_INCOME_URL=

The exact variables depend on the implementation.

16. Environment Variable Rules

Never commit secrets:

.env
.env.local
.env.production

Use:

Environment configuration
+
Secret storage

for deployed environments.

Public frontend variables must never contain:

service-role keys
provider secrets
database passwords
private API keys

17. Build Pipeline

Recommended CI/CD flow:

Developer Push
      ↓
Git Repository
      ↓
Install Dependencies
      ↓
Lint
      ↓
Type Check
      ↓
Unit Tests
      ↓
Build
      ↓
Deploy
      ↓
Health Check

If any required validation fails:

Pipeline stops

18. Continuous Integration

At minimum, CI should run:

Dependency installation
Linting
Type checking
Unit tests
Build

For the SIH MVP, this is sufficient.

Additional integration/end-to-end tests can be added as the prototype becomes stable.

19. Continuous Deployment

A simple deployment model:

main
 │
 ├── CI
 │
 ├── Build
 │
 └── Deploy Demo

Feature branches:

feature/*
     ↓
Pull Request
     ↓
CI
     ↓
Review
     ↓
Merge
     ↓
Demo Deployment

20. Deployment Health Check

After deployment:

Deploy
  ↓
Health Check
  ↓
Backend reachable?
  ↓
Database reachable?
  ↓
Authentication reachable?
  ↓
Critical workflow reachable?

Example endpoint:

GET /health

Response:

{
  "status": "ok"
}

A detailed internal health check can be implemented separately if required.

21. Readiness vs Liveness

For a more robust deployment:

/health

checks whether the process is running.

/ready

can verify whether required dependencies are available.

Example:

/health
→ process alive

/ready
→ backend + required services ready

For the SIH MVP, /health is mandatory and /ready is optional.

22. Deployment Failure Handling

If deployment fails:

Build
  ↓
Failure
  ↓
Do not deploy broken build

If deployment succeeds but health check fails:

Deployment
    ↓
Health Check
    ↓
FAIL
    ↓
Rollback / Previous Version

The exact rollback capability depends on the hosting provider.

23. Database Backup

The demo database should use the backup capabilities available through the selected Supabase plan/configuration.

Before major schema changes:

Backup / export
      ↓
Migration
      ↓
Validation

For the SIH prototype, the most important requirement is preventing accidental loss of the stable demo state.

24. Data Retention

Because this is a prototype:

Use fictional demo data

Do not retain real citizen data.

When the prototype is no longer required:

Demo data
   ↓
Delete / reset

Any future production deployment will require a formal retention and deletion policy.

25. HTTPS

The deployed application must use HTTPS.

Browser
   │
 HTTPS
   ▼
Frontend
   │
 HTTPS
   ▼
Backend

No sensitive production/demo authentication or citizen information should be sent over plain HTTP.

26. Domain Configuration

The final deployment may use:

app.setux.example
api.setux.example

or equivalent domains.

The exact domain is a deployment decision and is not part of the application architecture.

27. CORS Configuration

Backend CORS should allow only the deployed frontend origin.

Example concept:

Allowed Origin:
https://<setux-frontend-domain>

Avoid unrestricted production CORS.

Local development can allow the local frontend origin.

28. Connector Deployment

The fake government connectors should be configurable.

Connector Interface
       │
       ├── Fake DigiLocker
       ├── Fake Identity
       ├── Fake Education
       └── Fake Income

The workflow must not directly depend on provider-specific implementation.

This allows:

Fake Provider
     ↓
Real Provider

to be changed later without rewriting the scholarship workflow.

29. Fake DigiLocker Demo Configuration

The fake DigiLocker connector should support controlled scenarios.

NORMAL
TIMEOUT
NOT_FOUND
IDENTITY_MISMATCH
INVALID_RESPONSE

This allows the deployment to demonstrate:

Success
+
Failure
+
Retry
+
Recovery

without depending on real government infrastructure.

30. Deployment Security

Before demo deployment:

✓ HTTPS enabled
✓ Service-role key protected
✓ Environment variables configured
✓ CORS restricted
✓ RLS enabled
✓ Authentication configured
✓ RBAC verified
✓ Fake providers contain no real data
✓ Logs do not expose secrets
✓ Demo credentials secured

31. Production vs SIH Prototype

The SIH deployment intentionally does not attempt to be a production government platform.

SIH MVP

Simple hosting
+
Supabase
+
Modular monolith
+
Fake connectors
+
Demo data

Future Production

Would require additional considerations such as:

High availability
Multi-region architecture
Disaster recovery
Advanced observability
Centralized secret management
WAF
DDoS protection
Security operations
Formal compliance
Government network requirements
Real provider integration
Formal data retention
Penetration testing

These are outside the SIH prototype scope.

32. Deployment Observability

At minimum monitor:

Application availability
API errors
Database availability
Connector failures
Authentication failures
Request latency
Deployment status

For the SIH prototype, simple application logs and hosting/Supabase monitoring are sufficient.

33. Logging Architecture

Frontend
   │
   ▼
Backend Logs
   │
   ├── Request ID
   ├── Error Code
   ├── Module
   ├── Operation
   └── Status

Sensitive information must not be logged.

See security-design.md and error-handling.md for detailed rules.

34. Deployment Rollback

A rollback should be possible at the application version level.

Version N
   ↓
Deploy Version N+1
   ↓
Health Check FAIL
   ↓
Rollback
   ↓
Version N

Database migrations require additional care.

Never automatically roll back destructive database migrations without a defined recovery strategy.

35. Deployment Checklist

Before Deployment

Code merged

Lint passes

Type checks pass

Tests pass

Build succeeds

Environment variables configured

Supabase project configured

Database migrations ready

RLS policies verified

Demo data prepared

Fake connectors configured

CORS configured

HTTPS configured

After Deployment

Frontend loads

Backend health check passes

Supabase connection works

Citizen login works

Officer login works

Role routing works

Onboarding works

Application creation works

Consent works

Fake DigiLocker works

Verification works

Officer review works

Approval/rejection works

Audit events are recorded

Error scenarios work

36. SIH Demo Readiness Checklist

Before presenting:

                    SETUX
                      │
                      ▼
              ┌──────────────┐
              │ Demo System  │
              └──────┬───────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
    Citizen        Officer       Admin
       │             │
       ▼             ▼
   Application     Review
       │             │
       ▼             ▼
    Consent      Approve/Reject
       │
       ▼
 Fake DigiLocker
       │
       ▼
 Verification

Verify the complete journey before the presentation.

37. Recommended SIH Demo Flow

1. Open SetuX
        ↓
2. Citizen Login
        ↓
3. Citizen Dashboard
        ↓
4. Complete Onboarding
        ↓
5. Select Scholarship
        ↓
6. Start Application
        ↓
7. Provide Consent
        ↓
8. SetuX calls Fake DigiLocker
        ↓
9. Credential Verification
        ↓
10. Application Submitted
        ↓
11. Officer Login
        ↓
12. Officer Dashboard
        ↓
13. Review Application
        ↓
14. Approve / Reject
        ↓
15. Citizen sees updated status

This should be the primary happy-path demonstration.

38. Failure Demonstration

After the happy path, demonstrate interoperability resilience:

Application
    ↓
Verification
    ↓
Fake DigiLocker
    ↓
TIMEOUT
    ↓
SetuX detects failure
    ↓
Retry
    ↓
Success
    ↓
Workflow continues

This demonstrates that SetuX is not simply a collection of screens.

39. Deployment Architecture Summary

                         ┌───────────────┐
                         │    Citizen    │
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │   Frontend    │
                         │   HTTPS       │
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │ SetuX Backend  │
                         │ Modular        │
                         │ Monolith       │
                         └───────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
        ┌───────────┐      ┌────────────┐     ┌──────────┐
        │ Supabase  │      │  Workflow  │     │  Audit   │
        │ Auth + DB │      │   Engine   │     │  Logs    │
        └───────────┘      └─────┬──────┘     └──────────┘
                                  │
                           ┌──────┴───────┐
                           ▼              ▼
                     Fake DigiLocker   Fake Gov APIs

40. Definition of Done

The deployment design is complete when:

✓ Frontend can be deployed
✓ Backend can be deployed
✓ Supabase environment is configured
✓ Database migrations are reproducible
✓ Environment variables are externalized
✓ Secrets are protected
✓ HTTPS is enabled
✓ CORS is configured
✓ Health endpoint works
✓ CI validates the application
✓ Demo seed data is available
✓ Fake connectors are available
✓ Citizen flow works
✓ Officer flow works
✓ Error handling works
✓ Rollback strategy is understood
✓ SIH demo environment is stable

41. Final Deployment Principle

The SetuX SIH prototype should use:

                    SIMPLE
                       │
                       ▼
                MODULAR MONOLITH
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Frontend       Backend        Supabase
        │              │
        │              ▼
        │       Fake Connectors
        │              │
        └──────────────┼──────────────┘
                       ▼
                  DEMO SYSTEM

The deployment architecture should support the prototype without becoming more complex than the product itself.

For SIH, reliability and a complete working flow are more valuable than unnecessary infrastructure complexity.