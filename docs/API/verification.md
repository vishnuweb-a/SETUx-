# Verification API — Phase 10

The contract for evaluating evidence SetuX has already retrieved, and for moving
an application into the verification stage of its lifecycle.

## 1. What this phase is

Phases 8 and 9 made evidence available:

```
GRANTED consent → connector → normalized values → application_data (PENDING)
```

Phase 10 is the first phase that *judges* that evidence.

```
application_data → verification rules → verifications → VERIFICATION
```

## 2. Retrieval is not verification

This is the distinction the whole phase exists to preserve.

```
CONNECTOR RESULT   !=   VERIFICATION RESULT
```

A connector returning `identityMatch = MATCHED` is the identity registry making
a statement about its own record. It is evidence. SetuX still decides what that
evidence means, and it decides it through an explicit rule that could reach a
different conclusion.

The clearest case: a record that is `MATCHED` but whose `identityRecordStatus`
is `RETIRED` does **not** verify. The provider said match; SetuX says the record
is not current. Copying the provider's verdict through would make this layer
decorative.

## 3. Verification never calls a provider

Phase 10 reads `application_data` and nothing else. It holds no connector
import, and no code path can reach one — enforced by tests that read the module
source and by a test that completes a run with no connector registered.

This matters for authorization, not just tidiness: retrieval is gated on a
GRANTED consent, so a verification run able to re-fetch would be a way to reach
a provider around that gate.

## 4. Endpoints

```
GET  /api/v1/applications/:applicationId/verification
POST /api/v1/applications/:applicationId/verification
```

Singular — an application has exactly one verification state. There is
deliberately no route to verify a *named* requirement and none to set an
outcome: which requirements are evaluated comes from the service's
configuration, and what each evaluates to comes from the rules.

### Authentication and authorization

Both require an authenticated `CITIZEN` who has completed onboarding and owns
the application.

| Condition | Response |
|---|---|
| No token | `401` |
| `GOVERNMENT_OFFICER` | `403` |
| Onboarding incomplete | `403 VERIFICATION_ONBOARDING_REQUIRED` |
| Another citizen's application | `404` (concealed, as in Phases 6–8) |

The officer is refused because the officer's involvement with an application
begins in Phase 11. That is a phase boundary as much as an authorization rule.

### Request body

Empty, and validated `.strict()`.

There is nothing a client could legitimately contribute: the application comes
from the URL and the session, the requirements from the service, the evidence
from stored rows, and the outcome from the rules. A body carrying `status`,
`verificationStatus`, `result`, `outcome`, `score`, `verified`, `approved`,
`officerId`, `citizenId`, `serviceId`, `evidence`, `values`, `dataSourceId`,
`forcePass` or `forceFail` is **rejected with `400`** — not ignored, which would
leave the API looking as though it had accepted them.

`forcePass` and `forceFail` have no server-side counterpart anywhere. There is
no flag to reach.

## 5. Readiness

Server-derived, from stored rows only. The client never supplies any part of it.

| Readiness | Meaning |
|---|---|
| `READY` | Every **required**, provider-backed requirement has a successful retrieval |
| `NOT_SUBMITTED` | The application has not been submitted |
| `EVIDENCE_INCOMPLETE` | At least one required requirement has no evidence |
| `ALREADY_STARTED` | Verification has already run |

Readiness requires *every* required requirement, not "at least one retrieval
succeeded". Starting on a partial set would produce `EVIDENCE_MISSING` outcomes
that read as findings about the citizen rather than what they are — SetuX not
having asked yet.

Optional requirements do not block. `BANK_DETAILS` is optional for most seeded
scholarships, and blocking on it would contradict the catalogue.

## 6. Rules

Deterministic and categorical. No model, no scoring, no randomness, no clock —
the same evidence always yields the same outcome, which is what makes a stored
verification reproducible and therefore auditable.

| Requirement | Rule | Passes when |
|---|---|---|
| `IDENTITY` | `IDENTITY_MATCHED_ACTIVE_V1` | `identityMatch = MATCHED` **and** `identityRecordStatus = ACTIVE` |
| `INCOME_RECORD` | `INCOME_BAND_BELOW_THRESHOLD_V1` | `incomeBand = BELOW_THRESHOLD` |
| `EDUCATION_RECORD` | `EDUCATION_ENROLMENT_CURRENT_V1` | `educationEnrolmentStatus` ∈ {`ENROLLED`, `PASSED`, `COMPLETED`} |
| `BANK_DETAILS` | `BANK_ACCOUNT_ACTIVE_V1` | `bankAccountStatus = ACTIVE` |
| `COMMUNITY_RECORD` | `COMMUNITY_CERTIFICATE_PRESENT_V1` | never auto-verifies — see below |

### No threshold is invented

The repository defines **no** income limit, no marks minimum and no age bound —
not in `services`, not in `service_requirements`, not in the seed, not in the
docs. So no rule compares a number against one.

Two consequences, both deliberate:

- **The education aggregate is not judged.** `educationAggregatePercentage` is
  retrieved, stored and shown to the citizen, but no rule compares it against a
  cutoff, because no scholarship states one. A 31% and a 99% aggregate both
  verify on enrolment status alone.
- **The community category is not judged.** Which categories qualify for
  `SCHOLARSHIP_MINORITY` is policy the catalogue does not state, so the rule
  confirms a certificate exists naming a category and returns
  `REQUIRES_ACTION` / `NO_RULE_DEFINED`.

Both are honest reports that SetuX did not check something, rather than a
`VERIFIED` that would overstate what happened. The officer weighs them in
Phase 11.

## 7. Outcomes

Existing `verification_status` enum values only; no enum was changed.

| Status | Meaning |
|---|---|
| `VERIFIED` | Evidence present and satisfied the rule |
| `FAILED` | Evidence present and did **not** satisfy the rule |
| `REQUIRES_ACTION` | Could not conclude — evidence missing, or no rule defined |

`PROCESSING` stays in the schema and is never written: runs are synchronous, so
no application is observably mid-run.

### Reason codes

`RULE_MATCH`, `RULE_MISMATCH`, `EVIDENCE_MISSING`, `EVIDENCE_UNREADABLE`,
`NO_RULE_DEFINED`.

Structured codes only — never prose, never an evidence value. They are written
to `verifications.result` and to the timeline, both read by people who are not
entitled to the underlying evidence.

### A failure is not a rejection

`FAILED` is a finding about **one requirement**. Phase 10 has no vocabulary for
rejecting an application and must not acquire one. Whether a mismatch sinks an
application is the officer's decision, in Phase 11.

This is why a rule that cannot conclude returns `REQUIRES_ACTION` rather than
`FAILED`: `FAILED` reads as "this citizen does not qualify", and that judgement
is not Phase 10's to make.

## 8. Failure vs. system error

Kept distinct throughout:

- **Rule failure** — evidence was read and disagreed. It is *data*. Persisted as
  a `FAILED` verification; the request succeeds with `201`.
- **System error** — the run could not execute. It is *not data*. Propagates as
  a `5xx` and **nothing is persisted**, because the alternative is a database
  problem recorded as a finding against a citizen.

The atomic RPC holds that line: either the whole run commits or none of it does.

## 9. Workflow

```
SUBMITTED  →  VERIFICATION
```

`VERIFICATION` is the value the `application_status` enum and
`database-schema.md` §19 define. The phase documents' prose calls this state
"UNDER_VERIFICATION"; that is the same state under a different name, and no
second enum member was introduced for it.

The application **stays** in `VERIFICATION` after the run. Phase 11 owns the
transition onward to `UNDER_REVIEW`, `APPROVED` and `REJECTED`.

### Atomicity and concurrency

The transition, the verification rows, the evidence statuses and the timeline
events commit in one transaction, through
`public.record_application_verification`.

The function holds the application row `FOR UPDATE` and requires status
`SUBMITTED`, so two concurrent starts serialize and exactly one performs the
run. The loser receives `409 VERIFICATION_ALREADY_STARTED`.

### Idempotency

A second start returns `409` rather than re-running: outcomes are already
recorded, and re-running would rewrite `verified_at` timestamps the timeline has
already reported. Per-requirement, the write is an UPSERT on the existing
`(application_id, verification_type)` unique constraint, so a retry updates in
place rather than accumulating contradictory rows.

## 10. Effect on evidence

Verification changes the *status* of evidence, never the evidence.

- Only fields a rule actually read are updated — a rule names them in
  `fieldCodes`, and evidence no rule looked at keeps the status it had.
- Only `PROVIDER_RETRIEVAL` rows are touched. `CITIZEN_DECLARATION` rows are
  never restated as verified facts.
- `field_value` is never written. If evidence conflicts with a rule, the outcome
  is recorded; the source data is not rewritten to make a rule pass.

## 11. Audit events

Written to `application_events`:

`VERIFICATION_STARTED`, `REQUIREMENT_VERIFIED`,
`REQUIREMENT_VERIFICATION_FAILED`, `VERIFICATION_COMPLETED`.

Metadata carries identifiers, requirement codes, reason codes and counts.
It never carries an income amount, bank detail, identity number, education mark,
name, date of birth or provider payload.

## 12. Errors

| Code | Status | Meaning |
|---|---|---|
| `VERIFICATION_ONBOARDING_REQUIRED` | 403 | Citizen onboarding incomplete |
| `VERIFICATION_NOT_APPLICABLE` | 409 | Application is not submitted |
| `VERIFICATION_EVIDENCE_INCOMPLETE` | 409 | Required evidence not yet retrieved |
| `VERIFICATION_ALREADY_STARTED` | 409 | Verification has already run |

There is deliberately no error code meaning "you did not qualify". A rule that
finds evidence wanting returns `201` with a `FAILED` item in the payload,
because it is a finding to show the officer, not an error to refuse the request
with.

## 13. Citizen UI

The "Verification overview" panel on the application detail page, directly below
the Phase 8 documents panel. Both stay visible from SUBMITTED through
VERIFICATION, because the evidence is what the outcomes were reached from.

The two panels say deliberately different things:

| Panel | Badge | Means |
|---|---|---|
| Documents from government systems | `Retrieved` | SetuX **has** the document |
| Verification overview | `Verified` | SetuX **checked** it against a rule |

Relabelling the first as the second is the thing this phase exists to prevent.

### Outcome wording

| Status | Citizen sees |
|---|---|
| `VERIFIED` | Verified |
| `FAILED` | Could not be verified |
| `REQUIRES_ACTION` | Needs review |
| none yet | Not checked yet |

`FAILED` is never shown as "Rejected" and `REQUIRES_ACTION` is never collapsed
into either a pass or a rejection. Every status is carried by an icon and a
word, never by colour alone.

### What the UI never says

No "Application approved", "Scholarship approved", "You are eligible", "Final
approval" or "Payment approved" — even when every rule passed. The panel closes
with the boundary stated plainly: the checks are automatic and are not a
decision, and an officer reviews the application before deciding.

The database status `VERIFICATION` is shown as "Verification in progress". The
raw enum value is never rendered, and neither is "UNDER_VERIFICATION".

### Readiness and the action

The "Start verification" button appears only when the server reports
`readiness = READY`. The client never computes readiness — a browser deciding
that evidence is complete would be second-guessing the judgement the server
makes. `EVIDENCE_INCOMPLETE` shows what is still needed; `NOT_SUBMITTED` says
checks begin after submission; `ALREADY_STARTED` shows the outcome instead.

The request carries no body. Progress is derived from the server's own
`verifiedCount`/`totalCount` — never a hard-coded percentage, and never an
animation standing in for real state.

### Errors

A system error must never read as a failed check: the two mean opposite things
to a citizen. A 5xx collapses to a neutral "could not be completed", never to
"verification failed", and no stack trace or server internal reaches the page.

## 14. Database

`public.record_application_verification(uuid, uuid, jsonb)` —
`security invoker`, `set search_path = ''`, revoked from `public`, `anon` and
`authenticated`, granted to `service_role` only.

No browser session may move an application's lifecycle or write a verification
outcome; a citizen who could reach this function could mark their own
application verified. RLS on `verifications`, `application_data` and
`applications` remains SELECT-only for `authenticated` and was not weakened.

### Migration state

`supabase/migrations/20260905090000_setux_verification_workflow.sql` is
**APPLIED** to the live project.

Verified against the live database after applying:

- `verifications_type_allowed` widened to the five requirement codes, with the
  two Phase 2 spellings still permitted;
- the function is `security invoker` with `search_path = ""`, and its ACL is
  `postgres` and `service_role` only — no `PUBLIC`, `anon` or `authenticated`;
- RLS enabled on all five affected tables, with no write policy added;
- `applications_update_own_draft` still requires the row to remain `DRAFT` in
  both `USING` and `WITH CHECK`, so a citizen cannot self-transition.

Probed live as an authenticated citizen: inserting a verification is refused
(403), updating one affects no rows, setting the application to APPROVED affects
no rows, and calling the function is refused (`42501 permission denied`). As
`anon`, the function is refused and `verifications` reads back empty.

One bookkeeping note: the migration is recorded in
`supabase_migrations.schema_migrations` under the server-assigned version
`20260904203202` rather than the filename version `20260905090000`. The applied
DDL is correct; only the recorded version string differs.

## 15. Phase 11 boundary

Phase 10 makes an application **ready for** officer review. It does not perform
it.

Owned by Phase 11, and deliberately absent here: the officer dashboard and
review queue, manual review, approve and reject actions, rejection reasons,
officer assignment and notes, the final eligibility decision, `APPROVED` /
`REJECTED` statuses, benefit sanction, and notifications.

`application_reviews` is untouched by Phase 10 and stays empty.
