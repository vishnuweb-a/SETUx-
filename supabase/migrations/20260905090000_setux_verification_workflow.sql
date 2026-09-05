-- =============================================================================
-- SetuX — Phase 10 — Verification & workflow
-- =============================================================================
-- Phase 8 and Phase 9 made evidence available:
--
--   GRANTED consent → connector → normalized values → application_data (PENDING)
--
-- Phase 10 is the first phase that JUDGES that evidence. It reads what is
-- already stored and writes SetuX's own conclusion about it. It never calls a
-- provider: a connector says what a record contains, and SetuX decides what
-- that means (Phase 10 §14).
--
--   CONNECTOR RESULT  !=  VERIFICATION RESULT
--
-- `identityMatch = MATCHED` is the registry's statement. `verifications.status
-- = VERIFIED` is SetuX's, reached by an explicit rule. The rules themselves
-- live in the backend's verification module, not here, so they stay
-- unit-testable and reviewable; this function persists their conclusion.
--
-- Almost everything needed already exists from Phase 2: `verifications` (§35),
-- `application_data` (§22), `application_events` (§38), the
-- `verification_status` and `data_verification_status` enums, and RLS on all
-- three. This migration adds no table and no enum. It adds:
--
--   1. a widened verification_type domain, so every requirement can be judged;
--   2. one atomic function that commits a whole verification run.
--
-- Phase 10 stops at VERIFICATION. It never writes `application_reviews`, and
-- never moves an application to APPROVED or REJECTED — those belong to the
-- officer, in Phase 11.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Every required requirement must be expressible as a verification
-- -----------------------------------------------------------------------------
-- `verifications_type_allowed` was written in Phase 2 against the three checks
-- the MVP scholarship was expected to need, and used the check's own name
-- ('EDUCATION', 'INCOME') rather than the requirement code that drives it.
--
-- The seeded catalogue has since outgrown it. `service_requirements` now names
-- five requirement codes, and two of them are `required = true` for real
-- services:
--
--   COMMUNITY_RECORD  required by SCHOLARSHIP_MINORITY
--   BANK_DETAILS      required by SCHOLARSHIP_RESEARCH
--
-- Under the old constraint neither could ever hold a verification row, so those
-- two services could never finish verifying — the application would wait on a
-- requirement the schema forbade recording an outcome for.
--
-- The domain is therefore restated in terms of
-- `service_requirements.requirement_code`, which is what a verification run
-- actually iterates. One vocabulary for a requirement across the whole system,
-- rather than a second one needing translation at the boundary.
--
-- This is additive in effect: it widens what is permitted and rejects nothing
-- previously accepted, so no existing row can violate it.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.verifications'::regclass
      and conname = 'verifications_type_allowed'
  ) then
    alter table public.verifications drop constraint verifications_type_allowed;
  end if;

  alter table public.verifications
    add constraint verifications_type_allowed
    check (
      verification_type in (
        'IDENTITY',
        'EDUCATION_RECORD',
        'INCOME_RECORD',
        'BANK_DETAILS',
        'COMMUNITY_RECORD',
        -- The two Phase 2 spellings stay permitted. Dropping them would make
        -- this migration destructive against any row already written under the
        -- old domain, and a CHECK exists to prevent bad new data, not to
        -- invalidate history.
        'EDUCATION',
        'INCOME'
      )
    );
end;
$$;

comment on column public.verifications.verification_type is
  'The service_requirements.requirement_code this outcome judges. EDUCATION/INCOME remain permitted for rows written under the Phase 2 domain.';

-- A verification that reached a conclusion must say why, for the same reason a
-- failed retrieval must (Phase 8): an outcome with no reason is an audit record
-- that cannot answer the question it exists to answer. The reason is a
-- structured code inside `result`, never a sentence and never an evidence value.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.verifications'::regclass
      and conname = 'verifications_outcome_has_reason'
  ) then
    alter table public.verifications
      add constraint verifications_outcome_has_reason
      check (
        status in ('PENDING', 'PROCESSING')
        or (result is not null and result ? 'reasonCode')
      );
  end if;
end;
$$;

-- database-schema.md §44: the citizen's verification overview reads every row
-- for one application at once, and the officer's Phase 11 queue will too.
create index if not exists verifications_application_id_idx
  on public.verifications (application_id);

-- -----------------------------------------------------------------------------
-- 2. The verification commit
-- -----------------------------------------------------------------------------
-- One statement, one transaction, so the four writes a verification run implies
-- cannot diverge:
--
--   the lifecycle transition + the verification rows
--     + the application_data statuses + the timeline events
--
-- A partial write here would be actively misleading. An application left in
-- VERIFICATION with no verification rows looks permanently stuck; verification
-- rows written without the transition look produced out of order; and an
-- `application_data` row marked VERIFIED with no verification row justifying it
-- is exactly the "provider said so, therefore SetuX says so" conflation that
-- Phase 10 exists to prevent.
--
-- Authorization is re-derived here rather than trusted from the caller, the
-- same way `record_application_retrieval` does it:
--
--   * the application is this citizen's, and is SUBMITTED;
--   * every requirement code named belongs to that application's service.
--
-- Returns the verification rows on success, and nothing at all when the
-- transition did not apply — the service maps an empty result to the right
-- error rather than this function leaking which check failed.
--
-- p_outcomes is the rule engine's conclusion, shaped as:
--
--   [ { "requirementCode": "IDENTITY",
--       "status": "VERIFIED",
--       "reasonCode": "RULE_MATCH",
--       "ruleCode": "IDENTITY_MATCH_ACTIVE",
--       "sourceId": "…uuid or null…",
--       "fieldCodes": ["identityMatch", "identityRecordStatus"] }, … ]
--
-- `fieldCodes` names which stored evidence the rule actually consumed, so the
-- `application_data` update is scoped to the fields that were judged. Evidence
-- no rule looked at keeps the status it already had.
create or replace function public.record_application_verification(
  p_application_id uuid,
  p_citizen_id uuid,
  p_outcomes jsonb
)
returns setof public.verifications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
  v_outcome jsonb;
  v_requirement_code text;
  v_status public.verification_status;
  v_source_id uuid;
  v_verification public.verifications;
  v_field_code text;
  v_verified_count int := 0;
  v_total_count int := 0;
begin
  -- FOR UPDATE: hold the application row for the duration. Two concurrent start
  -- requests serialize here, and the second finds a status that is no longer
  -- SUBMITTED, so exactly one run performs the transition (§21).
  select * into v_application
  from public.applications
  where id = p_application_id
    and citizen_id = p_citizen_id
    and status = 'SUBMITTED'
  for update;

  if v_application.id is null then
    return;
  end if;

  -- The lifecycle transition. `VERIFICATION` is the value the enum and
  -- database-schema.md §19 define; "UNDER_VERIFICATION" is the phase documents'
  -- prose for the same state, and is deliberately not introduced as a second
  -- enum member (Phase 10 §38).
  update public.applications
  set status = 'VERIFICATION',
      current_workflow_step = 'VERIFICATION',
      updated_at = now()
  where id = v_application.id;

  insert into public.application_events (
    application_id, actor_user_id, event_type, step_code, metadata
  )
  values (
    v_application.id, p_citizen_id, 'VERIFICATION_STARTED', 'VERIFICATION',
    jsonb_build_object('requirement_count', jsonb_array_length(p_outcomes))
  );

  for v_outcome in select * from jsonb_array_elements(p_outcomes)
  loop
    v_requirement_code := v_outcome ->> 'requirementCode';
    v_status := (v_outcome ->> 'status')::public.verification_status;
    v_source_id := nullif(v_outcome ->> 'sourceId', '')::uuid;
    v_total_count := v_total_count + 1;

    -- The requirement must belong to THIS application's service. A code from
    -- another service is skipped rather than recorded, so a caller cannot widen
    -- the run beyond what this application actually asks for.
    if not exists (
      select 1 from public.service_requirements requirement
      where requirement.service_id = v_application.service_id
        and requirement.requirement_code = v_requirement_code
    ) then
      continue;
    end if;

    -- UPSERT on the Phase 2 unique constraint (application_id,
    -- verification_type). This is what makes a repeated run idempotent: a
    -- second evaluation of the same requirement updates its outcome in place
    -- rather than accumulating a second, contradictory row (§22).
    insert into public.verifications (
      application_id, verification_type, status, source_id, result, verified_at
    )
    values (
      v_application.id, v_requirement_code, v_status, v_source_id,
      -- SetuX's own normalized conclusion. Structured reason codes only — no
      -- evidence values, no provider payloads (§27, §28).
      jsonb_build_object(
        'reasonCode', v_outcome ->> 'reasonCode',
        'ruleCode', v_outcome ->> 'ruleCode',
        'evaluatedFieldCount', coalesce(jsonb_array_length(v_outcome -> 'fieldCodes'), 0)
      ),
      case when v_status = 'VERIFIED' then now() else null end
    )
    on conflict (application_id, verification_type) do update
      set status = excluded.status,
          source_id = excluded.source_id,
          result = excluded.result,
          verified_at = excluded.verified_at,
          updated_at = now()
    returning * into v_verification;

    if v_status = 'VERIFIED' then
      v_verified_count := v_verified_count + 1;
    end if;

    -- The evidence this rule actually consumed takes the rule's outcome.
    --
    -- Scoped to PROVIDER_RETRIEVAL rows: what the citizen typed is theirs, and
    -- a verification run must never restate a declaration as a verified fact
    -- (§25). The value itself is never touched — verification changes the
    -- status of evidence, never the evidence (§26).
    for v_field_code in
      select jsonb_array_elements_text(coalesce(v_outcome -> 'fieldCodes', '[]'::jsonb))
    loop
      update public.application_data
      set verification_status = case
            when v_status = 'VERIFIED' then 'VERIFIED'::public.data_verification_status
            when v_status = 'FAILED' then 'FAILED'::public.data_verification_status
            else 'PENDING'::public.data_verification_status
          end,
          verified_at = case when v_status = 'VERIFIED' then now() else null end,
          updated_at = now()
      where application_id = v_application.id
        and field_code = v_field_code
        and source_type = 'PROVIDER_RETRIEVAL';
    end loop;

    insert into public.application_events (
      application_id, actor_user_id, event_type, step_code, metadata
    )
    values (
      v_application.id, p_citizen_id,
      case when v_status = 'VERIFIED'
        then 'REQUIREMENT_VERIFIED'
        else 'REQUIREMENT_VERIFICATION_FAILED'
      end,
      v_requirement_code,
      -- Identifiers, codes and counts. Never an evidence value (§27).
      jsonb_build_object(
        'verification_id', v_verification.id,
        'requirement_code', v_requirement_code,
        'status', v_status,
        'reason_code', v_outcome ->> 'reasonCode'
      )
    );
  end loop;

  insert into public.application_events (
    application_id, actor_user_id, event_type, step_code, metadata
  )
  values (
    v_application.id, p_citizen_id, 'VERIFICATION_COMPLETED', 'VERIFICATION',
    jsonb_build_object('verified_count', v_verified_count, 'total_count', v_total_count)
  );

  return query
    select * from public.verifications
    where application_id = v_application.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Privileges
-- -----------------------------------------------------------------------------
-- This function moves an application's lifecycle and writes its verification
-- outcomes. No browser session may do either under any circumstances — a
-- citizen who could reach it could mark their own application verified.
--
-- It is reachable only through the backend service role, which resolves the
-- citizen identity server-side. This matches the existing RLS posture:
-- `verifications`, `application_data` and `applications` carry no write policy
-- for `authenticated`, and gain none here (§34, §55).
revoke all on function public.record_application_verification(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_application_verification(uuid, uuid, jsonb) to service_role;
