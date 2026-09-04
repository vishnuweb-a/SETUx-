import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { ConsentRow } from './consent.types.js';

const CONSENT_COLUMNS =
  'id, application_id, citizen_id, data_source_id, purpose, status, decided_at, granted_at, created_at, updated_at';

/**
 * Creates the consent requests a submitted application needs, and returns the
 * full set for that application.
 *
 * Both the derivation (which sources) and the ownership check live inside the
 * database function, so nothing about *what* is being requested comes from the
 * client. Returns an empty array when the application is not this citizen's or
 * is not SUBMITTED — the caller turns that into the right error.
 */
export const prepareConsentsForApplication = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
}): Promise<readonly ConsentRow[]> => {
  const { data, error } = await getDatabaseClient().rpc('prepare_application_consents', {
    p_application_id: params.applicationId,
    p_citizen_id: params.citizenId,
  });
  if (error) throw toAppError(error, 'consents.prepare', 'Consent');
  return data ?? [];
};

export const listConsentsForApplication = async (params: {
  readonly applicationId: string;
  readonly citizenId: string;
}): Promise<readonly ConsentRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('consents')
    .select(CONSENT_COLUMNS)
    .eq('application_id', params.applicationId)
    .eq('citizen_id', params.citizenId)
    .order('created_at');
  if (error) throw toAppError(error, 'consents.listForApplication', 'Consent');
  return data ?? [];
};

export const findConsentById = async (params: {
  readonly consentId: string;
  readonly citizenId: string;
}): Promise<ConsentRow | null> => {
  const { data, error } = await getDatabaseClient()
    .from('consents')
    .select(CONSENT_COLUMNS)
    .eq('id', params.consentId)
    // Scoped to the caller, so another citizen's consent reads as absent
    // rather than as forbidden (Phase 6 concealment pattern).
    .eq('citizen_id', params.citizenId)
    .maybeSingle();
  if (error) throw toAppError(error, 'consents.findOwnById', 'Consent');
  return data;
};

/**
 * Records the citizen's decision.
 *
 * Returns `null` when no PENDING consent matched — an already-decided consent,
 * one belonging to someone else, or one whose application is no longer
 * submitted. The service maps that to a deterministic conflict rather than
 * retrying.
 */
export const decideConsent = async (params: {
  readonly consentId: string;
  readonly citizenId: string;
  readonly granted: boolean;
}): Promise<ConsentRow | null> => {
  const { data, error } = await getDatabaseClient().rpc('decide_application_consent', {
    p_consent_id: params.consentId,
    p_citizen_id: params.citizenId,
    p_granted: params.granted,
  });
  if (error) throw toAppError(error, 'consents.decide', 'Consent');
  return data[0] ?? null;
};

export interface ConsentDataSourceRecord {
  readonly dataSourceId: string;
  readonly information: string;
  readonly description: string | null;
  readonly source: string;
}

/**
 * The display context for each requested item, keyed by data source.
 *
 * The name the citizen reads ("Income Certificate") and the system it comes
 * from ("Income & Revenue Department (Mock)") are both configured rows. Neither
 * is invented in the frontend (Phase 7 §28).
 */
export const listConsentSourcesForService = async (
  serviceId: string,
): Promise<readonly ConsentDataSourceRecord[]> => {
  const { data, error } = await getDatabaseClient()
    .from('service_requirements')
    .select('name, description, data_source_id, display_order, data_sources ( name )')
    .eq('service_id', serviceId)
    .not('data_source_id', 'is', null)
    .order('display_order');
  if (error) throw toAppError(error, 'service_requirements.listConsentSources', 'Requirement');
  return (data ?? []).flatMap((row) => {
    const source = Array.isArray(row.data_sources) ? row.data_sources[0] : row.data_sources;
    if (!row.data_source_id || !source) return [];
    return [
      {
        dataSourceId: row.data_source_id,
        information: row.name,
        description: row.description,
        source: source.name,
      },
    ];
  });
};
