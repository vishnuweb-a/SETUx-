import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { RetrievableRequirement, RetrievalRow } from './retrieval.types.js';

const RETRIEVAL_COLUMNS =
  'id, application_id, data_source_id, consent_id, requirement_id, request_reference, status, attempt_number, response_metadata, error_code, error_message, completed_at, created_at';

/**
 * Every requirement of this application's service that names a data source,
 * paired with the consent covering that source.
 *
 * `consents` keys on `data_source_id`, not on `requirement_id`, so there is no
 * foreign key from `service_requirements` to `consents` for PostgREST to embed
 * across. The two are read separately and matched on the data source they share
 * — the same source-level scope Phase 7 recorded the consent against
 * (retrievals.md §4), so a grant for one source cannot authorize another.
 *
 * The consent read is scoped by `citizen_id` as well as `application_id`.
 * `consents_application_source_unique` already makes at most one row match per
 * source, and the extra predicate means a consent that somehow belonged to
 * another citizen could not satisfy this lookup.
 */
export const listRetrievableRequirements = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
  readonly serviceId: string;
}): Promise<readonly RetrievableRequirement[]> => {
  const client = getDatabaseClient();

  const { data, error } = await client
    .from('service_requirements')
    .select('id, requirement_code, name, display_order, data_source_id, data_sources ( code, name )')
    .eq('service_id', params.serviceId)
    .not('data_source_id', 'is', null)
    .order('display_order');
  if (error) throw toAppError(error, 'service_requirements.listRetrievable', 'Requirement');

  const { data: consentRows, error: consentError } = await client
    .from('consents')
    .select('data_source_id, status')
    .eq('application_id', params.applicationId)
    .eq('citizen_id', params.citizenId);
  if (consentError) {
    throw toAppError(consentError, 'consents.listForRetrievable', 'Consent');
  }

  const consentBySource = new Map(
    (consentRows ?? []).map((row) => [row.data_source_id, row.status] as const),
  );

  return (data ?? []).flatMap((row) => {
    const source = Array.isArray(row.data_sources) ? row.data_sources[0] : row.data_sources;
    if (!row.data_source_id || !source) return [];
    return [
      {
        requirementId: row.id,
        requirementCode: row.requirement_code,
        information: row.name,
        dataSourceId: row.data_source_id,
        sourceCode: source.code,
        sourceName: source.name,
        consentStatus: consentBySource.get(row.data_source_id) ?? null,
        displayOrder: row.display_order,
      },
    ];
  });
};

/**
 * Every retrieval attempt for one application, newest first.
 *
 * The whole history is returned, not just the latest per requirement, because
 * `attempt_number` and the failure rows are the audit trail the retry semantics
 * are built on. The service reduces it to one current state per requirement.
 */
export const listRetrievalsForApplication = async (
  applicationId: string,
): Promise<readonly RetrievalRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('data_retrievals')
    .select(RETRIEVAL_COLUMNS)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });
  if (error) throw toAppError(error, 'data_retrievals.listForApplication', 'Retrieval');
  return data ?? [];
};

/** The normalized values already stored for this application by a provider. */
export const listRetrievedFields = async (
  applicationId: string,
): Promise<readonly { readonly fieldCode: string; readonly value: string; readonly sourceId: string }[]> => {
  const { data, error } = await getDatabaseClient()
    .from('application_data')
    .select('field_code, field_value, source_id')
    .eq('application_id', applicationId)
    .eq('source_type', 'PROVIDER_RETRIEVAL');
  if (error) throw toAppError(error, 'application_data.listRetrieved', 'Application data');
  return (data ?? []).flatMap((row) =>
    typeof row.field_value === 'string' && row.source_id
      ? [{ fieldCode: row.field_code, value: row.field_value, sourceId: row.source_id }]
      : [],
  );
};

/**
 * Commits a successful retrieval: the attempt row, the normalized values and
 * the timeline event, in one transaction.
 *
 * Returns `null` when the database function's own authorization checks did not
 * pass — the application is not this citizen's, is not SUBMITTED, the
 * requirement does not belong to its service, or the consent is not GRANTED.
 * The service maps that to the right error; the function deliberately does not
 * say which check failed.
 */
export const recordRetrievalSuccess = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
  readonly requirementId: string;
  readonly requestReference: string;
  readonly values: Readonly<Record<string, string>>;
  /**
   * Display metadata about the attempt — document type, issuer, field labels.
   * Never the retrieved values themselves; those go to `application_data`,
   * where RLS governs who may read them.
   */
  readonly responseMetadata: {
    readonly documentType: string;
    readonly issuer: string;
    readonly issuedOn: string;
    readonly labels: Readonly<Record<string, string>>;
    readonly simulated: boolean;
  };
}): Promise<RetrievalRow | null> => {
  const { data, error } = await getDatabaseClient().rpc('record_application_retrieval', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
    p_requirement_id: params.requirementId,
    p_request_reference: params.requestReference,
    p_values: params.values,
    p_response_metadata: params.responseMetadata,
  });
  if (error) throw toAppError(error, 'retrievals.recordSuccess', 'Retrieval');
  return data[0] ?? null;
};

/**
 * Records a failed attempt. Writes no `application_data` — a provider that
 * failed supplied nothing (Phase 8 §26).
 */
export const recordRetrievalFailure = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
  readonly requirementId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
}): Promise<RetrievalRow | null> => {
  const { data, error } = await getDatabaseClient().rpc('record_application_retrieval_failure', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
    p_requirement_id: params.requirementId,
    p_error_code: params.errorCode,
    p_error_message: params.errorMessage,
  });
  if (error) throw toAppError(error, 'retrievals.recordFailure', 'Retrieval');
  return data[0] ?? null;
};
