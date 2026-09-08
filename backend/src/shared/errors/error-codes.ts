/**
 * Machine-readable error codes returned to API clients.
 *
 * The set is defined by AGENT.md §16 and
 * `docs/ERROR-HANDLING/exception-handling.md` §8. Codes are declared here in
 * full so the contract is stable; the phases that introduce authentication,
 * connectors and business rules raise the ones they need.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  /**
   * Authentication codes — `docs/API/auth-api.md` §28,
   * `docs/ERROR-HANDLING/exception-handling.md` §8.
   *
   * These stay deliberately coarse. A client is told that authentication
   * failed, never *why* it failed, so that error responses cannot be used to
   * probe which accounts exist or why a token was rejected (auth-api.md §26).
   */
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',

  /**
   * Onboarding codes — `docs/API/onboarding.md` §38.
   *
   * Only the codes Phase 4 actually raises are declared. The contract lists
   * more, but a code no handler can produce is a promise the API does not keep.
   */
  ONBOARDING_VALIDATION_ERROR: 'ONBOARDING_VALIDATION_ERROR',
  ONBOARDING_NOT_FOUND: 'ONBOARDING_NOT_FOUND',
  ONBOARDING_ALREADY_COMPLETED: 'ONBOARDING_ALREADY_COMPLETED',
  ONBOARDING_ROLE_MISMATCH: 'ONBOARDING_ROLE_MISMATCH',
  ONBOARDING_DUPLICATE_IDENTIFIER: 'ONBOARDING_DUPLICATE_IDENTIFIER',

  APPLICATION_ONBOARDING_REQUIRED: 'APPLICATION_ONBOARDING_REQUIRED',
  APPLICATION_DUPLICATE_ACTIVE: 'APPLICATION_DUPLICATE_ACTIVE',
  APPLICATION_INVALID_STATE: 'APPLICATION_INVALID_STATE',
  APPLICATION_VALIDATION_ERROR: 'APPLICATION_VALIDATION_ERROR',
  APPLICATION_NOT_READY: 'APPLICATION_NOT_READY',
  APPLICATION_ALREADY_SUBMITTED: 'APPLICATION_ALREADY_SUBMITTED',

  /**
   * Consent codes — Phase 7, `docs/API/consent.md`.
   *
   * `CONSENT_NOT_APPLICABLE` covers an application that is not at the consent
   * step; `CONSENT_ALREADY_DECIDED` covers a second decision on a consent the
   * citizen has already granted or denied. Neither reveals anything about
   * resources belonging to someone else — those are concealed as 404s.
   */
  CONSENT_NOT_APPLICABLE: 'CONSENT_NOT_APPLICABLE',
  CONSENT_ALREADY_DECIDED: 'CONSENT_ALREADY_DECIDED',
  CONSENT_ONBOARDING_REQUIRED: 'CONSENT_ONBOARDING_REQUIRED',

  /**
   * Retrieval codes — Phase 8, `docs/API/retrievals.md`.
   *
   * The two consent codes are distinct because they mean genuinely different
   * things to the citizen: one is an action they can take, the other is a
   * decision they already made. Neither reveals anything about another
   * citizen's resources — those stay concealed as 404s, as in Phase 6 and 7.
   */
  RETRIEVAL_CONSENT_REQUIRED: 'RETRIEVAL_CONSENT_REQUIRED',
  RETRIEVAL_CONSENT_DENIED: 'RETRIEVAL_CONSENT_DENIED',
  RETRIEVAL_NOT_APPLICABLE: 'RETRIEVAL_NOT_APPLICABLE',
  RETRIEVAL_ALREADY_COMPLETED: 'RETRIEVAL_ALREADY_COMPLETED',
  RETRIEVAL_PROVIDER_FAILED: 'RETRIEVAL_PROVIDER_FAILED',
  RETRIEVAL_ONBOARDING_REQUIRED: 'RETRIEVAL_ONBOARDING_REQUIRED',

  /**
   * Verification codes — Phase 10, `docs/API/verification.md`.
   *
   * All four are 409s about the application's own state, never about the
   * citizen's eligibility. There is deliberately no code here meaning "you did
   * not qualify": a rule that finds evidence wanting is recorded as a FAILED
   * verification and returned in the payload, because it is a finding to show
   * the officer, not an error to refuse the request with (§15, §16).
   *
   * EVIDENCE_INCOMPLETE is separate from NOT_APPLICABLE because the citizen can
   * act on it — retrieve the missing information — whereas NOT_APPLICABLE means
   * the application is not at a stage where verification means anything.
   */
  VERIFICATION_NOT_APPLICABLE: 'VERIFICATION_NOT_APPLICABLE',
  VERIFICATION_EVIDENCE_INCOMPLETE: 'VERIFICATION_EVIDENCE_INCOMPLETE',
  VERIFICATION_ALREADY_STARTED: 'VERIFICATION_ALREADY_STARTED',
  VERIFICATION_ONBOARDING_REQUIRED: 'VERIFICATION_ONBOARDING_REQUIRED',

  /**
   * Officer review codes — Phase 11, `docs/API/review.md`.
   *
   * Both are 409s about the application's own state. There is deliberately no
   * code here meaning "this citizen did not qualify": that is not an error, it
   * is the officer's REJECTED decision, and it is returned as a successfully
   * recorded outcome rather than a refused request.
   *
   * ALREADY_DECIDED is distinct from NOT_APPLICABLE because they mean different
   * things to the officer: one is an application someone has already finished,
   * the other has not reached them yet.
   */
  REVIEW_NOT_APPLICABLE: 'REVIEW_NOT_APPLICABLE',
  REVIEW_ALREADY_DECIDED: 'REVIEW_ALREADY_DECIDED',
  REVIEW_ONBOARDING_REQUIRED: 'REVIEW_ONBOARDING_REQUIRED',

  /**
   * Editable field policy codes — Change & Correction Service Phase 1,
   * `docs/API/field-policies.md`.
   *
   * An unknown or unsupported record type is NOT here: it is a malformed
   * request parameter and is rejected as a VALIDATION_ERROR at the edge, before
   * any query runs, exactly as an unknown service id is.
   *
   * FIELD_NOT_EDITABLE is a 409 and not a 403: the caller is entitled to ask,
   * and the refusal is about the field's own nature rather than about who they
   * are. Telling a citizen "you are forbidden" when the truth is "nobody may
   * change this here, and the issuing authority owns it" would misdescribe the
   * system and send them looking for a permission that does not exist.
   */
  FIELD_POLICY_NOT_FOUND: 'FIELD_POLICY_NOT_FOUND',
  FIELD_NOT_EDITABLE: 'FIELD_NOT_EDITABLE',

  /**
   * Change & Correction Service, Phase 2 — the citizen record registry.
   *
   * CITIZEN_RECORD_ONBOARDING_REQUIRED mirrors
   * APPLICATION_ONBOARDING_REQUIRED: a record registry is citizen-scoped, and a
   * citizen who has not completed onboarding is not yet somebody SetuX can
   * attribute government records to.
   *
   * CITIZEN_RECORD_UNSUPPORTED_TYPE is a 500 and never reaches a client's
   * decision path. It fires only when a stored `record_type` falls outside the
   * supported set — a configuration fault, not a caller mistake — and exists so
   * that fault is loud rather than a response claiming a record type the
   * client's own vocabulary does not contain.
   *
   * There is deliberately NO code here for "that record belongs to another
   * citizen". Ownership is a predicate in the query, so another citizen's
   * record is NOT_FOUND — indistinguishable from an id that never existed, and
   * an error code naming the distinction would leak the very fact it hides.
   */
  CITIZEN_RECORD_ONBOARDING_REQUIRED: 'CITIZEN_RECORD_ONBOARDING_REQUIRED',
  CITIZEN_RECORD_UNSUPPORTED_TYPE: 'CITIZEN_RECORD_UNSUPPORTED_TYPE',

  /**
   * Change & Correction Service, Phase 4 — the change draft.
   *
   * CHANGE_REQUEST_ONBOARDING_REQUIRED mirrors its Phase 2 counterpart: a
   * correction request is citizen-scoped, and a citizen who has not completed
   * onboarding is not yet somebody SetuX can attribute one to.
   *
   * CHANGE_REQUEST_VALUE_UNCHANGED is a 400 about the request the citizen
   * wrote, not about their permission: asking for a value the source already
   * holds is not a correction, and it is refused before it can consume a
   * department's review to conclude nothing needed doing. Distinct from
   * VALIDATION_ERROR because the citizen can act on it specifically — the field
   * is fine, the value is the problem.
   *
   * There is deliberately NO code here for "that draft belongs to another
   * citizen", and none for "that field is on somebody else's record". Both are
   * NOT_FOUND, because ownership is a predicate in the query rather than a check
   * applied afterwards — and a code naming the distinction would leak the fact
   * the 404 exists to hide.
   *
   * FIELD_NOT_EDITABLE and FIELD_POLICY_NOT_FOUND are reused rather than
   * duplicated with a `CHANGE_REQUEST_` prefix: an immutable field refuses a
   * correction for the same reason whether it was asked about or asked for, and
   * the Phase 1 policy engine raises them from one place.
   */
  CHANGE_REQUEST_ONBOARDING_REQUIRED: 'CHANGE_REQUEST_ONBOARDING_REQUIRED',
  CHANGE_REQUEST_VALUE_UNCHANGED: 'CHANGE_REQUEST_VALUE_UNCHANGED',

  CONNECTOR_ERROR: 'CONNECTOR_ERROR',
  CONNECTOR_TIMEOUT: 'CONNECTOR_TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
