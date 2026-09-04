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
