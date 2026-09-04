/**
 * Catalogue payloads, mirroring `backend/src/modules/services/service.types.ts`.
 *
 * The API speaks of *services*, because the persistence model and
 * `docs/API/api-specification.md` §15 do. The citizen interface speaks of
 * *scholarships*, because that is what the reference screens call them. This
 * feature is where the two vocabularies meet: the wire types below keep the
 * API's nouns, and the screens render the product's (Phase 5 §15).
 */

/** What a requirement is, and therefore which glyph and wording it gets. */
export type RequirementType = 'IDENTITY' | 'DOCUMENT' | 'RECORD' | 'DECLARATION';

/** A catalogue entry as the list endpoint returns it. */
export interface ScholarshipSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly department: string;
}

/** One thing a scholarship requires, and the system that supplies it. */
export interface ScholarshipRequirement {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: RequirementType;
  /** The simulated government system, or `null` when the citizen supplies it. */
  readonly source: string | null;
  readonly required: boolean;
  readonly displayOrder: number;
}

/** A catalogue entry with its requirements, from `GET /services/:id`. */
export interface ScholarshipDetail extends ScholarshipSummary {
  readonly requirements: readonly ScholarshipRequirement[];
}

/** One page of the catalogue. */
export interface ScholarshipListPayload {
  readonly items: readonly ScholarshipSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Filter options from `GET /services/departments`. */
export interface ScholarshipDepartmentsPayload {
  readonly departments: readonly string[];
}

/**
 * The query the catalogue screen sends.
 *
 * `search` and `department` are optional because an absent parameter is how the
 * API expresses "no filter" — sending an empty string would be a filter that
 * matches nothing.
 */
export interface ScholarshipListQuery {
  readonly search?: string;
  readonly department?: string;
  readonly page?: number;
}
