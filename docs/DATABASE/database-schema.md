SetuX — Database Schema

Version: 1.0
Project: SetuX SIH MVP
Database: PostgreSQL via Supabase
Architecture: Modular Monolith
Primary Module: Scholarship Application
Schema: public

1. Purpose

This document defines the database schema for the SetuX SIH prototype.

The database must support the complete MVP flow:

Authentication
      ↓
User Profile
      ↓
Onboarding
      ↓
Scholarship Application
      ↓
Consent
      ↓
Data Retrieval
      ↓
Verification
      ↓
Workflow
      ↓
Government Review
      ↓
Approval / Rejection
      ↓
Notifications + Audit

The database is designed around one principle:

SetuX stores the state and coordination information required to connect services; it does not become a duplicate repository for every external government's data or document.

2. Database Technology

The MVP uses:

PostgreSQL
    +
Supabase

Supabase provides:

PostgreSQL database

Authentication

Row Level Security

Database functions

Realtime capabilities where required

Storage where required

The frontend must never receive the Supabase service-role key.

3. High-Level Entity Relationship

                         auth.users
                             │
                             │ 1:1
                             ▼
                         profiles
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
       citizen_profiles          government_profiles
                │                         │
                │                         ▼
                │                  organizations
                │                         │
                ▼                         ▼
          applications              departments
                │
       ┌────────┼─────────┬───────────────┐
       │        │         │               │
       ▼        ▼         ▼               ▼
 application  consents  workflow      application
   data                 executions      events
       │                  │
       ▼                  ▼
 data_retrievals       verifications
       │
       ▼
 data_sources

applications
       │
       ▼
application_reviews
       │
       ▼
notifications

All important actions
       │
       ▼
audit_logs

4. Core Tables

The MVP database contains the following primary tables:

profiles
citizen_profiles
government_profiles
organizations
departments

services
service_requirements

applications
application_data
application_events

consents
consent_records

data_sources
data_retrievals

workflow_definitions
workflow_steps
workflow_executions

verifications

application_reviews

notifications
audit_logs

Some tables can be simplified during the first implementation, but the logical boundaries should remain clear.

5. Relationship Overview

Parent

Child

Relationship

auth.users

profiles

1:1

profiles

citizen_profiles

1:0..1

profiles

government_profiles

1:0..1

organizations

departments

1

profiles

applications

1

services

applications

1

applications

application_data

1

applications

consents

1

applications

data_retrievals

1

applications

workflow_executions

1

applications

verifications

1

applications

application_reviews

1

applications

application_events

1

applications

notifications

1

profiles

audit_logs

1

6. UUID Strategy

Use UUIDs for internal identifiers.

Example:

550e8400-e29b-41d4-a716-446655440000

Primary keys:

profiles.id
applications.id
services.id
organizations.id

Use a separate human-readable identifier for applications:

STX-2026-000001

Never expose sequential database IDs as the primary public identifier.

7. Common Column Conventions

Most mutable tables should use:

id
created_at
updated_at

Recommended timestamp:

TIMESTAMPTZ

Example:

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

Use UTC internally.

8. ENUM Strategy

For stable finite states, PostgreSQL enums can be used.

For the MVP:

user_role
onboarding_status
application_status
verification_status
workflow_status
consent_status
review_decision

However, values that are expected to change frequently should preferably be represented by configuration/reference tables rather than database enums.

9. profiles

Stores the common SetuX profile associated with an authenticated Supabase user.

profiles
--------
id                  UUID PRIMARY KEY
email               TEXT
role                user_role
onboarding_status   onboarding_status
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Relationship:

profiles.id = auth.users.id

The authentication identity remains owned by Supabase Auth.

10. Profile Rules

Important constraints:

profiles.id must reference auth.users.id
profiles.email should correspond to authenticated identity
profiles.role must be controlled by backend authorization
profiles.onboarding_status must be server-controlled

The client must not arbitrarily update:

role
onboarding_status

11. citizen_profiles

Stores citizen-specific onboarding information.

citizen_profiles
----------------
id                  UUID PRIMARY KEY
user_id             UUID UNIQUE
full_name           TEXT
government_id       TEXT UNIQUE
mobile_number       TEXT
date_of_birth       DATE
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Relationship:

citizen_profiles.user_id
        ↓
profiles.id

12. Citizen Data Principle

The citizen profile should contain only the information required by SetuX.

Do not turn:

citizen_profiles

into a copy of every government database.

External data should remain associated with the relevant application/workflow and source.

13. government_profiles

Stores government employee onboarding information.

government_profiles
-------------------
id                       UUID PRIMARY KEY
user_id                  UUID UNIQUE
organization_id          UUID
department_id            UUID
full_name                TEXT
employee_id              TEXT
designation              TEXT
official_mobile_number   TEXT
created_at               TIMESTAMPTZ
updated_at               TIMESTAMPTZ

Relationships:

government_profiles.user_id
        ↓
profiles.id

government_profiles.organization_id
        ↓
organizations.id

government_profiles.department_id
        ↓
departments.id

14. organizations

Represents participating government organizations.

organizations
-------------
id                  UUID PRIMARY KEY
name                TEXT
code                TEXT UNIQUE
status              TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Example:

Department of Education
EDU

15. departments

Represents departments within an organization.

departments
-----------
id                  UUID PRIMARY KEY
organization_id     UUID
name                TEXT
code                TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Constraint:

organization_id + code

should be unique.

16. services

Represents services available through SetuX.

For the SIH prototype:

SCHOLARSHIP

services
--------
id                  UUID PRIMARY KEY
code                TEXT UNIQUE
name                TEXT
description         TEXT
status              TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Example:

{
  "code": "SCHOLARSHIP",
  "name": "Scholarship"
}

17. service_requirements

Defines what a service requires.

service_requirements
--------------------
id                  UUID PRIMARY KEY
service_id          UUID
requirement_code    TEXT
requirement_type    TEXT
required            BOOLEAN
data_source_code    TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Examples:

IDENTITY
EDUCATION_RECORD
INCOME_RECORD
BANK_DETAILS

This allows the scholarship workflow to be configured without hard-coding every requirement into the application table.

18. applications

This is the central business table.

applications
------------
id                      UUID PRIMARY KEY
application_number      TEXT UNIQUE
citizen_id              UUID
service_id              UUID
status                  application_status
current_workflow_step   TEXT
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
submitted_at            TIMESTAMPTZ

Relationships:

applications.citizen_id
        ↓
profiles.id

applications.service_id
        ↓
services.id

19. Application Status

Recommended values:

DRAFT
CONSENT_PENDING
DATA_RETRIEVAL
VERIFICATION
READY_FOR_SUBMISSION
SUBMITTED
UNDER_REVIEW
REQUESTED_INFO
WAITING_FOR_DEPARTMENT
RETRYING
FAILED
APPROVED
REJECTED
CANCELLED

Not every status needs to be exposed as a separate UI state.

The backend owns valid transitions.

20. Application State Machine

DRAFT
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
 ┌┴─────────────┐
 ▼              ▼
APPROVED      REJECTED

Operational states:

WAITING_FOR_DEPARTMENT
RETRYING
FAILED

must not automatically mean:

REJECTED

21. Application Ownership

Every application belongs to one citizen:

applications.citizen_id
        =
profiles.id

Database and API authorization must enforce:

auth.uid()
   =
applications.citizen_id

for citizen operations.

22. application_data

Stores structured data specifically associated with an application.

application_data
----------------
id                  UUID PRIMARY KEY
application_id      UUID
field_code          TEXT
value               JSONB
source_type         TEXT
source_reference    TEXT
verified             BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Example:

{
  "field_code": "institution",
  "value": "Example Institute",
  "source_type": "DIGILOCKER",
  "verified": true
}

23. Why JSONB for Application Data?

The scholarship requirements may evolve.

Instead of continuously changing:

applications

for every new field, structured application-specific fields can be stored in JSONB.

However:

Frequently queried, security-sensitive, or relational fields should remain normal PostgreSQL columns.

Do not put the entire database into one JSON column.

24. External Document Principle

SetuX should not duplicate DigiLocker documents unnecessarily.

The preferred model is:

DigiLocker
    │
    │ authorized access
    ▼
SetuX Connector
    │
    ▼
Normalized application data
    │
    ▼
application_data

Where required, store:

source
document reference
metadata
verification result

rather than creating a second permanent document repository.

25. data_sources

Represents external systems connected to SetuX.

data_sources
------------
id                  UUID PRIMARY KEY
code                TEXT UNIQUE
name                TEXT
type                TEXT
status              TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Example sources:

DIGILOCKER
MOCK_IDENTITY_API
MOCK_EDUCATION_API
MOCK_INCOME_API

For the SIH prototype, mock connectors can represent government systems.

26. data_retrievals

Tracks every request to retrieve information from an external source.

data_retrievals
---------------
id                  UUID PRIMARY KEY
application_id      UUID
data_source_id      UUID
request_id          TEXT
status              TEXT
attempt_number      INTEGER
requested_at        TIMESTAMPTZ
completed_at        TIMESTAMPTZ
error_code          TEXT
error_message       TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Possible statuses:

PENDING
PROCESSING
SUCCESS
FAILED
RETRYING

27. Why Store Retrieval History?

It allows SetuX to demonstrate:

External API called
       ↓
Failed
       ↓
Retry
       ↓
Successful

This is important for demonstrating interoperability and exception handling.

28. consents

Represents consent required for a specific application.

consents
--------
id                  UUID PRIMARY KEY
application_id      UUID
citizen_id          UUID
purpose             TEXT
status              consent_status
version             TEXT
granted_at          TIMESTAMPTZ
revoked_at          TIMESTAMPTZ
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Possible statuses:

PENDING
GRANTED
REVOKED
EXPIRED

29. Consent Relationship

Citizen
   │
   ▼
Application
   │
   ▼
Consent
   │
   ▼
Specific purpose
   │
   ▼
Data source access

Consent should be purpose-specific.

Example:

Purpose:
"Retrieve education records for scholarship verification."

30. consent_records

If the MVP requires a detailed immutable consent history:

consent_records
---------------
id                  UUID PRIMARY KEY
consent_id          UUID
action              TEXT
purpose             TEXT
version             TEXT
acted_at            TIMESTAMPTZ
actor_user_id       UUID
metadata            JSONB

This provides an audit trail for:

GRANTED
REVOKED
RENEWED
EXPIRED

For a very small MVP, this can initially be merged with the main consent history/event model.

31. workflow_definitions

Defines a reusable workflow.

workflow_definitions
--------------------
id                  UUID PRIMARY KEY
service_id          UUID
name                TEXT
version              INTEGER
status               TEXT
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ

Example:

Scholarship Verification Workflow
Version 1

32. workflow_steps

Defines individual workflow steps.

workflow_steps
--------------
id                  UUID PRIMARY KEY
workflow_id         UUID
step_code           TEXT
step_order          INTEGER
step_type           TEXT
department_id       UUID
required             BOOLEAN
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ

Example:

1. IDENTITY_VERIFICATION
2. EDUCATION_VERIFICATION
3. INCOME_VERIFICATION
4. OFFICER_REVIEW
5. FINAL_DECISION

33. workflow_executions

Tracks workflow execution for an application.

workflow_executions
-------------------
id                    UUID PRIMARY KEY
application_id        UUID
workflow_step_id      UUID
status                workflow_status
started_at            TIMESTAMPTZ
completed_at          TIMESTAMPTZ
attempt_number        INTEGER
error_code            TEXT
error_message         TEXT
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ

This table connects:

Application
    ↓
Workflow
    ↓
Current/previous steps
    ↓
Execution status

34. verifications

Stores normalized verification results.

verifications
-------------
id                  UUID PRIMARY KEY
application_id      UUID
verification_type   TEXT
status              verification_status
source_id           UUID
result              JSONB
verified_at         TIMESTAMPTZ
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

Possible types:

IDENTITY
EDUCATION
INCOME

Possible statuses:

PENDING
PROCESSING
VERIFIED
FAILED
REQUIRES_ACTION

35. Verification Principle

External systems may have different response formats.

SetuX should normalize them.

Government System A
        │
        ▼
{
  "valid": true
}
        │
        ▼
SetuX canonical format
        │
        ▼
VERIFIED

The database stores the normalized result required by SetuX.

Raw external responses should not be stored indefinitely unless required for debugging/audit and handled securely.

36. application_reviews

Stores government officer review decisions.

application_reviews
-------------------
id                  UUID PRIMARY KEY
application_id      UUID
reviewer_id         UUID
department_id       UUID
decision             review_decision
remarks              TEXT
reviewed_at          TIMESTAMPTZ
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ

Possible decisions:

APPROVED
REJECTED
REQUESTED_INFO

37. Review Relationship

Application
     │
     ▼
Government Review
     │
     ├── Reviewer
     ├── Department
     ├── Decision
     └── Remarks

The reviewer identity comes from the authenticated government account.

The frontend must not be able to impersonate another reviewer.

38. application_events

Append-only application lifecycle history.

application_events
------------------
id                  UUID PRIMARY KEY
application_id      UUID
event_type          TEXT
actor_user_id       UUID
step_code           TEXT
metadata            JSONB
created_at          TIMESTAMPTZ

Examples:

APPLICATION_CREATED
APPLICATION_UPDATED
CONSENT_GRANTED
DATA_RETRIEVAL_STARTED
DATA_RETRIEVAL_COMPLETED
VERIFICATION_STARTED
VERIFICATION_COMPLETED
APPLICATION_SUBMITTED
REVIEW_STARTED
APPLICATION_APPROVED
APPLICATION_REJECTED

39. Event Design

Events should describe what happened.

Do not use events as the only source of current state.

Use:

applications.status

for current state.

Use:

application_events

for historical state changes.

Therefore:

Current state → applications
History       → application_events

40. notifications

Stores notification records.

notifications
-------------
id                  UUID PRIMARY KEY
user_id             UUID
application_id      UUID
type                TEXT
title               TEXT
message             TEXT
read_at             TIMESTAMPTZ
created_at          TIMESTAMPTZ

Example:

Scholarship Application Approved

The actual delivery mechanism can be implemented separately.

41. audit_logs

Stores security-sensitive administrative actions.

audit_logs
----------
id                  UUID PRIMARY KEY
actor_user_id       UUID
action              TEXT
entity_type         TEXT
entity_id           UUID
correlation_id      TEXT
metadata            JSONB
created_at          TIMESTAMPTZ

Examples:

APPLICATION_APPROVED
APPLICATION_REJECTED
ROLE_CHANGED
PROFILE_UPDATED
CONSENT_REVOKED

Do not store passwords, tokens, or unnecessary sensitive identity data in metadata.

42. Foreign Key Strategy

Use foreign keys for core relationships.

Example:

citizen_profiles.user_id
    → profiles.id

applications.citizen_id
    → profiles.id

applications.service_id
    → services.id

consents.application_id
    → applications.id

data_retrievals.application_id
    → applications.id

application_reviews.application_id
    → applications.id

This protects database integrity.

43. Delete Strategy

Avoid cascading deletes for important application history.

For example:

Application
   ↓
Application Events
   ↓
Audit History

should not disappear accidentally because a profile was deleted.

Use appropriate:

RESTRICT
SET NULL

behavior depending on the relationship.

Application records should generally be retained according to the project's data-retention policy.

44. Indexing Strategy

Important indexes:

profiles(role)
profiles(onboarding_status)

citizen_profiles(government_id)

government_profiles(employee_id)
government_profiles(organization_id)

applications(citizen_id)
applications(status)
applications(service_id)
applications(application_number)

application_events(application_id, created_at)

data_retrievals(application_id)
data_retrievals(status)

workflow_executions(application_id)

verifications(application_id, verification_type)

application_reviews(application_id)

notifications(user_id, read_at)

audit_logs(actor_user_id)
audit_logs(entity_type, entity_id)
audit_logs(correlation_id)

Avoid adding indexes without a query requirement.

45. Uniqueness Constraints

Important uniqueness rules:

profiles.id
citizen_profiles.user_id
citizen_profiles.government_id
government_profiles.user_id
services.code
organizations.code
applications.application_number

For government employees:

organization_id + employee_id

should normally be unique.

46. Row Level Security

Supabase RLS is a critical part of the database design.

Citizen

A citizen can access:

own profile
own citizen profile
own applications
own application data
own consent records
own application timeline
own notifications

A citizen cannot access another citizen's records.

47. Government RLS

Government access must be constrained by:

authenticated user
      +
government role
      +
authorized organization
      +
authorized department

Example:

Education Officer
       ↓
Education Department
       ↓
Scholarship applications assigned to that department

An officer should not automatically have access to every application in SetuX.

48. Service Role Boundary

The Supabase service-role key:

MUST NEVER

be exposed to:

React frontend
Flutter frontend
browser
mobile application

It belongs only in the trusted backend/server environment.

49. Sensitive Data

Potentially sensitive fields include:

government_id
date_of_birth
mobile_number
employee_id
application data
verification results

Security requirements:

Do not expose unnecessary fields.
Do not log sensitive values.
Use RLS.
Use HTTPS.
Restrict backend access.

Encryption at rest should rely on the database/platform security controls and additional field-level protection should be introduced where the final requirements demand it.

50. Application Number Generation

Recommended format:

STX-{YEAR}-{SEQUENCE}

Example:

STX-2026-000001
STX-2026-000002

The sequence should be generated server-side.

Do not generate application numbers in the frontend.

51. Transaction Boundaries

Application submission should be treated as a critical transaction.

Conceptually:

BEGIN
   │
   ├── validate application
   ├── update status
   ├── create application event
   └── create audit event
   │
COMMIT

If a critical database operation fails:

ROLLBACK

External API calls should generally not be held open inside a long database transaction.

Use workflow jobs/state transitions for external processing.

52. External System Interaction

Do not model an external API call as a direct database transaction.

Correct:

Application
    ↓
Create workflow execution
    ↓
Commit
    ↓
Worker / workflow
    ↓
External API
    ↓
Store result
    ↓
Update verification

This prevents slow or unavailable government systems from locking database transactions.

53. Failure and Retry Data

A failed external request should preserve:

application_id
data_source_id
request_id
attempt_number
status
error_code
error_message
requested_at
completed_at

Example:

Attempt 1 → TIMEOUT
Attempt 2 → TIMEOUT
Attempt 3 → SUCCESS

This allows the SetuX dashboard to demonstrate resilient interoperability.

54. Canonical Data Model

SetuX should normalize external information into a common structure.

External Source A
       │
External Source B
       │
External Source C
       │
       ▼
Integration Layer
       │
       ▼
Canonical SetuX Data
       │
       ▼
application_data
       │
       ├── verification
       └── workflow

This is one of the key architectural purposes of SetuX.

55. Database-Level Application Flow

auth.users
    │
    ▼
profiles
    │
    ▼
citizen_profiles
    │
    ▼
applications
    │
    ├──────────────► consents
    │
    ├──────────────► application_data
    │
    ├──────────────► data_retrievals
    │
    ├──────────────► workflow_executions
    │                       │
    │                       ▼
    │                  verifications
    │
    ├──────────────► application_reviews
    │
    ├──────────────► application_events
    │
    └──────────────► notifications

56. Complete Scholarship Data Flow

Citizen
   │
   ▼
profiles
   │
   ▼
citizen_profiles
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
   ├──────────► DigiLocker
   │
   ├──────────► Education API
   │
   └──────────► Income API
   │
   ▼
application_data
   │
   ▼
workflow_executions
   │
   ▼
verifications
   │
   ▼
application_reviews
   │
   ▼
applications.status
   │
   ├──────────► APPROVED
   │
   └──────────► REJECTED
   │
   ▼
notifications

57. Recommended MVP Simplification

For the first SIH implementation, do not over-engineer the database.

The minimum useful tables are:

profiles
citizen_profiles
government_profiles
organizations
departments
services
applications
application_data
consents
data_sources
data_retrievals
verifications
application_reviews
application_events
notifications
audit_logs

Workflow definitions can initially be represented using application configuration if the workflow is fixed.

As the prototype matures, introduce:

workflow_definitions
workflow_steps
workflow_executions

for a reusable orchestration engine.

58. Suggested Migration Order

Create migrations in dependency order:

1. profiles
2. organizations
3. departments
4. citizen_profiles
5. government_profiles
6. services
7. service_requirements
8. applications
9. application_data
10. data_sources
11. consents
12. consent_records
13. data_retrievals
14. workflow_definitions
15. workflow_steps
16. workflow_executions
17. verifications
18. application_reviews
19. application_events
20. notifications
21. audit_logs

59. Seed Data for SIH

The prototype should include controlled seed data.

Example:

Organization
    Department of Education

Department
    Higher Education

Service
    SCHOLARSHIP

Data Sources
    MOCK_IDENTITY_API
    MOCK_EDUCATION_API
    MOCK_INCOME_API
    DIGILOCKER_MOCK

Example workflow:

IDENTITY_VERIFICATION
EDUCATION_VERIFICATION
INCOME_VERIFICATION
OFFICER_REVIEW
FINAL_DECISION

This allows the complete system to run without requiring production government credentials.

60. Example Application Record

{
  "id": "uuid",
  "application_number": "STX-2026-000001",
  "citizen_id": "uuid",
  "service_id": "uuid",
  "status": "VERIFICATION",
  "current_workflow_step": "EDUCATION_VERIFICATION",
  "created_at": "2026-08-29T09:00:00Z",
  "updated_at": "2026-08-29T09:10:00Z",
  "submitted_at": "2026-08-29T09:05:00Z"
}

61. Example Verification Record

{
  "id": "uuid",
  "application_id": "uuid",
  "verification_type": "EDUCATION",
  "status": "VERIFIED",
  "source_id": "uuid",
  "result": {
    "institution_match": true,
    "credential_match": true
  },
  "verified_at": "2026-08-29T09:10:00Z"
}

62. Example Application Event

{
  "id": "uuid",
  "application_id": "uuid",
  "event_type": "VERIFICATION_COMPLETED",
  "actor_user_id": null,
  "step_code": "EDUCATION_VERIFICATION",
  "metadata": {
    "source": "MOCK_EDUCATION_API"
  },
  "created_at": "2026-08-29T09:10:00Z"
}

63. Database Security Checklist

Supabase RLS enabled

Service-role key never exposed

Foreign keys defined

Unique constraints defined

Citizen ownership policies defined

Government department policies defined

Role changes protected

Application status protected

Sensitive fields excluded from unnecessary responses

Sensitive values excluded from logs

Audit events implemented

Database backups/retention configured according to deployment requirements

64. Database Definition of Done

Identity

profiles linked to auth.users

Citizen profile supported

Government profile supported

Role stored and protected

Onboarding status stored

Application

Scholarship service seeded

Applications linked to citizen

Application number generated

Application status stored

Current workflow step stored

Draft data supported

Submission timestamp supported

Interoperability

External data sources represented

Retrieval attempts recorded

Retry information stored

Verification results normalized

Source references supported

Consent

Application-specific consent supported

Consent status stored

Consent history/audit supported

Government

Organizations represented

Departments represented

Government profiles linked to departments

Application reviews stored

Approval/rejection recorded

Tracking

Application events stored

Timeline can be reconstructed

Current status available

Notifications supported

Security

RLS policies defined

Ownership enforced

Government access constrained

Sensitive data protected

Audit logging implemented

65. Final Database Architecture

                         SUPABASE
                            │
              ┌─────────────┴─────────────┐
              │                           │
          Auth Users                  PostgreSQL
              │                           │
              ▼                           ▼
          profiles                  SetuX Database
              │                           │
       ┌──────┴───────┐                   │
       ▼              ▼                   │
    Citizen        Government             │
   Profile          Profile               │
       │              │                   │
       │              └──────► Organization
       │                           │
       │                           ▼
       │                       Department
       │
       ▼
  Application
       │
  ┌────┼────────┬──────────┬───────────┐
  ▼    ▼        ▼          ▼           ▼
Consent Data   Workflow Verification Review
        │        │          │           │
        │        ▼          │           │
        │   External APIs   │           │
        │        │          │           │
        │        ▼          │           │
        │   Data Sources   │           │
        │                   │           │
        └─────────┬─────────┴───────────┘
                  ▼
          Application Events
                  │
                  ├────► Notifications
                  │
                  └────► Audit Logs

66. Final Design Principle

The SetuX database should store identity, application state, consent, workflow state, normalized verification results, references to external data, government decisions, events, and audit information.

It should not attempt to replace the databases of the connected government systems.

The core model is:

External Government Systems
          │
          ▼
     SetuX Connectors
          │
          ▼
   Canonical SetuX Data
          │
          ▼
      Application
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
 Consent Workflow Review
    │     │     │
    └─────┼─────┘
          ▼
    Unified Status
          │
          ▼
        Citizen