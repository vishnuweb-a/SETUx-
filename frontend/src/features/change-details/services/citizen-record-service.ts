import { apiRequest } from '@/services/api-client';
import type { CitizenRecordDetail, CitizenRecordListPayload } from '../types/change-details.types';

/**
 * The citizen record registry, read-only (docs/API/citizen-records.md).
 *
 * Only two functions exist, and both are GETs. There is no create, update or
 * delete here because the API declares no write verb for these resources — and
 * Phase 3 selects fields without proposing a single value. A mutation added to
 * this file would have nothing on the server to call.
 *
 * Neither request sends a citizen identifier. Ownership is a predicate applied
 * server-side from the bearer token; both endpoints reject *any* query
 * parameter with a 400, so `?citizenId=…` is an error rather than a filter
 * someone might believe worked.
 */

export const fetchCitizenRecords = (signal?: AbortSignal): Promise<CitizenRecordListPayload> =>
  apiRequest('/citizen-records', { signal });

export const fetchCitizenRecord = (
  recordId: string,
  signal?: AbortSignal,
): Promise<CitizenRecordDetail> =>
  apiRequest(`/citizen-records/${encodeURIComponent(recordId)}`, { signal });
