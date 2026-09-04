-- =============================================================================
-- SetuX — Phase 4 — Atomic onboarding completion
-- =============================================================================
-- Source: docs/API/onboarding.md §13, §19, §26, §30
--         Phase 4 brief §24 (duplicate onboarding), §25 (partial failure)
--
-- Why this migration exists
-- -------------------------
-- Completing onboarding writes to TWO tables: the role-specific profile
-- (citizen_profiles / government_profiles) and profiles.onboarding_status.
-- Applied as two statements from the backend, a failure between them leaves a
-- saved profile whose owner is still routed back to the form, or an account
-- marked COMPLETED with no profile behind it. Phase 4 §25 forbids exactly that.
--
-- The Supabase client cannot open a transaction across two REST calls, so the
-- pair is expressed as one PostgreSQL function per role. Each is a single
-- statement from the caller's perspective and therefore atomic.
--
-- No table, column, constraint, index, enum or policy from Phase 2 is altered.
-- These functions only write through the schema that already exists.
--
-- Until this migration is applied
-- -------------------------------
-- `backend/src/modules/onboarding/onboarding.repository.ts` calls these
-- functions first and, on PostgREST error PGRST202 ("function not found"),
-- falls back to two ordered statements: the profile upsert, then the status
-- flag. That fallback is correct but NOT atomic — a failure between the two
-- leaves the user IN_PROGRESS with their data saved, which a resubmission
-- repairs. Applying this migration removes that window, and the backend then
-- uses the function automatically with no code change.

-- =============================================================================
-- Applying this migration
-- =============================================================================
-- APPLIED to project `auqsiwgawphnuceaibvp` (2026-09-04, via the Supabase MCP
-- server). Both functions were verified present with `prosecdef = false` and
-- EXECUTE granted to `authenticated` only — `anon` holds no grant. The backend
-- now takes the atomic RPC path; the PGRST202 fallback below no longer fires.
--
-- On a fresh project, apply it with the linked Supabase CLI or direct SQL
-- access, using one of:
--
--   supabase link --project-ref <ref> && supabase db push
--   psql "$DATABASE_URL" -f supabase/migrations/20260903090000_setux_onboarding_functions.sql
--   Supabase Dashboard -> SQL Editor -> paste this file
--
-- Then confirm both functions resolve:
--
--   select proname from pg_proc
--    where proname in ('complete_citizen_onboarding','complete_government_onboarding');
--
-- Security model
-- --------------
-- SECURITY INVOKER (the default) on purpose. These functions must NOT be able
-- to bypass RLS: the backend calls them through the service-role client, which
-- already bypasses RLS as its own identity, while a browser calling them
-- directly stays subject to the Phase 2 policies — `citizen_profiles_insert_own`
-- and `government_profiles_insert_own` both require
-- `auth.uid() = user_id`, so a browser can still only ever write its own row.
-- Making them SECURITY DEFINER would hand the browser a way around that.
--
-- `p_user_id` is supplied by the backend from a verified access token. It is
-- never read from a request body (onboarding.md §4, §39).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- complete_citizen_onboarding
-- -----------------------------------------------------------------------------
-- Idempotent by design. A repeat call with the same owner updates the existing
-- row rather than inserting a second one, which is what makes a double submit
-- harmless (onboarding.md §26). The API layer still answers a *completed*
-- profile with 409; this function is what guarantees the data stays correct if
-- two requests race past that check.
create or replace function public.complete_citizen_onboarding(
  p_user_id       uuid,
  p_full_name     text,
  p_government_id text,
  p_mobile_number text,
  p_date_of_birth date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- ON CONFLICT on the UNIQUE user_id: the citizen either has a profile or
  -- gets one, and never gets two (citizen_profiles.user_id is UNIQUE).
  insert into public.citizen_profiles (
    user_id, full_name, government_id, mobile_number, date_of_birth
  )
  values (
    p_user_id, p_full_name, p_government_id, p_mobile_number, p_date_of_birth
  )
  on conflict (user_id) do update
    set full_name     = excluded.full_name,
        government_id = excluded.government_id,
        mobile_number = excluded.mobile_number,
        date_of_birth = excluded.date_of_birth;

  -- Only the caller's own row, and only when they are actually a citizen: a
  -- role check here means the function cannot be used to mark an officer's
  -- account complete on the strength of a citizen profile.
  update public.profiles
     set onboarding_status = 'COMPLETED'
   where id = p_user_id
     and role = 'CITIZEN';

  -- The profile row is the identity this function is completing. If the UPDATE
  -- matched nothing, the id does not name a citizen and the INSERT above must
  -- not stand.
  if not found then
    raise exception 'No CITIZEN profile exists for this account'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.complete_citizen_onboarding(uuid, text, text, text, date) is
  'Writes the citizen profile and marks onboarding COMPLETED atomically. SECURITY INVOKER: RLS still applies to a browser caller.';

-- -----------------------------------------------------------------------------
-- complete_government_onboarding
-- -----------------------------------------------------------------------------
-- p_organization_id and p_department_id are resolved by the backend from
-- `organizations.code` and `departments.name`, never supplied by the client
-- (onboarding.md §18). The foreign keys on government_profiles are the final
-- guarantee that both point at real rows.
create or replace function public.complete_government_onboarding(
  p_user_id                uuid,
  p_organization_id        uuid,
  p_department_id          uuid,
  p_full_name              text,
  p_employee_id            text,
  p_designation            text,
  p_official_mobile_number text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Defence in depth behind the backend's own resolution: even if a caller
  -- reached this function with a mismatched pair, a department that does not
  -- belong to the organization is rejected here.
  if not exists (
    select 1
    from public.departments d
    where d.id = p_department_id
      and d.organization_id = p_organization_id
  ) then
    raise exception 'Department does not belong to the given organization'
      using errcode = 'check_violation';
  end if;

  insert into public.government_profiles (
    user_id, organization_id, department_id,
    full_name, employee_id, designation, official_mobile_number
  )
  values (
    p_user_id, p_organization_id, p_department_id,
    p_full_name, p_employee_id, p_designation, p_official_mobile_number
  )
  on conflict (user_id) do update
    set organization_id        = excluded.organization_id,
        department_id          = excluded.department_id,
        full_name              = excluded.full_name,
        employee_id            = excluded.employee_id,
        designation            = excluded.designation,
        official_mobile_number = excluded.official_mobile_number;

  update public.profiles
     set onboarding_status = 'COMPLETED'
   where id = p_user_id
     and role = 'GOVERNMENT_OFFICER';

  if not found then
    raise exception 'No GOVERNMENT_OFFICER profile exists for this account'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.complete_government_onboarding(uuid, uuid, uuid, text, text, text, text) is
  'Writes the officer profile and marks onboarding COMPLETED atomically. Rejects a department that does not belong to the organization.';

-- -----------------------------------------------------------------------------
-- Execution grants
-- -----------------------------------------------------------------------------
-- Strip the implicit PUBLIC grant, then grant back to `authenticated` only.
-- `anon` gets nothing: an unauthenticated caller has no auth.uid() and so could
-- not satisfy the RLS policies these functions run under anyway, but the grant
-- is withheld rather than left to that.
revoke execute on function
  public.complete_citizen_onboarding(uuid, text, text, text, date),
  public.complete_government_onboarding(uuid, uuid, uuid, text, text, text, text)
from public, anon;

grant execute on function
  public.complete_citizen_onboarding(uuid, text, text, text, date),
  public.complete_government_onboarding(uuid, uuid, uuid, text, text, text, text)
to authenticated;
