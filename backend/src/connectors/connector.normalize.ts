/**
 * The normalization step every simulated provider shares.
 *
 * Each provider expresses its records in its own vocabulary — `acct_no_masked`,
 * `exam_board`, `annual_income_inr`. SetuX stores its own. The mapping between
 * them is per-provider data; the act of applying it is not, so it lives here
 * and each connector supplies only its record and its field map
 * (government-connector.md §14, §15).
 */
import type { NormalizedConnectorResult, NormalizedField } from './connector.types.js';

/** One provider record, as the provider itself would express it. */
export interface SimulatedRecord {
  readonly documentType: string;
  readonly issuer: string;
  readonly issuedOn: string;
  /** Provider-native field names, deliberately unlike SetuX's own. */
  readonly attributes: Readonly<Record<string, string>>;
}

/** Provider field name → the key and label SetuX stores. */
export type ProviderFieldMap = Readonly<
  Record<string, { readonly fieldKey: string; readonly label: string }>
>;

/**
 * Provider response → SetuX domain model.
 *
 * An attribute with no mapping is DROPPED rather than passed through under its
 * provider name. Letting unmapped fields through is how a provider's vocabulary
 * escapes into the database, and it would also mean a provider could introduce
 * a field SetuX never agreed to store (Phase 9 §11).
 */
export const normalizeRecord = (params: {
  readonly record: SimulatedRecord;
  readonly fieldMap: ProviderFieldMap;
  readonly providerReference: string;
}): NormalizedConnectorResult => {
  const fields: NormalizedField[] = Object.entries(params.record.attributes).flatMap(
    ([attribute, value]) => {
      const mapping = params.fieldMap[attribute];
      return mapping ? [{ fieldKey: mapping.fieldKey, label: mapping.label, value }] : [];
    },
  );

  return {
    documentType: params.record.documentType,
    providerReference: params.providerReference,
    issuer: params.record.issuer,
    issuedOn: params.record.issuedOn,
    fields,
  };
};
