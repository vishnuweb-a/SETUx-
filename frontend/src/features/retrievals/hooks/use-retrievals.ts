import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationKeys } from '@/features/applications';
import {
  createApplicationRetrieval,
  fetchApplicationRetrievals,
} from '../services/retrieval-service';
import type { ApplicationRetrievalPayload } from '../types/retrieval.types';

export const retrievalKeys = {
  all: ['retrievals'] as const,
  application: (applicationId: string) =>
    [...retrievalKeys.all, 'application', applicationId] as const,
};

export const useApplicationRetrievals = (applicationId: string, enabled = true) =>
  useQuery({
    queryKey: retrievalKeys.application(applicationId),
    queryFn: ({ signal }) => fetchApplicationRetrievals(applicationId, signal),
    enabled: enabled && applicationId.length > 0,
  });

/**
 * Performs a retrieval and adopts the server's answer as the new truth.
 *
 * The response carries the whole retrieval set, so the cache is replaced from
 * it rather than patched optimistically. Showing "Retrieved" before the server
 * has actually retrieved anything would tell the citizen their data was fetched
 * when it may not have been — and the failure path is a real one here.
 */
export const useCreateRetrieval = (applicationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: string) =>
      createApplicationRetrieval(applicationId, requirementId),
    onSuccess: (payload: ApplicationRetrievalPayload) => {
      queryClient.setQueryData(retrievalKeys.application(applicationId), payload);
      // The application screens summarize retrieval progress, so they re-read.
      void queryClient.invalidateQueries({ queryKey: applicationKeys.detail(applicationId) });
      // Verification readiness is derived from exactly these retrievals, so a
      // fetch can be the thing that makes an application ready. Without this
      // the citizen retrieves their last document and the overview keeps
      // saying evidence is outstanding until they reload the page by hand
      // (Phase 10 §28).
      // The key is written out rather than imported from the verifications
      // feature: that feature already imports `retrievalKeys` from here, and
      // importing back would make the two modules circular.
      void queryClient.invalidateQueries({
        queryKey: ['verifications', 'application', applicationId],
      });
    },
  });
};
