SetuX — High Level Design (HLD)
# SetuX — High Level Design

Version: 1.0
Project: SetuX — SIH MVP
Architecture: Modular Monolith
Primary Use Case: Scholarship Application
User Roles:
  - Citizen
  - Government Officer

---

# 1. System Objective

SetuX is a unified government service-delivery and interoperability
platform.

For the SIH MVP, SetuX demonstrates how a citizen can apply for a
scholarship without repeatedly providing information that already exists
in connected systems.

The system provides:

- Role-based authentication
- Citizen onboarding
- Government officer onboarding
- Citizen profile
- Scholarship application
- Requirement determination
- Consent management
- Document/data retrieval
- Data normalization
- Application workflow
- Government verification
- Approve/reject functionality
- Application tracking
- Notifications
- Audit logging

The MVP uses simulated government services/connectors where real
government integrations are unavailable.

---

# 2. MVP Scope

## Included

### Authentication

- Citizen authentication
- Government officer authentication
- Role-based access
- Session/token management

### Citizen

- Onboarding
- Profile
- Scholarship discovery
- Scholarship application
- Consent approval
- Application tracking
- Application status

### Government

- Officer dashboard
- Application list
- Application details
- Document/data verification
- Approve application
- Reject application
- Request additional information

### SetuX Core

- Identity
- Profile
- Consent
- Application
- Workflow
- RBAC
- Audit logs
- Connector layer
- Data normalization

### External/Simulated Systems

- DigiLocker connector
- Education data connector
- Income/certificate connector

---

# 3. Out of Scope for MVP

The following are NOT required:

- Real Aadhaar authentication
- Real PAN integration
- Real banking integration
- Real payment gateway
- Production DigiLocker integration unless officially available
- Multiple scholarship schemes
- Multiple government departments
- Microservices
- Kubernetes
- Service mesh
- Distributed event infrastructure
- Production-scale infrastructure
- Advanced AI
- Facial/biometric authentication
- Mobile application

These can be future extensions.

---

# 4. Architecture Decision

## Architecture Style

SetuX MVP will use a:

**Modular Monolith**

Instead of immediately creating microservices.

Reason:

- Faster development
- Easier debugging
- Easier SIH deployment
- Lower infrastructure complexity
- Clear module boundaries
- Can be converted into services later

---

# 5. High Level Architecture

```text
                         ┌──────────────────────┐
                         │       CITIZEN        │
                         │      Web Browser     │
                         └──────────┬───────────┘
                                    │
                                    │ HTTPS
                                    │
                         ┌──────────▼───────────┐
                         │                      │
                         │     SETUX FRONTEND   │
                         │                      │
                         │ React / Web UI       │
                         │                      │
                         └──────────┬───────────┘
                                    │
                                    │ REST API
                                    │
                    ┌───────────────▼────────────────┐
                    │                                │
                    │        SETUX BACKEND           │
                    │       MODULAR MONOLITH          │
                    │                                │
                    │ ┌────────────────────────────┐ │
                    │ │ Authentication & RBAC       │ │
                    │ ├────────────────────────────┤ │
                    │ │ Citizen Profile             │ │
                    │ ├────────────────────────────┤ │
                    │ │ Scholarship Application     │ │
                    │ ├────────────────────────────┤ │
                    │ │ Consent Management          │ │
                    │ ├────────────────────────────┤ │
                    │ │ Workflow Engine             │ │
                    │ ├────────────────────────────┤ │
                    │ │ Document/Data Service       │ │
                    │ ├────────────────────────────┤ │
                    │ │ Connector Layer             │ │
                    │ ├────────────────────────────┤ │
                    │ │ Notification Service        │ │
                    │ ├────────────────────────────┤ │
                    │ │ Audit Service               │ │
                    │ └────────────────────────────┘ │
                    │                                │
                    └───────────────┬────────────────┘
                                    │
                         ┌──────────▼───────────┐
                         │       DATABASE       │
                         │                      │
                         │ MongoDB / PostgreSQL │
                         └──────────────────────┘
                                    │
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
        ┌───────────────┐  ┌────────────────┐  ┌────────────────┐
        │   DigiLocker  │  │ Education      │  │ Income / Cert  │
        │   Connector   │  │ Connector      │  │ Connector      │
        └───────┬───────┘  └───────┬────────┘  └───────┬────────┘
                │                   │                   │
                ▼                   ▼                   ▼
          External / Simulated Government Systems
6. User Roles

SetuX MVP contains two primary roles.

Citizen

Can:

Create account
Complete profile
View services
Apply for scholarship
Give consent
View retrieved information
Submit application
Track application
Receive status updates
Government Officer

Can:

Login
View assigned applications
Review application
View verified information
View consent record
Verify application
Approve
Reject
Request additional information
7. Frontend Architecture

The frontend contains two role-based experiences.

SETUX FRONTEND
      │
      ├───────────────┐
      │               │
      ▼               ▼
 Citizen UI       Government UI
      │               │
      ▼               ▼
 Citizen Dashboard   Officer Dashboard
      │               │
      ▼               ▼
 Scholarship        Application
 Application        Review
Main Screens
Common
/login
Citizen
/onboarding
/dashboard
/services
/scholarship
/scholarship/apply
/consent
/applications
/applications/:id
/profile
Government
/government/onboarding
/government/dashboard
/government/applications
/government/applications/:id
8. Backend Module Architecture

The backend is one application but divided into logical modules.

backend/
│
├── auth/
│
├── users/
│
├── profiles/
│
├── applications/
│
├── scholarships/
│
├── consent/
│
├── documents/
│
├── connectors/
│
├── workflow/
│
├── notifications/
│
├── audit/
│
└── common/

Each module has its own:

Controller
Service
Repository/data access
Validation
Models where required
9. Authentication Module

Responsible for:

Login
Credential validation
Password hashing
Session/token creation
Role identification
Authentication middleware

Flow:

User
 │
 ▼
Login
 │
 ▼
Auth Controller
 │
 ▼
Auth Service
 │
 ▼
Credential Validation
 │
 ▼
User Repository
 │
 ▼
Authenticated Session
 │
 ▼
Role
 │
 ├──── CITIZEN ────► Citizen Dashboard
 │
 └──── GOVERNMENT ─► Government Dashboard
10. RBAC

Role-based access control:

             AUTHENTICATED USER
                     │
              ┌──────┴──────┐
              │             │
           CITIZEN       GOVERNMENT
              │             │
              ▼             ▼
       Citizen APIs     Government APIs

Example:

GET /api/applications

Citizen:

Can only access their own applications.

Government:

Can access applications assigned to their organization.

The frontend role selector is NOT the security mechanism.

Authorization is enforced by the backend.

11. Citizen Onboarding Flow
Authentication
      │
      ▼
Authenticated Email
      │
      ▼
Citizen Onboarding
      │
      ├── Name
      ├── Government ID
      ├── Mobile
      └── Date of Birth
      │
      ▼
POST /profile/onboard
      │
      ▼
Backend
      │
      ▼
Create Citizen Profile
      │
      ▼
onboarded = true
      │
      ▼
Citizen Dashboard

Email is inherited from the authenticated account.

It is not entered again.

12. Government Onboarding Flow
Government Authentication
          │
          ▼
Government Onboarding
          │
          ├── Officer Name
          ├── Organization
          ├── Department
          ├── Officer ID
          └── Contact Information
          │
          ▼
Create Government Profile
          │
          ▼
Government Dashboard
13. Scholarship Application Flow

This is the core MVP workflow.

Citizen Dashboard
       │
       ▼
Scholarship
       │
       ▼
View Scholarship
       │
       ▼
Apply
       │
       ▼
SetuX Requirement Engine
       │
       ▼
Determine Required Data
       │
       ▼
Check Existing Data
       │
       ├───────────────┐
       │               │
       ▼               ▼
Already Available   Not Available
       │               │
       │               ▼
       │          Ask Citizen
       │               │
       ▼               │
Consent Required?      │
       │               │
       ▼               │
Consent Screen         │
       │               │
       ▼               │
Fetch Data             │
       │               │
       └───────┬───────┘
               ▼
       Normalize Data
               │
               ▼
       Validate Data
               │
               ▼
       Build Application
               │
               ▼
        Citizen Review
               │
               ▼
        Submit Application
               │
               ▼
        Government Review
14. Requirement Engine

For MVP, the requirement engine can be configuration-driven.

Example:

{
  "service": "SCHOLARSHIP",
  "requirements": [
    {
      "key": "identity",
      "source": "SETUX_PROFILE",
      "required": true
    },
    {
      "key": "education",
      "source": "DIGILOCKER",
      "required": true
    },
    {
      "key": "income",
      "source": "INCOME_SYSTEM",
      "required": true
    }
  ]
}

This allows SetuX to know what information is needed.

15. Connector Architecture

External systems should NOT directly interact with every SetuX
module.

All external integrations go through a connector layer.

                 SETUX
                   │
             Connector Layer
                   │
       ┌───────────┼────────────┐
       │           │            │
       ▼           ▼            ▼
 DigiLocker    Education      Income
 Connector     Connector      Connector
       │           │            │
       ▼           ▼            ▼
   External Government Systems

Benefits:

External API changes are isolated
Standard internal data format
Easier mocking
Easier testing
Easier future integrations
16. Connector Interface

Every connector should conceptually implement:

fetchData()
validateData()
normalizeData()

Example:

DigiLocker Connector
        │
        ▼
fetch education credential
        │
        ▼
validate credential
        │
        ▼
normalize
        │
        ▼
SetuX Standard Data
17. DigiLocker Integration

For the SIH prototype, DigiLocker should be treated as an external
document/credential provider.

SetuX does not become a replacement for DigiLocker.

Instead:

Citizen
   │
   ▼
SetuX
   │
   │ Consent
   ▼
DigiLocker
   │
   ▼
Education Credential
   │
   ▼
SetuX Connector
   │
   ▼
Normalized Education Data

If a real DigiLocker integration is unavailable for the prototype,
create a simulated DigiLocker service with the same conceptual flow.

18. Consent Management

Consent is a core SetuX component.

Before accessing external information:

SetuX needs:

Education Certificate
Income Certificate

       │
       ▼

Citizen Consent

┌─────────────────────────────┐
│ Education Data              │
│ Source: DigiLocker          │
│ Purpose: Scholarship        │
│                             │
│ [ Allow ]     [ Decline ]   │
└─────────────────────────────┘

Consent record:

Consent
├── consentId
├── userId
├── applicationId
├── dataType
├── source
├── purpose
├── status
├── grantedAt
└── expiresAt
19. Consent Flow
Application
    │
    ▼
Required external data
    │
    ▼
Check consent
    │
    ├── Existing valid consent
    │          │
    │          ▼
    │       Fetch data
    │
    └── No consent
               │
               ▼
         Consent screen
               │
         ┌─────┴─────┐
         ▼           ▼
       Allow       Decline
         │           │
         ▼           ▼
     Fetch data   Stop/Manual
                     input
20. Data Normalization

Different government systems may return different formats.

Example:

Education System A

student_name
marks_obtained
passing_year


DigiLocker

name
percentage
year_of_passing

SetuX converts both into:

SetuX Education Model

{
  "studentName": "...",
  "percentage": 82,
  "passingYear": 2025
}

This is a key part of interoperability.

21. Document/Data Service

The document/data module manages:

Retrieved document metadata
Document references
Document verification status
Uploaded supporting documents
Source information

Important:

SetuX should avoid unnecessarily storing copies of external documents.

For MVP, it can store:

documentId
applicationId
documentType
source
reference
verificationStatus
retrievedAt
22. Application Module

Responsible for:

Creating applications
Updating applications
Submission
Application status
Application ownership
Government review

Example:

Application
│
├── applicationId
├── citizenId
├── serviceId
├── status
├── data
├── documents
├── consentReferences
├── createdAt
├── submittedAt
└── updatedAt
23. Application State Machine

The MVP application lifecycle:

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

Additional state:

REQUESTED_INFO
      │
      ▼
CITIZEN_ACTION
      │
      ▼
UNDER_REVIEW
24. Government Review Flow
Government Dashboard
        │
        ▼
Application Queue
        │
        ▼
Open Application
        │
        ▼
Application Details
        │
        ├── Citizen information
        ├── Education data
        ├── Income data
        ├── Documents
        ├── Verification
        └── Consent history
        │
        ▼
Officer Decision
        │
        ├───────────────┐
        │               │
        ▼               ▼
     APPROVE          REJECT
        │               │
        └───────┬───────┘
                ▼
        Update Application
                │
                ▼
          Notify Citizen
25. Verification

For the MVP:

Retrieved Data
      │
      ▼
Data Validation
      │
      ▼
Source Verified?
      │
      ├── YES → VERIFIED
      │
      └── NO  → VERIFICATION_FAILED

Government officer can see:

Education Certificate
Source: DigiLocker
Status: ✓ Verified

Income Certificate
Source: Income System
Status: ✓ Verified
26. Exception Handling

External systems can fail.

Example:

SetuX
  │
  ▼
DigiLocker
  │
  X API Failure
  │
  ▼
Connector catches error
  │
  ▼
Create integration error
  │
  ▼
Application status
"DATA_RETRIEVAL_FAILED"
  │
  ▼
Citizen sees:
"Unable to retrieve your education
record. You can retry or provide
the document manually."

Never expose raw API errors to the citizen.

27. Retry Strategy

For MVP:

API request
    │
    ▼
Failure
    │
    ▼
Retry
    │
    ├── Success → Continue
    │
    └── Failure → Mark failed

A simple retry mechanism is sufficient.

No distributed message queue is required for MVP.

28. Notification Module

The MVP can support:

Application submitted
Application approved
Application rejected
Additional information requested

For prototype:

In-app notifications
Optional email simulation

Example:

Application STX-APP-001
Status changed:

UNDER_REVIEW
      ↓
APPROVED
29. Audit Logging

Important actions should be recorded.

Example:

AuditLog

userId
role
action
resource
resourceId
timestamp
metadata

Examples:

CITIZEN
GRANTED_CONSENT
APPLICATION
STX-APP-001

GOVERNMENT
VIEWED_APPLICATION
STX-APP-001

GOVERNMENT
APPROVED_APPLICATION
STX-APP-001

This demonstrates accountability.

30. Database Architecture

For MVP:

Use one database.

Conceptual entities:

User
 │
 ├───────────────┐
 ▼               ▼
CitizenProfile   GovernmentProfile
 │
 ▼
Application
 │
 ├───────────┐
 ▼           ▼
Consent    Document
 │
 ▼
AuditLog

Additional:

Service
Scholarship
Notification
ConnectorLog
31. Suggested Database Collections
users
citizen_profiles
government_profiles
services
applications
consents
documents
notifications
audit_logs
connector_logs
32. API Architecture

REST API.

Base:

/api/v1

Authentication:

POST /auth/login
POST /auth/logout
GET  /auth/me

Citizen:

POST /profile/onboard
GET  /profile
PUT  /profile

Services:

GET /services
GET /services/:id

Applications:

POST /applications
GET  /applications
GET  /applications/:id
PUT  /applications/:id
POST /applications/:id/submit

Consent:

GET  /applications/:id/consents
POST /applications/:id/consents

Government:

GET  /government/applications
GET  /government/applications/:id
POST /government/applications/:id/approve
POST /government/applications/:id/reject
POST /government/applications/:id/request-info
33. API Request Flow

Example:

React
 │
 │ POST /applications
 ▼
Express Router
 │
 ▼
Auth Middleware
 │
 ▼
RBAC Middleware
 │
 ▼
Application Controller
 │
 ▼
Application Service
 │
 ├── Requirement Service
 ├── Consent Service
 ├── Connector Service
 └── Application Repository
 │
 ▼
Database
34. Security Architecture

MVP security requirements:

HTTPS
Password hashing
Authentication middleware
RBAC
Input validation
Request validation
Rate limiting on authentication
Secure session/token handling
Audit logs
No sensitive information in logs
Environment variables for secrets
35. Data Ownership Principle

SetuX should distinguish:

SETUX-OWNED DATA
        │
        ▼
Citizen profile
Application state
Consent records
Audit records


EXTERNAL DATA
        │
        ▼
Education records
Income records
Government certificates


USER-PROVIDED DATA
        │
        ▼
Additional information
Supporting documents

SetuX should not claim ownership of external government records.

36. Complete MVP Flow

This is the most important diagram for the SIH presentation.

                         CITIZEN
                            │
                            ▼
                    ┌───────────────┐
                    │ Authentication│
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   Onboarding  │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   Dashboard   │
                    └───────┬───────┘
                            │
                            ▼
                    Apply Scholarship
                            │
                            ▼
                    ┌───────────────┐
                    │ Requirement   │
                    │    Engine     │
                    └───────┬───────┘
                            │
                            ▼
                    Required Data
                            │
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
          SetuX Profile  DigiLocker    Govt System
              │             │              │
              │             │              │
              │        ┌────▼────┐         │
              │        │ Consent │         │
              │        └────┬────┘         │
              │             │              │
              └─────────────┼──────────────┘
                            ▼
                    Data Normalization
                            │
                            ▼
                       Verification
                            │
                            ▼
                    Citizen Review
                            │
                            ▼
                    Submit Application
                            │
                            ▼
                  ┌──────────────────┐
                  │ Government Portal │
                  └────────┬─────────┘
                           │
                           ▼
                    Officer Review
                           │
                  ┌────────┴────────┐
                  │                 │
                  ▼                 ▼
               APPROVE            REJECT
                  │                 │
                  └────────┬────────┘
                           ▼
                    Update Status
                           │
                           ▼
                    Citizen Dashboard
37. The Core Interoperability Demonstration

The SIH judges should be able to see this:

              ┌──────────────┐
              │    Citizen   │
              └──────┬───────┘
                     │
                     ▼
                ┌─────────┐
                │  SetuX  │
                └────┬────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   SetuX Profile  DigiLocker   Income API
        │            │            │
        ▼            ▼            ▼
      Identity    Education     Income
        │            │            │
        └────────────┼────────────┘
                     ▼
              Unified Application
                     │
                     ▼
             Government Officer
                     │
                     ▼
                Decision

This is what differentiates the prototype from simply building a
scholarship portal.

38. Deployment Architecture

For SIH MVP:

                    INTERNET
                        │
                        ▼
                 Frontend Hosting
                        │
                        ▼
                  SetuX Backend
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
           Database           Mock APIs
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                 DigiLocker  Education    Income
                   Mock        Mock        Mock

A simple deployment is sufficient.

No Kubernetes or microservice infrastructure is required.

39. Future Architecture Evolution

The MVP:

              MODULAR MONOLITH
                    │
       ┌────────────┼────────────┐
       │            │            │
      Auth      Application   Connector

Future SetuX:

                   API GATEWAY
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
 Auth Service    Application       Consent Service
                      │
                ┌─────┴─────┐
                ▼           ▼
           Workflow     Connector
                          Services
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
           DigiLocker     Education       Income

The MVP's modular boundaries should therefore be designed cleanly
enough that modules can later be extracted into services.

40. Technology Stack

Recommended SIH MVP stack:

Frontend
React
TypeScript
Tailwind CSS
React Router
Axios / Fetch
Backend
Node.js
Express
TypeScript
Zod
JWT or secure session authentication
Argon2/bcrypt for password hashing
Database
MongoDB
External Integration
REST APIs
Mock government APIs for SIH demonstration
DigiLocker connector abstraction
Deployment
Frontend hosting
Backend hosting
Managed MongoDB
41. MVP Success Criteria

The prototype is successful if a judge can perform this complete flow:

Citizen
Login
 ↓
Onboard
 ↓
Dashboard
 ↓
Select Scholarship
 ↓
Apply
 ↓
See required information
 ↓
Give consent
 ↓
SetuX retrieves simulated external data
 ↓
Review application
 ↓
Submit
Government
Login
 ↓
Government Dashboard
 ↓
See application
 ↓
Open application
 ↓
Review retrieved/verified data
 ↓
Approve
Citizen
Dashboard
 ↓
Application
 ↓
Status = APPROVED

That single end-to-end flow is the MVP demo.

42. Final Architecture Principle

SetuX MVP should be built around four ideas:

             SETUX
               │
       ┌───────┼────────┐
       │       │        │
       ▼       ▼        ▼
    IDENTITY CONSENT INTEROPERABILITY
       │       │        │
       └───────┼────────┘
               ▼
          WORKFLOW
               │
               ▼
        UNIFIED SERVICE

The key architectural statement is:

SetuX does not replace government systems. It acts as an interoperability and service orchestration layer between the citizen and existing systems.

For the SIH MVP, we prove that concept with one service: Scholarship and two roles: Citizen + Government Officer.

43. MVP Boundary
                    ┌─────────────────────────┐
                    │        SETUX MVP        │
                    │                         │
                    │ Authentication           │
                    │ Onboarding               │
                    │ Citizen Profile          │
                    │ Scholarship              │
                    │ Consent                   │
                    │ Connectors                │
                    │ Data Normalization        │
                    │ Verification             │
                    │ Workflow                 │
                    │ Government Review         │
                    │ Approval / Rejection     │
                    │ Tracking                 │
                    │ Audit                    │
                    └───────────┬─────────────┘
                                │
                         Connector Layer
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
          DigiLocker       Education API      Income API
           (Mock)             (Mock)             (Mock)