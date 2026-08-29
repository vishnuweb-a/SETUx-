SetuX — Security Design

Version: 1.0
Project: SetuX SIH MVP
Architecture: Modular Monolith
Backend: Supabase + PostgreSQL
Authentication: Supabase Auth
Primary Security Goal: Protect citizen data, consent, applications, government actions, and connector access.

1. Purpose

This document defines the security architecture for the SetuX SIH prototype.

SetuX handles a citizen's scholarship journey across:

Citizen
   ↓
Authentication
   ↓
Citizen Profile
   ↓
Scholarship Application
   ↓
Consent
   ↓
Government Connectors
   ↓
Verification
   ↓
Officer Review
   ↓
Final Decision

Security therefore cannot be treated as a single login feature.

The system must protect:

identity

citizen profile information

application information

consent records

credential metadata

verification results

government actions

connector operations

audit records

authentication sessions

2. Security Objectives

The MVP security design follows five primary objectives:

CONFIDENTIALITY
      +
INTEGRITY
      +
AUTHENTICATION
      +
AUTHORIZATION
      +
AUDITABILITY

Confidentiality

Only authorized users and services can access protected information.

Integrity

Users cannot arbitrarily modify application states, verification results, consent records, or government decisions.

Authentication

Every protected operation must originate from an authenticated identity.

Authorization

Authentication alone is insufficient. Access must also depend on role and resource ownership.

Auditability

Important actions must be traceable.

3. Threat Model

The prototype should consider the following threats:

1. Unauthorized user access
2. Citizen accessing another citizen's application
3. Citizen impersonation
4. Officer accessing unauthorized applications
5. Privilege escalation
6. Forged application status
7. Unauthorized connector access
8. Consent bypass
9. Token/session theft
10. API abuse
11. Sensitive information leakage
12. Malicious input
13. Duplicate/replayed requests
14. External provider compromise/failure
15. Database-level unauthorized access

The goal is not to implement enterprise-grade infrastructure for the SIH MVP, but to ensure the architecture does not make these threats trivial.

4. Security Architecture

                         INTERNET
                            │
                            ▼
                    ┌──────────────┐
                    │   Frontend   │
                    └──────┬───────┘
                           HTTPS
                            │
                            ▼
                    ┌──────────────┐
                    │  API Layer   │
                    └──────┬───────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
          Authentication          Authorization
          / Session                / RBAC
                │                     │
                └──────────┬──────────┘
                           ▼
                    SetuX Core Modules
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
    Application         Consent            Workflow
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                     Connectors
                           │
                           ▼
                 Fake Government APIs
                           │
                           ▼
                     Supabase DB
                           │
                           ▼
                       Audit Logs

5. Trust Boundaries

There are four important trust boundaries.

Boundary 1 — Browser → SetuX

Browser
   │
   │ HTTPS
   ▼
SetuX API

The browser is considered untrusted.

Never trust:

role supplied by frontend

citizen ID supplied by frontend

application ownership claims

application status

verification result

authorization decision

These must be validated server-side.

Boundary 2 — SetuX → Database

Backend
   ↓
Supabase/PostgreSQL

Database access must be protected through:

authenticated database access

Row Level Security where applicable

service-role credentials only on trusted backend

least-privilege access patterns

Boundary 3 — SetuX → Government Connectors

SetuX
   ↓
Connector
   ↓
Fake Government Provider

The connector boundary isolates provider-specific behavior.

Boundary 4 — Citizen Consent → External Data

Citizen
   ↓
Consent
   ↓
Connector
   ↓
External Data

Consent must be checked before protected external data access.

6. Authentication

Supabase Auth will be responsible for user authentication.

Basic flow:

User
  ↓
Login
  ↓
Supabase Auth
  ↓
Authenticated Session
  ↓
JWT / Access Token
  ↓
SetuX Backend

The backend validates the authenticated identity before processing protected requests.

SetuX should not implement a second independent password authentication system for the MVP.

7. Authentication vs Authorization

These are separate.

Authentication

Answers:

Who are you?

Example:

User = U123

Authorization

Answers:

What are you allowed to do?

Example:

Role = CITIZEN

Therefore:

JWT
 ↓
User Identity
 ↓
Role Resolution
 ↓
Permission Check
 ↓
Resource Ownership
 ↓
Allow / Deny

8. Roles

The MVP uses:

CITIZEN
OFFICER
ADMIN

Citizen

Can:

manage own profile

create own application

view own application

provide application information

grant/deny own consent

view own verification status

view own notifications

Cannot:

access another citizen's application

approve applications

reject applications

modify verification results

access connector secrets

Officer

Can:

access authorized government applications

review application information

view required verification results

approve applications

reject applications

request additional information

Cannot:

change citizen consent

impersonate a citizen

access unauthorized department data

modify audit history

Admin

Can:

monitor connector health

inspect integration failures

perform authorized operational actions

inspect system audit information

Admin permissions should still be explicit rather than treating ADMIN as unrestricted application access.

9. RBAC Model

Basic:

ROLE
  ↓
PERMISSIONS
  ↓
RESOURCE
  ↓
ACTION

Example:

CITIZEN
  ↓
APPLICATION_READ
  ↓
Application
  ↓
Ownership = current user

Officer:

OFFICER
  ↓
APPLICATION_REVIEW
  ↓
Application
  ↓
Department = officer.department

Authorization should therefore combine:

Role
+
Permission
+
Resource Scope

10. Server-Side Authorization

The frontend may hide unauthorized buttons, but this is not a security control.

Incorrect:

Frontend hides "Approve"
      ↓
Assume citizen cannot approve

Correct:

POST /approve
      ↓
Authenticate
      ↓
Resolve role
      ↓
Check permission
      ↓
Check department/application scope
      ↓
Allow / Reject

Every sensitive endpoint must perform backend authorization.

11. Resource Ownership

Citizen resources must be scoped to the authenticated citizen.

Example:

GET /applications/APP-001

Backend must verify:

application.citizen_id
        =
authenticated_user.id

If not:

403 Forbidden

or an appropriate non-disclosing response according to the API design.

The client must never be trusted to provide ownership.

12. Officer Resource Scope

Officer access should be limited to authorized applications.

Conceptually:

Officer
   ↓
Department
   ↓
Authorized Applications

Example:

Officer Department = Scholarship Department

Application Department = Scholarship Department

→ Access allowed

Different department:

Officer Department ≠ Application Department

→ Access denied

The exact department model should follow the database design.

13. JWT Security

JWTs should be treated as authentication credentials.

Rules:

validate tokens server-side

never trust unsigned or malformed tokens

do not accept arbitrary role claims from the frontend

keep access tokens out of application logs

use HTTPS in deployed environments

enforce session expiry according to Supabase configuration

The backend should obtain identity from the validated authentication context.

14. Session Security

The application should support:

Login
   ↓
Authenticated Session
   ↓
API Access
   ↓
Session Expiry
   ↓
Re-authentication

Logout should invalidate the user's application session according to the authentication architecture.

The frontend should not continue treating a user as authenticated after the authentication session has expired.

15. Password Security

For the MVP, password handling is delegated to Supabase Auth.

SetuX application tables should not store plaintext passwords.

Never store:

password
password confirmation
raw authentication secrets

in application tables.

16. API Security

Every protected API should follow:

Request
  ↓
HTTPS
  ↓
Authentication
  ↓
Authorization
  ↓
Input Validation
  ↓
Business Logic
  ↓
Database

Sensitive endpoints must never skip authentication or authorization.

17. Input Validation

All client input is untrusted.

Validate:

names

phone numbers

government ID format

application fields

consent identifiers

application identifiers

officer decision data

rejection reasons

connector request data

Use a schema validation layer before business logic.

Example:

HTTP Request
     ↓
Zod / Schema Validation
     ↓
Validated DTO
     ↓
Service

18. SQL Injection Protection

Never construct SQL using raw user input.

Prefer:

Supabase client / parameterized queries

and controlled query builders.

Incorrect:

"SELECT * FROM applications WHERE id = " + userInput

Correct:

Parameterized query / Supabase query builder

19. Row Level Security

Supabase PostgreSQL Row Level Security should be considered an additional protection layer.

Conceptually:

Database Request
       ↓
RLS Policy
       ↓
Allowed Rows

Citizen example:

citizen_id = authenticated user

Officer example:

authorized department scope

Important:

RLS is a defense-in-depth mechanism. Application-level authorization should still be implemented.

20. Service Role Key

The Supabase service-role key has elevated privileges.

Rules:

SERVICE_ROLE_KEY
        ↓
Backend only

Never expose it to:

browser

frontend environment variables

client bundle

Git repository

screenshots

public logs

Use environment variables/secrets management.

21. Environment Variables

Sensitive configuration must be externalized.

Example:

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

Do not commit secrets into source control.

Use:

.env

locally and secure environment configuration in deployment.

The actual production secret-management mechanism can be selected later.

22. Consent Security

Consent is a security boundary.

Before accessing protected external data:

Application
   ↓
Check Consent
   ↓
Consent = GRANTED?
   │
 ┌─┴─┐
NO  YES
│     │
▼     ▼
DENY  Connector

A frontend request cannot bypass this check.

23. Consent Integrity

A consent record should be tied to:

citizen
application
data purpose
provider
status
timestamp

Example:

{
  "applicationId": "APP-001",
  "citizenId": "CIT-001",
  "provider": "DIGILOCKER",
  "purpose": "SCHOLARSHIP_EDUCATION_VERIFICATION",
  "status": "GRANTED"
}

The backend should ensure that consent belongs to the same citizen and application involved in the operation.

24. Connector Security

The browser must never call government connectors directly.

Correct:

Browser
   ↓
SetuX API
   ↓
Connector
   ↓
Provider

Incorrect:

Browser
   ↓
Government API

This protects:

provider credentials

internal operation IDs

backend configuration

authorization logic

25. Fake Connector Security

Although the providers are fake, the architecture should simulate production security boundaries.

For example:

FAKE_DIGILOCKER_URL
FAKE_IDENTITY_URL
FAKE_INCOME_URL

should be backend configuration.

The frontend should know only:

SetuX API

This allows the same architecture to support real providers later.

26. Sensitive Data Minimization

SetuX should not store information simply because it can.

For the DigiLocker flow:

External Provider
      ↓
Credential
      ↓
SetuX
      ↓
Required metadata + verification result

Avoid unnecessarily copying entire documents.

Store only what the scholarship workflow actually needs.

27. Data Classification

Recommended MVP classification:

Data

Classification

Public scholarship information

Public

Application status

Protected

Citizen profile

Sensitive

Government ID

Highly sensitive

Consent records

Sensitive

Credential metadata

Sensitive

Verification results

Sensitive

Auth tokens

Secret

Provider credentials

Secret

Service-role key

Secret

Audit logs

Sensitive

The more sensitive the data, the fewer components should have access to it.

28. Logging Rules

Logs should help debugging without leaking sensitive data.

Safe:

application_id
workflow_step_id
provider
operation_id
status
error_code
timestamp

Do not log:

passwords
access tokens
service-role keys
provider secrets
complete government IDs
full credentials
unnecessary personal information

Example:

EDUCATION_VERIFICATION
APP-001
PROVIDER_TIMEOUT
attempt=2

29. Error Handling

Do not expose internal errors directly to users.

Incorrect:

PostgreSQL connection string:
xxxxx

Correct:

Unable to process the request.
Please try again later.

The backend logs the detailed internal error while the API returns a safe error response.

30. API Rate Limiting

Public and sensitive endpoints should be rate-limited.

Especially:

Login-related endpoints
Application creation
Consent operations
Connector operations
Officer decision endpoints

Example conceptual policy:

Repeated requests
      ↓
Rate limiter
      ↓
Allowed / 429 Too Many Requests

Exact limits should be tuned during implementation.

31. Brute Force Protection

Authentication is primarily handled by Supabase Auth.

The SetuX application should still avoid creating APIs that make credential attacks easier.

Protect:

authentication-related endpoints

verification operations

sensitive lookups

Use:

rate limiting
request validation
session controls

32. CORS

Only trusted frontend origins should be allowed in deployment.

Development:

localhost

Production:

SetuX frontend domain

Avoid:

Access-Control-Allow-Origin: *

for authenticated production APIs unless there is a deliberate reason.

33. HTTPS

All deployed traffic containing:

authentication tokens

citizen data

application data

consent information

connector requests

must use HTTPS.

Architecture:

Browser
   │
 HTTPS
   ▼
SetuX API
   │
 HTTPS where applicable
   ▼
External Provider

34. CSRF Considerations

The final CSRF strategy depends on how authentication credentials are transported.

If authentication relies on bearer tokens rather than ambient cookies, the risk profile differs from cookie-based authentication.

For any cookie-based authenticated endpoints, implement appropriate CSRF protections.

Do not assume that CORS alone is CSRF protection.

35. Application State Integrity

The client must never directly choose sensitive workflow states.

Incorrect:

{
  "status": "APPROVED"
}

from citizen frontend.

Correct:

Citizen submits application
       ↓
Backend validates
       ↓
Workflow
       ↓
Officer decision
       ↓
Backend changes status

Only authorized backend operations can transition an application into protected states.

36. Officer Decision Security

Approval/rejection is a privileged operation.

Flow:

Officer Request
      ↓
Authenticate
      ↓
Role = OFFICER?
      ↓
Permission?
      ↓
Application scope?
      ↓
Valid state transition?
      ↓
Record decision
      ↓
Audit event
      ↓
Notification

All checks are server-side.

37. Audit Logging

Important security events should be auditable.

Examples:

USER_LOGIN
APPLICATION_CREATED
APPLICATION_SUBMITTED
CONSENT_GRANTED
CONSENT_DENIED
CONNECTOR_REQUESTED
CREDENTIAL_ACCESSED
VERIFICATION_COMPLETED
CONNECTOR_FAILED
CONNECTOR_RETRIED
OFFICER_VIEWED_APPLICATION
APPLICATION_APPROVED
APPLICATION_REJECTED
INFO_REQUESTED

Audit records should not be casually editable by normal application users.

38. Audit Record

Conceptual structure:

{
  "actorId": "USER-001",
  "actorRole": "OFFICER",
  "action": "APPLICATION_APPROVED",
  "resourceType": "APPLICATION",
  "resourceId": "APP-001",
  "timestamp": "...",
  "metadata": {}
}

The metadata must avoid unnecessary sensitive data.

39. Replay Protection

Sensitive operations should not blindly execute multiple times.

Examples:

Approve application
Grant consent
Credential retrieval
Submit application

Use:

operation IDs
idempotency keys
state validation

where appropriate.

Example:

APP-001
+
OP-001
+
APPROVE

A duplicate request should not produce two approval events.

40. File and Document Security

SetuX should avoid becoming a document-storage system.

For the SIH prototype:

DigiLocker / Fake Provider
        ↓
Credential access
        ↓
Verification

not:

DigiLocker
        ↓
Download everything
        ↓
SetuX stores all documents

If future file storage is introduced, it must receive a separate security design covering:

encryption

access policies

signed URLs

file validation

malware scanning

retention

deletion

41. Database Security

Database security must include:

Authentication
+
Authorization
+
RLS
+
Least privilege
+
Secure credentials
+
Auditability

Sensitive tables should not be publicly readable.

The frontend should never receive unrestricted database credentials.

42. Least Privilege

Every component receives only the access it requires.

Example:

Citizen
  → own application

Officer
  → authorized applications

Workflow
  → workflow-related operations

Connector
  → provider operation required for its task

Admin
  → operational monitoring

Avoid a design where every module has unrestricted database access.

43. Security Headers

The deployed web application/API should use appropriate security headers.

Examples include:

Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Strict-Transport-Security

Exact configuration depends on the frontend/backend deployment environment.

44. Dependency Security

The project should keep dependencies controlled.

Recommended practices:

npm audit / equivalent checks
dependency updates
lockfile committed
remove unused packages
review new dependencies

Do not install packages solely for convenience when the same functionality can be implemented safely with existing dependencies.

45. Secrets Management

Secrets include:

Supabase service key
Provider credentials
API keys
JWT signing secrets if applicable
Deployment credentials

Rules:

Source code      ❌
Git repository   ❌
Frontend bundle  ❌
Logs             ❌
Environment      ✓
Secret manager   ✓

46. Security Monitoring

For the MVP, monitor:

Authentication failures
Authorization failures
Repeated API requests
Connector failures
Unexpected workflow transitions
Officer decisions
Consent activity
Database errors

A simple admin/security view is sufficient for the prototype.

47. Incident Handling

If a security-sensitive failure occurs:

Detect
  ↓
Record
  ↓
Block / contain
  ↓
Investigate
  ↓
Recover
  ↓
Audit

Example:

Repeated unauthorized application access
        ↓
403 responses
        ↓
Security log
        ↓
Admin review

The SIH MVP does not need a full enterprise SIEM, but the architecture should leave room for one.

48. Security Testing

Minimum security tests:

Authentication

No token
→ 401

Invalid token

Invalid token
→ 401

Citizen ownership

Citizen A
→ Citizen B application
→ denied

Officer authorization

Citizen
→ Approve application
→ denied

Department scope

Officer A
→ unauthorized department application
→ denied

Consent

No consent
→ connector request blocked

State integrity

Citizen
→ set status = APPROVED
→ denied

Input validation

Malformed request
→ 400

Rate limiting

Excessive requests
→ 429

Secret exposure

Frontend bundle
→ no service-role key

49. Security Flow — Citizen

Citizen
   ↓
Supabase Auth
   ↓
JWT/session
   ↓
SetuX API
   ↓
Role = CITIZEN
   ↓
Resource ownership check
   ↓
Permission check
   ↓
Application

50. Security Flow — Officer

Officer
   ↓
Supabase Auth
   ↓
JWT/session
   ↓
SetuX API
   ↓
Role = OFFICER
   ↓
Permission check
   ↓
Department/resource scope
   ↓
Application Review
   ↓
Approve / Reject / Request Info
   ↓
Audit

51. Security Flow — DigiLocker Connector

Scholarship Workflow
       ↓
Check Consent
       ↓
Consent Granted?
       ↓
YES
       ↓
Education Connector
       ↓
Fake DigiLocker Provider
       ↓
Credential
       ↓
Validate
       ↓
Normalize
       ↓
Verify
       ↓
Store minimum result
       ↓
Audit

52. End-to-End Security Architecture

                           USER
                            │
                            ▼
                     ┌────────────┐
                     │ Supabase   │
                     │   Auth     │
                     └─────┬──────┘
                           JWT
                            │
                            ▼
                     ┌────────────┐
                     │ SetuX API  │
                     └─────┬──────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
             Authentication     Authorization
                  │                 │
                  └────────┬────────┘
                           ▼
                    Input Validation
                           │
                           ▼
                      SetuX Core
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
         Application     Consent      Workflow
             │             │             │
             │             │             ▼
             │             │        Connectors
             │             │             │
             │             │             ▼
             │             │      Fake Gov Systems
             │             │
             └─────────────┼─────────────┘
                           ▼
                    Supabase/Postgres
                           │
                           ▼
                       Audit Logs

53. Security Principles for the SIH MVP

The team should follow these rules throughout development:

1. Never trust the frontend.
2. Authenticate every protected request.
3. Authorize every sensitive operation.
4. Enforce citizen ownership.
5. Enforce officer scope.
6. Require consent before protected external access.
7. Keep secrets on the backend.
8. Minimize stored sensitive data.
9. Never log credentials or tokens.
10. Validate all input.
11. Protect application state transitions.
12. Audit important actions.
13. Make connector operations traceable.
14. Use RLS as defense in depth.
15. Design fake connectors like real integrations.

54. MVP Security Checklist

Authentication

Supabase Auth configured

Protected routes require authentication

Invalid sessions rejected

Session expiry handled

Passwords not stored by SetuX

Authorization

CITIZEN role

OFFICER role

ADMIN role

Server-side RBAC

Citizen ownership checks

Officer department/scope checks

Privileged actions protected

Consent

Consent stored

Consent linked to application

Consent linked to purpose/provider

Connector checks consent

Denied consent blocks access

Data

Sensitive data minimized

No unnecessary document duplication

RLS policies considered/implemented

Service-role key backend-only

Database access restricted

API

Input validation

Rate limiting

Safe error responses

CORS configured

HTTPS in deployment

Idempotency for critical operations

Connectors

Provider credentials backend-only

Provider calls through connectors

Connector failures handled

Retry implemented

Operations auditable

Fake providers isolated from frontend

Audit

Login events

Consent events

Connector events

Verification events

Officer decision events

Security failures

55. SIH Security Demonstration

A good SIH security demonstration should show three things.

1. Citizen isolation

Citizen A
   ↓
Attempts Citizen B application
   ↓
403 / Access Denied

2. Role isolation

Citizen
   ↓
Attempts Approve
   ↓
403 / Access Denied

3. Consent protection

No Consent
   ↓
Education Connector
   ↓
BLOCKED

Then:

Consent Granted
   ↓
Education Connector
   ↓
Credential Retrieved
   ↓
Verified

These simple demonstrations communicate the security architecture clearly.

56. Security Definition of Done

The security implementation is complete for the SIH MVP when:

✓ Authentication works
✓ Role-based authorization works
✓ Citizen data isolation works
✓ Officer scope works
✓ Consent cannot be bypassed
✓ Sensitive connector access is backend-only
✓ Service secrets are not exposed
✓ Input is validated
✓ Critical state transitions are protected
✓ Rate limiting exists on sensitive endpoints
✓ Audit events are generated
✓ RLS is configured where required
✓ Connector failures are handled safely
✓ Sensitive data is minimized
✓ Security failure scenarios can be demonstrated

57. Final Security Architecture Principle

The SetuX security model can be summarized as:

             TRUST NOTHING
                  │
                  ▼
            Authenticate
                  │
                  ▼
             Authorize
                  │
                  ▼
          Check Ownership/Scope
                  │
                  ▼
           Check Consent
                  │
                  ▼
          Validate the Input
                  │
                  ▼
          Execute Business Logic
                  │
                  ▼
            Audit the Action

The most important rule for SetuX is:

A user being authenticated does not automatically mean they are authorized to access data or perform an action.

And for external data:

No consent means no protected connector access.