import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
// The Phase 2 repository directly, rather than through the module's index.
// `getCitizenRecord` would be the public route, but it returns the whole record
// with every field and its policy — an expensive read of data this module does
// not use. What is needed here is the record's OWNERSHIP and its type, which is
// exactly what this query answers, scoped by owner in its predicate.
import { findRecordForCitizen } from '../citizen-records/citizen-record.repository.js';
import {
  assertFieldEditable,
  FIELD_EDITABILITY,
  RECORD_TYPE_VALUES,
  type FieldChangeDecision,
  type RecordType,
} from '../field-policies/index.js';
import {
  deleteChangeRequest,
  deleteChangeRequestFields,
  findChangeRequestForCitizen,
  insertChangeRequest,
  insertChangeRequestFields,
  listFieldsForChangeRequest,
  listSourceFieldsForRecord,
  touchChangeRequest,
  updateProposedValue,
} from './change-request.repository.js';
import {
  CHANGE_REQUEST_STATUS,
  type ChangeRequestDetail,
  type ChangeRequestField,
  type ChangeRequestFieldRow,
  type ChangeRequestRow,
  type ChangeRequestStatus,
  type FieldPolicySnapshot,
  type ResolvedChangeField,
} from './change-request.types.js';
import type { CreateChangeDraftInput, UpdateChangeDraftInput } from './change-request.schema.js';

/**
 * The change draft — where a citizen's request is assembled
 * (Change & Correction Service, Phase 4).
 *
 * This module answers one question: "what does this citizen want corrected, and
 * may they ask for it?" It never answers "what does the government hold?" —
 * that is Phase 2's registry, and this module only READS it, once, to record
 * what the source said at the moment the request was made.
 *
 * THE RULE THIS PHASE EXISTS TO KEEP.
 *
 *   citizen_record_fields.field_value   is the source's value. UNCHANGED here.
 *   change_request_fields.old_value     is a snapshot of that value.
 *   change_request_fields.proposed_value is what the citizen ASKED for.
 *
 * A proposal is not a value (arch §13). Nothing below writes to
 * `citizen_records` or `citizen_record_fields`; the repository has no statement
 * that could, and this service has no branch that would want one.
 *
 * WHAT THE CLIENT IS TRUSTED FOR.
 *
 * Two things: which record, and what each chosen field should say. Everything
 * else is derived here — the record type from the record's own row, the old
 * value from the database, the editability from the live policy table. The
 * frontend's field selection is a CONVENIENCE, never an authority: every key it
 * sends is re-verified to belong to the record, to have an active policy, and
 * to be something a citizen may ask to change (task §6).
 */

/**
 * The role and onboarding gate, re-asserted in the service.
 *
 * The router already applies `requireAuth` + `requireRole(CITIZEN)`. This is
 * the second assertion the codebase's convention requires (arch §1.1: "role
 * gating happens twice"), so a route mounted elsewhere by a later phase still
 * fails closed rather than inheriting whatever gate that mount happens to
 * carry.
 *
 * Onboarding is required for the same reason the record registry requires it: a
 * draft is a citizen-scoped resource, and a citizen who has not completed
 * onboarding is not yet somebody SetuX can attribute a correction request to.
 *
 * An officer reaching here is a `ForbiddenError` rather than a 404, and the
 * distinction is deliberate: concealment protects the EXISTENCE of another
 * citizen's resources, and refusing an officer at the door reveals nothing
 * about any particular draft — they are told the endpoint is not theirs, not
 * whether a request exists.
 */
const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();

  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'CHANGE_REQUEST_ONBOARDING_REQUIRED',
      message: 'Complete citizen onboarding before requesting a correction.',
    });
  }
};

const SUPPORTED_RECORD_TYPES = new Set<string>(RECORD_TYPE_VALUES);

const isSupportedRecordType = (value: string): value is RecordType =>
  SUPPORTED_RECORD_TYPES.has(value);

/**
 * A field the citizen asked for that is not on the record they named.
 *
 * A 404 on the FIELD rather than a 400, because that is what it is: the field
 * does not exist within the resource addressed. It is also the answer that
 * conceals — a key belonging to another citizen's record and a key belonging to
 * nothing produce the same response, so the endpoint cannot be used to discover
 * which fields exist elsewhere.
 */
const fieldNotOnRecord = (): AppError =>
  new AppError({
    statusCode: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'One of the selected details is not part of this record.',
  });

/**
 * Refuses a proposal identical to what the source already holds.
 *
 * A request to change a name to the name it already has is not a correction; it
 * would enter a department's queue and consume a review to conclude that
 * nothing needed doing. Refused with a message the citizen can act on, and
 * refused again by the table's CHECK constraint so the invariant holds of the
 * data rather than only of this code path.
 */
const proposalUnchanged = (): AppError =>
  new AppError({
    statusCode: 400,
    code: 'CHANGE_REQUEST_VALUE_UNCHANGED',
    message: 'Enter a value that is different from the current one.',
    exposeDetails: false,
  });

/**
 * Whether the proposal actually differs from what the source holds.
 *
 * Compared as JSON rather than with `===`, because both sides are JSONB and the
 * source value may be a number where the citizen typed a string. Two scalars
 * that serialize identically ARE the same value; `"9000000001"` and
 * `9000000001` are not, and refusing the second as "unchanged" would be wrong —
 * a citizen correcting a type is making a real request.
 *
 * The schema admits only scalars, so this is a scalar comparison and cannot be
 * fooled by key ordering.
 */
const isUnchanged = (oldValue: unknown, proposedValue: unknown): boolean =>
  JSON.stringify(oldValue ?? null) === JSON.stringify(proposedValue ?? null);

/**
 * The policy snapshot, built from a LIVE decision.
 *
 * Never from anything the client sent, and never from a previously stored
 * snapshot: this is taken at the moment the field enters the draft, from the
 * policy table as it reads then.
 *
 * The `IMMUTABLE` case cannot occur — `assertFieldEditable` throws before
 * returning one — and is refused again here rather than cast away. A decision
 * that arrives immutable means the policy engine's contract changed underneath
 * this module, and that should be a loud failure rather than a snapshot
 * claiming an editability the table forbids.
 */
const toPolicySnapshot = (decision: FieldChangeDecision): FieldPolicySnapshot => {
  if (decision.editability === FIELD_EDITABILITY.IMMUTABLE) {
    throw new AppError({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'This correction could not be prepared.',
    });
  }

  return {
    editability: decision.editability,
    requiresEvidence: decision.requiresEvidence,
    requiresReview: decision.requiresReview,
    authority: decision.authority,
  };
};

/**
 * Reads a stored snapshot back into its typed shape.
 *
 * Defensive rather than trusting: the column is JSONB and its CHECK constrains
 * only the editability, so a row written by some future path with a missing
 * boolean should degrade to the SAFER answer — requirements assumed present —
 * rather than tell the citizen their change needs nothing.
 */
const toStoredPolicySnapshot = (value: unknown): FieldPolicySnapshot => {
  const snapshot = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;

  const editability =
    snapshot.editability === FIELD_EDITABILITY.EDITABLE
      ? FIELD_EDITABILITY.EDITABLE
      : FIELD_EDITABILITY.CONDITIONALLY_EDITABLE;

  return {
    editability,
    requiresEvidence: snapshot.requiresEvidence !== false,
    requiresReview: snapshot.requiresReview !== false,
    authority: typeof snapshot.authority === 'string' ? snapshot.authority : null,
  };
};

const toField = (row: ChangeRequestFieldRow): ChangeRequestField => ({
  fieldKey: row.field_key,
  oldValue: row.old_value,
  proposedValue: row.proposed_value,
  policy: toStoredPolicySnapshot(row.policy_snapshot),
  reason: row.reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Validates a stored status rather than casting it.
 *
 * The column's CHECK admits only DRAFT today. A row carrying anything else
 * would mean a later phase's transition wrote a state this phase cannot
 * interpret, and returning it as though this code understood it would be worse
 * than failing.
 */
const toStatus = (value: string): ChangeRequestStatus => {
  if (value !== CHANGE_REQUEST_STATUS.DRAFT) {
    throw new AppError({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'This correction request could not be read.',
    });
  }

  return CHANGE_REQUEST_STATUS.DRAFT;
};

const toDetail = (
  row: ChangeRequestRow,
  recordType: RecordType,
  fields: readonly ChangeRequestFieldRow[],
): ChangeRequestDetail => ({
  id: row.id,
  requestNumber: row.request_number,
  status: toStatus(row.status),
  sourceRecordId: row.source_record_id,
  sourceRecordType: recordType,
  fields: fields.map(toField),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Loads the source record the citizen named, scoped to them.
 *
 * The 404 here is doing two jobs: a record id that does not exist and a record
 * id belonging to another citizen are indistinguishable, because the repository
 * scopes by owner and this branch cannot tell them apart either.
 */
const loadOwnedRecord = async (
  citizenId: string,
  recordId: string,
): Promise<{ readonly id: string; readonly recordType: RecordType }> => {
  const record = await findRecordForCitizen({ recordId, citizenId });
  if (!record) throw new NotFoundError('Record');

  if (!isSupportedRecordType(record.record_type)) {
    throw new AppError({
      statusCode: 500,
      code: 'CITIZEN_RECORD_UNSUPPORTED_TYPE',
      message: 'This record could not be read.',
    });
  }

  return { id: record.id, recordType: record.record_type };
};

/**
 * Turns what the client asked for into what the server is willing to store.
 *
 * This function IS the phase's authorization boundary, and every step of it is
 * a refusal the client cannot influence:
 *
 *   1. The source fields are read from the database, scoped to the record AND
 *      its owner. A key that is not on that record comes back missing.
 *   2. Every requested key must have come back. A missing one is a 404 on the
 *      field, never a silent omission.
 *   3. The live policy is re-read for every field through `assertFieldEditable`,
 *      which throws for IMMUTABLE and for a field with no active policy. The
 *      client's opinion of the editability is not consulted, because the client
 *      has no way to send one.
 *   4. `old_value` is taken from the row read in step 1 — never from the
 *      request.
 *   5. The proposal must differ from that snapshot.
 *
 * Policies are resolved with `Promise.all` rather than sequentially: each is an
 * independent indexed lookup, and awaiting them in a loop would make a
 * five-field draft five serial round trips (data-n-plus-one.md).
 */
const resolveFields = async (params: {
  readonly citizenId: string;
  readonly recordId: string;
  readonly recordType: RecordType;
  readonly requested: readonly {
    readonly fieldKey: string;
    readonly proposedValue: unknown;
    // `undefined` is admitted alongside `null` because the schema makes `reason`
    // optional: an omitted key arrives as `undefined`, an explicitly cleared one
    // as `null`, and both mean the same thing here.
    readonly reason?: string | null | undefined;
  }[];
  /**
   * Snapshots to PRESERVE, keyed by field key.
   *
   * Supplied on a revision, where a field already in the draft keeps the
   * `old_value` it was created with. A snapshot that moved with each edit would
   * not be a snapshot (task §14).
   */
  readonly existingSnapshots?: ReadonlyMap<string, { readonly oldValue: unknown }>;
}): Promise<readonly ResolvedChangeField[]> => {
  const fieldKeys = params.requested.map((field) => field.fieldKey);

  const sourceRows = await listSourceFieldsForRecord({
    recordId: params.recordId,
    citizenId: params.citizenId,
    fieldKeys,
  });

  const sourceByKey = new Map(sourceRows.map((row) => [row.field_key, row] as const));

  const decisions = await Promise.all(
    params.requested.map(async (field) => {
      // Refuse before the policy read when the field is not on the record: a
      // key that is not the citizen's has no business reaching a lookup, and
      // `assertFieldEditable` would answer a question about a field they cannot
      // see.
      if (!sourceByKey.has(field.fieldKey)) throw fieldNotOnRecord();

      // Throws FieldNotEditableError for IMMUTABLE and FieldPolicyNotFoundError
      // when no active policy governs the field. Both are refusals, and neither
      // is influenced by anything in the request body.
      return assertFieldEditable(params.recordType, field.fieldKey);
    }),
  );

  return params.requested.map((field, index) => {
    const source = sourceByKey.get(field.fieldKey);
    if (!source) throw fieldNotOnRecord();

    const decision = decisions[index];
    if (!decision) throw fieldNotOnRecord();

    // The ORIGINAL snapshot wins wherever one exists. On a create there are
    // none and this is the source's current value; on a revision, a field that
    // was already in the draft keeps what the source said when the citizen
    // first asked.
    const oldValue = params.existingSnapshots?.get(field.fieldKey)?.oldValue ?? source.field_value;

    if (isUnchanged(oldValue, field.proposedValue)) throw proposalUnchanged();

    return {
      fieldKey: field.fieldKey,
      citizenRecordFieldId: source.id,
      oldValue,
      proposedValue: field.proposedValue,
      policySnapshot: toPolicySnapshot(decision),
      // `undefined` (key omitted) and `null` (explicitly cleared) both mean
      // "no reason given", and both must store NULL rather than the string
      // "undefined" a looser coercion would produce.
      reason: field.reason ?? null,
    };
  });
};

/**
 * Creates a draft correction request.
 *
 * Every draft is a NEW request. A citizen who starts a second correction on the
 * same record gets a second draft rather than an overwrite of the first,
 * because the two are different requests about different fields and merging
 * them would silently discard whichever they were not looking at. A replayed
 * create — the double-clicked button — therefore produces two drafts, each
 * complete and each independently viewable; that is the honest outcome for a
 * non-idempotent create, and neither of them touches the source record.
 *
 * The write is two statements, so the failure between them is handled: a parent
 * whose fields could not be written is deleted rather than left as an empty
 * draft the citizen would have to make sense of.
 */
export const createChangeDraft = async (
  auth: AuthContext,
  input: CreateChangeDraftInput,
): Promise<ChangeRequestDetail> => {
  assertCompletedCitizen(auth);

  const record = await loadOwnedRecord(auth.userId, input.sourceRecordId);

  const fields = await resolveFields({
    citizenId: auth.userId,
    recordId: record.id,
    recordType: record.recordType,
    requested: input.fields,
  });

  const request = await insertChangeRequest({
    citizenId: auth.userId,
    sourceRecordId: record.id,
  });

  try {
    await insertChangeRequestFields({ changeRequestId: request.id, fields });
  } catch (error) {
    // Compensate, then report the ORIGINAL failure. The cleanup is best-effort
    // by design: if the delete also fails, the citizen still needs to be told
    // what actually went wrong, and an error about the cleanup would describe
    // the second problem while hiding the first.
    //
    // `try/catch` rather than `.catch()` on the returned promise, so a
    // compensation path that throws synchronously is swallowed too — the whole
    // point of this block is that nothing in it can replace `error`.
    try {
      await deleteChangeRequest({ changeRequestId: request.id, citizenId: auth.userId });
    } catch {
      // Intentionally ignored. The draft is left orphaned but empty, and the
      // caller learns the real failure.
    }

    throw error;
  }

  const stored = await listFieldsForChangeRequest({
    changeRequestId: request.id,
    citizenId: auth.userId,
  });

  return toDetail(request, record.recordType, stored);
};

/**
 * One draft, with its requested corrections.
 *
 * This is what makes a draft resumable: the citizen closes the tab, returns to
 * the URL, and the server — not React state — supplies what they had entered
 * (task §12).
 *
 * The record type is read through the draft's own `source_record_id`, scoped to
 * the caller. That re-derivation is not redundant with the draft's ownership
 * check: it is what guarantees the type used to interpret the fields is the
 * type of a record this citizen actually owns.
 */
export const getChangeDraft = async (
  auth: AuthContext,
  changeRequestId: string,
): Promise<ChangeRequestDetail> => {
  assertCompletedCitizen(auth);

  const request = await findChangeRequestForCitizen({
    changeRequestId,
    citizenId: auth.userId,
  });
  if (!request) throw new NotFoundError('Change request');

  const [record, fields] = await Promise.all([
    loadOwnedRecord(auth.userId, request.source_record_id),
    listFieldsForChangeRequest({ changeRequestId: request.id, citizenId: auth.userId }),
  ]);

  return toDetail(request, record.recordType, fields);
};

/**
 * Revises the proposed values of a draft.
 *
 * The body replaces the field SET: what the form submits is what the draft
 * holds afterwards. Three things follow, and the second is the one that
 * matters most.
 *
 * 1. A field the citizen removed is deleted from the draft. From the DRAFT —
 *    `citizen_record_fields` is not touched, and the repository has no
 *    statement that could touch it.
 *
 * 2. **A field that stays keeps its ORIGINAL `old_value`.** The snapshot is
 *    re-supplied to `resolveFields` from what is already stored, so a revision
 *    cannot refresh it — not from the request body, and not from the source
 *    either. If the source has moved since the draft was taken, the draft
 *    continues to show what the citizen was actually looking at, and the
 *    `citizen_record_field_id` on the row remains available for the conflict
 *    check a later phase will build on it (task §14). Silently adopting a new
 *    source value here would rewrite the citizen's request to be about
 *    something they never saw.
 *
 * 3. A field newly added is resolved exactly as a create resolves it: source
 *    lookup, live policy, fresh snapshot.
 *
 * Every field in the payload is re-authorized, including ones already in the
 * draft. A field that was CONDITIONALLY_EDITABLE when the draft was created and
 * has since become IMMUTABLE is refused now — being in a draft already confers
 * no standing permission.
 */
export const updateChangeDraft = async (
  auth: AuthContext,
  changeRequestId: string,
  input: UpdateChangeDraftInput,
): Promise<ChangeRequestDetail> => {
  assertCompletedCitizen(auth);

  const request = await findChangeRequestForCitizen({
    changeRequestId,
    citizenId: auth.userId,
  });
  if (!request) throw new NotFoundError('Change request');

  const record = await loadOwnedRecord(auth.userId, request.source_record_id);

  const existing = await listFieldsForChangeRequest({
    changeRequestId: request.id,
    citizenId: auth.userId,
  });

  const existingSnapshots = new Map(
    existing.map((row) => [row.field_key, { oldValue: row.old_value }] as const),
  );

  const resolved = await resolveFields({
    citizenId: auth.userId,
    recordId: record.id,
    recordType: record.recordType,
    requested: input.fields,
    existingSnapshots,
  });

  const submittedKeys = new Set(resolved.map((field) => field.fieldKey));
  const existingKeys = new Set(existing.map((row) => row.field_key));

  const removed = [...existingKeys].filter((key) => !submittedKeys.has(key));
  const added = resolved.filter((field) => !existingKeys.has(field.fieldKey));
  const kept = resolved.filter((field) => existingKeys.has(field.fieldKey));

  // Removals first, so a field being dropped and a field being added in the
  // same revision cannot collide on the one-correction-per-field constraint.
  await deleteChangeRequestFields({ changeRequestId: request.id, fieldKeys: removed });
  await insertChangeRequestFields({ changeRequestId: request.id, fields: added });

  // Only `proposed_value` moves for a field that stays. `old_value` and
  // `policy_snapshot` are not in the update payload at all.
  await Promise.all(
    kept.map((field) =>
      updateProposedValue({
        changeRequestId: request.id,
        citizenId: auth.userId,
        fieldKey: field.fieldKey,
        proposedValue: field.proposedValue,
        reason: field.reason,
      }),
    ),
  );

  await touchChangeRequest({ changeRequestId: request.id, citizenId: auth.userId });

  const [updatedRequest, fields] = await Promise.all([
    findChangeRequestForCitizen({ changeRequestId: request.id, citizenId: auth.userId }),
    listFieldsForChangeRequest({ changeRequestId: request.id, citizenId: auth.userId }),
  ]);

  if (!updatedRequest) throw new NotFoundError('Change request');

  return toDetail(updatedRequest, record.recordType, fields);
};
