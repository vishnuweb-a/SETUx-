SetuX — Authentication & RBAC

Version: 1.0
Project: SetuX SIH MVP
Module: Authentication & Role-Based Access Control
Backend: Supabase Auth + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

1. Purpose

This document defines how SetuX authenticates users and controls access based on their role.

Authentication and authorization are deliberately separated:

AUTHENTICATION
    ↓
Who is this user?
    ↓
AUTHENTICATED SESSION
    ↓
AUTHORIZATION / RBAC
    ↓
What is this user allowed to do?

For the SIH MVP, SetuX has three logical roles:

CITIZEN
OFFICER
ADMIN

The authentication layer establishes the user's identity. RBAC controls access to the appropriate SetuX dashboard and backend operations.

2. Core Principle

SetuX follows:

Authenticate once
       ↓
Identify user
       ↓
Resolve role
       ↓
Check permissions
       ↓
Route to correct dashboard

The frontend may use role information for UI routing, but the backend remains the source of truth for authorization.

The frontend must never be trusted to decide:

"this user is an officer"
"this user is an admin"
"this user can approve applications"

Those decisions must be enforced server-side.

3. Authentication Technology

The SIH prototype uses:

Supabase Auth
      +
JWT / Session
      +
SetuX PostgreSQL profile

Conceptually:

┌─────────────────┐
│   SetuX Client  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase Auth  │
└────────┬────────┘
         │
         ▼
     Access Token
         │
         ▼
┌─────────────────┐
│  SetuX Backend  │
└────────┬────────┘
         │
         ▼
     User Identity
         │
         ▼
      RBAC Check

4. Authentication vs Application Profile

Authentication identity and SetuX profile data remain separate.

Supabase Auth
│
├── user.id
├── email
├── authentication state
└── session
       │
       ▼
SetuX profiles
│
├── role
├── onboarding_status
└── application-level identity

The onboarding module then stores role-specific information:

profiles
   │
   ├── citizen_profiles
   │
   └── government_profiles

This separation is consistent with the onboarding design: authentication already provides the user's email, authentication status, session identity, and account identifier, so onboarding should not ask the user to enter their email or password again. fileciteturn6file9L1603-L1619

5. Supported Roles

The SetuX PRD defines:

CITIZEN
OFFICER
ADMIN

These roles represent:

Role

Purpose

CITIZEN

Uses SetuX to apply for and track services

OFFICER

Reviews applications and takes government decisions

ADMIN

Monitors integrations, failures, audit logs and system status

The PRD identifies the citizen as the primary prototype user and the officer and administrator as secondary users. fileciteturn6file1L322-L353

6. Role Hierarchy

Roles are not automatically hierarchical.

Do not assume:

ADMIN > OFFICER > CITIZEN

Instead, permissions are explicitly assigned.

Conceptually:

                    SETUX
                      │
             ┌────────┼────────┐
             ▼        ▼        ▼
          CITIZEN   OFFICER   ADMIN
             │        │        │
             ▼        ▼        ▼
          Citizen   Review   System
         Dashboard  Dashboard Monitoring

This prevents accidental privilege escalation.

7. Authentication Flow

                 User
                  │
                  ▼
           Authentication UI
                  │
                  ▼
            Supabase Auth
                  │
            ┌─────┴─────┐
            │           │
         Success       Failure
            │           │
            ▼           ▼
        Session       Error
            │
            ▼
      SetuX Backend
            │
            ▼
        Verify JWT
            │
            ▼
       Resolve User
            │
            ▼
        Resolve Role
            │
            ▼
     Check Onboarding
            │
       ┌────┴────┐
       ▼         ▼
   Complete   Incomplete
       │         │
       ▼         ▼
   Dashboard  Onboarding

8. Login

Endpoint

POST /api/v1/auth/login

The actual credential verification is delegated to Supabase Auth.

Conceptually:

Client
  ↓
Auth API
  ↓
Supabase Auth
  ↓
Credentials verified
  ↓
Session/token
  ↓
SetuX

The SetuX backend should not store user passwords in its own database.

9. Login Response

Example:

{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "citizen@example.com"
    },
    "session": {
      "access_token": "<token>",
      "expires_at": 1777420800
    }
  }
}

Tokens should be handled according to the chosen Supabase client/session architecture.

Never log:

access_token
refresh_token
password

10. Authentication State

The backend recognizes:

AUTHENTICATED
UNAUTHENTICATED
SESSION_EXPIRED

A protected request without a valid session returns:

401 Unauthorized

Example:

{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Authentication is required."
  },
  "request_id": "uuid"
}

11. Current User

Endpoint

GET /api/v1/auth/me

Purpose:

Verify the current session

Return authenticated user identity

Return SetuX role

Return onboarding state

Help frontend determine the correct route

Example:

{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "citizen@example.com"
    },
    "role": "CITIZEN",
    "onboarding_status": "COMPLETED"
  }
}

12. /auth/me Routing Logic

GET /auth/me
      │
      ▼
JWT valid?
  │       │
 NO       YES
  │        │
  ▼        ▼
401     Resolve role
           │
      ┌────┼────┐
      ▼    ▼    ▼
   CITIZEN OFFICER ADMIN
      │    │     │
      ▼    ▼     ▼
   Check onboarding / access state

13. Frontend Route Decision

The frontend can use the authenticated user state to determine the initial route:

CITIZEN + incomplete
        ↓
Citizen Onboarding

CITIZEN + complete
        ↓
Citizen Dashboard

OFFICER + incomplete
        ↓
Government Onboarding

OFFICER + complete
        ↓
Officer Dashboard

ADMIN
        ↓
Admin Dashboard

The backend still validates every protected request independently.

14. Onboarding Boundary

Authentication ends when the user has a valid authenticated identity.

Onboarding begins after authentication.

Authentication
      │
      ▼
Email / Session / User Identity
      │
      ▼
RBAC
      │
      ▼
Onboarding
      │
      ▼
SetuX Profile

The onboarding design explicitly separates account creation/profile creation from later service-specific data-access consent. fileciteturn6file2L530-L556

Therefore:

Authentication ≠ Onboarding ≠ Consent

15. Role Resolution

The backend must resolve the role from trusted SetuX data.

Recommended model:

JWT user.id
      │
      ▼
profiles.id
      │
      ▼
profiles.role

Example:

JWT
 └── sub = USER_UUID
          │
          ▼
profiles
 └── id = USER_UUID
 └── role = CITIZEN

The client cannot safely establish its own role by sending:

{
  "role": "ADMIN"
}

16. Role Assignment

For the SIH MVP, role assignment is controlled by the backend/database.

Possible controlled provisioning:

New account
     │
     ▼
Default / assigned role
     │
     ▼
profiles.role

Government accounts should be provisioned/approved through a controlled mechanism rather than allowing users to select OFFICER or ADMIN during signup.

A designation such as:

Administrator

must not itself grant the ADMIN role.

17. RBAC Model

RBAC consists of:

User
  ↓
Role
  ↓
Permissions
  ↓
Resource / Action

Example:

CITIZEN
   ↓
application:read:own
application:create
application:update:own
application:submit:own
application:track:own

Officer:

OFFICER
   ↓
application:read:department
application:review
application:approve
application:reject
application:request_information

Admin:

ADMIN
   ↓
integration:read
integration:retry
audit:read
system:read

18. Permission Matrix

Permission

CITIZEN

OFFICER

ADMIN

Login

✓

✓

✓

View own profile

✓

✓

✓

Complete onboarding

✓

✓

Controlled

Create application

✓

✗

✗

View own application

✓

✗

✗

Update own draft

✓

✗

✗

Submit own application

✓

✗

✗

View department applications

✗

✓

Controlled

Review application

✗

✓

✗

Approve application

✗

✓

✗

Reject application

✗

✓

✗

Request information

✗

✓

✗

View integration failures

✗

Limited

✓

Retry integration

✗

Limited

✓

View audit logs

✗

Limited

✓

View system status

✗

Limited

✓

Controlled means access should be granted only through an explicitly defined backend permission rather than automatically because of the role name.

19. Authorization Middleware

Recommended middleware:

requireAuth
requireRole
requirePermission
requireOwnership
requireDepartmentAccess

Example citizen endpoint:

Request
  ↓
requireAuth
  ↓
requireRole(CITIZEN)
  ↓
requireOwnership
  ↓
Controller

Officer endpoint:

Request
  ↓
requireAuth
  ↓
requireRole(OFFICER)
  ↓
requireDepartmentAccess
  ↓
Controller

Admin endpoint:

Request
  ↓
requireAuth
  ↓
requireRole(ADMIN)
  ↓
requirePermission
  ↓
Controller

20. Ownership Authorization

Role alone is not sufficient.

For citizen applications:

authenticated_user.id
       =
application.citizen_id

Example:

Citizen A
   │
   ├── Application A1 ✓
   └── Application A2 ✓

Citizen B
   │
   └── Application B1 ✓

Citizen A must not access B1.

21. Department Authorization

Government officers should be scoped to their authorized organization/department.

OFFICER
   │
   ▼
Government Profile
   │
   ├── organization_id
   └── department_id
            │
            ▼
Applications assigned/relevant to department

An education officer should not automatically have access to every department's applications.

22. Admin Authorization

Admin is intended for system-level monitoring.

The SIH PRD specifies that administrators can:

Monitor integrations

View failed requests

Inspect audit logs

See system status fileciteturn6file1L337-L353

Admin access should still be permission-based.

Avoid implementing:

ADMIN = unrestricted SQL access

23. Protected Route Example

GET /api/v1/government/applications
Authorization: Bearer <access_token>

Backend:

1. Extract token
2. Verify token
3. Identify user
4. Load role
5. Verify OFFICER
6. Load department
7. Filter applications
8. Return authorized records

24. Unauthorized Role Example

Citizen attempts:

POST /api/v1/government/applications/:id/approve

Backend:

JWT valid
   ↓
Role = CITIZEN
   ↓
Required = OFFICER
   ↓
DENY

Response:

403 Forbidden

{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  },
  "request_id": "uuid"
}

25. Authentication Middleware Flow

HTTP Request
     │
     ▼
Authorization Header
     │
     ▼
Extract Bearer Token
     │
     ▼
Verify Supabase Session/JWT
     │
     ├── Invalid → 401
     │
     ▼
Get User ID
     │
     ▼
Load SetuX Profile
     │
     ▼
Resolve Role
     │
     ▼
Attach Auth Context
     │
     ▼
Next Middleware

Auth context:

{
  userId: string,
  email: string,
  role: "CITIZEN" | "OFFICER" | "ADMIN"
}

26. Request Context

The backend should internally maintain an authenticated request context.

Conceptually:

req.auth
│
├── userId
├── email
├── role
├── organizationId
├── departmentId
└── permissions

Only trusted backend middleware should populate these values.

The frontend must not be able to override them.

27. Logout

Endpoint

POST /api/v1/auth/logout

Purpose:

Invalidate/end current session

Response:

{
  "success": true,
  "message": "Logged out successfully."
}

The frontend should clear its local authentication state/session according to the Supabase client/session mechanism.

28. Session Expiration

When a session expires:

Protected API request
       ↓
JWT/session invalid
       ↓
401 Unauthorized
       ↓
Frontend clears auth state
       ↓
Redirect to /login

User-facing message:

Your session has expired. Please sign in again.

The existing SetuX onboarding specification uses this same behavior for an invalid session. fileciteturn6file0L55-L63

29. Password Handling

SetuX should not implement its own password storage.

User Password
      ↓
Supabase Auth

Never store:

password
password_hash

inside application tables.

Password reset should use Supabase Auth's supported recovery flow.

30. Email Verification

If the selected Supabase Auth configuration requires email verification:

Signup
  ↓
Verification email
  ↓
User verifies
  ↓
Authenticated account
  ↓
SetuX access

The application layer can check the authentication state before allowing protected operations.

The onboarding UI should display the authenticated email rather than asking for it again. fileciteturn6file9L1730-L1735

31. Security Boundary

The frontend is responsible for:

Displaying UI
Routing
Hiding unavailable actions
Showing errors

The backend is responsible for:

Authentication
Identity
Role
Permissions
Ownership
Department access
State transitions
Sensitive operations

Therefore:

Frontend RBAC = UX
Backend RBAC   = Security

32. Frontend Route Guards

Frontend route guards improve UX.

Example:

/protected/citizen/*
       ↓
requireAuthenticated
       ↓
requireCitizen

Government:

/protected/officer/*
       ↓
requireAuthenticated
       ↓
requireOfficer

Admin:

/protected/admin/*
       ↓
requireAuthenticated
       ↓
requireAdmin

But these guards are not security boundaries.

33. Backend Route Guards

Every sensitive backend route must independently enforce authorization.

Example:

POST /applications/:id/approve

requireAuth
     ↓
requireRole(OFFICER)
     ↓
requireDepartmentAccess
     ↓
approveApplication()

Even if someone bypasses the frontend completely, the backend must still reject unauthorized requests.

34. Application Authorization Example

Citizen:

GET /applications/A1

Allowed when:

A1.citizen_id == auth.userId

Officer:

GET /government/applications/A1

Allowed when:

auth.role == OFFICER
AND
A1 belongs to officer's authorized department

Admin:

GET /admin/integrations/failures

Allowed when:

auth.role == ADMIN
AND
permission == integration:read

35. Role Change Protection

Role changes are privileged operations.

Never allow:

PATCH /profile

with:

{
  "role": "ADMIN"
}

for a normal user.

Role changes should happen through a protected administrative/provisioning process.

Every role change should create an audit event.

36. Audit Events

Authentication/RBAC events worth recording include:

LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
SESSION_EXPIRED
ROLE_ASSIGNED
ROLE_CHANGED
ACCESS_DENIED
PRIVILEGED_ACTION

Example:

{
  "event_type": "ACCESS_DENIED",
  "actor_user_id": "uuid",
  "metadata": {
    "required_role": "OFFICER",
    "actual_role": "CITIZEN",
    "resource": "government_application"
  }
}

Do not record passwords or authentication tokens.

37. Rate Limiting

Authentication endpoints should have stricter rate limits.

Examples:

POST /auth/login
POST /auth/signup
POST /auth/password/reset

Rate limiting protects against:

brute-force attempts
credential stuffing
abuse

For the SIH MVP, rate limiting can be implemented at the API gateway/backend layer and/or using Supabase's supported authentication protections.

38. Error Handling

Never expose internal authentication details unnecessarily.

Avoid:

"User exists but password is wrong."

Prefer:

"Invalid email or password."

For authorization:

403 Forbidden

For authentication:

401 Unauthorized

For validation:

422 Unprocessable Entity

39. Authentication API Surface

The authentication module should expose:

POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/signup
POST /api/v1/auth/password/forgot
POST /api/v1/auth/password/reset

Exact implementation may delegate credential/session operations to Supabase Auth.

40. RBAC API Surface

RBAC should generally be enforced through middleware rather than exposing unnecessary public APIs.

Possible administrative endpoints:

GET   /api/v1/admin/users/:userId
PATCH /api/v1/admin/users/:userId/role
GET   /api/v1/admin/audit

These must be restricted to appropriate administrative permissions.

For the SIH MVP, role assignment can be seeded/configured rather than building a complete user-management console.

41. Database Mapping

Authentication identity:

auth.users

SetuX profile:

profiles

Citizen:

citizen_profiles

Government:

government_profiles

Organization:

organizations

Department:

departments

Conceptual relationship:

auth.users
     │
     ▼
profiles
     │
 ┌───┴────────────┐
 ▼                ▼
citizen_profiles  government_profiles
                       │
                       ├── organization
                       └── department

42. Database Security

Supabase Row Level Security should reinforce the application authorization model.

Citizen:

auth.uid() = profiles.id

Application:

auth.uid() = applications.citizen_id

Government:

authorized user
+
authorized organization
+
authorized department

RLS is a second line of defense.

The backend authorization layer remains responsible for business-level permission checks.

43. Role + Onboarding State

Role and onboarding status solve different problems.

Example:

role = CITIZEN
onboarding_status = NOT_STARTED

means:

The system knows the user is a citizen,
but the citizen profile is not complete.

Example:

role = OFFICER
onboarding_status = COMPLETED

means:

The government user has completed their SetuX profile
and can proceed to the officer dashboard,
subject to authorization.

44. Complete Authentication → RBAC → Onboarding Flow

                         USER
                           │
                           ▼
                  Authentication UI
                           │
                           ▼
                     Supabase Auth
                           │
                    Valid Session
                           │
                           ▼
                     SetuX Backend
                           │
                           ▼
                       Verify JWT
                           │
                           ▼
                    Get authenticated ID
                           │
                           ▼
                        profiles
                           │
                           ▼
                         Role
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          CITIZEN        OFFICER        ADMIN
             │             │             │
             ▼             ▼             ▼
        Onboarding?   Onboarding?    Admin Access
          /    \         /    \
         /      \       /      \
       YES      NO    YES      NO
        │        │      │        │
        ▼        ▼      ▼        ▼
    Onboard   Citizen  Onboard  Officer
             Dashboard          Dashboard

45. Complete Security Flow

Request
   │
   ▼
TLS / HTTPS
   │
   ▼
Bearer Token
   │
   ▼
Supabase Auth Validation
   │
   ▼
Authenticated User
   │
   ▼
SetuX Profile
   │
   ▼
Role
   │
   ▼
Permission
   │
   ▼
Ownership / Department Scope
   │
   ▼
Business Rule
   │
   ▼
Database Operation
   │
   ▼
Audit Event

46. SIH Prototype Real vs Simulated

According to the SetuX prototype architecture:

SetuX backend       → REAL
Database            → REAL
Authentication      → REAL
RBAC                → REAL
Consent             → REAL
Workflow engine     → REAL
Application tracking→ REAL
Audit               → REAL
Connector architecture → REAL

External systems can be simulated:

Identity API        → SIMULATED
Income API          → SIMULATED
Education API       → SIMULATED / DigiLocker
Legacy system       → SIMULATED
Government DBs      → NOT USED

The important distinction is:

External departments are simulated; the SetuX interoperability logic is real. fileciteturn6file5L1225-L1247

47. Recommended Backend Structure

src/
│
├── modules/
│   ├── identity/
│   │   ├── identity.routes.ts
│   │   ├── identity.controller.ts
│   │   └── identity.service.ts
│   │
│   ├── rbac/
│   │   ├── rbac.middleware.ts
│   │   ├── permission.ts
│   │   └── role.ts
│   │
│   ├── profile/
│   ├── onboarding/
│   ├── application/
│   ├── consent/
│   └── workflow/
│
├── middleware/
│   ├── auth.middleware.ts
│   ├── role.middleware.ts
│   ├── permission.middleware.ts
│   └── error.middleware.ts
│
├── database/
│   └── supabase.ts
│
├── audit/
│
└── common/

This matches the modular-monolith direction already defined for the SetuX prototype, with identity, profile, RBAC, consent, application and workflow as separate backend modules. fileciteturn6file5L1160-L1189

48. Recommended Auth Context

Type conceptually:

type Role =
  | "CITIZEN"
  | "OFFICER"
  | "ADMIN";

interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  organizationId?: string;
  departmentId?: string;
}

Do not allow request payloads to override this context.

49. MVP Definition of Done

Authentication

Supabase Auth configured

Login implemented

Logout implemented

Session handling implemented

/auth/me implemented

Protected routes implemented

Session expiry handled

Password reset flow supported

Email verification supported where configured

RBAC

CITIZEN role implemented

OFFICER role implemented

ADMIN role implemented

Backend role middleware implemented

Permission checks implemented for privileged actions

Citizen ownership checks implemented

Government department scope implemented

Admin access restricted

Role changes protected

Security

JWT/session validated server-side

Service-role key never exposed to frontend

Passwords not stored by SetuX

Tokens not logged

Sensitive identity data not logged unnecessarily

RLS enabled

Authentication rate limiting configured

Audit events implemented

Routing

Authenticated citizen routed to citizen onboarding/dashboard

Authenticated officer routed to government onboarding/dashboard

Admin routed to admin dashboard

Unauthorized routes rejected

Expired sessions redirect to login

50. Final Architecture

                         SETUX
                           │
                           ▼
                  ┌─────────────────┐
                  │  Authentication │
                  │  Supabase Auth  │
                  └────────┬────────┘
                           │
                           ▼
                     JWT / Session
                           │
                           ▼
                  ┌─────────────────┐
                  │ Auth Middleware │
                  └────────┬────────┘
                           │
                           ▼
                    Authenticated User
                           │
                           ▼
                  ┌─────────────────┐
                  │   SetuX Profile │
                  │     + Role      │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           CITIZEN       OFFICER       ADMIN
              │            │            │
              ▼            ▼            ▼
        Citizen UI     Officer UI    Admin UI
              │            │            │
              ▼            ▼            ▼
        Own Apps      Dept Apps      System Ops
              │            │            │
              └────────────┼────────────┘
                           ▼
                     SetuX Backend
                           │
                           ▼
                     PostgreSQL
                           │
                           ▼
                        RLS

51. Final Design Principle

The SetuX security model can be summarized as:

AUTHENTICATION
"Who are you?"

        ↓

IDENTITY
"Which authenticated account is this?"

        ↓

ROLE
"Citizen, Officer, or Admin?"

        ↓

PERMISSION
"What actions can this role perform?"

        ↓

SCOPE
"Which records can this user access?"

        ↓

BUSINESS RULE
"Is this operation valid right now?"

        ↓

DATABASE / SERVICE
"Execute only after all checks pass."

The most important implementation rule is:

Never trust the frontend for authentication, role, ownership, permissions, or application state.

The frontend can improve the user experience by showing the correct dashboard and hiding unavailable actions, but every security-sensitive decision must be revalidated by the SetuX backend and reinforced by Supabase/PostgreSQL RLS.