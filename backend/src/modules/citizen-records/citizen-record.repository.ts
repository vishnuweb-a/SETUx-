import { getDatabaseClient, toAppError } from '../../database/index.js';
import type {
  CitizenRecordFieldRow,
  CitizenRecordRow,
  RecordAuthority,
  RecordSource,
} from './citizen-record.types.js';

/**
 * Persistence for the citizen record registry
 * (Change & Correction Service, Phase 2).
 *
 * ONE rule governs every query in this file, and it is the rule the whole
 * phase's security rests on:
 *
 *   **`citizen_id` is part of the PREDICATE, never a check applied afterwards.**
 *
 * The tempting shape is `findById(recordId)` followed by
 * `if (row.citizen_id !== auth.userId) throw`. It is wrong for two reasons.
 * First, the ownership check then lives in whichever caller remembers to write
 * it, and a future caller that forgets has a cross-citizen read. Second — and
 * this is the one that matters — a row fetched and then rejected has already
 * been fetched: the difference between "no such record" and "somebody else's
 * record" becomes observable in timing and in every log line that names the
 * row. Scoping the query means a record belonging to another citizen is not
 * "denied", it is NOT FOUND, because the query genuinely cannot see it (task
 * §21, and the same posture `findApplicationById` already takes).
 *
 * These queries run through the service-role client and so bypass RLS. RLS
 * remains meaningful: it governs the browser's own Supabase client, which is a
 * separate path with a separate identity (security-design.md §19). The
 * `citizen_id` predicate here is the backend's equivalent of the
 * `citizen_id = (select auth.uid())` in that policy.
 *
 * NOTHING IN THIS FILE WRITES. There is no insert, update, upsert or delete —
 * not disabled, simply absent. Source records reach the database through the
 * migration and the demo provisioner alone (task §22).
 */

/**
 * Columns the API derives its response from, plus the two embedded lookups.
 *
 * `citizen_id`, `data_source_id` and `authority_department_id` are deliberately
 * absent from the projection: the first is already known (it is the predicate),
 * and the other two are internal routing keys a client can neither use nor act
 * on. The source and authority are selected as embedded rows instead, so the
 * response names them rather than exposing a UUID.
 */
const RECORD_COLUMNS =
  'id, record_type, source_record_ref, status, source_version, last_synced_at, ' +
  'is_simulated, created_at, updated_at, ' +
  'data_sources ( code, name ), departments ( code, name )';

/**
 * PostgREST returns an embedded to-one relationship as an object, but types it
 * as possibly an array. Normalizing here rather than at each use keeps the
 * ambiguity in one place.
 */
const firstEmbedded = <T>(value: T | readonly T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return (value as T | null | undefined) ?? null;
};

interface RawRecordRow {
  readonly id: string;
  readonly record_type: string;
  readonly source_record_ref: string;
  readonly status: string;
  readonly source_version: string | null;
  readonly last_synced_at: string | null;
  readonly is_simulated: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly data_sources: RecordSource | readonly RecordSource[] | null;
  readonly departments: RecordAuthority | readonly RecordAuthority[] | null;
}

const toRecordRow = (row: RawRecordRow): CitizenRecordRow => ({
  id: row.id,
  record_type: row.record_type,
  source_record_ref: row.source_record_ref,
  status: row.status,
  source_version: row.source_version,
  last_synced_at: row.last_synced_at,
  is_simulated: row.is_simulated,
  created_at: row.created_at,
  updated_at: row.updated_at,
  source: firstEmbedded(row.data_sources),
  // Genuinely null for the bank, which is a provider rather than a department
  // (arch §20.6). The absence is data, not a failed join.
  authority: firstEmbedded(row.departments),
});

/**
 * Every record belonging to ONE citizen.
 *
 * Ordered `created_at desc`, matching the index
 * `citizen_records_citizen_id_created_at_idx`, so the listing is both
 * deterministic and an index scan rather than a sort.
 */
export const listRecordsByCitizen = async (
  citizenId: string,
): Promise<readonly CitizenRecordRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_records')
    .select(RECORD_COLUMNS)
    .eq('citizen_id', citizenId)
    .order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, 'citizen_records.listRecordsByCitizen', 'Citizen record');
  }

  return ((data ?? []) as unknown as readonly RawRecordRow[]).map(toRecordRow);
};

/**
 * ONE record, by id AND owner, or `null`.
 *
 * Both predicates are in the query. A record id belonging to another citizen
 * matches nothing and returns `null`, which the service turns into the same 404
 * as an id that never existed — so a caller enumerating UUIDs learns nothing
 * about which of them are real.
 *
 * `maybeSingle` is safe rather than merely convenient: `id` is the primary key,
 * so at most one row can match.
 */
export const findRecordForCitizen = async (params: {
  readonly recordId: string;
  readonly citizenId: string;
}): Promise<CitizenRecordRow | null> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_records')
    .select(RECORD_COLUMNS)
    .eq('id', params.recordId)
    .eq('citizen_id', params.citizenId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'citizen_records.findRecordForCitizen', 'Citizen record');
  }

  return data === null ? null : toRecordRow(data as unknown as RawRecordRow);
};

/**
 * The current field values of one record, in a stable order.
 *
 * Takes the OWNER as well as the record id, and re-asserts it through the
 * parent rather than trusting that the caller already checked. The fields
 * endpoint is only ever reached after `findRecordForCitizen` has succeeded, so
 * this second predicate is redundant today — and it is here precisely because
 * "redundant today" is how an ownership check gets dropped tomorrow. The cost
 * is one indexed join; the alternative is a field read whose safety depends on
 * call order.
 *
 * Ordered by `field_key` so a record renders its fields identically on every
 * load rather than reshuffling between requests.
 */
export const listFieldsForCitizenRecord = async (params: {
  readonly recordId: string;
  readonly citizenId: string;
}): Promise<readonly CitizenRecordFieldRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_record_fields')
    .select('field_key, field_value, retrieved_at, citizen_records!inner ( citizen_id )')
    .eq('citizen_record_id', params.recordId)
    .eq('citizen_records.citizen_id', params.citizenId)
    .order('field_key', { ascending: true });

  if (error) {
    throw toAppError(
      error,
      'citizen_record_fields.listFieldsForCitizenRecord',
      'Citizen record field',
    );
  }

  return ((data ?? []) as unknown as readonly CitizenRecordFieldRow[]).map((row) => ({
    field_key: row.field_key,
    field_value: row.field_value,
    retrieved_at: row.retrieved_at,
  }));
};
