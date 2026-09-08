import { getDatabaseClient, toAppError } from '../../database/index.js';
import type {
  ChangeRequestFieldRow,
  ChangeRequestRow,
  ResolvedChangeField,
} from './change-request.types.js';

/**
 * Persistence for the change draft
 * (Change & Correction Service, Phase 4).
 *
 * Two rules govern every query in this file.
 *
 * **1. `citizen_id` is part of the PREDICATE, never a check applied afterwards.**
 *
 * The same rule the Phase 2 repository states, for the same two reasons: an
 * ownership check written in the caller lives only in the callers that remember
 * it, and a row fetched and then rejected has already been fetched — the
 * difference between "no such draft" and "somebody else's draft" becomes
 * observable in timing and in every log line naming the row. Scoping the query
 * means another citizen's draft is NOT FOUND, because the query genuinely
 * cannot see it.
 *
 * **2. THIS FILE NEVER WRITES TO `citizen_records` OR `citizen_record_fields`.**
 *
 * Not disabled, not guarded — absent. There is no insert, update, upsert or
 * delete against either table anywhere below, and a reader can verify that by
 * searching this file for their names: they appear only in a SELECT that reads
 * the source value in order to snapshot it. A citizen's proposal changes what
 * SetuX has been asked for. It does not change what the government holds (arch
 * §13).
 *
 * These queries run through the service-role client and so bypass RLS. RLS
 * remains meaningful: it governs the browser's own Supabase client, which is a
 * separate path with a separate identity. The `citizen_id` predicate here is
 * the backend's equivalent of the `citizen_id = (select auth.uid())` in that
 * policy.
 */

/**
 * Columns the API derives a draft from.
 *
 * `citizen_id` is deliberately absent from the projection: it is already known,
 * because it is the predicate that fetched the row.
 */
const REQUEST_COLUMNS =
  'id, request_number, citizen_id, source_record_id, status, created_at, updated_at';

const FIELD_COLUMNS =
  'field_key, old_value, proposed_value, policy_snapshot, reason, created_at, updated_at';

/**
 * The source field rows for a set of keys within ONE record owned by ONE
 * citizen.
 *
 * This is the only read of `citizen_record_fields` in the module, and it exists
 * for one purpose: to obtain `old_value` from the database rather than from the
 * request body (arch §4.5).
 *
 * Three predicates, and each is load-bearing:
 *
 *   `citizen_record_id`            the field must be on the named record
 *   `citizen_records.citizen_id`   that record must belong to the caller
 *   `field_key in (…)`             only the fields actually requested
 *
 * The middle one is what makes a field key from another citizen's record
 * unreachable rather than merely unauthorized, and it is enforced through an
 * inner join on the parent rather than a second round trip, so the ownership
 * check cannot be separated from the read it protects.
 *
 * A key that matches nothing is simply absent from the result. The service
 * compares what it asked for against what came back and refuses the difference
 * — silently proceeding with the fields that happened to exist would create a
 * draft that quietly omits part of what the citizen asked for.
 */
export const listSourceFieldsForRecord = async (params: {
  readonly recordId: string;
  readonly citizenId: string;
  readonly fieldKeys: readonly string[];
}): Promise<readonly { readonly id: string; readonly field_key: string; readonly field_value: unknown }[]> => {
  const { data, error } = await getDatabaseClient()
    .from('citizen_record_fields')
    .select('id, field_key, field_value, citizen_records!inner ( citizen_id )')
    .eq('citizen_record_id', params.recordId)
    .eq('citizen_records.citizen_id', params.citizenId)
    .in('field_key', [...params.fieldKeys]);

  if (error) {
    throw toAppError(
      error,
      'citizen_record_fields.listSourceFieldsForRecord',
      'Citizen record field',
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    field_key: row.field_key,
    field_value: row.field_value,
  }));
};

/**
 * Creates a draft and its fields.
 *
 * Two statements rather than one, because PostgREST has no multi-table
 * transaction: the parent is inserted, then the fields. The ordering is what
 * makes a partial failure safe — a parent with no fields is a recoverable,
 * visible state (the service deletes it below and the citizen sees a plain
 * error), whereas fields with no parent are impossible, since the FK would
 * reject them.
 *
 * `request_number` and `status` are NOT passed. The first is a column default
 * computed by `next_change_request_number()`; the second defaults to DRAFT.
 * Both are omitted rather than set, so there is no code path in which a value
 * for either could originate anywhere but the database.
 */
export const insertChangeRequest = async (params: {
  readonly citizenId: string;
  readonly sourceRecordId: string;
}): Promise<ChangeRequestRow> => {
  const { data, error } = await getDatabaseClient()
    .from('change_requests')
    .insert({ citizen_id: params.citizenId, source_record_id: params.sourceRecordId })
    .select(REQUEST_COLUMNS)
    .single();

  if (error) {
    throw toAppError(error, 'change_requests.insertChangeRequest', 'Change request');
  }

  return data as ChangeRequestRow;
};

/**
 * Writes the requested corrections of one draft.
 *
 * One statement for the whole set rather than a loop: N inserts is N round
 * trips for a single logical write, and any of them failing would leave a draft
 * holding an arbitrary prefix of what the citizen asked for
 * (data-batch-inserts.md).
 */
export const insertChangeRequestFields = async (params: {
  readonly changeRequestId: string;
  readonly fields: readonly ResolvedChangeField[];
}): Promise<void> => {
  if (params.fields.length === 0) return;

  const { error } = await getDatabaseClient()
    .from('change_request_fields')
    .insert(
      params.fields.map((field) => ({
        change_request_id: params.changeRequestId,
        citizen_record_field_id: field.citizenRecordFieldId,
        field_key: field.fieldKey,
        old_value: field.oldValue as never,
        proposed_value: field.proposedValue as never,
        policy_snapshot: field.policySnapshot as never,
        reason: field.reason,
      })),
    );

  if (error) {
    throw toAppError(
      error,
      'change_request_fields.insertChangeRequestFields',
      'Change request field',
    );
  }
};

/**
 * Removes a parent whose fields could not be written.
 *
 * The compensating half of the two-statement create. Scoped by owner as well as
 * id — a cleanup path is exactly where an unscoped delete gets written, and an
 * unscoped one here would take a `changeRequestId` and remove it whoever it
 * belonged to.
 *
 * Deleting cascades to `change_request_fields`, which is correct: the rows being
 * discarded are the partial write that failed.
 */
export const deleteChangeRequest = async (params: {
  readonly changeRequestId: string;
  readonly citizenId: string;
}): Promise<void> => {
  const { error } = await getDatabaseClient()
    .from('change_requests')
    .delete()
    .eq('id', params.changeRequestId)
    .eq('citizen_id', params.citizenId);

  if (error) {
    throw toAppError(error, 'change_requests.deleteChangeRequest', 'Change request');
  }
};

/**
 * ONE draft, by id AND owner, or `null`.
 *
 * Both predicates are in the query, so a draft belonging to another citizen
 * matches nothing and the service turns that into the same 404 as an id that
 * never existed.
 *
 * `maybeSingle` is safe rather than merely convenient: `id` is the primary key.
 */
export const findChangeRequestForCitizen = async (params: {
  readonly changeRequestId: string;
  readonly citizenId: string;
}): Promise<ChangeRequestRow | null> => {
  const { data, error } = await getDatabaseClient()
    .from('change_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', params.changeRequestId)
    .eq('citizen_id', params.citizenId)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'change_requests.findChangeRequestForCitizen', 'Change request');
  }

  return (data as ChangeRequestRow | null) ?? null;
};

/**
 * The requested corrections of one draft, in a stable order.
 *
 * Takes the OWNER as well as the request id and re-asserts it through the
 * parent, rather than trusting that the caller already checked. Redundant
 * today, because every caller reaches here after
 * `findChangeRequestForCitizen` — and here precisely because "redundant today"
 * is how an ownership check gets dropped tomorrow. The cost is one indexed
 * join; the alternative is a read whose safety depends on call order.
 *
 * Ordered by `field_key` so a draft renders identically on every load rather
 * than reshuffling between requests.
 */
export const listFieldsForChangeRequest = async (params: {
  readonly changeRequestId: string;
  readonly citizenId: string;
}): Promise<readonly ChangeRequestFieldRow[]> => {
  const { data, error } = await getDatabaseClient()
    .from('change_request_fields')
    .select(`${FIELD_COLUMNS}, change_requests!inner ( citizen_id )`)
    .eq('change_request_id', params.changeRequestId)
    .eq('change_requests.citizen_id', params.citizenId)
    .order('field_key', { ascending: true });

  if (error) {
    throw toAppError(
      error,
      'change_request_fields.listFieldsForChangeRequest',
      'Change request field',
    );
  }

  return ((data ?? []) as unknown as readonly ChangeRequestFieldRow[]).map((row) => ({
    field_key: row.field_key,
    old_value: row.old_value,
    proposed_value: row.proposed_value,
    policy_snapshot: row.policy_snapshot,
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Replaces the proposed value of one field that is ALREADY in the draft.
 *
 * `proposed_value` and `reason` are what a revision may change: both are the
 * citizen's own account of their request.
 *
 * `old_value`, `policy_snapshot` and `citizen_record_field_id` are NOT in the
 * update payload, and their absence is the phase's central invariant expressed
 * as code: a revision changes what the citizen is asking for and leaves
 * untouched what the source said when they asked (task §14). A snapshot that
 * moved with each edit would not be a snapshot.
 *
 * Scoped through the parent by owner, so a field id from another citizen's
 * draft updates nothing.
 */
export const updateProposedValue = async (params: {
  readonly changeRequestId: string;
  readonly citizenId: string;
  readonly fieldKey: string;
  readonly proposedValue: unknown;
  readonly reason: string | null;
}): Promise<void> => {
  const { error } = await getDatabaseClient()
    .from('change_request_fields')
    .update({ proposed_value: params.proposedValue as never, reason: params.reason })
    .eq('change_request_id', params.changeRequestId)
    .eq('field_key', params.fieldKey);

  if (error) {
    throw toAppError(error, 'change_request_fields.updateProposedValue', 'Change request field');
  }
};

/**
 * Removes fields the citizen dropped from the draft.
 *
 * Part of the replacement semantics a PATCH carries: the form submits the whole
 * field set, so a field no longer in it is one the citizen deselected. Scoped
 * to the request, which the service has already resolved by owner.
 *
 * Note this deletes a REQUEST row, never a source row. `change_request_fields`
 * is the citizen's own working document; `citizen_record_fields` is the
 * government's record, and nothing in this module deletes from it.
 */
export const deleteChangeRequestFields = async (params: {
  readonly changeRequestId: string;
  readonly fieldKeys: readonly string[];
}): Promise<void> => {
  if (params.fieldKeys.length === 0) return;

  const { error } = await getDatabaseClient()
    .from('change_request_fields')
    .delete()
    .eq('change_request_id', params.changeRequestId)
    .in('field_key', [...params.fieldKeys]);

  if (error) {
    throw toAppError(
      error,
      'change_request_fields.deleteChangeRequestFields',
      'Change request field',
    );
  }
};

/**
 * Marks a draft as touched when only its children changed.
 *
 * A PATCH that revises a field updates `change_request_fields` and leaves the
 * parent row untouched, so its `updated_at` trigger never fires and the draft
 * appears not to have been edited. Writing the parent's own `updated_at`
 * explicitly keeps "when was this draft last worked on?" answerable from the
 * draft rather than from a scan of its children.
 */
export const touchChangeRequest = async (params: {
  readonly changeRequestId: string;
  readonly citizenId: string;
}): Promise<void> => {
  const { error } = await getDatabaseClient()
    .from('change_requests')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.changeRequestId)
    .eq('citizen_id', params.citizenId);

  if (error) {
    throw toAppError(error, 'change_requests.touchChangeRequest', 'Change request');
  }
};
