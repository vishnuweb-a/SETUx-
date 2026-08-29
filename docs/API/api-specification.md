SetuX — API Specification

Version: 1.0
Project: SetuX SIH MVP
Architecture: Modular Monolith
Backend: Supabase + PostgreSQL + Edge Functions
API Style: REST/HTTP + Supabase Auth
Primary Client: Web Frontend

1. Purpose

This document defines the API conventions and endpoint specification for the SetuX SIH MVP.

The API layer connects:

Citizen UI
Government UI
       │
       ▼
    API Layer
       │
 ┌─────┼─────────────────┐
 ▼     ▼                 ▼
Auth  Business Logic   Integration
       │                 │
       ▼                 ▼
   PostgreSQL       Mock/External APIs

The API is responsible for:

authentication/session handling

onboarding

role-based access

scholarship applications

consent

data retrieval

application verification

government review

application tracking

notifications

audit events

2. API Architecture

For the MVP, SetuX uses a modular monolith.

                    FRONTEND
                       │
                       │ HTTPS
                       ▼
              ┌─────────────────┐
              │    API LAYER    │
              ├─────────────────┤
              │ Auth Module     │
              │ Profile Module  │
              │ Service Module  │
              │ Application     │
              │ Consent Module  │
              │ Integration     │
              │ Review Module   │
              │ Notification    │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      PostgreSQL DB        External Systems
       via Supabase        / Mock APIs

The frontend must never directly perform privileged operations.

3. Base URL

Development:

http://localhost:3000/api/v1

Production:

https://<setux-domain>/api/v1

All business APIs are versioned:

/api/v1/...

4. API Conventions

HTTP Methods

Method

Purpose

GET

Read resource

POST

Create resource / trigger operation

PATCH

Partial update

PUT

Full replacement where required

DELETE

Delete/revoke resource where permitted

For business actions such as approval, rejection and consent, prefer explicit action endpoints or POST operations rather than arbitrary PATCH requests.

Example:

POST /applications/:applicationId/submit
POST /applications/:applicationId/approve
POST /applications/:applicationId/reject
POST /applications/:applicationId/request-information

5. Authentication

SetuX uses Supabase Auth.

The frontend authenticates through Supabase Auth and receives an access token.

Frontend
   │
   ▼
Supabase Auth
   │
   ▼
Access Token
   │
   ▼
SetuX API
   │
   ▼
Validate JWT
   │
   ▼
Identify user + role

Authenticated requests use:

Authorization: Bearer <access_token>

The API must not accept user IDs or roles from the request body as the source of identity.

Identity comes from the verified token.

6. Role-Based Access

Supported roles:

CITIZEN
GOVERNMENT_OFFICER

Example:

GET /api/v1/applications

The backend determines the caller from the JWT.

The backend then applies role-specific authorization.

JWT
 │
 ▼
User ID
 │
 ▼
Profile
 │
 ▼
Role
 │
 ├── CITIZEN → Citizen permissions
 │
 └── GOVERNMENT_OFFICER → Officer permissions

7. Standard Request Headers

Authenticated request:

Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json

Optional request tracing:

X-Request-ID: <uuid>

The server should generate a request ID if the client does not provide one.

8. Standard Response Format

Successful response:

{
  "success": true,
  "data": {},
  "message": "Operation successful"
}

For collections:

{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42
  }
}

Errors:

{
  "success": false,
  "error": {
    "code": "APPLICATION_NOT_FOUND",
    "message": "Application not found"
  },
  "request_id": "req_123"
}

9. HTTP Status Codes

Use standard status codes.

Status

Meaning

200

Successful request

201

Resource created

204

Successful operation with no response body

400

Invalid request

401

Authentication required/invalid

403

Authenticated but not authorized

404

Resource not found

409

Conflict

422

Validation/business-rule failure

429

Rate limit exceeded

500

Internal server error

502

External dependency failure

504

External dependency timeout

10. Error Codes

Use stable machine-readable codes.

Examples:

UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
RESOURCE_NOT_FOUND
APPLICATION_NOT_FOUND
INVALID_STATUS_TRANSITION
CONSENT_REQUIRED
CONSENT_DENIED
DATA_RETRIEVAL_FAILED
DATA_RETRIEVAL_TIMEOUT
APPLICATION_ALREADY_SUBMITTED
APPLICATION_ALREADY_REVIEWED
SERVICE_NOT_AVAILABLE
EXTERNAL_SERVICE_ERROR
RATE_LIMIT_EXCEEDED
INTERNAL_SERVER_ERROR

Frontend logic should use error.code, not parse human-readable messages.

11. Validation Convention

All incoming request bodies must be validated server-side.

Example:

{
  "government_id": "GOV-12345",
  "date_of_birth": "2004-05-12",
  "state": "Delhi"
}

Invalid input:

{
  "government_id": ""
}

Response:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "fields": {
      "government_id": "Government ID is required"
    }
  }
}

Never trust frontend validation as the security boundary.

12. Authentication APIs

12.1 Get Current User

GET /api/v1/auth/me

Response

{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "citizen@example.com",
    "role": "CITIZEN",
    "onboarding_completed": false
  }
}

The actual authentication session is managed by Supabase Auth.

This endpoint provides the SetuX application profile.

13. Onboarding APIs

13.1 Citizen Onboarding

POST /api/v1/onboarding/citizen

Request

{
  "full_name": "Rahul Kumar",
  "phone": "+91XXXXXXXXXX",
  "government_id": "GOV-12345",
  "date_of_birth": "2004-05-12",
  "address": "Example Address",
  "state": "Delhi",
  "district": "New Delhi"
}

Response

{
  "success": true,
  "data": {
    "onboarding_completed": true,
    "role": "CITIZEN"
  },
  "message": "Citizen onboarding completed"
}

13.2 Government Officer Onboarding

POST /api/v1/onboarding/officer

Request

{
  "full_name": "Officer Name",
  "phone": "+91XXXXXXXXXX",
  "employee_id": "GOV-001",
  "department": "Department of Education",
  "designation": "Scholarship Officer"
}

Response

{
  "success": true,
  "data": {
    "onboarding_completed": true,
    "role": "GOVERNMENT_OFFICER"
  }
}

14. Profile APIs

14.1 Get Own Profile

GET /api/v1/profile

Accessible to authenticated users.

14.2 Update Own Profile

PATCH /api/v1/profile

Only fields allowed by the role-specific profile rules may be updated.

15. Service APIs

15.1 List Services

GET /api/v1/services

Response

{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "National Scholarship",
      "code": "SCHOLARSHIP_001",
      "description": "Scholarship application through SetuX",
      "department": "Department of Education"
    }
  ]
}

15.2 Get Service

GET /api/v1/services/:serviceId

Returns service details and requirements.

15.3 Get Service Requirements

GET /api/v1/services/:serviceId/requirements

Response

{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Identity",
      "required": true,
      "display_order": 1
    },
    {
      "id": "uuid",
      "name": "Education Record",
      "required": true,
      "display_order": 2
    },
    {
      "id": "uuid",
      "name": "Income Information",
      "required": true,
      "display_order": 3
    }
  ]
}

16. Application APIs

Applications are the primary business resource.

16.1 Create Application

POST /api/v1/applications

Request

{
  "service_id": "uuid"
}

The citizen ID is derived from the authenticated user.

Response

{
  "success": true,
  "data": {
    "id": "uuid",
    "application_number": "STX-2026-000001",
    "status": "DRAFT",
    "service_id": "uuid"
  }
}

16.2 List Citizen Applications

GET /api/v1/applications

For citizens, only their own applications are returned.

Optional query parameters:

?page=1
&limit=20
&status=UNDER_REVIEW

16.3 Get Application

GET /api/v1/applications/:applicationId

Citizen:

Own application only

Government officer:

Applications permitted by department/role

16.4 Update Draft Application

PATCH /api/v1/applications/:applicationId

Only draft/requested-information applications may be updated.

Example:

{
  "additional_information": {
    "course": "B.Tech",
    "year": 3
  }
}

The server validates the application's current state before updating.

17. Consent APIs

17.1 Get Required Consents

GET /api/v1/applications/:applicationId/consents

17.2 Grant Consent

POST /api/v1/applications/:applicationId/consents

Request

{
  "data_source_id": "uuid",
  "purpose": "Retrieve education information for scholarship verification"
}

Response

{
  "success": true,
  "data": {
    "consent_id": "uuid",
    "status": "GRANTED",
    "granted_at": "2026-08-29T10:30:00Z"
  }
}

The backend creates:

consent
+
application event
+
audit log

where applicable.

17.3 Revoke Consent

POST /api/v1/applications/:applicationId/consents/:consentId/revoke

A revoked consent cannot be treated as active for future retrieval.

18. Data Retrieval APIs

The integration layer is responsible for fetching data from connected sources.

18.1 Start Data Retrieval

POST /api/v1/applications/:applicationId/data/retrieve

Request

{
  "data_source_ids": [
    "uuid",
    "uuid",
    "uuid"
  ]
}

The backend checks:

User owns application
        ↓
Consent exists
        ↓
Consent is GRANTED
        ↓
Data source is active
        ↓
Create retrieval record
        ↓
Call connector

18.2 Get Retrieval Status

GET /api/v1/applications/:applicationId/data/retrievals

Response

{
  "success": true,
  "data": [
    {
      "data_source": "DigiLocker Mock",
      "status": "SUCCESS"
    },
    {
      "data_source": "Income Department Mock",
      "status": "SUCCESS"
    },
    {
      "data_source": "Education Department Mock",
      "status": "FAILED"
    }
  ]
}

18.3 Get Normalized Application Data

GET /api/v1/applications/:applicationId/data

Response

{
  "success": true,
  "data": {
    "identity": {
      "status": "VERIFIED",
      "value": {}
    },
    "education": {
      "status": "VERIFIED",
      "value": {}
    },
    "income": {
      "status": "VERIFIED",
      "value": {}
    }
  }
}

19. Verification API

19.1 Run Verification

POST /api/v1/applications/:applicationId/verify

The backend verifies that required information has been successfully retrieved and normalized.

Possible response:

{
  "success": true,
  "data": {
    "verification_status": "PASSED",
    "application_status": "READY_FOR_SUBMISSION"
  }
}

Failure:

{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Required information could not be verified"
  }
}

20. Application Submission

20.1 Submit Application

POST /api/v1/applications/:applicationId/submit

Before submission the backend verifies:

Application exists
        ↓
Citizen owns application
        ↓
Required consents granted
        ↓
Required data retrieved
        ↓
Required data verified
        ↓
No blocking validation errors
        ↓
Application → SUBMITTED

The server then creates:

application event
+
audit log
+
notification

21. Government APIs

21.1 Government Application Queue

GET /api/v1/government/applications

Optional filters:

?status=SUBMITTED
?status=UNDER_REVIEW
?page=1
&limit=20

The backend restricts records according to officer permissions.

21.2 Government Application Detail

GET /api/v1/government/applications/:applicationId

Returns the application information required for review.

21.3 Start Review

POST /api/v1/government/applications/:applicationId/review

Request

{
  "action": "START_REVIEW"
}

This can transition:

SUBMITTED → UNDER_REVIEW

22. Government Decision APIs

22.1 Approve

POST /api/v1/government/applications/:applicationId/approve

Request

{
  "remarks": "Application verified successfully."
}

Backend performs:

Authorization
     ↓
Validate current status
     ↓
Create application_review
     ↓
Application → APPROVED
     ↓
Create application_event
     ↓
Create audit_log
     ↓
Create notification

22.2 Reject

POST /api/v1/government/applications/:applicationId/reject

Request

{
  "remarks": "Eligibility requirements were not satisfied."
}

22.3 Request Information

POST /api/v1/government/applications/:applicationId/request-information

Request

{
  "remarks": "Please provide updated income information."
}

Application transition:

UNDER_REVIEW
      ↓
REQUESTED_INFO

Citizen receives a notification.

23. Application Tracking

23.1 Get Application Timeline

GET /api/v1/applications/:applicationId/timeline

Response

{
  "success": true,
  "data": [
    {
      "event_type": "APPLICATION_CREATED",
      "created_at": "2026-08-29T09:00:00Z"
    },
    {
      "event_type": "CONSENT_GRANTED",
      "created_at": "2026-08-29T09:02:00Z"
    },
    {
      "event_type": "DATA_RETRIEVED",
      "created_at": "2026-08-29T09:03:00Z"
    },
    {
      "event_type": "APPLICATION_SUBMITTED",
      "created_at": "2026-08-29T09:05:00Z"
    }
  ]
}

24. Notification APIs

24.1 Get Notifications

GET /api/v1/notifications

24.2 Mark Notification as Read

POST /api/v1/notifications/:notificationId/read

The user can only modify their own notification.

25. Audit APIs

Audit logs are primarily internal.

Government users should not receive unrestricted access to audit logs.

For internal/admin use:

GET /api/v1/admin/audit-logs

This endpoint is outside the normal citizen/government workflow and should require elevated authorization.

26. Complete API Flow

AUTH
 │
 ▼
GET /auth/me
 │
 ▼
ONBOARDING
 │
 ├── POST /onboarding/citizen
 └── POST /onboarding/officer
 │
 ▼
SERVICES
 │
 └── GET /services
 │
 ▼
APPLICATION
 │
 ├── POST /applications
 ├── GET /applications/:id
 └── PATCH /applications/:id
 │
 ▼
CONSENT
 │
 ├── GET /applications/:id/consents
 └── POST /applications/:id/consents
 │
 ▼
DATA RETRIEVAL
 │
 ├── POST /applications/:id/data/retrieve
 ├── GET /applications/:id/data/retrievals
 └── GET /applications/:id/data
 │
 ▼
VERIFICATION
 │
 └── POST /applications/:id/verify
 │
 ▼
SUBMISSION
 │
 └── POST /applications/:id/submit
 │
 ▼
GOVERNMENT REVIEW
 │
 ├── GET /government/applications
 ├── POST /government/applications/:id/review
 ├── POST /government/applications/:id/approve
 ├── POST /government/applications/:id/reject
 └── POST /government/applications/:id/request-information
 │
 ▼
TRACKING
 │
 ├── GET /applications/:id/timeline
 └── GET /notifications

27. API-to-Database Mapping

API Module

Main Tables

Auth

auth.users, profiles

Onboarding

profiles, citizen_profiles, officer_profiles

Services

services, service_requirements

Applications

applications

Consent

consents

Integration

data_sources, data_retrievals

Data

application_data

Verification

application_data, applications

Review

application_reviews, applications

Tracking

application_events

Notifications

notifications

Audit

audit_logs

28. Business Rules

Application Ownership

A citizen may access only their own applications.

JWT user_id == applications.citizen_id

Consent Rule

Data retrieval requires active consent.

NO CONSENT
    ↓
NO RETRIEVAL

Submission Rule

An application cannot be submitted unless:

Required data available
        +
Required data verified
        +
Required consent granted

Review Rule

Only authorized government officers can review applications.

Decision Rule

An application can be approved/rejected only from an allowed state.

Example:

DRAFT → APPROVED

is invalid.

UNDER_REVIEW → APPROVED

is valid.

29. Status Transition Validation

The backend should implement a transition map:

DRAFT
 └──> CONSENT_PENDING

CONSENT_PENDING
 └──> DATA_RETRIEVAL

DATA_RETRIEVAL
 └──> VERIFICATION

VERIFICATION
 └──> READY_FOR_SUBMISSION

READY_FOR_SUBMISSION
 └──> SUBMITTED

SUBMITTED
 └──> UNDER_REVIEW

UNDER_REVIEW
 ├──> APPROVED
 ├──> REJECTED
 └──> REQUESTED_INFO

REQUESTED_INFO
 └──> UNDER_REVIEW

The client must never directly choose arbitrary status values.

30. Integration Boundary

External systems must not be directly called by the frontend.

Wrong:

Frontend ─────► Government API

Correct:

Frontend
   │
   ▼
SetuX API
   │
   ▼
Integration/Connector Layer
   │
   ▼
Government System

This allows:

authentication

consent checking

retries

timeout handling

logging

normalization

error handling

to remain under SetuX control.

31. Connector Contract

Every external connector should follow a common internal contract.

Conceptually:

Connector
 ├── getIdentity()
 ├── getEducation()
 ├── getIncome()
 └── healthCheck()

The actual implementation may differ:

DigiLockerConnector
IncomeConnector
EducationConnector

For the SIH prototype:

MockDigiLockerConnector
MockIncomeConnector
MockEducationConnector

32. External Data Normalization

External response:

{
  "student_name": "Rahul",
  "marks": 82,
  "institution_name": "ABC University"
}

SetuX normalized representation:

{
  "field_name": "education",
  "field_value": {
    "name": "Rahul",
    "percentage": 82,
    "institution": "ABC University"
  }
}

The rest of the application does not need to understand each external system's schema.

33. Idempotency

Operations that may be retried should be idempotent where possible.

Especially:

POST /applications/:id/submit
POST /applications/:id/approve
POST /applications/:id/reject
POST /applications/:id/data/retrieve

For critical operations, the client may send:

Idempotency-Key: <uuid>

The backend should prevent duplicate processing.

34. Pagination

Collection APIs use:

?page=1&limit=20

Example:

GET /api/v1/government/applications?page=1&limit=20

Response:

{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "total_pages": 6
  }
}

Maximum limit should be enforced server-side.

35. Filtering

Government application queue:

GET /api/v1/government/applications?status=UNDER_REVIEW

Future filters can include:

service_id
department
created_from
created_to

Only supported filters should be accepted.

36. Rate Limiting

Rate limiting should be applied to:

Authentication-sensitive endpoints
Public endpoints
External integration triggers
Notification endpoints

Example policy:

Too many requests
       ↓
HTTP 429
       ↓
RATE_LIMIT_EXCEEDED

Exact limits can be configured during implementation.

37. Logging

Every request should have a request ID.

Request
  │
  ▼
request_id
  │
  ├── API logs
  ├── integration logs
  ├── error logs
  └── audit events where applicable

Do not log:

passwords
access tokens
API secrets
unnecessary sensitive citizen data

38. API Security Principles

The API must follow:

Authentication
      ↓
Authorization
      ↓
Validation
      ↓
Business Rules
      ↓
Database / Integration

Never:

Frontend
   ↓
Database

for privileged business operations.

39. API Versioning

Current version:

/v1

Example:

/api/v1/applications

Breaking changes should use:

/api/v2/...

Do not silently change the contract of /v1.

40. MVP Endpoint Summary

AUTH
GET    /auth/me

ONBOARDING
POST   /onboarding/citizen
POST   /onboarding/officer

PROFILE
GET    /profile
PATCH  /profile

SERVICES
GET    /services
GET    /services/:serviceId
GET    /services/:serviceId/requirements

APPLICATIONS
POST   /applications
GET    /applications
GET    /applications/:applicationId
PATCH  /applications/:applicationId
POST   /applications/:applicationId/verify
POST   /applications/:applicationId/submit

CONSENT
GET    /applications/:applicationId/consents
POST   /applications/:applicationId/consents
POST   /applications/:applicationId/consents/:consentId/revoke

DATA
POST   /applications/:applicationId/data/retrieve
GET    /applications/:applicationId/data/retrievals
GET    /applications/:applicationId/data

GOVERNMENT
GET    /government/applications
GET    /government/applications/:applicationId
POST   /government/applications/:applicationId/review
POST   /government/applications/:applicationId/approve
POST   /government/applications/:applicationId/reject
POST   /government/applications/:applicationId/request-information

TRACKING
GET    /applications/:applicationId/timeline

NOTIFICATIONS
GET    /notifications
POST   /notifications/:notificationId/read

41. Definition of Done

/api/v1 versioning established

Authentication contract defined

Role authorization defined

Standard response format defined

Standard error format defined

HTTP status conventions defined

Validation convention defined

Onboarding APIs defined

Profile APIs defined

Service APIs defined

Application APIs defined

Consent APIs defined

Data retrieval APIs defined

Verification API defined

Submission API defined

Government review APIs defined

Tracking APIs defined

Notification APIs defined

RLS/authorization boundary defined

Connector boundary defined

Idempotency strategy defined

Pagination/filtering defined

Rate limiting defined

Logging/security conventions defined

42. Final API Architecture

                         SETUX FRONTEND
                       /              \
                      /                \
                 CITIZEN UI       GOVERNMENT UI
                      \                /
                       \              /
                        ▼            ▼
                     ┌────────────────┐
                     │   API / v1     │
                     ├────────────────┤
                     │ Auth           │
                     │ Profile        │
                     │ Services       │
                     │ Applications   │
                     │ Consent        │
                     │ Integration    │
                     │ Verification   │
                     │ Review         │
                     │ Notifications  │
                     └───────┬────────┘
                             │
                 ┌───────────┴────────────┐
                 ▼                        ▼
          Supabase PostgreSQL       Connector Layer
                 │                        │
                 ▼                        ▼
            RLS + Data             Mock Government
                                      Systems
                                         │
                         ┌───────────────┼──────────────┐
                         ▼               ▼              ▼
                    DigiLocker       Income API     Education API
                       Mock             Mock           Mock

Final Principle

The SetuX API is the controlled business layer between the two UIs, the database, and external government systems.

The frontend asks SetuX to perform business operations.

SetuX:

Authenticates
    ↓
Authorizes
    ↓
Validates
    ↓
Checks consent
    ↓
Applies business rules
    ↓
Reads/writes database
    ↓
Calls connectors when required
    ↓
Records events/audit
    ↓
Returns a controlled response