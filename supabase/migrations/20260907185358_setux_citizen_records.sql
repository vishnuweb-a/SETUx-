-- =============================================================================
-- SetuX — Change & Correction Service — Phase 2 — Citizen record registry
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §4.1, §19, §20.5,
--         §20.6, §22, §24
--         docs/PHASES/feature.md — Change & Correction Phase 2
--
-- The question this pair of tables answers is:
--
--   "Which government records does SetuX know this citizen has, and what does
--    each of them currently say?"
--
-- and the important half of that sentence is "this citizen". Every retrieved
-- record in SetuX today lives in `application_data`, keyed by `application_id`
-- (arch §2, gap C1). That makes records a property of an APPLICATION: a citizen
-- who has never applied for a scholarship has no records at all, and a citizen
-- with three applications has three disconnected copies of the same identity
-- record. A correction service cannot be built on that — the citizen must be
-- able to browse and correct what the government holds about them whether or
-- not they ever wanted a scholarship.
--
-- So `citizen_records` has NO `application_id` column, deliberately (arch §4.1).
-- It is citizen-scoped, not application-scoped, and the two domains stay
-- separate on purpose:
--
--   application_data      historical EVIDENCE, frozen at retrieval time, the
--                         provenance of a decision already taken. Never
--                         rewritten. NOT TOUCHED BY THIS MIGRATION.
--   citizen_record_fields the CURRENT projection of what the source holds now.
--                         Refreshable. A later APPLIED change updates it.
--
-- An application decided last month must keep showing the name that was on the
-- record last month (arch §17). Conflating the two would rewrite history every
-- time a citizen corrected a name, which is precisely the failure a correction
-- service must not introduce.
--
-- Scope discipline. This migration adds TWO tables, the synthetic routing rows
-- they need, and nothing else. It adds no `change_requests`, no proposed value,
-- no dependency rule, no change consent, no review, no connector, and no
-- notification — every one of those is Phase 3 or later (arch §25), and none of
-- them is referenced here. There is also no record MUTATION path of any kind:
-- neither table carries an INSERT, UPDATE or DELETE policy, so a browser cannot
-- write a source record under any circumstances.
--
-- Additive and non-destructive: no DROP, no TRUNCATE, no DELETE, no ALTER of an
-- existing table, and no existing migration is modified. `application_data`,
-- `applications`, `consents` and the scholarship flow are untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Synthetic routing rows the registry needs
-- -----------------------------------------------------------------------------
-- The authority map (arch §20.6) needs two departments and one data source that
-- do not exist yet. They are seeded HERE rather than in `supabase/seed/seed.sql`
-- because they are structural prerequisites of the tables below — a
-- `citizen_records` row cannot name an authority that has no row — and because
-- a from-scratch replay must produce a registry that can actually be populated.
--
-- Every insert is `on conflict do update` on the natural key, so replaying this
-- migration against a database that already has these rows is a no-op rather
-- than a duplicate-key failure (arch §22).

-- 1a. A synthetic government organization for the non-education authorities.
--
-- `departments.organization_id` is NOT NULL, so every department needs a parent
-- (arch §20.6). The only organization seeded today is `EDU`, "Department of
-- Education" — and "Revenue Department, a department of the Department of
-- Education" is incoherent. Rather than hang unrelated authorities off an
-- organization that does not own them, this creates one synthetic
-- whole-of-government parent for them, which is the recommendation §20.6 makes.
-- Higher Education and Minority Affairs stay exactly where they are, under EDU.
insert into public.organizations (name, code, status)
values ('Government of Demo State (Simulated)', 'DEMO_GOV', 'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      status = excluded.status;

-- 1b. The two authorities that genuinely do not exist yet (arch §20.6).
--
-- Identity Authority owns the identity registry; Revenue Department issues
-- income certificates. Both are named to match the `authority` text already
-- seeded on the Phase 1 policy rows, so the descriptive authority a citizen is
-- shown and the routing authority a target will later carry say the same thing.
--
-- Higher Education and Minority Affairs are NOT created here: they exist, they
-- are semantically correct, and the officer fixture already belongs to Higher
-- Education (arch §20.6). Re-creating them would fork the department a target
-- routes to away from the department an officer belongs to.
insert into public.departments (organization_id, name, code)
select o.id, d.name, d.code
from public.organizations o
cross join (values
  ('Identity Authority',  'IDENTITY_AUTHORITY'),
  ('Revenue Department',  'REVENUE_DEPT')
) as d (name, code)
where o.code = 'DEMO_GOV'
on conflict (organization_id, code) do update
  set name = excluded.name;

-- 1c. The synthetic banking provider's data source (arch §20.6, gap C6).
--
-- Today `BANK_DETAILS` is a *DigiLocker document requirement* served by
-- `DIGILOCKER_MOCK` — a passbook PDF, evidence for a scholarship. As a
-- correctable *record* it is a different thing entirely: it is held by a bank,
-- and the bank is the authority for it. It therefore needs its own source row.
--
-- The existing DigiLocker requirement is left exactly as it is, so the
-- scholarship flow keeps working unchanged.
--
-- This row is METADATA ONLY. No bank connector, no step-up authentication, no
-- OTP and no network call is created by this migration or anywhere in Phase 2 —
-- those are Phase 10 (arch §24). The source exists so the record inventory can
-- name where a bank record comes from, and for no other reason.
--
-- `type` is `MOCK_API`, the same honest label the other simulated systems carry.
insert into public.data_sources (code, name, type, status)
values ('MOCK_BANK_API', 'Demo Public Bank (Simulated)', 'MOCK_API', 'ACTIVE')
on conflict (code) do update
  set name = excluded.name,
      type = excluded.type,
      status = excluded.status;

-- -----------------------------------------------------------------------------
-- 2. citizen_records
-- -----------------------------------------------------------------------------
create table public.citizen_records (
  id uuid primary key default gen_random_uuid(),

  -- The owner. ON DELETE RESTRICT, matching `government_profiles` and the FKs
  -- on `data_sources`: a citizen with records must not silently vanish and take
  -- the audit trail of what the government held about them with it.
  citizen_id uuid not null references public.profiles (id) on delete restrict,

  -- IDENTITY_RECORD, INCOME_RECORD, … — the same vocabulary and the same column
  -- NAME as `field_policies.record_type`, so `(record_type, field_key)` joins
  -- across the two tables without translation. `record_type`, never
  -- `document_type`: Phase 1 settled this and it is now canonical.
  --
  -- TEXT with a CHECK rather than an enum, for the same reason Phase 1 chose
  -- TEXT: the set of record types grows with the connectors SetuX federates,
  -- which is configuration, and a sixth record type must not require an
  -- ALTER TYPE. The CHECK pins the shape so a typo cannot create a record type
  -- no policy governs and no endpoint will ever ask for.
  record_type text not null,

  -- The system that HOLDS the record. RESTRICT: a source with records attached
  -- must not be deletable out from under them.
  data_source_id uuid not null references public.data_sources (id) on delete restrict,

  -- The authority RESPONSIBLE for the record — where a correction is eventually
  -- routed. A real UUID foreign key, never the `services.department` =
  -- `departments.name` text join (arch §7 gap C7, Decision 3): renaming a
  -- department must not silently unroute every record it owns.
  --
  -- NULLABLE, and that is a modelling statement rather than a convenience: the
  -- bank is a PROVIDER, not a department (arch §20.6, §8.1). It has no officer
  -- queue and never will, so its records carry no department. Fabricating a
  -- "Demo Public Bank" department row to satisfy a NOT NULL would invent a
  -- government office that does not exist and would put bank corrections in an
  -- officer's queue, which is exactly the opposite of what the bank record is
  -- in the demo to prove.
  authority_department_id uuid references public.departments (id) on delete restrict,

  -- The provider's OWN stable handle for the record, e.g. `SYNTH-INC-2026-008812`.
  --
  -- This is source METADATA, not SetuX identity. `id` above is the identity.
  -- The distinction matters more here than almost anywhere else in SetuX: this
  -- is the subsystem whose entire purpose is CHANGING values, so nothing
  -- mutable may be identity. A name is not identity. A mobile number is not
  -- identity. An Aadhaar-like number is not identity. All three are field
  -- VALUES living in `citizen_record_fields`, and all three may legitimately
  -- change tomorrow (arch §4.1).
  source_record_ref text not null,

  -- ACTIVE  — SetuX believes this reflects the source.
  -- STALE   — the source has moved on and SetuX has not re-read it.
  -- UNAVAILABLE — the source could not be reached or no longer serves it.
  --
  -- No refresh MECHANISM exists yet (arch §19, §24 defer it). The column exists
  -- so the prototype can state what it knows honestly rather than implying
  -- every projection is current.
  status text not null default 'ACTIVE',

  -- The provider's own version/revision handle, where a provider exposes one.
  -- Nullable because most do not.
  source_version text,

  -- When SetuX last read the record from its source. Nullable: a record that
  -- has never been synchronized has no honest value to put here, and 'now()'
  -- would be a lie told by a default.
  last_synced_at timestamptz,

  -- The demo never claims to be real. Every row this phase writes is synthetic,
  -- and the column is on the row rather than inferred from the source so that a
  -- future real record and a simulated one are distinguishable in the data
  -- itself rather than by convention.
  is_simulated boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- THE idempotency key (arch §22). One record per citizen per record type per
  -- source: re-running the provisioner updates the row it wrote last time
  -- rather than adding a second identity record for the same citizen.
  --
  -- `data_source_id` is part of the key rather than just `(citizen_id,
  -- record_type)` because two sources can legitimately hold the same KIND of
  -- record — a community certificate in DigiLocker and one issued directly by a
  -- department are two records, not a conflict.
  constraint citizen_records_citizen_type_source_unique
    unique (citizen_id, record_type, data_source_id),

  -- A source's own handle is unique WITHIN that source. Two citizens cannot
  -- share one income certificate number, and this is what makes the provisioner
  -- fail loudly rather than quietly attaching one source record to two people.
  --
  -- Deliberately scoped to the source rather than global: `SYNTH-0001` from the
  -- identity registry and `SYNTH-0001` from a bank are unrelated strings that
  -- happen to collide, and a global constraint would make one provider's
  -- numbering scheme constrain another's.
  constraint citizen_records_source_ref_unique
    unique (data_source_id, source_record_ref),

  constraint citizen_records_record_type_format
    check (record_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),

  constraint citizen_records_status_allowed
    check (status in ('ACTIVE', 'STALE', 'UNAVAILABLE')),

  constraint citizen_records_source_ref_not_blank
    check (length(btrim(source_record_ref)) > 0),

  constraint citizen_records_source_version_not_blank
    check (source_version is null or length(btrim(source_version)) > 0)
);

comment on table public.citizen_records is
  'Citizen-scoped registry of the government records SetuX knows about. Independent of applications by design (arch §4.1) — a citizen who has never applied still has records. A projection of what the source holds now, never the historical evidence for an application (that is application_data).';
comment on column public.citizen_records.citizen_id is
  'The owner. There is no application_id: records belong to the citizen, not to an application (arch §4.1, gap C1).';
comment on column public.citizen_records.record_type is
  'The kind of record — same vocabulary and same column name as field_policies.record_type, so the two join without translation.';
comment on column public.citizen_records.authority_department_id is
  'The department responsible for correcting the record. NULL for a provider such as the synthetic bank, which has no officer queue (arch §20.6, §8.1).';
comment on column public.citizen_records.source_record_ref is
  'The provider''s own stable handle. Source metadata, NOT identity — id is the identity. A name, mobile or Aadhaar-like number is a mutable field value and can never key a record (arch §4.1).';
comment on column public.citizen_records.status is
  'ACTIVE / STALE / UNAVAILABLE. Stated honestly; no refresh mechanism exists yet (arch §19, §24).';
comment on column public.citizen_records.last_synced_at is
  'When SetuX last read this record from its source. NULL when never synchronized — not defaulted to now(), which would be a lie.';
comment on column public.citizen_records.is_simulated is
  'True for every synthetic prototype record. The demo never claims to be real.';

-- The one read the citizen API performs: "my records", newest first.
-- `citizen_id` leads because it is the equality column and because it is the
-- column the RLS policy filters on (query-composite-indexes.md: equality first,
-- range/ordering last; security-rls-performance.md: index the policy column).
create index citizen_records_citizen_id_created_at_idx
  on public.citizen_records (citizen_id, created_at desc);

-- FK lookup index. Postgres does not index a foreign key automatically, and an
-- unindexed FK makes both the join and any future ON DELETE check a sequential
-- scan (schema-foreign-key-indexes.md). `citizen_id` is covered by the index
-- above and `data_source_id` by the leading column of the source-ref unique
-- constraint, so only the department FK needs its own.
create index citizen_records_authority_department_id_idx
  on public.citizen_records (authority_department_id);

create trigger citizen_records_set_updated_at
  before update on public.citizen_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. citizen_record_fields
-- -----------------------------------------------------------------------------
-- The current values, one row per field. This is the SetuX PROJECTION of the
-- source, not the source of truth and not the evidence for any application.
create table public.citizen_record_fields (
  id uuid primary key default gen_random_uuid(),

  -- ON DELETE CASCADE, unlike every FK above. A field has no meaning without
  -- its record — an orphaned `identityHolderName` belongs to nobody and says
  -- nothing — which is the same reasoning that makes `citizen_profiles.user_id`
  -- cascade while `government_profiles.organization_id` restricts.
  citizen_record_id uuid not null
    references public.citizen_records (id) on delete cascade,

  -- The NORMALIZED SetuX field key the connectors already emit —
  -- `identityHolderName`, never the provider's own `holder_name`. The same
  -- vocabulary as `field_policies.field_key`, and the CHECK below is that
  -- table's CHECK verbatim, so a key that could not have a policy cannot be
  -- stored as a value either. One field, one name, in every subsystem.
  field_key text not null,

  -- JSONB rather than TEXT: a field value is not always a string. An income
  -- band is a token, an aggregate percentage is a number, a validity date is a
  -- date. Storing everything as TEXT would push type recovery into every
  -- consumer and would make a later proposed-value comparison a string
  -- comparison, which is where "82.4" != "82.40" bugs come from.
  field_value jsonb not null,

  -- When this VALUE was read from the source. Distinct from the record's
  -- `last_synced_at`: a partial refresh can update one field and not another,
  -- and the field-level stamp is what makes that visible rather than implied.
  retrieved_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The idempotency key (arch §22). One value per field per record — running
  -- the provisioner twice updates the value rather than storing two competing
  -- answers to "what is the holder's name?".
  constraint citizen_record_fields_record_key_unique
    unique (citizen_record_id, field_key),

  -- Identical to field_policies_field_key_format: lowerCamelCase, the shape the
  -- connectors' normalization boundary emits.
  constraint citizen_record_fields_field_key_format
    check (field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'),

  -- A field that exists must actually say something. `'null'::jsonb` is a
  -- stored JSON null — a positive assertion that the source holds no value —
  -- which is different from the column being NULL, and different again from the
  -- row being absent. Only the last of those three means "SetuX does not know".
  constraint citizen_record_fields_value_not_json_null
    check (field_value <> 'null'::jsonb)
);

comment on table public.citizen_record_fields is
  'Current normalized field values for a citizen record. A SetuX projection of what the source holds NOW — never the historical evidence for an application, which stays in application_data (arch §4.1, §17).';
comment on column public.citizen_record_fields.field_key is
  'The normalized SetuX key, e.g. identityHolderName. Same vocabulary as field_policies.field_key so policy and value join directly.';
comment on column public.citizen_record_fields.field_value is
  'JSONB: a field value is not always a string. Preserves the source''s own type rather than flattening everything to text.';
comment on column public.citizen_record_fields.retrieved_at is
  'When this value was read from the source. Per-field, because a partial refresh updates some fields and not others.';

-- The FK, and the join the RLS policy below walks. Not redundant with the
-- unique constraint's implicit index — that index leads on `citizen_record_id`
-- too, so it would serve this lookup — but the unique index exists to enforce
-- an invariant and could be reshaped by a later phase, while this one exists to
-- serve the read. Keeping them separate is cheap on a table this size and stops
-- a constraint change from silently removing an access path.
--
-- (Deliberately NOT a second index on `field_key` alone: no query filters on a
-- field key without knowing its record.)
create index citizen_record_fields_record_id_idx
  on public.citizen_record_fields (citizen_record_id);

create trigger citizen_record_fields_set_updated_at
  before update on public.citizen_record_fields
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled on every table in `public` because `public` is exposed through
-- the Data API (setux_rls.sql header).
--
-- The posture here is the one `application_data` already takes, and for the same
-- reason: these rows are written by the backend during workflow execution and
-- read by their owner. Nobody writes them from a browser.
--
--   citizen      SELECT own records only.
--   officer      NOTHING. See below — this is a deliberate decision, not an
--                oversight.
--   anon         NOTHING. No policy targets it.
--   writes       no INSERT / UPDATE / DELETE policy of any kind, for any role.
--                Rows reach these tables through the service role alone.
--
-- WHY NO OFFICER POLICY.
--
-- The obvious move is to let officers read the records their department is the
-- authority for. It is wrong, and it is worth saying why, because adding it
-- later is easy and removing it later is not.
--
-- An officer's authority over a citizen's record is not a property of the
-- record — it arises from a CHANGE TARGET routed to their department (arch
-- §4.6, §8). That table does not exist yet; it is Phase 8/9 work. A policy
-- written now could only approximate the rule with
-- `authority_department_id in (select private.officer_department_ids())`, and
-- that approximation grants every Higher Education officer read access to the
-- education record of EVERY citizen in SetuX — including citizens who have
-- never requested a correction, never consented to anything, and have no
-- business with that department at all.
--
-- That is a speculative broad grant on personal data, justified by a workflow
-- that has not been built. So officers get nothing here. When change targets
-- exist, the policy that arrives with them can be scoped to the relationship
-- that actually confers the authority, which is the correct shape and is
-- strictly narrower than what would have to be walked back otherwise.
alter table public.citizen_records enable row level security;
alter table public.citizen_record_fields enable row level security;

-- `(select auth.uid())` rather than a bare `auth.uid()`: wrapped in a SELECT the
-- planner evaluates it once as an InitPlan instead of once per row
-- (security-rls-performance.md). `citizen_id` is indexed by
-- citizen_records_citizen_id_created_at_idx, so the policy is an index scan.
create policy citizen_records_select_own on public.citizen_records
  for select to authenticated
  using (citizen_id = (select auth.uid()));

comment on policy citizen_records_select_own on public.citizen_records is
  'A citizen reads only their own records. No officer policy exists yet: officer authority comes from a change target (arch §4.6), which Phase 2 does not create — and approximating it here would grant every officer read access to every citizen record in their department.';

-- Ownership through the parent, which is where ownership actually lives. An
-- EXISTS subquery rather than a join, matching `application_data_select_own`
-- exactly: EXISTS stops at the first matching row and cannot duplicate the
-- outer row, and the lookup is a primary-key probe on `citizen_records.id`
-- with `citizen_record_fields.citizen_record_id` indexed on the other side.
--
-- Note the policy re-derives the owner rather than trusting a denormalized
-- `citizen_id` on the field row — there is no such column, deliberately. A
-- duplicated owner is a second thing that can be wrong, and a field whose
-- copied owner disagreed with its record's would be readable by the wrong
-- person while looking perfectly consistent.
create policy citizen_record_fields_select_own on public.citizen_record_fields
  for select to authenticated
  using (
    exists (
      select 1
      from public.citizen_records r
      where r.id = citizen_record_id
        and r.citizen_id = (select auth.uid())
    )
  );

comment on policy citizen_record_fields_select_own on public.citizen_record_fields is
  'A citizen reads field values only through a record they own. Ownership is re-derived from the parent rather than denormalized, so there is no copied owner that could drift.';
