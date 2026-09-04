import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { CreateApplicationInput, ListApplicationsQuery, UpdateApplicationInput } from './application.schema.js';
import {
  findApplicationById,
  findCitizenProfileForApplication,
  findServiceForApplication,
  insertApplication,
  listApplicationFields,
  listApplicationsByCitizen,
  listRequirementsForApplication,
  markApplicationSubmitted,
  replaceApplicationFields,
} from './application.repository.js';
import { APPLICATION_STATUS, type ApplicationDetail, type ApplicationListPayload, type ApplicationRow, type ApplicationSummary } from './application.types.js';

const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();
  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({ statusCode: 403, code: 'APPLICATION_ONBOARDING_REQUIRED', message: 'Complete citizen onboarding before managing applications.' });
  }
};

const getServiceOrThrow = async (serviceId: string, mustBeActive = false) => {
  const service = await findServiceForApplication(serviceId);
  if (!service || (mustBeActive && service.status !== 'ACTIVE')) throw new NotFoundError('Service');
  return { id: service.id, code: service.code, name: service.name, department: service.department };
};

const getOwnApplicationOrThrow = async (auth: AuthContext, applicationId: string) => {
  const application = await findApplicationById({ applicationId, citizenId: auth.userId });
  if (!application) throw new NotFoundError('Application');
  return application;
};

const toSummary = async (row: ApplicationRow): Promise<ApplicationSummary> => ({
  id: row.id,
  applicationNumber: row.application_number,
  service: await getServiceOrThrow(row.service_id),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
});

export const createApplication = async (auth: AuthContext, input: CreateApplicationInput): Promise<ApplicationDetail> => {
  assertCompletedCitizen(auth);
  await getServiceOrThrow(input.service_id, true);
  let row: ApplicationRow;
  try {
    row = await insertApplication({ citizenId: auth.userId, serviceId: input.service_id });
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new AppError({ statusCode: 409, code: 'APPLICATION_DUPLICATE_ACTIVE', message: 'You already have an active application for this service.' });
    }
    throw error;
  }
  return getApplication(auth, row.id);
};

export const listApplications = async (auth: AuthContext, query: ListApplicationsQuery): Promise<ApplicationListPayload> => {
  assertCompletedCitizen(auth);
  const { rows, total } = await listApplicationsByCitizen({ citizenId: auth.userId, query });
  return { items: await Promise.all(rows.map(toSummary)), page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
};

export const getApplication = async (auth: AuthContext, applicationId: string): Promise<ApplicationDetail> => {
  assertCompletedCitizen(auth);
  const row = await getOwnApplicationOrThrow(auth, applicationId);
  const [summary, applicant, requirements, fields] = await Promise.all([
    toSummary(row),
    findCitizenProfileForApplication(auth.userId),
    listRequirementsForApplication(row.service_id),
    listApplicationFields(row.id),
  ]);
  if (!applicant) throw new AppError({ statusCode: 403, code: 'APPLICATION_ONBOARDING_REQUIRED', message: 'Complete citizen onboarding before managing applications.' });
  return { ...summary, applicant, requirements, fields };
};

const validateDeclarationFields = (requirements: readonly { readonly code: string; readonly type: string; readonly required: boolean }[], fields: Readonly<Record<string, string>>, requireComplete: boolean): void => {
  const declarations = requirements.filter((requirement) => requirement.type === 'DECLARATION');
  const allowed = new Set(declarations.map((requirement) => requirement.code));
  const unknown = Object.keys(fields).find((code) => !allowed.has(code));
  if (unknown) throw new AppError({ statusCode: 422, code: 'APPLICATION_VALIDATION_ERROR', message: 'The application contains a field that is not accepted for this service.', details: { [unknown]: 'This field is not part of the application.' }, exposeDetails: true });
  if (!requireComplete) return;
  const missing = declarations.find((requirement) => requirement.required && !fields[requirement.code]?.trim());
  if (missing) throw new AppError({ statusCode: 422, code: 'APPLICATION_NOT_READY', message: 'Complete all required declarations before submitting.', details: { [missing.code]: 'This declaration is required.' }, exposeDetails: true });
};

export const updateDraftApplication = async (auth: AuthContext, applicationId: string, input: UpdateApplicationInput): Promise<ApplicationDetail> => {
  assertCompletedCitizen(auth);
  const row = await getOwnApplicationOrThrow(auth, applicationId);
  if (row.status !== APPLICATION_STATUS.DRAFT) throw new AppError({ statusCode: 409, code: 'APPLICATION_INVALID_STATE', message: 'Only draft applications can be updated.' });
  const requirements = await listRequirementsForApplication(row.service_id);
  validateDeclarationFields(requirements, input.fields, false);
  await replaceApplicationFields({ applicationId, citizenId: auth.userId, fields: input.fields });
  return getApplication(auth, applicationId);
};

export const submitApplication = async (auth: AuthContext, applicationId: string): Promise<ApplicationDetail> => {
  assertCompletedCitizen(auth);
  const current = await getOwnApplicationOrThrow(auth, applicationId);
  if (current.status === APPLICATION_STATUS.SUBMITTED) throw new AppError({ statusCode: 409, code: 'APPLICATION_ALREADY_SUBMITTED', message: 'This application has already been submitted.' });
  if (current.status !== APPLICATION_STATUS.DRAFT) throw new AppError({ statusCode: 409, code: 'APPLICATION_INVALID_STATE', message: 'The application cannot be submitted in its current state.' });
  const [requirements, fields] = await Promise.all([listRequirementsForApplication(current.service_id), listApplicationFields(applicationId)]);
  validateDeclarationFields(requirements, fields, true);
  const submitted = await markApplicationSubmitted({ applicationId, citizenId: auth.userId });
  if (!submitted) throw new AppError({ statusCode: 409, code: 'APPLICATION_INVALID_STATE', message: 'The application changed before it could be submitted.' });
  return getApplication(auth, applicationId);
};
