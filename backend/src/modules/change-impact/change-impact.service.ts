import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { AuthContext } from '../auth/auth.types.js';
import { USER_ROLES } from '../auth/auth.types.js';
// The Phase 4 repository directly, rather than through the module's index.
// `getChangeDraft` would be the public route, but it re-reads the record and
// rebuilds the whole presentational draft — work this module does not need,
// since it derives its own view of the same rows. What is needed here is the
// draft's OWNERSHIP and its fields, which is exactly what these two queries
// answer, each scoped by owner in its predicate.
import {
  findChangeRequestForCitizen,
  listFieldsForChangeRequest,
} from '../change-requests/change-request.repository.js';
import { findRecordForCitizen } from '../citizen-records/citizen-record.repository.js';
import { RECORD_TYPE_VALUES, type RecordType } from '../field-policies/index.js';
import {
  listActiveDependencyRules,
  listCitizenRecordsOfTypes,
} from './change-impact.repository.js';
import {
  strongerImpactLevel,
  IMPACT_LEVEL_RANK,
  type ChangeImpact,
  type ChangeImpactAnalysis,
  type DependencyRuleRow,
  type ImpactChangedField,
  type ImpactReason,
} from './change-impact.types.js';

/**
 * The dependency & impact detection engine
 * (Change & Correction Service, Phase 5).
 *
 * This module answers: "given what this citizen has asked to correct, which of
 * THEIR OTHER records would then disagree with the source?"
 *
 * THE THREE PROPERTIES THE PHASE PROMISES, and where each is kept:
 *
 *   READ-ONLY      Nothing here writes. The repository has no statement that
 *                  could, and this service has no branch that would want one.
 *                  A draft's status, its fields, its old values and every
 *                  `citizen_record_fields` row are exactly as they were before
 *                  the request (task §15).
 *
 *   DETERMINISTIC  The answer is a pure function of three inputs — the stored
 *                  draft, the active rules, and the citizen's record inventory.
 *                  The merge is commutative (`strongerImpactLevel`), the sort
 *                  is total, and the repository orders its reads. The same
 *                  draft evaluated twice produces the identical response.
 *
 *   SINGLE-HOP     Rules are expanded EXACTLY ONE step. `identityHolderName`
 *                  reaching `INCOME_RECORD.incomeCertificateHolder` does not
 *                  then expand that field's own rules. Depth is bounded at one
 *                  by construction rather than by a visited-set guard, so a
 *                  cycle in the rule data cannot cause unbounded work (arch
 *                  §12, feature.md Phase 5 acceptance). The database's
 *                  no-self-dependency CHECK closes the degenerate case; this
 *                  loop's absence closes every other one.
 *
 * WHAT THE CLIENT IS TRUSTED FOR: a change request id. Nothing else. The source
 * record type, the changed fields, the rules, the levels and the reasons are
 * all read server-side, and there is no parameter through which any of them
 * could be supplied (task §7).
 */

/**
 * The role and onboarding gate, re-asserted in the service.
 *
 * Identical to the Phase 4 draft service's gate, and deliberately a duplicate
 * rather than a shared import from that module: this is the second assertion
 * the codebase's convention requires (arch §1.1, "role gating happens twice"),
 * and a route mounted elsewhere by a later phase must fail closed rather than
 * inherit whatever gate that mount happens to carry.
 *
 * An officer reaching here is a `ForbiddenError` rather than a 404, and the
 * distinction is the same one Phase 4 draws: concealment protects the EXISTENCE
 * of a particular citizen's draft, and refusing an officer at the door reveals
 * nothing about any particular one. Officers have no Phase 5 access at all —
 * their authority arises from a change TARGET routed to their department, and
 * no target exists yet (task §11).
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
 * Loads the draft's source record, scoped to the caller.
 *
 * The record type is re-derived here through the draft's own
 * `source_record_id` rather than carried on the request, for the reason arch
 * §4.4 gives for not storing it twice: a duplicated type is a second thing that
 * can be wrong. Scoping by owner is not redundant with the draft's own
 * ownership check either — it is what guarantees the type used to select rules
 * is the type of a record this citizen actually holds.
 */
const loadOwnedRecordType = async (
  citizenId: string,
  recordId: string,
): Promise<RecordType> => {
  const record = await findRecordForCitizen({ recordId, citizenId });
  if (!record) throw new NotFoundError('Record');

  if (!isSupportedRecordType(record.record_type)) {
    throw new AppError({
      statusCode: 500,
      code: 'CITIZEN_RECORD_UNSUPPORTED_TYPE',
      message: 'This record could not be read.',
    });
  }

  return record.record_type;
};

/**
 * A rule naming a target type outside the supported set is DROPPED, not thrown.
 *
 * The asymmetry with `loadOwnedRecordType`, which throws, is deliberate. An
 * unsupported SOURCE type means the citizen's own record is unreadable — a
 * configuration fault about the resource being addressed, and failing loudly is
 * right. An unsupported TARGET type means one rule out of several names
 * something this build does not know how to present; refusing the whole request
 * would deny the citizen the four correct impacts because of a fifth bad rule.
 * Dropping it degrades to a smaller true answer rather than to no answer.
 *
 * The database's CHECK and the migration's seed verification make this
 * unreachable in practice. It is handled because "unreachable" is a property of
 * today's seed, not of the code.
 */
const supportedTargets = (
  rules: readonly DependencyRuleRow[],
): readonly (DependencyRuleRow & { readonly target: RecordType })[] =>
  rules.flatMap((rule) =>
    isSupportedRecordType(rule.target_record_type)
      ? [{ ...rule, target: rule.target_record_type }]
      : [],
  );

/**
 * Orders the reasons behind one merged impact.
 *
 * Strongest rule first, then by field key. Both halves matter: the strongest
 * reason is the one that justifies the badge the citizen sees, so it belongs at
 * the top, and the field-key tiebreak makes the order total — two rules of
 * equal strength always appear the same way round, on every request.
 *
 * A stable sort would preserve input order for ties, but relying on that would
 * make the output depend on the database's ordering. Being explicit costs one
 * comparison and removes the dependency (task §13).
 */
const byStrengthThenField = (a: ImpactReason, b: ImpactReason): number => {
  const rank = IMPACT_LEVEL_RANK[b.impactLevel] - IMPACT_LEVEL_RANK[a.impactLevel];
  return rank !== 0 ? rank : a.fieldKey.localeCompare(b.fieldKey);
};

/**
 * Orders the impact list itself.
 *
 * Strongest first, so what most needs the citizen's attention is at the top of
 * the page, then by record type for a total order. Availability is deliberately
 * NOT part of the sort: an unavailable REQUIRED target is still the most
 * important thing on the screen, and sinking it below an available OPTIONAL one
 * would bury the fact that a required correction cannot currently be made.
 */
const byImpactThenType = (a: ChangeImpact, b: ChangeImpact): number => {
  const rank = IMPACT_LEVEL_RANK[b.impactLevel] - IMPACT_LEVEL_RANK[a.impactLevel];
  return rank !== 0 ? rank : a.recordType.localeCompare(b.recordType);
};

/**
 * Collapses every rule that reached one target into a single impact.
 *
 * THE DEDUPLICATION OF THE PHASE (task §9), and it is structural rather than a
 * filtering pass: the accumulator is keyed on the target record TYPE, so a
 * second rule reaching the same target updates the entry that is already there.
 * There is no arrangement of rules that can produce two cards for one record,
 * because there is no code path that inserts a second one.
 *
 * When rules disagree on strength, the STRONGEST wins — `OPTIONAL` merged with
 * `REQUIRED` is `REQUIRED`, never the other way round, and never the last one
 * read. Under-stating a consequence is the failure mode that matters here: a
 * citizen told a correction is optional when one rule calls it required has been
 * given the wrong basis for a decision.
 *
 * Every rule's reason is kept, because a merged target genuinely has more than
 * one cause and collapsing them would drop a true statement (see
 * `ImpactReason`).
 */
const mergeRules = (
  rules: readonly (DependencyRuleRow & { readonly target: RecordType })[],
): ReadonlyMap<RecordType, {
  readonly impactLevel: DependencyRuleRow['impact_level'];
  readonly reasons: readonly ImpactReason[];
  readonly responsibleDepartment: DependencyRuleRow['responsible_department'];
}> => {
  const merged = new Map<
    RecordType,
    {
      impactLevel: DependencyRuleRow['impact_level'];
      reasons: ImpactReason[];
      responsibleDepartment: DependencyRuleRow['responsible_department'];
    }
  >();

  for (const rule of rules) {
    const reason: ImpactReason = {
      fieldKey: rule.source_field_key,
      impactLevel: rule.impact_level,
      reason: rule.reason,
    };

    const existing = merged.get(rule.target);

    if (!existing) {
      merged.set(rule.target, {
        impactLevel: rule.impact_level,
        reasons: [reason],
        responsibleDepartment: rule.responsible_department,
      });
      continue;
    }

    existing.impactLevel = strongerImpactLevel(existing.impactLevel, rule.impact_level);
    existing.reasons.push(reason);

    // The department is a property of the TARGET record type, so every rule
    // reaching one target names the same department and this is a no-op. It is
    // written as "first non-null wins" rather than assumed, so that a rule set
    // which disagreed would produce a department rather than a null — the
    // citizen seeing no responsible authority is worse than seeing the one the
    // first rule named.
    existing.responsibleDepartment ??= rule.responsible_department;
  }

  return merged;
};

/**
 * Impact analysis for one draft.
 *
 * THE ORDER OF OPERATIONS IS THE AUTHORIZATION MODEL, and each step refuses
 * something the client cannot influence:
 *
 *   1. Role and onboarding, re-asserted here rather than trusted from the
 *      router.
 *   2. The draft is loaded BY ID AND OWNER. Another citizen's draft matches
 *      nothing and becomes the same 404 as an id that never existed — the
 *      caller cannot tell which (task §11).
 *   3. The source record is loaded by id AND owner too, and its type is
 *      re-derived from it.
 *   4. Rules are read from configuration, for that type and the fields the
 *      DRAFT actually holds — never a field list from the request.
 *   5. Target availability is resolved from the CALLER'S OWN registry. This is
 *      what makes cross-citizen leakage impossible: the only record ids that
 *      can appear in the response came from a query predicated on the caller's
 *      id.
 *
 * A draft with no fields cannot be produced by the Phase 4 API, which refuses
 * an empty field list on create and on revise. It is handled anyway — the
 * repository short-circuits an empty key set, the rule list is empty, and the
 * response carries an empty `impacts` array. Returning an honest empty analysis
 * is better than a 500 from code that assumed its data was non-empty (task
 * §18).
 */
export const getChangeImpact = async (
  auth: AuthContext,
  changeRequestId: string,
): Promise<ChangeImpactAnalysis> => {
  assertCompletedCitizen(auth);

  const request = await findChangeRequestForCitizen({
    changeRequestId,
    citizenId: auth.userId,
  });
  if (!request) throw new NotFoundError('Change request');

  const [recordType, fields] = await Promise.all([
    loadOwnedRecordType(auth.userId, request.source_record_id),
    listFieldsForChangeRequest({ changeRequestId: request.id, citizenId: auth.userId }),
  ]);

  const changedFields: readonly ImpactChangedField[] = fields.map((field) => ({
    fieldKey: field.field_key,
    // The stored SNAPSHOT, not the source's value today. The preview describes
    // the same before/after pair the citizen saw on the form.
    oldValue: field.old_value,
    proposedValue: field.proposed_value,
  }));

  const rules = await listActiveDependencyRules({
    sourceRecordType: recordType,
    sourceFieldKeys: changedFields.map((field) => field.fieldKey),
  });

  const merged = mergeRules(supportedTargets(rules));

  // One registry read for every candidate type at once, rather than one per
  // target (data-n-plus-one.md).
  const owned = await listCitizenRecordsOfTypes({
    citizenId: auth.userId,
    recordTypes: [...merged.keys()],
  });

  // First wins, matching the repository's `created_at asc` ordering: where a
  // citizen holds two records of one type from two sources, the oldest is the
  // one shown.
  const ownedByType = new Map<string, string>();
  for (const record of owned) {
    if (!ownedByType.has(record.record_type)) ownedByType.set(record.record_type, record.id);
  }

  const impacts: readonly ChangeImpact[] = [...merged.entries()]
    .map(([recordTypeKey, entry]) => {
      const recordId = ownedByType.get(recordTypeKey) ?? null;

      return {
        recordType: recordTypeKey,
        recordId,
        // Derived from the registry read, never from the rule. A rule cannot
        // make a record exist.
        available: recordId !== null,
        impactLevel: entry.impactLevel,
        reasons: [...entry.reasons].sort(byStrengthThenField),
        responsibleDepartment: entry.responsibleDepartment,
      };
    })
    .sort(byImpactThenType);

  return {
    changeRequestId: request.id,
    sourceRecord: { recordId: request.source_record_id, recordType },
    changedFields,
    impacts,
  };
};
