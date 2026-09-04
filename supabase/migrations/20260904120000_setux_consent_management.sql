-- =============================================================================
-- SetuX — Phase 7 — Consent management
-- =============================================================================
-- Phase 7 establishes the authorization boundary that Phase 8 will consume:
--
--   SUBMITTED application → consent requested → citizen GRANTs or DENIEs
--
-- No protected data is retrieved here. This migration only makes the citizen's
-- decision recordable, atomic, and auditable.
--
-- The `consents` table, its unique key, indexes and RLS policies already exist
-- from Phase 2 (20260829090300, 20260829090400). Nothing there is replaced.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A denial needs a timestamp too
-- -----------------------------------------------------------------------------
-- `granted_at` and `revoked_at` cover two of the five consent states. A DENIED
-- consent had nowhere to record *when* the citizen decided, so the decision was
-- only datable through `updated_at` — a column any later write moves. Consent is
-- a security boundary (security-design.md §22–§23) and its decision time has to
-- survive unrelated updates, so it gets a column of its own.
--
-- Additive and nullable: every existing row stays valid.
alter table public.consents
  add column if not exists decided_at timestamptz;

comment on column public.consents.decided_at is
  'When the citizen decided (GRANTED or DENIED). Distinct from updated_at, which any later write moves.';

-- Backfill so the invariant below holds for rows written before this migration.
update public.consents
set decided_at = coalesce(decided_at, granted_at)
where status = 'GRANTED' and decided_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.consents'::regclass
      and conname = 'consents_decided_at_required'
  ) then
    alter table public.consents
      add constraint consents_decided_at_required
      check (status not in ('GRANTED', 'DENIED') or decided_at is not null);
  end if;
end;
$$;

-- The consent screen reads every consent for one application, ordered for
-- display. `consents_application_id_idx` already serves the lookup.

-- -----------------------------------------------------------------------------
-- 2. Preparing the consent requests for a submitted application
-- -----------------------------------------------------------------------------
-- The set of consents is *derived*, never client-supplied: one row per service
-- requirement that names a data source. A DECLARATION the citizen types has no
-- external source and therefore requires no consent (Phase 7 §12).
--
-- ON CONFLICT DO NOTHING against `consents_application_source_unique` is what
-- makes this idempotent and race-free: two concurrent calls cannot produce
-- duplicate requests, and an already-decided consent is never reset to PENDING.
create or replace function public.prepare_application_consents(
  p_application_id uuid,
  p_citizen_id uuid
)
returns setof public.consents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
begin
  -- Ownership and state are checked here, in the same statement that writes,
  -- rather than trusted from the caller.
  select * into v_application
  from public.applications
  where id = p_application_id
    and citizen_id = p_citizen_id
    and status = 'SUBMITTED'
  for update;

  if v_application.id is null then
    return;
  end if;

  insert into public.consents (
    application_id, citizen_id, data_source_id, purpose
  )
  select
    v_application.id,
    v_application.citizen_id,
    requirement.data_source_id,
    -- The purpose is derived from the configured requirement, so it always
    -- names the actual information and the actual service.
    'Verify ' || requirement.name || ' for your ' || service.name || ' application'
  from public.service_requirements requirement
  join public.services service on service.id = requirement.service_id
  where requirement.service_id = v_application.service_id
    and requirement.data_source_id is not null
  on conflict (application_id, data_source_id) do nothing;

  return query
  select * from public.consents
  where application_id = v_application.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Recording the decision
-- -----------------------------------------------------------------------------
-- One statement decides one consent and writes its lifecycle event, so the
-- decision and its audit record cannot diverge.
--
-- `status = 'PENDING'` in the WHERE clause is the transition guard: a consent
-- that was already granted or denied matches nothing, the function returns no
-- row, and the service turns that into a deterministic conflict. That closes
-- the race two concurrent decisions would otherwise open.
create or replace function public.decide_application_consent(
  p_consent_id uuid,
  p_citizen_id uuid,
  p_granted boolean
)
returns setof public.consents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_consent public.consents;
begin
  update public.consents
  set status = case when p_granted then 'GRANTED'::public.consent_status
                    else 'DENIED'::public.consent_status end,
      granted_at = case when p_granted then now() else granted_at end,
      decided_at = now()
  where id = p_consent_id
    and citizen_id = p_citizen_id
    and status = 'PENDING'
    -- Belt and braces: the consent must still hang off an application this
    -- citizen owns and that is actually submitted.
    and exists (
      select 1 from public.applications a
      where a.id = public.consents.application_id
        and a.citizen_id = p_citizen_id
        and a.status = 'SUBMITTED'
    )
  returning * into v_consent;

  if v_consent.id is null then
    return;
  end if;

  insert into public.application_events (
    application_id, actor_user_id, event_type, metadata
  )
  values (
    v_consent.application_id,
    p_citizen_id,
    case when p_granted then 'CONSENT_GRANTED' else 'CONSENT_DENIED' end,
    -- Identifiers only. The protected data itself is never logged
    -- (AGENT.md §15, database-schema.md §41).
    jsonb_build_object('consent_id', v_consent.id, 'data_source_id', v_consent.data_source_id)
  );

  return next v_consent;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Privileges
-- -----------------------------------------------------------------------------
-- Both functions are reached only through the authenticated backend, which
-- resolves the citizen identity server-side. No browser role may call them.
revoke all on function public.prepare_application_consents(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decide_application_consent(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.prepare_application_consents(uuid, uuid) to service_role;
grant execute on function public.decide_application_consent(uuid, uuid, boolean) to service_role;
