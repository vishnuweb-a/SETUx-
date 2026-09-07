import {
  FieldNotEditableError,
  FieldPolicyNotFoundError,
} from '../../shared/errors/index.js';
import {
  findActiveFieldPolicy,
  listActiveFieldPolicies,
} from './field-policy.repository.js';
import {
  FIELD_EDITABILITY,
  type FieldChangeDecision,
  type FieldPolicy,
  type RecordType,
  type RecordTypeFieldPolicies,
} from './field-policy.types.js';

/**
 * Editable field policy — the authoritative decision
 * (Change & Correction Service, Phase 1).
 *
 * This module is where "may this field be corrected?" is answered, and it is
 * the ONLY place that answer is produced. Later phases do not re-derive it,
 * do not cache it and above all do not accept it from a request body: the
 * transition that eventually writes a correction calls {@link assertFieldEditable}
 * and takes what it returns (arch §11).
 *
 * Read-only by design. Nothing here writes, and in particular nothing here
 * creates, updates or submits a change request — that is a later phase and a
 * different aggregate entirely (arch §25). Phase 1 establishes the decision; it
 * does not act on it.
 */

/**
 * Every active policy for one record type.
 *
 * The list is never empty for a supported record type, because every supported
 * type is seeded. It is nonetheless returned as-is rather than raising when
 * empty: a record type whose policies were all retired is a configuration state
 * the API should describe honestly, not an error.
 */
export const getRecordTypeFieldPolicies = async (
  recordType: RecordType,
): Promise<RecordTypeFieldPolicies> => ({
  recordType,
  fields: await listActiveFieldPolicies(recordType),
});

/**
 * The active policy for one field, or a 404.
 *
 * A missing policy is a refusal, never a permissive default. An ungoverned
 * field must not become correctable by having been forgotten — that would make
 * the safety of the whole feature depend on the completeness of a seed.
 */
export const getFieldPolicy = async (
  recordType: RecordType,
  fieldKey: string,
): Promise<FieldPolicy> => {
  const policy = await findActiveFieldPolicy(recordType, fieldKey);

  if (!policy) {
    throw new FieldPolicyNotFoundError();
  }

  return policy;
};

/**
 * Asserts that a correction to this field may be requested, and returns what
 * requesting it demands.
 *
 * This is the server-side enforcement point later phases call before accepting
 * a proposed value (arch §11: "the policy is re-read inside the draft-update
 * and submit transition functions"). Its contract is deliberately narrow:
 *
 *   IMMUTABLE               throws {@link FieldNotEditableError}. No role, no
 *                           consent and no evidence changes this answer.
 *   CONDITIONALLY_EDITABLE  returns, carrying `requiresEvidence` /
 *                           `requiresReview` as the requirements the CALLER
 *                           must then satisfy. Phase 1 states them; the phase
 *                           that owns submission enforces them, because there
 *                           is no submission here to enforce them against.
 *   EDITABLE                returns, demanding nothing further of the caller.
 *   no policy               throws {@link FieldPolicyNotFoundError}.
 *
 * Note what it does NOT do: it does not consult the request, the session, the
 * citizen or any value. It answers a question about a field, which is why the
 * frontend cannot influence it — there is no input through which to try.
 */
export const assertFieldEditable = async (
  recordType: RecordType,
  fieldKey: string,
): Promise<FieldChangeDecision> => {
  const policy = await getFieldPolicy(recordType, fieldKey);

  if (policy.editability === FIELD_EDITABILITY.IMMUTABLE) {
    throw new FieldNotEditableError(
      'This field cannot be changed through SetuX.',
      { authority: policy.authority },
    );
  }

  return toDecision(recordType, policy);
};

/**
 * The non-throwing form, for callers that must describe a field rather than
 * refuse it — an impact preview listing which of several fields are correctable
 * cannot raise on the first immutable one it meets.
 *
 * Returns `null` only when no policy governs the field, which stays a refusal
 * for every caller: a field SetuX has no policy for is never presented as
 * changeable.
 */
export const resolveFieldChangeDecision = async (
  recordType: RecordType,
  fieldKey: string,
): Promise<FieldChangeDecision | null> => {
  const policy = await findActiveFieldPolicy(recordType, fieldKey);

  return policy === null ? null : toDecision(recordType, policy);
};

/**
 * Derives the decision from the policy row.
 *
 * `changeable` is computed from the editability rather than stored, so the two
 * cannot contradict each other — there is no row that could say "IMMUTABLE, and
 * changeable".
 */
const toDecision = (recordType: RecordType, policy: FieldPolicy): FieldChangeDecision => ({
  recordType,
  fieldKey: policy.fieldKey,
  editability: policy.editability,
  changeable: policy.editability !== FIELD_EDITABILITY.IMMUTABLE,
  requiresEvidence: policy.requiresEvidence,
  requiresReview: policy.requiresReview,
  authority: policy.authority,
});
