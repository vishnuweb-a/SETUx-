import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  findApplicationById,
  findServiceForApplication,
} from '../applications/application.repository.js';
import { APPLICATION_STATUS } from '../applications/application.types.js';
import { resolveRule } from './verification.rules.js';
import {
  listEvidenceForApplication,
  listRetrievedRequirementIds,
  listVerifiableRequirements,
  listVerificationsForApplication,
  recordVerificationRun,
} from './verification.repository.js';
import {
  VERIFICATION_READINESS,
  VERIFICATION_REASON,
  VERIFICATION_STATUS,
  type EvidenceBundle,
  type RequirementVerification,
  type VerifiableRequirement,
  type VerificationItem,
  type VerificationPayload,
  type VerificationReadiness,
  type VerificationReason,
  type VerificationRow,
} from './verification.types.js';

/**
 * The same gate the consent and retrieval modules apply. Verification runs on a
 * citizen's own application under their own authorization, so an officer — or a
 * citizen who has not finished onboarding — has no path to it.
 *
 * An officer reaching this would be a phase violation as much as a security
 * one: the officer's involvement with an application begins in Phase 11.
 */
const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();
  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'VERIFICATION_ONBOARDING_REQUIRED',
      message: 'Complete citizen onboarding before your application can be verified.',
    });
  }
};

/**
 * Resolves the application, scoped to the caller.
 *
 * `findApplicationById` filters on `citizen_id`, so another citizen's
 * application reads as absent rather than forbidden — the concealment Phases
 * 6, 7 and 8 established, kept here because a 403 would confirm the identifier
 * is real (§36).
 */
const getOwnApplicationOrThrow = async (auth: AuthContext, applicationId: string) => {
  const application = await findApplicationById({ applicationId, citizenId: auth.userId });
  if (!application) throw new NotFoundError('Application');
  return application;
};

/**
 * Whether verification may start, derived entirely from stored rows.
 *
 * The client never supplies any part of this. A request body carrying
 * `ready: true` is rejected by the schema before it reaches the service, and
 * even a forged one would change nothing here, because nothing here reads the
 * request (§10, §35).
 *
 * Readiness deliberately requires EVERY required provider-backed requirement to
 * have retrieved evidence — not "at least one succeeded" (§9). Starting with a
 * partial evidence set would produce EVIDENCE_MISSING outcomes that look like
 * findings about the citizen rather than what they are: SetuX not having asked
 * yet.
 *
 * Optional requirements are excluded. `BANK_DETAILS` is optional for most
 * seeded scholarships, and blocking the whole workflow on an optional document
 * would contradict the catalogue that marks it optional.
 */
const assessReadiness = (params: {
  readonly status: string;
  readonly requirements: readonly VerifiableRequirement[];
  readonly retrievedRequirementIds: ReadonlySet<string>;
  readonly hasVerifications: boolean;
}): VerificationReadiness => {
  if (params.hasVerifications) return VERIFICATION_READINESS.ALREADY_STARTED;
  if (params.status !== APPLICATION_STATUS.SUBMITTED) {
    return VERIFICATION_READINESS.NOT_SUBMITTED;
  }

  const outstanding = params.requirements.filter(
    (requirement) =>
      requirement.required &&
      requirement.dataSourceId !== null &&
      !params.retrievedRequirementIds.has(requirement.requirementId),
  );

  return outstanding.length > 0
    ? VERIFICATION_READINESS.EVIDENCE_INCOMPLETE
    : VERIFICATION_READINESS.READY;
};

/** The stored reason code, when it is one this phase recognises. */
const readReasonCode = (result: unknown): VerificationReason | null => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const reason = (result as Record<string, unknown>).reasonCode;
  if (typeof reason !== 'string') return null;
  return Object.values(VERIFICATION_REASON).includes(reason as VerificationReason)
    ? (reason as VerificationReason)
    : null;
};

const buildPayload = async (params: {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceId: string;
  readonly status: string;
}): Promise<VerificationPayload> => {
  const [service, requirements, retrievedRequirementIds, verifications] = await Promise.all([
    findServiceForApplication(params.serviceId),
    listVerifiableRequirements(params.serviceId),
    listRetrievedRequirementIds(params.applicationId),
    listVerificationsForApplication(params.applicationId),
  ]);
  if (!service) throw new NotFoundError('Service');

  const byRequirementCode = new Map(
    verifications.map((row) => [row.verification_type, row] as const),
  );

  const items: VerificationItem[] = requirements.map((requirement) => {
    const verification = byRequirementCode.get(requirement.requirementCode);
    return {
      requirementCode: requirement.requirementCode,
      information: requirement.name,
      required: requirement.required,
      status: verification?.status ?? null,
      reasonCode: verification ? readReasonCode(verification.result) : null,
      verifiedAt: verification?.verified_at ?? null,
    };
  });

  return {
    applicationId: params.applicationId,
    applicationNumber: params.applicationNumber,
    serviceName: service.name,
    readiness: assessReadiness({
      status: params.status,
      requirements,
      retrievedRequirementIds,
      hasVerifications: verifications.length > 0,
    }),
    items,
    // Derived from actual stored outcomes, never hard-coded and never rounded
    // into a fabricated percentage (§42). The denominator is every requirement
    // the service asks for, so a requirement SetuX could not judge is visible
    // as unfinished rather than quietly dropped from the total.
    verifiedCount: items.filter((item) => item.status === VERIFICATION_STATUS.VERIFIED).length,
    totalCount: items.length,
  };
};

/** Reads the verification state of one application. Verifies nothing. */
export const getApplicationVerification = async (
  auth: AuthContext,
  applicationId: string,
): Promise<VerificationPayload> => {
  assertCompletedCitizen(auth);
  const application = await getOwnApplicationOrThrow(auth, applicationId);
  return buildPayload({
    applicationId: application.id,
    applicationNumber: application.application_number,
    serviceId: application.service_id,
    status: application.status,
  });
};

/**
 * Evaluates every requirement against its rule.
 *
 * Pure: stored evidence in, outcomes out. No database, no network, no clock, no
 * connector — which is what lets the whole rule set be tested directly and what
 * makes a stored outcome reproducible from the evidence that produced it.
 */
const evaluateRequirements = (params: {
  readonly requirements: readonly VerifiableRequirement[];
  readonly evidence: EvidenceBundle;
}): readonly RequirementVerification[] =>
  params.requirements.map((requirement) => {
    const rule = resolveRule(requirement.requirementCode);

    // A requirement SetuX has no rule for is recorded as unjudged rather than
    // skipped. Omitting it would let the overview imply every requirement was
    // examined (§15).
    if (!rule) {
      return {
        requirementCode: requirement.requirementCode,
        status: VERIFICATION_STATUS.REQUIRES_ACTION,
        reasonCode: VERIFICATION_REASON.NO_RULE_DEFINED,
        ruleCode: 'NONE',
        sourceId: requirement.dataSourceId,
        fieldCodes: [],
      };
    }

    const outcome = rule.evaluate(params.evidence);
    return {
      requirementCode: requirement.requirementCode,
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      ruleCode: rule.ruleCode,
      sourceId: requirement.dataSourceId,
      fieldCodes: outcome.fieldCodes,
    };
  });

/**
 * Starts and completes one verification run.
 *
 * The run is synchronous: the rules are pure comparisons over rows already in
 * the database, so there is nothing to wait for and a queue would add moving
 * parts a prototype cannot justify. The application is SUBMITTED when the
 * request arrives and VERIFICATION when it returns.
 *
 * Who may start it: the citizen, explicitly, on their own application. The
 * repository documents no automatic trigger — Phase 8's retrieval is likewise
 * citizen-initiated, and inventing an automatic one would mean an application's
 * status changed with no actor to attribute the event to (§20).
 *
 * Errors are kept in two distinct classes throughout (§16):
 *
 *   a RULE FAILURE  — evidence was read and disagreed. It is data. It is
 *                     persisted as a FAILED verification and the run succeeds.
 *
 *   a SYSTEM ERROR  — the run could not execute. It is not data. It propagates
 *                     as a 5xx and NOTHING is persisted, because the alternative
 *                     is a database error being recorded as a finding against
 *                     the citizen.
 *
 * The atomic RPC is what holds that line: either the whole run commits or none
 * of it does, so a failure midway cannot leave a half-verified application.
 */
export const startApplicationVerification = async (
  auth: AuthContext,
  applicationId: string,
): Promise<VerificationPayload> => {
  assertCompletedCitizen(auth);
  const application = await getOwnApplicationOrThrow(auth, applicationId);

  const [requirements, retrievedRequirementIds, existingVerifications] = await Promise.all([
    listVerifiableRequirements(application.service_id),
    listRetrievedRequirementIds(application.id),
    listVerificationsForApplication(application.id),
  ]);

  const readiness = assessReadiness({
    status: application.status,
    requirements,
    retrievedRequirementIds,
    hasVerifications: existingVerifications.length > 0,
  });

  // Idempotency, checked before any work. A second start returns 409 rather
  // than re-running: the outcomes are already recorded and re-running would
  // rewrite `verified_at` timestamps that the timeline has already reported
  // (§22, §63). The RPC's own SUBMITTED guard closes the concurrent case that
  // this check cannot see.
  if (readiness === VERIFICATION_READINESS.ALREADY_STARTED) {
    throw new AppError({
      statusCode: 409,
      code: 'VERIFICATION_ALREADY_STARTED',
      message: 'Verification has already been carried out for this application.',
    });
  }
  if (readiness === VERIFICATION_READINESS.NOT_SUBMITTED) {
    throw new AppError({
      statusCode: 409,
      code: 'VERIFICATION_NOT_APPLICABLE',
      message: 'Verification begins once an application has been submitted.',
    });
  }
  if (readiness === VERIFICATION_READINESS.EVIDENCE_INCOMPLETE) {
    throw new AppError({
      statusCode: 409,
      code: 'VERIFICATION_EVIDENCE_INCOMPLETE',
      message: 'Retrieve the required information before verification can begin.',
    });
  }

  const evidenceFields = await listEvidenceForApplication(application.id);
  const evidence: EvidenceBundle = {
    byFieldCode: new Map(evidenceFields.map((field) => [field.fieldCode, field] as const)),
  };

  const outcomes = evaluateRequirements({ requirements, evidence });

  const recorded = await recordVerificationRun({
    applicationId: application.id,
    citizenId: auth.userId,
    outcomes,
  });

  if (recorded.length === 0) {
    // The database refused the transition although the service allowed it —
    // a concurrent request moved the application out of SUBMITTED first. Report
    // the conflict rather than claiming a run that did not persist.
    throw new AppError({
      statusCode: 409,
      code: 'VERIFICATION_ALREADY_STARTED',
      message: 'Verification has already been carried out for this application.',
    });
  }

  // Codes and counts only — never an evidence value (§27).
  logger.info(
    {
      applicationId: application.id,
      requirementCount: outcomes.length,
      verifiedCount: outcomes.filter((o) => o.status === VERIFICATION_STATUS.VERIFIED).length,
    },
    'verification.completed',
  );

  return buildPayload({
    applicationId: application.id,
    applicationNumber: application.application_number,
    serviceId: application.service_id,
    // The application has moved. Reading the stale value here would report the
    // pre-run status back to the client.
    status: 'VERIFICATION',
  });
};

/** Exported for direct unit testing of the rule engine. */
export const evaluateForTest = evaluateRequirements;
export const assessReadinessForTest = assessReadiness;
export type { VerificationRow };
