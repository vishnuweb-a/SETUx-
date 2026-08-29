-- =============================================================================
-- SetuX — Phase 2 — Service catalogue and external data sources
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §16, §17, §25
--         docs/lld/database-design.md §5.4, §5.5, §5.12
--
-- These are configuration/reference tables. They describe *what* SetuX can do
-- and *which* external systems it federates with. They hold no citizen data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- services — database-schema.md §16
-- -----------------------------------------------------------------------------
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  -- database-design.md §5.4 models the owning department as descriptive text on
  -- the service; organizations/departments remain the authorization structure.
  department  text not null,
  status      text not null default 'ACTIVE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint services_status_allowed check (status in ('ACTIVE', 'INACTIVE'))
);

comment on table public.services is
  'Government services offered through SetuX. The SIH prototype seeds one: SCHOLARSHIP.';

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- data_sources — database-schema.md §25
-- -----------------------------------------------------------------------------
create table public.data_sources (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  type       public.data_source_type not null,
  status     text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint data_sources_status_allowed check (status in ('ACTIVE', 'INACTIVE'))
);

comment on table public.data_sources is
  'External systems SetuX federates with. For the SIH prototype these are the mock connectors.';

create trigger data_sources_set_updated_at
  before update on public.data_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- service_requirements — database-schema.md §17
-- -----------------------------------------------------------------------------
-- Lets the scholarship workflow be configured rather than hard-coded.
create table public.service_requirements (
  id               uuid primary key default gen_random_uuid(),
  service_id       uuid not null references public.services (id) on delete cascade,
  requirement_code text not null,
  name             text not null,
  description      text,
  requirement_type text not null,
  -- Nullable: a requirement may be citizen-supplied rather than fetched.
  data_source_id   uuid references public.data_sources (id) on delete restrict,
  required         boolean not null default true,
  display_order    integer not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint service_requirements_code_unique unique (service_id, requirement_code),
  constraint service_requirements_type_allowed
    check (requirement_type in ('IDENTITY', 'DOCUMENT', 'RECORD', 'DECLARATION')),
  constraint service_requirements_display_order_positive check (display_order > 0)
);

comment on table public.service_requirements is
  'What a service requires (IDENTITY, EDUCATION_RECORD, INCOME_RECORD, …) and which source supplies it.';

-- FK lookup: the catalogue always reads requirements by service.
-- (service_id, requirement_code) UNIQUE covers service_id prefix lookups.
create index service_requirements_data_source_id_idx
  on public.service_requirements (data_source_id);

create trigger service_requirements_set_updated_at
  before update on public.service_requirements
  for each row execute function public.set_updated_at();
