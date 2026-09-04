SetuX — Onboarding API Specification

Version: 1.0
Project: SetuX SIH MVP
Module: User Onboarding
Backend: Supabase + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

1. Purpose

This document defines the API contract for onboarding authenticated SetuX users.

Authentication and onboarding are separate modules.

AUTHENTICATION
      ↓
User identity verified
      ↓
AUTHENTICATED SESSION
      ↓
ONBOARDING
      ↓
SetuX profile completed
      ↓
Role-specific application access

Authentication answers:

Who are you?

Onboarding answers:

What information does SetuX need to create your application profile?

2. Scope

This module covers:

Citizen onboarding

Government employee onboarding

Profile creation

Profile completion

Profile validation

Role-specific onboarding

Onboarding status

Updating onboarding information

Preventing duplicate profiles

Backend validation

Authorization

This module does not cover:

Login

Signup

Password management

Email verification

Application submission

Scholarship workflows

Document fetching

DigiLocker integration

Government application approval

Those belong to separate modules.

3. Onboarding UI → API Mapping

The SetuX prototype contains two onboarding experiences.

Citizen

┌─────────────────────────────────────┐
│ Complete your SetuX profile         │
│                                     │
│ Email ID          [Verified]        │
│ Full Name *       [____________]    │
│ Government ID *   [____________]    │
│ Mobile Number *   [____________]    │
│ Date of Birth *   [____________]    │
│                                     │
│       [ Continue to SetuX → ]       │
└─────────────────────────────────────┘

Government Employee

┌─────────────────────────────────────┐
│ Complete your organization profile  │
│                                     │
│ Organization Name *                 │
│ Organization ID / Code *            │
│ Department / Ministry *             │
│ Official Email      [Verified]      │
│ Official Mobile *                   │
│ Full Name *                         │
│ Employee ID *                       │
│ Designation / Role *                │
│                                     │
│       [ Continue to Review → ]      │
└─────────────────────────────────────┘

4. Design Principle

The onboarding API must use the authenticated Supabase user as the identity source.

Authorization: Bearer <JWT>
              │
              ▼
        Supabase Auth
              │
              ▼
      authenticated user.id
              │
              ▼
       SetuX onboarding

The client must not be allowed to choose which authenticated user receives the profile.

Do not trust:

{
  "user_id": "some-other-user-id"
}

The backend obtains the user ID from the verified session.

5. Onboarding Data Ownership

Supabase Auth owns:

auth.users

SetuX owns application profile data.

Conceptually:

auth.users
    │
    │ 1 : 1
    ▼
profiles
    │
    ├───────────────┐
    ▼               ▼
citizen_profiles   government_profiles

This allows authentication and application-specific identity information to remain separated.

6. Supported Roles

CITIZEN
GOVERNMENT_OFFICER

Role must already be associated with the authenticated SetuX account.

The onboarding API must verify that the onboarding type matches the user's authorized role.

Example:

CITIZEN
   ↓
/onboarding/citizen

Valid.

CITIZEN
   ↓
/onboarding/government

Rejected.

7. Base API URL

/api/v1

Onboarding routes:

/api/v1/onboarding/*

8. Onboarding State

The MVP uses a simple onboarding state.

NOT_STARTED
IN_PROGRESS
COMPLETED

Recommended flow:

Authenticated
     │
     ▼
NOT_STARTED
     │
     ▼
IN_PROGRESS
     │
     ▼
COMPLETED

If the user leaves before completing the form:

IN_PROGRESS

The user can return and continue.

9. Common Onboarding Response

All onboarding endpoints should follow the SetuX API response convention.

Success

{
  "success": true,
  "data": {}
}

Error

{
  "success": false,
  "error": {
    "code": "ONBOARDING_VALIDATION_ERROR",
    "message": "Please correct the highlighted fields."
  },
  "request_id": "uuid"
}

10. Citizen Onboarding

Endpoint

POST /api/v1/onboarding/citizen

Authentication

Required.

Authorization: Bearer <access_token>

11. Citizen Request Body

{
  "full_name": "Rahul Sharma",
  "government_id": "GOV123456",
  "mobile_number": "9876543210",
  "date_of_birth": "2002-08-15"
}

Email is not submitted again because it already exists in the authenticated account.

The backend obtains it from the authenticated Supabase user.

12. Citizen Field Definitions

Field

Required

Source

Validation

full_name

Yes

User

Non-empty

government_id

Yes

User

Required, normalized

mobile_number

Yes

User

Valid mobile format

date_of_birth

Yes

User

Valid date

email

No

Supabase Auth

Read from authenticated user

The exact government-ID validation rules can be expanded later depending on the identity system selected for the final implementation.

For the SIH prototype, the value can be validated for format and uniqueness without connecting to a real government identity database.

13. Citizen Onboarding Flow

Citizen
   │
   ▼
Authenticated
   │
   ▼
Citizen Onboarding Screen
   │
   ├── Email loaded from Auth
   │
   ├── Full Name
   │
   ├── Government ID
   │
   ├── Mobile Number
   │
   └── Date of Birth
   │
   ▼
POST /onboarding/citizen
   │
   ▼
Validate JWT
   │
   ▼
Validate role
   │
   ▼
Validate fields
   │
   ▼
Create/Update Profile
   │
   ▼
Create Citizen Profile
   │
   ▼
Mark onboarding COMPLETED
   │
   ▼
Return dashboard routing information

14. Citizen Success Response

201 Created

{
  "success": true,
  "message": "Citizen profile created successfully.",
  "data": {
    "onboarding_status": "COMPLETED",
    "role": "CITIZEN",
    "redirect": "/citizen/dashboard"
  }
}

15. Government Employee Onboarding

Endpoint

POST /api/v1/onboarding/government

Authentication

Required.

Authorization: Bearer <access_token>

16. Government Request Body

{
  "organization_name": "Department of Education",
  "organization_id": "EDU-001",
  "department": "Higher Education",
  "official_mobile_number": "9876543210",
  "full_name": "Amit Kumar",
  "employee_id": "EMP-1024",
  "designation": "Application Officer"
}

Official email is not submitted again if it has already been verified during authentication/account creation.

The backend obtains the authenticated email from the Supabase user.

17. Government Field Definitions

Field

Required

Source

Validation

organization_name

Yes

User

Non-empty

organization_id

Yes

User

Required

department

Yes

User

Required / allowed value

official_email

No

Supabase Auth

Read from authenticated user

official_mobile_number

Yes

User

Valid mobile format

full_name

Yes

User

Non-empty

employee_id

Yes

User

Required, unique within organization

designation

Yes

User

Non-empty

18. Government Authorization Rule

A user must not become a privileged government officer simply by submitting:

{
  "designation": "Administrator"
}

or:

{
  "role": "GOVERNMENT_OFFICER"
}

The user's application role is controlled by SetuX authorization.

Authenticated account
        ↓
Authorized role
        ↓
Government onboarding
        ↓
Organization profile

For the SIH MVP, the government-account approval/provisioning mechanism can be represented by a controlled dummy organization verification flow.

19. Government Onboarding Flow

Government User
       │
       ▼
Authenticated
       │
       ▼
Government Onboarding Screen
       │
       ├── Organization Name
       ├── Organization ID
       ├── Department
       ├── Official Email
       ├── Official Mobile
       ├── Full Name
       ├── Employee ID
       └── Designation
       │
       ▼
POST /onboarding/government
       │
       ▼
Validate JWT
       │
       ▼
Validate Government Role
       │
       ▼
Validate Organization Data
       │
       ▼
Create/Update Profile
       │
       ▼
Create Government Profile
       │
       ▼
Mark Onboarding COMPLETED
       │
       ▼
Government Dashboard

20. Government Success Response

201 Created

{
  "success": true,
  "message": "Government profile created successfully.",
  "data": {
    "onboarding_status": "COMPLETED",
    "role": "GOVERNMENT_OFFICER",
    "redirect": "/government/dashboard"
  }
}

21. Get Onboarding Status

The frontend needs to know whether an authenticated user has completed onboarding.

Endpoint

GET /api/v1/onboarding/status

Response

{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "role": "CITIZEN"
  }
}

Example for an incomplete user:

{
  "success": true,
  "data": {
    "status": "NOT_STARTED",
    "role": "CITIZEN"
  }
}

22. Frontend Routing Based on Onboarding

                   Login
                     │
                     ▼
              Authenticated
                     │
                     ▼
               /auth/me
                     │
                     ▼
               Onboarding?
                /       \
              YES        NO
               │          │
               ▼          ▼
           Dashboard   Onboarding
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
               Citizen          Government
                  │                 │
                  ▼                 ▼
          Citizen Onboarding  Govt Onboarding

23. Get Existing Onboarding Profile

For users who partially completed onboarding, the frontend can retrieve the existing data.

Endpoint

GET /api/v1/onboarding/profile

Response

{
  "success": true,
  "data": {
    "status": "IN_PROGRESS",
    "role": "CITIZEN",
    "profile": {
      "full_name": "Rahul Sharma",
      "government_id": "GOV123456",
      "mobile_number": "9876543210",
      "date_of_birth": "2002-08-15"
    }
  }
}

Sensitive fields should only be returned when required by the UI.

24. Update Citizen Onboarding

If the user has started but not completed onboarding:

PATCH /api/v1/onboarding/citizen

Example:

{
  "full_name": "Rahul Sharma",
  "mobile_number": "9876543210",
  "date_of_birth": "2002-08-15"
}

The backend determines the authenticated user from the JWT.

25. Update Government Onboarding

PATCH /api/v1/onboarding/government

Example:

{
  "organization_name": "Department of Education",
  "department": "Higher Education",
  "official_mobile_number": "9876543210",
  "designation": "Application Officer"
}

The authenticated user's identity is taken from the session.

26. Duplicate Onboarding Protection

A user must not create multiple primary profiles.

Example:

User A
  │
  ├── Citizen Profile
  │
  └── POST /onboarding/citizen again
             │
             ▼
       Existing Profile
             │
             ▼
          Update / 409

Recommended behavior:

POST when no profile exists
        → 201 Created

POST when profile already exists
        → 409 Conflict

Error:

{
  "success": false,
  "error": {
    "code": "ONBOARDING_ALREADY_COMPLETED",
    "message": "Your SetuX profile is already completed."
  },
  "request_id": "uuid"
}

27. Role Mismatch

If a citizen attempts to access government onboarding:

POST /api/v1/onboarding/government

Response:

403 Forbidden

{
  "success": false,
  "error": {
    "code": "ONBOARDING_ROLE_MISMATCH",
    "message": "This onboarding flow is not available for your account role."
  },
  "request_id": "uuid"
}

28. Validation

All onboarding request bodies must be validated on the backend.

Example:

Request
  ↓
Schema validation
  ↓
Normalize data
  ↓
Business validation
  ↓
Database constraints

Validation examples:

full_name
    → required
    → trimmed

mobile_number
    → required
    → normalized

date_of_birth
    → valid date

government_id
    → required
    → normalized

employee_id
    → required
    → normalized

29. Data Normalization

Before storage:

" Rahul Sharma "
        ↓
"Rahul Sharma"

Email should come from Supabase Auth rather than from the request body.

Identifiers should have a consistent storage format.

Example:

gov123456
GOV123456
Gov123456

should be normalized according to the project's chosen identifier policy before uniqueness checks.

30. Database Constraints

The database should enforce important invariants.

Examples:

profiles.id → auth.users.id

profiles.role → allowed role values

profiles.onboarding_status → allowed status values

citizen_profiles.user_id → unique

government_profiles.user_id → unique

For government users:

employee_id + organization_id

should be appropriately constrained according to the final schema.

Application-level validation alone is not sufficient.

31. Row Level Security

Supabase Row Level Security must ensure users can access only their own onboarding data.

Conceptually:

Citizen A
   ↓
Can read/write Citizen A profile

Citizen B
   ↓
Cannot read/write Citizen A profile

Government users must also be restricted according to their authorized organization and permissions.

The service role should never be exposed to the frontend.

32. Authentication Middleware

Every onboarding endpoint requires:

requireAuth

Flow:

Request
  ↓
Authorization header
  ↓
JWT verification
  ↓
Authenticated user
  ↓
Role lookup
  ↓
Onboarding authorization
  ↓
Validation
  ↓
Database operation

33. Recommended Middleware Chain

Citizen:

requireAuth
    ↓
requireRole(CITIZEN)
    ↓
validateCitizenOnboarding
    ↓
citizenOnboardingController

Government:

requireAuth
    ↓
requireRole(GOVERNMENT_OFFICER)
    ↓
validateGovernmentOnboarding
    ↓
governmentOnboardingController

34. Controller / Service Separation

The backend should keep HTTP handling separate from business logic.

Example:

Route
  ↓
Middleware
  ↓
Controller
  ↓
Onboarding Service
  ↓
Repository / Supabase
  ↓
Database

Citizen:

citizenOnboardingController
          ↓
citizenOnboardingService
          ↓
profiles
citizen_profiles

Government:

governmentOnboardingController
          ↓
governmentOnboardingService
          ↓
profiles
government_profiles

35. Suggested API Files

src/
├── modules/
│   └── onboarding/
│       ├── onboarding.routes.ts
│       ├── onboarding.controller.ts
│       ├── onboarding.service.ts
│       ├── onboarding.validation.ts
│       └── onboarding.types.ts
│
├── middleware/
│   ├── auth.middleware.ts
│   └── role.middleware.ts
│
└── lib/
    └── supabase.ts

The exact language/framework can follow the frontend/backend implementation selected for the SIH MVP.

36. API Endpoint Summary

Method

Endpoint

Auth

Role

GET

/api/v1/onboarding/status

Required

Any authenticated

GET

/api/v1/onboarding/profile

Required

Any authenticated

GET

/api/v1/onboarding/organizations/:code/departments

Required

Government

POST

/api/v1/onboarding/citizen

Required

Citizen

PATCH

/api/v1/onboarding/citizen

Required

Citizen

POST

/api/v1/onboarding/government

Required

Government

PATCH

/api/v1/onboarding/government

Required

Government

37. HTTP Status Codes

Status

Meaning

200

Successful retrieval/update

201

Profile created

400

Invalid request

401

Missing/invalid authentication

403

Role not authorized

409

Profile already exists/conflict

422

Validation failure

500

Internal server error

38. Error Codes

ONBOARDING_VALIDATION_ERROR
ONBOARDING_NOT_FOUND
ONBOARDING_ALREADY_COMPLETED
ONBOARDING_ROLE_MISMATCH
ONBOARDING_PROFILE_EXISTS
ONBOARDING_INVALID_STATUS
ONBOARDING_DUPLICATE_IDENTIFIER
ONBOARDING_UNAUTHORIZED
ONBOARDING_DATABASE_ERROR

39. Security Requirements

Never accept these as trusted identity values from the frontend:

user_id
role
email
permissions

The backend should derive:

user_id → JWT
email    → Supabase Auth
role     → SetuX profile/authorization

Sensitive onboarding information must not be exposed unnecessarily.

For example, a government ID should not appear in logs.

40. Audit Events

Important onboarding events should be recorded.

ONBOARDING_STARTED
CITIZEN_PROFILE_CREATED
CITIZEN_PROFILE_UPDATED
GOVERNMENT_PROFILE_CREATED
GOVERNMENT_PROFILE_UPDATED
ONBOARDING_COMPLETED
ONBOARDING_VALIDATION_FAILED

Never log:

Passwords
JWTs
Access tokens
Recovery tokens
Sensitive identity values unnecessarily

41. Complete Citizen Flow

┌──────────────┐
│ Citizen      │
└──────┬───────┘
       │
       ▼
Authentication
       │
       ▼
Supabase Session
       │
       ▼
GET /onboarding/status
       │
       ▼
NOT_STARTED
       │
       ▼
Citizen Onboarding UI
       │
       ├── Full Name
       ├── Government ID
       ├── Mobile
       └── DOB
       │
       ▼
POST /onboarding/citizen
       │
       ▼
JWT + Role Validation
       │
       ▼
Input Validation
       │
       ▼
profiles
       │
       ▼
citizen_profiles
       │
       ▼
COMPLETED
       │
       ▼
Citizen Dashboard

42. Complete Government Flow

┌─────────────────────┐
│ Government Employee │
└──────────┬──────────┘
           │
           ▼
       Authentication
           │
           ▼
      Supabase Session
           │
           ▼
 GET /onboarding/status
           │
           ▼
       NOT_STARTED
           │
           ▼
 Government Onboarding UI
           │
           ├── Organization
           ├── Organization ID
           ├── Department
           ├── Official Mobile
           ├── Full Name
           ├── Employee ID
           └── Designation
           │
           ▼
 POST /onboarding/government
           │
           ▼
 JWT + Role Validation
           │
           ▼
 Organization Validation
           │
           ▼
 profiles
           │
           ▼
 government_profiles
           │
           ▼
       COMPLETED
           │
           ▼
 Government Dashboard

43. End-to-End Onboarding Architecture

                        SETUX
                          │
                          ▼
                  Authentication
                          │
                          ▼
                    Supabase Auth
                          │
                          ▼
                       JWT
                          │
                          ▼
                 SetuX Auth Middleware
                          │
                          ▼
                    Role Resolution
                     /          \
                    /            \
                   ▼              ▼
               CITIZEN      GOVERNMENT_OFFICER
                   │              │
                   ▼              ▼
          Citizen Onboarding   Govt Onboarding
                   │              │
                   ▼              ▼
          citizen_profiles   government_profiles
                   │              │
                   └──────┬───────┘
                          ▼
                  Onboarding Complete
                          │
                          ▼
                    SetuX Dashboard

44. MVP Definition of Done

Citizen

Citizen onboarding screen connected to API

Authenticated email displayed automatically

Full name validation

Government ID validation

Mobile validation

Date-of-birth validation

Citizen profile created

Duplicate profile protection

Onboarding status updated

Citizen dashboard redirect

Government

Government onboarding screen connected to API

Authenticated official email displayed automatically

Organization validation

Organization ID validation

Department validation

Official mobile validation

Employee ID validation

Designation validation

Government profile created

Duplicate profile protection

Onboarding status updated

Government dashboard redirect

Security

JWT required

Backend role validation

RLS enabled

User can access only own profile

Client cannot select another user ID

Client cannot escalate its role

Sensitive data excluded from logs

Audit events implemented

45. Implementation Note — Organization Resolution (Phase 4)

Section 17 lists `organization_name`, `organization_id` and `department` as
user-supplied strings, and section 18 requires that an officer must not become
attached to a privileged organization simply by asserting one. The Phase 2
schema resolves this by storing `government_profiles.organization_id` and
`department_id` as foreign keys.

The implemented contract therefore accepts a **code and names, never an id**:

    { organizationCode, organizationName, department }
                    |
                    v
      organizations.code  -> organization_id   (must exist, must be ACTIVE)
      organizations.name  -> must match the registered name
      departments.name    -> department_id, scoped to that organization
                    |
                    v
              government_profiles

An unregistered code, a name that contradicts the registered organization, or a
department belonging to a different organization is rejected with
`ONBOARDING_VALIDATION_ERROR` (422) and a field-level detail. A request
carrying `organizationId` or `departmentId` is rejected outright, because the
schemas are strict and have no such field.

`GET /api/v1/onboarding/organizations/:code/departments` exists to serve this
rule: the officer form needs the valid department set for a code so it can offer
a picker instead of asking the user to guess a value the backend would reject.
It returns reference data only — organization name and department names, no
identifiers and no personal data — and is restricted to the
GOVERNMENT_OFFICER role.

46. Final Design Principle

The SetuX onboarding architecture follows:

AUTHENTICATE
     ↓
IDENTIFY
     ↓
AUTHORIZE
     ↓
ONBOARD
     ↓
CREATE PROFILE
     ↓
COMPLETE
     ↓
DASHBOARD

The critical separation is:

Authentication establishes the user's identity. Authorization establishes the user's role. Onboarding collects the information required to create the SetuX application profile.