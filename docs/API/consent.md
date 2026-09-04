SetuX — Consent API Specification

Version: 1.0
Project: SetuX SIH MVP
Module: Consent Management
Backend: Supabase + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

Phase 7 implementation profile (2026-09-04)

Consent is the authorization boundary between a submitted application and any
future retrieval of protected data from a government system. Phase 7 implements
the boundary; it does not cross it.

The implemented surface is:

GET  /api/v1/applications/:applicationId/consents
POST /api/v1/consents/:consentId/grant
POST /api/v1/consents/:consentId/deny

Phase 7 does NOT implement DigiLocker retrieval, government connectors,
verification, officer review or notifications. A granted consent authorizes a
future retrieval; it performs none.

--------------------------------------------------------------------------------
1. What consent is requested, and how it is derived
--------------------------------------------------------------------------------

Consent requests are derived from configuration, never from the client.

For a submitted application, SetuX creates one consent per
`service_requirements` row that names a `data_source_id`. A DECLARATION the
citizen types themselves has no external source and therefore requires no
consent.

  service_requirements (data_source_id NOT NULL)
        │
        ▼
  one consents row per (application_id, data_source_id)

The `(application_id, data_source_id)` unique key makes preparation idempotent:
reading the consent page twice creates nothing the second time, and an
already-decided consent is never reset to PENDING.

The purpose string is derived server-side from the requirement and the service,
so it always names the real information and the real service.

--------------------------------------------------------------------------------
2. GET /api/v1/applications/:applicationId/consents
--------------------------------------------------------------------------------

Returns the consent requests for one submitted application, creating them on
first read. Reading this endpoint is NOT consent — every row it creates is
PENDING.

Response:

{
  "success": true,
  "data": {
    "application": {
      "applicationId": "uuid",
      "applicationNumber": "STX-2026-000014",
      "serviceName": "Sports Excellence Scholarship",
      "recipient": "Social Welfare",
      "applicationStatus": "SUBMITTED"
    },
    "consents": [
      {
        "id": "uuid",
        "applicationId": "uuid",
        "information": "Identity Verification",
        "description": "Confirms the applicant's identity …",
        "source": "Identity Registry (Mock)",
        "purpose": "Verify Identity Verification for your Sports Excellence Scholarship application",
        "status": "PENDING",
        "decidedAt": null
      }
    ],
    "isDecisionRequired": true
  }
}

Requires: authenticated, role CITIZEN, onboarding COMPLETED, application owned
by the caller, application status SUBMITTED.

No credentials, provider secrets or internal source identifiers are exposed.

--------------------------------------------------------------------------------
3. POST /api/v1/consents/:consentId/grant
   POST /api/v1/consents/:consentId/deny
--------------------------------------------------------------------------------

Records an explicit decision. Both take an EMPTY body.

Grant and deny are separate endpoints rather than one endpoint carrying a
decision field, so the answer cannot be defaulted, coerced or mistyped into the
wrong value.

The body schema is `.strict()`: a request carrying `citizen_id`,
`application_id`, `data_source_id` or `status` is rejected with 400 and the
offending keys named. Every authoritative field is derived from the caller's
session and the stored row.

Both return the same payload shape as the GET above, so the client adopts the
server's answer rather than guessing at it.

--------------------------------------------------------------------------------
4. State model
--------------------------------------------------------------------------------

Phase 7 implements:

  PENDING ──grant──► GRANTED
     │
     └────deny────► DENIED

`consent_status` also carries REVOKED and EXPIRED. Both remain in the schema;
neither is produced or consumed by Phase 7, and no revocation endpoint exists.

A decision is final for the application. Granting after a denial, denying after
a grant, and repeating a decision all fail deterministically with
CONSENT_ALREADY_DECIDED.

The transition is guarded in SQL (`status = 'PENDING'` in the UPDATE's WHERE
clause), so two concurrent decisions cannot both succeed.

--------------------------------------------------------------------------------
5. Authorization
--------------------------------------------------------------------------------

Enforced at three layers:

  route      requireAuth + requireRole(CITIZEN)
  service    onboarding COMPLETED, ownership, application state, transition
  database   RLS on consents; RPC re-checks citizen_id and application ownership

A consent or application belonging to another citizen is concealed as 404, not
403 — a 403 would confirm the identifier is real. This matches the Phase 6
concealment pattern.

--------------------------------------------------------------------------------
6. Error codes
--------------------------------------------------------------------------------

CONSENT_ONBOARDING_REQUIRED   403  Citizen onboarding is not COMPLETED.
CONSENT_NOT_APPLICABLE        409  Application is not at the consent step, or
                                   the request is no longer awaiting a decision.
CONSENT_ALREADY_DECIDED       409  The citizen has already answered this request.
VALIDATION_ERROR              400  Malformed identifier, or an unrecognized body
                                   key (mass-assignment attempt).
RESOURCE_NOT_FOUND            404  Unknown, or belonging to another citizen.
UNAUTHENTICATED               401  No or invalid bearer token.
FORBIDDEN                     403  Wrong role.

--------------------------------------------------------------------------------
7. Audit
--------------------------------------------------------------------------------

Each decision appends to `application_events` in the same transaction that
records it, so the decision and its evidence cannot diverge:

  CONSENT_GRANTED  { consent_id, data_source_id }
  CONSENT_DENIED   { consent_id, data_source_id }

with the acting citizen and a timestamp. Identifiers only — protected data is
never written to an event, and never logged.

`consents.decided_at` records when the citizen decided, separately from
`updated_at`, which any later write would move.

--------------------------------------------------------------------------------
8. Phase 7 → Phase 8 boundary
--------------------------------------------------------------------------------

The rule Phase 8 must honour:

  NO PROTECTED EXTERNAL DATA RETRIEVAL WITHOUT A GRANTED CONSENT
  FOR THAT APPLICATION AND THAT DATA SOURCE.

Phase 7 does not advance the application beyond SUBMITTED. A denial records the
citizen's refusal; it does not reject, withdraw or pause the application, and no
existing product requirement asks it to.

--------------------------------------------------------------------------------
9. Synthetic data
--------------------------------------------------------------------------------

Every data source named by this API is a simulated government system
(`Identity Registry (Mock)`, `Education Department (Mock)`,
`Income & Revenue Department (Mock)`, `DigiLocker (Mock)`). No real DigiLocker,
Aadhaar, PAN or government integration exists in this prototype.
