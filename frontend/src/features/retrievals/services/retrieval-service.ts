import { apiRequest } from '@/services/api-client';
import type { ApplicationRetrievalPayload } from '../types/retrieval.types';

export const fetchApplicationRetrievals = (
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationRetrievalPayload> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/retrievals`, { signal });

/**
 * Requests one retrieval.
 *
 * The body carries a requirement id and nothing else. The source, the consent
 * and the connector are all resolved by the server from that one identifier —
 * sending more would be sending something the server is right to refuse.
 */
export const createApplicationRetrieval = (
  applicationId: string,
  requirementId: string,
): Promise<ApplicationRetrievalPayload> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/retrievals`, {
    method: 'POST',
    body: JSON.stringify({ requirementId }),
  });
