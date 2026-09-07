export { fieldPoliciesRouter } from './field-policy.routes.js';
/**
 * Exposed for the Phase 2 citizen record registry, which enriches each stored
 * field value with the policy governing it. Reading the policy through this
 * module — rather than querying `field_policies` again from another
 * repository — is what keeps ONE answer to "may this field be changed?".
 */
export { listActiveFieldPolicies } from './field-policy.repository.js';
export {
  assertFieldEditable,
  getFieldPolicy,
  getRecordTypeFieldPolicies,
  resolveFieldChangeDecision,
} from './field-policy.service.js';
export {
  FIELD_EDITABILITY,
  RECORD_TYPES,
  RECORD_TYPE_VALUES,
  type FieldChangeDecision,
  type FieldEditability,
  type FieldPolicy,
  type RecordType,
  type RecordTypeFieldPolicies,
} from './field-policy.types.js';
