# Citizen Record Registry — Database

Change & Correction Service, **Phase 2**.
Migration: `supabase/migrations/20260907185358_setux_citizen_records.sql`.

Architecture: `docs/ARCHITECTURE/change-correction-service.md` §4.1, §19–§23.
Field policy (Phase 1): `docs/DATABASE/field-policies.md`.

---

## 1. What this is, and what it is not

`citizen_records` + `citizen_record_fields` are the citizen-scoped registry of
the government records SetuX knows about. They answer:

> *Which government records does SetuX hold for this citizen, and what does each
> of them currently say?*

Two boundaries define the domain.

**No `application_id`.** Every retrieved record in SetuX before this phase lived
in `application_data`, keyed by application. That made records a property of an
*application*: a citizen who had never applied for a scholarship had no records
at all, and a citizen with three applications had three disconnected copies of
the same identity record (arch gap C1). A correction service cannot be built on
that, so the registry is keyed on the **citizen** and carries no application
column at all.

**A projection, not evidence.**

| Table | Meaning | Mutability |
| --- | --- | --- |
| `application_data` | Historical **evidence**: what a source said at the moment an application was decided. | Frozen. Never rewritten. |
| `citizen_record_fields` | Current **projection**: what the source holds *now*. | Refreshable; a later APPLIED change updates it. |

An application decided last month must keep showing the name that was on the
record last month (arch §17). Conflating the two would rewrite history every
time a citizen corrected a name. **Phase 2 does not read or write
`application_data`.**

---

## 2. `citizen_records`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | The record's identity. |
| `citizen_id` | uuid → `profiles(id)` restrict | The owner. |
| `record_type` | text | `IDENTITY_RECORD`, `INCOME_RECORD`, `EDUCATION_RECORD`, `COMMUNITY_RECORD`, `BANK_DETAILS`. |
| `data_source_id` | uuid → `data_sources(id)` restrict | The system that **holds** the record. |
| `authority_department_id` | uuid → `departments(id)` restrict, **nullable** | The authority **responsible** for correcting it. |
| `source_record_ref` | text | The provider's own stable handle. |
| `status` | text | `ACTIVE` / `STALE` / `UNAVAILABLE`. |
| `source_version` | text null | Provider-side revision, where one is exposed. |
| `last_synced_at` | timestamptz null | NULL when never synchronized — not defaulted to `now()`. |
| `is_simulated` | boolean not null default true | The demo never claims to be real. |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by trigger. |

### Identity

`id` is the identity. `source_record_ref` is **source metadata**, not identity.

This distinction matters more here than anywhere else in SetuX, because this is
the subsystem whose entire purpose is *changing values*. Nothing mutable may be
identity:

- a **name** is not identity;
- a **mobile number** is not identity;
- an **Aadhaar-like number** is not identity.

All three are field *values* in `citizen_record_fields`, and all three may
legitimately change tomorrow (arch §4.1).

### Constraints

| Name | Shape | Why |
| --- | --- | --- |
| `citizen_records_citizen_type_source_unique` | unique `(citizen_id, record_type, data_source_id)` | The **idempotency key** (arch §22). Re-provisioning updates rather than duplicating. `data_source_id` is included because two sources may legitimately hold the same *kind* of record. |
| `citizen_records_source_ref_unique` | unique `(data_source_id, source_record_ref)` | A source's handle is unique **within that source**. Two citizens cannot share one certificate number. Scoped rather than global: identical strings from unrelated providers are not a conflict. |
| `citizen_records_record_type_format` | check `^[A-Z][A-Z0-9_]{2,63}$` | A typo cannot silently create a record type no policy governs. |
| `citizen_records_status_allowed` | check in (`ACTIVE`,`STALE`,`UNAVAILABLE`) | |
| `citizen_records_source_ref_not_blank` | check | |
| `citizen_records_source_version_not_blank` | check | |

### Indexes

| Index | Serves |
| --- | --- |
| `citizen_records_citizen_id_created_at_idx (citizen_id, created_at desc)` | The list endpoint, and the RLS policy's own filter column. Equality column first, ordering last. |
| `citizen_records_authority_department_id_idx` | The department FK. Postgres does not index a FK automatically. `citizen_id` is covered above; `data_source_id` by the leading column of the source-ref unique constraint. |

---

## 3. `citizen_record_fields`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `citizen_record_id` | uuid → `citizen_records(id)` **cascade** | A field has no meaning without its record. |
| `field_key` | text | The normalized SetuX key — same vocabulary as `field_policies.field_key`. |
| `field_value` | jsonb | Not always a string: a band is a token, a percentage a number. |
| `retrieved_at` | timestamptz | Per-field, because a partial refresh updates some fields and not others. |
| `created_at` / `updated_at` | timestamptz | |

| Constraint | Why |
| --- | --- |
| unique `(citizen_record_id, field_key)` | The idempotency key. One answer per field. |
| check `field_key ~ '^[a-z][A-Za-z0-9]{1,63}$'` | Identical to `field_policies`' own check, so a key that could not have a policy cannot be stored as a value. |
| check `field_value <> 'null'::jsonb` | `'null'::jsonb` asserts "the source holds no value". An **absent row** is the only thing that may mean "SetuX does not know". |

`citizen_record_fields_record_id_idx` serves the FK and the RLS join.

---

## 4. Normalized field vocabulary

`field_key` reuses the connectors' normalization boundary —
`identityHolderName`, never the provider's `holder_name`. One field has one name
in every subsystem, and a provider renaming a field ripples nowhere.

Every stored key has a governing `field_policies` row. This is enforced twice:
the provisioner refuses to write an ungoverned key, and a database test asserts
it against the data that actually landed.

| Record type | Field keys |
| --- | --- |
| `IDENTITY_RECORD` | `identityHolderName`, `identityBirthYear`, `identityMobile`, `identityAddress`, `identityRegistryReference`, `identityRecordStatus` |
| `INCOME_RECORD` | `incomeCertificateHolder`, `incomeAddress`, `incomeBand`, `incomeCertificateNumber`, `incomeIssuingOffice`, `incomeAssessmentYear`, `incomeValidUntil` |
| `EDUCATION_RECORD` | `educationStudentName`, `educationEnrolmentNumber`, `educationInstitution`, `educationAggregatePercentage`, `educationBoard`, `educationResultYear`, `educationEnrolmentStatus` |
| `COMMUNITY_RECORD` | `communityCertificateHolder`, `communityCategory`, `communityCertificateNumber`, `communityIssuingOffice` |
| `BANK_DETAILS` | `bankAccountHolder`, `bankAccountMasked`, `bankBranchCode`, `bankBranchName`, `bankAccountStatus` |

29 keys, all present in the Phase 1 policy seed.

---

## 5. Source and authority map

Routing uses **UUID foreign keys** to `data_sources` and `departments` — never
the `services.department` = `departments.name` text join (arch gap C7,
Decision 3). Renaming a department must not silently unroute every record it
owns.

| Record type | Authority | Status | Data source | Status |
| --- | --- | --- | --- | --- |
| `IDENTITY_RECORD` | Identity Authority | **new** (`IDENTITY_AUTHORITY`) | `MOCK_IDENTITY_API` | existing |
| `INCOME_RECORD` | Revenue Department | **new** (`REVENUE_DEPT`) | `MOCK_INCOME_API` | existing |
| `EDUCATION_RECORD` | Higher Education | **reused** (`HIGHER_ED`) | `MOCK_EDUCATION_API` | existing |
| `COMMUNITY_RECORD` | Minority Affairs | **reused** (`MINORITY_AFFAIRS`) | `DIGILOCKER_MOCK` | existing |
| `BANK_DETAILS` | *(none — a provider)* | `NULL` | `MOCK_BANK_API` | **new** |

**Higher Education and Minority Affairs are reused**, not re-created: they are
semantically correct, and the officer fixture already belongs to Higher
Education. Forking them would separate the department a target routes to from
the department an officer belongs to.

**Identity Authority and Revenue Department are new**, under a new synthetic
organization `DEMO_GOV` ("Government of Demo State (Simulated)").
`departments.organization_id` is NOT NULL, and "Revenue Department, a department
of the Department of Education" would be incoherent (arch §20.6).

### Bank provider status

`MOCK_BANK_API` is a **data source row and nothing more**. It exists so a bank
record can name where it comes from.

Phase 2 builds **no** bank connector, **no** step-up authentication, **no** OTP
and makes **no** network call — those are Phase 10 (arch §24).

`authority_department_id` is NULL for bank records because the bank is a
*provider*, not a department. It has no officer queue and never will, so
fabricating a department row would invent a government office that does not
exist and would put bank corrections into an officer's queue — the opposite of
what the bank record exists to demonstrate (arch §20.6, §8.1).

The existing DigiLocker `BANK_DETAILS` *document* requirement is unchanged; the
scholarship flow keeps working exactly as before.

---

## 6. Row Level Security

Both tables have RLS enabled. The posture matches `application_data`: written by
the backend, read by the owner, never written from a browser.

| Role | `citizen_records` | `citizen_record_fields` |
| --- | --- | --- |
| `anon` | nothing | nothing |
| citizen | SELECT **own only** | SELECT through an owned record |
| officer | **nothing** | **nothing** |
| writes (any role) | **no policy at all** | **no policy at all** |
| `service_role` | bypasses RLS — the backend's path | same |

```sql
create policy citizen_records_select_own on public.citizen_records
  for select to authenticated
  using (citizen_id = (select auth.uid()));

create policy citizen_record_fields_select_own on public.citizen_record_fields
  for select to authenticated
  using (exists (
    select 1 from public.citizen_records r
    where r.id = citizen_record_id and r.citizen_id = (select auth.uid())
  ));
```

`(select auth.uid())` rather than a bare call: wrapped in a SELECT the planner
evaluates it once as an InitPlan instead of once per row. Both policy join
columns are indexed.

The field policy re-derives ownership from the parent rather than trusting a
denormalized `citizen_id` — there is deliberately no such column. A duplicated
owner is a second thing that can be wrong, and a field whose copied owner
disagreed with its record's would be readable by the wrong person while looking
perfectly consistent.

### Why officers get nothing

This is a decision, not an omission.

An officer's authority over a citizen's record arises from a **change target**
routed to their department (arch §4.6, §8) — a table Phase 2 does not create. A
policy written now could only approximate the rule as
`authority_department_id in (select private.officer_department_ids())`, which
would grant **every** Higher Education officer read access to the education
record of **every** citizen in SetuX, including citizens who have never
requested a correction and have no business with that department.

That is a speculative broad grant on personal data justified by a workflow that
does not exist. Adding it later is easy; removing it later is not. When change
targets arrive, the policy that comes with them can be scoped to the
relationship that actually confers the authority.

### Verified behaviour

Probed against the live project with a simulated JWT per role:

| Session | Records visible | Fields visible | INSERT | UPDATE |
| --- | --- | --- | --- | --- |
| demo citizen | 5 | 29 | refused | refused |
| a different citizen | 0 | 0 | — | — |
| officer | 0 | 0 | — | — |
| `anon` | 0 | 0 | — | — |

---

## 7. Fixture provisioning

Script: `scripts/seed-change-correction-demo.mjs`.

```
scripts/seed-auth-users.mjs          auth user + profile (unchanged)
        ↓
scripts/seed-change-correction-demo  records + field values
        ↓
citizen_records → citizen_record_fields
```

Run:

```bash
node scripts/seed-change-correction-demo.mjs --only citizen@setux.test
```

It is a **separate** script from `seed-auth-users.mjs` because that one
provisions *auth identities* while this one provisions *domain data* for a
citizen that already exists. Folding them together would give a
password-rotation run a reason to write government records.

It is **not** auto-provisioning on login or onboarding (arch §21 rejects that):
every real citizen completing onboarding would then silently receive synthetic
government records. Demo fixture behaviour must be explicit, opt-in and run by a
human.

### Safety properties

- `--only` accepts **nothing but** the known synthetic fixture address.
- It **looks the citizen up** and refuses to create one — if the fixture is
  absent it names `seed-auth-users.mjs` instead of inventing an account.
- It refuses an account whose role is not `CITIZEN`.
- It **never writes `profiles.role` or `profiles.onboarding_status`**. Existing
  completed onboarding is read and reported, never reset — the regression
  `seed-auth-users.mjs` was hardened against.
- It prints no password, no token and no credential.
- It touches no other user, no application and no `application_data` row.
- It refuses to write a field key with no `field_policies` row, naming the
  mismatch, rather than creating a value the change form can never explain.

### Idempotency

Every write is an upsert on the table's own unique key:

| Table | Conflict target |
| --- | --- |
| `citizen_records` | `(citizen_id, record_type, data_source_id)` |
| `citizen_record_fields` | `(citizen_record_id, field_key)` |

`do update` rather than delete-then-insert, so a re-run keeps each record's `id`
stable — anything that later references a record by id must not find that id
replaced by a re-seed.

Verified: two consecutive live runs left exactly 5 records and 29 field values.

### Demo inventory

The demo citizen is `citizen@setux.test` (reused, per arch §20.2 — no second
demo account). Its **SetuX onboarding profile is untouched** by this script.

All five records carry the same synthetic source-held holder name,
`Demo Old Name`. That shared value is the precondition for the Phase 4
dependency demo (arch §23): one correction to the identity record is what later
expands into four targets. Note this is the name the *source systems* hold,
which is deliberately allowed to differ from the citizen's SetuX profile name —
a mismatch between the two is exactly the situation this feature corrects.

| Record | Source | Authority | Ref | Fields |
| --- | --- | --- | --- | --- |
| `IDENTITY_RECORD` | `MOCK_IDENTITY_API` | Identity Authority | `SYNTH-IDR-2026-0117` | 6 |
| `INCOME_RECORD` | `MOCK_INCOME_API` | Revenue Department | `SYNTH-INC-2026-008812` | 7 |
| `EDUCATION_RECORD` | `MOCK_EDUCATION_API` | Higher Education | `SYNTH-EDU-2026-004417` | 7 |
| `COMMUNITY_RECORD` | `DIGILOCKER_MOCK` | Minority Affairs | `SYNTH-COM-2026-002293` | 4 |
| `BANK_DETAILS` | `MOCK_BANK_API` | *(provider — none)* | `SYNTH-BNK-2026-004409` | 5 |

Every value is synthetic: `SYNTH-` refs, a masked account number
(`XXXXXX4409`), and `Demo` / `(Simulated)` on every institution. No real
Aadhaar, PAN, IFSC, account, certificate, institution or person appears
anywhere.

---

## 8. No editing yet

Phase 2 creates the **inventory only**. There is no way — through the API, the
browser's Supabase client, or any RLS policy — for anyone to change what a
source record says.

Not built in this phase (all Phase 3+, arch §25): `change_requests`, proposed
values, the dependency engine, impact detection, target selection, change
consent, officer review, `RecordUpdateConnector`, notifications, the bank
connector, and any source-system write.
