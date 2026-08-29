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
