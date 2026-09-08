-- =============================================================================
-- SetuX — Change & Correction Service — Phase 5 — Dependency & impact detection
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §4.3, §12, §14, §22
--         docs/PHASES/feature.md — Change & Correction Phase 5
--
-- The question this table answers is:
--
--   "When field X of record type A changes, which OTHER record types hold a
--    value that would then disagree, and how badly does that matter?"
--
-- It answers it as CONFIGURATION. There is no citizen id here, no change
-- request, no proposed value and no target row: a rule is a statement about
-- KINDS of records, knowable before any citizen exists, exactly as
-- `field_policies` is. That is what makes the impact engine deterministic —
-- the same draft against the same rules always produces the same answer,
-- because the answer is a function of configuration and the citizen's own
-- record inventory, and of nothing else.
--
-- WHAT THIS PHASE IS NOT.
--
-- Phase 5 DETECTS impact. It does not act on it. This migration therefore adds
-- no `change_targets`, no `change_consents`, no routing, no status column and
-- no lifecycle of any kind — arch §4.6–§4.9 place all of those in Phase 6 and
-- later, and a table created now would be a table nothing writes and nothing
-- validates. The engine reads these rules and returns a list; nothing it
-- returns is persisted.
--
-- NAMING, AND ONE DELIBERATE DEVIATION FROM ARCH §4.3.
--
-- §4.3 drafted the columns as `source_document_type` / `source_field` /
-- `dependency_type`. This table uses `source_record_type`, `source_field_key`,
-- `target_record_type`, `target_field_key` and `impact_level` instead, for the
-- reason Phase 1 already recorded when it made the same substitution: the
-- vocabulary is `record_type` and `field_key` everywhere else in the service —
-- `field_policies`, `citizen_records`, `citizen_record_fields`,
-- `change_request_fields` — and a rule table that spelled the same two concepts
-- differently would need translation at every join it participates in. One name
-- for one concept.
--
-- `impact_level` rather than `dependency_type` because the column does not
-- classify the KIND of dependency, it grades how strongly the citizen should
-- act on it: REQUIRED, RECOMMENDED, OPTIONAL are strengths on one axis, and the
-- API, the badge and the merge rule all speak of them that way.
--
-- Additive and non-destructive: no DROP, no TRUNCATE, no DELETE, no ALTER of an
-- existing table, and no existing migration is modified. `field_policies`,
-- `citizen_records`, `citizen_record_fields`, `change_requests`,
-- `change_request_fields` and the whole scholarship flow are untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. change_impact_level
-- -----------------------------------------------------------------------------
-- An enum rather than TEXT with a CHECK, and the choice is the opposite of the
-- one `field_policies.record_type` made — deliberately, because the two columns
-- are different kinds of thing.
--
-- `record_type` is TEXT because the set of record types GROWS with the
-- connectors SetuX federates: a sixth record type is a seed change, and must
-- not be an ALTER TYPE.
--
-- The impact vocabulary does not grow. Three levels are the product's whole
-- classification (feature.md Phase 5: "Required / Recommended / Optional"), the
-- merge rule below is a total order over exactly these three, and the UI has a
-- badge for each. A fourth value would not be a configuration change — it would
-- be a product decision requiring a new badge, a new position in the ordering
-- and a new sentence explaining it to a citizen. An enum makes that a schema
-- change, which is what it is.
--
-- It also gives the backend its type for free: `Enums<'change_impact_level'>`
-- is generated from this declaration, so the TypeScript union and the database
-- cannot drift, the same way `field_editability` already works.
create type public.change_impact_level as enum (
  -- The target record holds the same fact and would be left contradicting the
  -- source. A citizen who corrects one and not the other has two governments
  -- records disagreeing about their name.
  'REQUIRED',
  -- The target holds the same fact, but the mismatch is unlikely to block the
  -- citizen immediately. Worth doing; not doing it is a real choice.
  'RECOMMENDED',
  -- The target may hold the same fact, held by a provider outside the
  -- government's own systems. Offered honestly, insisted on not at all.
  'OPTIONAL'
);

comment on type public.change_impact_level is
  'How strongly a dependent record should be corrected alongside the source: REQUIRED > RECOMMENDED > OPTIONAL. A closed product vocabulary, unlike record_type, which is configuration and stays TEXT.';

-- -----------------------------------------------------------------------------
-- 2. change_dependency_rules
-- -----------------------------------------------------------------------------
create table public.change_dependency_rules (
  id uuid primary key default gen_random_uuid(),

  -- WHERE THE CHANGE STARTS.
  --
  -- TEXT with the same CHECK shape as `field_policies.record_type` and
  -- `citizen_records.record_type`, so `(source_record_type, source_field_key)`
  -- joins the policy table and `target_record_type` joins the registry without
  -- translation.
  --
  -- Deliberately NOT a foreign key to `field_policies`. The two tables answer
  -- different questions — "may this be changed?" and "what else does changing
  -- it affect?" — and an FK would make retiring a policy row cascade into
  -- silently deleting or blocking a dependency rule. The seed below asserts the
  -- correspondence instead, at the point where it is knowable.
  source_record_type text not null,
  source_field_key   text not null,

  -- WHERE THE CONSEQUENCE LANDS.
  --
  -- A record TYPE, never a record id. A rule is configuration and cannot know
  -- which citizen it will be evaluated for; whether this citizen actually HOLDS
  -- a record of this type is a separate question the engine answers per request
  -- against `citizen_records` (arch §12: "a rule only produces a target when the
  -- citizen actually has a matching row").
  target_record_type text not null,

  -- The specific field of the target that holds the same fact.
  --
  -- Carried even though Phase 5's response is per-RECORD rather than per-field,
  -- because it is what makes a rule verifiable and explicable: "the income
  -- certificate's `incomeCertificateHolder` is the same name" is a claim a
  -- reader can check against the seeded policy set, where "the income record is
  -- affected" is not. It is also what a later phase's target will correct.
  target_field_key text not null,

  impact_level public.change_impact_level not null,

  -- The department that would carry out the correction on the target.
  --
  -- A real UUID foreign key, never the `services.department` text join (arch
  -- §4.3, §7 gap C7, Decision 3): renaming a department must not silently
  -- unroute every rule pointing at it.
  --
  -- NULLABLE, and the nullability is a modelling statement rather than a
  -- convenience — exactly as it is on `citizen_records.authority_department_id`.
  -- The bank is a PROVIDER, not a department. It has no officer queue and never
  -- will, so a bank rule carries no department, and inventing a "Demo Public
  -- Bank" department row to satisfy a NOT NULL would fabricate a government
  -- office (arch §20.6, §8.1).
  --
  -- Phase 5 does not ROUTE anything with this column. It is stored because it
  -- is a property of the rule, and because feature.md Phase 6 requires showing
  -- the citizen which department is responsible before they consent.
  responsible_department_id uuid references public.departments (id) on delete restrict,

  -- WHY, in the citizen's own terms.
  --
  -- NOT NULL, and that is the constraint that matters most in this table. An
  -- impact card showing "Income Certificate — REQUIRED" and nothing else asks
  -- somebody to accept a consequence they have not been told the reason for.
  -- Every rule must be able to explain itself, so the column cannot be empty and
  -- cannot be blank.
  --
  -- Written for a citizen, never internal jargon: this string is rendered
  -- verbatim on the impact preview. It contains no citizen data of any kind —
  -- it is a statement about record types, and the engine never interpolates a
  -- value into it.
  reason text not null,

  -- Retiring a rule is a flag, never a delete (arch §22, and the posture
  -- `field_policies.active` already takes). A deleted rule leaves no trace of
  -- why an impact preview stopped listing a record; a deactivated one is
  -- auditable. Only active rules are ever evaluated.
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ONE rule per source field per target field (arch §4.3).
  --
  -- `active` is deliberately NOT part of the key, for the same reason
  -- `field_policies_field_unique` excludes it: including it would permit one
  -- active and one inactive rule for the same pair, and then a second active
  -- one after the first was retired — two live answers to a question that has
  -- one. This is what makes "duplicate active rules are impossible" a property
  -- of the DATA rather than a promise of the seeding script (task §5.7).
  constraint change_dependency_rules_pair_unique
    unique (source_record_type, source_field_key, target_record_type, target_field_key),

  -- The same shapes the rest of the service enforces, so a typo cannot create a
  -- rule naming a record type no registry holds or a field key no policy
  -- governs.
  constraint change_dependency_rules_source_record_type_format
    check (source_record_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  constraint change_dependency_rules_target_record_type_format
    check (target_record_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  constraint change_dependency_rules_source_field_key_format
    check (source_field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'),
  constraint change_dependency_rules_target_field_key_format
    check (target_field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'),

  -- A record type cannot depend on ITSELF (task §5.4).
  --
  -- Two reasons, and the second is the one that makes this a constraint rather
  -- than a convention. Semantically, the source record is the one being
  -- corrected — listing it as an affected OTHER record would be incoherent, and
  -- the impact preview would show the citizen the record they are already
  -- editing. Structurally, it is what makes a cycle impossible at the level of
  -- the data: combined with the engine's single-hop expansion, there is no
  -- arrangement of rules that can make impact detection revisit its own source
  -- (arch §12, feature.md Phase 5 acceptance: "circular rules cannot cause
  -- infinite processing").
  --
  -- Nothing in the architecture asks for same-record dependencies, so the
  -- exception task §5.4 allows for is not taken.
  constraint change_dependency_rules_no_self_dependency
    check (source_record_type <> target_record_type),

  constraint change_dependency_rules_reason_not_blank
    check (length(btrim(reason)) > 0),

  -- Bounded so a rule cannot become an essay rendered into a card. Generous for
  -- two plain sentences.
  constraint change_dependency_rules_reason_length
    check (length(reason) <= 400)
);

comment on table public.change_dependency_rules is
  'Configuration: which OTHER record types are affected when a field of a record type changes, and how strongly (arch §4.3, §12). Holds no citizen data, no change request and no target — a rule is a statement about record types.';
comment on column public.change_dependency_rules.source_record_type is
  'The record type being corrected. Same vocabulary and column name as field_policies.record_type, so the two join without translation.';
comment on column public.change_dependency_rules.target_record_type is
  'The record type affected. A TYPE, never a record id — whether the citizen actually holds one is resolved per request against citizen_records.';
comment on column public.change_dependency_rules.target_field_key is
  'The field of the target holding the same fact. Makes the rule checkable and explicable, and is what a later phase''s target will correct.';
comment on column public.change_dependency_rules.impact_level is
  'REQUIRED / RECOMMENDED / OPTIONAL. When several rules hit one target the engine keeps the STRONGEST, in that order.';
comment on column public.change_dependency_rules.responsible_department_id is
  'The department that would carry out the correction. NULL for a provider such as the synthetic bank, which has no officer queue (arch §20.6, §8.1). Phase 5 stores it; it routes nothing.';
comment on column public.change_dependency_rules.reason is
  'Why the target is affected, written for a citizen and rendered verbatim on the impact preview. NOT NULL: an impact with no explanation asks somebody to accept a consequence they have not been told the reason for.';
comment on column public.change_dependency_rules.active is
  'Only active rules are evaluated. Retiring a rule is a flag, never a delete, so a preview that stops listing a record leaves a trace of why.';

-- THE read the impact engine performs: active rules for the set of
-- `(source_record_type, source_field_key)` pairs a draft changed.
--
-- A PARTIAL index on `active` (query-partial-indexes.md): every evaluation
-- filters `active = true`, inactive rows are never read by any query in the
-- service, and excluding them keeps the index proportional to the rules that
-- can actually fire. The leading columns are the two equality columns, in the
-- order the lookup supplies them (query-composite-indexes.md).
--
-- The unique constraint's index also leads on `source_record_type`, so it could
-- serve this lookup — this one exists because it is smaller, and because the
-- engine's access path should not depend on the shape of a constraint that
-- exists for a different reason.
create index change_dependency_rules_active_source_idx
  on public.change_dependency_rules (source_record_type, source_field_key)
  where active;

comment on index public.change_dependency_rules_active_source_idx is
  'Serves the impact engine''s only read: active rules for the source fields a draft changed.';

-- FK lookup index. Postgres does not index a foreign key automatically, and an
-- unindexed one makes the ON DELETE RESTRICT check on `departments` a
-- sequential scan (schema-foreign-key-indexes.md).
create index change_dependency_rules_responsible_department_id_idx
  on public.change_dependency_rules (responsible_department_id);

create trigger change_dependency_rules_set_updated_at
  before update on public.change_dependency_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled on every table in `public` because `public` is exposed through
-- the Data API (setux_rls.sql header).
--
-- This is reference data, and it takes the reference-data posture exactly as
-- `field_policies`, `service_requirements` and `data_sources` do:
--
--   SELECT for `authenticated`, ACTIVE rows only
--   no INSERT / UPDATE / DELETE policy of any kind, for any role
--   `anon` — nothing. No policy targets it.
--
-- WHY A READ POLICY AT ALL, when the backend is authoritative and the frontend
-- has no direct query for these rows.
--
-- Two reasons, and neither is "the frontend might want it". First, consistency:
-- the citizen-facing configuration tables in this service are readable by a
-- signed-in user, and a rule table that were not would be the one exception a
-- future reader has to discover. Second, it is the narrower of the two honest
-- options — the alternative is no policy at all, which under RLS means no
-- authenticated read, and which would have to be widened later by somebody who
-- may not re-derive why the write side must stay closed.
--
-- WHAT THE POLICY DOES NOT DO is the important half. There is no write policy,
-- so neither a citizen nor an officer can create, edit, retire or delete a
-- dependency rule from the browser under any circumstances. Rules reach this
-- table through migrations and the service role alone.
--
-- The read is also NOT how impact is decided. The backend re-reads these rows
-- server-side for every impact request and takes its own answer; a client that
-- read the table and posted back an impact level would find no parameter that
-- accepts one (task §11, §24).
alter table public.change_dependency_rules enable row level security;

create policy change_dependency_rules_select_authenticated
  on public.change_dependency_rules
  for select to authenticated using (active);

comment on policy change_dependency_rules_select_authenticated on public.change_dependency_rules is
  'Any signed-in user may read ACTIVE rules. Retired rules are not exposed to the browser, and no write policy exists — rules are written by migrations and the service role alone.';

-- -----------------------------------------------------------------------------
-- 4. Synthetic dependency rule seed
-- -----------------------------------------------------------------------------
-- THE CANONICAL SCENARIO (arch §23, feature.md Phase 5).
--
-- One citizen corrects the name on their identity record. Four other records
-- across three departments and one provider hold that same name:
--
--   IDENTITY_RECORD.identityHolderName
--       ├→ INCOME_RECORD.incomeCertificateHolder      REQUIRED     Revenue
--       ├→ EDUCATION_RECORD.educationStudentName      RECOMMENDED  Higher Ed
--       ├→ COMMUNITY_RECORD.communityCertificateHolder RECOMMENDED Minority Affairs
--       └→ BANK_DETAILS.bankAccountHolder             OPTIONAL     provider
--
-- Every one of those four target fields is a real, seeded `field_policies` row
-- carrying `dependency_group = 'LEGAL_NAME'` — the group Phase 1 seeded for
-- precisely this purpose. The rules below are that group made explicit and
-- directional: `dependency_group` says "these fields hold the same fact",
-- which is symmetric and carries no strength; a rule says "changing THIS one
-- affects THAT one, this much", which is what the engine needs.
--
-- WHY THE LEVELS ARE WHAT THEY ARE, since "REQUIRED for income, RECOMMENDED for
-- education" is otherwise an arbitrary-looking pair:
--
--   INCOME_RECORD is REQUIRED because the income certificate is the document
--   the scholarship flow actually reads (it is a `service_requirements` row).
--   A certificate whose holder name no longer matches the identity record is a
--   certificate that will fail verification, so leaving it is not a soft choice.
--
--   EDUCATION_RECORD and COMMUNITY_RECORD are RECOMMENDED because a mismatch
--   there surfaces later, at the next enrolment or the next certificate use,
--   rather than blocking anything today.
--
--   BANK_DETAILS is OPTIONAL because the bank is not a government system. SetuX
--   can offer to pass the correction on; it cannot describe updating a private
--   provider's record as an obligation of government (arch §8.1).
--
-- THE SECOND SOURCE: address.
--
-- `identityAddress` is EDITABLE in the seeded policy set and
-- `incomeAddress` is the only other seeded field carrying
-- `dependency_group = 'ADDRESS'`. One rule, and one only, because that is what
-- the policy inventory actually supports (task §6: rules must fit existing
-- field policies). It is RECOMMENDED rather than REQUIRED: an out-of-date
-- address on an income certificate is a correspondence problem, not a
-- verification failure.
--
-- WHAT IS DELIBERATELY NOT SEEDED.
--
--   identityMobile   `dependency_group = 'CONTACT'`, and it is the ONLY field
--                    in that group. No other seeded record holds a mobile
--                    number, so there is nothing for a mobile change to affect.
--                    Inventing a rule to a record type that does not hold the
--                    field would be a fabricated government dependency, and the
--                    engine would then have to explain an impact that is not
--                    real. A mobile-number correction correctly produces an
--                    EMPTY impact list, which is a case the UI handles and the
--                    tests assert.
--
--   identityBirthYear  CONDITIONALLY_EDITABLE, and no other seeded record holds
--                      a date of birth. Same reasoning.
--
--   Income, education and community FINDINGS — the band, the marks, the
--   category — are IMMUTABLE in the policy set, so they can never be a rule's
--   SOURCE: no draft can contain them.
--
-- No rule below asserts a law, a statute or a real government process. Each is
-- a statement about which synthetic records in this prototype hold the same
-- synthetic value.
--
-- Idempotent, keyed on the natural unique key, exactly like the Phase 1 policy
-- seed: re-running updates the rule rather than duplicating or failing (arch
-- §22). `active = true` is restored on conflict so a re-run repairs a rule that
-- was retired by hand.
insert into public.change_dependency_rules (
  source_record_type, source_field_key,
  target_record_type, target_field_key,
  impact_level, responsible_department_id, reason
)
select
  r.source_record_type, r.source_field_key,
  r.target_record_type, r.target_field_key,
  r.impact_level::public.change_impact_level,
  d.id,
  r.reason
from (values
  -- 1. Legal name — the canonical four (arch §23).
  (
    'IDENTITY_RECORD', 'identityHolderName',
    'INCOME_RECORD',   'incomeCertificateHolder',
    'REQUIRED', 'REVENUE_DEPT',
    'Your income certificate is issued in the same name. If it is not updated too, the two records will disagree and the certificate may not be accepted.'
  ),
  (
    'IDENTITY_RECORD',   'identityHolderName',
    'EDUCATION_RECORD',  'educationStudentName',
    'RECOMMENDED', 'HIGHER_ED',
    'Your education record shows the same name. Updating it as well helps avoid a mismatch the next time your enrolment details are checked.'
  ),
  (
    'IDENTITY_RECORD',   'identityHolderName',
    'COMMUNITY_RECORD',  'communityCertificateHolder',
    'RECOMMENDED', 'MINORITY_AFFAIRS',
    'Your community certificate is issued in the same name. Updating it as well helps avoid a mismatch when the certificate is next used.'
  ),
  (
    'IDENTITY_RECORD', 'identityHolderName',
    'BANK_DETAILS',    'bankAccountHolder',
    -- No department: the bank is a provider (arch §20.6, §8.1). The NULL is
    -- produced by the LEFT JOIN below finding no department with this code.
    'OPTIONAL', null,
    'Your bank account is held in the same name. This account is with a bank rather than a government department, so updating it is your choice.'
  ),

  -- 2. Address — the one rule the seeded policy set supports.
  (
    'IDENTITY_RECORD', 'identityAddress',
    'INCOME_RECORD',   'incomeAddress',
    'RECOMMENDED', 'REVENUE_DEPT',
    'Your income certificate records the same address. Updating it as well helps make sure letters about it reach you.'
  )
) as r (
  source_record_type, source_field_key,
  target_record_type, target_field_key,
  impact_level, department_code, reason
)
-- LEFT JOIN, not an inner join: the bank rule has no department, and an inner
-- join would silently drop it — the worst possible failure mode for a seed,
-- because the migration would succeed and the demo would be missing exactly the
-- target that proves providers are handled differently from departments.
left join public.departments d on d.code = r.department_code
on conflict (source_record_type, source_field_key, target_record_type, target_field_key)
do update
  set impact_level              = excluded.impact_level,
      responsible_department_id = excluded.responsible_department_id,
      reason                    = excluded.reason,
      active                    = true;

-- -----------------------------------------------------------------------------
-- 5. Seed verification
-- -----------------------------------------------------------------------------
-- The seed above names five source/target field pairs. Every one of them must
-- correspond to a real, ACTIVE `field_policies` row, and the source of each must
-- be a field a citizen can actually ask to change — a rule whose source is
-- IMMUTABLE can never fire, and a rule whose target field no policy governs
-- describes a consequence SetuX cannot explain.
--
-- Asserted here rather than assumed, and asserted at MIGRATION time rather than
-- in a test, because the failure it catches is a seed that quietly does nothing:
-- the insert succeeds, the table looks populated, and the impact preview is
-- empty for a reason nobody can see. This is the same check the demo
-- provisioner performs before writing a field value.
--
-- Note it does NOT check `active` on the target policy for anything but
-- existence: whether a target field is currently editable is a question for the
-- phase that creates the target request, not for the rule that predicts it.
--
-- The department check is the third of these, and it exists because of the
-- LEFT JOIN above. That join is required — the bank rule genuinely has no
-- department — but it means a department code that is absent produces a NULL
-- silently rather than an error, and BANK_DETAILS is then indistinguishable in
-- the data from a rule whose department simply failed to resolve. Two of the
-- four codes used (`HIGHER_ED`, `MINORITY_AFFAIRS`) are seeded by
-- `supabase/seed/seed.sql` rather than by a migration, so on a from-scratch
-- replay without that seed they would be missing. Asserting it here turns that
-- into a failed migration instead of an impact preview that quietly names no
-- responsible department.
do $$
declare
  missing_source integer;
  missing_target integer;
  immutable_source integer;
  unrouted_department integer;
begin
  select count(*) into missing_source
  from public.change_dependency_rules r
  where not exists (
    select 1 from public.field_policies p
    where p.record_type = r.source_record_type
      and p.field_key   = r.source_field_key
  );

  select count(*) into missing_target
  from public.change_dependency_rules r
  where not exists (
    select 1 from public.field_policies p
    where p.record_type = r.target_record_type
      and p.field_key   = r.target_field_key
  );

  select count(*) into immutable_source
  from public.change_dependency_rules r
  join public.field_policies p
    on p.record_type = r.source_record_type
   and p.field_key   = r.source_field_key
  where p.editability = 'IMMUTABLE';

  -- Every rule EXCEPT the bank one must have resolved a department. The bank is
  -- named explicitly rather than tested as "any NULL is fine", so that a future
  -- rule losing its department is caught rather than absorbed.
  select count(*) into unrouted_department
  from public.change_dependency_rules r
  where r.responsible_department_id is null
    and r.target_record_type <> 'BANK_DETAILS';

  if missing_source > 0 then
    raise exception
      'change_dependency_rules: % rule(s) name a source field with no field_policies row', missing_source;
  end if;

  if missing_target > 0 then
    raise exception
      'change_dependency_rules: % rule(s) name a target field with no field_policies row', missing_target;
  end if;

  if immutable_source > 0 then
    raise exception
      'change_dependency_rules: % rule(s) have an IMMUTABLE source field and could never fire', immutable_source;
  end if;

  if unrouted_department > 0 then
    raise exception
      'change_dependency_rules: % departmental rule(s) resolved no responsible department — is supabase/seed/seed.sql applied?', unrouted_department;
  end if;
end $$;
