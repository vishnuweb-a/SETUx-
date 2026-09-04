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
    },
  });
};
