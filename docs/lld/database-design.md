SetuX — Database Design (LLD)

Version: 1.0
Project: SetuX SIH MVP
Database: Supabase PostgreSQL
Scope: Scholarship interoperability prototype
Architecture: Modular monolith

1. Purpose

This document defines the database-level design for the SetuX SIH MVP.

The database supports:

Authentication
    ↓
Role-based profile
    ↓
Citizen / Government onboarding
    ↓
Service discovery
    ↓
Scholarship application
    ↓
Consent
    ↓
Mock external data retrieval
    ↓
Normalized application data
    ↓
Government review
    ↓
Approve / Reject / Request Information
    ↓
Citizen tracking
    ↓
Notifications + Audit

The MVP focuses on one scholarship service, while keeping the schema extensible for additional government services.

2. Database Stack

Supabase PostgreSQL

Supabase Auth

PostgreSQL Row Level Security (RLS)

UUID primary keys

TIMESTAMPTZ timestamps

JSONB for flexible external payloads

Supabase Auth owns authentication credentials. SetuX stores application/business profile data.

3. Authentication Data Separation

auth.users
    │
    │ 1 : 1
    ▼
profiles

profiles.id should equal the Supabase Auth user's UUID.

Do not duplicate passwords or authentication credentials in application tables.

4. Core ER Diagram

┌──────────────────┐
│   auth.users     │
│  Supabase Auth   │
└────────┬─────────┘
         │ 1:1
         ▼
┌──────────────────┐
│     profiles     │
├──────────────────┤
│ id PK            │
│ role             │
│ full_name        │
│ phone            │
│ onboarding_done  │
└───────┬──────────┘
        │
        ├──────────────────┐
        ▼                  ▼
┌────────────────┐  ┌──────────────────┐
│citizen_profiles│  │officer_profiles  │
└───────┬────────┘  └────────┬─────────┘
        │                    │
        │ 1:N                │
        ▼                    │
┌──────────────────┐         │
│  applications    │◄────────┘
├──────────────────┤
│ id PK            │
│ citizen_id FK    │
│ service_id FK    │
│ status           │
└───────┬──────────┘
        │
        ├───────────────┐
        ▼               ▼
┌──────────────┐  ┌──────────────────┐
│  consents    │  │ application_data │
└──────┬───────┘  └─────────┬────────┘
       │                    │
       ▼                    │
┌──────────────────┐        │
│  data_sources    │◄───────┘
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ data_retrievals  │
└──────────────────┘

applications
     │
     ├──────────────► application_reviews
     ├──────────────► application_events
     ├──────────────► notifications
     └──────────────► audit_logs

services
     │
     └──────────────► service_requirements

5. Tables

5.1 profiles

Common application profile.

Column

Type

Constraints

id

UUID

PK, references auth.users(id)

role

ENUM

NOT NULL

full_name

TEXT

NOT NULL

phone

TEXT

NOT NULL

onboarding_completed

BOOLEAN

DEFAULT false

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

Roles:

CITIZEN
GOVERNMENT_OFFICER

5.2 citizen_profiles

Citizen-specific data.

Column

Type

Constraints

user_id

UUID

PK/FK → profiles.id

government_id

TEXT

UNIQUE

date_of_birth

DATE

nullable

address

TEXT

nullable

state

TEXT

nullable

district

TEXT

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

For the SIH prototype, use a dummy government ID, not a real Aadhaar number.

5.3 officer_profiles

Government employee data.

Column

Type

Constraints

user_id

UUID

PK/FK → profiles.id

employee_id

TEXT

UNIQUE

department

TEXT

NOT NULL

designation

TEXT

NOT NULL

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

Example:

employee_id: GOV-001
department: Department of Education
designation: Scholarship Officer

5.4 services

Government services exposed through SetuX.

Column

Type

Constraints

id

UUID

PK

name

TEXT

NOT NULL

code

TEXT

UNIQUE

description

TEXT

NOT NULL

department

TEXT

NOT NULL

active

BOOLEAN

DEFAULT true

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

MVP seed:

National Scholarship
SCHOLARSHIP_001

5.5 service_requirements

Defines information required by a service.

Column

Type

Constraints

id

UUID

PK

service_id

UUID

FK → services.id

name

TEXT

NOT NULL

description

TEXT

nullable

data_source_id

UUID

FK → data_sources.id

required

BOOLEAN

DEFAULT true

display_order

INTEGER

NOT NULL

created_at

TIMESTAMPTZ

DEFAULT now()

Scholarship example:

Identity
Education Record
Income Information

5.6 applications

Central business entity.

Column

Type

Constraints

id

UUID

PK

application_number

TEXT

UNIQUE

citizen_id

UUID

FK → profiles.id

service_id

UUID

FK → services.id

status

ENUM

NOT NULL

submitted_at

TIMESTAMPTZ

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

5.7 Application Status

DRAFT
CONSENT_PENDING
DATA_RETRIEVAL
VERIFICATION
READY_FOR_SUBMISSION
SUBMITTED
UNDER_REVIEW
REQUESTED_INFO
APPROVED
REJECTED

The database is the source of truth for application status.

Backend business logic must validate status transitions.

5.8 application_data

Normalized data used by an application.

Column

Type

Constraints

id

UUID

PK

application_id

UUID

FK → applications.id

field_name

TEXT

NOT NULL

field_value

JSONB

NOT NULL

source_id

UUID

FK → data_sources.id

verification_status

ENUM

NOT NULL

verified_at

TIMESTAMPTZ

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

updated_at

TIMESTAMPTZ

DEFAULT now()

Example:

field_name: education_percentage
field_value: 82
source: DigiLocker Mock
verification_status: VERIFIED

Why JSONB?

External systems may return different structures. JSONB allows flexible source payloads while the core SetuX entities remain strongly typed.

5.9 Verification Status

PENDING
VERIFIED
FAILED
NOT_AVAILABLE

5.10 consents

Records citizen consent for accessing information.

Column

Type

Constraints

id

UUID

PK

application_id

UUID

FK → applications.id

citizen_id

UUID

FK → profiles.id

data_source_id

UUID

FK → data_sources.id

purpose

TEXT

NOT NULL

status

ENUM

NOT NULL

granted_at

TIMESTAMPTZ

nullable

revoked_at

TIMESTAMPTZ

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

Consent is therefore tied to:

Citizen
+
Application
+
Data Source
+
Purpose

5.11 Consent Status

PENDING
GRANTED
DENIED
REVOKED

5.12 data_sources

Systems connected to SetuX.

For the MVP, these are simulated systems.

Column

Type

Constraints

id

UUID

PK

name

TEXT

NOT NULL

code

TEXT

UNIQUE

type

ENUM

NOT NULL

active

BOOLEAN

DEFAULT true

created_at

TIMESTAMPTZ

DEFAULT now()

Example:

DigiLocker Mock
Income Department Mock
Education Department Mock

5.13 Data Source Type

DIGILOCKER
GOVERNMENT_API
LEGACY_SYSTEM
MOCK_API

For the SIH prototype, DIGILOCKER and MOCK_API are sufficient.

5.14 data_retrievals

Tracks external-system retrieval attempts.

Column

Type

Constraints

id

UUID

PK

application_id

UUID

FK → applications.id

data_source_id

UUID

FK → data_sources.id

consent_id

UUID

FK → consents.id

status

ENUM

NOT NULL

request_reference

TEXT

nullable

response_metadata

JSONB

nullable

error_code

TEXT

nullable

started_at

TIMESTAMPTZ

nullable

completed_at

TIMESTAMPTZ

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

Retrieval status:

PENDING
IN_PROGRESS
SUCCESS
FAILED
TIMEOUT

This supports UI such as:

DigiLocker Mock
✓ Retrieved

Income API
✓ Retrieved

Legacy Education System
✕ Failed

5.15 application_reviews

Government review history.

Column

Type

Constraints

id

UUID

PK

application_id

UUID

FK → applications.id

officer_id

UUID

FK → profiles.id

action

ENUM

NOT NULL

remarks

TEXT

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

Actions:

APPROVED
REJECTED
REQUESTED_INFO

Do not overwrite historical review decisions.

5.16 application_events

Application lifecycle timeline.

Column

Type

Constraints

id

UUID

PK

application_id

UUID

FK → applications.id

event_type

TEXT

NOT NULL

actor_id

UUID

FK → profiles.id

metadata

JSONB

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

Examples:

APPLICATION_CREATED
CONSENT_GRANTED
DATA_RETRIEVED
VERIFICATION_COMPLETED
APPLICATION_SUBMITTED
APPLICATION_REVIEWED
APPLICATION_APPROVED
APPLICATION_REJECTED
INFO_REQUESTED

This powers the citizen timeline.

5.17 notifications

User-facing notifications.

Column

Type

Constraints

id

UUID

PK

user_id

UUID

FK → profiles.id

application_id

UUID

nullable FK

title

TEXT

NOT NULL

message

TEXT

NOT NULL

type

TEXT

NOT NULL

read

BOOLEAN

DEFAULT false

created_at

TIMESTAMPTZ

DEFAULT now()

5.18 audit_logs

Security-sensitive actions.

Column

Type

Constraints

id

UUID

PK

actor_id

UUID

FK → profiles.id

action

TEXT

NOT NULL

entity_type

TEXT

NOT NULL

entity_id

UUID

nullable

metadata

JSONB

nullable

created_at

TIMESTAMPTZ

DEFAULT now()

Examples:

LOGIN
APPLICATION_CREATED
CONSENT_GRANTED
APPLICATION_SUBMITTED
APPLICATION_APPROVED
APPLICATION_REJECTED
PROFILE_UPDATED

Audit logs should be append-only.

6. Relationship Summary

auth.users
     │
     ▼
profiles
     │
     ├── citizen_profiles
     └── officer_profiles

profiles
     │
     ▼
applications
     │
     ├── consents ───────► data_sources
     ├── application_data ─► data_sources
     ├── data_retrievals ──► data_sources
     ├── application_reviews
     └── application_events

services
     │
     └── service_requirements ──► data_sources

profiles
     ├── notifications
     └── audit_logs

7. RLS Design

RLS is mandatory.

Citizen permissions

A citizen can:

READ own profile
UPDATE own profile

READ own applications
CREATE own applications
UPDATE own draft applications

READ own consents
CREATE own consents

READ own application data
READ own retrieval status

READ own notifications
UPDATE own notifications as read

A citizen cannot:

READ another citizen's application
APPROVE an application
REJECT an application
Directly change protected application status
READ internal audit logs

Government officer permissions

A government officer can:

READ applications relevant to their department
READ required application data
READ consent status
CREATE review records through authorized backend operations
APPROVE applications through backend operations
REJECT applications through backend operations
REQUEST INFORMATION

8. Security Boundary

Frontend route protection is only for UX.

Actual authorization:

Frontend
   │
   ▼
Supabase Auth JWT
   │
   ▼
RLS / Edge Function
   │
   ├── Allowed
   │
   └── Denied

Never trust:

React role checks
localStorage role
client-side validation

as the security boundary.

9. Indexes

Create indexes for:

profiles(role)

applications(citizen_id)

applications(service_id)

applications(status)

applications(created_at)

applications(application_number)

consents(application_id)

consents(citizen_id)

data_retrievals(application_id)

application_reviews(application_id)

application_events(application_id)

notifications(user_id, read)

audit_logs(actor_id)

audit_logs(entity_id)

For the government dashboard:

applications(status, service_id, created_at)

is especially useful.

10. Unique Constraints

profiles.id
citizen_profiles.user_id
citizen_profiles.government_id
officer_profiles.user_id
officer_profiles.employee_id

services.code

data_sources.code

applications.application_number

11. Timestamp Rules

Use:

TIMESTAMPTZ

for all timestamps.

Mutable tables should contain:

created_at
updated_at

where appropriate.

12. Application Number

Use UUID internally:

id:
550e8400-e29b-41d4-a716-446655440000

Use a human-readable number in the UI:

STX-2026-000001

The UUID is the primary key; the application number is a unique display identifier.

13. Transaction Strategy

Operations involving multiple critical writes should be atomic.

Example:

Submit Application

BEGIN
    Update application status
    Create application event
    Create audit log
    Create notification
COMMIT

If a critical operation fails:

ROLLBACK

These operations should be implemented server-side through Edge Functions/database transactions rather than relying on multiple client-side writes.

14. Mock Interoperability Architecture

                    SetuX
                      │
             ┌────────┼────────┐
             ▼        ▼        ▼
        DigiLocker  Income   Education
          Mock       Mock       Mock
             │        │          │
             └────────┼──────────┘
                      ▼
                 Normalization
                      │
                      ▼
               application_data

The external connector can later be replaced:

Mock API
   ↓
Real Government API

without changing the core application model.

15. Document Strategy

SetuX should not become a document-storage platform.

For the MVP:

SetuX
   │
   ├── stores document/data metadata and status
   │
   └── retrieves information from mock/DigiLocker-style sources

If actual storage becomes necessary later:

Supabase Storage
       │
       ▼
document metadata table

Do not duplicate government documents unnecessarily.

16. Citizen Data Flow

Citizen
   │
   ▼
Supabase Auth
   │
   ▼
profiles
   │
   ▼
services
   │
   ▼
applications
   │
   ▼
consents
   │
   ▼
data_retrievals
   │
   ▼
application_data
   │
   ▼
verification
   │
   ▼
submit
   │
   ▼
government review

17. Government Data Flow

Government Officer
       │
       ▼
Supabase Auth
       │
       ▼
officer_profiles
       │
       ▼
Government Dashboard
       │
       ▼
applications
       │
       ▼
application_data
       │
       ▼
Review
       │
   ┌───┴────┐
   ▼        ▼
Approve   Reject
   │        │
   └───┬────┘
       ▼
application_reviews
       │
       ▼
application_events
       │
       ▼
notifications
       │
       ▼
Citizen

18. MVP Seed Data

Initially seed:

1 Service
3 Data Sources
3 Service Requirements

Service

National Scholarship

Data Sources

DigiLocker Mock
Income Department Mock
Education Department Mock

Requirements

Identity
Education Record
Income Information

19. What NOT to Store

Do not store real:

Aadhaar numbers
Aadhaar authentication credentials
Bank passwords
External API secrets
Supabase service-role key

Use simulated data for the SIH demonstration.

20. MVP Tables

Implement these tables:

1. profiles
2. citizen_profiles
3. officer_profiles
4. services
5. service_requirements
6. applications
7. application_data
8. consents
9. data_sources
10. data_retrievals
11. application_reviews
12. application_events
13. notifications
14. audit_logs

Do not add microservice-oriented tables or unnecessary document infrastructure until the MVP requires them.

21. Implementation Order

STEP 1
Supabase Auth
      ↓
STEP 2
profiles
      ↓
STEP 3
citizen_profiles
officer_profiles
      ↓
STEP 4
services
service_requirements
      ↓
STEP 5
data_sources
      ↓
STEP 6
applications
      ↓
STEP 7
consents
      ↓
STEP 8
data_retrievals
application_data
      ↓
STEP 9
application_reviews
      ↓
STEP 10
application_events
      ↓
STEP 11
notifications
      ↓
STEP 12
audit_logs
      ↓
STEP 13
RLS policies
      ↓
STEP 14
Indexes
      ↓
STEP 15
Scholarship seed data

22. Definition of Done

Supabase project configured

Auth enabled

Profiles table created

Citizen profile created

Government profile created

Roles implemented

Services created

Scholarship requirements created

Applications created

Status transitions defined

Consent records created

Data sources created

Retrieval records created

Normalized application data created

Government review records created

Application events created

Notifications created

Audit logs created

RLS policies implemented

Indexes created

Seed data loaded

Citizen isolation tested

Government access tested

Unauthorized operations rejected

23. Final Database Architecture

                       SUPABASE
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
        Supabase Auth             PostgreSQL
             │                         │
             ▼                         ▼
        auth.users                   RLS
             │                         │
             ▼                         │
         profiles ◄────────────────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
   citizen      officer
   profile      profile
       │           │
       └─────┬─────┘
             ▼
       applications
             │
      ┌──────┼──────────┐
      ▼      ▼          ▼
  consents  data     retrievals
      │      │          │
      └──────┼──────────┘
             ▼
        normalized data
             │
             ▼
        government review
             │
        ┌────┴────┐
        ▼         ▼
     approve    reject
        │         │
        └────┬────┘
             ▼
      events + notifications
             │
             ▼
           citizen

Final Principle

The SetuX database is not a replacement for government databases.

It is the transaction, workflow, consent, normalized-data, and audit layer that connects the citizen experience with existing government systems.

Government Systems
       │
       ▼
SetuX Connectors
       │
       ▼
Data Normalization
       │
       ▼
SetuX Application DB
       │
       ▼
Unified Workflow
       │
       ├── Citizen
       │
       └── Government Officer

The scholarship application is the primary business object. Consent, interoperability, verification, workflow, audit, and notifications surround that object.