frontend-architecture.md
# SetuX — Frontend Low Level Design

Version: 1.0
Project: SetuX SIH MVP
Frontend Type: Web Application
Architecture: Modular React SPA
Primary Roles:
  - CITIZEN
  - GOVERNMENT_OFFICER

Backend:
  - Supabase Auth
  - Supabase PostgreSQL
  - Supabase Edge Functions
  - Supabase Storage

Primary MVP Service:
  - Scholarship Application

---

# 1. Purpose

This document defines the detailed frontend architecture of the
SetuX SIH MVP.

The frontend is responsible for:

- Authentication UI
- Role-based navigation
- Citizen onboarding
- Government officer onboarding
- Citizen dashboard
- Government dashboard
- Scholarship discovery
- Scholarship application
- Consent interaction
- Data retrieval status
- Application tracking
- Government review
- Application approval/rejection
- Notifications
- Loading and error states

The frontend must NOT contain core business authorization logic.

Authorization is ultimately enforced by the backend and Supabase RLS.

---

# 2. Frontend Technology

Recommended stack:

React
TypeScript
Vite
React Router
Tailwind CSS
shadcn/ui
Supabase JS Client
Zod
React Hook Form

Optional:

TanStack Query
Lucide Icons

---

# 3. High-Level Frontend Architecture

```text
                         SETUX FRONTEND
                              │
                ┌─────────────┴─────────────┐
                │                           │
           PUBLIC LAYER                PROTECTED LAYER
                │                           │
                ▼                           ▼
          Authentication              Role Router
                │                           │
                ▼                    ┌──────┴──────┐
          Onboarding               Citizen      Government
                                        │            │
                                        ▼            ▼
                                   Citizen UI    Officer UI
                                        │            │
                                        └──────┬─────┘
                                               │
                                               ▼
                                         API / Services
                                               │
                                               ▼
                                            Supabase
4. Application Structure

The application should be divided into:

src/
│
├── app/
│   ├── router/
│   ├── providers/
│   └── app.tsx
│
├── components/
│   ├── ui/
│   ├── forms/
│   ├── layout/
│   ├── application/
│   ├── consent/
│   └── common/
│
├── features/
│   ├── auth/
│   ├── onboarding/
│   ├── profile/
│   ├── services/
│   ├── applications/
│   ├── consent/
│   ├── government/
│   └── notifications/
│
├── pages/
│   ├── auth/
│   ├── citizen/
│   └── government/
│
├── services/
│   ├── supabase/
│   ├── api/
│   └── storage/
│
├── hooks/
│
├── lib/
│
├── types/
│
├── schemas/
│
└── utils/
5. Architectural Principle

The frontend follows:

Page
 ↓
Feature
 ↓
Service
 ↓
Supabase / Edge Function

Example:

ScholarshipPage
      │
      ▼
ApplicationFeature
      │
      ▼
applicationService
      │
      ▼
Edge Function
      │
      ▼
Supabase

The page should NOT directly contain Supabase queries.

6. Layer Responsibilities
Page Layer

Responsible for:

Layout
Page composition
Navigation
Connecting feature components

Example:

ScholarshipApplicationPage
Feature Layer

Responsible for:

Business-facing UI
Forms
Application interactions
Feature-specific state

Example:

ApplicationForm
ConsentPanel
ApplicationStatus
DocumentStatus
Service Layer

Responsible for:

API calls
Supabase interaction
Edge Function calls
Error conversion

Example:

applicationService.submitApplication()
Component Layer

Responsible for reusable UI.

Example:

Button
Modal
Card
Input
Badge
Table
Dialog
Stepper
7. Authentication Architecture

Authentication is handled by Supabase Auth.

User
 │
 ▼
Login Screen
 │
 ▼
Supabase Auth
 │
 ├── Failure
 │     ↓
 │   Error
 │
 └── Success
       │
       ▼
     Session
       │
       ▼
      JWT
       │
       ▼
  Fetch Profile
       │
       ▼
 Determine Role
8. Auth State

The application maintains:

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
};

The frontend should have a single authentication provider.

AuthProvider
     │
     ├── user
     ├── session
     ├── profile
     └── loading
9. AuthProvider

The AuthProvider is responsible for:

Initial session retrieval
Listening to authentication changes
Loading user profile
Exposing authentication state

Conceptual flow:

Application Start
       │
       ▼
AuthProvider
       │
       ▼
getSession()
       │
       ▼
Fetch Profile
       │
       ▼
Set Auth State
10. Role-Based Routing

The frontend contains three major routing levels:

PUBLIC
   │
   ├── /login
   └── /signup

ONBOARDING
   │
   ├── /onboarding/citizen
   └── /onboarding/government

PROTECTED
   │
   ├── /citizen/*
   └── /government/*
11. Route Architecture
/
│
├── /auth
│   └── /login
│
├── /onboarding
│   ├── /citizen
│   └── /government
│
├── /citizen
│   ├── /dashboard
│   ├── /services
│   ├── /services/:serviceId
│   ├── /applications
│   ├── /applications/:id
│   ├── /applications/:id/consent
│   └── /profile
│
└── /government
    ├── /dashboard
    ├── /applications
    ├── /applications/:id
    └── /profile
12. Route Guards

Three guards should exist:

ProtectedRoute
OnboardingRoute
RoleRoute

Flow:

                    Request Route
                         │
                         ▼
                 Is authenticated?
                    /         \
                  NO           YES
                  │             │
                  ▼             ▼
               /login     Onboarding done?
                              /       \
                            NO         YES
                            │           │
                            ▼           ▼
                       onboarding    Role check
                                         │
                                  ┌──────┴──────┐
                                  ▼             ▼
                               Citizen      Government
13. ProtectedRoute

Purpose:

Unauthenticated
      │
      ▼
Redirect /auth/login

Authenticated users continue.

14. OnboardingRoute

After login:

Authenticated
      │
      ▼
Profile loaded
      │
      ▼
onboarding_completed?
      │
 ┌────┴────┐
 NO        YES
 │          │
 ▼          ▼
Onboarding Dashboard
15. RoleRoute

Example:

/citizen/*

requires:

role = CITIZEN

and:

/government/*

requires:

role = GOVERNMENT_OFFICER

If the wrong role attempts access:

403 / Unauthorized
16. Important Security Rule

Frontend role checks are for:

Navigation
User experience
Preventing accidental access

They are NOT the actual security boundary.

Actual authorization occurs through:

Supabase Auth
+
Edge Functions
+
RLS
17. Citizen Application Flow
Citizen Login
     │
     ▼
Citizen Dashboard
     │
     ▼
Browse Services
     │
     ▼
Scholarship
     │
     ▼
View Requirements
     │
     ▼
Apply
     │
     ▼
Application Created
     │
     ▼
Data Collection
     │
     ▼
Consent
     │
     ▼
Fetch External Data
     │
     ▼
Review Information
     │
     ▼
Submit
     │
     ▼
Track Application
18. Citizen Dashboard

Dashboard contains:

┌─────────────────────────────────────┐
│ SetuX                               │
│                                     │
│ Welcome, Rahul                      │
│                                     │
│ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│ │ Active  │ │ Pending │ │Approved│ │
│ │   1     │ │    1    │ │   2    │ │
│ └─────────┘ └─────────┘ └────────┘ │
│                                     │
│ Available Services                  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Scholarship                     │ │
│ │ Apply using unified data        │ │
│ │                    [Apply]      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Recent Applications                 │
└─────────────────────────────────────┘
19. Services Page

The services page displays available government services.

Example:

Available Services

┌──────────────────────────────┐
│ National Scholarship         │
│ Education + Income based     │
│                              │
│ Requirements: 3             │
│                              │
│ [View Details]              │
└──────────────────────────────┘

The frontend gets services from:

GET /services
20. Service Details

The service details screen displays:

Scholarship

Description

Eligibility

Required Information

✓ Identity
✓ Education Record
✓ Income Certificate

Data sources

DigiLocker
Income System

[Start Application]
21. Application Creation

When the citizen clicks:

Start Application

Frontend calls:

POST /applications

Backend returns:

{
  "id": "APP001",
  "status": "DRAFT"
}

Frontend navigates:

/applications/APP001
22. Application Wizard

The scholarship application should use a step-based interface.

1 ───── 2 ───── 3 ───── 4 ───── 5

Profile → Consent → Data → Review → Submit

Step states:

✓ Completed
● Current
○ Pending
23. Step 1 — Profile

Display information already known by SetuX.

Personal Information

Name
Rahul Kumar

Government ID
XXXXXX1234

Phone
+91XXXXXXXXXX

Date of Birth
14 May 2002

The user should not repeatedly enter information that SetuX already
possesses.

This demonstrates the core SetuX value proposition.

24. Step 2 — Consent

Consent screen:

Information Required

SetuX needs access to:

┌─────────────────────────────┐
│ Education Record            │
│ Source: DigiLocker         │
│ Purpose: Scholarship       │
│                             │
│ [Allow Access]              │
└─────────────────────────────┘

User action:

Allow

calls:

POST /applications/:id/consents
25. Consent UI States
PENDING
   │
   ├── Allow
   │
   ▼
GRANTED
   │
   ▼
Retrieving data

or:

PENDING
   │
   └── Deny
         │
         ▼
      DENIED
26. Step 3 — Data Retrieval

The frontend should show the interoperability process.

Retrieving your information

✓ Identity information
✓ Education record
● Income information
○ Verification

This is an important SIH demonstration screen.

It visually communicates what SetuX is doing.

27. Data Source UI

Example:

Education Record

Source
DigiLocker

Status
✓ Retrieved

Verification
✓ Verified

Income:

Income Certificate

Source
Income Department

Status
● Retrieving
28. Step 4 — Review

Display normalized information:

Application Information

Personal
✓ Verified

Education
B.Tech
82%
2025
✓ Verified

Income
₹2,40,000
✓ Verified

Documents
3 / 3 available

User can inspect the information before submission.

29. Step 5 — Submit

Before submission:

Application Ready

✓ Required information available
✓ Consent granted
✓ Documents available
✓ Data verified

[Submit Application]

Frontend calls:

POST /applications/:id/submit
30. Application Tracking

Citizen should be able to see:

Application #STX-APP-001

Scholarship

Submitted
     │
     ▼
Under Review
     │
     ▼
Decision

Detailed timeline:

✓ Application Created
✓ Information Retrieved
✓ Verification Completed
✓ Application Submitted
● Government Review
○ Decision
31. Government Dashboard

Government dashboard is completely separate from the citizen dashboard.

┌─────────────────────────────────────┐
│ SetuX Government Portal             │
│                                     │
│ Overview                            │
│                                     │
│ ┌────────┐ ┌────────┐ ┌──────────┐ │
│ │Pending │ │Approved│ │ Rejected │ │
│ │   12   │ │   42   │ │    4     │ │
│ └────────┘ └────────┘ └──────────┘ │
│                                     │
│ Applications                        │
│                                     │
│ STX-001  Rahul Kumar  Under Review │
│ STX-002  Priya Singh  Under Review │
└─────────────────────────────────────┘
32. Government Application List

Table:

Application ID
Citizen
Service
Submitted
Status
Action

Example:

STX-001
Rahul Kumar
Scholarship
28 Aug
UNDER_REVIEW
[Review]
33. Government Review Screen
Application #STX-001

Citizen Information
────────────────────

Name
Rahul Kumar

Education
B.Tech

Percentage
82%

Income
₹2,40,000

Verification
✓ Identity
✓ Education
✓ Income

Documents
✓ Education Certificate
✓ Income Certificate

────────────────────

[Reject]      [Approve]
34. Approval Flow

Government clicks:

Approve

Frontend:

Confirmation Dialog
        │
        ▼
POST /government/applications/:id/approve
        │
        ▼
Success
        │
        ▼
Application status = APPROVED
35. Rejection Flow

Government clicks:

Reject

Modal:

Reject Application

Reason

[________________________]

[Cancel] [Reject Application]

Request:

{
  "reason": "Income criteria not satisfied"
}
36. Request Information

Government can request missing information.

Request Information

Message

[Please provide the latest
income certificate.]

[Send Request]

Application status becomes:

REQUESTED_INFO

Citizen receives notification.

37. Frontend State Management

For MVP, avoid excessive global state.

Global state:

Auth
Session
Profile

Feature state:

Applications
Consent
Services
Government Review

Server state should preferably be managed with:

TanStack Query

or a lightweight custom approach if the team wants fewer dependencies.

38. Recommended State Structure
Global
│
└── AuthContext
      ├── session
      ├── user
      └── profile

Server State
│
├── services
├── applications
├── requirements
├── consents
└── notifications

Local UI State
│
├── modals
├── forms
├── selected application
└── filters
39. API Service Layer

Example:

services/
│
├── auth.service.ts
├── profile.service.ts
├── service.service.ts
├── application.service.ts
├── consent.service.ts
├── government.service.ts
└── notification.service.ts
40. Application Service

Conceptual API:

applicationService = {
  create(),
  getById(),
  getMyApplications(),
  getRequirements(),
  retrieveData(),
  submit()
}

Government:

governmentService = {
  getApplications(),
  getApplication(),
  approve(),
  reject(),
  requestInformation()
}
41. Type Architecture

Types should mirror backend contracts.

types/
│
├── auth.ts
├── profile.ts
├── service.ts
├── application.ts
├── consent.ts
├── document.ts
├── government.ts
└── notification.ts

Example:

type ApplicationStatus =
  | "DRAFT"
  | "DATA_COLLECTION"
  | "CONSENT_PENDING"
  | "DATA_RETRIEVAL"
  | "VERIFICATION"
  | "READY_FOR_SUBMISSION"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "REQUESTED_INFO"
  | "APPROVED"
  | "REJECTED";
42. Form Architecture

Use:

React Hook Form
+
Zod

Flow:

User Input
    │
    ▼
React Hook Form
    │
    ▼
Zod Validation
    │
    ├── Invalid
    │     ↓
    │   Show Error
    │
    └── Valid
          ↓
       API Call
43. Client Validation vs Server Validation

Frontend validation:

Required fields
Format
Length
Basic input correctness

Backend validation:

Authorization
Business rules
Role
Application state
Consent
Eligibility
Data integrity

Frontend validation must never be treated as security.

44. Error Handling Architecture

All API calls should use a common error format.

API Error
    │
    ▼
Service Layer
    │
    ▼
Normalize Error
    │
    ▼
UI
    │
    ▼
Toast / Inline Error

Example:

CONSENT_REQUIRED

becomes:

Please provide consent before continuing.
45. Loading States

Every asynchronous operation should have a visible state.

Example:

Retrieving education record...

instead of leaving the user wondering whether the application is stuck.

Important loading states:

Login
Onboarding
Application creation
Consent
Data retrieval
Verification
Submission
Government review
Approval
Rejection
46. Empty States

Example:

No applications yet.

Start your first government service
application.

[Explore Services]

Government:

No pending applications.

All applications have been reviewed.
47. Error States

Example:

We couldn't retrieve your education record.

The external service may be temporarily unavailable.

[Try Again]

Do not expose internal errors such as:

500
Postgres connection failed
JWT exception

to users.

48. Connector Progress UI

This is a key SetuX UI component.

Data Sources

DigiLocker
✓ Connected
✓ Education record retrieved

Income Department
● Retrieving

SetuX Verification
○ Waiting

This makes the interoperability layer visible during the SIH demo.

49. Reusable Components

Recommended components:

AppShell
Navbar
Sidebar
PageHeader

Button
Input
Select
Modal
Dialog
Toast
Badge
Card
Table

StatusBadge
ApplicationTimeline
RequirementCard
ConsentCard
DataSourceCard
VerificationBadge
DocumentCard
ApprovalDialog
RejectionDialog
50. Application Components
ApplicationWizard
ApplicationStepper
ApplicationSummary
ApplicationTimeline
ApplicationStatus
RequirementList
RequirementCard
ConsentPanel
DataRetrievalPanel
VerificationPanel
DocumentList
ApplicationReview
51. Citizen Feature Structure
features/applications/
│
├── components/
│   ├── ApplicationWizard.tsx
│   ├── ApplicationStepper.tsx
│   ├── ApplicationSummary.tsx
│   ├── ConsentPanel.tsx
│   ├── DataRetrieval.tsx
│   └── ApplicationTimeline.tsx
│
├── hooks/
│   ├── useApplication.ts
│   ├── useApplications.ts
│   └── useApplicationRequirements.ts
│
├── application.service.ts
└── application.types.ts
52. Government Feature Structure
features/government/
│
├── components/
│   ├── ApplicationTable.tsx
│   ├── ApplicationReview.tsx
│   ├── ApprovalDialog.tsx
│   ├── RejectionDialog.tsx
│   └── RequestInfoDialog.tsx
│
├── hooks/
│   ├── useGovernmentApplications.ts
│   └── useGovernmentApplication.ts
│
├── government.service.ts
└── government.types.ts
53. Auth Feature Structure
features/auth/
│
├── components/
│   ├── LoginForm.tsx
│   └── AuthLayout.tsx
│
├── hooks/
│   └── useAuth.ts
│
├── auth.service.ts
└── auth.types.ts
54. Onboarding Feature
features/onboarding/
│
├── components/
│   ├── CitizenOnboardingForm.tsx
│   └── GovernmentOnboardingForm.tsx
│
├── onboarding.service.ts
├── onboarding.schemas.ts
└── onboarding.types.ts
55. Supabase Client

Only one Supabase client should normally be created.

services/supabase/
│
└── client.ts

Conceptually:

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
56. API Communication

For normal authenticated data:

Frontend
   │
   ▼
Supabase Client
   │
   ▼
PostgreSQL + RLS

For business operations:

Frontend
   │
   ▼
Edge Function
   │
   ▼
Business Logic
   │
   ▼
PostgreSQL

This distinction is important.

57. When to Use Direct Supabase Queries

Safe read operations can use Supabase directly where appropriate.

Example:

Get my profile
Get my applications
Get my notifications

RLS protects the data.

58. When to Use Edge Functions

Use Edge Functions for operations involving business rules.

Examples:

Create application
Retrieve external data
Grant consent
Submit application
Approve application
Reject application
Request information
59. Complete Frontend → Backend Flow
                     FRONTEND
                         │
                         ▼
                   React Router
                         │
                         ▼
                   Page Component
                         │
                         ▼
                  Feature Component
                         │
                         ▼
                     Hook
                         │
                         ▼
                    Service
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
       Supabase Client        Edge Function
              │                     │
              │                     ▼
              │                Business Logic
              │                     │
              └──────────┬──────────┘
                         ▼
                    PostgreSQL
                         │
                         ▼
                       RLS
                         │
                         ▼
                      Response
                         │
                         ▼
                    Service
                         │
                         ▼
                       Hook
                         │
                         ▼
                   React UI
60. Authentication Flow
             LOGIN SCREEN
                   │
                   ▼
             Auth Service
                   │
                   ▼
             Supabase Auth
                   │
                   ▼
                 Session
                   │
                   ▼
              AuthProvider
                   │
                   ▼
             Fetch Profile
                   │
          ┌────────┴────────┐
          ▼                 ▼
       CITIZEN          GOVERNMENT
          │                 │
          ▼                 ▼
 Citizen Dashboard    Government Dashboard
61. Citizen Scholarship Flow
Citizen Dashboard
        │
        ▼
Services
        │
        ▼
Scholarship
        │
        ▼
Create Application
        │
        ▼
Application Wizard
        │
        ▼
Consent
        │
        ▼
Connector Retrieval
        │
        ▼
Normalization
        │
        ▼
Verification
        │
        ▼
Review
        │
        ▼
Submit
        │
        ▼
Tracking
62. Government Flow
Government Login
       │
       ▼
Government Dashboard
       │
       ▼
Application Queue
       │
       ▼
Select Application
       │
       ▼
Review Unified Data
       │
       ├──────────────┐
       ▼              ▼
    APPROVE         REJECT
       │              │
       └──────┬───────┘
              ▼
         Notification
              │
              ▼
           Citizen
63. Application State → UI

The frontend maps backend status to UI.

DRAFT
  ↓
Continue Application

CONSENT_PENDING
  ↓
Give Consent

DATA_RETRIEVAL
  ↓
Retrieving Information

VERIFICATION
  ↓
Verifying Information

READY_FOR_SUBMISSION
  ↓
Review & Submit

SUBMITTED
  ↓
Submitted

UNDER_REVIEW
  ↓
Under Government Review

REQUESTED_INFO
  ↓
Action Required

APPROVED
  ↓
Approved

REJECTED
  ↓
Rejected
64. UI Architecture for Demo

The SIH demo should make the SetuX concept immediately visible.

Citizen:

Login
  ↓
Onboarding
  ↓
Dashboard
  ↓
Scholarship
  ↓
Consent
  ↓
Data Integration
  ↓
Unified Review
  ↓
Submit
  ↓
Track

Government:

Login
  ↓
Dashboard
  ↓
Application Queue
  ↓
Unified Application
  ↓
Verify
  ↓
Approve / Reject
65. Responsive Design

The application should support:

Desktop
Tablet
Mobile

Priority:

Desktop > Tablet > Mobile

because the SIH demonstration will most likely happen on a laptop/
desktop.

However, citizen screens should remain mobile-friendly.

66. Accessibility

Minimum requirements:

Keyboard navigation
Visible focus states
Proper labels
Semantic HTML
Readable contrast
Error messages
Accessible dialogs
67. Performance

MVP performance goals:

Fast initial load
Lazy load government dashboard
Cache services
Cache application lists
Avoid unnecessary API calls
Use optimistic UI only where safe

Do not over-optimize before the core flow works.

68. Environment Configuration

Frontend environment:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

Never expose:

SUPABASE_SERVICE_ROLE_KEY

to the frontend.

69. Frontend Security

Frontend must:

Never store service-role keys
Never trust role values from local storage
Never decide authorization
Never directly approve applications
Never directly modify protected application status
Never expose secrets
Avoid storing sensitive data unnecessarily
Use HTTPS in deployment
70. Local Storage

Avoid storing sensitive citizen information in localStorage.

Safe examples:

Theme
UI preferences
Non-sensitive temporary settings

Authentication session management should follow Supabase's recommended
client-side session handling.

71. Notification Architecture

Citizen notification UI:

Navbar
  │
  ▼
Bell Icon
  │
  ▼
Notifications

Example:

✓ Scholarship application submitted
✓ Application is under review
✓ Application approved
72. Frontend Folder — Final
src/
│
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
│
├── pages/
│   ├── auth/
│   │   └── LoginPage.tsx
│   │
│   ├── onboarding/
│   │   ├── CitizenOnboardingPage.tsx
│   │   └── GovernmentOnboardingPage.tsx
│   │
│   ├── citizen/
│   │   ├── DashboardPage.tsx
│   │   ├── ServicesPage.tsx
│   │   ├── ServiceDetailsPage.tsx
│   │   ├── ApplicationsPage.tsx
│   │   ├── ApplicationPage.tsx
│   │   └── ProfilePage.tsx
│   │
│   └── government/
│       ├── DashboardPage.tsx
│       ├── ApplicationsPage.tsx
│       ├── ApplicationReviewPage.tsx
│       └── ProfilePage.tsx
│
├── features/
│   ├── auth/
│   ├── onboarding/
│   ├── profile/
│   ├── services/
│   ├── applications/
│   ├── consent/
│   ├── government/
│   └── notifications/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   └── common/
│
├── services/
│   ├── supabase/
│   ├── auth.service.ts
│   ├── profile.service.ts
│   ├── service.service.ts
│   ├── application.service.ts
│   ├── consent.service.ts
│   ├── government.service.ts
│   └── notification.service.ts
│
├── hooks/
│
├── schemas/
│
├── types/
│
├── utils/
│
└── styles/
73. Final Frontend Architecture
                         SETUX WEB APP
                              │
                              ▼
                         React + TS
                              │
                    ┌─────────┴─────────┐
                    │                   │
                AuthProvider        Router
                    │                   │
                    │          ┌────────┴────────┐
                    │          │                 │
                    │       Citizen          Government
                    │          │                 │
                    │          ▼                 ▼
                    │      Dashboard         Dashboard
                    │          │                 │
                    │          ▼                 ▼
                    │    Application         Review
                    │       Flow               Flow
                    │          │                 │
                    └──────────┬─────────────────┘
                               ▼
                         Feature Layer
                               │
                               ▼
                            Hooks
                               │
                               ▼
                           Services
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             Supabase Client       Edge Functions
                    │                     │
                    │                     ▼
                    │               Business Logic
                    │                     │
                    └──────────┬──────────┘
                               ▼
                          PostgreSQL
                               │
                               ▼
                              RLS
74. Most Important Rule

The SetuX frontend should be treated as a presentation and interaction
layer, not the authority.

The architecture is:

Frontend
   │
   │ "I want to submit this application"
   ▼
Backend
   │
   │ "Is this user allowed?"
   ▼
Authorization
   │
   │ "Is the application valid?"
   ▼
Business Logic
   │
   │ "Are all requirements satisfied?"
   ▼
Database
   │
   ▼
Result
   │
   ▼
Frontend

This gives SetuX a clean separation between:

UI → Feature → Service → Backend → Database

and makes the prototype easy to extend later if the monolith eventually gets split into independent services.

75. MVP Implementation Priority

Do not build every frontend feature at once.

Build the actual demo path first:

PHASE 1
Authentication
      ↓
Role Detection
      ↓
Citizen / Government Routing

PHASE 2
Citizen Onboarding
      ↓
Government Onboarding

PHASE 3
Citizen Dashboard
      ↓
Scholarship Service
      ↓
Application Creation

PHASE 4
Consent
      ↓
Mock DigiLocker
      ↓
Mock Income API
      ↓
Data Normalization

PHASE 5
Application Review
      ↓
Submit
      ↓
Tracking

PHASE 6
Government Dashboard
      ↓
Review
      ↓
Approve / Reject

PHASE 7
Notifications
      ↓
Audit / Polish

The single end-to-end flow you need working for the SIH prototype is:

CITIZEN
  │
  ├── Login
  ├── Onboard
  ├── Open Scholarship
  ├── Apply
  ├── Give Consent
  ├── SetuX retrieves data
  ├── Review unified information
  └── Submit
             │
             ▼
       SETUX WORKFLOW
             │
             ▼
       GOVERNMENT PORTAL
             │
             ├── Review
             ├── Verify
             └── Approve / Reject
                    │
                    ▼
                 CITIZEN
                    │
                    ▼
               Final Status