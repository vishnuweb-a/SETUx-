import { apiRequest } from '@/services/api-client';
import type { ApplicationVerificationPayload } from '../types/verification.types';

export const fetchApplicationVerification = (
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationVerificationPayload> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/verification`, { signal });

/**
 * Starts the verification run.
 *
 * No body at all — and that is the whole point. The server derives every
 * authoritative input: the application from the URL and the session, the
 * requirements from the service, the evidence from stored rows, and the outcome
 * from the rules. There is nothing a client could legitimately contribute, so a
 * body carrying `status`, `verified`, `approved`, `outcome`, `citizenId`,
 * `forcePass` or `forceFail` is rejected with a 400 rather than ignored (§18).
 */
export const startApplicationVerification = (
  applicationId: string,
): Promise<ApplicationVerificationPayload> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/verification`, {
    method: 'POST',
  });
