import { useQuery } from '@tanstack/react-query';
import { fetchChangeImpact } from '../services/change-impact-service';

export const changeImpactKeys = {
  all: ['change-impact'] as const,
  detail: (changeRequestId: string) => [...changeImpactKeys.all, changeRequestId] as const,
};

/**
 * The impact analysis of one draft (Phase 5).
 *
 * A `useQuery` and deliberately not a `useMutation`, even though the answer is
 * "computed": the endpoint is a safe GET, calling it changes nothing, and
 * modelling it as a mutation would give the cache no key to store it under and
 * would make a refresh re-trigger something that reads as an action.
 *
 * Keyed by the draft's id, so navigating away and back — or opening the URL
 * directly tomorrow — reads the same entry rather than starting from nothing.
 *
 * NOTHING IS INVALIDATED HERE, because nothing is written. The Phase 4 draft
 * mutations own their own cache updates; an impact read has no side effect to
 * reconcile. If the citizen revises the draft, they arrive back at this screen
 * through a navigation that refetches, which is the honest way to get a fresh
 * analysis of changed input.
 */
export const useChangeImpact = (changeRequestId: string) =>
  useQuery({
    queryKey: changeImpactKeys.detail(changeRequestId),
    queryFn: ({ signal }) => fetchChangeImpact(changeRequestId, signal),
    enabled: changeRequestId.length > 0,
  });
