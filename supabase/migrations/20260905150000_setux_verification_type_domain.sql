-- =============================================================================
-- SetuX — Fix — verification_type domain drifted from the catalogue
-- =============================================================================
-- Symptom: a citizen on SCHOLARSHIP_SPORTS clicks "Start verification" and gets
-- "The request could not be completed. Please try again." Every other phase of
-- the journey works.
--
-- Cause: `verifications_type_allowed` enumerates requirement codes by hand.
-- Phase 10 restated it in terms of `service_requirements.requirement_code`, but
-- copied only the five codes it knew about. The seeded catalogue defines seven:
--
--   IDENTITY  EDUCATION_RECORD  INCOME_RECORD  BANK_DETAILS  COMMUNITY_RECORD
--   ACHIEVEMENT_DECL   <- required by SCHOLARSHIP_SPORTS,      not permitted
--   GUARDIAN_DECL      <- optional for SCHOLARSHIP_GIRL_CHILD, not permitted
--
-- Both are citizen declarations: no data source backs them and no rule judges
-- them, so `evaluateRequirements` correctly records REQUIRES_ACTION /
-- NO_RULE_DEFINED for each — an outcome the CHECK then rejected with SQLSTATE
-- 23514. Because `record_application_verification` is one transaction, the
-- whole run rolled back: no verification rows, no lifecycle transition, and a
-- 5xx that the frontend correctly refuses to render as a finding against the
-- citizen. So the application could never leave SUBMITTED, and Phase 11 never
-- saw it.
--
-- This is the same class of bug Phase 10 fixed for COMMUNITY_RECORD and
-- BANK_DETAILS, and it recurred for the same reason: the list was hand-copied.
-- A hand-maintained mirror of another table's vocabulary drifts every time the
-- catalogue grows, and it fails at write time, deep inside a transaction,
-- rather than at seed time where the mistake is made.
--
-- So the domain is no longer restated here. `verification_type` is exactly "the
-- requirement_code this outcome judges", and the catalogue is the authority on
-- what those are. A FOREIGN KEY cannot express it — `service_requirements` is
-- keyed per service, so the same code appears once per service that asks for it
-- and there is no unique column to reference. A trigger enforces the same
-- invariant against that table instead: whatever the catalogue defines is
-- permitted, and nothing else is.
--
-- This is strictly wider than the CHECK it replaces, so no existing row can be
-- invalidated by it. Rows written under the Phase 2 spellings ('EDUCATION',
-- 'INCOME') are grandfathered explicitly, exactly as Phase 10 grandfathered
-- them: a constraint exists to stop bad new data, not to rewrite history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Retire the hand-maintained list
-- -----------------------------------------------------------------------------
alter table public.verifications
  drop constraint if exists verifications_type_allowed;

-- -----------------------------------------------------------------------------
-- 2. Derive the domain from the catalogue
-- -----------------------------------------------------------------------------
-- A constraint trigger rather than a CHECK: a CHECK may not query another
-- table. Deferred to the end of the statement so it is evaluated once the row
-- is in place, and AFTER so it never blocks the write path with a lock it does
-- not need.
--
-- `security definer` + a pinned empty `search_path`: the trigger reads
-- `service_requirements` while the caller may be a role with no select
-- privilege on it, and an unpinned search_path on a definer function is the
-- classic privilege-escalation vector. Every identifier below is
-- schema-qualified for that reason.
create or replace function public.assert_verification_type_in_catalogue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The Phase 2 spellings. Grandfathered, not revived: nothing writes these
  -- any more, and a row that already carries one must stay updatable.
  if new.verification_type in ('EDUCATION', 'INCOME') then
    return null;
  end if;

  if not exists (
    select 1
    from public.service_requirements requirement
    where requirement.requirement_code = new.verification_type
  ) then
    raise exception
      'verification_type % is not a requirement_code defined in service_requirements',
      new.verification_type
      using errcode = '23514',
            hint = 'Add the requirement to the service catalogue before recording an outcome for it.';
  end if;

  return null;
end;
$$;

comment on function public.assert_verification_type_in_catalogue() is
  'Constrains verifications.verification_type to the requirement codes the catalogue defines. Replaces the hand-maintained verifications_type_allowed CHECK, which drifted from service_requirements and made ACHIEVEMENT_DECL and GUARDIAN_DECL unrecordable.';

revoke all on function public.assert_verification_type_in_catalogue() from public, anon, authenticated;

drop trigger if exists verifications_type_in_catalogue on public.verifications;

create constraint trigger verifications_type_in_catalogue
  after insert or update of verification_type on public.verifications
  deferrable initially immediate
  for each row execute function public.assert_verification_type_in_catalogue();

comment on column public.verifications.verification_type is
  'The service_requirements.requirement_code this outcome judges, enforced against the catalogue by verifications_type_in_catalogue. EDUCATION/INCOME remain permitted for rows written under the Phase 2 domain.';

-- -----------------------------------------------------------------------------
-- 3. Support the trigger's lookup
-- -----------------------------------------------------------------------------
-- The trigger probes service_requirements by requirement_code alone, which no
-- existing index serves — the Phase 2 indexes lead with service_id. Without
-- this, every verification row written costs a sequential scan of the
-- catalogue.
create index if not exists service_requirements_requirement_code_idx
  on public.service_requirements (requirement_code);
