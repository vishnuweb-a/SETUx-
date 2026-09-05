import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchReviewDashboard,
  fetchReviewDetail,
  fetchReviewQueue,
  submitReviewDecision,
} from '../services/government-service';
import type {
  ReviewDecisionRequest,
  ReviewDetailPayload,
  ReviewQueueFilter,
} from '../types/government.types';

export const reviewKeys = {
  all: ['government', 'review'] as const,
  dashboard: () => [...reviewKeys.all, 'dashboard'] as const,
  queue: (status: ReviewQueueFilter | undefined) => [...reviewKeys.all, 'queue', status ?? 'all'] as const,
  detail: (applicationId: string) => [...reviewKeys.all, 'detail', applicationId] as const,
};

export const useReviewDashboard = () =>
  useQuery({
    queryKey: reviewKeys.dashboard(),
    queryFn: ({ signal }) => fetchReviewDashboard(signal),
  });

export const useReviewQueue = (status: ReviewQueueFilter | undefined) =>
  useQuery({
    queryKey: reviewKeys.queue(status),
    queryFn: ({ signal }) => fetchReviewQueue(status, signal),
  });

export const useReviewDetail = (applicationId: string) =>
  useQuery({
    queryKey: reviewKeys.detail(applicationId),
    queryFn: ({ signal }) => fetchReviewDetail(applicationId, signal),
    enabled: applicationId.length > 0,
  });

/**
 * Records a decision and adopts the server's answer as the new truth.
 *
 * There is deliberately NO optimistic update here. Writing APPROVED into the
 * cache before the server has committed would show the officer a decision that
 * may not have persisted — and a decision is exactly the thing that must not be
 * displayed until it is durable. The response carries the re-read detail, so
 * the cache is replaced from it (§14).
 *
 * The queue and dashboard both change as a result — one row leaves "awaiting
 * review" and a count moves — so both are invalidated rather than left showing
 * a state the decision has already made stale.
 */
export const useSubmitDecision = (applicationId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ReviewDecisionRequest) => submitReviewDecision(applicationId, request),
    onSuccess: (payload: ReviewDetailPayload) => {
      queryClient.setQueryData(reviewKeys.detail(applicationId), payload);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
    },
  });
};
