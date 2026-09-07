SetuX --- Change & Correction Service

Feature Phase Plan

Feature Name: Change & Correction Service
Product: SetuX
Goal: Allow a citizen to initiate an editable government-record
correction once, identify other affected records, select where the
change should propagate, provide consent, route department-specific
correction requests, track independent reviews/updates, and notify the
citizen.

Core Principle

SetuX does not directly rewrite government source-of-truth records.

Citizen proposes change → validate editability → detect affected
records → select targets → consent → route department requests →
department review → apply approved changes through connectors → track →
notify.

The feature must preserve source ownership, department isolation,
explicit consent, old/proposed values, provenance, audit history, and
partial outcomes.

Phase 0 --- Architecture & Existing-System Discovery

Objective

Understand the existing SetuX architecture before implementation.

Tasks

Read AGENT.md, CLAUDE.md, README.md, API/database docs, and
relevant skills.

Inspect existing citizen profiles, services, applications, consents,
retrievals, verifications, reviews, notifications, audit logs,
departments, connectors, RBAC, and RLS.

Identify reusable application/review workflow patterns.

Define boundaries among canonical citizen data, retrieved evidence,
source records, and correction requests.

Decide which existing tables can be reused and which new domain
entities are required.

Acceptance

No coding before schema/workflow discovery.

No duplicate subsystem where existing SetuX infrastructure can
safely be reused.

Status: COMPLETE (2026-09-07).

Repository, migrations, connectors, consent model, review workflow,
auth seeder, onboarding requirements and frontend architecture were
inspected. Architecture, reuse map, domain model, lifecycle, APIs,
security model, migration order and test strategy are documented in:

  docs/ARCHITECTURE/change-correction-service.md

All Phase 0 blockers are resolved. Accepted decisions:

1. Citizen record registry — citizen_records + citizen_record_fields
   are a NEW citizen-scoped domain concept, independent of
   applications. A citizen needs no scholarship application to browse
   or correct their government records.  (arch doc §4.1, §19)

2. Banking — IN SCOPE, synthetic only. Modelled as a non-departmental
   provider demonstrating STEP_UP_REQUIRED. SetuX authentication never
   bypasses a provider's own security. No bank connector before
   Phase 10.  (arch doc §8.1, §20.5)

3. Record authority ownership — explicit record_type → authority →
   data_source map using stable UUID foreign keys. The fragile
   services.department = departments.name text join is NOT reproduced.
   Higher Education and Minority Affairs are reused; Identity
   Authority, Revenue Department and a synthetic banking provider are
   new.  (arch doc §20.6)

4. Synthetic demo citizen — the existing citizen@setux.test fixture is
   reused and extended, not replaced. Onboarding uses exactly the four
   fields the code requires. Records are provisioned by an explicit,
   idempotent demo seeder, never auto-provisioned on login. Passwords
   stay in the environment and are never committed or printed.
   (arch doc §20-§23)

5. Historical application evidence is never rewritten by a correction.
   Old applications keep old evidence and its provenance; a future
   retrieval fetches the newer value.  (arch doc §17)

Deferred to their own phases (non-blocking): notification linking,
REQUESTED_INFO, connector write mechanics, version-history table,
bank step-up implementation, citizen record population, refresh
strategy.

No code, schema or migration was changed. Phase 1 is the Editable
Field Policy Engine only, and must not implement citizen record
provisioning, the demo fixture, or any change_request concept
(arch doc §25).

Phase 1 --- Editable Field Policy Engine

Objective

Define which fields of each supported government record may be changed.

Field Classes

Editable: normal correction request allowed.

Conditionally Editable: requires evidence, stronger
verification, or review.

Immutable: citizen cannot request a direct change.

Examples:

Field                 Policy

Mobile                Editable
Address               Editable
Legal Name            Conditionally Editable
DOB                   Conditionally Editable
Certificate Number    Immutable
Issuing Authority     Immutable
System-generated ID   Immutable

Backend policy should conceptually capture:

document_type
field_key
editability
requires_evidence
requires_review
authority
dependency_group

Acceptance

Backend is authoritative.

Frontend manipulation cannot make immutable fields editable.

UI clearly explains field eligibility.

Status: COMPLETE (2026-09-07) --- backend and database only.

The editable field policy is now authoritative, server-side and
seeded. Documented in:

  docs/API/field-policies.md
  docs/DATABASE/field-policies.md

Delivered:

1. Migration 20260907182417_setux_field_policies.sql --- APPLIED to
   the linked project. Adds the field_editability enum
   (EDITABLE / CONDITIONALLY_EDITABLE / IMMUTABLE) and the
   field_policies table, keyed on the natural unique
   (record_type, field_key). Additive: no DROP, TRUNCATE or DELETE,
   and no existing migration was modified.

   Naming note: the column is record_type, not document_type. Arch
   doc §4.2 drafted it as document_type; §20.5 and the Phase 1
   boundary in §25 both settled on (record_type, field_key), and
   §4.1 gives the future citizen_records.record_type the same name.

2. Seed --- 29 synthetic policies across the five record types of
   arch doc §20.5: IDENTITY_RECORD, INCOME_RECORD, EDUCATION_RECORD,
   COMMUNITY_RECORD and BANK_DETAILS. Carried in BOTH the migration
   (the linked project is migrated forward, never reset) and
   supabase/seed/seed.sql (so db reset reproduces it). Both are
   idempotent on the same key.

   BANK_DETAILS carries policy although no bank connector exists:
   editability is configuration and is knowable before the provider
   is built. No connector, data source or department row was added.

3. Backend module backend/src/modules/field-policies/ --- routes →
   controller → service → repository → schema → types, per
   AGENT.md §7.

4. API, read-only, authenticated, no role restriction (matching the
   table's own to authenticated RLS grant, and because officer
   review must later see the rule the citizen was shown):

     GET /api/v1/field-policies/:recordType
     GET /api/v1/field-policies/:recordType/fields/:fieldKey

   No mutation route is declared on the router --- not disabled,
   absent --- so a client cannot author policy even in principle.

5. Enforcement helper --- assertFieldEditable(recordType, fieldKey)
   throws on IMMUTABLE (409 FIELD_NOT_EDITABLE, naming the owning
   authority) and on an absent policy (404 FIELD_POLICY_NOT_FOUND),
   and returns the evidence/review requirements for a conditional
   field. Companions: getFieldPolicy and the non-throwing
   resolveFieldChangeDecision. Phase 1 ESTABLISHES the decision; the
   requirements are returned, not enforced, because this phase has no
   submission to enforce them against.

   A missing policy is a refusal, never a permissive default: an
   ungoverned field must not become correctable by having been
   forgotten in a seed.

6. Security --- RLS enabled; one for select ... to authenticated
   policy scoped to active rows; NO insert/update/delete policy for
   any browser role; anon has no policy at all. Strict Zod schemas on
   both routes, and neither accepts a body or query parameter, so a
   forged editability has nowhere to land.

7. Tests --- 52 new: 13 service unit, 8 repository unit, 31
   integration (including 12 adversarial). 17 database tests run
   against the live project, covering the unique constraint, each
   CHECK, the enum domain and browser-role write refusal. Full
   backend suite 612 passed.

Acceptance met: backend is authoritative; frontend manipulation
cannot make an immutable field editable (four independent barriers,
documented in docs/API/field-policies.md §8). The third acceptance
criterion --- "UI clearly explains field eligibility" --- is
deliberately NOT met in this phase: Phase 1 has no Change Details UI
(arch doc §25), and the endpoint returns the authority and dependency
group precisely so the Phase 2+ UI can explain a locked field rather
than hide it.

Not implemented, per arch doc §25: citizen_records, demo fixture
provisioning, change_requests, the dependency engine, impact preview,
target selection, change consent, government review,
RecordUpdateConnector, notifications, the bank connector, and any
source-system write. No frontend file was added or changed.

Phase 2 --- Citizen Change Details Entry Flow

Objective

Create the citizen entry point.

Citizen Dashboard
      ↓
Change Details
      ↓
Available Government Records
      ↓
Select Record
      ↓
Load Field Policy

Show record/document name, source department, synchronization/retrieval
information when available, and change eligibility.

Acceptance

Only records associated with the authenticated citizen are shown.

Loading, empty, unavailable, and error states exist.

Cross-citizen access is impossible.

Status: COMPLETE (2026-09-08) --- backend and database only.

The citizen record registry now exists, is citizen-scoped, and is
populated for the synthetic demo citizen. Documented in:

  docs/API/citizen-records.md
  docs/DATABASE/citizen-records.md

Delivered:

1. Migration 20260907185358_setux_citizen_records.sql --- APPLIED to
   the linked project. Adds citizen_records and citizen_record_fields,
   plus the routing rows the authority map needs: a synthetic
   organization DEMO_GOV, the departments Identity Authority and
   Revenue Department, and the data source MOCK_BANK_API. Additive:
   no DROP, TRUNCATE or DELETE, and no existing migration was
   modified. application_data was not touched.

   citizen_records deliberately has NO application_id (arch §4.1,
   gap C1): a citizen who has never applied for a scholarship still
   has government records to browse and correct.

   Higher Education and Minority Affairs are REUSED, not re-created
   --- the officer fixture already belongs to Higher Education, and
   forking the row would separate the department a target routes to
   from the department an officer belongs to.

2. Identity --- the record's UUID is its identity; source_record_ref
   is source metadata. Name, mobile and any Aadhaar-like number are
   mutable field VALUES, never identity, because this is the
   subsystem whose whole purpose is changing them.

   Idempotency keys, per arch §22: unique
   (citizen_id, record_type, data_source_id) on the record, and
   unique (citizen_record_id, field_key) on the value.

3. Bank --- MOCK_BANK_API is a data source row and nothing else.
   authority_department_id is NULL for bank records because the bank
   is a PROVIDER, not a department: it has no officer queue and never
   will (arch §20.6, §8.1). No bank connector, step-up auth, OTP or
   network call was built --- all Phase 10. The existing DigiLocker
   BANK_DETAILS document requirement is unchanged.

4. Backend module backend/src/modules/citizen-records/ --- routes →
   controller → service → repository → schema → types, per
   AGENT.md §7.

5. API, read-only, authenticated, CITIZEN only:

     GET /api/v1/citizen-records
     GET /api/v1/citizen-records/:recordId

   No mutation route is declared on the router --- not disabled,
   absent --- and the repository exports no write function, so a
   client cannot alter a source record even in principle.

   Ownership is a PREDICATE in every query, never a check applied to
   rows already read. A record belonging to another citizen is not
   "denied", it is NOT FOUND --- same status, code and message as an
   id that never existed.

6. Field policy integration --- each field carries the Phase 1
   policy governing it, read live from field_policies. Editability is
   never stored on a record and never accepted from a client, and a
   field with no active policy is changeable: false. This resolves
   the requirement Phase 1 deferred: the UI can now explain a locked
   field rather than hide it.

7. Fixture --- scripts/seed-change-correction-demo.mjs provisions
   five records and 29 field values for citizen@setux.test, all
   sharing the synthetic holder name "Demo Old Name" (the
   precondition for the Phase 4 dependency demo, arch §23).

   Separate from seed-auth-users.mjs by design, and not
   auto-provisioned on login or onboarding (arch §21 rejects that).
   It never writes profiles.role or profiles.onboarding_status ---
   the existing COMPLETED onboarding was preserved --- refuses any
   address but the known fixture, refuses a non-CITIZEN account,
   prints no credential, and refuses to write a field key that has no
   field_policies row. Two live runs left exactly 5 records and 29
   values.

8. Security --- RLS enabled on both tables; citizen SELECT own only;
   NO insert/update/delete policy for any browser role; anon has no
   policy at all.

   Officers get NOTHING here, deliberately: officer authority over a
   record arises from a change target (arch §4.6), which this phase
   does not create. Approximating it as "any record my department is
   the authority for" would expose every citizen's education record
   to every Higher Education officer. Probed live: demo citizen sees
   5/29 and cannot insert or update; a second citizen, the officer
   and anon each see 0/0.

9. Tests --- 109 new: 17 service unit, 13 repository unit, 31
   provisioner unit, 32 integration (including 13 adversarial), and
   29 database tests run against the live project covering both
   unique constraints, each CHECK, the embedded relationships, the
   ownership predicate and the fixture that actually landed.

Acceptance met: only the authenticated citizen's records are
returned; cross-citizen access is impossible at three independent
layers (query predicate, RLS policy, and the absence of any parameter
naming a citizen). The "loading, empty, unavailable, and error
states" criterion is a UI concern and is deliberately NOT met in this
phase --- Phase 2 as scoped here is backend and database only, and
the empty inventory, UNAVAILABLE status and error codes the UI needs
are all present in the contract for it to render.

Not implemented, per arch doc §25: change_requests, proposed values,
the dependency engine, impact detection, target selection, change
consent, officer change review, RecordUpdateConnector, notifications,
the bank connector, and any record mutation API or source-system
write. No frontend file was added or changed.

Phase 3 --- Change Draft & Editable Form

Objective

Allow one or more permitted field corrections.

Show: - current value - proposed value - reason - editability - required
supporting evidence - source authority

Example:

Current Name
Vishnu Kumar

New Name
[ Vishnu Bhardwaj ]

Reason
[ Legal name correction ]

Never overwrite the official value at this stage. Persist old_value
and proposed_value.

Suggested parent lifecycle, subject to schema design:

DRAFT
CONSENT_PENDING
SUBMITTED
IN_REVIEW
PARTIALLY_COMPLETED
COMPLETED
PARTIALLY_REJECTED
REJECTED
CANCELLED

Acceptance

Multiple fields supported where policy allows.

Existing values remain unchanged until approved/applied.

Draft can be resumed.

Server validates every requested field.

Phase 4 --- Dependency & Impact Detection Engine

Objective

Identify other records affected by a proposed change.

Example:

IDENTITY.name
      ↓
Dependency Engine
      ↓
INCOME_RECORD.name
EDUCATION_RECORD.name
COMMUNITY_RECORD.name
BANK_DETAILS.account_holder_name

Dependency classes: - Required - Recommended - Optional

Conceptual rule:

source_document_type
source_field
target_document_type
target_field
dependency_type
responsible_department
active

Acceptance

Rules are server-side and deterministic.

Duplicate targets collapse.

Circular rules cannot cause infinite processing.

Only the citizen's relevant records are returned.

Phase 5 --- Impact Preview & Target Selection

Objective

Show consequences before consent.

Requested Change

Name
Vishnu Kumar
      ↓
Vishnu Bhardwaj

Affected Records

Required
✓ Identity Profile

Recommended
☐ Income Certificate
☐ Education Record
☐ Bank Details

Optional
☐ Previous Scheme Record

Show responsible departments and why each target is affected.

Acceptance

Citizen understands: - what changes - old/new values - affected
records - responsible departments - mandatory vs optional targets

before granting consent.

Phase 6 --- Change Consent Bundle

Objective

Obtain explicit consent without unnecessary repeated consent/OTP
interactions.

Citizen experiences one clear consent operation. Internally SetuX
retains auditable authorization per selected target.

Change Consent Bundle
       ├── Identity Department
       ├── Revenue Department
       ├── Education Department
       └── Bank/Provider

Consent must be: - purpose-bound - request-bound - citizen-bound -
scope-bound - target/source-bound - time-bound where required -
auditable

Reuse the established authenticated citizen session. Do not assume
Aadhaar authentication can bypass a bank/department's own step-up
requirements. Model STEP_UP_REQUIRED where applicable.

Acceptance

No protected target is submitted without valid consent.

Consent cannot be reused outside its scope.

Expired/revoked consent blocks protected actions.

Phase 7 --- Parent & Department-Specific Requests

Objective

Create one citizen-facing request with independently routed child
targets.

Change Request CR-2026-00142
        ├── Identity Department target
        ├── Revenue Department target
        ├── Higher Education target
        └── Banking target

Suggested child lifecycle:

PENDING
SUBMITTED
UNDER_REVIEW
ADDITIONAL_INFO_REQUIRED
APPROVED
REJECTED
UPDATE_PENDING
APPLIED

Potential domain entities: - change_requests -
change_request_fields - change_targets - change_dependencies -
change_consents - change_reviews - change_events

Do not create these blindly; inspect the existing schema first.

Acceptance

Submission is atomic where needed.

Duplicate active targets are prevented.

Parent/child state remains consistent.

One target failure does not corrupt others.

Phase 8 --- Department Routing & Government Queue

Objective

Route each target only to its responsible department.

Government portal may expose:

Change Requests
  ├── Awaiting Review
  ├── Additional Information
  ├── Approved / Update Pending
  ├── Completed
  └── Rejected

Officer detail should show only necessary data: - citizen summary -
source record - requested fields - old/proposed values - reason -
supporting evidence/provenance - consent status - relevant
verification - history

Acceptance

GOVERNMENT_OFFICER RBAC enforced server-side.

Department scope enforced server-side.

Cross-department access denied.

Citizen cannot access officer endpoints.

Phase 9 --- Officer Review

Objective

Allow authorized officers to decide correction targets.

Actions:

Approve
Request More Information
Reject

Decision must: - use authenticated officer identity - enforce department
scope - validate lifecycle - prevent contradictory decisions - preserve
reviewer/time/reason/events - preserve old/proposed values

APPROVED does not mean APPLIED.

Acceptance

Duplicate/contradictory decisions prevented.

Direct API manipulation cannot bypass authorization.

Additional-information flow is represented explicitly.

Review transition is atomic where required.

Phase 10 --- Connector Update / Source-System Application

Objective

Apply approved changes through the existing connector abstraction.

Officer APPROVES
      ↓
APPROVED
      ↓
Authorized Connector Update
      ↓
Success
      ↓
APPLIED

On connector failure, retain approval and use an honest pending/retry
state rather than falsely reporting success.

Prototype constraints: - fake/synthetic connectors only - deterministic
behavior - no real Aadhaar/bank/government production APIs - no real
citizen data

Acceptance

Approved target can be applied.

Failed update retains approval history.

Retry is safe/idempotent.

Source provenance retained.

Phase 11 --- Parent Status Aggregation

Objective

Calculate one citizen-visible status from child targets.

Example:

Identity    APPLIED
Income      APPLIED
Education   UNDER_REVIEW
Bank        STEP_UP_REQUIRED

Overall → PARTIALLY_COMPLETED / IN_REVIEW

All applied:

Overall → COMPLETED

Acceptance

Aggregation deterministic.

Parent cannot contradict children.

Rejection does not erase successful targets.

Citizen can understand partial outcomes.

Phase 12 --- Citizen Tracking

Objective

Provide unified tracking.

Name Change
CR-2026-00142

Vishnu Kumar → Vishnu Bhardwaj

Identity Profile
✓ Updated

Income Certificate
✓ Updated

Education Record
⏳ Under Review

Bank Details
⚠ Additional verification required

Include a timeline of persisted events.

Acceptance

Citizen sees only own requests.

Parent/child states are distinct.

No internal secrets/provider payloads exposed.

Historical requests remain available.

Phase 13 --- Notifications

Objective

Notify citizens of meaningful workflow events.

Events: - submitted - additional information required - target
approved - target rejected - target applied - update failed/retry
pending - overall completed - partial outcome requiring attention

Use existing SetuX notification infrastructure where possible.

Acceptance

Notifications originate from persisted state transitions.

Retry does not create uncontrolled duplicate notifications.

Notification links to correct request.

Phase 14 --- Version History, Provenance & Audit

Objective

Preserve correction history.

Version 1
Name: Vishnu Kumar

Version 2
Name: Vishnu Bhardwaj

Preserve: - old/new values - request - citizen - responsible
department - reviewer - decision - source - applied timestamp - consent
reference - event history

Never put sensitive raw values into general-purpose logs.

Acceptance

Historical values are not silently destroyed.

Important transitions have provenance.

Ordinary citizens/officers cannot mutate audit history.

Phase 15 --- Security & Abuse Hardening

Objective

Harden the feature.

Validate: - authentication - citizen ownership - officer role -
department scope - target scope - consent scope/purpose - strict field
schemas - no mass assignment - no client-controlled citizen/officer
IDs - no OTP storage - no secrets/real identifiers in logs - RLS -
server-only privileged operations - race protection - idempotency

Adversarial tests: - cross-citizen access - cross-department access -
immutable-field manipulation - forged target - forged consent - invalid
lifecycle transition - duplicate approval - contradictory decision -
connector retry - finalized request mutation

Phase 16 --- Integration & E2E Testing

Primary Scenario --- Name Change

Login
→ Change Details
→ Identity Record
→ Name
→ policy confirms conditionally editable
→ old value shown
→ new value entered
→ evidence supplied
→ dependencies detected
→ targets selected
→ impact preview
→ consent
→ parent + child requests
→ department review
→ independent decisions
→ approved updates applied
→ parent status aggregated
→ notification
→ citizen tracking

Negative scenarios: - immutable field - unsupported field - missing
evidence - missing/expired consent - unauthorized citizen - wrong
department - duplicate request - rejected target - connector failure -
more-information request - partial completion

Also test desktop, tablet, mobile, keyboard navigation, focus states,
labels, errors, dialogs, and non-color-only statuses.

Phase 17 --- Demo Validation

Recommended Synthetic Demo

Current Name: Vishnu Kumar
Proposed Name: Vishnu Bhardwaj

Affected:
Identity
Income
Education
Bank

Demonstrate: 1. Select record. 2. Show editable vs immutable fields. 3.
Select Name. 4. Show old value. 5. Enter proposed value. 6. Detect
affected records. 7. Select targets. 8. Show departments. 9. Grant one
clear consent bundle. 10. Submit unified request. 11. Officer sees only
department-scoped target. 12. Officer reviews. 13. Fake connector
applies approved change. 14. Citizen sees per-target progress. 15.
Citizen receives completion notification.

Never bypass consent, authorization, review, or connector application
for the demo.

Phase 18 --- Documentation & Finalization

Update/create: - feature overview - API specification - database/schema
docs - consent model - editable-field policy - dependency rules -
government review workflow - connector update contract - security
design - demo guide - phase tracker

Document prototype limitations: - synthetic government systems -
synthetic Aadhaar-like data - synthetic banking integrations - SetuX
does not modify real government systems - production requires
provider/department agreements and their authentication/update policies

Final Feature Lifecycle

DRAFT CHANGE
      ↓
FIELD POLICY VALIDATION
      ↓
PROPOSED CHANGE
      ↓
DEPENDENCY DETECTION
      ↓
TARGET SELECTION
      ↓
CONSENT
      ↓
SUBMITTED
      ↓
DEPARTMENT ROUTING
      ↓
INDEPENDENT REVIEW
      ↓
APPROVED / REJECTED / MORE INFO
      ↓
SOURCE-SYSTEM UPDATE
      ↓
APPLIED
      ↓
STATUS AGGREGATION
      ↓
NOTIFICATION
      ↓
COMPLETED / PARTIAL RESULT

Definition of Done

Citizen can select a government record.

Backend determines editable fields.

Immutable fields cannot be changed through API manipulation.

Current/proposed values remain separate.

Multiple permitted fields are supported where policy allows.

Affected records are detected automatically.

Dependencies are required/recommended/optional.

Citizen can select permitted targets.

Impact preview appears before consent.

Scoped consent is persisted.

One parent request coordinates multiple department targets.

Department targets are isolated.

Officers see only authorized targets.

Officers can approve, reject, or request more information.

Approval is distinct from source-system application.

Approved changes are applied through connectors.

Connector failures are represented honestly.

Parent status reflects all child targets.

Citizen has unified tracking.

Citizen receives notifications.

Old values/provenance remain auditable.

RBAC/RLS/ownership/department scope enforced.

Consent cannot be bypassed.

E2E happy and negative paths pass.

Typecheck passes.

Lint passes.

Tests pass.

Production build passes.

No secrets or real citizen/government data committed.

Documentation updated.

Recommended Implementation Order

0  Architecture discovery
1  Editable field policy
2  Citizen entry flow
3  Change draft/form
4  Dependency engine
5  Impact preview/target selection
6  Consent bundle
7  Parent + child requests
8  Department routing/queue
9  Officer review
10 Connector update
11 Parent aggregation
12 Citizen tracking
13 Notifications
14 Versioning/audit
15 Security hardening
16 E2E/integration
17 Demo validation
18 Documentation/finalization

Proceed phase-by-phase. Validate each phase against the existing SetuX
architecture, database, authorization model, and security rules before
starting the next phase.