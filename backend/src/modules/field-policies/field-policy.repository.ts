import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { FieldPolicy, RecordType } from './field-policy.types.js';

/**
 * Persistence for the editable field policy
 * (Change & Correction Service, Phase 1).
 *
 * One rule governs both queries in this file, and it is the same rule the
 * catalogue repository states: `active` is part of the PREDICATE, never a
 * filter applied to rows already read. A retired policy is not "hidden" from
 * the caller — it is never selected, so no amount of query manipulation from
 * the client can surface it, and the enforcement helper cannot accidentally
 * decide a field is editable on the strength of a policy that was withdrawn.
 *
 * These queries run through the service-role client and so bypass RLS. RLS
 * remains meaningful: it governs the browser's own Supabase client, which is a
 * separate path with a separate identity (security-design.md §19). The `active`
 * predicate here is the backend's equivalent of the `using (active)` in that
 * policy, and `field_policies` stays `select`-only for `authenticated` —
 * nothing in this phase writes.
 */

/**
 * Columns the API exposes.
 *
 * `id`, `active`, `created_at` and `updated_at` are deliberately absent:
 * `active` because every selected row is active by construction, and repeating
 * it on each field would invite a client to believe it could ask for the
 * others.
 */
const POLICY_COLUMNS =
  'field_key, editability, requires_evidence, requires_review, authority, dependency_group';

/** Maps the row's snake_case columns onto the domain contract. */
const toFieldPolicy = (row: {
  readonly field_key: string;
  readonly editability: FieldPolicy['editability'];
  readonly requires_evidence: boolean;
  readonly requires_review: boolean;
  readonly authority: string | null;
  readonly dependency_group: string | null;
}): FieldPolicy => ({
  fieldKey: row.field_key,
  editability: row.editability,
  requiresEvidence: row.requires_evidence,
  requiresReview: row.requires_review,
  authority: row.authority,
  dependencyGroup: row.dependency_group,
});

/**
 * Every ACTIVE policy for one record type, in a stable order.
 *
 * Ordered by `field_key` so the response is deterministic: the same record type
 * always renders its fields in the same order, which is what stops a change
 * form from reshuffling itself between loads.
 */
export const listActiveFieldPolicies = async (
  recordType: RecordType,
): Promise<readonly FieldPolicy[]> => {
  const { data, error } = await getDatabaseClient()
    .from('field_policies')
    .select(POLICY_COLUMNS)
    .eq('record_type', recordType)
    .eq('active', true)
    .order('field_key', { ascending: true });

  if (error) {
    throw toAppError(error, 'field_policies.listActiveFieldPolicies', 'Field policy');
  }

  return (data ?? []).map(toFieldPolicy);
};

/**
 * One ACTIVE policy by `(record_type, field_key)`, or `null`.
 *
 * `null` covers both "no policy governs that field" and "the policy that did
 * has been retired". The caller turns either into the same refusal, because
 * they mean the same thing to a citizen: SetuX has no authority to accept a
 * correction to this field, and inventing a default would be exactly the
 * hallucinated permission this table exists to prevent.
 *
 * `maybeSingle` is safe here rather than merely convenient: the unique
 * constraint on `(record_type, field_key)` means at most one row can match, so
 * a second row is impossible rather than unlikely.
 */
export const findActiveFieldPolicy = async (
  recordType: RecordType,
  fieldKey: string,
): Promise<FieldPolicy | null> => {
  const { data, error } = await getDatabaseClient()
    .from('field_policies')
    .select(POLICY_COLUMNS)
    .eq('record_type', recordType)
    .eq('field_key', fieldKey)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'field_policies.findActiveFieldPolicy', 'Field policy');
  }

  return data === null ? null : toFieldPolicy(data);
};
