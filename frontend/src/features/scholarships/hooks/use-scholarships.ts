import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchScholarship,
  fetchScholarshipDepartments,
  fetchScholarships,
} from '../services/scholarship-service';
import type { ScholarshipListQuery } from '../types/scholarship.types';

/**
 * Catalogue queries.
 *
 * Server state lives in TanStack Query and nowhere else — there is no context
 * or store mirroring it, because a second copy of the catalogue is a second
 * thing that can be stale (Phase 5 §35).
 */

/**
 * Query keys.
 *
 * Hierarchical, so `['scholarships']` invalidates every list and detail at
 * once while `['scholarships', 'list', filters]` caches each filter
 * combination separately — going back to an earlier search is then a cache
 * read rather than a refetch.
 */
export const scholarshipKeys = {
  all: ['scholarships'] as const,
  lists: () => [...scholarshipKeys.all, 'list'] as const,
  list: (query: ScholarshipListQuery) => [...scholarshipKeys.lists(), query] as const,
  departments: () => [...scholarshipKeys.all, 'departments'] as const,
  details: () => [...scholarshipKeys.all, 'detail'] as const,
  detail: (id: string) => [...scholarshipKeys.details(), id] as const,
};

/**
 * One page of the catalogue.
 *
 * `keepPreviousData` is what stops the grid from collapsing to a skeleton on
 * every keystroke or page change: the previous page stays on screen, marked
 * stale, until the next one arrives. Without it, typing in the search box makes
 * the whole page flicker.
 */
export const useScholarships = (query: ScholarshipListQuery) =>
  useQuery({
    queryKey: scholarshipKeys.list(query),
    queryFn: ({ signal }) => fetchScholarships(query, signal),
    placeholderData: keepPreviousData,
  });

/**
 * The department filter's options.
 *
 * Reference data that changes about as often as the catalogue itself, so it is
 * held far longer than the default 30 seconds rather than refetched alongside
 * every list request.
 */
export const useScholarshipDepartments = () =>
  useQuery({
    queryKey: scholarshipKeys.departments(),
    queryFn: ({ signal }) => fetchScholarshipDepartments(signal),
    staleTime: 5 * 60_000,
  });

/**
 * One scholarship with its requirements.
 *
 * A 404 is a legitimate answer here — an id that names nothing, or names an
 * unpublished service — and the shared query client already declines to retry
 * 4xx, so the not-found screen appears immediately rather than after three
 * attempts.
 */
export const useScholarship = (scholarshipId: string) =>
  useQuery({
    queryKey: scholarshipKeys.detail(scholarshipId),
    queryFn: ({ signal }) => fetchScholarship(scholarshipId, signal),
    enabled: scholarshipId.length > 0,
  });
