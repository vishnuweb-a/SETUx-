# `field_policies` — Editable Field Policy

Change & Correction Service, Phase 1.

Migration: `supabase/migrations/20260907182417_setux_field_policies.sql`
Seed mirror: `supabase/seed/seed.sql`
API: `docs/API/field-policies.md`
Design: `docs/ARCHITECTURE/change-correction-service.md` §4.2, §11, §20.5, §25

---

## 1. What this table is

Configuration describing whether a field of a **kind** of government record may
be corrected by a citizen. It holds:

- no citizen value
- no proposed value
- no application, consent or change request

A policy row is true of the record *type*, not of anybody's record. That is why
Phase 1 has no dependency on `citizen_records` existing, and why it can be
built, seeded and tested before a single citizen record does (arch §25).

**Why a table rather than backend constants** (arch §11): the repository has
consistently chosen configuration tables — `services`, `data_sources`,
`service_requirements` — and a policy that lives in a deploy artefact cannot be
demonstrated as policy. `service_requirements` was rejected as a host for the
same information because it is the wrong domain: a requirement describes what a
*service* needs, while editability describes what a *record* permits, and no
service is involved in a correction at all.

---

## 2. Naming: `record_type`, not `document_type`

Arch §4.2 drafted the column as `document_type`. §20.5 and the Phase 1 boundary
in §25 both settled on "record type" and on `(record_type, field_key)`, and §4.1
gives the future `citizen_records.record_type` the same name. One name for one
concept means a later join reads without translation.

---

## 3. Schema

```sql
create type public.field_editability as enum (
  'EDITABLE', 'CONDITIONALLY_EDITABLE', 'IMMUTABLE'
);

create table public.field_policies (
  id                uuid primary key default gen_random_uuid(),
  record_type       text not null,
  field_key         text not null,
  editability       public.field_editability not null,
  requires_evidence boolean not null default false,
  requires_review   boolean not null default false,
  authority         text,
  dependency_group  text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

| Column | Notes |
|---|---|
| `record_type` | `IDENTITY_RECORD`, `INCOME_RECORD`, … TEXT rather than an enum: the set grows with the connectors SetuX federates, which is configuration, and a new record type must not require an `ALTER TYPE`. A CHECK pins the shape. |
| `field_key` | The **normalized SetuX key** the connectors emit — `identityHolderName`, never the provider's `holder_name` (arch §11). Reusing the normalization boundary keeps one field from having two names in two subsystems. |
| `editability` | See §4. |
| `requires_evidence` / `requires_review` | What a `CONDITIONALLY_EDITABLE` field demands. Meaningful for `EDITABLE` too — an editable field may still be reviewed. |
| `authority` | Descriptive owner. **Not** an FK — see §5. |
| `dependency_group` | Fields that change together (`LEGAL_NAME`, `ADDRESS`, `CONTACT`). Recorded in Phase 1; the dependency **engine** is a later phase and a different table (`change_dependency_rules`, arch §4.3), not created here. |
| `active` | Retires a policy without deleting it, so a policy applied to a past request stays readable — the same reasoning that makes `services.status` a column rather than a DELETE. |

### Enum

`field_editability` is an enum rather than TEXT + CHECK because this is a state
the backend owns and it is stable — the rule `setux_enums.sql` states in its
header. A fourth value is deliberately absent: "editable by an officer" is a
property of the workflow, not of the field.

---

## 4. Editability semantics

| Value | Meaning |
|---|---|
| `EDITABLE` | A correction may be requested directly. |
| `CONDITIONALLY_EDITABLE` | A correction may be requested, subject to `requires_evidence` / `requires_review`. |
| `IMMUTABLE` | No citizen may request a correction here. The UI still **shows** the field and names its authority (arch §11). |

---

## 5. Why `authority` is not a foreign key

Arch §20.6 records that two of the five authorities — **Identity Authority** and
**Revenue Department** — do not exist as `departments` rows, and one of them
(the bank) is a **provider** and never will be a department at all.

Seeding synthetic departments to satisfy an FK is Phase 2 routing work.
Inventing them here would be exactly the premature coupling the phase boundary
forbids. When routing arrives it carries `departments.id` UUIDs on the *target*
row, where routing belongs (arch §8) — never the `services.department` text join
that C7 rejected.

---

## 6. Constraints

| Constraint | Purpose |
|---|---|
| `field_policies_field_unique` unique `(record_type, field_key)` | **One authoritative policy per field.** Not `(record_type, field_key, active)`: that would permit an active *and* an inactive policy for the same field, and then "the policy for this field" would have two answers. Versioning is not required in Phase 1 (arch §25), so the simpler invariant is the correct one. |
| `field_policies_record_type_format` | `^[A-Z][A-Z0-9_]{2,63}$` — a typo cannot silently create a sixth record type no endpoint will ask for. |
| `field_policies_field_key_format` | `^[a-z][A-Za-z0-9]{1,63}$` — the lowerCamelCase shape the connectors emit. |
| `field_policies_immutable_demands_nothing` | An `IMMUTABLE` field cannot require evidence or review. *"You may not change this, and here is what you must supply to change it"* is incoherent, and the database is where an incoherent policy should be **impossible** rather than merely unlikely. |
| `field_policies_authority_not_blank` / `..._dependency_group_not_blank` | Descriptive text, when present, must describe something. |

### Index

```sql
create index field_policies_active_record_type_idx
  on public.field_policies (record_type, field_key) where active;
```

Partial, because an inactive policy is never selected by either read path, which
keeps the index the endpoint uses free of rows the endpoint must never return.
It serves both reads: the policy set for one record type, and one policy by
`(record_type, field_key)`.

---

## 7. Row Level Security

Reference-data posture, identical to `service_requirements` and `data_sources`:

| Role | Access |
|---|---|
| `anon` | **Nothing.** No policy targets it. |
| `authenticated` | `SELECT` on **active** rows only (`using (active)`). The browser needs it so the change form can explain which fields are eligible and why. |
| any browser role | **No INSERT, UPDATE or DELETE policy of any kind.** |
| `service_role` | Bypasses RLS; the backend's own path. Policy rows reach the table only through a migration. |

This is what makes the backend structurally authoritative. A client can *read* a
policy; it cannot author one, and the endpoint that serves it re-reads the table
rather than trusting anything the client sends. Retired policies are not exposed
to the browser at all.

---

## 8. Seeded record types

29 policies across the five record types of arch §20.5. Every value is
synthetic; these are field **names** and policy flags, never anybody's data.

| Record type | Fields | Authority |
|---|---|---|
| `IDENTITY_RECORD` | 6 | Identity Authority *(synthetic)* |
| `INCOME_RECORD` | 7 | Revenue Department *(synthetic)* |
| `EDUCATION_RECORD` | 7 | Higher Education *(existing)* |
| `COMMUNITY_RECORD` | 4 | Minority Affairs *(existing)* |
| `BANK_DETAILS` | 5 | Demo Public Bank (Simulated) — a **provider** |

The shape of the decisions, and the reasoning:

- **Legal name** across every record — `CONDITIONALLY_EDITABLE`, evidence **and**
  review. This is the feature's motivating case (feature.md Phase 17). All five
  share `dependency_group = 'LEGAL_NAME'`.
- **Contact and address** — `EDITABLE`. feature.md's own field-class table lists
  Mobile and Address as editable outright, and neither asserts a government fact.
- **System-generated identifiers** (registry reference, certificate number,
  enrolment number) — `IMMUTABLE`. Changing one would not correct the record; it
  would point at a different one.
- **Findings** (income band, community category, aggregate percentage, result
  year) — `IMMUTABLE`. A citizen may contest an assessment, but contesting it is
  a **re-assessment**, not a correction, and this service does not perform
  re-assessments.
- **Issuing offices and statuses** — `IMMUTABLE`. Conclusions the authority
  reached, not values it was told.

### `BANK_DETAILS` without a connector

Seeded deliberately. Editability is policy, and policy is knowable before the
provider is built — which is what lets Phase 1 be complete without reaching into
Phase 2. No bank connector, `data_sources` row or department row is created.

Arch §20.5 also marks `bankAccountHolder` **STEP_UP_REQUIRED**. That is *not* a
column here: it is a **target status** in the change lifecycle — feature.md
Phase 12's aggregation table lists `Bank → STEP_UP_REQUIRED` beside `APPLIED`
and `UNDER_REVIEW` — reached when the provider demands its own authentication.
Modelling it as a field attribute would put a lifecycle state into a
configuration table and pre-empt the phase that owns it.

---

## 9. Seed placement

The rows live in **two** places, both idempotent and keyed on
`(record_type, field_key)`:

- the **migration**, because the linked project is migrated forward and never
  reset, and an endpoint whose configuration table is empty does not work;
- **`supabase/seed/seed.sql`**, so a `supabase db reset` reproduces the same
  state from an empty database.

If the two ever disagree, the migration is authoritative — it is what the live
project actually ran. Applying either after the other is a no-op.

---

## 10. What this phase did **not** add

No `citizen_records`, `citizen_record_fields`, `change_requests`,
`change_request_fields`, `change_targets`, `change_consents`, `change_reviews`,
`change_dependency_rules` or `change_events`. No connector, no notification, no
department or data-source row. The migration is additive: no DROP, TRUNCATE or
DELETE, and no existing migration was modified.
