-- =============================================================================
-- SetuX — Phase 2 — Synthetic seed data
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §59
--         docs/lld/database-design.md §18
--
-- Seeds ONLY the reference/configuration data the prototype needs:
--   1 organization, 1 department, 1 service, 4 data sources, 4 requirements.
--
-- No citizen, officer, or application rows are seeded here. Those depend on
-- Supabase Auth users, which Phase 3 introduces — creating profile rows without
-- a matching auth.users row would violate the profiles → auth.users foreign key.
--
-- Every value is SYNTHETIC. Never load real citizen or government records.
--
-- Idempotent: safe to run repeatedly. Rows are keyed by their natural unique
-- code, so re-running updates the descriptive fields rather than duplicating.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organization
-- -----------------------------------------------------------------------------
insert into public.organizations (name, code, status)
values ('Department of Education', 'EDU', 'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- 2. Department
-- -----------------------------------------------------------------------------
-- `services.department` is matched against `departments.name` when scoping
-- officer visibility, so this name must stay in step with the service below.
insert into public.departments (organization_id, name, code)
select o.id, 'Higher Education', 'HIGHER_ED'
from public.organizations o
where o.code = 'EDU'
on conflict (organization_id, code) do update
  set name = excluded.name;

-- -----------------------------------------------------------------------------
-- 3. Service — the single MVP service
-- -----------------------------------------------------------------------------
insert into public.services (code, name, description, department, status)
values (
  'SCHOLARSHIP',
  'National Scholarship',
  'Merit-cum-means scholarship for students in higher education. SetuX verifies identity, education and income records with the issuing departments on the applicant''s behalf.',
  'Higher Education',
  'ACTIVE'
)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      department = excluded.department,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- 4. Data sources — the simulated government systems
-- -----------------------------------------------------------------------------
insert into public.data_sources (code, name, type, status)
values
  ('DIGILOCKER_MOCK',    'DigiLocker (Mock)',                  'DIGILOCKER', 'ACTIVE'),
  ('MOCK_IDENTITY_API',  'Identity Registry (Mock)',           'MOCK_API',   'ACTIVE'),
  ('MOCK_EDUCATION_API', 'Education Department (Mock)',        'MOCK_API',   'ACTIVE'),
  ('MOCK_INCOME_API',    'Income & Revenue Department (Mock)', 'MOCK_API',   'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      type = excluded.type,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- 5. Service requirements — what the scholarship needs, and who supplies it
-- -----------------------------------------------------------------------------
insert into public.service_requirements (
  service_id, requirement_code, name, description,
  requirement_type, data_source_id, required, display_order
)
select
  s.id, r.requirement_code, r.name, r.description,
  r.requirement_type, ds.id, r.required, r.display_order
from public.services s
cross join (values
  ('IDENTITY',         'Identity Verification', 'Confirms the applicant''s identity against the national identity registry.', 'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('EDUCATION_RECORD', 'Education Record',      'Latest examination result and enrolment record from the education department.', 'RECORD',    'MOCK_EDUCATION_API', true,  2),
  ('INCOME_RECORD',    'Income Certificate',    'Annual family income as certified by the revenue department.',                 'RECORD',    'MOCK_INCOME_API',    true,  3),
  ('BANK_DETAILS',     'Bank Account Proof',    'Bank passbook or cancelled cheque retrieved from DigiLocker for disbursement.', 'DOCUMENT',  'DIGILOCKER_MOCK',    false, 4)
) as r (requirement_code, name, description, requirement_type, data_source_code, required, display_order)
join public.data_sources ds on ds.code = r.data_source_code
where s.code = 'SCHOLARSHIP'
on conflict (service_id, requirement_code) do update
  set name = excluded.name,
      description = excluded.description,
      requirement_type = excluded.requirement_type,
      data_source_id = excluded.data_source_id,
      required = excluded.required,
      display_order = excluded.display_order;

-- =============================================================================
-- Phase 5 — Catalogue demonstration data
-- =============================================================================
-- The MVP workflow runs on SCHOLARSHIP above; it stays the primary service and
-- keeps its requirements. The rows below exist so the catalogue screen can be
-- exercised as a catalogue — several cards, more than one department to filter
-- by, search terms that match some rows and not others, and a second page at
-- the default page size (Phase 5 §14).
--
-- SCHOLARSHIP_LEGACY is INACTIVE on purpose. It is the fixture the visibility
-- rule is tested against: it must never appear in the list, and requesting it
-- by id must answer 404 exactly as an unknown id does (Phase 5 §25, §45).
--
-- Every value is SYNTHETIC. No real scheme, applicant, or department record.
-- Idempotent, keyed on `code`, like every insert above.
-- -----------------------------------------------------------------------------

-- Departments backing the additional services. `services.department` is matched
-- against `departments.name` when officer visibility is scoped, so every
-- department a service names must exist as a row (setux_rls.sql,
-- officer_can_read_application).
insert into public.departments (organization_id, name, code)
select o.id, d.name, d.code
from public.organizations o
cross join (values
  ('Technical Education', 'TECH_ED'),
  ('Social Welfare',      'SOCIAL_WELFARE'),
  ('Minority Affairs',    'MINORITY_AFFAIRS')
) as d (name, code)
where o.code = 'EDU'
on conflict (organization_id, code) do update
  set name = excluded.name;

insert into public.services (code, name, description, department, status)
values
  (
    'SCHOLARSHIP_MERIT',
    'National Merit Scholarship',
    'Merit-based scholarship for undergraduate students pursuing higher education in India. SetuX verifies the applicant''s examination results with the education department on their behalf.',
    'Higher Education',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_TECH',
    'Technical Education Grant',
    'Tuition support for students enrolled in recognised diploma and engineering programmes. Enrolment and fee records are retrieved from the technical education board.',
    'Technical Education',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_GIRL_CHILD',
    'Girl Child Education Scholarship',
    'Annual scholarship supporting girl students continuing into higher secondary and undergraduate study. Eligibility is confirmed against school enrolment and family income records.',
    'Social Welfare',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_MINORITY',
    'Minority Welfare Scholarship',
    'Post-matric scholarship for students from notified minority communities. Income and community status are verified with the issuing departments.',
    'Minority Affairs',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_RESEARCH',
    'Research Fellowship Support',
    'Monthly fellowship for postgraduate researchers at recognised institutions. Enrolment and supervisor confirmation are retrieved from the education department.',
    'Higher Education',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_SPORTS',
    'Sports Excellence Scholarship',
    'Support for students representing their state or country in recognised sporting events, alongside continuing education.',
    'Social Welfare',
    'ACTIVE'
  ),
  (
    'SCHOLARSHIP_LEGACY',
    'Legacy Scholarship Scheme (Withdrawn)',
    'A scheme no longer offered through SetuX. Retained only so the catalogue''s publication rule can be demonstrated: it must never be visible to a citizen.',
    'Higher Education',
    'INACTIVE'
  )
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      department = excluded.department,
      status = excluded.status;

-- Requirements for the additional services.
--
-- Each row names the simulated government system that supplies it, which is
-- what the detail screen shows the citizen before they consent to anything.
-- The set differs per service so the detail screens are distinguishable rather
-- than six copies of one list.
insert into public.service_requirements (
  service_id, requirement_code, name, description,
  requirement_type, data_source_id, required, display_order
)
select
  s.id, r.requirement_code, r.name, r.description,
  r.requirement_type, ds.id, r.required, r.display_order
from (values
  ('SCHOLARSHIP_MERIT', 'IDENTITY',         'Identity Verification',    'Confirms the applicant''s identity against the national identity registry.',              'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_MERIT', 'EDUCATION_RECORD', 'Class 12 Result',          'Higher secondary examination result retrieved from the education department.',             'RECORD',      'MOCK_EDUCATION_API', true,  2),
  ('SCHOLARSHIP_MERIT', 'INCOME_RECORD',    'Income Certificate',       'Annual family income as certified by the revenue department.',                            'RECORD',      'MOCK_INCOME_API',    true,  3),
  ('SCHOLARSHIP_MERIT', 'BANK_DETAILS',     'Bank Account Proof',       'Bank passbook or cancelled cheque retrieved from DigiLocker for disbursement.',           'DOCUMENT',    'DIGILOCKER_MOCK',    false, 4),

  ('SCHOLARSHIP_TECH', 'IDENTITY',          'Identity Verification',    'Confirms the applicant''s identity against the national identity registry.',              'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_TECH', 'EDUCATION_RECORD',  'Enrolment Record',         'Current diploma or degree enrolment confirmed with the technical education board.',       'RECORD',      'MOCK_EDUCATION_API', true,  2),
  ('SCHOLARSHIP_TECH', 'INCOME_RECORD',     'Income Certificate',       'Annual family income as certified by the revenue department.',                            'RECORD',      'MOCK_INCOME_API',    true,  3),

  ('SCHOLARSHIP_GIRL_CHILD', 'IDENTITY',         'Identity Verification',  'Confirms the applicant''s identity against the national identity registry.',           'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_GIRL_CHILD', 'EDUCATION_RECORD', 'School Enrolment',       'Continuing enrolment confirmed with the education department.',                        'RECORD',      'MOCK_EDUCATION_API', true,  2),
  ('SCHOLARSHIP_GIRL_CHILD', 'INCOME_RECORD',    'Income Certificate',     'Annual family income as certified by the revenue department.',                         'RECORD',      'MOCK_INCOME_API',    true,  3),
  ('SCHOLARSHIP_GIRL_CHILD', 'GUARDIAN_DECL',    'Guardian Declaration',   'Declaration by a parent or guardian, provided by the applicant.',                      'DECLARATION', null,                 false, 4),

  ('SCHOLARSHIP_MINORITY', 'IDENTITY',         'Identity Verification',   'Confirms the applicant''s identity against the national identity registry.',            'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_MINORITY', 'COMMUNITY_RECORD', 'Community Certificate',   'Community status certificate retrieved from DigiLocker.',                               'DOCUMENT',    'DIGILOCKER_MOCK',    true,  2),
  ('SCHOLARSHIP_MINORITY', 'INCOME_RECORD',    'Income Certificate',      'Annual family income as certified by the revenue department.',                          'RECORD',      'MOCK_INCOME_API',    true,  3),

  ('SCHOLARSHIP_RESEARCH', 'IDENTITY',         'Identity Verification',   'Confirms the applicant''s identity against the national identity registry.',            'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_RESEARCH', 'EDUCATION_RECORD', 'Postgraduate Record',     'Postgraduate enrolment and result history from the education department.',              'RECORD',      'MOCK_EDUCATION_API', true,  2),
  ('SCHOLARSHIP_RESEARCH', 'BANK_DETAILS',     'Bank Account Proof',      'Bank passbook or cancelled cheque retrieved from DigiLocker for disbursement.',         'DOCUMENT',    'DIGILOCKER_MOCK',    true,  3),

  ('SCHOLARSHIP_SPORTS', 'IDENTITY',           'Identity Verification',   'Confirms the applicant''s identity against the national identity registry.',            'IDENTITY',    'MOCK_IDENTITY_API',  true,  1),
  ('SCHOLARSHIP_SPORTS', 'EDUCATION_RECORD',   'Enrolment Record',        'Current enrolment confirmed with the education department.',                            'RECORD',      'MOCK_EDUCATION_API', true,  2),
  ('SCHOLARSHIP_SPORTS', 'ACHIEVEMENT_DECL',   'Achievement Declaration', 'Representation record declared by the applicant and countersigned by the institution.', 'DECLARATION', null,                 true,  3)
) as r (
  service_code, requirement_code, name, description,
  requirement_type, data_source_code, required, display_order
)
join public.services s on s.code = r.service_code
-- LEFT JOIN: `data_source_id` is nullable, and a DECLARATION is supplied by the
-- citizen rather than fetched from a government system. An inner join would
-- silently drop those rows.
left join public.data_sources ds on ds.code = r.data_source_code
on conflict (service_id, requirement_code) do update
  set name = excluded.name,
      description = excluded.description,
      requirement_type = excluded.requirement_type,
      data_source_id = excluded.data_source_id,
      required = excluded.required,
      display_order = excluded.display_order;

-- =============================================================================
-- Change & Correction Service — Phase 1 — Editable field policy
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §11, §20.5, §25
--
-- `field_policies` is configuration in exactly the sense the tables above are:
-- it describes what SetuX permits, and holds no citizen data. The rows are
-- therefore seeded here, so a `supabase db reset` reproduces a working policy
-- endpoint from an empty database.
--
-- The Phase 1 migration (`20260907182417_setux_field_policies.sql`) carries the
-- SAME rows, because the linked project is migrated forward and never reset. If
-- these two ever disagree, the migration is authoritative — it is what the live
-- project actually ran. Both are idempotent and keyed on
-- (record_type, field_key), so applying either after the other is a no-op.
--
-- The reasoning behind each editability decision lives in the migration, beside
-- the rows, and is not repeated here.
--
-- Every value is SYNTHETIC: these are field NAMES and policy flags, never
-- anybody's data.
-- -----------------------------------------------------------------------------
insert into public.field_policies (
  record_type, field_key, editability, requires_evidence, requires_review,
  authority, dependency_group
)
values
  ('IDENTITY_RECORD', 'identityHolderName',        'CONDITIONALLY_EDITABLE', true,  true,  'Identity Authority', 'LEGAL_NAME'),
  ('IDENTITY_RECORD', 'identityBirthYear',         'CONDITIONALLY_EDITABLE', true,  true,  'Identity Authority', null),
  ('IDENTITY_RECORD', 'identityMobile',            'EDITABLE',               false, false, 'Identity Authority', 'CONTACT'),
  ('IDENTITY_RECORD', 'identityAddress',           'EDITABLE',               false, false, 'Identity Authority', 'ADDRESS'),
  ('IDENTITY_RECORD', 'identityRegistryReference', 'IMMUTABLE',              false, false, 'Identity Authority', null),
  ('IDENTITY_RECORD', 'identityRecordStatus',      'IMMUTABLE',              false, false, 'Identity Authority', null),

  ('INCOME_RECORD',   'incomeCertificateHolder',   'CONDITIONALLY_EDITABLE', true,  true,  'Revenue Department', 'LEGAL_NAME'),
  ('INCOME_RECORD',   'incomeAddress',             'EDITABLE',               false, false, 'Revenue Department', 'ADDRESS'),
  ('INCOME_RECORD',   'incomeBand',                'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeCertificateNumber',   'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeIssuingOffice',       'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeAssessmentYear',      'IMMUTABLE',              false, false, 'Revenue Department', null),
  ('INCOME_RECORD',   'incomeValidUntil',          'IMMUTABLE',              false, false, 'Revenue Department', null),

  ('EDUCATION_RECORD', 'educationStudentName',         'CONDITIONALLY_EDITABLE', true,  true,  'Higher Education', 'LEGAL_NAME'),
  ('EDUCATION_RECORD', 'educationEnrolmentNumber',     'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationInstitution',         'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationAggregatePercentage', 'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationBoard',               'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationResultYear',          'IMMUTABLE',              false, false, 'Higher Education', null),
  ('EDUCATION_RECORD', 'educationEnrolmentStatus',     'IMMUTABLE',              false, false, 'Higher Education', null),

  ('COMMUNITY_RECORD', 'communityCertificateHolder', 'CONDITIONALLY_EDITABLE', true,  true,  'Minority Affairs', 'LEGAL_NAME'),
  ('COMMUNITY_RECORD', 'communityCategory',          'IMMUTABLE',              false, false, 'Minority Affairs', null),
  ('COMMUNITY_RECORD', 'communityCertificateNumber', 'IMMUTABLE',              false, false, 'Minority Affairs', null),
  ('COMMUNITY_RECORD', 'communityIssuingOffice',     'IMMUTABLE',              false, false, 'Minority Affairs', null),

  ('BANK_DETAILS', 'bankAccountHolder', 'CONDITIONALLY_EDITABLE', true,  true,  'Demo Public Bank (Simulated)', 'LEGAL_NAME'),
  ('BANK_DETAILS', 'bankAccountMasked', 'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankBranchCode',    'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankBranchName',    'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null),
  ('BANK_DETAILS', 'bankAccountStatus', 'IMMUTABLE',              false, false, 'Demo Public Bank (Simulated)', null)
on conflict (record_type, field_key) do update
  set editability       = excluded.editability,
      requires_evidence = excluded.requires_evidence,
      requires_review   = excluded.requires_review,
      authority         = excluded.authority,
      dependency_group  = excluded.dependency_group,
      active            = true;

-- =============================================================================
-- Phase 2 (Change & Correction Service) — record registry routing
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §20.6
--         docs/DATABASE/citizen-records.md §5
--
-- Carried here as well as in 20260907185358_setux_citizen_records.sql, for the
-- same reason the field policy seed is carried in both places: the linked
-- project is migrated forward and never reset, while `supabase db reset`
-- replays migrations and then runs THIS file. Both are idempotent on the same
-- natural keys, so whichever runs second is a no-op.
--
-- These are ROUTING rows only — an organization, two departments and one data
-- source. No citizen record and no field value is seeded here: those need a
-- real `profiles.id`, which needs a Supabase auth user, which SQL cannot create
-- (arch §21). Demo records are provisioned by
-- `scripts/seed-change-correction-demo.mjs`.

-- A synthetic whole-of-government parent. `departments.organization_id` is NOT
-- NULL, and "Revenue Department, a department of the Department of Education"
-- would be incoherent, so the non-education authorities get their own parent
-- rather than being hung off EDU.
insert into public.organizations (name, code, status)
values ('Government of Demo State (Simulated)', 'DEMO_GOV', 'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      status = excluded.status;

-- The two authorities that do not otherwise exist. Higher Education and
-- Minority Affairs are NOT re-created above — they are reused, because the
-- officer fixture already belongs to Higher Education and forking the row would
-- separate the department a target routes to from the one an officer is in.
insert into public.departments (organization_id, name, code)
select o.id, d.name, d.code
from public.organizations o
cross join (values
  ('Identity Authority',  'IDENTITY_AUTHORITY'),
  ('Revenue Department',  'REVENUE_DEPT')
) as d (name, code)
where o.code = 'DEMO_GOV'
on conflict (organization_id, code) do update
  set name = excluded.name;

-- The synthetic banking provider. METADATA ONLY: no bank connector, step-up
-- authentication, OTP or network call exists in this phase (arch §24). The row
-- exists so a BANK_DETAILS record can name where it comes from. The existing
-- DigiLocker BANK_DETAILS *document* requirement is unchanged.
insert into public.data_sources (code, name, type, status)
values ('MOCK_BANK_API', 'Demo Public Bank (Simulated)', 'MOCK_API', 'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      type = excluded.type,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- Change & Correction Service — Phase 5 dependency rules
-- -----------------------------------------------------------------------------
-- Carried here as well as in 20260908180115_setux_change_dependency_rules.sql,
-- for the same reason the field policies are: the migration keeps the linked
-- project working (it is migrated forward, never reset), and this keeps a
-- `db reset` producing the same configuration rather than an impact engine with
-- no rules to evaluate.
--
-- These rules are the canonical name-change scenario (arch §23) plus the one
-- address rule the seeded policy set supports. Each names a source and target
-- field that exist in `field_policies` above, and each carries a citizen-facing
-- reason. No rule asserts a law or a real government process — every one is a
-- statement about which synthetic records in this prototype hold the same
-- synthetic value.
--
-- The department LEFT JOIN is deliberate: BANK_DETAILS has no responsible
-- department because the bank is a provider rather than a government office
-- (arch §20.6, §8.1). This file seeds `HIGHER_ED` and `MINORITY_AFFAIRS` above,
-- so all four departmental rules resolve here.
--
-- Idempotent on the natural key, exactly like every other insert in this file.
insert into public.change_dependency_rules (
  source_record_type, source_field_key,
  target_record_type, target_field_key,
  impact_level, responsible_department_id, reason
)
select
  r.source_record_type, r.source_field_key,
  r.target_record_type, r.target_field_key,
  r.impact_level::public.change_impact_level,
  d.id,
  r.reason
from (values
  (
    'IDENTITY_RECORD', 'identityHolderName',
    'INCOME_RECORD',   'incomeCertificateHolder',
    'REQUIRED', 'REVENUE_DEPT',
    'Your income certificate is issued in the same name. If it is not updated too, the two records will disagree and the certificate may not be accepted.'
  ),
  (
    'IDENTITY_RECORD',   'identityHolderName',
    'EDUCATION_RECORD',  'educationStudentName',
    'RECOMMENDED', 'HIGHER_ED',
    'Your education record shows the same name. Updating it as well helps avoid a mismatch the next time your enrolment details are checked.'
  ),
  (
    'IDENTITY_RECORD',   'identityHolderName',
    'COMMUNITY_RECORD',  'communityCertificateHolder',
    'RECOMMENDED', 'MINORITY_AFFAIRS',
    'Your community certificate is issued in the same name. Updating it as well helps avoid a mismatch when the certificate is next used.'
  ),
  (
    'IDENTITY_RECORD', 'identityHolderName',
    'BANK_DETAILS',    'bankAccountHolder',
    'OPTIONAL', null,
    'Your bank account is held in the same name. This account is with a bank rather than a government department, so updating it is your choice.'
  ),
  (
    'IDENTITY_RECORD', 'identityAddress',
    'INCOME_RECORD',   'incomeAddress',
    'RECOMMENDED', 'REVENUE_DEPT',
    'Your income certificate records the same address. Updating it as well helps make sure letters about it reach you.'
  )
) as r (
  source_record_type, source_field_key,
  target_record_type, target_field_key,
  impact_level, department_code, reason
)
left join public.departments d on d.code = r.department_code
on conflict (source_record_type, source_field_key, target_record_type, target_field_key)
do update
  set impact_level              = excluded.impact_level,
      responsible_department_id = excluded.responsible_department_id,
      reason                    = excluded.reason,
      active                    = true;
