# Officer Review API — Phase 11

The contract for the government officer's queue, the application detail they
decide from, and the decision itself.

## 1. What this phase is

Phase 10 left the application in `VERIFICATION` with SetuX's own conclusion
recorded against each requirement. Phase 11 is where a **person** reads those
conclusions and decides.

```
VERIFICATION ──► APPROVED     (an officer decided)
             └─► REJECTED     (an officer decided, with a reason)
```

Phase 11 ends at *human decision persisted + citizen sees final status*.
Notifications, disbursement and appeals belong to later phases.

## 2. Verification is advisory

This is the distinction the whole phase exists to preserve, and it is the
mirror of the Phase 10 boundary.

```
VERIFICATION RESULT   !=   DECISION
```

Nothing in this phase derives a decision from a verification outcome. An
application whose every requirement came back `VERIFIED` still sits in the queue
until an officer acts, and one carrying a `FAILED` outcome is not rejected.
There is no rule, no score, no threshold and no "recommended action" anywhere in
the module — a summary that said *ready to approve* would be the automated
judgement Phase 11 exists to keep a human inside of.

All three Phase 10 outcomes are valid review information:

| Stored status     | Officer sees             | Means                                        |
| ----------------- | ------------------------ | -------------------------------------------- |
| `VERIFIED`        | Verified                 | Evidence read; rule satisfied.                |
| `FAILED`          | Could not be verified    | Evidence read; rule not satisfied. A finding, not a rejection. |
| `REQUIRES_ACTION` | **Needs officer review** | SetuX could not conclude. Evidence missing, or no rule defined. |

`REQUIRES_ACTION` is never rendered as a failure. It is the clearest
demonstration of why a human officer is part of SetuX at all.

## 3. Endpoints

All four are mounted under the government router and inherit its authentication
and `requireRole(GOVERNMENT_OFFICER)` gate. The service re-checks role,
onboarding status and department scope independently.

| Method | Path                                                        | Purpose                     |
| ------ | ----------------------------------------------------------- | --------------------------- |
| GET    | `/api/v1/government/review`                                 | Dashboard counts            |
| GET    | `/api/v1/government/review/applications`                    | The queue                   |
| GET    | `/api/v1/government/review/applications/:applicationId`     | One application, in full    |
| POST   | `/api/v1/government/review/applications/:applicationId/decision` | Record the decision    |

`GET /applications` accepts `status` (`VERIFICATION` | `APPROVED` | `REJECTED`),
`page` and `limit`. Any other status is rejected with a 400 rather than
returning an empty list.

### The decision body

```json
{ "decision": "APPROVED" | "REJECTED", "remarks": "…" }
```

`remarks` is **required** for `REJECTED` and optional for `APPROVED`. The schema
is `.strict()`: a body carrying `reviewerId`, `officerId`, `status`,
`applicationStatus`, `reviewedAt`, `departmentId` or `citizenId` is **rejected
with a 400**, not silently ignored. There is no field for the reviewer, because
the reviewer comes from the verified access token and nowhere else
(database-schema.md §37).

`REQUESTED_INFO` exists in the `review_decision` enum and is deliberately not
offered: Phase 11 has no channel to carry the request back to the citizen, and a
decision the system cannot follow through on is a promise the API does not keep.

## 4. Authorization and scope

An officer sees only applications whose service is handled by their department:

```
applications.service_id → services.department → departments.name → government_profiles.department_id
```

This is the same join `private.officer_can_read_application` uses in RLS. The
backend runs on the service-role key and therefore bypasses RLS, so every query
in the review repository re-applies this scope explicitly — an unscoped query
would hand one department's applications to another department's officer and the
database would not object.

Drafts are excluded unconditionally, not merely by the status filter.

An out-of-scope or nonexistent application is **404 in both cases**. A 403 would
confirm that an application with that identifier exists.

## 5. The atomic decision

One `record_application_decision` RPC, one transaction, so the three writes a
decision implies cannot diverge:

```
application_reviews row + applications.status + application_events row
```

A partial write is worse than a failed request in every direction: a review row
with no status change is a decision the citizen never sees; a status change with
no review row is an approval nobody is accountable for; either without the event
leaves the audit trail claiming the application moved by itself.

The function re-derives the officer's authorization rather than trusting the
reviewer id it is passed, and holds the application row `FOR UPDATE` — two
officers deciding at the same instant serialize, and the second finds a status
that is no longer `VERIFICATION`. It returns **no row** when any guard fails, and
deliberately does not say which one; the service maps that to a 409.

The guard is applied three times over:

1. **the service** — a readable 409 for the ordinary already-decided case;
2. **the RPC, under `FOR UPDATE`** — the only one load-bearing under concurrency;
3. **a partial unique index** — at most one `APPROVED`/`REJECTED` row per
   application, so the invariant survives any future path that forgets the other
   two.

Privileges: `revoke`d from `public`, `anon` and `authenticated`; granted only to
`service_role`. No browser session can reach it.

## 6. Errors

| Code                         | Status | Meaning                                            |
| ---------------------------- | ------ | -------------------------------------------------- |
| `REVIEW_NOT_APPLICABLE`      | 409    | Not through verification yet, or already decided.   |
| `REVIEW_ALREADY_DECIDED`     | 409    | A concurrent request decided it first.              |
| `REVIEW_ONBOARDING_REQUIRED` | 403    | The officer has no completed profile or department. |

There is deliberately no code meaning *this citizen did not qualify*. That is
not an error — it is the officer's `REJECTED` decision, returned as a
successfully recorded outcome.

## 7. What the officer sees, and does not

The detail returns SetuX's **normalized** values from `application_data`,
labelled and grouped by the system that issued them ("Education Department
(Mock)"), because provenance is the interoperability claim the prototype makes.

It never returns a provider's raw payload, and never renders JSON at an officer.

`canDecide` is server-derived from the application's status. The browser renders
it and never computes it: a client that decided this for itself could only be
asking the server to accept something it has already refused.

## 8. The citizen's view

`ApplicationStatus` gains `APPROVED` and `REJECTED`. The citizen's badge shows
"Approved" / "Rejected", and the application detail carries a decision notice
above the evidence — the retrieval and verification panels stay visible on a
decided application, because they are what *explain* the outcome.

The officer's remarks are stored once, on the review row. They are not copied
into the timeline event, and the citizen's notice does not restate them:
surfacing free text written for an internal record is a disclosure decision this
phase does not make on the officer's behalf.
