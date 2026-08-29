-- =============================================================================
-- SetuX — Phase 2 — Applications and application-scoped records
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §18–§24, §26–§30, §34, §36, §38, §50
--         docs/lld/database-design.md §5.6–§5.16
--
-- `applications` is the central business entity. Everything below it is
-- application-scoped and inherits its ownership for authorization purposes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Application number sequence — database-schema.md §50
-- -----------------------------------------------------------------------------
-- Format: STX-{YEAR}-{SEQUENCE}, e.g. STX-2026-000001.
-- Generated server-side only; the frontend must never construct one.
create sequence public.application_number_seq as bigint start with 1 increment by 1;

create or replace function public.next_application_number()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'STX-'
      || to_char(now() at time zone 'utc', 'YYYY')
      || '-'
      || lpad(nextval('public.application_number_seq')::text, 6, '0');
$$;

comment on function public.next_application_number() is
  'Returns the next human-readable application number, STX-{YEAR}-{SEQUENCE} (database-schema.md §50).';

-- -----------------------------------------------------------------------------
-- applications — database-schema.md §18
-- -----------------------------------------------------------------------------
create table public.applications (
  id                    uuid primary key default gen_random_uuid(),
  application_number    text not null unique default public.next_application_number(),
  -- RESTRICT (database-schema.md §43): application history must not disappear
  -- because an identity row was removed.
  citizen_id            uuid not null references public.profiles (id) on delete restrict,
  service_id            uuid not null references public.services (id) on delete restrict,
  status                public.application_status not null default 'DRAFT',
  current_workflow_step text,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint applications_number_format check (application_number ~ '^STX-[0-9]{4}-[0-9]{6}$'),
  -- A DRAFT has by definition not been submitted; any post-submission state has.
  constraint applications_submitted_at_matches_status check (
    (status = 'DRAFT' and submitted_at is null)
    or (status <> 'DRAFT')
  )
);

comment on table public.applications is
  'Central business entity. Owned by exactly one citizen; status transitions are validated by the backend.';

-- database-schema.md §44.
create index applications_citizen_id_idx on public.applications (citizen_id);
create index applications_service_id_idx on public.applications (service_id);
create index applications_status_idx on public.applications (status);
-- database-design.md §9: the officer queue filters by status and service, newest first.
create index applications_officer_queue_idx
  on public.applications (status, service_id, created_at desc);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- consents — database-schema.md §28, database-design.md §5.10
-- -----------------------------------------------------------------------------
-- Consent is purpose-specific and scoped to (citizen, application, data source).
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  citizen_id     uuid not null references public.profiles (id) on delete restrict,
  data_source_id uuid not null references public.data_sources (id) on delete restrict,
  purpose        text not null,
  status         public.consent_status not null default 'PENDING',
  version        text not null default 'v1',
  granted_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One consent record per application/source pair; its status is what changes.
  constraint consents_application_source_unique unique (application_id, data_source_id),
  constraint consents_purpose_not_blank check (length(btrim(purpose)) > 0),
  -- Timestamps must corroborate the status they claim.
  constraint consents_granted_at_required check (status <> 'GRANTED' or granted_at is not null),
  constraint consents_revoked_at_required check (status <> 'REVOKED' or revoked_at is not null)
);

comment on table public.consents is
  'Citizen authorization for SetuX to retrieve data from one source for one application and purpose.';

-- database-design.md §9.
create index consents_application_id_idx on public.consents (application_id);
create index consents_citizen_id_idx on public.consents (citizen_id);
create index consents_data_source_id_idx on public.consents (data_source_id);

create trigger consents_set_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- data_retrievals — database-schema.md §26, §53
-- -----------------------------------------------------------------------------
-- Retains the full attempt history so the prototype can demonstrate
-- timeout → retry → success against a flaky government system.
create table public.data_retrievals (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.applications (id) on delete cascade,
  data_source_id    uuid not null references public.data_sources (id) on delete restrict,
  -- Nullable: a retrieval attempt is recorded even if consent was later revoked.
  consent_id        uuid references public.consents (id) on delete set null,
  request_reference text,
  status            public.retrieval_status not null default 'PENDING',
  attempt_number    integer not null default 1,
  response_metadata jsonb,
  error_code        text,
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint data_retrievals_attempt_number_positive check (attempt_number > 0),
  constraint data_retrievals_completed_after_started
    check (completed_at is null or started_at is null or completed_at >= started_at)
);

comment on table public.data_retrievals is
  'One row per external-system retrieval attempt, including failures and retries (database-schema.md §27, §53).';

-- database-schema.md §44.
create index data_retrievals_application_id_idx on public.data_retrievals (application_id);
create index data_retrievals_status_idx on public.data_retrievals (status);
create index data_retrievals_data_source_id_idx on public.data_retrievals (data_source_id);
create index data_retrievals_consent_id_idx on public.data_retrievals (consent_id);

create trigger data_retrievals_set_updated_at
  before update on public.data_retrievals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- application_data — database-schema.md §22, database-design.md §5.8
-- -----------------------------------------------------------------------------
-- Canonical, normalized data for an application. JSONB holds the value because
-- external sources return differing shapes; identity/security-relevant columns
-- stay relational (database-schema.md §23).
create table public.application_data (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references public.applications (id) on delete cascade,
  field_code          text not null,
  field_value         jsonb not null,
  -- Nullable: citizen-declared fields have no external source.
  source_id           uuid references public.data_sources (id) on delete restrict,
  source_type         text,
  -- Reference to the external record rather than a copy of it (§24).
  source_reference    text,
  verification_status public.data_verification_status not null default 'PENDING',
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint application_data_field_unique unique (application_id, field_code),
  constraint application_data_field_code_not_blank check (length(btrim(field_code)) > 0),
  constraint application_data_verified_at_required
    check (verification_status <> 'VERIFIED' or verified_at is not null)
);

comment on table public.application_data is
  'Canonical SetuX representation of application field values, with provenance and verification state.';

-- (application_id, field_code) UNIQUE covers application_id prefix lookups.
create index application_data_source_id_idx on public.application_data (source_id);

create trigger application_data_set_updated_at
  before update on public.application_data
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- verifications — database-schema.md §34
-- -----------------------------------------------------------------------------
create table public.verifications (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.applications (id) on delete cascade,
  verification_type text not null,
  status            public.verification_status not null default 'PENDING',
  source_id         uuid references public.data_sources (id) on delete restrict,
  -- Normalized SetuX result, not the raw provider payload (§35).
  result            jsonb,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint verifications_type_allowed
    check (verification_type in ('IDENTITY', 'EDUCATION', 'INCOME')),
  constraint verifications_application_type_unique unique (application_id, verification_type),
  constraint verifications_verified_at_required
    check (status <> 'VERIFIED' or verified_at is not null)
);

comment on table public.verifications is
  'Normalized verification outcome per application and check type (database-schema.md §35).';

-- database-schema.md §44: verifications(application_id, verification_type) —
-- provided by the UNIQUE constraint above.
create index verifications_source_id_idx on public.verifications (source_id);

create trigger verifications_set_updated_at
  before update on public.verifications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- application_reviews — database-schema.md §36
-- -----------------------------------------------------------------------------
-- Append-only decision history: never overwrite a past decision
-- (database-design.md §5.15).
create table public.application_reviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  -- RESTRICT: a decision must remain attributable to its reviewer.
  reviewer_id    uuid not null references public.profiles (id) on delete restrict,
  department_id  uuid references public.departments (id) on delete restrict,
  decision       public.review_decision not null,
  remarks        text,
  reviewed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A rejection must always carry a reason (docs/PHASES/phase.md Phase 11).
  constraint application_reviews_rejection_needs_remarks
    check (decision <> 'REJECTED' or length(btrim(coalesce(remarks, ''))) > 0)
);

comment on table public.application_reviews is
  'Government officer decisions. Append-only; the reviewer comes from the authenticated session, never the client.';

-- database-schema.md §44.
create index application_reviews_application_id_idx on public.application_reviews (application_id);
create index application_reviews_reviewer_id_idx on public.application_reviews (reviewer_id);
create index application_reviews_department_id_idx on public.application_reviews (department_id);

create trigger application_reviews_set_updated_at
  before update on public.application_reviews
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- application_events — database-schema.md §38, §39
-- -----------------------------------------------------------------------------
-- Append-only history. Current state lives on applications.status; this table
-- reconstructs the citizen timeline. No updated_at: events are never modified.
create table public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  event_type     text not null,
  -- Nullable + SET NULL: system-generated events have no actor, and history
  -- must survive the removal of the actor's identity.
  actor_user_id  uuid references public.profiles (id) on delete set null,
  step_code      text,
  metadata       jsonb,
  created_at     timestamptz not null default now(),

  constraint application_events_event_type_not_blank check (length(btrim(event_type)) > 0)
);

comment on table public.application_events is
  'Append-only application lifecycle timeline (database-schema.md §39).';

-- database-schema.md §44: timeline reads are per application, newest last.
create index application_events_application_id_created_at_idx
  on public.application_events (application_id, created_at);
create index application_events_actor_user_id_idx on public.application_events (actor_user_id);

-- -----------------------------------------------------------------------------
-- notifications — database-schema.md §40
-- -----------------------------------------------------------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  type           text not null,
  title          text not null,
  message        text not null,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),

  constraint notifications_title_not_blank check (length(btrim(title)) > 0)
);

comment on table public.notifications is
  'In-app notification records. read_at NULL means unread (database-schema.md §40).';

-- database-schema.md §44: the unread badge queries (user_id, read_at).
create index notifications_user_id_read_at_idx on public.notifications (user_id, read_at);
create index notifications_application_id_idx on public.notifications (application_id);

-- -----------------------------------------------------------------------------
-- audit_logs — database-schema.md §41
-- -----------------------------------------------------------------------------
-- Append-only security record. Never store credentials, tokens, or full
-- government IDs in `metadata` (database-schema.md §41, AGENT.md §15).
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  -- SET NULL: the audit trail must outlive the actor's profile.
  actor_user_id  uuid references public.profiles (id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  correlation_id text,
  metadata       jsonb,
  created_at     timestamptz not null default now(),

  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0)
);

comment on table public.audit_logs is
  'Append-only audit trail of security-sensitive actions. Readable only through the backend service role.';

-- database-schema.md §44.
create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_correlation_id_idx on public.audit_logs (correlation_id);
