import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  FIELD_EDITABILITY,
  listActiveFieldPolicies,
  RECORD_TYPE_VALUES,
  type FieldPolicy,
  type RecordType,
} from '../field-policies/index.js';
import {
  findRecordForCitizen,
  listFieldsForCitizenRecord,
  listRecordsByCitizen,
} from './citizen-record.repository.js';
import {
  RECORD_STATUS,
  type CitizenRecordDetail,
  type CitizenRecordField,
  type CitizenRecordFieldRow,
  type CitizenRecordListPayload,
  type CitizenRecordRow,
  type CitizenRecordSummary,
  type RecordStatus,
} from './citizen-record.types.js';

/**
 * The citizen record registry — the read side
 * (Change & Correction Service, Phase 2).
 *
 * This module answers two questions and no others:
 *
 *   "which government records does SetuX hold for the citizen making this
 *    request?" and "what does one of them currently say?"
 *
 * It never answers them for anybody else. `auth.userId` comes from a verified
 * access token and is the ONLY source of the citizen identity used below —
 * there is no parameter, no query string and no body field through which a
 * caller could name a different citizen, so a forged `citizenId` has nowhere to
 * land (task §19, §28).
 *
 * READ ONLY. Nothing here creates, updates, submits or deletes a record or a
 * field value. A citizen cannot change what a government source holds by asking
 * SetuX nicely; the correction workflow that eventually can is Phase 3 and
 * later (arch §25).
 */

/**
 * The role and onboarding gate, re-asserted in the service.
 *
 * The router already applies `requireAuth` + `requireRole(CITIZEN)`. This is
 * the second assertion the repository's own convention requires (arch §1.1:
 * "role gating happens twice"), so a route mounted somewhere else by a later
 * phase still fails closed rather than inheriting whatever gate that mount
 * happens to carry.
 *
 * Onboarding is required for the same reason `applications` requires it: a
 * record registry is a citizen-scoped resource, and a citizen who has not
 * completed onboarding is not yet a citizen SetuX can attribute records to.
 */
const assertCompletedCitizen = (auth: AuthContext): void => {
  if (auth.role !== USER_ROLES.CITIZEN) throw new ForbiddenError();

  if (auth.onboardingStatus !== 'COMPLETED') {
    throw new AppError({
      statusCode: 403,
      code: 'CITIZEN_RECORD_ONBOARDING_REQUIRED',
      message: 'Complete citizen onboarding before viewing your government records.',
    });
  }
};

/** Every record type the registry knows, for policy lookup. */
const SUPPORTED_RECORD_TYPES = new Set<string>(RECORD_TYPE_VALUES);

const isSupportedRecordType = (value: string): value is RecordType =>
  SUPPORTED_RECORD_TYPES.has(value);

const toRecordStatus = (value: string): RecordStatus =>
  value === RECORD_STATUS.STALE || value === RECORD_STATUS.UNAVAILABLE
    ? value
    : RECORD_STATUS.ACTIVE;

/**
 * Maps a stored row onto the API shape.
 *
 * The record type is validated rather than cast. A row whose `record_type` is
 * outside the supported set is a configuration fault — the database CHECK
 * permits any screaming-snake-case token, so a future seed could introduce one
 * the API has no vocabulary for. Failing here makes that a loud 500 rather than
 * a response claiming a record type the client's own enum does not contain.
 */
const toSummary = (row: CitizenRecordRow): CitizenRecordSummary => {
  if (!isSupportedRecordType(row.record_type)) {
    throw new AppError({
      statusCode: 500,
      code: 'CITIZEN_RECORD_UNSUPPORTED_TYPE',
      message: 'This record could not be read.',
    });
  }

  return {
    id: row.id,
    recordType: row.record_type,
    source: row.source ?? { code: 'UNKNOWN', name: 'Unknown source' },
    // Null is the correct answer for the bank, which has no department
    // (arch §20.6). It is passed through rather than defaulted.
    authority: row.authority,
    sourceRecordRef: row.source_record_ref,
    status: toRecordStatus(row.status),
    sourceVersion: row.source_version,
    lastSyncedAt: row.last_synced_at,
    isSimulated: row.is_simulated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Joins a stored value to the Phase 1 policy governing it.
 *
 * The policy is READ from Phase 1's repository, never re-derived and never
 * stored on the field row. That is what keeps one answer to "may this field be
 * changed?": a policy edit takes effect everywhere at once, and there is no
 * copy on a record row that could disagree with the table (arch §11, task §20).
 *
 * A field with no active policy gets `editability: null` and
 * `changeable: false`. An ungoverned field must never become correctable by
 * having been forgotten — the safety of the feature cannot depend on the
 * completeness of a seed.
 */
const toField = (
  row: CitizenRecordFieldRow,
  policiesByKey: ReadonlyMap<string, FieldPolicy>,
): CitizenRecordField => {
  const policy = policiesByKey.get(row.field_key) ?? null;

  return {
    fieldKey: row.field_key,
    value: row.field_value,
    retrievedAt: row.retrieved_at,
    editability: policy?.editability ?? null,
    changeable: policy !== null && policy.editability !== FIELD_EDITABILITY.IMMUTABLE,
    requiresEvidence: policy?.requiresEvidence ?? false,
    requiresReview: policy?.requiresReview ?? false,
    policyAuthority: policy?.authority ?? null,
  };
};

/**
 * The citizen's whole record inventory.
 *
 * Unpaginated, deliberately: a citizen has one record per record type per
 * source — five in the demo, and a small number for anyone. Paging a list that
 * short would add a cursor the UI must thread through for no benefit, and the
 * Change Details entry screen needs all of it at once to render the record
 * chooser (feature.md Phase 2).
 *
 * An empty list is a legitimate answer, not an error: a citizen SetuX has not
 * provisioned records for genuinely has none, and the UI has an empty state for
 * exactly that.
 */
export const listCitizenRecords = async (
  auth: AuthContext,
): Promise<CitizenRecordListPayload> => {
  assertCompletedCitizen(auth);

  const rows = await listRecordsByCitizen(auth.userId);
  const items = rows.map(toSummary);

  return { items, total: items.length };
};

/**
 * One record, with its current values and the policy governing each of them.
 *
 * The record is fetched scoped to the caller, so a record belonging to another
 * citizen is not "forbidden" — it is not found, and is indistinguishable from
 * an id that never existed (task §19, §21).
 */
export const getCitizenRecord = async (
  auth: AuthContext,
  recordId: string,
): Promise<CitizenRecordDetail> => {
  assertCompletedCitizen(auth);

  const row = await findRecordForCitizen({ recordId, citizenId: auth.userId });
  if (!row) throw new NotFoundError('Record');

  const summary = toSummary(row);

  // One policy read for the whole record type rather than one per field: the
  // per-field endpoint would be N round trips to answer a question the record
  // type already answers once (data-n-plus-one.md).
  const [fieldRows, policies] = await Promise.all([
    listFieldsForCitizenRecord({ recordId, citizenId: auth.userId }),
    listActiveFieldPolicies(summary.recordType),
  ]);

  const policiesByKey = new Map(policies.map((policy) => [policy.fieldKey, policy] as const));

  return { ...summary, fields: fieldRows.map((field) => toField(field, policiesByKey)) };
};
