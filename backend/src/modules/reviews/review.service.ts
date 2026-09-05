import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  countApplicationsByStatus,
  findApplicantForReview,
  findApplicationForOfficer,
  findOfficerScope,
  findReviewForApplication,
  listEvidenceForReview,
  listRequirementLabels,
  listVerificationDetail,
  listVerificationsForApplications,
  listApplicationsForOfficer,
  recordDecision,
  type OfficerScope,
} from './review.repository.js';
import type { ReviewDecisionBody, ReviewQueueQuery } from './review.schema.js';
import {
  REVIEW_DECISION,
  type ReviewDashboardPayload,
  type ReviewDetailPayload,
  type ReviewEvidenceGroup,
  type ReviewQueuePayload,
  type ReviewVerification,
  type ReviewVerificationSummary,
} from './review.types.js';

/**
 * The gate every endpoint in this module applies.
 *
 * Three conditions, checked in this order and all server-derived:
 *
 *   1. GOVERNMENT_OFFICER — a citizen has no path here at all. The route's
 *      `requireRole` already refuses them; this is the second, independent
 *      check, because a route wired without that middleware must still fail
 *      closed rather than admit whoever arrives.
 *   2. onboarding COMPLETED — an officer without a `government_profiles` row
 *      has no department, and a decision that cannot be attributed to a
 *      department is not an accountable decision.
 *   3. a resolvable scope — the department must actually exist and handle
 *      services.
 *
 * Nothing here reads the request. The role and onboarding status come from the
 * `profiles` row the verified access token resolved to (auth.types.ts).
 */
const assertOfficerScope = async (auth: AuthContext): Promise<OfficerScope> => {
  if (auth.role !== USER_ROLES.GOVERNMENT_OFFICER) throw new ForbiddenError();

  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'REVIEW_ONBOARDING_REQUIRED',
      message: 'Complete your officer profile before reviewing applications.',
    });
  }

  const scope = await findOfficerScope(auth.userId);
  if (!scope) {
    throw new AppError({
      statusCode: 403,
      code: 'REVIEW_ONBOARDING_REQUIRED',
      message: 'Complete your officer profile before reviewing applications.',
    });
  }

  return scope;
};

/**
 * Counts outcomes. Concludes nothing from them.
 *
 * There is deliberately no `passed` boolean and no score here. Verification is
 * ADVISORY in Phase 11: an application where every requirement came back
 * VERIFIED is not "approved pending a click", and one carrying a FAILED outcome
 * is not rejected. Reducing these counts to a recommendation would be the
 * automated judgement the phase exists to keep out of the loop (§4, §13).
 */
const summarize = (
  statuses: readonly string[],
): ReviewVerificationSummary => ({
  verified: statuses.filter((status) => status === 'VERIFIED').length,
  failed: statuses.filter((status) => status === 'FAILED').length,
  requiresAction: statuses.filter((status) => status === 'REQUIRES_ACTION').length,
  total: statuses.length,
});

/** The officer's dashboard. Every count comes from persisted rows (§10). */
export const getReviewDashboard = async (
  auth: AuthContext,
): Promise<ReviewDashboardPayload> => {
  const scope = await assertOfficerScope(auth);
  const counts = await countApplicationsByStatus(scope);

  const approved = counts.APPROVED ?? 0;
  const rejected = counts.REJECTED ?? 0;

  return {
    // "Awaiting review" is the count of applications that have completed
    // verification and are waiting for a person — the VERIFICATION status, which
    // is where Phase 10 leaves them.
    awaitingReview: counts.VERIFICATION ?? 0,
    approved,
    rejected,
    totalReviewed: approved + rejected,
    department: scope.departmentName,
    officerName: scope.officerName,
  };
};

/** The officer's queue, scoped to their department. */
export const getReviewQueue = async (
  auth: AuthContext,
  query: ReviewQueueQuery,
): Promise<ReviewQueuePayload> => {
  const scope = await assertOfficerScope(auth);

  const { rows, total } = await listApplicationsForOfficer({
    scope,
    // Spread rather than `status: query.status`: `exactOptionalPropertyTypes`
    // distinguishes an absent optional property from one explicitly set to
    // undefined, and "no filter" is the former.
    ...(query.status ? { status: query.status } : {}),
    page: query.page,
    limit: query.limit,
  });

  const verifications = await listVerificationsForApplications(rows.map((row) => row.id));
  const statusesByApplication = new Map<string, string[]>();
  for (const verification of verifications) {
    const list = statusesByApplication.get(verification.application_id) ?? [];
    list.push(verification.status);
    statusesByApplication.set(verification.application_id, list);
  }

  return {
    items: rows.map((row) => ({
      applicationId: row.id,
      applicationNumber: row.application_number,
      citizenName: row.citizen_name,
      serviceName: row.service_name,
      status: row.status,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      verificationSummary: summarize(statusesByApplication.get(row.id) ?? []),
      decision:
        row.status === 'APPROVED'
          ? REVIEW_DECISION.APPROVED
          : row.status === 'REJECTED'
            ? REVIEW_DECISION.REJECTED
            : null,
    })),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
};

/**
 * A human label for a stored field code.
 *
 * `educationAggregatePercentage` → "Education Aggregate Percentage". Derived
 * rather than mapped, so a field a connector adds later is still readable
 * instead of appearing as a raw camelCase identifier. The officer sees a
 * labelled value, never a JSON dump (§12).
 */
const humanizeFieldCode = (fieldCode: string): string =>
  fieldCode
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .trim();

/** Evidence grouped by the system that supplied it. */
const groupEvidence = (
  rows: readonly {
    field_code: string;
    field_value: unknown;
    source_type: string | null;
    verification_status: string;
    verified_at: string | null;
    source_name: string | null;
  }[],
): readonly ReviewEvidenceGroup[] => {
  const groups = new Map<string, ReviewEvidenceGroup['items'][number][]>();

  for (const row of rows) {
    // Only scalar values are shown. A stored object would have to be rendered
    // as JSON, and dumping a structure at an officer is exactly what §12
    // forbids — the normalized fields are the readable representation.
    if (typeof row.field_value !== 'string') continue;

    const sourceName =
      row.source_name ?? (row.source_type === 'CITIZEN_DECLARATION' ? 'Declared by applicant' : 'Unattributed');
    const items = groups.get(sourceName) ?? [];
    items.push({
      fieldCode: row.field_code,
      label: humanizeFieldCode(row.field_code),
      value: row.field_value,
      sourceName: row.source_name,
      verificationStatus: row.verification_status,
      verifiedAt: row.verified_at,
    });
    groups.set(sourceName, items);
  }

  return [...groups.entries()].map(([sourceName, items]) => ({ sourceName, items }));
};

/** The stored reason code, when the result carries one. */
const readReasonCode = (result: unknown): string | null => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const reason = (result as Record<string, unknown>).reasonCode;
  return typeof reason === 'string' ? reason : null;
};

/**
 * Everything the officer needs to decide one application.
 *
 * Out-of-scope and non-existent applications are indistinguishable here: both
 * are 404. An officer probing identifiers learns nothing about applications
 * belonging to another department (§20).
 */
export const getReviewDetail = async (
  auth: AuthContext,
  applicationId: string,
): Promise<ReviewDetailPayload> => {
  const scope = await assertOfficerScope(auth);

  const application = await findApplicationForOfficer({ applicationId, scope });
  if (!application) throw new NotFoundError('Application');

  const [applicant, evidence, verifications, requirementLabels, review] = await Promise.all([
    findApplicantForReview(application.citizen_id),
    listEvidenceForReview(application.id),
    listVerificationDetail(application.id),
    listRequirementLabels(application.service_id),
    findReviewForApplication(application.id),
  ]);

  const verificationItems: readonly ReviewVerification[] = verifications.map((row) => ({
    requirementCode: row.verification_type,
    information: requirementLabels.get(row.verification_type)?.name ?? humanizeFieldCode(row.verification_type),
    required: requirementLabels.get(row.verification_type)?.required ?? true,
    status: row.status as ReviewVerification['status'],
    reasonCode: readReasonCode(row.result),
    verifiedAt: row.verified_at,
  }));

  const declaredFields = Object.fromEntries(
    evidence.flatMap((row) =>
      row.source_type === 'CITIZEN_DECLARATION' && typeof row.field_value === 'string'
        ? [[row.field_code, row.field_value]]
        : [],
    ),
  );

  return {
    applicationId: application.id,
    applicationNumber: application.application_number,
    status: application.status,
    submittedAt: application.submitted_at,
    updatedAt: application.updated_at,
    service: {
      code: application.service_code,
      name: application.service_name,
      department: scope.departmentName,
    },
    applicant: applicant
      ? {
          fullName: applicant.full_name,
          governmentId: applicant.government_id,
          mobileNumber: applicant.mobile_number,
          dateOfBirth: applicant.date_of_birth,
        }
      : {
          fullName: 'Name unavailable',
          governmentId: '—',
          mobileNumber: '—',
          dateOfBirth: null,
        },
    declaredFields,
    evidence: groupEvidence(
      evidence.filter((row) => row.source_type !== 'CITIZEN_DECLARATION'),
    ),
    verifications: verificationItems,
    verificationSummary: summarize(verificationItems.map((item) => item.status ?? 'PENDING')),
    review: review
      ? {
          // The repository filters to final decisions only, so REQUESTED_INFO
          // cannot reach here.
          decision: review.decision === 'REJECTED' ? REVIEW_DECISION.REJECTED : REVIEW_DECISION.APPROVED,
          reviewerName: review.reviewer_name,
          remarks: review.remarks,
          reviewedAt: review.reviewed_at,
        }
      : null,
    // Server-derived, never computed by the browser. An application that has
    // already been decided offers no decision controls, and the RPC refuses one
    // regardless of what the client believes (§15).
    canDecide: application.status === 'VERIFICATION',
  };
};

/**
 * Records one officer decision.
 *
 * The reviewer is `auth.userId` — the identity the verified access token
 * resolved to — and nothing in the request body can influence it. The schema
 * rejects a body carrying `reviewerId` outright, but even an accepted one would
 * reach nothing: there is no parameter here to receive it (§20).
 *
 * The state guard is applied three times over, deliberately:
 *
 *   here            — a readable error for an application already decided;
 *   in the RPC      — under `FOR UPDATE`, which is what makes it correct
 *                     when two officers act at the same instant;
 *   in the schema   — a unique index permitting one final decision per
 *                     application.
 *
 * Only the second of those is load-bearing under concurrency. The first exists
 * so the ordinary case produces a 409 the officer can understand rather than an
 * opaque failure, and the third so the invariant survives any future code path
 * that forgets the other two.
 */
export const submitReviewDecision = async (
  auth: AuthContext,
  applicationId: string,
  body: ReviewDecisionBody,
): Promise<ReviewDetailPayload> => {
  const scope = await assertOfficerScope(auth);

  const application = await findApplicationForOfficer({ applicationId, scope });
  if (!application) throw new NotFoundError('Application');

  if (application.status !== 'VERIFICATION') {
    throw new AppError({
      statusCode: 409,
      code: 'REVIEW_NOT_APPLICABLE',
      message:
        application.status === 'APPROVED' || application.status === 'REJECTED'
          ? 'A decision has already been recorded for this application.'
          : 'This application has not completed verification yet.',
    });
  }

  const recorded = await recordDecision({
    applicationId: application.id,
    reviewerId: auth.userId,
    decision: body.decision,
    remarks: body.remarks ?? null,
  });

  if (recorded.length === 0) {
    // The database refused although the service allowed it — a concurrent
    // request decided this application first. Report the conflict rather than
    // claiming a decision that did not persist.
    throw new AppError({
      statusCode: 409,
      code: 'REVIEW_ALREADY_DECIDED',
      message: 'A decision has already been recorded for this application.',
    });
  }

  // Codes and identifiers only. The officer's remarks are never logged: they
  // are stored once, on the review row, under that table's access rules (§27).
  logger.info(
    {
      applicationId: application.id,
      reviewerId: auth.userId,
      decision: body.decision,
      departmentId: scope.departmentId,
    },
    'review.decision.recorded',
  );

  // Re-read rather than assembling the response from what was just sent. The
  // authoritative status is whatever the database now holds, and the officer's
  // screen must show that rather than the client's expectation of it (§14).
  return getReviewDetail(auth, application.id);
};

/** Exported for direct unit testing. */
export const summarizeForTest = summarize;
export const humanizeFieldCodeForTest = humanizeFieldCode;
