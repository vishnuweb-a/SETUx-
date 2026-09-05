import { apiRequest } from '@/services/api-client';
import type {
  ReviewDashboardPayload,
  ReviewDecisionRequest,
  ReviewDetailPayload,
  ReviewQueueFilter,
  ReviewQueuePayload,
} from '../types/government.types';

const BASE = '/government/review';

export const fetchReviewDashboard = (signal?: AbortSignal): Promise<ReviewDashboardPayload> =>
  apiRequest(BASE, { signal });

export const fetchReviewQueue = (
  status: ReviewQueueFilter | undefined,
  signal?: AbortSignal,
): Promise<ReviewQueuePayload> =>
  apiRequest(`${BASE}/applications${status ? `?status=${status}` : ''}`, { signal });

export const fetchReviewDetail = (
  applicationId: string,
  signal?: AbortSignal,
): Promise<ReviewDetailPayload> =>
  apiRequest(`${BASE}/applications/${encodeURIComponent(applicationId)}`, { signal });

/**
 * Records the officer's decision.
 *
 * The body carries the decision and, for a rejection, the reason. It carries no
 * reviewer and no resulting status: the officer's identity comes from the
 * session server-side, and the status is the server's mapping of the decision.
 * Sending either would be rejected outright by the backend's strict schema.
 */
export const submitReviewDecision = (
  applicationId: string,
  request: ReviewDecisionRequest,
): Promise<ReviewDetailPayload> =>
  apiRequest(`${BASE}/applications/${encodeURIComponent(applicationId)}/decision`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
