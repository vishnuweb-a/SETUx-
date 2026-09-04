import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { CitizenProfileData } from '../onboarding/onboarding.types.js';
import type { ServiceRequirement } from '../services/service.types.js';
import type { ListApplicationsQuery } from './application.schema.js';
import type { ApplicationRow } from './application.types.js';

const APPLICATION_COLUMNS =
  'id, application_number, citizen_id, service_id, status, submitted_at, created_at, updated_at';

export const insertApplication = async (params: {
  readonly citizenId: string;
  readonly serviceId: string;
}): Promise<ApplicationRow> => {
  const { data, error } = await getDatabaseClient().rpc('create_citizen_application', {
    p_citizen_id: params.citizenId,
    p_service_id: params.serviceId,
  });

  if (error) throw toAppError(error, 'applications.insert', 'Application');
  return data[0]!;
};

export const findApplicationById = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
}): Promise<ApplicationRow | null> => {
  const { data, error } = await getDatabaseClient()
    .from('applications')
    .select(APPLICATION_COLUMNS)
    .eq('id', params.applicationId)
    .eq('citizen_id', params.citizenId)
    .maybeSingle();
  if (error) throw toAppError(error, 'applications.findOwnById', 'Application');
  return data;
};

export const listApplicationsByCitizen = async (params: {
  readonly citizenId: string;
  readonly query: ListApplicationsQuery;
}): Promise<{ readonly rows: readonly ApplicationRow[]; readonly total: number }> => {
  const from = (params.query.page - 1) * params.query.limit;
  let builder = getDatabaseClient()
    .from('applications')
    .select(APPLICATION_COLUMNS, { count: 'exact' })
    .eq('citizen_id', params.citizenId);
  if (params.query.status) builder = builder.eq('status', params.query.status);
  const { data, error, count } = await builder
    .order('updated_at', { ascending: false })
    .range(from, from + params.query.limit - 1);
  if (error) throw toAppError(error, 'applications.listOwn', 'Application');
  return { rows: data ?? [], total: count ?? 0 };
};

export const findCitizenProfileForApplication = async (
  citizenId: string,
): Promise<CitizenProfileData | null> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_profiles')
    .select('full_name, government_id, mobile_number, date_of_birth')
    .eq('user_id', citizenId)
    .maybeSingle();
  if (error) throw toAppError(error, 'citizen_profiles.findForApplication', 'Citizen profile');
  return data
    ? {
        fullName: data.full_name,
        governmentId: data.government_id,
        mobileNumber: data.mobile_number,
        dateOfBirth: data.date_of_birth,
      }
    : null;
};

export const listApplicationFields = async (
  applicationId: string,
): Promise<Readonly<Record<string, string>>> => {
  const { data, error } = await getDatabaseClient()
    .from('application_data')
    .select('field_code, field_value')
    .eq('application_id', applicationId)
    .eq('source_type', 'CITIZEN_DECLARATION')
    .is('source_id', null);
  if (error) throw toAppError(error, 'application_data.listDeclared', 'Application data');
  return Object.fromEntries(
    (data ?? []).flatMap((row) =>
      typeof row.field_value === 'string' ? [[row.field_code, row.field_value]] : [],
    ),
  );
};

export const replaceApplicationFields = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
  readonly fields: Readonly<Record<string, string>>;
}): Promise<void> => {
  const { error } = await getDatabaseClient().rpc('save_citizen_application_draft', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
    p_fields: params.fields,
  });
  if (error) throw toAppError(error, 'applications.saveDraft', 'Application');
};

export const markApplicationSubmitted = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
}): Promise<ApplicationRow | null> => {
  const { data, error } = await getDatabaseClient().rpc('submit_citizen_application', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
  });
  if (error) throw toAppError(error, 'applications.submit', 'Application');
  return data[0] ?? null;
};

export interface ApplicationServiceRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly department: string;
  readonly status: string;
}

export const findServiceForApplication = async (
  serviceId: string,
): Promise<ApplicationServiceRecord | null> => {
  const { data, error } = await getDatabaseClient()
    .from('services')
    .select('id, code, name, department, status')
    .eq('id', serviceId)
    .maybeSingle();
  if (error) throw toAppError(error, 'services.findForApplication', 'Service');
  return data;
};

export const listRequirementsForApplication = async (
  serviceId: string,
): Promise<readonly ServiceRequirement[]> => {
  const { data, error } = await getDatabaseClient()
    .from('service_requirements')
    .select('id, requirement_code, name, description, requirement_type, required, display_order, data_sources ( name )')
    .eq('service_id', serviceId)
    .order('display_order');
  if (error) throw toAppError(error, 'service_requirements.listForApplication', 'Requirement');
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.requirement_code,
    name: row.name,
    description: row.description,
    type: row.requirement_type as ServiceRequirement['type'],
    source: Array.isArray(row.data_sources)
      ? row.data_sources[0]?.name ?? null
      : row.data_sources?.name ?? null,
    required: row.required,
    displayOrder: row.display_order,
  }));
};
