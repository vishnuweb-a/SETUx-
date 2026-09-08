-- =============================================================================
-- SetuX — Change & Correction Service — Phase 4 — Change draft & editable form
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §4.4, §4.5, §5, §13,
--         §14, §22
--         docs/PHASES/feature.md — Change & Correction Phase 4
--
-- The question this pair of tables answers is:
--
--   "What has this citizen ASKED to have corrected, and what did the source
--    say when they asked?"
--
-- Both halves matter, and keeping them apart is the whole point of the phase.
-- `citizen_record_fields.field_value` is what the provider holds. A citizen
-- typing a new name into SetuX does not change that, must not change that, and
-- nothing in this migration gives them a path to. What they get instead is a
-- DRAFT: a separate row, owned by them, recording a request.
--
--   citizen_record_fields.field_value        the provider's current value
--   change_request_fields.old_value          an immutable snapshot of that
--                                            value, taken server-side when the
--                                            draft was created
--   change_request_fields.proposed_value     what the citizen is asking for
--
-- Arch §13 states the rule these three columns exist to make true: "a citizen
-- proposal is never an official value". `proposed_value` is never copied into
-- `citizen_record_fields`, `citizen_profiles` or `application_data` — not at
-- draft time, and not at any later time by anything this migration creates.
--
-- WHY old_value IS SNAPSHOTTED RATHER THAN JOINED.
--
-- The obvious alternative is to store only `citizen_record_field_id` and read
-- the current value through it whenever the draft is displayed. It is wrong,
-- and the reason is the reason this feature exists at all: the source value can
-- MOVE. If it does, a joined "old value" silently rewrites what the citizen was
-- looking at when they made the request, and an officer later reviews a
-- before/after pair that nobody ever actually saw. The snapshot is evidence of
-- what was on screen; the FK is how a later phase can notice the two have
-- diverged. Both are stored, deliberately, because they answer different
-- questions (task §14).
--
-- Scope discipline. This migration adds TWO tables and nothing else. It adds no
-- change_targets, no change_consents, no change_reviews, no change_events, no
-- dependency rule and no connector — every one of those is Phase 5 or later
-- (arch §4.6–§4.9, §25), and none is referenced here. The status column admits
-- exactly one value, DRAFT, because that is the only state Phase 4 can produce;
-- a CHECK listing states no code can reach would be a promise the schema does
-- not keep, and the enum that eventually models the full lifecycle (arch §5)
-- arrives with the transitions that need it.
--
-- Additive and non-destructive: no DROP, no TRUNCATE, no DELETE, no ALTER of an
-- existing table, and no existing migration is modified. `citizen_records`,
-- `citizen_record_fields`, `application_data`, `applications` and the
-- scholarship flow are untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Change request number sequence
-- -----------------------------------------------------------------------------
-- Format: CR-{YEAR}-{SEQUENCE}, e.g. CR-2026-000001 (arch §4.4).
--
-- Mirrors `next_application_number()` exactly — same sequence-plus-function
-- shape, same `security invoker`, same empty `search_path`. A citizen-facing
-- reference the citizen can quote is generated SERVER-SIDE and only
-- server-side: it is a column default, so there is no request body field
-- through which a client could name its own request number and no code path
-- that reads one from input.
--
-- This is also why the API can address drafts by a UUID and still show the
-- citizen something quotable: the UUID is unguessable identity, the reference
-- is a human handle, and neither is derived from the other.
create sequence public.change_request_number_seq as bigint start with 1 increment by 1;

create or replace function public.next_change_request_number()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'CR-'
      || to_char(now() at time zone 'utc', 'YYYY')
      || '-'
      || lpad(nextval('public.change_request_number_seq')::text, 6, '0');
$$;

comment on function public.next_change_request_number() is
  'Returns the next human-readable change request number, CR-{YEAR}-{SEQUENCE} (arch §4.4). Server-generated only; no client supplies one.';

-- -----------------------------------------------------------------------------
-- 2. change_requests — the parent draft
-- -----------------------------------------------------------------------------
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),

  -- The citizen-facing handle. Defaulted, never supplied.
  request_number text not null unique default public.next_change_request_number(),

  -- The owner, and the only identity that grants access to this row. RESTRICT
  -- for the same reason `citizen_records.citizen_id` restricts: a request that
  -- a department may still be acting on must not vanish because an identity row
  -- was removed.
  citizen_id uuid not null references public.profiles (id) on delete restrict,

  -- The record the citizen started from. RESTRICT rather than CASCADE, and the
  -- choice is deliberate: a change request is a record of something a citizen
  -- ASKED FOR, and deleting the source record must not silently erase the
  -- request — it should fail loudly and make somebody decide what the request
  -- now means.
  --
  -- Note what is NOT here: no `record_type` column. It is reachable through
  -- this FK, and duplicating it would create a second thing that can be wrong —
  -- a request claiming IDENTITY_RECORD while pointing at an income record would
  -- pass every constraint and fail policy lookup in a way nothing explains
  -- (task §4: "do not duplicate values obtainable through a stable FK").
  source_record_id uuid not null references public.citizen_records (id) on delete restrict,

  -- DRAFT and nothing else, in Phase 4.
  --
  -- The full parent lifecycle is arch §5 — CONSENT_PENDING, SUBMITTED,
  -- IN_REVIEW, COMPLETED, PARTIALLY_COMPLETED, PARTIALLY_REJECTED, REJECTED,
  -- CANCELLED. None of them is admitted here, because no code in this phase can
  -- produce one and a CHECK that permits states nothing reaches invites a
  -- future writer to set one directly rather than through the transition
  -- function that will own it. Widening a CHECK in a later migration is a
  -- one-line change; discovering a request that jumped to SUBMITTED without
  -- consent is not.
  status text not null default 'DRAFT',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint change_requests_status_allowed
    check (status in ('DRAFT'))
);

comment on table public.change_requests is
  'A citizen-owned draft correction request (arch §4.4). Phase 4 creates DRAFT rows only. Holds no proposed value itself — those live one per field on change_request_fields.';
comment on column public.change_requests.request_number is
  'Human-readable reference, CR-{YEAR}-{SEQUENCE}. Server-generated via a column default; never accepted from a client.';
comment on column public.change_requests.source_record_id is
  'The citizen_record the correction was started from. The record type is read through this FK rather than duplicated, so the two cannot disagree.';
comment on column public.change_requests.status is
  'DRAFT only in Phase 4. The wider lifecycle (arch §5) arrives with the transitions that produce it, so no unreachable state is admitted early.';

-- The one read the citizen API performs: "my drafts", newest first. `citizen_id`
-- leads because it is the equality column and the column the RLS policy filters
-- on (query-composite-indexes.md; security-rls-performance.md).
create index change_requests_citizen_id_created_at_idx
  on public.change_requests (citizen_id, created_at desc);

-- FK lookup index. Postgres does not create one automatically, and without it
-- both the join and the ON DELETE RESTRICT check on `citizen_records` are
-- sequential scans (schema-foreign-key-indexes.md).
create index change_requests_source_record_id_idx
  on public.change_requests (source_record_id);

create trigger change_requests_set_updated_at
  before update on public.change_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. change_request_fields — one requested correction
-- -----------------------------------------------------------------------------
create table public.change_request_fields (
  id uuid primary key default gen_random_uuid(),

  -- CASCADE, unlike the FKs above. A requested field has no meaning apart from
  -- its request — an orphaned "proposed: Demo New Name" belongs to no request
  -- and asks nobody for anything — which is the same reasoning that makes
  -- `citizen_record_fields.citizen_record_id` cascade.
  change_request_id uuid not null
    references public.change_requests (id) on delete cascade,

  -- The specific source field row this correction targets.
  --
  -- RESTRICT: a source field with a pending request against it must not be
  -- deletable out from under that request. This FK is also what makes the
  -- stale-value question answerable later — comparing `old_value` against this
  -- row's current `field_value` is how a Phase 5+ conflict check will detect
  -- that the source moved after the draft was taken (task §14).
  citizen_record_field_id uuid not null
    references public.citizen_record_fields (id) on delete restrict,

  -- The normalized SetuX key, denormalized from the field row above.
  --
  -- This is the one deliberate duplication in the table, and it earns its place
  -- twice over. It is what the unique constraint below can be written against
  -- (a request must not carry two corrections to `identityHolderName`, and
  -- expressing that through the FK alone would not prevent two field rows with
  -- the same key), and it is what keeps the draft legible when read on its own.
  -- Its CHECK is `citizen_record_fields`' CHECK verbatim, so a key that could
  -- not be a value cannot be requested either.
  field_key text not null,

  -- WHAT THE SOURCE SAID, snapshotted server-side at draft creation.
  --
  -- Never accepted from a client — arch §4.5 is explicit: "captured from
  -- citizen_record_fields server-side at draft time and never accepted from the
  -- client" — and never rewritten afterwards. A PATCH changes `proposed_value`
  -- and leaves this column exactly as it was, because the citizen is amending
  -- their request, not amending history.
  old_value jsonb not null,

  -- WHAT THE CITIZEN IS ASKING FOR.
  --
  -- A request, not a value (arch §13). Nothing in SetuX treats this column as
  -- authoritative for anything: it is not read by the retrieval path, not by
  -- verification, not by the scholarship flow, and it is not copied into
  -- `citizen_record_fields` — not here and not by any later approval. Only a
  -- confirmed connector result refreshes the projection, and it refreshes it
  -- from what the connector returned.
  --
  -- JSONB, matching `citizen_record_fields.field_value`. Storing the proposal
  -- in the same representation as the value is what lets "did this actually
  -- change?" be a JSONB comparison rather than a string comparison of two
  -- differently-formatted renderings of the same number.
  proposed_value jsonb not null,

  -- The Phase 1 policy AS IT APPLIED WHEN THE DRAFT WAS TAKEN (arch §4.5).
  --
  -- The record-time editability, requiresEvidence, requiresReview and authority,
  -- frozen. Live policy is still re-read and re-enforced on every mutation —
  -- this snapshot never authorizes anything, and a field that has since become
  -- IMMUTABLE is refused on the next write regardless of what is stored here.
  -- What it provides is honesty after the fact: an officer reviewing a decided
  -- request must see the rules the citizen was actually shown, so that editing a
  -- policy tomorrow cannot retroactively reinterpret a request made today.
  policy_snapshot jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One correction per field per request (task §4 invariant 10). Makes
  -- duplicate field entries structurally impossible rather than a service-layer
  -- promise — two rows proposing different names for one field would be a draft
  -- with no determinate meaning.
  constraint change_request_fields_request_key_unique
    unique (change_request_id, field_key),

  -- A request must not carry the same SOURCE FIELD ROW twice either. The key
  -- constraint above is the one that matters semantically; this one closes the
  -- gap where two different keys somehow resolved to one field row.
  constraint change_request_fields_request_source_field_unique
    unique (change_request_id, citizen_record_field_id),

  -- Identical to citizen_record_fields_field_key_format and
  -- field_policies_field_key_format: lowerCamelCase, the shape the connectors'
  -- normalization boundary emits. One vocabulary in every subsystem.
  constraint change_request_fields_field_key_format
    check (field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'),

  -- Neither side may be a stored JSON null. `'null'::jsonb` on `old_value`
  -- would mean "the source positively holds nothing", which
  -- `citizen_record_fields` already forbids and so cannot be snapshotted; on
  -- `proposed_value` it would be a request to blank a government field, which
  -- is not a correction this service offers.
  constraint change_request_fields_old_value_not_json_null
    check (old_value <> 'null'::jsonb),

  constraint change_request_fields_proposed_value_not_json_null
    check (proposed_value <> 'null'::jsonb),

  -- A proposal identical to the snapshot is not a correction. Refused in the
  -- service with a message the citizen can act on, and refused again here so
  -- the invariant is true of the DATA and not merely of the code path that
  -- happened to write it (schema-constraints.md: constraints belong in the
  -- database when they state what must always be true).
  constraint change_request_fields_proposal_differs
    check (proposed_value <> old_value),

  -- The snapshot must actually describe a policy. Not a full schema check —
  -- JSONB cannot express one usefully — but enough that a row cannot carry an
  -- empty object where an editability is required.
  constraint change_request_fields_policy_snapshot_shaped
    check (
      jsonb_typeof(policy_snapshot) = 'object'
      and policy_snapshot ? 'editability'
      and policy_snapshot ->> 'editability' in ('EDITABLE', 'CONDITIONALLY_EDITABLE')
    )
);

comment on table public.change_request_fields is
  'One requested field correction. Holds the server-taken snapshot of the source value (old_value) beside the citizen''s request (proposed_value). Neither column is ever copied into citizen_record_fields (arch §13).';
comment on column public.change_request_fields.citizen_record_field_id is
  'The source field row this targets. Kept alongside the snapshot so a later phase can detect that the source moved after the draft was taken.';
comment on column public.change_request_fields.field_key is
  'The normalized SetuX key. Denormalized from the source field row so the one-correction-per-field unique constraint can be expressed and the draft reads on its own.';
comment on column public.change_request_fields.old_value is
  'IMMUTABLE snapshot of what the source held at draft creation. Captured server-side, never accepted from a client, never rewritten by a later edit (arch §4.5).';
comment on column public.change_request_fields.proposed_value is
  'What the citizen is asking for. A request, never a value — never copied into citizen_record_fields, citizen_profiles or application_data (arch §13).';
comment on column public.change_request_fields.policy_snapshot is
  'The Phase 1 policy as it applied when the draft was taken. Evidence, never authorization: live policy is re-read and re-enforced on every mutation.';

-- The FK, and the join the RLS policy below walks. The unique constraint's
-- index also leads on `change_request_id` and would serve this lookup — this
-- one exists so a later reshaping of that constraint cannot silently remove the
-- access path, the same reasoning citizen_record_fields_record_id_idx records.
create index change_request_fields_request_id_idx
  on public.change_request_fields (change_request_id);

-- The reverse lookup: "is there a draft outstanding against this source field?"
-- Needed for the ON DELETE RESTRICT check on `citizen_record_fields`, which is
-- a sequential scan without it (schema-foreign-key-indexes.md), and it is the
-- access path a later stale-value comparison will use.
create index change_request_fields_citizen_record_field_id_idx
  on public.change_request_fields (citizen_record_field_id);

create trigger change_request_fields_set_updated_at
  before update on public.change_request_fields
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled on every table in `public` because `public` is exposed through
-- the Data API (setux_rls.sql header).
--
-- The posture is the one `citizen_records` takes, and for the same reason: the
-- backend is the authoritative mutation layer, these rows are written by it
-- through the service role, and they are read by their owner.
--
--   citizen   SELECT own drafts only.
--   officer   NOTHING.
--   anon      NOTHING. No policy targets it.
--   writes    no INSERT / UPDATE / DELETE policy of any kind, for any role.
--
-- WHY NO CITIZEN INSERT/UPDATE POLICY, when the citizen is the one creating the
-- draft.
--
-- Because creating a draft is not an insert. It is: verify the record is the
-- caller's, verify every field belongs to that record, re-read the live policy
-- for each, refuse IMMUTABLE, snapshot the source value the citizen never sees
-- in their payload, and only then write. A browser-side INSERT policy would let
-- the Supabase client write a row directly with an `old_value` of its own
-- choosing and a `policy_snapshot` claiming whatever it liked — every check
-- above bypassed, because RLS can express "this row is mine" and cannot express
-- "this old_value is what the source actually holds".
--
-- So the policies here are SELECT-only, and the write path is the backend's
-- alone. That is not RLS being weakened; it is RLS being asked the question it
-- can answer (arch §14: "no INSERT/UPDATE policy on any table whose state the
-- workflow owns").
--
-- WHY NO OFFICER POLICY.
--
-- Same answer Phase 2 gave, and the same reason it is not an oversight: an
-- officer's authority arises from a CHANGE TARGET routed to their department
-- (arch §4.6, §8), and no target exists — Phase 4 creates drafts that have not
-- been submitted to anyone. A draft is a private working document. An officer
-- reading one would be reading a request the citizen has not made yet, and
-- there is no department to scope such a policy to in any case, because routing
-- is Phase 9. Officers get their read with the relationship that justifies it.
alter table public.change_requests enable row level security;
alter table public.change_request_fields enable row level security;

-- `(select auth.uid())` rather than a bare `auth.uid()`: wrapped in a SELECT the
-- planner evaluates it once as an InitPlan instead of once per row
-- (security-rls-performance.md). `citizen_id` leads
-- change_requests_citizen_id_created_at_idx, so the policy is an index scan.
create policy change_requests_select_own on public.change_requests
  for select to authenticated
  using (citizen_id = (select auth.uid()));

comment on policy change_requests_select_own on public.change_requests is
  'A citizen reads only their own change requests. No write policy exists: creating a draft requires server-side ownership, policy and snapshot checks that RLS cannot express, so the backend owns the write path (arch §14).';

-- Ownership through the parent, which is where ownership actually lives. An
-- EXISTS subquery rather than a join, matching citizen_record_fields_select_own
-- exactly: EXISTS stops at the first match and cannot duplicate the outer row,
-- and the lookup is a primary-key probe on `change_requests.id`.
--
-- The owner is re-derived rather than denormalized onto the field row. There is
-- no `citizen_id` column here, deliberately — a copied owner that disagreed
-- with its parent's would make a field row readable by the wrong person while
-- looking perfectly consistent.
create policy change_request_fields_select_own on public.change_request_fields
  for select to authenticated
  using (
    exists (
      select 1
      from public.change_requests r
      where r.id = change_request_id
        and r.citizen_id = (select auth.uid())
    )
  );

comment on policy change_request_fields_select_own on public.change_request_fields is
  'A citizen reads requested corrections only through a request they own. Ownership is re-derived from the parent rather than denormalized, so there is no copied owner that could drift.';
