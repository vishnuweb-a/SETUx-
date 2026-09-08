-- =============================================================================
-- SetuX — Change & Correction Service — Phase 4 — Correction reason
-- =============================================================================
-- Source: docs/ARCHITECTURE/change-correction-service.md §4.5
--         docs/PHASES/feature.md — Change & Correction Phase 4
--
-- `change_request_fields.reason` — why the citizen says the value is wrong.
--
-- A separate migration rather than an edit to 20260908163355, because that
-- migration has already been applied to the remote database. Rewriting an
-- applied migration would leave the local file and the deployed schema
-- describing different things, and every environment that had already run it
-- would silently skip the change.
--
-- WHY THE COLUMN EXISTS. Arch §4.5 lists `reason` on this table, and the Phase 4
-- form in feature.md shows it beside the new value. It is the citizen's own
-- account of the correction — "legal name change", "spelling error on the
-- certificate" — and it is what an officer will eventually read first, because
-- "Demo Old Name → Demo New Name" says what changed and nothing at all about
-- why it should.
--
-- WHY IT IS NULLABLE. A reason is genuinely optional at DRAFT. A citizen part
-- way through a correction has not necessarily written one yet, and refusing to
-- save their work until they do would make the draft less useful than the
-- transient form it replaces. The phase that owns SUBMISSION is the right place
-- to require one, because that is the point at which somebody else has to read
-- it — and requiring it there is a service-layer rule about a transition, not a
-- NOT NULL on a column that must also hold half-finished work.
--
-- Additive and non-destructive: one nullable column with a CHECK. No data is
-- rewritten, no constraint on existing columns changes, and no other table is
-- touched.
-- =============================================================================

alter table public.change_request_fields
  add column reason text;

comment on column public.change_request_fields.reason is
  'The citizen''s own account of why this value is wrong (arch §4.5). Optional at DRAFT; the phase that owns submission decides whether to require one. Free text from a citizen — never interpolated into SQL, never logged.';

-- Blank is not a reason. A column that accepts '   ' has two representations of
-- "not given", and the one that is not NULL reads as though the citizen wrote
-- something. The upper bound is what stops an unbounded text column reachable
-- from a request body becoming a storage-abuse surface; no genuine explanation
-- approaches it.
alter table public.change_request_fields
  add constraint change_request_fields_reason_shaped
  check (
    reason is null
    or (length(btrim(reason)) between 1 and 500)
  );
