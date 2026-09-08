import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { DependencyRuleRow } from './change-impact.types.js';

/**
 * Persistence for dependency & impact detection
 * (Change & Correction Service, Phase 5).
 *
 * TWO RULES GOVERN THIS FILE, and the second is the phase's whole security
 * posture.
 *
 * **1. THIS FILE NEVER WRITES.**
 *
 * Not disabled, not guarded — absent. There is no insert, update, upsert or
 * delete anywhere below, against any table. A reader can verify it by searching
 * this file for those words. Impact detection is analysis: it reads
 * configuration, reads the citizen's own registry, and returns a computed
 * answer. Nothing it concludes is persisted, no change request is touched, no
 * status moves and no government record is modified (task §15, §24).
 *
 * **2. The rule table is read WITHOUT a citizen, the registry read ONLY with
 * one.**
 *
 * Those are two different kinds of data and they get two different treatments.
 * `change_dependency_rules` is configuration keyed on record TYPES — it holds
 * no citizen data, so there is no citizen to scope it by, exactly as
 * `field_policies` is read. `citizen_records` holds a specific person's
 * records, so `citizen_id` is part of the PREDICATE, never a check applied
 * afterwards — the same rule the Phase 2 and Phase 4 repositories state, for
 * the same two reasons: an ownership check written in the caller lives only in
 * the callers that remember it, and a row fetched and then rejected has already
 * been fetched.
 *
 * These queries run through the service-role client and so bypass RLS. RLS
 * remains meaningful: it governs the browser's own Supabase client, which is a
 * separate path with a separate identity.
 */

/**
 * Columns the engine needs from a rule, plus the department it names.
 *
 * `id`, `active`, `created_at` and `updated_at` are deliberately absent:
 * `active` because every row returned is active by construction, and the rest
 * because they describe the configuration row rather than the rule.
 *
 * The department is selected as an embedded row rather than a UUID, so the
 * response names it and no internal routing key leaves the server.
 */
const RULE_COLUMNS =
  'source_record_type, source_field_key, target_record_type, target_field_key, ' +
  'impact_level, reason, departments ( code, name )';

/**
 * PostgREST returns an embedded to-one relationship as an object but types it
 * as possibly an array. Normalized here rather than at each use, matching the
 * Phase 2 repository.
 */
const firstEmbedded = <T>(value: T | readonly T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return (value as T | null | undefined) ?? null;
};

interface RawRuleRow {
  readonly source_record_type: string;
  readonly source_field_key: string;
  readonly target_record_type: string;
  readonly target_field_key: string;
  readonly impact_level: DependencyRuleRow['impact_level'];
  readonly reason: string;
  readonly departments:
    | { readonly code: string; readonly name: string }
    | readonly { readonly code: string; readonly name: string }[]
    | null;
}

/**
 * Every ACTIVE rule whose source is one of the given fields of ONE record type.
 *
 * ONE query for the whole field set rather than one per field. A draft may
 * correct several fields, and asking the database once per field would be N
 * round trips for a single logical read (data-n-plus-one.md) — the same
 * reasoning `listSourceFieldsForRecord` records.
 *
 * `active` is in the predicate rather than filtered afterwards, so a retired
 * rule is not merely ignored by this code, it is never returned to it. The
 * partial index `change_dependency_rules_active_source_idx` is exactly this
 * query's access path.
 *
 * Ordered deterministically by `(target_record_type, target_field_key)`, which
 * is what arch §12 asks for: the same draft evaluated twice produces the same
 * list in the same order, so the impact preview does not reshuffle between
 * loads. The service's merge is order-independent regardless — this makes the
 * INPUT stable too, which is what makes a failing test reproducible.
 *
 * An empty `fieldKeys` short-circuits rather than issuing `in ()`, which
 * PostgREST would send as a query matching nothing but still costs a round
 * trip.
 */
export const listActiveDependencyRules = async (params: {
  readonly sourceRecordType: string;
  readonly sourceFieldKeys: readonly string[];
}): Promise<readonly DependencyRuleRow[]> => {
  if (params.sourceFieldKeys.length === 0) return [];

  const { data, error } = await getDatabaseClient()
    .from('change_dependency_rules')
    .select(RULE_COLUMNS)
    .eq('source_record_type', params.sourceRecordType)
    .in('source_field_key', [...params.sourceFieldKeys])
    .eq('active', true)
    .order('target_record_type', { ascending: true })
    .order('target_field_key', { ascending: true });

  if (error) {
    throw toAppError(
      error,
      'change_dependency_rules.listActiveDependencyRules',
      'Dependency rule',
    );
  }

  return ((data ?? []) as unknown as readonly RawRuleRow[]).map((row) => ({
    source_record_type: row.source_record_type,
    source_field_key: row.source_field_key,
    target_record_type: row.target_record_type,
    target_field_key: row.target_field_key,
    impact_level: row.impact_level,
    reason: row.reason,
    // Genuinely null for the bank, which is a provider rather than a department
    // (arch §20.6). The absence is data, not a failed join.
    responsible_department: firstEmbedded(row.departments),
  }));
};

/**
 * Which of the given record TYPES this citizen actually holds.
 *
 * This is the query that turns a rule into an honest answer. A rule says
 * "INCOME_RECORD is affected"; only the citizen's own registry can say whether
 * they have one. Without this, the preview would offer a bank target to a
 * citizen who has never linked a bank account (arch §12: "a rule only produces
 * a target when the citizen actually has a matching row").
 *
 * `citizen_id` is the leading predicate, and it is what makes this read
 * incapable of seeing another citizen's records at all — not "denied", not
 * "filtered", but outside what the query selects. The composite index
 * `citizen_records_citizen_id_created_at_idx` leads on the same column.
 *
 * ONE query for every candidate type, for the same N+1 reason as above.
 *
 * A citizen may in principle hold two records of one type from two different
 * sources — `citizen_records`' unique key is `(citizen_id, record_type,
 * data_source_id)`, so that is permitted by design. Ordering by `created_at`
 * ascending and letting the FIRST win makes the choice deterministic (the
 * oldest, most established record) rather than dependent on whatever order the
 * database happened to return. Phase 5 shows one card per record TYPE, so it
 * needs exactly one; the phase that creates targets can revisit whether both
 * deserve one.
 */
export const listCitizenRecordsOfTypes = async (params: {
  readonly citizenId: string;
  readonly recordTypes: readonly string[];
}): Promise<readonly { readonly id: string; readonly record_type: string }[]> => {
  if (params.recordTypes.length === 0) return [];

  const { data, error } = await getDatabaseClient()
    .from('citizen_records')
    .select('id, record_type')
    .eq('citizen_id', params.citizenId)
    .in('record_type', [...params.recordTypes])
    .order('created_at', { ascending: true });

  if (error) {
    throw toAppError(error, 'citizen_records.listCitizenRecordsOfTypes', 'Citizen record');
  }

  return (data ?? []).map((row) => ({ id: row.id, record_type: row.record_type }));
};
