import { useQuery } from '@tanstack/react-query';
import { fetchCitizenRecord, fetchCitizenRecords } from '../services/citizen-record-service';

/**
 * Query keys for the citizen record registry.
 *
 * No mutation hook lives in this file. Phase 3 reads records and selects field
 * keys; the draft that carries proposed values belongs to the next phase, so
 * there is nothing here to invalidate a cache for.
 */
export const citizenRecordKeys = {
  all: ['citizen-records'] as const,
  lists: () => [...citizenRecordKeys.all, 'list'] as const,
  details: () => [...citizenRecordKeys.all, 'detail'] as const,
  detail: (recordId: string) => [...citizenRecordKeys.details(), recordId] as const,
};

export const useCitizenRecords = () =>
  useQuery({
    queryKey: citizenRecordKeys.lists(),
    queryFn: ({ signal }) => fetchCitizenRecords(signal),
  });

/**
 * One record and the policy governing each of its fields.
 *
 * The detail endpoint already returns per-field policy, so the field list needs
 * no second request — there is deliberately no per-field policy query here,
 * which would be one call per row for data that arrived with the record.
 */
export const useCitizenRecord = (recordId: string) =>
  useQuery({
    queryKey: citizenRecordKeys.detail(recordId),
    queryFn: ({ signal }) => fetchCitizenRecord(recordId, signal),
    enabled: recordId.length > 0,
    // A 404 here means "no record of yours has that id". Retrying cannot change
    // that answer, and the page has a not-found state ready for it.
    retry: false,
  });
