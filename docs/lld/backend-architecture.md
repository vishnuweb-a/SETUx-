SetuX Backend LLD — Supabase
# SetuX — Backend Low Level Design

Version: 1.0
Project: SetuX SIH MVP
Architecture: Supabase-based Modular Backend
Primary Service: Scholarship
Roles:
  - CITIZEN
  - GOVERNMENT_OFFICER

---

# 1. Purpose

This document defines the detailed backend implementation of the
SetuX SIH MVP using Supabase.

The backend is responsible for:

- Authentication
- User identity
- Role management
- Citizen onboarding
- Government officer onboarding
- Citizen profiles
- Scholarship applications
- Application requirements
- Consent management
- Document metadata
- External data connectors
- Data normalization
- Verification
- Application workflow
- Government decisions
- Notifications
- Audit logging
- Authorization
- Row-level security

---

# 2. Backend Technology

SetuX uses Supabase as the primary backend platform.

## Components

```text
Supabase
│
├── Authentication
│   └── Supabase Auth
│
├── Database
│   └── PostgreSQL
│
├── Authorization
│   └── PostgreSQL RLS
│
├── File Storage
│   └── Supabase Storage
│
├── Business Logic
│   └── Supabase Edge Functions
│
└── Database Logic
    └── PostgreSQL Functions / Triggers
3. Backend Architecture

The logical architecture is:

                        FRONTEND
                           │
                           │ HTTPS
                           ▼
                  ┌──────────────────┐
                  │ Supabase Auth    │
                  └────────┬─────────┘
                           │
                           │ JWT
                           ▼
                  ┌──────────────────┐
                  │ Edge Functions   │
                  │ API Layer        │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
          Auth/RBAC     Application   Workflow
              │            │            │
              └────────────┼────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │   PostgreSQL     │
                  │   Supabase DB    │
                  └────────┬─────────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
      Storage        External APIs       Audit Logs
                         │
                ┌────────┼────────┐
                ▼        ▼        ▼
            DigiLocker Education Income
             Connector  Connector Connector
4. Why Supabase

Supabase is suitable for the SIH MVP because it provides:

Authentication
PostgreSQL database
Row-level security
File storage
Serverless backend functions
Database triggers
Realtime capabilities if required
Easy local development
Simple deployment

This allows the team to concentrate on the SetuX interoperability
workflow rather than implementing authentication and database
infrastructure from scratch.

5. Backend Module Structure

Although Supabase is the backend platform, SetuX should still maintain
logical modules.

supabase/
│
├── migrations/
│
├── functions/
│   │
│   ├── auth-login/
│   │
│   ├── onboarding/
│   │
│   ├── profile/
│   │
│   ├── services/
│   │
│   ├── applications/
│   │
│   ├── consent/
│   │
│   ├── documents/
│   │
│   ├── connectors/
│   │
│   ├── government/
│   │
│   └── notifications/
│
└── seed/

Common business logic should be separated into reusable modules rather
than duplicated across Edge Functions.

6. Authentication Architecture

Supabase Auth manages authentication.

The authentication flow is:

User
 │
 ▼
SetuX Login UI
 │
 ▼
Supabase Auth
 │
 ├── Validate credentials
 │
 └── Generate authenticated session
              │
              ▼
             JWT
              │
              ▼
          SetuX Backend

The frontend should never implement password verification itself.

7. Authentication Data

Supabase internally maintains authentication information in:

auth.users

SetuX should maintain application-specific information separately.

auth.users
     │
     │ 1:1
     ▼
public.profiles
8. Profile Architecture

The application profile should contain:

profiles
│
├── id
├── email
├── role
├── onboarding_completed
├── created_at
└── updated_at

The id should correspond to the authenticated Supabase user ID.

9. Role Model

MVP roles:

CITIZEN
GOVERNMENT_OFFICER

Future roles can be added later:

ADMIN
DEPARTMENT_ADMIN
SERVICE_PROVIDER

Do not implement these in the MVP unless required.

10. Citizen Profile

Separate citizen-specific data:

citizen_profiles
│
├── id
├── user_id
├── full_name
├── government_id
├── mobile_number
├── date_of_birth
├── created_at
└── updated_at

Relationship:

auth.users
    │
    ▼
profiles
    │
    ▼
citizen_profiles
11. Government Profile

Government-specific information:

government_profiles
│
├── id
├── user_id
├── officer_name
├── organization_id
├── organization_name
├── department
├── officer_id
├── mobile_number
├── created_at
└── updated_at

Relationship:

auth.users
    │
    ▼
profiles
    │
    ▼
government_profiles
12. Onboarding Flow
Citizen
Supabase Auth
      │
      ▼
Authenticated user
      │
      ▼
Check profiles.onboarding_completed
      │
      ├── TRUE
      │     │
      │     ▼
      │   Dashboard
      │
      └── FALSE
            │
            ▼
        Onboarding
            │
            ▼
     onboarding Edge Function
            │
            ▼
     Validate JWT/user ID
            │
            ▼
     Create citizen profile
            │
            ▼
     Set onboarding_completed = true
            │
            ▼
        Dashboard
13. Citizen Onboarding API

Endpoint:

POST /functions/v1/onboarding/citizen

Request:

{
  "fullName": "Rahul Kumar",
  "governmentId": "GOV123456",
  "mobileNumber": "+91XXXXXXXXXX",
  "dateOfBirth": "2002-05-14"
}

Email is NOT included.

The backend gets email from the authenticated Supabase user.

14. Government Onboarding API

Endpoint:

POST /functions/v1/onboarding/government

Request:

{
  "officerName": "Amit Sharma",
  "organizationId": "ORG001",
  "organizationName": "Department of Education",
  "department": "Scholarship Division",
  "officerId": "OFF001",
  "mobileNumber": "+91XXXXXXXXXX"
}
15. Database Schema

Core tables:

profiles
    │
    ├──────────────┐
    ▼              ▼
citizen_profiles  government_profiles
    │
    ▼
applications
    │
    ├─────────────┬─────────────┐
    ▼             ▼             ▼
consents      documents     application_data
    │
    ▼
audit_logs

Additional tables:

services
service_requirements
notifications
connector_logs
16. profiles Table
profiles

id UUID PRIMARY KEY
email TEXT NOT NULL
role TEXT NOT NULL
onboarding_completed BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

Role constraint:

CITIZEN
GOVERNMENT_OFFICER
17. citizen_profiles Table
citizen_profiles

id UUID PRIMARY KEY
user_id UUID UNIQUE
full_name TEXT NOT NULL
government_id TEXT NOT NULL
mobile_number TEXT NOT NULL
date_of_birth DATE NOT NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

Foreign key:

user_id → profiles.id
18. government_profiles Table
government_profiles

id UUID PRIMARY KEY
user_id UUID UNIQUE
officer_name TEXT NOT NULL
organization_id TEXT NOT NULL
organization_name TEXT NOT NULL
department TEXT NOT NULL
officer_id TEXT NOT NULL
mobile_number TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
19. services Table

Services should be configuration-driven.

services

id
name
code
description
status
created_at
updated_at

Example:

id: SERVICE001
name: National Scholarship
code: SCHOLARSHIP
status: ACTIVE
20. service_requirements Table

Defines what information a service requires.

service_requirements

id
service_id
requirement_key
requirement_name
data_type
source_type
required
created_at

Example:

service_id: SERVICE001

requirement_key: EDUCATION_RECORD
requirement_name: Education Record
data_type: DOCUMENT
source_type: DIGILOCKER
required: true

Another:

requirement_key: INCOME_CERTIFICATE
source_type: INCOME_SYSTEM
required: true
21. Why Requirements Are Configurable

Do not hard-code scholarship requirements inside frontend code.

Instead:

Service
   │
   ▼
Requirements
   │
   ├── Identity
   ├── Education
   ├── Income
   └── Category

This allows future services to reuse the same architecture.

Example:

Scholarship
   ├── Education
   ├── Income
   └── Identity

Pension
   ├── Identity
   ├── Age
   └── Bank

Business Registration
   ├── Identity
   ├── Business
   └── Address
22. applications Table
applications

id
application_number
citizen_id
service_id
status
submitted_at
created_at
updated_at

Example:

application_number:
STX-APP-0001

citizen_id:
UUID

service:
SCHOLARSHIP

status:
UNDER_REVIEW
23. Application Status

MVP statuses:

DRAFT
DATA_COLLECTION
CONSENT_PENDING
DATA_RETRIEVAL
VERIFICATION
READY_FOR_SUBMISSION
SUBMITTED
UNDER_REVIEW
REQUESTED_INFO
APPROVED
REJECTED

The backend controls valid state transitions.

24. Application State Machine
DRAFT
  │
  ▼
DATA_COLLECTION
  │
  ▼
CONSENT_PENDING
  │
  ▼
DATA_RETRIEVAL
  │
  ▼
VERIFICATION
  │
  ▼
READY_FOR_SUBMISSION
  │
  ▼
SUBMITTED
  │
  ▼
UNDER_REVIEW
  │
  ├──────────────┐
  │              │
  ▼              ▼
APPROVED       REJECTED

Additional:

UNDER_REVIEW
      │
      ▼
REQUESTED_INFO
      │
      ▼
DATA_COLLECTION
25. application_data Table

This table stores normalized information used for the application.

application_data

id
application_id
field_key
field_value
source
verification_status
created_at
updated_at

Example:

application_id: STX-APP-001

field_key:
percentage

field_value:
82

source:
DIGILOCKER

verification_status:
VERIFIED
26. Why Normalize External Data

External systems may return different structures.

Example:

DigiLocker

percentage = 82
year = 2025

Education API:

marks_percentage = 82
passing_year = 2025

SetuX converts them into:

percentage = 82
passingYear = 2025

The application layer works only with SetuX's internal format.

27. Consent Table
consents

id
user_id
application_id
data_type
source
purpose
status
granted_at
expires_at
created_at

Example:

user_id:
USR001

application:
APP001

data_type:
EDUCATION_RECORD

source:
DIGILOCKER

purpose:
SCHOLARSHIP_APPLICATION

status:
GRANTED
28. Consent States
PENDING
GRANTED
DENIED
EXPIRED
REVOKED

MVP primarily requires:

PENDING
GRANTED
DENIED
29. Consent Flow
Requirement Engine
       │
       ▼
Education data required
       │
       ▼
Check consent
       │
       ├── Granted
       │     │
       │     ▼
       │   Connector
       │
       └── Not granted
             │
             ▼
       Consent Screen
             │
       ┌─────┴─────┐
       ▼           ▼
    Allow        Deny
       │           │
       ▼           ▼
    Fetch       Manual /
     Data       Stop flow
30. documents Table

SetuX should store document metadata rather than unnecessarily
duplicating external documents.

documents

id
application_id
document_type
source
external_reference
storage_path
verification_status
retrieved_at
created_at

Example:

document_type:
EDUCATION_CERTIFICATE

source:
DIGILOCKER

external_reference:
DL-REF-001

verification_status:
VERIFIED
31. Document Sources

MVP:

SETUX_PROFILE
DIGILOCKER
EDUCATION_SYSTEM
INCOME_SYSTEM
USER_UPLOAD
32. Connector Architecture

All external systems must be accessed through a connector abstraction.

                    Connector Service
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
    DigiLocker       Education API     Income API
    Connector        Connector         Connector

The application service should not contain DigiLocker-specific logic.

33. Connector Interface

Conceptual interface:

interface DataConnector {
  fetchData(request: ConnectorRequest): Promise<ConnectorResponse>;
  validateData(data: unknown): Promise<ValidationResult>;
  normalizeData(data: unknown): Promise<NormalizedData>;
}

Implementations:

DigiLockerConnector
EducationConnector
IncomeConnector
34. Mock Connector

For SIH MVP:

DigiLockerConnector
        │
        ▼
Mock DigiLocker API
        │
        ▼
Sample education credential

Example response:

{
  "documentId": "DL-001",
  "name": "Rahul Kumar",
  "qualification": "B.Tech",
  "percentage": 82,
  "passingYear": 2025,
  "verified": true
}

This allows the interoperability flow to be demonstrated without
claiming a production government integration.

35. Connector Flow
Application Service
       │
       ▼
Connector Service
       │
       ▼
Select Connector
       │
       ▼
DigiLockerConnector
       │
       ▼
External / Mock API
       │
       ▼
Raw Response
       │
       ▼
Validation
       │
       ▼
Normalization
       │
       ▼
SetuX Data Model
       │
       ▼
Application
36. Connector Logs

Every external request should have a record.

connector_logs

id
application_id
connector
operation
status
request_reference
error_code
started_at
completed_at

Do NOT store:

Access tokens
Passwords
Sensitive authentication secrets
Raw confidential payloads unless required
37. Application Creation Flow
Citizen
  │
  ▼
POST /applications
  │
  ▼
Validate JWT
  │
  ▼
Check CITIZEN role
  │
  ▼
Validate service
  │
  ▼
Create application
  │
  ▼
Create initial status
  │
  ▼
Return application

Initial status:

DRAFT
38. Requirement Retrieval

Endpoint:

GET /applications/:id/requirements

Flow:

Application
    │
    ▼
Service
    │
    ▼
Service Requirements
    │
    ▼
Determine required data
    │
    ▼
Return requirements

Example:

{
  "requirements": [
    {
      "key": "IDENTITY",
      "source": "SETUX_PROFILE",
      "required": true
    },
    {
      "key": "EDUCATION",
      "source": "DIGILOCKER",
      "required": true
    },
    {
      "key": "INCOME",
      "source": "INCOME_SYSTEM",
      "required": true
    }
  ]
}
39. Data Collection Flow
Requirements
      │
      ▼
Check SetuX Profile
      │
      ▼
Check existing application data
      │
      ▼
Determine missing information
      │
      ▼
Determine external sources
      │
      ▼
Request consent
40. Consent API

Create consent:

POST /applications/:id/consents

Request:

{
  "dataType": "EDUCATION_RECORD",
  "source": "DIGILOCKER",
  "purpose": "SCHOLARSHIP_APPLICATION"
}

Response:

{
  "consentId": "CONSENT001",
  "status": "GRANTED"
}
41. Data Retrieval API

Endpoint:

POST /applications/:id/retrieve-data

Flow:

JWT validation
      │
      ▼
Citizen authorization
      │
      ▼
Check application
      │
      ▼
Check consent
      │
      ▼
Select connector
      │
      ▼
Fetch data
      │
      ▼
Validate
      │
      ▼
Normalize
      │
      ▼
Store application data
      │
      ▼
Update application status
42. Verification Flow
Retrieved Data
      │
      ▼
Connector validation
      │
      ▼
SetuX validation
      │
      ▼
Verification result
      │
      ├── VERIFIED
      │
      └── FAILED

Example:

Education Record

Source:
DigiLocker

Identity Match:
YES

Credential:
VALID

Status:
VERIFIED
43. Citizen Submission

Endpoint:

POST /applications/:id/submit

Before submission, backend verifies:

✓ Required fields present
✓ Required consent granted
✓ Required external data retrieved
✓ Required documents available
✓ Verification completed
✓ Citizen owns application

If all conditions pass:

READY_FOR_SUBMISSION
        │
        ▼
SUBMITTED
44. Government Application Queue

Endpoint:

GET /government/applications

Backend checks:

Authenticated
     │
     ▼
Role = GOVERNMENT_OFFICER
     │
     ▼
Organization authorization
     │
     ▼
Return permitted applications

Government should not automatically see every citizen's application.

45. Government Review

Endpoint:

GET /government/applications/:id

Response contains:

Application
│
├── Citizen information
├── Scholarship
├── Application status
├── Education information
├── Income information
├── Documents
├── Verification status
└── Consent history
46. Approve Application

Endpoint:

POST /government/applications/:id/approve

Flow:

Officer
   │
   ▼
JWT validation
   │
   ▼
Role validation
   │
   ▼
Organization authorization
   │
   ▼
Application validation
   │
   ▼
Update status
   │
   ▼
APPROVED
   │
   ▼
Audit log
   │
   ▼
Notification
47. Reject Application

Endpoint:

POST /government/applications/:id/reject

Request:

{
  "reason": "Income criteria not satisfied"
}

Flow:

Officer
   │
   ▼
Authorization
   │
   ▼
Application
   │
   ▼
REJECTED
   │
   ├── reason
   ├── officer
   └── timestamp
48. Request Additional Information

Endpoint:

POST /government/applications/:id/request-info

Request:

{
  "message": "Please provide the latest income certificate."
}

Status:

UNDER_REVIEW
      │
      ▼
REQUESTED_INFO
      │
      ▼
Citizen notified
49. Audit Architecture

Important operations generate audit events.

audit_logs

id
user_id
role
action
resource_type
resource_id
metadata
created_at

Examples:

LOGIN
PROFILE_CREATED
APPLICATION_CREATED
CONSENT_GRANTED
DATA_RETRIEVED
APPLICATION_SUBMITTED
APPLICATION_VIEWED
APPLICATION_APPROVED
APPLICATION_REJECTED
50. Audit Flow
Business Operation
       │
       ▼
Success
       │
       ▼
Audit Service
       │
       ▼
audit_logs

Audit logging should not depend on frontend requests.

51. Notification Architecture

Table:

notifications

id
user_id
application_id
type
title
message
read
created_at

Notification events:

APPLICATION_SUBMITTED
APPLICATION_UNDER_REVIEW
REQUESTED_INFORMATION
APPLICATION_APPROVED
APPLICATION_REJECTED

For SIH MVP, in-app notifications are sufficient.

52. Row Level Security

RLS is a critical part of the Supabase architecture.

Citizen:

Can read own profile
Can update own profile
Can read own applications
Can create own applications
Can read own consent

Government:

Can read authorized applications
Can update application decisions
Can read required application data
53. Citizen RLS Concept

Example:

user_id = auth.uid()

Meaning:

Authenticated User
       │
       ▼
auth.uid()
       │
       ▼
Only rows belonging to this user

A citizen cannot simply change:

application_id

and access another citizen's application.

54. Government RLS Concept

Government access should be tied to organization/department.

Conceptually:

auth.uid()
   │
   ▼
government_profiles
   │
   ▼
organization_id
   │
   ▼
applications
   │
   ▼
Authorized applications
55. Edge Function Security

Every protected Edge Function should:

Request
  │
  ▼
Extract JWT
  │
  ▼
Validate session
  │
  ▼
Get authenticated user
  │
  ▼
Determine role
  │
  ▼
Authorize resource
  │
  ▼
Execute business logic

Never trust:

{
  "role": "GOVERNMENT_OFFICER"
}

sent by the frontend.

56. Service Role Key

The Supabase service-role key must:

Exist only on trusted backend/server environments
Never be included in frontend code
Never be committed to Git
Never be exposed to users

Frontend uses the public/anon key with RLS.

Privileged backend operations use secure server-side credentials.

57. Environment Variables

Example:

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

DIGILOCKER_API_URL
DIGILOCKER_CLIENT_ID
DIGILOCKER_CLIENT_SECRET

EDUCATION_API_URL
INCOME_API_URL

Secrets must never be hardcoded.

58. Error Handling

Standard backend response:

{
  "success": false,
  "error": {
    "code": "DATA_RETRIEVAL_FAILED",
    "message": "Unable to retrieve the requested information."
  }
}

Internal error:

DigiLocker timeout
HTTP 504

User sees:

Unable to retrieve your education record.
Please try again.
59. Error Codes

Recommended MVP codes:

AUTH_INVALID_CREDENTIALS
AUTH_UNAUTHORIZED
PROFILE_NOT_FOUND
PROFILE_ALREADY_EXISTS
APPLICATION_NOT_FOUND
APPLICATION_ACCESS_DENIED
INVALID_APPLICATION_STATE
CONSENT_REQUIRED
CONSENT_DENIED
DATA_RETRIEVAL_FAILED
DATA_VALIDATION_FAILED
DOCUMENT_NOT_FOUND
VERIFICATION_FAILED
INTERNAL_ERROR
60. Idempotency

Important operations should avoid duplicate records.

Example:

Citizen clicks:

"Submit Application"

twice.

Backend should not create:

APP001
APP002

for the same submission.

Instead:

APP001

remains the application.

61. Transactional Operations

Operations that modify multiple tables should be handled atomically.

Example:

Approve Application
       │
       ├── Update application
       ├── Create audit log
       └── Create notification

If the critical operation fails, the system should not leave the
application in an inconsistent state.

Use PostgreSQL transactions/functions where appropriate.

62. Application Approval Transaction

Conceptually:

BEGIN
   │
   ├── UPDATE applications
   │      status = APPROVED
   │
   ├── INSERT audit_logs
   │
   └── INSERT notifications
   │
COMMIT
63. Complete Backend Flow
                         USER
                          │
                          ▼
                   SUPABASE AUTH
                          │
                          ▼
                        JWT
                          │
                          ▼
                  EDGE FUNCTION
                          │
                    Authentication
                          │
                    Authorization
                          │
              ┌───────────┴───────────┐
              │                       │
           CITIZEN              GOVERNMENT
              │                       │
              ▼                       ▼
        Citizen APIs            Officer APIs
              │                       │
              └───────────┬───────────┘
                          ▼
                    SERVICE LAYER
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
      Profile        Application        Consent
         │                │                │
         └────────────────┼────────────────┘
                          ▼
                   REQUIREMENT ENGINE
                          │
                          ▼
                   CONNECTOR SERVICE
                          │
             ┌────────────┼─────────────┐
             ▼            ▼             ▼
        DigiLocker    Education      Income
          Mock API      Mock API      Mock API
             │            │             │
             └────────────┼─────────────┘
                          ▼
                   NORMALIZATION
                          │
                          ▼
                     VALIDATION
                          │
                          ▼
                      POSTGRES
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
          Application   Consent     Audit
              │
              ▼
        Government Review
              │
        ┌─────┴──────┐
        ▼            ▼
     APPROVE       REJECT
        │            │
        └─────┬──────┘
              ▼
         Notification
              │
              ▼
          Citizen
64. API Summary
Authentication
POST /auth/login
POST /auth/logout
GET  /auth/me
Onboarding
POST /onboarding/citizen
POST /onboarding/government
Profile
GET /profile
PUT /profile
Services
GET /services
GET /services/:id
GET /services/:id/requirements
Applications
POST /applications
GET /applications
GET /applications/:id
GET /applications/:id/requirements
POST /applications/:id/retrieve-data
POST /applications/:id/submit
Consent
GET /applications/:id/consents
POST /applications/:id/consents
Government
GET /government/applications
GET /government/applications/:id
POST /government/applications/:id/approve
POST /government/applications/:id/reject
POST /government/applications/:id/request-info
65. MVP Data Flow

The complete scholarship flow becomes:

1. AUTHENTICATION
       ↓
2. ONBOARDING
       ↓
3. CITIZEN PROFILE
       ↓
4. SCHOLARSHIP SERVICE
       ↓
5. APPLICATION CREATED
       ↓
6. REQUIREMENTS IDENTIFIED
       ↓
7. EXISTING DATA CHECKED
       ↓
8. CONSENT REQUEST
       ↓
9. EXTERNAL DATA RETRIEVAL
       ↓
10. DATA NORMALIZATION
       ↓
11. DATA VALIDATION
       ↓
12. CITIZEN REVIEW
       ↓
13. APPLICATION SUBMISSION
       ↓
14. GOVERNMENT REVIEW
       ↓
15. APPROVE / REJECT
       ↓
16. NOTIFICATION
       ↓
17. CITIZEN TRACKING
66. MVP Security Boundary
                    INTERNET
                       │
                       ▼
                ┌─────────────┐
                │  FRONTEND   │
                └──────┬──────┘
                       │
                 Public API Key
                       │
                       ▼
                ┌─────────────┐
                │ SUPABASE    │
                │ AUTH        │
                └──────┬──────┘
                       │
                      JWT
                       │
                       ▼
                ┌─────────────┐
                │   EDGE      │
                │  FUNCTIONS  │
                └──────┬──────┘
                       │
                Authorization
                       │
                       ▼
                ┌─────────────┐
                │ PostgreSQL  │
                │    + RLS    │
                └─────────────┘
67. Important Design Rule

The frontend must NOT directly implement:

Application approval
Application rejection
Consent authorization
Role authorization
Data retrieval
Verification decisions
Application state transitions

The frontend requests an operation.

The backend decides whether the operation is allowed.

68. Frontend vs Backend Responsibility
FRONTEND
│
├── Display UI
├── Form validation
├── Loading states
├── Error display
├── Navigation
└── User interaction

BACKEND
│
├── Authentication
├── Authorization
├── Role validation
├── Business rules
├── Requirement determination
├── Consent validation
├── Data retrieval
├── Data normalization
├── Verification
├── Application state
├── Government decisions
└── Audit logging
69. MVP Interoperability Boundary

SetuX owns:

Identity
Profile
Application
Consent
Workflow
Normalized data
Verification state
Audit

External systems own:

Education records
Income records
Government certificates
Digital documents

SetuX connects them through:

Connector Layer
70. Development Order

The backend should be implemented in this order:

Phase 1 — Foundation
Supabase Project
        ↓
Database
        ↓
Auth
        ↓
Profiles
        ↓
RLS
Phase 2 — Onboarding
Citizen onboarding
        ↓
Government onboarding
Phase 3 — Services
Service table
        ↓
Service requirements
Phase 4 — Application
Create application
        ↓
Application state
        ↓
Application data
Phase 5 — Consent
Consent model
        ↓
Consent API
        ↓
Consent validation
Phase 6 — Connectors
Connector interface
        ↓
Mock DigiLocker
        ↓
Mock Education API
        ↓
Mock Income API
Phase 7 — Interoperability
Requirement Engine
        ↓
Consent
        ↓
Fetch
        ↓
Normalize
        ↓
Validate
Phase 8 — Government
Application queue
        ↓
Review
        ↓
Approve / Reject
Phase 9 — Supporting Systems
Notifications
Audit logs
Error handling
71. Final MVP Backend Architecture
                         SETUX
                           │
                     ┌─────▼─────┐
                     │ SUPABASE  │
                     └─────┬─────┘
                           │
        ┌──────────────────┼───────────────────┐
        │                  │                   │
        ▼                  ▼                   ▼
     AUTH              EDGE FUNCTIONS       STORAGE
        │                  │
        │          ┌───────┼────────┐
        │          │       │        │
        │          ▼       ▼        ▼
        │       Profile Application Consent
        │                  │
        │                  ▼
        │            Requirement Engine
        │                  │
        │                  ▼
        │            Connector Layer
        │                  │
        │        ┌─────────┼─────────┐
        │        ▼         ▼         ▼
        │    DigiLocker Education  Income
        │      Mock       Mock      Mock
        │
        └──────────────────┬───────────────────
                           ▼
                      PostgreSQL
                           │
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
      Applications      Consents          Audit
          │
          ▼
   Government Review
          │
     ┌────┴────┐
     ▼         ▼
  APPROVE    REJECT
72. Final Architectural Principle

For the SIH MVP, Supabase is the infrastructure/backend platform, not the place where we dump all our application logic.

The clean separation is:

Supabase
│
├── Auth       → Who are you?
├── PostgreSQL → What data do we have?
├── RLS        → What are you allowed to access?
├── Storage    → Where are files stored?
└── Edge Func. → What is SetuX allowed to DO?

And the SetuX business layer is:

Identity
   ↓
Consent
   ↓
Requirement Engine
   ↓
Connector Layer
   ↓
Normalization
   ↓
Verification
   ↓
Workflow
   ↓
Government Decision