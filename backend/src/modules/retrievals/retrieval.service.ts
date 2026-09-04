import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import {
  findApplicationById,
  findServiceForApplication,
} from '../applications/application.repository.js';
import { APPLICATION_STATUS } from '../applications/application.types.js';
import { CONSENT_STATUS } from '../consents/consent.types.js';
import { ConnectorError, resolveConnector } from '../../connectors/index.js';
import {
  listRetrievableRequirements,
  listRetrievalsForApplication,
  listRetrievedFields,
  recordRetrievalFailure,
  recordRetrievalSuccess,
} from './retrieval.repository.js';
import {
  RETRIEVAL_AVAILABILITY,
  RETRIEVAL_STATUS,
  type ApplicationRetrievalPayload,
  type RetrievableRequirement,
  type RetrievalItem,
  type RetrievalRow,
  type RetrievedValue,
} from './retrieval.types.js';

/**
 * The same gate the consent module applies. Retrieval acts on a citizen's own
 * application under their own authorization, so an officer — or a citizen who
 * has not finished onboarding — has no path to it.
 */
const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();
  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'RETRIEVAL_ONBOARDING_REQUIRED',
      message: 'Complete citizen onboarding before retrieving your documents.',
    });
  }
};

/**
 * Resolves the application, scoped to the caller.
 *
 * `findApplicationById` filters on `citizen_id`, so another citizen's
 * application reads as absent rather than as forbidden. That concealment is the
 * behaviour Phase 6 and Phase 7 established, and Phase 8 keeps it: a 403 here
 * would confirm the identifier is real (Phase 8 §25).
 */
const getOwnApplicationOrThrow = async (auth: AuthContext, applicationId: string) => {
  const application = await findApplicationById({ applicationId, citizenId: auth.userId });
  if (!application) throw new NotFoundError('Application');
  return application;
};

const assertSubmitted = (status: string): void => {
  if (status !== APPLICATION_STATUS.SUBMITTED) {
    throw new AppError({
      statusCode: 409,
      code: 'RETRIEVAL_NOT_APPLICABLE',
      message: 'Documents are retrieved once an application has been submitted.',
    });
  }
};

/**
 * The most recent attempt per requirement.
 *
 * Rows arrive newest first, so the first row seen for a requirement is its
 * current state. A SUCCESS always wins regardless of order, because the partial
 * unique index guarantees there is at most one and it is the outcome that
 * matters — a failed retry after a success must not make the requirement look
 * unfetched.
 */
const latestByRequirement = (rows: readonly RetrievalRow[]): Map<string, RetrievalRow> => {
  const latest = new Map<string, RetrievalRow>();
  for (const row of rows) {
    if (!row.requirement_id) continue;
    const existing = latest.get(row.requirement_id);
    if (!existing) latest.set(row.requirement_id, row);
    else if (row.status === RETRIEVAL_STATUS.SUCCESS) latest.set(row.requirement_id, row);
  }
  return latest;
};

/**
 * What the citizen may do with this requirement right now.
 *
 * Consent is checked before anything else, so a DENIED consent can never
 * present a retrieval action however the retrieval history looks (Phase 8 §31).
 */
const availabilityOf = (
  requirement: RetrievableRequirement,
  retrieval: RetrievalRow | undefined,
  hasConnector: boolean,
) => {
  if (retrieval?.status === RETRIEVAL_STATUS.SUCCESS) return RETRIEVAL_AVAILABILITY.COMPLETED;
  if (requirement.consentStatus === CONSENT_STATUS.DENIED) return RETRIEVAL_AVAILABILITY.CONSENT_DENIED;
  if (requirement.consentStatus !== CONSENT_STATUS.GRANTED) {
    return RETRIEVAL_AVAILABILITY.CONSENT_REQUIRED;
  }
  if (!hasConnector) return RETRIEVAL_AVAILABILITY.NOT_SUPPORTED;
  return retrieval ? RETRIEVAL_AVAILABILITY.RETRYABLE : RETRIEVAL_AVAILABILITY.AVAILABLE;
};

/** Provider metadata SetuX stored about the attempt, read back for display. */
const readMetadata = (
  retrieval: RetrievalRow | undefined,
): { readonly documentType: string | null; readonly issuer: string | null; readonly labels: Readonly<Record<string, string>> } => {
  const metadata = retrieval?.response_metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { documentType: null, issuer: null, labels: {} };
  }
  const record = metadata as Record<string, unknown>;
  const labels = record.labels;
  return {
    documentType: typeof record.documentType === 'string' ? record.documentType : null,
    issuer: typeof record.issuer === 'string' ? record.issuer : null,
    labels:
      labels && typeof labels === 'object' && !Array.isArray(labels)
        ? (labels as Record<string, string>)
        : {},
  };
};

const buildItem = (params: {
  readonly requirement: RetrievableRequirement;
  readonly retrieval: RetrievalRow | undefined;
  readonly fields: readonly { readonly fieldCode: string; readonly value: string; readonly sourceId: string }[];
}): RetrievalItem => {
  const { requirement, retrieval } = params;
  const connector = resolveConnector(requirement.sourceCode);
  const metadata = readMetadata(retrieval);
  const isSuccess = retrieval?.status === RETRIEVAL_STATUS.SUCCESS;

  // Values are shown only for a successful retrieval, and only those this
  // requirement's own source supplied — never another source's data.
  const values: RetrievedValue[] = isSuccess
    ? params.fields
        .filter((field) => field.sourceId === requirement.dataSourceId)
        .flatMap((field) => {
          const label = metadata.labels[field.fieldCode];
          return label ? [{ label, value: field.value }] : [];
        })
    : [];

  return {
    requirementId: requirement.requirementId,
    requirementCode: requirement.requirementCode,
    information: requirement.information,
    source: requirement.sourceName,
    // Every Phase 8 source is simulated. An unregistered source is still a mock
    // row in the seeded catalogue, so this stays true rather than defaulting to
    // a claim of realness.
    isSimulated: connector?.isSimulated ?? true,
    availability: availabilityOf(requirement, retrieval, connector !== null),
    status: retrieval?.status ?? null,
    documentType: isSuccess ? metadata.documentType : null,
    providerReference: isSuccess ? retrieval.request_reference : null,
    issuer: isSuccess ? metadata.issuer : null,
    retrievedAt: isSuccess ? retrieval.completed_at : null,
    values,
    // The stored message is SetuX's own wording, written by this service. The
    // provider's internals never reach it (Phase 8 §33).
    failureReason: retrieval && !isSuccess ? retrieval.error_message : null,
  };
};

const buildPayload = async (params: {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly citizenId: string;
  readonly serviceId: string;
}): Promise<ApplicationRetrievalPayload> => {
  const [service, requirements, retrievals, fields] = await Promise.all([
    findServiceForApplication(params.serviceId),
    listRetrievableRequirements({
      applicationId: params.applicationId,
      citizenId: params.citizenId,
      serviceId: params.serviceId,
    }),
    listRetrievalsForApplication(params.applicationId),
    listRetrievedFields(params.applicationId),
  ]);
  if (!service) throw new NotFoundError('Service');

  const latest = latestByRequirement(retrievals);
  return {
    applicationId: params.applicationId,
    applicationNumber: params.applicationNumber,
    serviceName: service.name,
    items: requirements.map((requirement) =>
      buildItem({ requirement, retrieval: latest.get(requirement.requirementId), fields }),
    ),
  };
};

/** Reads the retrieval state of every source-backed requirement. Retrieves nothing. */
export const getApplicationRetrievals = async (
  auth: AuthContext,
  applicationId: string,
): Promise<ApplicationRetrievalPayload> => {
  assertCompletedCitizen(auth);
  const application = await getOwnApplicationOrThrow(auth, applicationId);
  assertSubmitted(application.status);
  return buildPayload({
    applicationId: application.id,
    applicationNumber: application.application_number,
    citizenId: auth.userId,
    serviceId: application.service_id,
  });
};

/**
 * Performs one retrieval.
 *
 * The order of the checks below is the security contract, and it is deliberate:
 * every authorization question is answered from stored rows BEFORE the
 * connector is constructed or called. There is no path through this function
 * that reaches a provider without a GRANTED consent, and no development flag
 * that relaxes it (Phase 8 §8, §9).
 *
 * The database function re-derives the same authorization independently when it
 * writes. That duplication is intentional: the service decides which error the
 * citizen sees, and the database refuses to persist anything the service should
 * not have allowed.
 */
export const createApplicationRetrieval = async (
  auth: AuthContext,
  applicationId: string,
  requirementId: string,
): Promise<ApplicationRetrievalPayload> => {
  assertCompletedCitizen(auth);
  const application = await getOwnApplicationOrThrow(auth, applicationId);
  assertSubmitted(application.status);

  // The requirement is resolved from THIS application's service. A requirement
  // id belonging to another service simply does not appear, so it cannot be
  // used to reach a source this application never asked for.
  const requirements = await listRetrievableRequirements({
    applicationId: application.id,
    citizenId: auth.userId,
    serviceId: application.service_id,
  });
  const requirement = requirements.find((candidate) => candidate.requirementId === requirementId);
  if (!requirement) throw new NotFoundError('Requirement');

  // ---- The consent gate. Nothing below runs without a GRANTED consent. ----
  if (requirement.consentStatus === CONSENT_STATUS.DENIED) {
    throw new AppError({
      statusCode: 403,
      code: 'RETRIEVAL_CONSENT_DENIED',
      message: 'You denied consent for this information, so it will not be requested.',
    });
  }
  if (requirement.consentStatus !== CONSENT_STATUS.GRANTED) {
    throw new AppError({
      statusCode: 403,
      code: 'RETRIEVAL_CONSENT_REQUIRED',
      message: 'Grant consent for this information before it can be retrieved.',
    });
  }

  // Idempotency: a completed retrieval is not repeated. The partial unique
  // index enforces this too, so a concurrent duplicate is refused by the
  // database rather than reaching the provider twice.
  const existing = latestByRequirement(await listRetrievalsForApplication(application.id)).get(
    requirementId,
  );
  if (existing?.status === RETRIEVAL_STATUS.SUCCESS) {
    throw new AppError({
      statusCode: 409,
      code: 'RETRIEVAL_ALREADY_COMPLETED',
      message: 'This information has already been retrieved.',
    });
  }

  const connector = resolveConnector(requirement.sourceCode);
  if (!connector) {
    throw new AppError({
      statusCode: 409,
      code: 'RETRIEVAL_NOT_APPLICABLE',
      message: 'This information cannot be retrieved yet.',
    });
  }

  const correlationId = randomUUID();
  const reload = () =>
    buildPayload({
      applicationId: application.id,
      applicationNumber: application.application_number,
      citizenId: auth.userId,
      serviceId: application.service_id,
    });

  try {
    const result = await connector.retrieve({
      requirementCode: requirement.requirementCode,
      correlationId,
    });

    // The connector's normalized fields are split: values go to
    // `application_data`, labels to the retrieval's metadata. Keeping the
    // labels out of the data table means a display change never rewrites
    // citizen data.
    const values = Object.fromEntries(result.fields.map((field) => [field.fieldKey, field.value]));
    const labels = Object.fromEntries(result.fields.map((field) => [field.fieldKey, field.label]));

    const recorded = await recordRetrievalSuccess({
      applicationId: application.id,
      citizenId: auth.userId,
      requirementId,
      requestReference: result.providerReference,
      values,
      responseMetadata: {
        documentType: result.documentType,
        issuer: result.issuer,
        issuedOn: result.issuedOn,
        labels,
        simulated: connector.isSimulated,
      },
    });

    if (!recorded) {
      // The database refused the write although the service allowed it —
      // consent or application state changed underneath this request. Report
      // the conflict rather than claiming a retrieval that did not persist.
      throw new AppError({
        statusCode: 409,
        code: 'RETRIEVAL_NOT_APPLICABLE',
        message: 'This information could not be retrieved. Please try again.',
      });
    }

    // Identifiers and counts only — never the retrieved values themselves
    // (AGENT.md §15, digilocker-integration.md §27).
    logger.info(
      {
        correlationId,
        applicationId: application.id,
        requirementCode: requirement.requirementCode,
        source: requirement.sourceCode,
        fieldCount: result.fields.length,
      },
      'retrieval.succeeded',
    );
    return await reload();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (!(error instanceof ConnectorError)) throw error;

    await recordRetrievalFailure({
      applicationId: application.id,
      citizenId: auth.userId,
      requirementId,
      errorCode: error.code,
      // SetuX's own wording, safe to show the citizen.
      errorMessage: error.message,
    });

    logger.warn(
      {
        correlationId,
        applicationId: application.id,
        requirementCode: requirement.requirementCode,
        source: requirement.sourceCode,
        errorCode: error.code,
      },
      'retrieval.failed',
    );

    throw new AppError({
      statusCode: 502,
      code: 'RETRIEVAL_PROVIDER_FAILED',
      message: error.retryable
        ? 'The government system did not respond. You can try again.'
        : 'This information is not available from that system.',
    });
  }
};
