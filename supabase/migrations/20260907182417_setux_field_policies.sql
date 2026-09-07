-- =============================================================================
-- SetuX — Change & Correction Service — Phase 1 — Editable field policy
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §4.2, §11, §20.5, §25
--         docs/PHASES/feature.md — Change & Correction Phase 1
--
-- The question this table answers is exactly one question:
--
--   "May a citizen ask for this field of this kind of record to be changed?"
--
-- and it answers it as CONFIGURATION, keyed on (record_type, field_key). It
-- holds no citizen value, no proposed value, no application and no consent. A
-- policy row is true of the *kind of record*, not of anybody's record, which is
-- why this phase has no dependency on `citizen_records` existing (arch §25).
--
-- Why a table rather than backend constants (arch §11): the repository has
-- consistently chosen configuration tables — `services`, `data_sources`,
-- `service_requirements` — and a policy that lives in a deploy artefact cannot
-- be demonstrated as policy. `service_requirements` was rejected as a host for
-- the same information because it is the wrong domain: a requirement describes
-- what a *service* needs, while editability describes what a *record* permits,
-- and no service is involved in a correction at all.
--
-- Naming: `record_type`, not `document_type`. Arch §4.2 drafted the column as
-- `document_type`; §20.5 and the Phase 1 boundary in §25 both settled on
-- "record type" and on `(record_type, field_key)`, and §4.1 gives the future
-- `citizen_records.record_type` the same name. One name for one concept means a
-- later join reads without translation.
--
-- Scope discipline. This migration adds ONE enum and ONE table, plus its seed.
-- It adds no `citizen_records`, no `change_requests`, no dependency rules, no
-- consent, no review, no connector and no notification — every one of those is
-- a later phase (arch §25), and none of them is referenced here.
--
-- Additive and non-destructive: no DROP, no TRUNCATE, no DELETE, and no
-- existing migration is modified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The editability domain
-- -----------------------------------------------------------------------------
-- An enum rather than a TEXT + CHECK, because this is a state the backend owns
-- and it is stable (setux_enums.sql header states the rule: enums for
-- backend-owned stable states, reference tables for anything configuration
-- changes). Exactly three values, and they are exhaustive by design:
--
--   EDITABLE                 a correction may be requested directly.
--   CONDITIONALLY_EDITABLE   a correction may be requested, but only with
--                            whatever `requires_evidence` / `requires_review`
--                            demand of it.
--   IMMUTABLE                the citizen cannot request this change here. The
--                            field is not "hidden" — the UI is expected to show
--                            it and name the authority that owns it (arch §11).
--
-- A fourth value is deliberately absent: "editable by an officer" is not a
-- property of the field, it is a property of the workflow, and it belongs to
-- the review phase.
create type public.field_editability as enum (
  'EDITABLE',
  'CONDITIONALLY_EDITABLE',
  'IMMUTABLE'
);

comment on type public.field_editability is
  'Whether a citizen may request a correction to a field: directly, conditionally, or not at all.';

-- -----------------------------------------------------------------------------
-- 2. field_policies
-- -----------------------------------------------------------------------------
create table public.field_policies (
  id                uuid primary key default gen_random_uuid(),

  -- The kind of government record the field belongs to — IDENTITY_RECORD,
  -- INCOME_RECORD, … (arch §20.5). TEXT and not an enum: the set of record
  -- types grows with the connectors SetuX federates, which is configuration,
  -- and a new record type must not require an ALTER TYPE. A CHECK pins the
  -- shape (screaming snake case) so a typo cannot silently create a sixth
  -- record type that no endpoint will ever ask for.
  record_type       text not null,

  -- The NORMALIZED SetuX field key the connectors already emit —
  -- `identityHolderName`, never the provider's own `holder_name` (arch §11).
  -- Reusing the normalization boundary rather than duplicating it is what keeps
  -- one field from having two names in two subsystems.
  field_key         text not null,

  editability       public.field_editability not null,

  -- What a CONDITIONALLY_EDITABLE field demands. Both are meaningful for an
  -- EDITABLE field too (an editable field may still be reviewed), so neither is
  -- constrained to a particular editability — except that an IMMUTABLE field
  -- can demand nothing, since nothing may be requested of it (see the CHECK).
  requires_evidence boolean not null default false,
  requires_review   boolean not null default false,

  -- The authority that owns the field, as descriptive text.
  --
  -- Deliberately NOT a foreign key to `departments`. Arch §20.6 records that
  -- two of the five authorities — Identity Authority and Revenue Department —
  -- do not exist as rows, and one of them (the bank) is a provider and will
  -- never be a department at all. Seeding synthetic departments to satisfy an
  -- FK is Phase 2 routing work; inventing them here would be exactly the
  -- premature coupling the phase boundary forbids. When routing arrives it will
  -- carry `departments.id` UUIDs on the target row, where routing belongs (§8).
  authority         text,

  -- Fields that must move together — a name change is a name change across
  -- every record that carries it. Phase 1 records the grouping and does nothing
  -- with it; the dependency ENGINE is a later phase and a different table
  -- (`change_dependency_rules`, arch §4.3), which is not created here.
  dependency_group  text,

  -- Withdrawal without deletion. A policy that has been applied to a past
  -- request must stay readable, so a retired policy is deactivated rather than
  -- removed — the same reasoning that makes `services.status` a column rather
  -- than a DELETE.
  active            boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ONE authoritative policy per field. Not `(record_type, field_key, active)`:
  -- that would permit an active and an inactive policy for the same field, and
  -- then "the policy for this field" would have two answers. Versioning is not
  -- required in Phase 1 (arch §25), so the simpler invariant is the correct
  -- one — a field has exactly one policy row, which is either in force or not.
  constraint field_policies_field_unique unique (record_type, field_key),

  constraint field_policies_record_type_format
    check (record_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),

  -- The connectors' normalized keys are lowerCamelCase identifiers.
  constraint field_policies_field_key_format
    check (field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'),

  -- An IMMUTABLE field cannot require evidence or review, because nothing may
  -- be requested of it in the first place. A row that says "you may not change
  -- this, and here is what you must supply to change it" is incoherent, and the
  -- database is where an incoherent policy should be impossible to write rather
  -- than merely unlikely.
  constraint field_policies_immutable_demands_nothing
    check (
      editability <> 'IMMUTABLE'
      or (requires_evidence = false and requires_review = false)
    ),

  -- Descriptive text, when present, must actually describe something.
  constraint field_policies_authority_not_blank
    check (authority is null or length(btrim(authority)) > 0),
  constraint field_policies_dependency_group_not_blank
    check (dependency_group is null or length(btrim(dependency_group)) > 0)
);

comment on table public.field_policies is
  'Configuration: whether a field of a government record type may be corrected by a citizen. Keyed on (record_type, field_key). Holds no citizen data.';
comment on column public.field_policies.record_type is
  'The kind of record the field belongs to, e.g. IDENTITY_RECORD (arch §20.5).';
comment on column public.field_policies.field_key is
  'The normalized SetuX field key the connectors emit, e.g. identityHolderName — never the provider''s own key.';
comment on column public.field_policies.authority is
  'Descriptive owner of the field. Not an FK: two of the five authorities are not departments yet, and one never will be (arch §20.6).';
comment on column public.field_policies.dependency_group is
  'Fields that change together. Recorded in Phase 1, acted on by the dependency engine in a later phase.';
comment on column public.field_policies.active is
  'False retires a policy without deleting it, so a policy applied to a past request stays readable.';

-- The only read pattern this phase has, and the only one the enforcement helper
-- will have: "the active policies for this record type", ordered for display.
-- A partial index, because an inactive policy is never selected by either path
-- (references/query-partial-indexes.md) — and because it keeps the index the
-- endpoint uses free of rows the endpoint must never return.
create index field_policies_active_record_type_idx
  on public.field_policies (record_type, field_key)
  where active;

comment on index public.field_policies_active_record_type_idx is
  'Serves both reads in this phase: active policies for one record type, and one active policy by (record_type, field_key).';

create trigger field_policies_set_updated_at
  before update on public.field_policies
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled on every table in `public` because `public` is exposed through
-- the Data API (setux_rls.sql header). This table takes the reference-data
-- posture exactly as `service_requirements` and `data_sources` do:
--
--   SELECT for `authenticated`  — the browser may read the policy so the change
--                                 form can explain which fields are eligible
--                                 and why, which the UI is required to do.
--   no INSERT / UPDATE / DELETE policy of any kind — so neither a citizen nor
--                                 an officer can write a policy row from the
--                                 browser under any circumstances. Writes reach
--                                 this table only through the service role,
--                                 which is the backend's own path.
--   `anon`                      — nothing. No policy targets it.
--
-- This is what makes the frontend structurally non-authoritative. A client can
-- read the policy; it cannot author one, and the endpoint that serves it
-- re-reads the table rather than trusting anything the client sends. A forged
-- editability in a request body has nowhere to land: no parameter carries it.
alter table public.field_policies enable row level security;

create policy field_policies_select_authenticated on public.field_policies
  for select to authenticated using (active);

comment on policy field_policies_select_authenticated on public.field_policies is
  'Any signed-in user may read ACTIVE policy rows. Retired policies are not exposed to the browser, and no write policy exists.';

-- -----------------------------------------------------------------------------
-- 4. Synthetic policy seed
-- -----------------------------------------------------------------------------
-- The five record types of arch §20.5. The editability column there is marked
-- "indicative fixture documentation only" — this table is the authoritative
-- version of it, and where a value below differs from the indication, the
-- reason is given inline.
--
-- BANK_DETAILS is seeded even though no bank connector exists. Editability is
-- policy, and policy is configuration: it is knowable before the provider is
-- built, and seeding it now is what lets Phase 1 be complete without reaching
-- into Phase 2 (task §7). No connector, data source or department row is
-- created here.
--
-- Every value is SYNTHETIC. The keys are field NAMES, not anybody's data: this
-- table contains no citizen value of any kind.
--
-- Idempotent, keyed on the natural unique key, exactly like `seed.sql`: re-runs
-- update the policy rather than duplicating or failing. `supabase/seed/seed.sql`
-- carries the same rows so a `db reset` reproduces this state; the seed is
-- repeated here because the linked project is migrated forward, never reset,
-- and an endpoint whose configuration table is empty is an endpoint that does
-- not work.
insert into public.field_policies (
  record_type, field_key, editability, requires_evidence, requires_review,
  authority, dependency_group
)
values
  -- 1. IDENTITY_RECORD — Identity Authority (synthetic), source MOCK_IDENTITY_API
  --
  -- The holder's name is the feature's motivating case (feature.md Phase 17,
  -- the Demo Old Name → new name scenario): changeable, but never on the
  -- citizen's word alone. Evidence and a human decision, both.
  ('IDENTITY_RECORD', 'identityHolderName',        'CONDITIONALLY_EDITABLE', true,  true,  'Identity Authority', 'LEGAL_NAME'),
  -- Date of birth carries the same weight as the legal name and is listed
  -- CONDITIONALLY_EDITABLE by feature.md's own field-class table.
  ('IDENTITY_RECORD', 'identityBirthYear',         'CONDITIONALLY_EDITABLE', true,  true,  'Identity Authority', null),
  -- Contact details are the citizen's own to correct. feature.md classes Mobile
  -- and Address as EDITABLE outright, and no government fact is asserted by
  -- either, so neither evidence nor a reviewer adds anything.
  ('IDENTITY_RECORD', 'identityMobile',            'EDITABLE',               false, false, 'Identity Authority', 'CONTACT'),
  ('IDENTITY_RECORD', 'identityAddress',           'EDITABLE',               false, false, 'Identity Authority', 'ADDRESS'),
  -- The registry's own reference for the record. A system-generated identifier,
  -- IMMUTABLE by feature.md's field-class table: changing it would not correct
  -- the record, it would point at a different one.
  ('IDENTITY_RECORD', 'identityRegistryReference', 'IMMUTABLE',              false, false, 'Identity Authority', null),
  -- Status is a conclusion the registry reached, not a value it was told.
  ('IDENTITY_RECORD', 'identityRecordStatus',      'IMMUTABLE',              false, false, 'Identity Authority', null),

  -- 2. INCOME_RECORD — Revenue Department (synthetic), source MOCK_INCOME_API
  ('INCOME_RECORD',   'incomeCertificateHolder',   'CONDITIONALLY_EDITABLE', true,  true,  'Revenue Department', 'LEGAL_NAME'),
  ('INCOME_RECORD',   'incomeAddress',             'EDITABLE',               false, false, 'Revenue Department', 'ADDRESS'),
  -- The income band is the certificate's FINDING — the assessment the revenue
  -- office performed. A citizen may contest an assessment, but contesting it is
  -- a re-assessment, not a correction, and this service does not perform
  -- re-assessments. IMMUTABLE, per arch §20.5.
  ('INCOME_RECORD',   'incomeBand',                'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeCertificateNumber',   'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeIssuingOffice',       'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeAssessmentYear',      'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeValidUntil',          'IMMUTABLE',              false, false, 'Revenue Department', null),

  -- 3. EDUCATION_RECORD — Higher Education (existing dept), source MOCK_EDUCATION_API
  ('EDUCATION_RECORD', 'educationStudentName',          'CONDITIONALLY_EDITABLE', true,  true,  'Higher Education', 'LEGAL_NAME'),
  ('EDUCATION_RECORD', 'educationEnrolmentNumber',      'IMMUTABLE',              false, false, 'Higher Education', null),
  -- The institution, the marks, the board and the year are the RESULT the board
  -- declared. A correction service corrects what a record says ABOUT a person;
  -- it does not restate an examination outcome. All IMMUTABLE per arch §20.5.
  ('EDUCATION_RECORD', 'educationInstitution',          'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationAggregatePercentage',  'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationBoard',                'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationResultYear',           'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationEnrolmentStatus',      'IMMUTABLE',              false, false, 'Higher Education', null),

  -- 4. COMMUNITY_RECORD — Minority Affairs (existing dept), source DIGILOCKER_MOCK
  ('COMMUNITY_RECORD', 'communityCertificateHolder', 'CONDITIONALLY_EDITABLE', true,  true,  'Minority Affairs', 'LEGAL_NAME'),
  -- The category is the certificate's finding, exactly as the income band is.
  -- Arch §20.5 marks it IMMUTABLE, and the task's own note permits
  -- CONDITIONALLY_EDITABLE "only if supported by the feature design" — it is
  -- not: no phase of feature.md re-determines community status.
  ('COMMUNITY_RECORD', 'communityCategory',          'IMMUTABLE',              false, false, 'Minority Affairs', null),
  ('COMMUNITY_RECORD', 'communityCertificateNumber', 'IMMUTABLE',              false, false, 'Minority Affairs', null),
  ('COMMUNITY_RECORD', 'communityIssuingOffice',     'IMMUTABLE',              false, false, 'Minority Affairs', null),

  -- 5. BANK_DETAILS — Demo Public Bank (Simulated): a PROVIDER, not a department
  --
  -- The account holder name is correctable in principle, and arch §20.5 also
  -- marks it STEP_UP_REQUIRED. That step-up is deliberately NOT a column here:
  -- it is a TARGET STATUS in the change lifecycle (feature.md Phase 12's
  -- aggregation table lists `Bank → STEP_UP_REQUIRED` beside APPLIED and
  -- UNDER_REVIEW), reached when the provider demands its own authentication.
  -- Modelling it as a field attribute in Phase 1 would put a lifecycle state
  -- into a configuration table and pre-empt the phase that owns it.
  ('BANK_DETAILS', 'bankAccountHolder', 'CONDITIONALLY_EDITABLE', true,  true,  'Demo Public Bank (Simulated)', 'LEGAL_NAME'),
  -- A masked number is a rendering of the account, not the account. There is
  -- nothing here to correct.
  ('BANK_DETAILS', 'bankAccountMasked', 'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankBranchCode',    'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankBranchName',    'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankAccountStatus', 'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null)
on conflict (record_type, field_key) do update
  set editability      = excluded.editability,
      requires_evidence = excluded.requires_evidence,
      requires_review   = excluded.requires_review,
      authority         = excluded.authority,
      dependency_group  = excluded.dependency_group,
      active            = true;
