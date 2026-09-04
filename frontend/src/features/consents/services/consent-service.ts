import { apiRequest } from '@/services/api-client';
import type { ApplicationConsentPayload } from '../types/consent.types';

export const fetchApplicationConsents = (
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationConsentPayload> =>
  apiRequest(`/applications/${encodeURIComponent(applicationId)}/consents`, { signal });

/**
 * Grant and deny are distinct endpoints, so a decision cannot be mistyped into
 * the wrong answer by a malformed body. Neither carries one.
 */
export const grantConsent = (consentId: string): Promise<ApplicationConsentPayload> =>
  apiRequest(`/consents/${encodeURIComponent(consentId)}/grant`, { method: 'POST', body: '{}' });

export const denyConsent = (consentId: string): Promise<ApplicationConsentPayload> =>
  apiRequest(`/consents/${encodeURIComponent(consentId)}/deny`, { method: 'POST', body: '{}' });
