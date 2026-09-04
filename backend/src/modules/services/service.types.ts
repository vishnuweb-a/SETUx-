/**
 * Domain contracts for the service catalogue (Phase 5).
 *
 * The persistence model is generic — `services` describes *any* government
 * service SetuX federates, and the MVP seeds scholarships into it
 * (database-schema.md §16). The citizen interface calls these Scholarships;
 * the API keeps the schema's vocabulary, because `docs/API/api-specification.md`
 * §15 defines the endpoints as `/services`. The translation happens in the
 * frontend feature, not here (Phase 5 §15).
 */

/** Catalogue visibility. Only ACTIVE services are offered to citizens. */
export const SERVICE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

/**
 * What a service requires, and which system supplies it
 * (database-schema.md §17).
 */
export const REQUIREMENT_TYPES = {
  IDENTITY: 'IDENTITY',
  DOCUMENT: 'DOCUMENT',
  RECORD: 'RECORD',
  DECLARATION: 'DECLARATION',
} as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[keyof typeof REQUIREMENT_TYPES];

/**
 * A catalogue entry as the list endpoint returns it
 * (api-specification.md §15.1).
 *
 * Deliberately narrower than the table: `status` is not carried because the
 * list only ever contains ACTIVE rows, and repeating that on every item would
 * invite a client to believe it could ask for the others.
 */
export interface ServiceSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly department: string;
}

/** One requirement of a service (api-specification.md §15.3). */
export interface ServiceRequirement {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: RequirementType;
  /** The simulated government system that supplies it, when one does. */
  readonly source: string | null;
  readonly required: boolean;
  readonly displayOrder: number;
}

/**
 * A catalogue entry with its requirements (api-specification.md §15.2).
 *
 * The detail screen renders requirements from this payload rather than from a
 * second round trip, which is what `GET /services/:id` "returns service details
 * and requirements" means in the specification.
 */
export interface ServiceDetail extends ServiceSummary {
  readonly requirements: readonly ServiceRequirement[];
}

/** Envelope of the list endpoint, carrying pagination metadata. */
export interface ServiceListPayload {
  readonly items: readonly ServiceSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}
