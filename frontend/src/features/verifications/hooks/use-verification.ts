import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationKeys } from '@/features/applications';
import { retrievalKeys } from '@/features/retrievals';
import {
  fetchApplicationVerification,
  startApplicationVerification,
} from '../services/verification-service';
import type { ApplicationVerificationPayload } from '../types/verification.types';

export const verificationKeys = {
  all: ['verifications'] as const,
  application: (applicationId: string) =>
    [...verificationKeys.all, 'application', applicationId] as const,
};

export const useApplicationVerification = (applicationId: string, enabled = true) =>
  useQuery({
    queryKey: verificationKeys.application(applicationId),
    queryFn: ({ signal }) => fetchApplicationVerification(applicationId, signal),
    enabled: enabled && applicationId.length > 0,
  });

/**
 * Runs verification and adopts the server's answer as the new truth.
 *
 * The response carries the whole verification state, so the cache is replaced
 * from it rather than patched optimistically. There is no honest optimistic
 * value to write here: the outcome of a rule is not knowable in the browser,
 * and showing "Verified" before the server has evaluated anything would state a
 * conclusion SetuX has not reached (§28).
 *
 * A successful run also moves the application to VERIFICATION and stamps the
 * evidence it judged, so both of those queries are re-read rather than left
 * showing the pre-run state.
 */
export const useStartVerification = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startApplicationVerification(applicationId),
    onSuccess: (payload: ApplicationVerificationPayload) => {
      queryClient.setQueryData(verificationKeys.application(applicationId), payload);
      void queryClient.invalidateQueries({ queryKey: applicationKeys.detail(applicationId) });
      void queryClient.invalidateQueries({ queryKey: retrievalKeys.application(applicationId) });
    },
  });
};
