-- =============================================================================
-- SetuX — Phase 2 — Row Level Security
-- =============================================================================
-- Source: docs/DATABASE/database-schema.md §46–§49
--         docs/lld/database-design.md §7, §8
--         docs/AUTH/authentication-and-rbac.md §21, §42
--
-- Access model
-- ------------
--   anon              → nothing. Deny by default; no policy grants anon access.
--   citizen           → own identity + own applications and everything under
--                       them. Server-controlled columns are not writable.
--   government officer→ read the service catalogue and the applications in
--                       scope for their department. Decisions are written
--                       through the backend, not directly by the browser.
--   service role      → bypasses RLS entirely. This is the backend's path and
--                       is why RLS is defence in depth, not the only control
--                       (security-design.md §19).
--
-- RLS is enabled on EVERY table in `public`, including reference tables, because
-- `public` is exposed through the Data API.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private helper schema
-- -----------------------------------------------------------------------------
-- These helpers must read `profiles` / `government_profiles` from inside the
-- very policies that protect those tables, so they are SECURITY DEFINER to
-- avoid infinite RLS recursion. They live in an unexposed schema and pin
-- search_path.
--
-- Their safety does NOT come from withholding EXECUTE. RLS policy expressions
-- are evaluated with the *caller's* privileges, so `authenticated` must be able
-- to execute them or every policy that references one fails with
-- "permission denied for function". Safety comes instead from the fact that
-- none of them takes a caller-supplied identity: each resolves the caller from
-- auth.uid() itself, so a caller can only ever ask a question about themselves.
-- `anon` is left with no access at all — it has no auth.uid() and no policy
-- targeting `anon` exists.
create schema if not exists private;

revoke all on schema private from public;
revoke usage on schema private from anon;

create or replace function private.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

comment on function private.current_role() is
  'Role of the calling authenticated user. SECURITY DEFINER to avoid RLS recursion on profiles.';

create or replace function private.is_officer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'GOVERNMENT_OFFICER'
  );
$$;

comment on function private.is_officer() is
  'True when the caller is an onboarded government officer.';

-- Departments the calling officer is authorized for.
-- database-schema.md §47: an officer must not automatically see every
-- application in SetuX.
create or replace function private.officer_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.department_id
  from public.government_profiles g
  where g.user_id = (select auth.uid());
$$;

comment on function private.officer_department_ids() is
  'Department ids the calling officer belongs to, used to scope officer visibility.';

-- Applications visible to the calling officer: those whose service is handled
-- by one of the officer's departments. The join goes through the department
-- NAME on services, which is how database-design.md §5.4 models service
-- ownership for the MVP.
create or replace function private.officer_can_read_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    join public.services s on s.id = a.service_id
    join public.departments d on d.name = s.department
    join public.government_profiles g
      on g.department_id = d.id
     and g.user_id = (select auth.uid())
    where a.id = p_application_id
      -- Drafts are private to the citizen until submitted.
      and a.status <> 'DRAFT'
  );
$$;

comment on function private.officer_can_read_application(uuid) is
  'True when the calling officer''s department handles the service this application belongs to, and it is no longer a draft.';

-- Strip the implicit PUBLIC grant Postgres attaches to every new function,
-- then grant back only to the role that actually evaluates the policies.
revoke execute on function
  private.current_role(),
  private.is_officer(),
  private.officer_department_ids(),
  private.officer_can_read_application(uuid)
from public, anon;

grant usage on schema private to authenticated;
grant execute on function
  private.current_role(),
  private.is_officer(),
  private.officer_department_ids(),
  private.officer_can_read_application(uuid)
to authenticated;

-- =============================================================================
-- Enable RLS everywhere in public
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.departments          enable row level security;
alter table public.citizen_profiles     enable row level security;
alter table public.government_profiles  enable row level security;
alter table public.services             enable row level security;
alter table public.data_sources         enable row level security;
alter table public.service_requirements enable row level security;
alter table public.applications         enable row level security;
alter table public.consents             enable row level security;
alter table public.data_retrievals      enable row level security;
alter table public.application_data     enable row level security;
alter table public.verifications        enable row level security;
alter table public.application_reviews  enable row level security;
alter table public.application_events   enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;

-- =============================================================================
-- profiles
-- =============================================================================
-- A user reads their own profile. Officers additionally read the profiles of
-- citizens whose applications they can review.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_select_applicant_for_officer on public.profiles
  for select to authenticated
  using (
    (select private.is_officer())
    and exists (
      select 1 from public.applications a
      where a.citizen_id = public.profiles.id
        and (select private.officer_can_read_application(a.id))
    )
  );

-- No INSERT policy: profile creation is a backend (service-role) operation
-- driven by the authenticated identity — the client must not choose its role.
--
-- UPDATE is deliberately absent as well: `role` and `onboarding_status` are
-- server-controlled (database-schema.md §10) and `email` mirrors the auth
-- identity, so nothing on this table is safely client-writable. Profile
-- changes go through the backend.

-- =============================================================================
-- citizen_profiles
-- =============================================================================
create policy citizen_profiles_select_own on public.citizen_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy citizen_profiles_select_applicant_for_officer on public.citizen_profiles
  for select to authenticated
  using (
    (select private.is_officer())
    and exists (
      select 1 from public.applications a
      where a.citizen_id = public.citizen_profiles.user_id
        and (select private.officer_can_read_application(a.id))
    )
  );

-- A citizen may complete and correct their own onboarding record.
-- WITH CHECK mirrors USING so user_id cannot be reassigned to someone else.
create policy citizen_profiles_insert_own on public.citizen_profiles
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.current_role()) = 'CITIZEN'
  );

create policy citizen_profiles_update_own on public.citizen_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- =============================================================================
-- government_profiles
-- =============================================================================
create policy government_profiles_select_own on public.government_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Officers can see colleagues in their own department (reviewer attribution).
create policy government_profiles_select_same_department on public.government_profiles
  for select to authenticated
  using (department_id in (select private.officer_department_ids()));

create policy government_profiles_insert_own on public.government_profiles
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select private.current_role()) = 'GOVERNMENT_OFFICER'
  );

create policy government_profiles_update_own on public.government_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- =============================================================================
-- Reference data — organizations, departments, services, data_sources,
-- service_requirements
-- =============================================================================
-- Readable by any authenticated user: a citizen must be able to browse the
-- catalogue and see which system a consent request refers to. These tables hold
-- no personal data. Writes are service-role only (no INSERT/UPDATE/DELETE
-- policy exists), so the catalogue cannot be edited from the browser.
create policy organizations_select_authenticated on public.organizations
  for select to authenticated using (true);

create policy departments_select_authenticated on public.departments
  for select to authenticated using (true);

create policy services_select_authenticated on public.services
  for select to authenticated using (true);

create policy data_sources_select_authenticated on public.data_sources
  for select to authenticated using (true);

create policy service_requirements_select_authenticated on public.service_requirements
  for select to authenticated using (true);

-- =============================================================================
-- applications
-- =============================================================================
create policy applications_select_own on public.applications
  for select to authenticated
  using ((select auth.uid()) = citizen_id);

create policy applications_select_for_officer on public.applications
  for select to authenticated
  using ((select private.officer_can_read_application(id)));

-- A citizen creates their own application. status/application_number keep their
-- server-side defaults; a client-supplied status is constrained to DRAFT here
-- and transitions are validated by the backend thereafter.
create policy applications_insert_own on public.applications
  for insert to authenticated
  with check (
    (select auth.uid()) = citizen_id
    and (select private.current_role()) = 'CITIZEN'
    and status = 'DRAFT'
  );

-- A citizen may edit only a DRAFT, and it must remain theirs and remain a
-- DRAFT. Every later transition (submit, verify, approve) is a backend
-- operation — the browser cannot promote its own application.
create policy applications_update_own_draft on public.applications
  for update to authenticated
  using (
    (select auth.uid()) = citizen_id
    and status = 'DRAFT'
  )
  with check (
    (select auth.uid()) = citizen_id
    and status = 'DRAFT'
  );

-- No DELETE policy: applications are retained (database-schema.md §43).

-- =============================================================================
-- consents
-- =============================================================================
create policy consents_select_own on public.consents
  for select to authenticated
  using ((select auth.uid()) = citizen_id);

create policy consents_select_for_officer on public.consents
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (
    (select auth.uid()) = citizen_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

-- A citizen may grant or revoke their own consent; they may not reassign it.
create policy consents_update_own on public.consents
  for update to authenticated
  using ((select auth.uid()) = citizen_id)
  with check ((select auth.uid()) = citizen_id);

-- =============================================================================
-- Application-scoped read-only records
-- =============================================================================
-- application_data, data_retrievals and verifications are written only by the
-- backend during workflow execution. Citizens and scoped officers read them;
-- nobody writes them from the browser.
create policy application_data_select_own on public.application_data
  for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

create policy application_data_select_for_officer on public.application_data
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

create policy data_retrievals_select_own on public.data_retrievals
  for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

create policy data_retrievals_select_for_officer on public.data_retrievals
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

create policy verifications_select_own on public.verifications
  for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

create policy verifications_select_for_officer on public.verifications
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

-- =============================================================================
-- application_reviews
-- =============================================================================
-- The citizen sees the decision on their own application; the scoped officer
-- sees the review history. Writes go through the backend so the reviewer
-- identity comes from the session, never the payload (database-schema.md §37).
create policy application_reviews_select_own on public.application_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

create policy application_reviews_select_for_officer on public.application_reviews
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

-- =============================================================================
-- application_events
-- =============================================================================
create policy application_events_select_own on public.application_events
  for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.citizen_id = (select auth.uid())
    )
  );

create policy application_events_select_for_officer on public.application_events
  for select to authenticated
  using ((select private.officer_can_read_application(application_id)));

-- Append-only: no INSERT/UPDATE/DELETE policy. Events are emitted by the
-- backend as part of the transaction that changes state.

-- =============================================================================
-- notifications
-- =============================================================================
create policy notifications_select_own on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- The only client-writable field is the read marker; the row must stay theirs.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- =============================================================================
-- audit_logs
-- =============================================================================
-- Deliberately no policy of any kind. RLS is enabled and nothing is granted, so
-- the audit trail is unreachable from anon and authenticated alike. It is
-- written and read exclusively through the backend service role
-- (database-design.md §7: a citizen cannot read internal audit logs).
