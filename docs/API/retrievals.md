SetuX — Data Retrieval API Specification

Version: 1.1
Project: SetuX SIH MVP
Module: Government Data Retrieval
Backend: Supabase + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

Phase 9 implementation profile (2026-09-05)

Phase 8 proved the retrieval pipeline with one provider. Phase 9 extends it to
every simulated government system SetuX seeds, WITHOUT adding a second pipeline:

  MOCK_IDENTITY_API   → fake identity registry      → IDENTITY
  MOCK_EDUCATION_API  → fake education department   → EDUCATION_RECORD
  MOCK_INCOME_API     → fake revenue department     → INCOME_RECORD
  DIGILOCKER_MOCK     → fake DigiLocker (Phase 8)   → BANK_DETAILS,
                                                      COMMUNITY_RECORD

The API surface is UNCHANGED. No new endpoint, no new request field, no new
error code. A connector is added by registering it against a `data_sources.code`
in `backend/src/connectors/connector.registry.ts`; the retrieval service was not
modified to accommodate any of them, which is the property the connector
boundary exists to provide.

Consequences for existing behaviour:

  - `NOT_SUPPORTED` no longer appears for the four seeded sources. It remains
    the answer for any source with no registered connector.
  - Consent stays SOURCE-LEVEL and per-source. A grant for one government
    system authorizes that system only; it never authorizes another.
  - Idempotency stays REQUIREMENT-scoped. One completed requirement does not
    block a different requirement, including one served by the same source.

RETRIEVAL IS STILL NOT VERIFICATION. Four systems answering is still four
retrievals, not a verification. See §"Phase boundary" below.

Phase 8 implementation profile (2026-09-04)

Phase 7 made the citizen's authorization recordable. Phase 8 is the first phase
that acts on it:

  GRANTED consent → fake DigiLocker connector → normalized data → persisted

The implemented surface is:

GET  /api/v1/applications/:applicationId/retrievals
POST /api/v1/applications/:applicationId/retrievals

IMPORTANT — what Phase 8 is not

The DigiLocker integration is SIMULATED. There is no production DigiLocker
integration, no OAuth, no network call, and no real government API anywhere in
this phase. All returned data is synthetic fixture data.

Phase 8 does NOT implement:

  - government department connectors beyond fake DigiLocker (Phase 9)
  - cross-department verification (Phase 10)
  - the UNDER_VERIFICATION / VERIFICATION workflow transition
  - officer review, approval or rejection
  - notifications
  - Aadhaar, PAN or passport handling of any kind

RETRIEVAL IS NOT VERIFICATION. A successful retrieval means SetuX fetched a
document from the system that issued it. It does not mean the document was
checked, accepted, or found sufficient. `verifications` and
`application_reviews` are untouched by this phase, and `applications.status`
does not move.

--------------------------------------------------------------------------------
1. What can be retrieved, and how it is derived
--------------------------------------------------------------------------------

Retrievable items are derived from configuration, never from the client.

For a submitted application, one retrievable item exists per
`service_requirements` row that names a `data_source_id` — the same derivation
Phase 7 uses for consent, so the two lists correspond exactly. A DECLARATION the
citizen types has no external source and is therefore neither consented to nor
retrieved.

  service_requirements (data_source_id NOT NULL)
        │
        ├──► one consents row       (Phase 7)
        └──► one retrievable item   (Phase 8)

The client sends a `requirementId`. Everything else is derived server-side:

  requirementId
      │
      ├──► service_requirements  → the data source, and the requirement code
      ├──► consents              → the authorization, which must be GRANTED
      ├──► connector registry    → the connector serving that source
      └──► applications          → ownership and submitted state

The client never names a citizen, a data source, a consent, a provider, a
provider reference, or a retrieval status. A body carrying any of them is
rejected with 400 rather than silently ignored.

--------------------------------------------------------------------------------
2. GET /api/v1/applications/:applicationId/retrievals
--------------------------------------------------------------------------------

Returns the retrieval state of every source-backed requirement. Retrieves
nothing, and calls no connector.

Response:

{
  "success": true,
  "data": {
    "applicationId": "…",
    "applicationNumber": "STX-2026-000001",
    "serviceName": "National Merit Scholarship",
    "items": [
      {
        "requirementId": "…",
        "requirementCode": "BANK_DETAILS",
        "information": "Bank Account Proof",
        "source": "DigiLocker (Mock)",
        "isSimulated": true,
        "availability": "COMPLETED",
        "status": "SUCCESS",
        "documentType": "BANK_ACCOUNT_PROOF",
        "providerReference": "SYNTH-DL-A1B2C3D4E5F6",
        "issuer": "Demo Public Bank (Simulated)",
        "retrievedAt": "2026-09-04T09:00:00.000Z",
        "values": [
          { "label": "Account number", "value": "XXXXXX4409" },
          { "label": "Account holder", "value": "Demo Citizen" }
        ],
        "failureReason": null
      }
    ]
  }
}

`availability` is the server's decision about what the citizen may do now:

  AVAILABLE         consent GRANTED, nothing retrieved yet → offer the action
  CONSENT_REQUIRED  consent still PENDING                  → send to consent page
  CONSENT_DENIED    citizen refused                        → offer nothing
  COMPLETED         already retrieved                      → show the result
  RETRYABLE         last attempt failed                    → offer a retry
  NOT_SUPPORTED     no connector registered for the source → explain, offer nothing

The client renders this. It never computes it: deciding locally whether a
retrieval is permitted would put an authorization judgement in the browser.

--------------------------------------------------------------------------------
3. POST /api/v1/applications/:applicationId/retrievals
--------------------------------------------------------------------------------

Performs one retrieval.

Request body — one field, strictly validated:

{ "requirementId": "…" }

Response: 201, carrying the same payload shape as the GET, so the client adopts
the server's state rather than patching its own.

--------------------------------------------------------------------------------
4. The consent gate
--------------------------------------------------------------------------------

Before any connector is constructed or called, the server verifies, from stored
rows only:

  1. the caller is authenticated;
  2. the caller's role is CITIZEN;
  3. the caller completed onboarding;
  4. the application belongs to the caller;
  5. the application is SUBMITTED;
  6. the requirement belongs to that application's service;
  7. the requirement names a data source;
  8. a consent exists for that application AND that requirement's own source,
     owned by that citizen;
  9. that consent's status is GRANTED.

There is no path through the service that reaches a provider without all nine
holding, and no development or environment flag that relaxes them.

The same nine checks are re-derived independently inside the database function
that writes the result. The duplication is deliberate: the service decides which
error the citizen sees, and the database refuses to persist anything the service
should not have allowed.

Consent scope is not widened. The consent looked up is the one for the
requirement's own `data_source_id`, so a grant for one source cannot authorize
retrieval from another. Phase 7's source-level scope is preserved exactly; Phase
8 narrows the *action* to one requirement without broadening the authorization.

--------------------------------------------------------------------------------
5. Errors
--------------------------------------------------------------------------------

RETRIEVAL_CONSENT_REQUIRED     403  consent missing or still PENDING
RETRIEVAL_CONSENT_DENIED       403  the citizen refused
RETRIEVAL_ONBOARDING_REQUIRED  403  citizen has not completed onboarding
RETRIEVAL_NOT_APPLICABLE       409  not submitted, or no connector for the source
RETRIEVAL_ALREADY_COMPLETED    409  already retrieved successfully
RETRIEVAL_PROVIDER_FAILED      502  the simulated provider failed
RESOURCE_NOT_FOUND             404  unknown application or requirement — and
                                    also another citizen's, which is concealed
                                    as absent exactly as in Phases 6 and 7
VALIDATION_ERROR               400  malformed body, or a field the client is
                                    not trusted with

--------------------------------------------------------------------------------
6. Idempotency and retry
--------------------------------------------------------------------------------

  - A requirement that has been retrieved successfully cannot be retrieved
    again: the service answers RETRIEVAL_ALREADY_COMPLETED, and a partial unique
    index on `(application_id, requirement_id) WHERE status = 'SUCCESS'` closes
    the concurrent case at the database.
  - A failed attempt may be retried. Failure rows accumulate as an audit trail,
    with `attempt_number` continuing rather than restarting.
  - A failure writes no `application_data`. A provider that failed supplied
    nothing.

--------------------------------------------------------------------------------
7. What is persisted
--------------------------------------------------------------------------------

One successful retrieval writes three things in a single transaction:

  data_retrievals     the attempt: application, source, consent, requirement,
                      status, synthetic provider reference, timestamps,
                      display metadata
  application_data    the normalized values, one row per field, with
                      source_type = 'PROVIDER_RETRIEVAL' and source_id set
  application_events  DATA_RETRIEVAL_SUCCEEDED / DATA_RETRIEVAL_FAILED

Provenance is enforced by a CHECK constraint, not merely by convention:

  CITIZEN_DECLARATION → source_id IS NULL      (nobody issued it)
  PROVIDER_RETRIEVAL  → source_id IS NOT NULL  (a named system issued it)

A provider may refresh a value it previously supplied. It can never overwrite
something the citizen typed: the upsert is scoped by
`WHERE source_type = 'PROVIDER_RETRIEVAL'`, so a collision with a declaration
updates nothing.

Neither the event metadata nor the application logs contain retrieved values.
Both carry identifiers, codes and counts only.

--------------------------------------------------------------------------------
8. Row Level Security
--------------------------------------------------------------------------------

Unchanged from Phase 2, and deliberately so.

`data_retrievals` and `application_data` carry SELECT policies only — a citizen
reads rows belonging to their own applications, a scoped officer reads rows for
applications in their department. Neither table has an INSERT or UPDATE policy,
so no browser session can write a retrieval result or alter its status under any
circumstances.

Both Phase 8 functions are `security invoker`, are REVOKEd from `public`, `anon`
and `authenticated`, and are GRANTed to `service_role` alone.

--------------------------------------------------------------------------------
9. Registered connectors (Phase 9)
--------------------------------------------------------------------------------

Connector selection is database-driven. The client names a requirement; the
server derives the source from `service_requirements.data_source_id`, and the
connector from `data_sources.code`. No request field selects a provider, and
none is accepted — `connector`, `connectorName`, `provider`, `providerUrl` and
`sourceCode` are all rejected by `.strict()` with 400.

  data_sources.code    Connector                  Requirement codes served
  ------------------------------------------------------------------------------
  DIGILOCKER_MOCK      FakeDigiLockerConnector    BANK_DETAILS, COMMUNITY_RECORD
  MOCK_IDENTITY_API    FakeIdentityConnector      IDENTITY
  MOCK_EDUCATION_API   FakeEducationConnector     EDUCATION_RECORD
  MOCK_INCOME_API      FakeIncomeConnector        INCOME_RECORD

A requirement code outside a connector's own set is refused with
`UNSUPPORTED_REQUIREMENT` rather than answered with a plausible invention, so a
connector can never supply another source's data.

Normalized field keys are disjoint across providers (`identity*`, `education*`,
`income*`, `bank*`/`community*`), so one provider's result cannot overwrite
another's in `application_data`.

Every connector is SIMULATED and in-process:

  - no HTTP client, no base URL, no credential, no environment configuration;
  - deterministic — the same request always yields the same result;
  - synthetic data only, with `SYNTH-` references and "(Simulated)" issuers;
  - nothing resembling a real Aadhaar, PAN or passport number.

Failure is a construction-time behaviour (`CONNECTOR_BEHAVIOUR.ALWAYS_FAIL`),
reachable from tests and a scripted demo but never from a request body. There is
no `forceFailure` flag; sending one is a 400.

--------------------------------------------------------------------------------
10. Phase boundary — retrieval is not verification
--------------------------------------------------------------------------------

This holds however many government systems have answered:

  - `applications.status` stays SUBMITTED;
  - `verifications` stays empty;
  - `application_reviews` stays empty;
  - provider-sourced `application_data` keeps `verification_status = PENDING`;
  - `CITIZEN_DECLARATION` rows are never overwritten by a retrieval.

The UI says "Retrieved", never "Verified". Verification, the
UNDER_VERIFICATION/VERIFICATION transition and officer review belong to
Phase 10.
