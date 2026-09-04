import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationKeys } from '@/features/applications';
import { denyConsent, fetchApplicationConsents, grantConsent } from '../services/consent-service';
import type { ApplicationConsentPayload } from '../types/consent.types';

export const consentKeys = {
  all: ['consents'] as const,
  application: (applicationId: string) => [...consentKeys.all, 'application', applicationId] as const,
};

export const useApplicationConsents = (applicationId: string) =>
  useQuery({
    queryKey: consentKeys.application(applicationId),
    queryFn: ({ signal }) => fetchApplicationConsents(applicationId, signal),
    enabled: applicationId.length > 0,
  });

/**
 * Records a decision and adopts the server's answer as the new truth.
 *
 * The response carries the whole consent set, so the cache is replaced from it
 * rather than patched optimistically. A consent decision is an authorization
 * boundary: showing "Granted" before the server has agreed would be showing the
 * citizen something that is not yet true.
 */
export const useDecideConsent = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ consentId, granted }: { readonly consentId: string; readonly granted: boolean }) =>
      granted ? grantConsent(consentId) : denyConsent(consentId),
    onSuccess: (payload: ApplicationConsentPayload) => {
      queryClient.setQueryData(consentKeys.application(applicationId), payload);
      // The application screens surface "Consent required", so they have to
      // re-read once a decision changes it.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.detail(applicationId) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
};
