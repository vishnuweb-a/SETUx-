-- =============================================================================
-- SetuX — Phase 6 — Application management invariants and atomic operations
-- =============================================================================

-- A citizen may start another application only after the previous one reaches
-- a terminal state. The index, rather than a read-before-write check, closes
-- the concurrency window between two Apply requests.
create unique index applications_one_active_per_citizen_service_idx
  on public.applications (citizen_id, service_id)
  where status not in ('APPROVED', 'REJECTED', 'CANCELLED');

create or replace function public.create_citizen_application(
  p_citizen_id uuid,
  p_service_id uuid
)
returns setof public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
begin
  insert into public.applications (citizen_id, service_id)
  values (p_citizen_id, p_service_id)
  returning * into v_application;

  insert into public.application_events (application_id, actor_user_id, event_type)
  values (v_application.id, p_citizen_id, 'APPLICATION_CREATED');

  return next v_application;
end;
$$;

create or replace function public.save_citizen_application_draft(
  p_application_id uuid,
  p_citizen_id uuid,
  p_fields jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_service_id uuid;
  v_field record;
begin
  select service_id into v_service_id
  from public.applications
  where id = p_application_id and citizen_id = p_citizen_id and status = 'DRAFT'
  for update;

  if v_service_id is null then
    raise exception using errcode = '23514', message = 'Application is not an editable draft';
  end if;

  for v_field in select key, value from jsonb_each(p_fields)
  loop
    if jsonb_typeof(v_field.value) <> 'string' or not exists (
      select 1 from public.service_requirements
      where service_id = v_service_id
        and requirement_code = v_field.key
        and requirement_type = 'DECLARATION'
    ) then
      raise exception using errcode = '23514', message = 'Invalid declaration field';
    end if;
  end loop;

  delete from public.application_data
  where application_id = p_application_id
    and source_id is null
    and source_type = 'CITIZEN_DECLARATION';

  insert into public.application_data (
    application_id, field_code, field_value, source_type
  )
  select p_application_id, key, value, 'CITIZEN_DECLARATION'
  from jsonb_each(p_fields)
  where length(btrim(value #>> '{}')) > 0;

  insert into public.application_events (application_id, actor_user_id, event_type)
  values (p_application_id, p_citizen_id, 'APPLICATION_UPDATED');
end;
$$;

create or replace function public.submit_citizen_application(
  p_application_id uuid,
  p_citizen_id uuid
)
returns setof public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
begin
  select * into v_application
  from public.applications
  where id = p_application_id and citizen_id = p_citizen_id and status = 'DRAFT'
  for update;

  if v_application.id is null then
    return;
  end if;

  if exists (
    select 1
    from public.service_requirements requirement
    where requirement.service_id = v_application.service_id
      and requirement.requirement_type = 'DECLARATION'
      and requirement.required
      and not exists (
        select 1 from public.application_data application_field
        where application_field.application_id = v_application.id
          and application_field.field_code = requirement.requirement_code
          and application_field.source_id is null
          and application_field.source_type = 'CITIZEN_DECLARATION'
          and length(btrim(application_field.field_value #>> '{}')) > 0
      )
  ) then
    raise exception using errcode = '23514', message = 'Required declaration is missing';
  end if;

  update public.applications
  set status = 'SUBMITTED', submitted_at = now()
  where id = v_application.id
  returning * into v_application;

  insert into public.application_events (application_id, actor_user_id, event_type)
  values (v_application.id, p_citizen_id, 'APPLICATION_SUBMITTED');

  return next v_application;
end;
$$;

revoke all on function public.create_citizen_application(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_citizen_application_draft(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_citizen_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_citizen_application(uuid, uuid) to service_role;
grant execute on function public.save_citizen_application_draft(uuid, uuid, jsonb) to service_role;
grant execute on function public.submit_citizen_application(uuid, uuid) to service_role;
