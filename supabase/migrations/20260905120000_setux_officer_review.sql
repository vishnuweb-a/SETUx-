-- =============================================================================
-- SetuX — Phase 11 — Officer review and the final decision
-- =============================================================================
-- Phase 10 left the application in VERIFICATION with SetuX's own conclusions
-- recorded against each requirement. Those conclusions are ADVISORY. Phase 11
-- is where a person reads them and decides:
--
--   VERIFICATION ──► APPROVED     (an officer decided)
--                └─► REJECTED     (an officer decided, with a reason)
--
-- Nothing here approves or rejects on its own. There is no rule in this file
-- that reads a verification outcome and concludes anything from it — a run
-- where every requirement came back VERIFIED still sits in the queue until an
-- officer acts. That is the whole point of the phase: SetuX demonstrates that
-- automated federation does not remove the human from a decision that affects
-- a citizen's entitlement (Phase 11 §4, §13).
--
-- This migration adds NO table and NO enum:
--
--   * `application_status` already carries APPROVED and REJECTED
--     (setux_enums.sql, database-schema.md §19).
--   * `application_reviews` already exists with reviewer, decision, remarks,
--     department and timestamps, and already constrains a REJECTED decision to
--     carry remarks (setux_applications.sql, database-schema.md §36).
--
-- It adds exactly one thing: the atomic commit of a decision.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A decision is final, and the schema says so
-- -----------------------------------------------------------------------------
-- `application_reviews` was specified as append-only decision history
-- (database-design.md §5.15), which is right — a past decision must stay
-- readable. But append-only alone does not prevent a SECOND decision being
-- appended to an application that already has one, and two contradictory rows
-- against the same application is precisely the state that would make the
-- citizen's status unexplainable.
--
-- A partial unique index is the guard: at most one FINAL decision per
-- application. REQUESTED_INFO is deliberately excluded from the index, because
-- it is not final — it is an officer asking for more and expecting to decide
-- later, so more than one may legitimately exist.
--
-- This is additive against existing data: no application currently carries any
-- review row at all, so nothing can violate it.
create unique index if not exists application_reviews_one_final_decision_idx
  on public.application_reviews (application_id)
  where decision in ('APPROVED', 'REJECTED');

comment on index public.application_reviews_one_final_decision_idx is
  'At most one final (APPROVED/REJECTED) decision per application. REQUESTED_INFO is not final and is excluded.';

-- -----------------------------------------------------------------------------
-- 2. The decision commit
-- -----------------------------------------------------------------------------
-- One statement, one transaction, so the three writes a decision implies cannot
-- diverge:
--
--   the application_reviews row
--     + the application's final status
--     + the timeline event
--
-- A partial write here is worse than a failed request in every direction. A
-- review row with no status change is a decision the citizen never sees; a
-- status change with no review row is an APPROVED application no one is
-- accountable for; and either without the event leaves the audit trail claiming
-- the application moved by itself. This is the one Phase 11 invariant that is
-- not negotiable for the prototype (§7).
--
-- AUTHORIZATION IS RE-DERIVED HERE, not trusted from the caller — the same
-- posture as `record_application_verification`. The function is passed the
-- reviewer's id, but it does not take that as permission: it independently
-- confirms that this reviewer is an onboarded officer whose department handles
-- this application's service, using the SAME join the RLS policy uses
-- (services.department = departments.name, setux_rls.sql
-- officer_can_read_application). An officer from another department cannot
-- decide an application they cannot see, even though the backend has already
-- checked that too. Two independent checks, because this one is the last.
--
-- The reviewer id itself comes from the authenticated session at the HTTP
-- boundary and is never read from a request body (database-schema.md §37).
--
-- Returns the review row on success, and NOTHING when any guard failed. The
-- service maps an empty result to the right error rather than this function
-- leaking which check failed — a caller learns that their decision did not
-- apply, not whether the application exists, whose it is, or which department
-- owns it.
create or replace function public.record_application_decision(
  p_application_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_decision,
  p_remarks text
)
returns setof public.application_reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications;
  v_department_id uuid;
  v_final_status public.application_status;
  v_review public.application_reviews;
begin
  -- Phase 11 decides APPROVED or REJECTED and nothing else. REQUESTED_INFO is a
  -- member of the enum and belongs to a later phase; accepting it here would
  -- move the application to a status this function has no mapping for.
  if p_decision not in ('APPROVED', 'REJECTED') then
    return;
  end if;

  -- A rejection must carry a reason. The table constrains this too, but a
  -- CHECK violation would surface as a 500; refusing here turns it into the
  -- conflict the service can explain to the officer.
  if p_decision = 'REJECTED' and length(btrim(coalesce(p_remarks, ''))) = 0 then
    return;
  end if;

  -- FOR UPDATE: hold the application row for the duration of the transaction.
  -- Two officers deciding the same application at the same moment serialize
  -- here; the second finds a status that is no longer VERIFICATION and returns
  -- empty. This is what makes "a finalized application cannot be casually
  -- decided again" true under concurrency and not merely under sequential use
  -- (§7). The unique index above is the second line of the same defence.
  --
  -- The status guard is also the workflow guard: only an application that has
  -- actually been through Phase 10 verification can be decided. A SUBMITTED or
  -- DRAFT application is not review-ready, and an APPROVED or REJECTED one is
  -- already finished.
  select * into v_application
  from public.applications
  where id = p_application_id
    and status = 'VERIFICATION'
  for update;

  if v_application.id is null then
    return;
  end if;

  -- The reviewer must be an onboarded officer whose department handles this
  -- application's service. Resolved from stored rows, never from the request.
  -- The department is captured for the review row at the same time, so the
  -- decision records WHICH department decided, not merely which person.
  select government_profile.department_id into v_department_id
  from public.government_profiles government_profile
  join public.profiles reviewer on reviewer.id = government_profile.user_id
  join public.departments department on department.id = government_profile.department_id
  join public.services service on service.department = department.name
  where government_profile.user_id = p_reviewer_id
    and reviewer.role = 'GOVERNMENT_OFFICER'
    and reviewer.onboarding_status = 'COMPLETED'
    and service.id = v_application.service_id
  limit 1;

  if v_department_id is null then
    return;
  end if;

  v_final_status := case
    when p_decision = 'APPROVED' then 'APPROVED'::public.application_status
    else 'REJECTED'::public.application_status
  end;

  -- The decision record first: it is the accountable artefact, and if anything
  -- below it fails the whole transaction unwinds together.
  insert into public.application_reviews (
    application_id, reviewer_id, department_id, decision, remarks, reviewed_at
  )
  values (
    v_application.id, p_reviewer_id, v_department_id, p_decision,
    nullif(btrim(coalesce(p_remarks, '')), ''), now()
  )
  returning * into v_review;

  update public.applications
  set status = v_final_status,
      -- The workflow has reached its end. The step is the decision itself, so
      -- the citizen's tracker reads DECISION rather than being left pointing at
      -- the verification step the application has now moved past.
      current_workflow_step = 'DECISION',
      updated_at = now()
  where id = v_application.id;

  -- The timeline entry the citizen and the audit trail both read.
  --
  -- Identifiers, codes and the decision. The remarks are NOT copied here: they
  -- are stored once, on the review row, under that table's own RLS. Duplicating
  -- free text into the event metadata would put an officer's prose into a
  -- second place with different access rules and no way to correct it (§27).
  insert into public.application_events (
    application_id, actor_user_id, event_type, step_code, metadata
  )
  values (
    v_application.id, p_reviewer_id,
    case when p_decision = 'APPROVED'
      then 'APPLICATION_APPROVED'
      else 'APPLICATION_REJECTED'
    end,
    'DECISION',
    jsonb_build_object(
      'review_id', v_review.id,
      'decision', p_decision,
      'department_id', v_department_id
    )
  );

  return next v_review;
end;
$$;

comment on function public.record_application_decision(uuid, uuid, public.review_decision, text) is
  'Commits one officer decision atomically: the review row, the final application status and the timeline event. Re-derives officer authorization; returns no row when any guard fails.';

-- -----------------------------------------------------------------------------
-- 3. Privileges
-- -----------------------------------------------------------------------------
-- This function finalizes an application. No browser session may reach it under
-- any circumstances — an officer who could call it directly could bypass the
-- backend's own role and onboarding gates, and a citizen who could call it
-- could approve their own application.
--
-- It is reachable only through the backend service role, which resolves the
-- reviewer identity from the verified access token server-side. This matches
-- the existing RLS posture exactly: `application_reviews` and `applications`
-- carry SELECT policies for `authenticated` and no write policy at all, and
-- gain none here.
revoke all on function public.record_application_decision(uuid, uuid, public.review_decision, text)
  from public, anon, authenticated;
grant execute on function public.record_application_decision(uuid, uuid, public.review_decision, text)
  to service_role;
