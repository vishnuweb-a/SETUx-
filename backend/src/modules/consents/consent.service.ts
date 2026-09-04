import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import {
  findApplicationById,
  findServiceForApplication,
} from '../applications/application.repository.js';
import { APPLICATION_STATUS } from '../applications/application.types.js';
import {
  decideConsent,
  findConsentById,
  listConsentSourcesForService,
  listConsentsForApplication,
  prepareConsentsForApplication,
} from './consent.repository.js';
import {
  CONSENT_STATUS,
  type ApplicationConsentPayload,
  type ConsentRequest,
  type ConsentRow,
} from './consent.types.js';

/**
 * The same gate the applications module applies. A consent decision is a
 * citizen action on their own application, so an officer — or a citizen who has
 * not finished onboarding — has no business reaching it.
 */
const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();
  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'CONSENT_ONBOARDING_REQUIRED',
      message: 'Complete citizen onboarding before managing consent.',
    });
  }
};

/**
 * Resolves the application, scoped to the caller.
 *
 * `findApplicationById` filters on `citizen_id`, so another citizen's
 * application is indistinguishable from one that does not exist. That is
 * deliberate: a 403 here would confirm the identifier is real (Phase 7 §22).
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
      code: 'CONSENT_NOT_APPLICABLE',
      message: 'Consent is requested once an application has been submitted.',
    });
  }
};

/**
 * Joins each stored consent to the requirement it came from, so the citizen
 * reads "Income Certificate — Income & Revenue Department (Mock)" rather than a
 * pair of UUIDs. A consent whose source is no longer configured is dropped
 * rather than shown without context.
 */
const toConsentRequests = (
  rows: readonly ConsentRow[],
  sources: readonly Awaited<ReturnType<typeof listConsentSourcesForService>>[number][],
): readonly ConsentRequest[] => {
  const bySourceId = new Map(sources.map((source) => [source.dataSourceId, source]));
  // `sources` arrives in the requirement's configured display order, so the
  // consent list reads in the same order as the service's requirements.
  const order = new Map(sources.map((source, index) => [source.dataSourceId, index]));
  return rows
    .flatMap((row) => {
      const source = bySourceId.get(row.data_source_id);
      if (!source) return [];
      return [
        {
          request: {
            id: row.id,
            applicationId: row.application_id,
            information: source.information,
            description: source.description,
            source: source.source,
            purpose: row.purpose,
            status: row.status,
            decidedAt: row.decided_at,
          },
          rank: order.get(row.data_source_id) ?? Number.MAX_SAFE_INTEGER,
        },
      ];
    })
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.request);
};

const buildPayload = async (params: {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly applicationStatus: string;
  readonly serviceId: string;
  readonly rows: readonly ConsentRow[];
}): Promise<ApplicationConsentPayload> => {
  const [service, sources] = await Promise.all([
    findServiceForApplication(params.serviceId),
    listConsentSourcesForService(params.serviceId),
  ]);
  if (!service) throw new NotFoundError('Service');
  const consents = toConsentRequests(params.rows, [...sources]);
  return {
    application: {
      applicationId: params.applicationId,
      applicationNumber: params.applicationNumber,
      serviceName: service.name,
      recipient: service.department,
      applicationStatus: params.applicationStatus,
    },
    consents,
    isDecisionRequired: consents.some((consent) => consent.status === CONSENT_STATUS.PENDING),
  };
};

/**
 * Reads the consent requests for one submitted application, creating them on
 * first read.
 *
 * Creation is folded into the read deliberately. The set is fully derived from
 * configuration, so there is nothing for the citizen to decide about *which*
 * consents exist — only about how to answer them. A separate "prepare" call
 * would add a round trip and a failure mode without adding a decision, and the
 * underlying insert is idempotent, so opening the page twice is harmless.
 *
 * Opening this page is emphatically NOT consent: every row it creates is
 * PENDING, and only an explicit grant changes that (Phase 7 §10).
 */
export const getApplicationConsents = async (
  auth: AuthContext,
  applicationId: string,
): Promise<ApplicationConsentPayload> => {
  assertCompletedCitizen(auth);
  const application = await getOwnApplicationOrThrow(auth, applicationId);
  assertSubmitted(application.status);
  const rows = await prepareConsentsForApplication({ applicationId, citizenId: auth.userId });
  return buildPayload({
    applicationId: application.id,
    applicationNumber: application.application_number,
    applicationStatus: application.status,
    serviceId: application.service_id,
    rows,
  });
};

/**
 * Records an explicit GRANT or DENY.
 *
 * Every authoritative field — who decided, which application, which source, the
 * resulting status and its timestamp — is derived from the caller's session and
 * the stored row. The request body carries none of them.
 *
 * Phase 7 stops here. A GRANTED consent authorizes a future retrieval; it does
 * not perform one, and no connector is called from this path.
 */
export const decideApplicationConsent = async (
  auth: AuthContext,
  consentId: string,
  granted: boolean,
): Promise<ApplicationConsentPayload> => {
  assertCompletedCitizen(auth);
  const existing = await findConsentById({ consentId, citizenId: auth.userId });
  if (!existing) throw new NotFoundError('Consent');

  const decided = await decideConsent({ consentId, citizenId: auth.userId, granted });
  if (!decided) {
    // The row exists and belongs to the caller, so the update matched nothing
    // for one of two reasons: it was already decided, or its application left
    // the submitted state. Distinguish them, because the first is the one the
    // citizen can actually understand.
    if (existing.status !== CONSENT_STATUS.PENDING) {
      throw new AppError({
        statusCode: 409,
        code: 'CONSENT_ALREADY_DECIDED',
        message: 'You have already responded to this consent request.',
      });
    }
    throw new AppError({
      statusCode: 409,
      code: 'CONSENT_NOT_APPLICABLE',
      message: 'This consent request is no longer awaiting a decision.',
    });
  }

  const [application, rows] = await Promise.all([
    getOwnApplicationOrThrow(auth, decided.application_id),
    listConsentsForApplication({ applicationId: decided.application_id, citizenId: auth.userId }),
  ]);
  return buildPayload({
    applicationId: application.id,
    applicationNumber: application.application_number,
    applicationStatus: application.status,
    serviceId: application.service_id,
    rows,
  });
};
