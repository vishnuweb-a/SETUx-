-- =============================================================================
-- SetuX — Phase 2 — Identity: profiles, organizations, departments
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §9–§15, §42–§45
--         docs/AUTH/authentication-and-rbac.md §41
--
-- Supabase Auth owns credentials. `profiles` is the SetuX-side identity and is
-- keyed by the auth user's UUID (1:1). No password or token material is ever
-- copied into these tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER (the default) — this function must not gain the ability to
-- bypass RLS. `set search_path = ''` prevents search_path hijacking.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: stamps updated_at on every UPDATE. Attached to all mutable SetuX tables.';

-- -----------------------------------------------------------------------------
-- profiles — database-schema.md §9
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  role              public.user_role not null,
  onboarding_status public.onboarding_status not null default 'NOT_STARTED',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Defence in depth against an empty/whitespace identity slipping in.
  constraint profiles_email_not_blank check (length(btrim(email)) > 0)
);

comment on table public.profiles is
  'SetuX identity, 1:1 with auth.users. role and onboarding_status are server-controlled (database-schema.md §10).';

-- database-schema.md §44: role and onboarding_status drive dashboard routing.
create index profiles_role_idx on public.profiles (role);
create index profiles_onboarding_status_idx on public.profiles (onboarding_status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- organizations — database-schema.md §14
-- -----------------------------------------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  status     text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_status_allowed check (status in ('ACTIVE', 'INACTIVE'))
);

comment on table public.organizations is
  'Participating government organizations, e.g. Department of Education / EDU.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- departments — database-schema.md §15
-- -----------------------------------------------------------------------------
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  code            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- database-schema.md §15: code is unique within its organization, not globally.
  constraint departments_org_code_unique unique (organization_id, code)
);

comment on table public.departments is
  'Departments within an organization. Officer authorization is scoped by department (auth-and-rbac §21).';

-- The unique constraint already indexes (organization_id, code) left-to-right,
-- which covers organization_id lookups; no separate FK index is needed.

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- citizen_profiles — database-schema.md §11
-- -----------------------------------------------------------------------------
create table public.citizen_profiles (
  id            uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE: the citizen profile has no meaning without its identity.
  user_id       uuid not null unique references public.profiles (id) on delete cascade,
  full_name     text not null,
  -- Synthetic demo identifier for the SIH prototype — never a real Aadhaar number.
  government_id text not null unique,
  mobile_number text not null,
  date_of_birth date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint citizen_profiles_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint citizen_profiles_dob_in_past check (date_of_birth is null or date_of_birth < current_date)
);

comment on table public.citizen_profiles is
  'Citizen onboarding data. government_id is a synthetic prototype identifier (database-design.md §5.2).';

-- database-schema.md §44: government_id is a unique lookup key; the UNIQUE
-- constraint provides its index, as it does for user_id.

create trigger citizen_profiles_set_updated_at
  before update on public.citizen_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- government_profiles — database-schema.md §13
-- -----------------------------------------------------------------------------
create table public.government_profiles (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references public.profiles (id) on delete cascade,
  -- RESTRICT: an organization/department with staff attached must not vanish.
  organization_id        uuid not null references public.organizations (id) on delete restrict,
  department_id          uuid not null references public.departments (id) on delete restrict,
  full_name              text not null,
  employee_id            text not null,
  designation            text not null,
  official_mobile_number text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- database-schema.md §45: employee ids are unique per organization.
  constraint government_profiles_org_employee_unique unique (organization_id, employee_id),
  constraint government_profiles_full_name_not_blank check (length(btrim(full_name)) > 0)
);

comment on table public.government_profiles is
  'Government officer onboarding data, scoped to an organization and department.';

-- database-schema.md §44: officer lookup by employee_id and by organization.
-- (organization_id, employee_id) UNIQUE covers organization_id prefix lookups.
create index government_profiles_employee_id_idx on public.government_profiles (employee_id);
create index government_profiles_department_id_idx on public.government_profiles (department_id);

create trigger government_profiles_set_updated_at
  before update on public.government_profiles
  for each row execute function public.set_updated_at();
