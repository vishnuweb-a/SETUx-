import { getDatabaseClient, toAppError } from '../../database/index.js';
import type {
  EvidenceField,
  RequirementVerification,
  VerificationRow,
  VerifiableRequirement,
} from './verification.types.js';

const VERIFICATION_COLUMNS =
  'id, application_id, verification_type, status, source_id, result, verified_at, created_at';

/**
 * Every requirement of this application's service.
 *
 * Unlike the retrieval module's equivalent, this does NOT filter on
 * `data_source_id`. Verification has to account for every requirement the
 * service asks for, including any that no provider backs — a requirement
 * omitted from the overview would read as one that passed (§8, §42).
 */
export const listVerifiableRequirements = async (
  serviceId: string,
): Promise<readonly VerifiableRequirement[]> => {
  const { data, error } = await getDatabaseClient()
    .from('service_requirements')
    .select('id, requirement_code, name, data_source_id, required, display_order')
    .eq('service_id', serviceId)
    .order('display_order');
  if (error) throw toAppError(error, 'service_requirements.listVerifiable', 'Requirement');

  return (data ?? []).map((row) => ({
    requirementId: row.id,
    requirementCode: row.requirement_code,
    name: row.name,
    dataSourceId: row.data_source_id,
    required: row.required,
    displayOrder: row.display_order,
  }));
};

/**
 * The stored evidence for one application.
 *
 * This is the verification engine's ONLY source of evidence. There is
 * deliberately no connector import in this module and no code path that could
 * add one: Phase 10 judges what Phases 8 and 9 already retrieved, and a
 * verification run that could re-fetch would be able to reach a provider
 * without passing the consent gate that governs retrieval (§18).
 *
 * Both provenances are returned. The rules only consume PROVIDER_RETRIEVAL
 * rows, but a citizen declaration still has to be visible to the loader so a
 * future declaration-backed rule reads it here rather than growing a second
 * evidence path.
 */
export const listEvidenceForApplication = async (
  applicationId: string,
): Promise<readonly EvidenceField[]> => {
  const { data, error } = await getDatabaseClient()
    .from('application_data')
    .select('field_code, field_value, source_id, source_type')
    .eq('application_id', applicationId);
  if (error) throw toAppError(error, 'application_data.listForVerification', 'Application data');

  return (data ?? []).flatMap((row) =>
    typeof row.field_value === 'string'
      ? [
          {
            fieldCode: row.field_code,
            value: row.field_value,
            sourceId: row.source_id,
            sourceType: row.source_type,
          },
        ]
      : [],
  );
};

/** Which requirements already have retrieved evidence. Drives readiness (§9). */
export const listRetrievedRequirementIds = async (
  applicationId: string,
): Promise<ReadonlySet<string>> => {
  const { data, error } = await getDatabaseClient()
    .from('data_retrievals')
    .select('requirement_id')
    .eq('application_id', applicationId)
    .eq('status', 'SUCCESS');
  if (error) throw toAppError(error, 'data_retrievals.listSucceeded', 'Retrieval');

  return new Set(
    (data ?? []).flatMap((row) => (row.requirement_id ? [row.requirement_id] : [])),
  );
};

/** Every verification outcome stored for one application. */
export const listVerificationsForApplication = async (
  applicationId: string,
): Promise<readonly VerificationRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('verifications')
    .select(VERIFICATION_COLUMNS)
    .eq('application_id', applicationId);
  if (error) throw toAppError(error, 'verifications.listForApplication', 'Verification');
  return data ?? [];
};

/**
 * Commits a whole verification run: the lifecycle transition, the verification
 * rows, the evidence statuses and the timeline events, in one transaction.
 *
 * Returns an empty array when the database function's own authorization checks
 * did not pass — the application is not this citizen's, or is no longer
 * SUBMITTED because a concurrent run already moved it. The service maps that to
 * the right error; the function deliberately does not say which check failed.
 */
export const recordVerificationRun = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
  readonly outcomes: readonly RequirementVerification[];
}): Promise<readonly VerificationRow[]> => {
  const { data, error } = await getDatabaseClient().rpc('record_application_verification', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
    p_outcomes: params.outcomes.map((outcome) => ({
      requirementCode: outcome.requirementCode,
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      ruleCode: outcome.ruleCode,
      sourceId: outcome.sourceId,
      // Spread to a mutable array: the domain type is readonly, and `Json` —
      // being the shape that actually crosses the wire — is not.
      fieldCodes: [...outcome.fieldCodes],
    })),
  });
  if (error) throw toAppError(error, 'verifications.recordRun', 'Verification');
  return data ?? [];
};
