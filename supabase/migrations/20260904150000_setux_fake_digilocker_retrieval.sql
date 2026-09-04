-- =============================================================================
-- SetuX — Phase 8 — Fake DigiLocker retrieval
-- =============================================================================
-- Phase 7 made the citizen's authorization recordable. Phase 8 is the first
-- phase that *acts* on it:
--
--   GRANTED consent → fake DigiLocker connector → normalized data → persisted
--
-- Everything the retrieval needs already exists in the schema from Phase 2:
-- `data_retrievals` (§26), `application_data` (§22), `application_events`
-- (§38), the `retrieval_status` enum, and RLS on all three. This migration adds
-- no table and no enum. It adds:
--
--   1. the invariants that make a retrieval attempt auditable;
--   2. a partial unique index that makes retrieval idempotent under retry;
--   3. one atomic function that performs the whole commit.
--
-- Phase 8 is retrieval ONLY. Nothing here writes `verifications`,
-- `application_reviews`, or moves `applications.status`. Retrieval is not
-- verification (Phase 8 §42) — that is Phase 9/10.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A retrieval attempt is scoped to the requirement that asked for it
-- -----------------------------------------------------------------------------
-- `data_retrievals` records which application and which source, but not which
-- *requirement* was being satisfied. A service can name the same source for two
-- requirements (the seeded catalogue does exactly this: DIGILOCKER_MOCK backs
-- both BANK_DETAILS and COMMUNITY_RECORD), so source alone cannot say what was
-- fetched, and the idempotency key below would collapse two distinct retrievals
-- into one.
--
-- RESTRICT, matching `consents.data_source_id`: a retrieval must stay
-- attributable to the requirement that authorized it.
alter table public.data_retrievals
  add column if not exists requirement_id uuid
    references public.service_requirements (id) on delete restrict;

comment on column public.data_retrievals.requirement_id is
  'The service requirement this attempt was satisfying. Narrower than data_source_id, which a service may name more than once.';

-- database-schema.md §44: every FK column carries its own index.
create index if not exists data_retrievals_requirement_id_idx
  on public.data_retrievals (requirement_id);

-- -----------------------------------------------------------------------------
-- 2. Failures must say why; successes must not pretend to
-- -----------------------------------------------------------------------------
-- A FAILED row with no error code is an audit record that cannot answer the one
-- question it exists to answer. The reverse — a SUCCESS carrying an error code —
-- is a contradiction that would let a failed retrieval read as a good one.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.data_retrievals'::regclass
      and conname = 'data_retrievals_failure_has_error_code'
  ) then
    alter table public.data_retrievals
      add constraint data_retrievals_failure_has_error_code
      check (
        (status in ('FAILED', 'TIMEOUT') and error_code is not null)
        or (status not in ('FAILED', 'TIMEOUT') and error_code is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.data_retrievals'::regclass
      and conname = 'data_retrievals_success_is_completed'
  ) then
    alter table public.data_retrievals
      add constraint data_retrievals_success_is_completed
      check (status <> 'SUCCESS' or (completed_at is not null and request_reference is not null));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Idempotency — one successful retrieval per requirement
-- -----------------------------------------------------------------------------
-- `data_retrievals` deliberately retains the full attempt history, so failures
-- and retries must be allowed to accumulate (database-schema.md §53). What must
-- NOT accumulate is success: two SUCCESS rows for the same requirement would
-- mean the citizen's data was fetched twice under one authorization, and the
-- application could not say which retrieval its stored values came from.
--
-- A partial unique index over SUCCESS rows only expresses exactly that, and
-- closes the race that a read-then-insert check would leave open: two
-- concurrent retrievals both find nothing, both call the provider, and one is
-- rejected by the database rather than both being written.
create unique index if not exists data_retrievals_one_success_per_requirement_idx
  on public.data_retrievals (application_id, requirement_id)
  where status = 'SUCCESS';

-- -----------------------------------------------------------------------------
-- 4. Retrieved values are provider data, and stay distinguishable as such
-- -----------------------------------------------------------------------------
-- `application_data.source_type` already carries 'CITIZEN_DECLARATION' for what
-- the citizen typed (Phase 6). Provider-retrieved values take their own marker
-- so provenance is never ambiguous, and the pairing with `source_id` is
-- enforced rather than assumed:
--
--   CITIZEN_DECLARATION  → source_id IS NULL      (nobody issued it)
--   PROVIDER_RETRIEVAL   → source_id IS NOT NULL  (a named system issued it)
--
-- Without this, a provider row with a null source_id would be indistinguishable
-- from a citizen declaration, which is precisely the confusion Phase 8 §17
-- forbids.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.application_data'::regclass
      and conname = 'application_data_provenance_consistent'
  ) then
    alter table public.application_data
      add constraint application_data_provenance_consistent
      check (
        (source_type = 'CITIZEN_DECLARATION' and source_id is null)
        or (source_type = 'PROVIDER_RETRIEVAL' and source_id is not null)
        or source_type is null
      );
  end if;
end;
$$;

comment on column public.application_data.source_type is
  'Provenance: CITIZEN_DECLARATION (typed by the citizen, source_id NULL) or PROVIDER_RETRIEVAL (returned by a named system, source_id set).';

-- -----------------------------------------------------------------------------
-- 5. The retrieval commit
-- -----------------------------------------------------------------------------
-- One statement, one transaction, so the three writes a successful retrieval
-- implies cannot diverge:
--
--   the retrieval row  +  the normalized values  +  the timeline event
--
-- A partial write here would be actively harmful: values stored with no
-- retrieval record have no provenance, and a retrieval marked SUCCESS with no
-- values would permanently block a retry through the unique index above.
--
-- Authorization is re-derived inside this function rather than trusted from the
-- caller. Every one of these must hold, checked against the stored rows:
--
--   * the application is this citizen's, and is SUBMITTED;
--   * the requirement belongs to that application's service;
--   * the requirement names a data source (a DECLARATION cannot be retrieved);
--   * a consent exists for that application AND that source, owned by this
--     citizen, with status GRANTED.
--
-- The consent lookup is keyed on the requirement's OWN source, which is what
-- keeps a grant for one source from authorizing another (Phase 8 §10).
--
-- Returns the retrieval row on success, and nothing at all when authorization
-- fails — the service maps an empty result to the right error rather than this
-- function leaking which check failed.
create or replace function public.record_application_retrieval(
  p_application_id uuid,
  p_citizen_id uuid,
  p_requirement_id uuid,
  p_request_reference text,
  p_values jsonb,
  p_response_metadata jsonb
)
returns setof public.data_retrievals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
  v_data_source_id uuid;
  v_consent_id uuid;
  v_retrieval public.data_retrievals;
  v_value record;
begin
  -- FOR UPDATE: hold the application row for the duration, so a concurrent
  -- retrieval on the same application serializes behind this one.
  select * into v_application
  from public.applications
  where id = p_application_id
    and citizen_id = p_citizen_id
    and status = 'SUBMITTED'
  for update;

  if v_application.id is null then
    return;
  end if;

  -- The requirement must belong to this application's service, and must name a
  -- source. Both are read from configuration, never from the caller.
  select requirement.data_source_id into v_data_source_id
  from public.service_requirements requirement
  where requirement.id = p_requirement_id
    and requirement.service_id = v_application.service_id
    and requirement.data_source_id is not null;

  if v_data_source_id is null then
    return;
  end if;

  -- THE consent gate. Scoped to this citizen, this application and this
  -- requirement's own source, and satisfied only by GRANTED.
  select consent.id into v_consent_id
  from public.consents consent
  where consent.application_id = v_application.id
    and consent.citizen_id = p_citizen_id
    and consent.data_source_id = v_data_source_id
    and consent.status = 'GRANTED';

  if v_consent_id is null then
    return;
  end if;

  -- attempt_number continues the audit trail for this requirement rather than
  -- restarting, so "succeeded on attempt 3" stays readable.
  insert into public.data_retrievals (
    application_id, data_source_id, consent_id, requirement_id,
    request_reference, status, attempt_number,
    response_metadata, started_at, completed_at
  )
  values (
    v_application.id, v_data_source_id, v_consent_id, p_requirement_id,
    p_request_reference, 'SUCCESS',
    (
      select coalesce(max(existing.attempt_number), 0) + 1
      from public.data_retrievals existing
      where existing.application_id = v_application.id
        and existing.requirement_id = p_requirement_id
    ),
    p_response_metadata, now(), now()
  )
  returning * into v_retrieval;

  -- Normalized values, one row per field.
  --
  -- ON CONFLICT is scoped by a WHERE clause that excludes citizen-declared
  -- rows: a provider may refresh a value it previously supplied, but must never
  -- overwrite something the citizen typed (Phase 8 §16). A collision with a
  -- declaration updates nothing, leaving the citizen's answer intact.
  for v_value in select key, value from jsonb_each(p_values)
  loop
    insert into public.application_data (
      application_id, field_code, field_value,
      source_id, source_type, source_reference, verification_status
    )
    values (
      v_application.id, v_value.key, v_value.value,
      v_data_source_id, 'PROVIDER_RETRIEVAL', p_request_reference,
      -- Retrieved, NOT verified. Verification is Phase 9/10 and owns this
      -- column's transition to VERIFIED.
      'PENDING'
    )
    on conflict (application_id, field_code) do update
      set field_value = excluded.field_value,
          source_id = excluded.source_id,
          source_reference = excluded.source_reference,
          updated_at = now()
      where public.application_data.source_type = 'PROVIDER_RETRIEVAL';
  end loop;

  insert into public.application_events (
    application_id, actor_user_id, event_type, step_code, metadata
  )
  values (
    v_application.id, p_citizen_id, 'DATA_RETRIEVAL_SUCCEEDED', p_requirement_id::text,
    -- Identifiers and counts only. The retrieved values themselves are never
    -- written to the timeline (AGENT.md §15, database-schema.md §41).
    jsonb_build_object(
      'retrieval_id', v_retrieval.id,
      'data_source_id', v_data_source_id,
      'consent_id', v_consent_id,
      'field_count', (select count(*) from jsonb_object_keys(p_values))
    )
  );

  return next v_retrieval;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Recording a failed attempt
-- -----------------------------------------------------------------------------
-- A failure is audit, not data. It writes a retrieval row and an event, and
-- deliberately writes NO application_data — a provider that failed supplied
-- nothing, and Phase 8 §26 requires that no successful values survive a failure.
--
-- It runs the same authorization checks as the success path. A caller who was
-- never authorized cannot use this to prove SetuX contacted a provider on their
-- behalf, because SetuX never did.
create or replace function public.record_application_retrieval_failure(
  p_application_id uuid,
  p_citizen_id uuid,
  p_requirement_id uuid,
  p_error_code text,
  p_error_message text
)
returns setof public.data_retrievals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
  v_data_source_id uuid;
  v_consent_id uuid;
  v_retrieval public.data_retrievals;
begin
  select * into v_application
  from public.applications
  where id = p_application_id
    and citizen_id = p_citizen_id
    and status = 'SUBMITTED'
  for update;

  if v_application.id is null then
    return;
  end if;

  select requirement.data_source_id into v_data_source_id
  from public.service_requirements requirement
  where requirement.id = p_requirement_id
    and requirement.service_id = v_application.service_id
    and requirement.data_source_id is not null;

  if v_data_source_id is null then
    return;
  end if;

  select consent.id into v_consent_id
  from public.consents consent
  where consent.application_id = v_application.id
    and consent.citizen_id = p_citizen_id
    and consent.data_source_id = v_data_source_id
    and consent.status = 'GRANTED';

  if v_consent_id is null then
    return;
  end if;

  insert into public.data_retrievals (
    application_id, data_source_id, consent_id, requirement_id,
    status, attempt_number, error_code, error_message, started_at, completed_at
  )
  values (
    v_application.id, v_data_source_id, v_consent_id, p_requirement_id,
    'FAILED',
    (
      select coalesce(max(existing.attempt_number), 0) + 1
      from public.data_retrievals existing
      where existing.application_id = v_application.id
        and existing.requirement_id = p_requirement_id
    ),
    p_error_code, p_error_message, now(), now()
  )
  returning * into v_retrieval;

  insert into public.application_events (
    application_id, actor_user_id, event_type, step_code, metadata
  )
  values (
    v_application.id, p_citizen_id, 'DATA_RETRIEVAL_FAILED', p_requirement_id::text,
    jsonb_build_object(
      'retrieval_id', v_retrieval.id,
      'data_source_id', v_data_source_id,
      'error_code', p_error_code
    )
  );

  return next v_retrieval;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Privileges
-- -----------------------------------------------------------------------------
-- Both functions write provider-sourced data, which no browser session may do
-- under any circumstances. They are reachable only through the backend service
-- role, which resolves the citizen identity server-side.
--
-- This matches the existing RLS posture: `data_retrievals` and
-- `application_data` carry SELECT policies only, and gain no write policy here.
revoke all on function public.record_application_retrieval(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_application_retrieval_failure(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_application_retrieval(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.record_application_retrieval_failure(uuid, uuid, uuid, text, text) to service_role;
